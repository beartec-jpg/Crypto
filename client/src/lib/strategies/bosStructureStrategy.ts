/**
 * BOS (Break of Structure) Trend Following Strategy
 * Trades in direction of market structure breaks (continuation moves)
 */

import { calculateSwings } from '@/lib/smc/pivots';
import { calculatePositionSize } from '@/lib/trading/positionCalculator';
import { 
  calculateBOSandCHoCH, 
  getCurrentATR, 
  findNextSwingLevels,
  getClosestVWAP 
} from './helpers';
import type { CandleData } from '@/types/chart.types';
import type { TradeSignal, BotTPSLConfig, TPType } from '@/types/trading.types';

export interface BOSStrategyParams {
  enabled: boolean;
  swingLength: number;
  directionFilter: 'both' | 'bull' | 'bear';
  trendFilter: 'none' | 'ema' | 'structure' | 'both';
  tpslConfig: BotTPSLConfig;
  slSwingLength: number;
  tpSwingLength: number;
  accountSize: number;
  riskPercent: number;
  bias?: 'bullish' | 'bearish' | null;
  structureTrend?: 'uptrend' | 'downtrend' | 'ranging' | null;
  vwapValues?: number[];
}

export function generateBOSTrendSignal(
  data: CandleData[],
  params: BOSStrategyParams
): TradeSignal | null {
  if (!params.enabled || data.length < 50) return null;
  
  const { bos } = calculateBOSandCHoCH(data, params.swingLength);
  
  const trendBOS = bos.filter(b => !b.isLiquidityGrab);
  if (trendBOS.length === 0) return null;
  
  const lastBOS = trendBOS[trendBOS.length - 1];
  const currentCandle = data[data.length - 1];
  const isLong = lastBOS.type === 'bullish';
  
  if (params.directionFilter !== 'both') {
    if (params.directionFilter === 'bull' && !isLong) return null;
    if (params.directionFilter === 'bear' && isLong) return null;
  }
  
  if (params.trendFilter !== 'none') {
    if (params.trendFilter === 'ema' && params.bias === null) return null;
    if (params.trendFilter === 'structure' && (params.structureTrend === null || params.structureTrend === 'ranging')) return null;
    if (params.trendFilter === 'both') {
      const emaBullish = params.bias === 'bullish';
      const structureBullish = params.structureTrend === 'uptrend';
      const emaBearish = params.bias === 'bearish';
      const structureBearish = params.structureTrend === 'downtrend';
      if (!((emaBullish && structureBullish) || (emaBearish && structureBearish))) return null;
    }
  }
  
  const entry = currentCandle.close;
  const atr = getCurrentATR(data);
  
  const slConfig = params.tpslConfig.sl;
  let stopLoss: number;
  if (slConfig.type === 'atr') {
    stopLoss = isLong ? entry - (atr * (slConfig.atrMultiplier || 1.5)) : entry + (atr * (slConfig.atrMultiplier || 1.5));
  } else if (slConfig.type === 'structure') {
    const swings = calculateSwings(data, params.slSwingLength);
    if (isLong) {
      const lows = swings.filter(s => s.type === 'low' && s.value < entry).sort((a, b) => b.value - a.value);
      stopLoss = lows.length > 0 ? lows[0].value : entry * 0.99;
    } else {
      const highs = swings.filter(s => s.type === 'high' && s.value > entry).sort((a, b) => a.value - b.value);
      stopLoss = highs.length > 0 ? highs[0].value : entry * 1.01;
    }
  } else {
    const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
    stopLoss = isLong ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
  }
  
  const riskAmount = Math.abs(entry - stopLoss);
  
  const { tp1: tp1Config, tp2: tp2Config, tp3: tp3Config } = params.tpslConfig;
  const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, isLong ? 'long' : 'short', params.tpSwingLength);
  
  let tp1: number, tp2: number, tp3: number;
  let tp1Type: TPType;
  let tp2Type: TPType;
  let tp3Type: TPType;
  
  tp1Type = tp1Config.type;
  if (tp1Config.type === 'atr') {
    tp1 = isLong ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
  } else if (tp1Config.type === 'structure') {
    tp1 = structureTP2;
  } else if (tp1Config.type === 'fixed_rr') {
    tp1 = isLong ? entry + (riskAmount * (tp1Config.fixedRR || 1.5)) : entry - (riskAmount * (tp1Config.fixedRR || 1.5));
  } else if (tp1Config.type === 'vwap') {
    tp1 = getClosestVWAP(entry, params.vwapValues || []) || structureTP2;
  } else {
    tp1 = isLong ? entry + (structureTP2 - entry) * (tp1Config.projectionMultiplier || 2.0) : entry - (entry - structureTP2) * (tp1Config.projectionMultiplier || 2.0);
  }
  
  tp2Type = tp2Config?.type || 'structure';
  if (tp2Config?.type === 'atr') {
    tp2 = isLong ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
  } else if (tp2Config?.type === 'fixed_rr') {
    tp2 = isLong ? entry + (riskAmount * (tp2Config.fixedRR || 2.5)) : entry - (riskAmount * (tp2Config.fixedRR || 2.5));
  } else {
    tp2 = structureTP3;
  }
  
  tp3Type = tp3Config?.type || 'projection';
  if (tp3Config?.type === 'projection') {
    tp3 = isLong ? entry + (structureTP2 - entry) * (tp3Config.projectionMultiplier || 3.0) : entry - (entry - structureTP2) * (tp3Config.projectionMultiplier || 3.0);
  } else {
    tp3 = isLong ? entry + (riskAmount * 4.0) : entry - (riskAmount * 4.0);
  }
  
  console.log(`🎯 BOS Trend TP calculation:`, {
    type: isLong ? 'LONG' : 'SHORT',
    entry: entry.toFixed(4),
    stopLoss: stopLoss.toFixed(4),
    tp1: tp1.toFixed(4),
    tp1Type,
    rr1: (Math.abs(tp1 - entry) / riskAmount).toFixed(2),
    numTPs: params.tpslConfig.numTPs,
    swingLength: params.swingLength
  });
  
  return {
    id: `bos_trend_${lastBOS.breakTime}`,
    time: lastBOS.breakTime,
    type: isLong ? 'LONG' : 'SHORT',
    strategy: 'bos_trend',
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    tp1Type,
    tp2Type,
    tp3Type,
    riskReward1: Math.abs(tp1 - entry) / riskAmount,
    riskReward2: Math.abs(tp2 - entry) / riskAmount,
    riskReward3: Math.abs(tp3 - entry) / riskAmount,
    quantity: calculatePositionSize(params.accountSize, params.riskPercent, entry, stopLoss),
    reason: `BOS ${isLong ? 'Bullish' : 'Bearish'} at ${lastBOS.swingPrice.toFixed(4)}`,
    active: true,
  };
}

/**
 * Liquidity Grab Strategy
 * Identifies and trades liquidity sweeps (stop hunts) followed by reversals
 */

import { calculatePositionSize } from '@/lib/trading/positionCalculator';
import { 
  calculateBOSandCHoCH, 
  getCurrentATR, 
  findStopLossLevel, 
  findNextSwingLevels,
  getClosestVWAP 
} from './helpers';
import type { CandleData } from '@/types/chart.types';
import type { TradeSignal, BotTPSLConfig, TPType } from '@/types/trading.types';

export interface LiquidityGrabParams {
  enabled: boolean;
  swingLength: number;
  trendFilter: 'none' | 'ema' | 'structure' | 'both';
  directionFilter: 'both' | 'bull' | 'bear';
  tpslConfig: BotTPSLConfig;
  tpSwingLength: number;
  accountSize: number;
  riskPercent: number;
  bias?: 'bullish' | 'bearish' | null;
  structureTrend?: 'uptrend' | 'downtrend' | 'ranging' | null;
  vwapValues?: number[];
}

export function generateLiquidityGrabSignal(
  data: CandleData[],
  params: LiquidityGrabParams,
  bypassToggle = false
): TradeSignal | null {
  if ((!params.enabled && !bypassToggle) || data.length < 50) return null;
  
  const { bos, choch } = calculateBOSandCHoCH(data, params.swingLength);
  const allEvents = [...bos, ...choch].filter(e => e.isLiquidityGrab);
  
  if (allEvents.length === 0) return null;
  
  const lastEvent = allEvents[allEvents.length - 1];
  const currentCandle = data[data.length - 1];
  const atr = getCurrentATR(data);
  
  const isLong = lastEvent.sweptLevel === 'low';
  
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
  
  const sweepCandleIdx = data.findIndex(c => c.time === lastEvent.breakTime);
  const sweepCandle = sweepCandleIdx >= 0 ? data[sweepCandleIdx] : data[data.length - 1];
  const entry = sweepCandle.close;
  
  const slConfig = params.tpslConfig.sl;
  let stopLoss: number;
  if (slConfig.type === 'atr') {
    stopLoss = isLong ? entry - (atr * (slConfig.atrMultiplier || 1.5)) : entry + (atr * (slConfig.atrMultiplier || 1.5));
  } else if (slConfig.type === 'structure') {
    if (slConfig.swingLength) {
      stopLoss = findStopLossLevel(data, entry, isLong ? 'long' : 'short', slConfig.swingLength);
    } else {
      const slBuffer = 0.0005;
      stopLoss = isLong 
        ? lastEvent.swingPrice * (1 - slBuffer)
        : lastEvent.swingPrice * (1 + slBuffer);
    }
  } else {
    const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
    stopLoss = isLong ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
  }
  
  const riskAmount = Math.abs(entry - stopLoss);
  
  const { tp1: tp1Config, tp2: tp2Config, tp3: tp3Config } = params.tpslConfig;
  
  const structureSwingLength = tp1Config.type === 'structure' && tp1Config.swingLength 
    ? tp1Config.swingLength 
    : params.tpSwingLength;
  
  const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, isLong ? 'long' : 'short', structureSwingLength);
  
  let tp1: number, tp2: number, tp3: number;
  let tp1Type: TPType;
  let tp2Type: TPType;
  let tp3Type: TPType;
  
  tp1Type = tp1Config.type;
  if (tp1Config.type === 'ema') {
    tp1 = isLong ? Infinity : -Infinity;
  } else if (tp1Config.type === 'atr') {
    tp1 = isLong ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
  } else if (tp1Config.type === 'structure') {
    tp1 = structureTP2;
  } else if (tp1Config.type === 'fixed_rr') {
    tp1 = isLong ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
  } else if (tp1Config.type === 'vwap') {
    tp1 = getClosestVWAP(entry, params.vwapValues || []) || structureTP2;
  } else if (tp1Config.type === 'trailing') {
    tp1 = isLong ? entry * 100 : entry * 0.01;
  } else {
    tp1 = isLong ? entry + (structureTP2 - entry) * (tp1Config.projectionMultiplier || 2.0) : entry - (entry - structureTP2) * (tp1Config.projectionMultiplier || 2.0);
  }
  
  tp2Type = tp2Config?.type || 'structure';
  if (tp2Config?.type === 'atr') {
    tp2 = isLong ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
  } else if (tp2Config?.type === 'fixed_rr') {
    tp2 = isLong ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
  } else if (tp2Config?.type === 'trailing') {
    tp2 = isLong ? entry * 100 : entry * 0.01;
  } else {
    tp2 = structureTP3;
  }
  
  tp3Type = tp3Config?.type || 'projection';
  if (tp3Config?.type === 'projection') {
    tp3 = isLong ? entry + (structureTP2 - entry) * (tp3Config.projectionMultiplier || 3.0) : entry - (entry - structureTP2) * (tp3Config.projectionMultiplier || 3.0);
  } else if (tp3Config?.type === 'trailing') {
    tp3 = isLong ? entry * 100 : entry * 0.01;
  } else {
    tp3 = isLong ? entry + (riskAmount * 5.0) : entry - (riskAmount * 5.0);
  }
  
  console.log(`🎯 Liquidity Grab TP calculation:`, {
    type: isLong ? 'LONG' : 'SHORT',
    entry: entry?.toFixed(4) || 'N/A',
    stopLoss: stopLoss?.toFixed(4) || 'N/A',
    tp1: tp1?.toFixed(4) || 'N/A',
    tp1Type,
    rr1: (entry && tp1 && riskAmount) ? (Math.abs(tp1 - entry) / riskAmount).toFixed(2) : 'N/A',
    numTPs: params.tpslConfig.numTPs
  });
  
  return {
    id: `liq_grab_${lastEvent.breakTime}`,
    time: lastEvent.breakTime,
    type: isLong ? 'LONG' : 'SHORT',
    strategy: 'liquidity_grab',
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
    reason: `Liquidity sweep at ${lastEvent.swingPrice?.toFixed(4) || 'unknown'}`,
    active: true,
    trailingActive: tp1Config.type === 'trailing' ? false : undefined,
  };
}

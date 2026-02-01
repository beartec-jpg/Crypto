/**
 * R/S Flip Strategy (Resistance/Support Flip)
 * Trades retests of broken trendlines after they flip from resistance to support or vice versa
 */

import { detectTrendlines } from '@/lib/smc/trendlineDetector';
import { calculatePositionSize } from '@/lib/trading/positionCalculator';
import { getCurrentATR, findNextSwingLevels } from './helpers';
import type { CandleData } from '@/types/chart.types';
import type { TradeSignal, BotTPSLConfig, TPType } from '@/types/trading.types';

export interface RSFlipParams {
  enabled: boolean;
  retestCandles: number;
  directionFilter: 'both' | 'bull' | 'bear';
  trendFilter: 'none' | 'ema' | 'structure' | 'both';
  trendlineMinTouches: number;
  trendlineTolerance: number;
  trendlinePivotLength: number;
  tpslConfig: BotTPSLConfig;
  tpSwingLength: number;
  accountSize: number;
  riskPercent: number;
  bias?: 'bullish' | 'bearish' | null;
  structureTrend?: 'uptrend' | 'downtrend' | 'ranging' | null;
}

export function generateRSFlipSignal(
  data: CandleData[],
  params: RSFlipParams
): TradeSignal | null {
  if (!params.enabled || data.length < 100) return null;
  
  const trendlines = detectTrendlines(
    data, 
    params.trendlineMinTouches, 
    params.trendlineTolerance, 
    params.trendlinePivotLength
  );
  if (trendlines.length === 0) return null;
  
  const currentCandle = data[data.length - 1];
  const currentPrice = currentCandle.close;
  
  for (const line of trendlines) {
    const currentLinePrice = line.slope * (data.length - 1) + line.intercept;
    
    const tolerance = currentLinePrice * 0.005;
    const nearLine = Math.abs(currentPrice - currentLinePrice) < tolerance;
    
    if (!nearLine) continue;
    
    let breakoutIdx = -1;
    for (let i = data.length - 2; i >= Math.max(0, data.length - params.retestCandles - 1); i--) {
      const prevCandle = data[i - 1];
      const candle = data[i];
      const linePrice = line.slope * i + line.intercept;
      const prevLinePrice = line.slope * (i - 1) + line.intercept;
      
      if (line.type === 'resistance') {
        if (prevCandle.close < prevLinePrice && candle.close > linePrice) {
          breakoutIdx = i;
          break;
        }
      } else {
        if (prevCandle.close > prevLinePrice && candle.close < linePrice) {
          breakoutIdx = i;
          break;
        }
      }
    }
    
    if (breakoutIdx === -1) continue;
    
    const candlesSinceBreakout = data.length - 1 - breakoutIdx;
    if (candlesSinceBreakout < 2 || candlesSinceBreakout > params.retestCandles) continue;
    
    const isLong = line.type === 'resistance';
    
    let hasRejection = false;
    for (let i = Math.max(0, data.length - 3); i < data.length; i++) {
      const c = data[i];
      const linePrice = line.slope * i + line.intercept;
      
      if (isLong) {
        const wickedBelow = c.low < linePrice && c.close > linePrice;
        if (wickedBelow) hasRejection = true;
      } else {
        const wickedAbove = c.high > linePrice && c.close < linePrice;
        if (wickedAbove) hasRejection = true;
      }
    }
    
    if (!hasRejection) continue;
    
    if (params.directionFilter !== 'both') {
      if (params.directionFilter === 'bull' && !isLong) continue;
      if (params.directionFilter === 'bear' && isLong) continue;
    }
    
    if (params.trendFilter !== 'none') {
      if (params.trendFilter === 'ema' && params.bias === null) continue;
      if (params.trendFilter === 'structure' && (params.structureTrend === null || params.structureTrend === 'ranging')) continue;
      if (params.trendFilter === 'both') {
        const emaBullish = params.bias === 'bullish';
        const structureBullish = params.structureTrend === 'uptrend';
        const emaBearish = params.bias === 'bearish';
        const structureBearish = params.structureTrend === 'downtrend';
        if (!((emaBullish && structureBullish) || (emaBearish && structureBearish))) continue;
      }
    }
    
    const entry = currentCandle.close;
    const atr = getCurrentATR(data);
    
    const slConfig = params.tpslConfig.sl;
    let stopLoss: number;
    if (slConfig.type === 'atr') {
      stopLoss = isLong ? entry - (atr * (slConfig.atrMultiplier || 1.5)) : entry + (atr * (slConfig.atrMultiplier || 1.5));
    } else if (slConfig.type === 'structure') {
      stopLoss = isLong ? currentLinePrice - atr : currentLinePrice + atr;
    } else {
      const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
      stopLoss = isLong ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
    }
    
    const riskAmount = Math.abs(entry - stopLoss);
    const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, isLong ? 'long' : 'short', params.tpSwingLength);
    
    const { tp1: tp1Config, tp2: tp2Config } = params.tpslConfig;
    
    let tp1: number, tp2: number, tp3: number;
    let tp1Type: TPType = tp1Config.type;
    let tp2Type: TPType = tp2Config?.type || 'structure';
    
    if (tp1Config.type === 'atr') {
      tp1 = isLong ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
    } else if (tp1Config.type === 'structure') {
      tp1 = structureTP2;
    } else if (tp1Config.type === 'fixed_rr') {
      tp1 = isLong ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
    } else {
      tp1 = structureTP2;
    }
    
    if (tp2Config?.type === 'atr') {
      tp2 = isLong ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
    } else if (tp2Config?.type === 'fixed_rr') {
      tp2 = isLong ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
    } else {
      tp2 = structureTP3;
    }
    
    tp3 = isLong ? entry + (structureTP2 - entry) * 1.5 : entry - (entry - structureTP2) * 1.5;
    
    return {
      id: `rs_flip_${currentCandle.time}_${isLong ? 'long' : 'short'}`,
      time: currentCandle.time,
      type: isLong ? 'LONG' : 'SHORT',
      strategy: 'rs_flip',
      entry,
      stopLoss,
      tp1,
      tp2,
      tp3,
      tp1Type,
      tp2Type,
      tp3Type: 'projection',
      riskReward1: Math.abs(tp1 - entry) / riskAmount,
      riskReward2: Math.abs(tp2 - entry) / riskAmount,
      riskReward3: Math.abs(tp3 - entry) / riskAmount,
      quantity: calculatePositionSize(params.accountSize, params.riskPercent, entry, stopLoss),
      reason: `${line.type === 'resistance' ? 'Resistance' : 'Support'} flip retest`,
      active: true,
    };
  }
  
  return null;
}

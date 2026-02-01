/**
 * EMA Trading Strategy
 * Supports bounce, cross, and trend trade patterns using EMAs
 */

import { calculateEMA } from '@/lib/indicators/momentum';
import { calculateSwings } from '@/lib/smc/pivots';
import { calculatePositionSize } from '@/lib/trading/positionCalculator';
import { getCurrentATR, findNextSwingLevels } from './helpers';
import { inZone, aboveZone, belowZone } from '@/utils/zoneHelpers';
import type { CandleData } from '@/types/chart.types';
import type { TradeSignal, BotTPSLConfig, TPType } from '@/types/trading.types';

export interface EMAStrategyParams {
  enabled: boolean;
  entryMode: 'bounce' | 'cross' | 'trend';
  singlePeriod: number;
  fastPeriod: number;
  slowPeriod: number;
  threshold: number;
  tpslConfig: BotTPSLConfig;
  slSwingLength: number;
  tpSwingLength: number;
  accountSize: number;
  riskPercent: number;
  directionFilter?: (type: 'LONG' | 'SHORT') => boolean;
}

export function generateEMATradingSignal(
  data: CandleData[],
  params: EMAStrategyParams
): TradeSignal | null {
  if (!params.enabled || data.length < 50) return null;
  
  let emaLevel: number | null = null;
  let fastEMA: number | null = null;
  let slowEMA: number | null = null;
  
  if (params.entryMode === 'bounce' || params.entryMode === 'cross') {
    const emaValues = calculateEMA(data.map(c => c.close), params.singlePeriod);
    if (emaValues.length < 3) return null;
    emaLevel = emaValues[emaValues.length - 1];
  } else {
    const fastEMAValues = calculateEMA(data.map(c => c.close), params.fastPeriod);
    const slowEMAValues = calculateEMA(data.map(c => c.close), params.slowPeriod);
    if (fastEMAValues.length < 3 || slowEMAValues.length < 3) return null;
    fastEMA = fastEMAValues[fastEMAValues.length - 1];
    slowEMA = slowEMAValues[slowEMAValues.length - 1];
    const prevFastEMA = fastEMAValues[fastEMAValues.length - 2];
    const prevSlowEMA = slowEMAValues[slowEMAValues.length - 2];
    
    const bullishCross = prevFastEMA <= prevSlowEMA && fastEMA > slowEMA;
    const bearishCross = prevFastEMA >= prevSlowEMA && fastEMA < slowEMA;
    
    if (!bullishCross && !bearishCross) return null;
    
    const signal: 'LONG' | 'SHORT' = bullishCross ? 'LONG' : 'SHORT';
    if (params.directionFilter && !params.directionFilter(signal)) return null;
    
    const currentCandle = data[data.length - 1];
    const entry = currentCandle.close;
    const atr = getCurrentATR(data);
    
    const slConfig = params.tpslConfig.sl;
    let stopLoss: number;
    if (slConfig.type === 'atr') {
      stopLoss = signal === 'LONG' ? entry - (atr * (slConfig.atrMultiplier || 1.5)) : entry + (atr * (slConfig.atrMultiplier || 1.5));
    } else if (slConfig.type === 'structure') {
      const swings = calculateSwings(data, params.slSwingLength);
      const recentSwings = swings.slice(-10);
      const swingLevels = signal === 'LONG' ? recentSwings.filter(s => s.type === 'low').map(s => s.value) : recentSwings.filter(s => s.type === 'high').map(s => s.value);
      stopLoss = signal === 'LONG' ? (swingLevels.length > 0 ? Math.max(...swingLevels) : entry - atr) : (swingLevels.length > 0 ? Math.min(...swingLevels) : entry + atr);
    } else {
      const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
      stopLoss = signal === 'LONG' ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
    }
    
    const riskAmount = Math.abs(entry - stopLoss);
    const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, signal === 'LONG' ? 'long' : 'short', params.tpSwingLength);
    
    const { tp1: tp1Config, tp2: tp2Config } = params.tpslConfig;
    
    let tp1: number, tp2: number, tp3: number;
    let tp1Type: TPType = tp1Config.type;
    let tp2Type: TPType = tp2Config?.type || 'structure';
    
    if (tp1Config.type === 'ema' || tp1Config.type === 'vwap') {
      tp1 = signal === 'LONG' ? Infinity : -Infinity;
    } else if (tp1Config.type === 'atr') {
      tp1 = signal === 'LONG' ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
    } else if (tp1Config.type === 'structure') {
      tp1 = structureTP2;
    } else if (tp1Config.type === 'fixed_rr') {
      tp1 = signal === 'LONG' ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
    } else {
      tp1 = structureTP2;
    }
    
    if (tp2Config?.type === 'ema' || tp2Config?.type === 'vwap') {
      tp2 = signal === 'LONG' ? Infinity : -Infinity;
    } else if (tp2Config?.type === 'atr') {
      tp2 = signal === 'LONG' ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
    } else if (tp2Config?.type === 'fixed_rr') {
      tp2 = signal === 'LONG' ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
    } else {
      tp2 = structureTP3;
    }
    
    if (params.tpslConfig.tp3?.type === 'ema' || params.tpslConfig.tp3?.type === 'vwap') {
      tp3 = signal === 'LONG' ? Infinity : -Infinity;
    } else {
      tp3 = signal === 'LONG' ? entry + (structureTP2 - entry) * 1.5 : entry - (entry - structureTP2) * 1.5;
    }
    
    let entryEMAState: 'fast_above_slow' | 'fast_below_slow' | undefined;
    const hasEMAExit = tp1Type === 'ema' || tp2Type === 'ema' || params.tpslConfig.tp3?.type === 'ema';
    if (hasEMAExit && fastEMA !== null && slowEMA !== null) {
      entryEMAState = fastEMA >= slowEMA ? 'fast_above_slow' : 'fast_below_slow';
    }
    
    return {
      id: `ema_trend_${currentCandle.time}_${signal.toLowerCase()}`,
      time: currentCandle.time,
      type: signal,
      strategy: 'ema_trading',
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
      reason: `EMA Crossover (${params.fastPeriod}/${params.slowPeriod})`,
      active: true,
      entryEMAState,
    };
  }
  
  if (data.length < 3 || !emaLevel) return null;
  
  const prevCandle = data[data.length - 3];
  const entryCandle = data[data.length - 2];
  const confirmCandle = data[data.length - 1];
  
  const tolerance = emaLevel * (params.threshold / 100);
  const upperZone = emaLevel + tolerance;
  const lowerZone = emaLevel - tolerance;
  
  let signal: { type: 'LONG' | 'SHORT', pattern: 'Bounce' | 'Cross' } | null = null;
  
  if (params.entryMode === 'bounce' && inZone(entryCandle, lowerZone, upperZone)) {
    if (belowZone(prevCandle, lowerZone) && confirmCandle.close > emaLevel) {
      signal = { type: 'LONG', pattern: 'Bounce' };
    } else if (aboveZone(prevCandle, upperZone) && confirmCandle.close < emaLevel) {
      signal = { type: 'SHORT', pattern: 'Bounce' };
    }
  }
  
  if (params.entryMode === 'cross' && !signal && inZone(entryCandle, lowerZone, upperZone)) {
    if (belowZone(prevCandle, lowerZone) && confirmCandle.close > upperZone) {
      signal = { type: 'LONG', pattern: 'Cross' };
    } else if (aboveZone(prevCandle, upperZone) && confirmCandle.close < lowerZone) {
      signal = { type: 'SHORT', pattern: 'Cross' };
    }
  }
  
  if (!signal) return null;
  if (params.directionFilter && !params.directionFilter(signal.type)) return null;
  
  const entry = confirmCandle.close;
  const atr = getCurrentATR(data);
  
  const slConfig = params.tpslConfig.sl;
  let stopLoss: number;
  if (slConfig.type === 'atr') {
    stopLoss = signal.type === 'LONG' ? emaLevel - (atr * (slConfig.atrMultiplier || 1.5)) : emaLevel + (atr * (slConfig.atrMultiplier || 1.5));
  } else if (slConfig.type === 'structure') {
    stopLoss = signal.type === 'LONG' ? emaLevel - atr : emaLevel + atr;
  } else {
    const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
    stopLoss = signal.type === 'LONG' ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
  }
  
  const riskAmount = Math.abs(entry - stopLoss);
  const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, signal.type === 'LONG' ? 'long' : 'short', params.tpSwingLength);
  
  const { tp1: tp1Config, tp2: tp2Config } = params.tpslConfig;
  
  let tp1: number, tp2: number, tp3: number;
  let tp1Type: TPType = tp1Config.type;
  let tp2Type: TPType = tp2Config?.type || 'structure';
  
  if (tp1Config.type === 'ema' || tp1Config.type === 'vwap') {
    tp1 = signal.type === 'LONG' ? Infinity : -Infinity;
  } else if (tp1Config.type === 'atr') {
    tp1 = signal.type === 'LONG' ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
  } else if (tp1Config.type === 'structure') {
    tp1 = structureTP2;
  } else if (tp1Config.type === 'fixed_rr') {
    tp1 = signal.type === 'LONG' ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
  } else {
    tp1 = structureTP2;
  }
  
  if (tp2Config?.type === 'ema' || tp2Config?.type === 'vwap') {
    tp2 = signal.type === 'LONG' ? Infinity : -Infinity;
  } else if (tp2Config?.type === 'atr') {
    tp2 = signal.type === 'LONG' ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
  } else if (tp2Config?.type === 'fixed_rr') {
    tp2 = signal.type === 'LONG' ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
  } else {
    tp2 = structureTP3;
  }
  
  if (params.tpslConfig.tp3?.type === 'ema' || params.tpslConfig.tp3?.type === 'vwap') {
    tp3 = signal.type === 'LONG' ? Infinity : -Infinity;
  } else {
    tp3 = signal.type === 'LONG' ? entry + (structureTP2 - entry) * 1.5 : entry - (entry - structureTP2) * 1.5;
  }
  
  let entryEMAState: 'fast_above_slow' | 'fast_below_slow' | undefined;
  const hasEMAExit = tp1Type === 'ema' || tp2Type === 'ema' || params.tpslConfig.tp3?.type === 'ema';
  if (hasEMAExit) {
    const tp1EMA = tp1Config.type === 'ema' ? tp1Config : (tp2Config?.type === 'ema' ? tp2Config : params.tpslConfig.tp3);
    const fastPeriod = (tp1EMA as any)?.emaFast || 10;
    const slowPeriod = (tp1EMA as any)?.emaSlow || 40;
    
    const closes = data.map(c => c.close);
    const fastEMAValues = calculateEMA(closes, fastPeriod);
    const slowEMAValues = calculateEMA(closes, slowPeriod);
    if (fastEMAValues.length > 0 && slowEMAValues.length > 0) {
      const currentFast = fastEMAValues[fastEMAValues.length - 1];
      const currentSlow = slowEMAValues[slowEMAValues.length - 1];
      entryEMAState = currentFast >= currentSlow ? 'fast_above_slow' : 'fast_below_slow';
    }
  }
  
  return {
    id: `ema_${signal.pattern.toLowerCase()}_${entryCandle.time}_${signal.type.toLowerCase()}`,
    time: confirmCandle.time,
    type: signal.type,
    strategy: 'ema_trading',
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
    reason: `EMA ${signal.pattern} at ${emaLevel.toFixed(4)} (${params.singlePeriod}MA)`,
    active: true,
    entryEMAState,
  };
}

/**
 * VWAP Trading Strategy
 * Trades bounces and crosses at VWAP levels
 */

import { calculateEMA } from '@/lib/indicators/momentum';
import { calculatePositionSize } from '@/lib/trading/positionCalculator';
import { getCurrentATR, findNextSwingLevels } from './helpers';
import type { CandleData, VWAPData } from '@/types/chart.types';
import type { TradeSignal, BotTPSLConfig, TPType } from '@/types/trading.types';

export interface VWAPStrategyParams {
  enabled: boolean;
  vwapType: 'daily' | 'weekly' | 'monthly' | 'rolling10' | 'rolling20' | 'rolling50';
  threshold: number;
  entryCandles: 'single' | 'double';
  tpslConfig: BotTPSLConfig;
  tpSwingLength: number;
  accountSize: number;
  riskPercent: number;
  directionFilter?: (type: 'LONG' | 'SHORT') => boolean;
}

function getPeriodKey(time: number, period: string): string {
  const date = new Date(time * 1000);
  if (period === 'daily') {
    return date.toISOString().slice(0, 10);
  } else if (period === 'weekly') {
    const startOfWeek = new Date(date);
    startOfWeek.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return startOfWeek.toISOString().slice(0, 10);
  } else if (period === 'monthly') {
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
  }
  return '';
}

function calculatePeriodicVWAP(data: CandleData[], period: string, currentOnly: boolean): VWAPData[] {
  if (data.length === 0) return [];
  const result: VWAPData[] = [];
  let sumPV = 0, sumV = 0;
  let lastPeriodKey = getPeriodKey(data[0].time, period);
  const currentPeriodKey = getPeriodKey(data[data.length - 1].time, period);
  
  data.forEach(bar => {
    const periodKey = getPeriodKey(bar.time, period);
    if (periodKey !== lastPeriodKey) {
      sumPV = 0;
      sumV = 0;
    }
    lastPeriodKey = periodKey;
    const typical = (bar.high + bar.low + bar.close) / 3;
    sumPV += typical * bar.volume;
    sumV += bar.volume;
    if (sumV > 0 && (!currentOnly || periodKey === currentPeriodKey)) {
      result.push({ time: bar.time, value: sumPV / sumV });
    }
  });
  return result;
}

function calculateRollingVWAP(data: CandleData[], count: number): VWAPData[] {
  const result: VWAPData[] = [];
  for (let i = count - 1; i < data.length; i++) {
    const slice = data.slice(i - count + 1, i + 1);
    let sumPV = 0, sumV = 0;
    slice.forEach(bar => {
      const typical = (bar.high + bar.low + bar.close) / 3;
      sumPV += typical * bar.volume;
      sumV += bar.volume;
    });
    result.push({ time: data[i].time, value: sumPV / sumV });
  }
  return result;
}

function touchesZone(candle: CandleData, lowerZone: number, upperZone: number): boolean {
  return candle.low <= upperZone && candle.high >= lowerZone;
}

export function generateVWAPTradingSignal(
  data: CandleData[],
  params: VWAPStrategyParams
): TradeSignal | null {
  if (!params.enabled || data.length < 50) return null;
  
  let vwapData: VWAPData[];
  if (params.vwapType === 'daily') {
    vwapData = calculatePeriodicVWAP(data, 'daily', true);
  } else if (params.vwapType === 'weekly') {
    vwapData = calculatePeriodicVWAP(data, 'weekly', true);
  } else if (params.vwapType === 'monthly') {
    vwapData = calculatePeriodicVWAP(data, 'monthly', true);
  } else if (params.vwapType === 'rolling10') {
    vwapData = calculateRollingVWAP(data, 10);
  } else if (params.vwapType === 'rolling20') {
    vwapData = calculateRollingVWAP(data, 20);
  } else if (params.vwapType === 'rolling50') {
    vwapData = calculateRollingVWAP(data, 50);
  } else {
    vwapData = calculatePeriodicVWAP(data, 'weekly', true);
  }
  
  if (vwapData.length < 2) return null;
  const vwapLevel = vwapData[vwapData.length - 1].value;
  
  if (data.length < 2) return null;
  const prevCandle = data[data.length - 2];
  const currentCandle = data[data.length - 1];
  
  const tolerance = vwapLevel * (params.threshold / 100);
  const upperZone = vwapLevel + tolerance;
  const lowerZone = vwapLevel - tolerance;
  
  let signal: { type: 'LONG' | 'SHORT', pattern: 'Bounce' | 'Cross' } | null = null;
  
  if (params.entryCandles === 'single') {
    if (touchesZone(currentCandle, lowerZone, upperZone)) {
      if (currentCandle.close > vwapLevel) {
        signal = { type: 'LONG', pattern: 'Bounce' };
      } else if (currentCandle.close < vwapLevel) {
        signal = { type: 'SHORT', pattern: 'Bounce' };
      }
    }
    
    if (!signal && touchesZone(currentCandle, lowerZone, upperZone)) {
      if (currentCandle.close > upperZone) {
        signal = { type: 'LONG', pattern: 'Cross' };
      } else if (currentCandle.close < lowerZone) {
        signal = { type: 'SHORT', pattern: 'Cross' };
      }
    }
  } else {
    if (touchesZone(prevCandle, lowerZone, upperZone)) {
      if (currentCandle.close > vwapLevel) {
        signal = { type: 'LONG', pattern: 'Bounce' };
      } else if (currentCandle.close < vwapLevel) {
        signal = { type: 'SHORT', pattern: 'Bounce' };
      }
    }
    
    if (!signal && touchesZone(prevCandle, lowerZone, upperZone)) {
      if (currentCandle.close > upperZone) {
        signal = { type: 'LONG', pattern: 'Cross' };
      } else if (currentCandle.close < lowerZone) {
        signal = { type: 'SHORT', pattern: 'Cross' };
      }
    }
  }
  
  if (!signal) return null;
  
  const isLong = signal.type === 'LONG';
  if (params.directionFilter && !params.directionFilter(signal.type)) return null;
  
  const entry = currentCandle.close;
  const atr = getCurrentATR(data);
  
  const slConfig = params.tpslConfig.sl;
  let stopLoss: number;
  if (slConfig.type === 'atr') {
    stopLoss = isLong ? vwapLevel - (atr * (slConfig.atrMultiplier || 1.5)) : vwapLevel + (atr * (slConfig.atrMultiplier || 1.5));
  } else if (slConfig.type === 'structure') {
    stopLoss = isLong ? vwapLevel - atr : vwapLevel + atr;
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
  let tp3Type: TPType = 'projection';
  
  if (tp1Config.type === 'ema' || tp1Config.type === 'vwap') {
    tp1 = isLong ? Infinity : -Infinity;
  } else if (tp1Config.type === 'atr') {
    tp1 = isLong ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
  } else if (tp1Config.type === 'structure') {
    tp1 = structureTP2;
  } else if (tp1Config.type === 'fixed_rr') {
    tp1 = isLong ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
  } else {
    tp1 = structureTP2;
  }
  
  if (tp2Config?.type === 'ema' || tp2Config?.type === 'vwap') {
    tp2 = isLong ? Infinity : -Infinity;
  } else if (tp2Config?.type === 'atr') {
    tp2 = isLong ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
  } else if (tp2Config?.type === 'fixed_rr') {
    tp2 = isLong ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
  } else {
    tp2 = structureTP3;
  }
  
  if (params.tpslConfig.tp3?.type === 'ema' || params.tpslConfig.tp3?.type === 'vwap') {
    tp3 = isLong ? Infinity : -Infinity;
  } else {
    tp3 = isLong ? entry + (structureTP2 - entry) * 1.5 : entry - (entry - structureTP2) * 1.5;
  }
  
  let entryEMAState: 'fast_above_slow' | 'fast_below_slow' | undefined;
  const hasEMAExit = params.tpslConfig.tp1.type === 'ema' || params.tpslConfig.tp2?.type === 'ema' || params.tpslConfig.tp3?.type === 'ema';
  if (hasEMAExit) {
    const tp1EMA = params.tpslConfig.tp1.type === 'ema' ? params.tpslConfig.tp1 : (params.tpslConfig.tp2?.type === 'ema' ? params.tpslConfig.tp2 : params.tpslConfig.tp3);
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
    id: `vwap_${signal.pattern.toLowerCase()}_${currentCandle.time}_${isLong ? 'long' : 'short'}`,
    time: currentCandle.time,
    type: signal.type,
    strategy: 'vwap_rejection',
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    tp1Type,
    tp2Type,
    tp3Type,
    tp1Config: params.tpslConfig.tp1,
    tp2Config: params.tpslConfig.tp2,
    tp3Config: params.tpslConfig.tp3,
    riskReward1: Math.abs(tp1 - entry) / riskAmount,
    riskReward2: Math.abs(tp2 - entry) / riskAmount,
    riskReward3: Math.abs(tp3 - entry) / riskAmount,
    quantity: calculatePositionSize(params.accountSize, params.riskPercent, entry, stopLoss),
    reason: `VWAP ${signal.pattern} at ${vwapLevel.toFixed(4)}`,
    active: true,
    entryEMAState,
  };
}

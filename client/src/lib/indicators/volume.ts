/**
 * Volume-based indicator calculations
 * Extracted from CryptoIndicators.tsx for better modularity
 */

import type { CandleData } from '@/types/chart.types';

interface TimeValuePair {
  time: number;
  value: number;
}

/**
 * Calculate OBV (On Balance Volume)
 */
export function calculateOBV(bars: CandleData[]): TimeValuePair[] {
  let obv = 0;
  return bars.map((bar, i) => {
    if (i === 0) return { time: bar.time, value: 0 };
    if (bar.close > bars[i-1].close) obv += bar.volume;
    else if (bar.close < bars[i-1].close) obv -= bar.volume;
    return { time: bar.time, value: obv };
  });
}

/**
 * Calculate MFI (Money Flow Index)
 */
export function calculateMFI(candles: CandleData[], period: number = 14): TimeValuePair[] {
  if (candles.length < period + 1) return [];
  const result: TimeValuePair[] = [];
  
  for (let i = period; i < candles.length; i++) {
    let posFlow = 0;
    let negFlow = 0;
    
    for (let j = i - period + 1; j <= i; j++) {
      const typicalPrice = (candles[j].high + candles[j].low + candles[j].close) / 3;
      const rawMoneyFlow = typicalPrice * candles[j].volume;
      
      if (j > 0) {
        const prevTypicalPrice = (candles[j-1].high + candles[j-1].low + candles[j-1].close) / 3;
        if (typicalPrice > prevTypicalPrice) {
          posFlow += rawMoneyFlow;
        } else if (typicalPrice < prevTypicalPrice) {
          negFlow += rawMoneyFlow;
        }
      }
    }
    
    const moneyFlowRatio = negFlow === 0 ? 100 : posFlow / negFlow;
    const mfi = 100 - (100 / (1 + moneyFlowRatio));
    result.push({ time: candles[i].time, value: mfi });
  }
  
  return result;
}

/**
 * Calculate Chaikin Money Flow (CMF)
 */
export function calculateCMF(candles: CandleData[], period: number = 20): TimeValuePair[] {
  if (!candles || candles.length < period) return [];

  const result: TimeValuePair[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let moneyFlowVolumeSum = 0;
    let volumeSum = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const candle = candles[j];
      const highLowRange = candle.high - candle.low;
      const multiplier = highLowRange === 0
        ? 0
        : ((candle.close - candle.low) - (candle.high - candle.close)) / highLowRange;
      moneyFlowVolumeSum += multiplier * candle.volume;
      volumeSum += candle.volume;
    }

    result.push({
      time: candles[i].time,
      value: volumeSum === 0 ? 0 : moneyFlowVolumeSum / volumeSum,
    });
  }

  return result;
}

/**
 * Calculate Klinger Oscillator
 */
export function calculateKlingerOscillator(
  candles: CandleData[],
  shortPeriod: number = 34,
  longPeriod: number = 55,
  signalPeriod: number = 13
): { klinger: TimeValuePair[]; signal: TimeValuePair[] } {
  if (!candles || candles.length < longPeriod + signalPeriod + 2) {
    return { klinger: [], signal: [] };
  }

  const trend: number[] = [];
  const volumeForce: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trend.push(0);
      volumeForce.push(0);
      continue;
    }

    const current = candles[i];
    const previous = candles[i - 1];

    const hlc3 = (current.high + current.low + current.close) / 3;
    const prevHlc3 = (previous.high + previous.low + previous.close) / 3;
    const direction = hlc3 > prevHlc3 ? 1 : hlc3 < prevHlc3 ? -1 : trend[i - 1];
    trend.push(direction);

    const range = Math.max(current.high - current.low, 0.0000001);
    const force = direction * current.volume * (2 * ((current.close - current.low) / range) - 1);
    volumeForce.push(force);
  }

  const ema = (data: number[], period: number): number[] => {
    const alpha = 2 / (period + 1);
    const result: number[] = [data[0] ?? 0];
    for (let i = 1; i < data.length; i++) {
      result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
    }
    return result;
  };

  const shortEma = ema(volumeForce, shortPeriod);
  const longEma = ema(volumeForce, longPeriod);
  const rawKlinger = shortEma.map((value, index) => value - longEma[index]);
  const signalRaw = ema(rawKlinger, signalPeriod);

  const klinger = candles.map((candle, index) => ({
    time: candle.time,
    value: rawKlinger[index],
  }));

  const signal = candles.map((candle, index) => ({
    time: candle.time,
    value: signalRaw[index],
  }));

  return { klinger, signal };
}

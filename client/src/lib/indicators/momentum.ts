/**
 * Momentum indicator calculations
 * Extracted from CryptoIndicators.tsx for better modularity
 */

import type { CandleData } from '@/types/chart.types';

interface TimeValuePair {
  time: number;
  value: number;
}

interface MACDResult {
  macd: TimeValuePair[];
  signal: TimeValuePair[];
  hist: Array<TimeValuePair & { color: string }>;
}

interface TSIResult {
  tsi: TimeValuePair[];
  signal: TimeValuePair[];
}

interface WaddahExplosionPoint {
  time: number;
  value: number;
  color: string;
}

interface WaddahExplosionResult {
  histogram: WaddahExplosionPoint[];
  explosion: TimeValuePair[];
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(bars: CandleData[], period: number = 14): TimeValuePair[] {
  let gains = 0, losses = 0;
  return bars.map((bar, i) => {
    if (i === 0) return { time: bar.time, value: 50 };
    const diff = bar.close - bars[i-1].close;
    if (diff > 0) { 
      gains = (gains * (period-1) + diff) / period; 
      losses = (losses * (period-1)) / period; 
    } else { 
      losses = (losses * (period-1) - diff) / period; 
      gains = (gains * (period-1)) / period; 
    }
    const rs = losses === 0 ? 100 : gains / losses;
    return { time: bar.time, value: 100 - 100 / (1 + rs) };
  });
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
export function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const k = 2 / (period + 1);
  ema[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(
  bars: CandleData[], 
  fastPeriod: number = 12, 
  slowPeriod: number = 26, 
  signalPeriod: number = 9
): MACDResult {
  const close = bars.map(b => b.close);
  const emaFast = calculateEMA(close, fastPeriod);
  const emaSlow = calculateEMA(close, slowPeriod);
  const macdLine = close.map((_, i) => emaFast[i] - emaSlow[i]);
  const signal = calculateEMA(macdLine, signalPeriod);
  const histogram = macdLine.map((v, i) => v - signal[i]);
  return { 
    macd: macdLine.map((v, i) => ({ time: bars[i].time, value: v })),
    signal: signal.map((v, i) => ({ time: bars[i].time, value: v })),
    hist: histogram.map((v, i) => ({ time: bars[i].time, value: v, color: v > 0 ? '#00ff9d' : '#ff3b69' })) 
  };
}

/**
 * Calculate True Strength Index (TSI)
 */
export function calculateTSI(
  bars: CandleData[],
  longPeriod: number = 25,
  shortPeriod: number = 13,
  signalPeriod: number = 7
): TSIResult {
  if (!bars || bars.length < Math.max(longPeriod, shortPeriod) + 2) {
    return { tsi: [], signal: [] };
  }

  const priceChange: number[] = [0];
  const absPriceChange: number[] = [0];

  for (let i = 1; i < bars.length; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    priceChange.push(delta);
    absPriceChange.push(Math.abs(delta));
  }

  const smoothedPC1 = calculateEMA(priceChange, longPeriod);
  const smoothedPC2 = calculateEMA(smoothedPC1, shortPeriod);
  const smoothedAbsPC1 = calculateEMA(absPriceChange, longPeriod);
  const smoothedAbsPC2 = calculateEMA(smoothedAbsPC1, shortPeriod);

  const alignOffset = bars.length - smoothedPC2.length;
  const tsiValues = smoothedPC2.map((value, index) => {
    const denominator = smoothedAbsPC2[index];
    const tsi = denominator === 0 ? 0 : (value / denominator) * 100;
    return {
      time: bars[index + alignOffset].time,
      value: tsi,
    };
  });

  const signalEma = calculateEMA(tsiValues.map(point => point.value), signalPeriod);
  const signalOffset = tsiValues.length - signalEma.length;
  const signal = signalEma.map((value, index) => ({
    time: tsiValues[index + signalOffset].time,
    value,
  }));

  return {
    tsi: tsiValues,
    signal,
  };
}

/**
 * Calculate Waddah Attar Explosion
 * Momentum histogram is derived from MACD histogram; explosion line is BB-width style volatility.
 */
export function calculateWaddahAttarExplosion(
  bars: CandleData[],
  sensitivity: number = 150,
  bbPeriod: number = 20,
  bbMultiplier: number = 2
): WaddahExplosionResult {
  if (!bars || bars.length < Math.max(bbPeriod, 26) + 2) {
    return { histogram: [], explosion: [] };
  }

  const { hist } = calculateMACD(bars, 12, 26, 9);
  const closes = bars.map(bar => bar.close);
  const explosion: TimeValuePair[] = [];

  for (let i = bbPeriod - 1; i < closes.length; i++) {
    const slice = closes.slice(i - bbPeriod + 1, i + 1);
    const mean = slice.reduce((sum, value) => sum + value, 0) / bbPeriod;
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / bbPeriod;
    const stdDev = Math.sqrt(variance);
    const upper = mean + bbMultiplier * stdDev;
    const lower = mean - bbMultiplier * stdDev;
    explosion.push({
      time: bars[i].time,
      value: Math.abs(upper - lower),
    });
  }

  const explosionMap = new Map<number, number>(explosion.map(point => [point.time, point.value]));

  const histogram: WaddahExplosionPoint[] = hist
    .filter(point => explosionMap.has(point.time))
    .map((point, index, allPoints) => {
      const momentum = point.value * sensitivity;
      const prevMomentum = index > 0 ? Math.abs(allPoints[index - 1].value * sensitivity) : Math.abs(momentum);
      const isWeakening = Math.abs(momentum) < prevMomentum;
      const alpha = isWeakening ? '88' : 'ff';

      return {
        time: point.time,
        value: momentum,
        color: momentum >= 0 ? `#22c55e${alpha}` : `#ef4444${alpha}`,
      };
    });

  return {
    histogram,
    explosion,
  };
}

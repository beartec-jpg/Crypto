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

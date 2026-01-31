/**
 * Trend indicator calculations
 * Extracted from CryptoIndicators.tsx for better modularity
 */

import type { CandleData } from '@/types/chart.types';

/**
 * Calculate ATR (Average True Range)
 */
export function calculateATR(data: CandleData[], period: number = 14): number[] {
  const tr: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const highLow = data[i].high - data[i].low;
    const highClose = Math.abs(data[i].high - data[i - 1].close);
    const lowClose = Math.abs(data[i].low - data[i - 1].close);
    tr.push(Math.max(highLow, highClose, lowClose));
  }
  const atr: number[] = [];
  let sum = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atr.push(sum);
  for (let i = period; i < tr.length; i++) {
    sum = (atr[atr.length - 1] * (period - 1) + tr[i]) / period;
    atr.push(sum);
  }
  return atr;
}

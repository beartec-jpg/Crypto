/**
 * Pivot (peaks and troughs) detection utilities
 * Extracted from CryptoIndicators.tsx
 */

import type { CandleData } from '@/types/chart.types';

interface SwingPoint {
  time: number;
  value: number;
  type: 'high' | 'low';
  index: number;
}

/**
 * Find peaks and troughs in price data using lookback period
 */
export const findPeaksAndTroughs = (data: number[], lookback: number = 5): { peaks: number[]; troughs: number[] } => {
  const peaks: number[] = [];
  const troughs: number[] = [];
  
  for (let i = lookback; i < data.length - lookback; i++) {
    const slice = data.slice(i - lookback, i + lookback + 1);
    const maxVal = Math.max(...slice);
    const minVal = Math.min(...slice);
    
    if (data[i] === maxVal && slice.filter(v => v === maxVal).length === 1) {
      peaks.push(i);
    }
    if (data[i] === minVal && slice.filter(v => v === minVal).length === 1) {
      troughs.push(i);
    }
  }
  
  return { peaks, troughs };
};

/**
 * Calculate swing highs and lows
 */
export function calculateSwings(data: CandleData[], swingLength: number = 5): SwingPoint[] {
  const swings: SwingPoint[] = [];
  
  for (let i = swingLength; i < data.length - swingLength; i++) {
    const leftHighs = data.slice(i - swingLength, i).map(b => b.high);
    const rightHighs = data.slice(i + 1, i + swingLength + 1).map(b => b.high);
    if (data[i].high >= Math.max(...leftHighs) && data[i].high >= Math.max(...rightHighs)) {
      swings.push({ time: data[i].time, value: data[i].high, type: 'high', index: i });
    }
    
    const leftLows = data.slice(i - swingLength, i).map(b => b.low);
    const rightLows = data.slice(i + 1, i + swingLength + 1).map(b => b.low);
    if (data[i].low <= Math.min(...leftLows) && data[i].low <= Math.min(...rightLows)) {
      swings.push({ time: data[i].time, value: data[i].low, type: 'low', index: i });
    }
  }
  
  return swings.sort((a, b) => a.index - b.index);
}

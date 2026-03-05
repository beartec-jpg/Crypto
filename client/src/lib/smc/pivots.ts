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

// ============ SMT DIVERGENCE SPECIFIC ============

export interface Pivot {
  index: number;
  value: number;
  isHigh: boolean;
  time?: number;
}

/**
 * Find pivots using ZigZag approach (checks extent over left/right bars)
 * SMT-specific: Returns cleaner pivot array for multi-asset comparison
 */
export function findPivotsZigZag(
  data: CandleData[],
  leftBars: number = 5,
  rightBars: number = 5,
): Pivot[] {
  const pivots: Pivot[] = [];

  if (data.length < leftBars + rightBars + 1) {
    return pivots;
  }

  for (let i = leftBars; i < data.length - rightBars; i++) {
    const current = data[i];

    // Check if pivot high
    const isHigh = data
      .slice(Math.max(0, i - leftBars), Math.min(data.length, i + rightBars + 1))
      .every((candle, idx) => {
        const candleIndex = Math.max(0, i - leftBars) + idx;
        return candleIndex === i || candle.high <= current.high;
      });

    // Check if pivot low
    const isLow = data
      .slice(Math.max(0, i - leftBars), Math.min(data.length, i + rightBars + 1))
      .every((candle, idx) => {
        const candleIndex = Math.max(0, i - leftBars) + idx;
        return candleIndex === i || candle.low >= current.low;
      });

    if (isHigh && !isLow) {
      pivots.push({
        index: i,
        value: current.high,
        isHigh: true,
        time: typeof current.time === 'number' ? current.time : undefined,
      });
    } else if (isLow && !isHigh) {
      pivots.push({
        index: i,
        value: current.low,
        isHigh: false,
        time: typeof current.time === 'number' ? current.time : undefined,
      });
    }
  }

  return pivots;
}

/**
 * Get recent swing highs
 */
export function getRecentHighs(pivots: Pivot[], count: number = 2): Pivot[] {
  return pivots.filter(p => p.isHigh).slice(-count);
}

/**
 * Get recent swing lows
 */
export function getRecentLows(pivots: Pivot[], count: number = 2): Pivot[] {
  return pivots.filter(p => !p.isHigh).slice(-count);
}

/**
 * Check if price is forming higher lows (bullish structure)
 */
export function isFormingHigherLows(lows: Pivot[]): boolean {
  if (lows.length < 2) return false;
  return lows[lows.length - 1].value > lows[lows.length - 2].value;
}

/**
 * Check if price is forming lower highs (bearish structure)
 */
export function isFormingLowerHighs(highs: Pivot[]): boolean {
  if (highs.length < 2) return false;
  return highs[highs.length - 1].value < highs[highs.length - 2].value;
}

/**
 * Calculate percentage change between two pivots
 */
export function calculatePivotChange(fromPivot: Pivot, toPivot: Pivot): number {
  if (fromPivot.value === 0) return 0;
  return ((toPivot.value - fromPivot.value) / fromPivot.value) * 100;
}

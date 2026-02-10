/**
 * Structure detection utilities for identifying market bias
 * Extracted from TickerTable.tsx for reusability
 */

import type { Candle, Bias } from '@/types/candle';

/**
 * Detect swing highs and lows in candle data
 * @param candles Array of candle data
 * @param lookback Number of candles to look back/forward (default: 5)
 * @returns Object with arrays of swing highs and lows
 */
export function detectSwings(candles: Candle[], lookback: number = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    
    let isSwingHigh = true;
    let isSwingLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= currentHigh || candles[i + j].high >= currentHigh) {
        isSwingHigh = false;
      }
      if (candles[i - j].low <= currentLow || candles[i + j].low <= currentLow) {
        isSwingLow = false;
      }
    }
    
    if (isSwingHigh) highs.push(currentHigh);
    if (isSwingLow) lows.push(currentLow);
  }
  
  return { highs, lows };
}

/**
 * Detect market structure (HH/HL for bullish, LH/LL for bearish)
 * @param candles Array of candle data
 * @returns Market bias: 'bullish', 'bearish', or 'neutral'
 */
export function detectStructure(candles: Candle[]): Bias {
  const { highs, lows } = detectSwings(candles, 5);
  
  if (highs.length < 2 || lows.length < 2) return 'neutral';
  
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  
  // Check for Higher Highs (HH)
  let hasHH = true;
  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] <= recentHighs[i - 1]) {
      hasHH = false;
      break;
    }
  }
  
  // Check for Higher Lows (HL)
  let hasHL = true;
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] <= recentLows[i - 1]) {
      hasHL = false;
      break;
    }
  }
  
  // Check for Lower Highs (LH)
  let hasLH = true;
  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] >= recentHighs[i - 1]) {
      hasLH = false;
      break;
    }
  }
  
  // Check for Lower Lows (LL)
  let hasLL = true;
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] >= recentLows[i - 1]) {
      hasLL = false;
      break;
    }
  }
  
  if (hasHH && hasHL) return 'bullish';
  if (hasLH && hasLL) return 'bearish';
  return 'neutral';
}

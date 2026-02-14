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
 * 
 * Note: The first and last `lookback` candles cannot be identified as swing points
 * due to boundary constraints. For example, with lookback=5, candles at indices
 * 0-4 and last 5 candles will not be evaluated.
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
 * Detect market structure using weighted scoring system
 * @param candles Array of candle data
 * @param lookback Number of candles to look back/forward for swing detection (default: 5)
 * @returns Market bias: 'bullish', 'bearish', or 'neutral'
 * 
 * Scoring system:
 * - Higher High (HH): +2 points
 * - Higher Low (HL): +1 point
 * - Lower High (LH): -1 point
 * - Lower Low (LL): -2 points
 * 
 * Thresholds:
 * - Bullish: score > 2
 * - Bearish: score < -2
 * - Neutral: -2 <= score <= 2
 */
export function detectStructure(candles: Candle[], lookback: number = 5): Bias {
  const { highs, lows } = detectSwings(candles, lookback);
  
  // Debug logging to help diagnose swing detection
  console.log(`[Structure Detection] Found ${highs.length} swing highs and ${lows.length} swing lows with lookback=${lookback}`);
  
  // Need at least 2 swings to detect structure
  if (highs.length < 2 || lows.length < 2) {
    console.log('[Structure Detection] Insufficient swings for structure detection, returning neutral');
    return 'neutral';
  }
  
  // Analyze last 5+ swings (or all available if less than 5)
  const numSwingsToAnalyze = Math.min(5, highs.length, lows.length);
  const recentHighs = highs.slice(-numSwingsToAnalyze);
  const recentLows = lows.slice(-numSwingsToAnalyze);
  
  let score = 0;
  
  // Score swing highs
  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] > recentHighs[i - 1]) {
      score += 2; // Higher High (HH)
    } else if (recentHighs[i] < recentHighs[i - 1]) {
      score -= 1; // Lower High (LH)
    }
    // Equal highs contribute 0 points
  }
  
  // Score swing lows
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] > recentLows[i - 1]) {
      score += 1; // Higher Low (HL)
    } else if (recentLows[i] < recentLows[i - 1]) {
      score -= 2; // Lower Low (LL)
    }
    // Equal lows contribute 0 points
  }
  
  console.log(`[Structure Detection] Score: ${score} (analyzed ${numSwingsToAnalyze} swings)`);
  
  // Apply thresholds to determine bias
  if (score > 2) {
    return 'bullish';
  } else if (score < -2) {
    return 'bearish';
  } else {
    return 'neutral';
  }
}

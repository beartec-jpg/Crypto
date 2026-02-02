/**
 * FVG (Fair Value Gap) Analysis and Detection
 * 
 * Functions for calculating and analyzing Fair Value Gaps
 */

import { calculateATR } from '@/lib/indicators/trend';
import type { FVG, FootprintData } from '@/types/smc.types';
import type { CandleData } from '@/types/chart.types';

// ==================== TYPES ====================

export interface FVGAnalysis {
  volumeScore: number;
  deltaScore: number;
  isHighValue: boolean;
}

// ==================== FUNCTIONS ====================

/**
 * Analyze FVG volume/delta scores
 * 
 * @param fvg - Fair Value Gap to analyze
 * @param candles - Candle data
 * @param footprint - Footprint data for delta analysis
 * @param volumeThreshold - Volume threshold for high-value FVG
 * @returns Analysis with volume score, delta score, and high-value flag
 */
export function analyzeFVGValue(
  fvg: FVG,
  candles: CandleData[],
  footprint: FootprintData[],
  volumeThreshold: number
): FVGAnalysis {
  // Find all candles that overlap with the FVG zone
  let totalVolume = 0;
  let totalDelta = 0;
  let count = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    // Check if this candle's price range overlaps with the FVG
    if (candle.low <= fvg.upper && candle.high >= fvg.lower) {
      totalVolume += candle.volume;
      
      // Get footprint data for this candle if available
      const fp = footprint.find(f => f.time === candle.time);
      if (fp) {
        totalDelta += Math.abs(fp.delta);
      }
      count++;
    }
  }

  // Calculate average volume across all candles for comparison
  const avgCandleVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
  
  // Volume score: total volume in FVG zone relative to average
  const volumeScore = count > 0 ? totalVolume / (avgCandleVolume * count) : 0;
  
  // Delta score: average delta imbalance in the zone
  const deltaScore = count > 0 ? totalDelta / count : 0;
  
  // High value if volume score exceeds threshold
  const isHighValue = volumeScore >= volumeThreshold;

  return { volumeScore, deltaScore, isHighValue };
}

/**
 * Calculate FVGs with volume analysis
 * 
 * @param data - Candle data
 * @param footprint - Footprint data
 * @param useAtrFilter - Whether to use ATR filter for minimum gap size
 * @param atrFactor - ATR multiplier for minimum gap size
 * @param volumeThreshold - Volume threshold for high-value determination
 * @returns Array of Fair Value Gaps
 */
export function calculateFVGs(
  data: CandleData[],
  footprint: FootprintData[],
  useAtrFilter: boolean = true,
  atrFactor: number = 1,
  volumeThreshold: number = 1.5
): FVG[] {
  const atr = calculateATR(data);
  const fvgs: FVG[] = [];
  for (let i = 2; i < data.length; i++) {
    let minGap = 0;
    if (useAtrFilter) minGap = atr[i - 2] * atrFactor;
    if (data[i].low > data[i - 2].high) {
      const lower = data[i - 2].high;
      const upper = data[i].low;
      if (upper - lower >= minGap) {
        const fvg: FVG = { time: data[i].time, lower, upper, type: 'bullish' };
        const analysis = analyzeFVGValue(fvg, data, footprint, volumeThreshold);
        fvg.volumeScore = analysis.volumeScore;
        fvg.deltaScore = analysis.deltaScore;
        fvg.isHighValue = analysis.isHighValue;
        fvgs.push(fvg);
      }
    } else if (data[i].high < data[i - 2].low) {
      const lower = data[i].high;
      const upper = data[i - 2].low;
      if (upper - lower >= minGap) {
        const fvg: FVG = { time: data[i].time, lower, upper, type: 'bearish' };
        const analysis = analyzeFVGValue(fvg, data, footprint, volumeThreshold);
        fvg.volumeScore = analysis.volumeScore;
        fvg.deltaScore = analysis.deltaScore;
        fvg.isHighValue = analysis.isHighValue;
        fvgs.push(fvg);
      }
    }
  }
  return fvgs;
}

/**
 * Get the time when FVG was filled (or null if still active)
 * 
 * @param fvg - Fair Value Gap
 * @param data - Candle data
 * @returns Fill time or null if unfilled
 */
export function getFVGFillTime(fvg: FVG, data: CandleData[]): number | null {
  const startIdx = data.findIndex(d => d.time === fvg.time);
  
  // Find the first candle that filled the FVG
  for (let i = startIdx + 1; i < data.length; i++) {
    // For bullish FVG, it's filled if price went below the lower boundary
    if (fvg.type === 'bullish' && data[i].low <= fvg.lower) {
      return data[i].time; // Return the time it was filled
    }
    // For bearish FVG, it's filled if price went above the upper boundary
    if (fvg.type === 'bearish' && data[i].high >= fvg.upper) {
      return data[i].time; // Return the time it was filled
    }
  }
  
  return null; // FVG is still unfilled
}

/**
 * Fair Value Gap (FVG) detection utilities
 * Extracted from CryptoIndicators.tsx for better modularity
 */

import type { CandleData } from '@/types/chart.types';
import type { FVG, FootprintData } from '@/types/smc.types';
import { calculateATR } from '@/lib/indicators/trend';

interface FVGAnalysis {
  volumeScore: number;
  deltaScore: number;
  isHighValue: boolean;
}

/**
 * Analyze FVG value based on volume and delta
 */
export function analyzeFVGValue(
  fvg: FVG, 
  candles: CandleData[], 
  footprint: FootprintData[],
  fvgVolumeThreshold: number = 1.5
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
  const isHighValue = volumeScore >= fvgVolumeThreshold;

  return { volumeScore, deltaScore, isHighValue };
}

/**
 * Calculate FVGs with volume analysis
 */
export function calculateFVGs(
  data: CandleData[], 
  footprintData: FootprintData[],
  fvgVolumeThreshold: number = 1.5,
  useAtrFilter: boolean = false, 
  atrFactor: number = 0.5
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
        const analysis = analyzeFVGValue(fvg, data, footprintData, fvgVolumeThreshold);
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
        const analysis = analyzeFVGValue(fvg, data, footprintData, fvgVolumeThreshold);
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
 * Check if FVG is still active (not filled)
 */
export function isActiveFVG(fvg: FVG, data: CandleData[]): boolean {
  const startIdx = data.findIndex(d => d.time === fvg.time);
  
  // Check if FVG has been filled (price went through it completely)
  for (let i = startIdx + 1; i < data.length; i++) {
    if (fvg.type === 'bullish' && data[i].low <= fvg.lower) {
      return false; // Bullish FVG filled
    }
    if (fvg.type === 'bearish' && data[i].high >= fvg.upper) {
      return false; // Bearish FVG filled
    }
  }
  
  return true;
}

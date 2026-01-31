/**
 * Volatility indicator calculations
 * Extracted from CryptoIndicators.tsx for better modularity
 */

import type { CandleData } from '@/types/chart.types';

interface BollingerBandsResult {
  upper: Array<{ time: number; value: number }>;
  middle: Array<{ time: number; value: number }>;
  lower: Array<{ time: number; value: number }>;
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(
  candles: CandleData[], 
  period: number = 20, 
  stdDev: number = 2
): BollingerBandsResult {
  if (candles.length < period) return { upper: [], middle: [], lower: [] };
  
  const result: BollingerBandsResult = { upper: [], middle: [], lower: [] };
  
  for (let i = period - 1; i < candles.length; i++) {
    // Calculate SMA (middle band)
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    const sma = sum / period;
    
    // Calculate standard deviation
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += Math.pow(candles[j].close - sma, 2);
    }
    const std = Math.sqrt(variance / period);
    
    result.middle.push({ time: candles[i].time, value: sma });
    result.upper.push({ time: candles[i].time, value: sma + stdDev * std });
    result.lower.push({ time: candles[i].time, value: sma - stdDev * std });
  }
  
  return result;
}

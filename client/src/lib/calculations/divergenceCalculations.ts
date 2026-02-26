/**
 * Divergence Detection and Analysis
 * 
 * Functions for detecting price/indicator divergences across oscillators
 */

import { findPeaksAndTroughs } from '@/lib/smc/pivots';
import { 
  calculateRSI, 
  calculateMACD, 
  calculateEMA
} from '@/lib/indicators/momentum';
import {
  calculateOBV,
  calculateMFI
} from '@/lib/indicators/volume';
import {
  calculateStochasticRSI,
  calculateWilliamsR,
  calculateCCI,
  calculateADX
} from '@/lib/indicators';
import type { CandleData } from '@/types/chart.types';

// ==================== TYPES ====================

export interface DivergenceResult {
  strength: number; // -3 to +3
  type: 'bullish' | 'bearish' | 'none';
}

export interface DivergenceAlert {
  type: string;
  direction: 'bullish' | 'bearish';
  time: number;
  description: string;
  indicators: string[];
  level: number;
}

/**
 * Configuration for all 7 divergence-capable oscillators.
 * Used by checkAllOscillatorDivergence and useDivergenceScanner.
 */
export interface OscillatorConfig {
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  stochRSIPeriod: number;
  mfiPeriod: number;
  williamsRPeriod: number;
  cciPeriod: number;
}

export const DEFAULT_OSCILLATOR_CONFIG: OscillatorConfig = {
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  stochRSIPeriod: 14,
  mfiPeriod: 14,
  williamsRPeriod: 14,
  cciPeriod: 20,
};

// ==================== CORE FUNCTIONS ====================

/**
 * Detect divergence between price and indicator data
 * 
 * @param priceData - Array of price values
 * @param indicatorData - Array of indicator values
 * @param lookback - Lookback period for peak/trough detection (default: 5)
 * @returns Divergence strength: positive for bullish, negative for bearish, capped at ±3
 */
export function detectDivergence(
  priceData: number[],
  indicatorData: number[],
  lookback: number = 5
): number {
  if (priceData.length < 30 || indicatorData.length < 30) return 0;
  
  const pricePeaksTroughs = findPeaksAndTroughs(priceData, lookback);
  const indicatorPeaksTroughs = findPeaksAndTroughs(indicatorData, lookback);
  
  let bullishCount = 0;
  let bearishCount = 0;
  
  // Check for bullish divergence: price lower lows, indicator higher lows
  const recentPriceTroughs = pricePeaksTroughs.troughs.slice(-5);
  const recentIndicatorTroughs = indicatorPeaksTroughs.troughs.slice(-5);
  
  for (let i = 1; i < Math.min(recentPriceTroughs.length, recentIndicatorTroughs.length); i++) {
    const prevPriceTrough = recentPriceTroughs[i - 1];
    const currPriceTrough = recentPriceTroughs[i];
    const prevIndTrough = recentIndicatorTroughs[i - 1];
    const currIndTrough = recentIndicatorTroughs[i];
    
    if (prevPriceTrough < priceData.length && currPriceTrough < priceData.length &&
        prevIndTrough < indicatorData.length && currIndTrough < indicatorData.length) {
      // Price making lower low, indicator making higher low = bullish divergence
      if (priceData[currPriceTrough] < priceData[prevPriceTrough] &&
          indicatorData[currIndTrough] > indicatorData[prevIndTrough]) {
        bullishCount++;
      }
    }
  }
  
  // Check for bearish divergence: price higher highs, indicator lower highs
  const recentPricePeaks = pricePeaksTroughs.peaks.slice(-5);
  const recentIndicatorPeaks = indicatorPeaksTroughs.peaks.slice(-5);
  
  for (let i = 1; i < Math.min(recentPricePeaks.length, recentIndicatorPeaks.length); i++) {
    const prevPricePeak = recentPricePeaks[i - 1];
    const currPricePeak = recentPricePeaks[i];
    const prevIndPeak = recentIndicatorPeaks[i - 1];
    const currIndPeak = recentIndicatorPeaks[i];
    
    if (prevPricePeak < priceData.length && currPricePeak < priceData.length &&
        prevIndPeak < indicatorData.length && currIndPeak < indicatorData.length) {
      // Price making higher high, indicator making lower high = bearish divergence
      if (priceData[currPricePeak] > priceData[prevPricePeak] &&
          indicatorData[currIndPeak] < indicatorData[prevIndPeak]) {
        bearishCount++;
      }
    }
  }
  
  // Return net divergence: positive for bullish, negative for bearish
  // Capped at ±3 for strength scale
  if (bullishCount > bearishCount) {
    return Math.min(bullishCount, 3);
  } else if (bearishCount > bullishCount) {
    return -Math.min(bearishCount, 3);
  }
  return 0;
}

/**
 * Calculate divergence for a specific oscillator
 * 
 * @param indicator - Indicator name (RSI, MACD, OBV, StochRSI, MFI, WilliamsR, CCI, ADX)
 * @param candles - Candle data
 * @param config - Indicator configuration parameters
 * @returns Divergence result with strength and type
 */
export function getOscillatorDivergence(
  indicator: string,
  candles: CandleData[],
  config: {
    rsiPeriod: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
    stochRSIPeriod: number;
    mfiPeriod: number;
    williamsRPeriod: number;
    cciPeriod: number;
    adxPeriod: number;
  }
): DivergenceResult {
  if (candles.length < 50) return { strength: 0, type: 'none' };
  
  const priceData = candles.map(c => c.close);
  let divergence = 0;
  
  switch (indicator) {
    case 'RSI': {
      const rsiData = calculateRSI(candles, config.rsiPeriod);
      const rsiValues = rsiData.map((d: { value: number }) => d.value);
      if (rsiValues.length > 0) divergence = detectDivergence(priceData.slice(-rsiValues.length), rsiValues);
      break;
    }
    case 'MACD': {
      const { hist } = calculateMACD(candles, config.macdFast, config.macdSlow, config.macdSignal);
      const histValues = hist.map((d: { value: number }) => d.value);
      if (histValues.length > 0) divergence = detectDivergence(priceData.slice(-histValues.length), histValues);
      break;
    }
    case 'OBV': {
      const obvData = calculateOBV(candles);
      const obvValues = obvData.map((d: { value: number }) => d.value);
      if (obvValues.length > 0) divergence = detectDivergence(priceData.slice(-obvValues.length), obvValues);
      break;
    }
    case 'StochRSI': {
      const stochData = calculateStochasticRSI(candles, config.stochRSIPeriod);
      const kValues = stochData.map((d: { k: number }) => d.k);
      if (kValues.length > 0) divergence = detectDivergence(priceData.slice(-kValues.length), kValues);
      break;
    }
    case 'MFI': {
      const mfiData = calculateMFI(candles, config.mfiPeriod);
      const mfiValues = mfiData.map((d: { value: number }) => d.value);
      if (mfiValues.length > 0) divergence = detectDivergence(priceData.slice(-mfiValues.length), mfiValues);
      break;
    }
    case 'WilliamsR': {
      const wrData = calculateWilliamsR(candles, config.williamsRPeriod);
      const wrValues = wrData.map((d: { value: number }) => d.value);
      if (wrValues.length > 0) divergence = detectDivergence(priceData.slice(-wrValues.length), wrValues);
      break;
    }
    case 'CCI': {
      const cciData = calculateCCI(candles, config.cciPeriod);
      const cciValues = cciData.map((d: { value: number }) => d.value);
      if (cciValues.length > 0) divergence = detectDivergence(priceData.slice(-cciValues.length), cciValues);
      break;
    }
    case 'ADX': {
      const adxData = calculateADX(candles, config.adxPeriod);
      const adxValues = adxData.map((d: { adx: number }) => d.adx);
      if (adxValues.length > 0) divergence = detectDivergence(priceData.slice(-adxValues.length), adxValues);
      break;
    }
  }
  
  const clamped = Math.max(-3, Math.min(3, divergence));
  return { strength: clamped, type: clamped > 0 ? 'bullish' : clamped < 0 ? 'bearish' : 'none' };
}

/**
 * Detect divergences across multiple indicators for alert generation
 * 
 * @param candles - Candle data
 * @param config - Indicator configuration
 * @returns Array of divergence alerts
 */
export function detectDivergences(
  candles: CandleData[],
  config: {
    rsiPeriod: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
    mfiPeriod: number;
  }
): DivergenceAlert[] {
  if (candles.length < 20) return [];
  
  const rsiData = calculateRSI(candles, config.rsiPeriod);
  const macdData = calculateMACD(candles, config.macdFast, config.macdSlow, config.macdSignal).macd;
  const mfiData = calculateMFI(candles, config.mfiPeriod);
  const obvData = calculateOBV(candles);
  
  const divergences: DivergenceAlert[] = [];
  
  // Look for divergences in the last 20 candles
  for (let i = candles.length - 20; i < candles.length - 1; i++) {
    const indicatorsDiverging: string[] = [];
    
    // Check for bullish divergence (price making lower lows, indicator making higher lows)
    if (i >= 10 && i < candles.length - 2) {
      const priceLL = candles[i].low < candles[i-5].low && candles[i].low < candles[i+2].low;
      
      if (priceLL) {
        // RSI bullish divergence
        const rsiIdx = rsiData.findIndex((r: { time: number }) => r.time === candles[i].time);
        if (rsiIdx > 5 && rsiIdx < rsiData.length - 2) {
          if (rsiData[rsiIdx].value > rsiData[rsiIdx-5].value) {
            indicatorsDiverging.push('RSI');
          }
        }
        
        // MACD bullish divergence
        const macdIdx = macdData.findIndex((m: { time: number }) => m.time === candles[i].time);
        if (macdIdx > 5 && macdIdx < macdData.length - 2) {
          if (macdData[macdIdx].value > macdData[macdIdx-5].value) {
            indicatorsDiverging.push('MACD');
          }
        }
        
        // MFI bullish divergence
        const mfiIdx = mfiData.findIndex((m: { time: number }) => m.time === candles[i].time);
        if (mfiIdx > 5 && mfiIdx < mfiData.length - 2) {
          if (mfiData[mfiIdx].value > mfiData[mfiIdx-5].value) {
            indicatorsDiverging.push('MFI');
          }
        }
        
        // OBV bullish divergence
        const obvIdx = obvData.findIndex((o: { time: number }) => o.time === candles[i].time);
        if (obvIdx > 5 && obvIdx < obvData.length - 2) {
          if (obvData[obvIdx].value > obvData[obvIdx-5].value) {
            indicatorsDiverging.push('OBV');
          }
        }
        
        if (indicatorsDiverging.length >= 1) {
          divergences.push({
            type: 'Bullish Divergence',
            direction: 'bullish',
            time: candles[i].time as number,
            description: `Level ${indicatorsDiverging.length} bullish divergence (${indicatorsDiverging.join(', ')})`,
            indicators: indicatorsDiverging,
            level: indicatorsDiverging.length
          });
        }
      }
      
      // Check for bearish divergence (price making higher highs, indicator making lower highs)
      const priceHH = candles[i].high > candles[i-5].high && candles[i].high > candles[i+2].high;
      const bearishIndicators: string[] = [];
      
      if (priceHH) {
        // RSI bearish divergence
        const rsiIdx = rsiData.findIndex((r: { time: number }) => r.time === candles[i].time);
        if (rsiIdx > 5 && rsiIdx < rsiData.length - 2) {
          if (rsiData[rsiIdx].value < rsiData[rsiIdx-5].value) {
            bearishIndicators.push('RSI');
          }
        }
        
        // MACD bearish divergence
        const macdIdx = macdData.findIndex((m: { time: number }) => m.time === candles[i].time);
        if (macdIdx > 5 && macdIdx < macdData.length - 2) {
          if (macdData[macdIdx].value < macdData[macdIdx-5].value) {
            bearishIndicators.push('MACD');
          }
        }
        
        // MFI bearish divergence
        const mfiIdx = mfiData.findIndex((m: { time: number }) => m.time === candles[i].time);
        if (mfiIdx > 5 && mfiIdx < mfiData.length - 2) {
          if (mfiData[mfiIdx].value < mfiData[mfiIdx-5].value) {
            bearishIndicators.push('MFI');
          }
        }
        
        // OBV bearish divergence
        const obvIdx = obvData.findIndex((o: { time: number }) => o.time === candles[i].time);
        if (obvIdx > 5 && obvIdx < obvData.length - 2) {
          if (obvData[obvIdx].value < obvData[obvIdx-5].value) {
            bearishIndicators.push('OBV');
          }
        }
        
        if (bearishIndicators.length >= 1) {
          divergences.push({
            type: 'Bearish Divergence',
            direction: 'bearish',
            time: candles[i].time as number,
            description: `Level ${bearishIndicators.length} bearish divergence (${bearishIndicators.join(', ')})`,
            indicators: bearishIndicators,
            level: bearishIndicators.length
          });
        }
      }
    }
  }
  
  return divergences;
}

// ==================== MULTI-INDICATOR CONFLUENCE ====================

/**
 * Returns the Tailwind background color class for a divergence badge based on confluence count.
 * 5-7 indicators = strong (red), 3-4 = medium (orange), 1-2 = weak (yellow).
 */
const STRONG_CONFLUENCE_THRESHOLD = 5;
const MEDIUM_CONFLUENCE_THRESHOLD = 3;

export function getDivergenceBadgeColor(count: number): string {
  if (count >= STRONG_CONFLUENCE_THRESHOLD) return 'bg-red-600';
  if (count >= MEDIUM_CONFLUENCE_THRESHOLD) return 'bg-orange-500';
  return 'bg-yellow-500';
}

/**
 * Helper: get the oscillator value at a given candle index.
 * Oscillators may have fewer values than candles due to warm-up periods.
 * The oscillator values correspond to the last `values.length` candles.
 */
function getOscValueAt(values: number[], candleIdx: number, totalCandles: number): number | null {
  const offset = totalCandles - values.length;
  const oscIdx = candleIdx - offset;
  if (oscIdx < 0 || oscIdx >= values.length || values.length === 0) return null;
  return values[oscIdx];
}

/**
 * Check all 7 divergence-capable oscillators for a divergence at a given price extreme.
 *
 * @param currentIdx - Index (in candles array) of the current price peak/trough
 * @param prevIdx    - Index (in candles array) of the previous price peak/trough
 * @param type       - 'bullish' (lower low) or 'bearish' (higher high)
 * @param candles    - Candle data array
 * @param config     - Oscillator configuration parameters
 * @returns count of confirming indicators and their names
 */
export function checkAllOscillatorDivergence(
  currentIdx: number,
  prevIdx: number,
  type: 'bullish' | 'bearish',
  candles: CandleData[],
  config: OscillatorConfig
): { count: number; indicators: string[] } {
  const total = candles.length;
  const indicatorsWithDiv: string[] = [];

  function checkOsc(values: number[], name: string) {
    const curr = getOscValueAt(values, currentIdx, total);
    const prev = getOscValueAt(values, prevIdx, total);
    if (curr === null || prev === null || isNaN(curr) || isNaN(prev)) return;
    if (type === 'bearish' && curr < prev) {
      indicatorsWithDiv.push(name);
    } else if (type === 'bullish' && curr > prev) {
      indicatorsWithDiv.push(name);
    }
  }

  // RSI
  const rsiValues = calculateRSI(candles, config.rsiPeriod).map((d: { value: number }) => d.value);
  checkOsc(rsiValues, 'RSI');

  // MACD histogram
  const macdHist = calculateMACD(candles, config.macdFast, config.macdSlow, config.macdSignal)
    .hist.map((d: { value: number }) => d.value);
  checkOsc(macdHist, 'MACD');

  // Stochastic RSI (k line)
  const stochValues = calculateStochasticRSI(candles, config.stochRSIPeriod)
    .map((d: { k: number }) => d.k);
  checkOsc(stochValues, 'Stoch RSI');

  // MFI
  const mfiValues = calculateMFI(candles, config.mfiPeriod).map((d: { value: number }) => d.value);
  checkOsc(mfiValues, 'MFI');

  // Williams %R
  const wrValues = calculateWilliamsR(candles, config.williamsRPeriod)
    .map((d: { value: number }) => d.value);
  checkOsc(wrValues, 'Williams %R');

  // CCI
  const cciValues = calculateCCI(candles, config.cciPeriod).map((d: { value: number }) => d.value);
  checkOsc(cciValues, 'CCI');

  // OBV
  const obvValues = calculateOBV(candles).map((d: { value: number }) => d.value);
  checkOsc(obvValues, 'OBV');

  return { count: indicatorsWithDiv.length, indicators: indicatorsWithDiv };
}

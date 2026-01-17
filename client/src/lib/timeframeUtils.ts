/**
 * Utility functions for adaptive timeframe system
 */

import type { TimeframeInterval, TimeframeMetrics } from '@/types/timeframes';
import { TIMEFRAME_CONFIGS, TIMEFRAME_HIERARCHY, OPTIMAL_CANDLE_WIDTH, OPTIMAL_CANDLE_COUNT } from '@/constants/timeframes';

/**
 * Calculate timeframe metrics from current chart state
 */
export function calculateTimeframeMetrics(
  visibleCandleCount: number,
  chartWidth: number,
  zoomScale: number = 1
): TimeframeMetrics {
  const candleWidth = visibleCandleCount > 0 ? chartWidth / visibleCandleCount : 0;
  
  return {
    visibleCandles: visibleCandleCount,
    candleWidth,
    chartWidth,
    zoomScale
  };
}

/**
 * Determine the optimal timeframe based on current metrics
 * Returns only adjacent timeframes for smooth step-by-step transitions
 */
export function determineOptimalTimeframe(
  metrics: TimeframeMetrics,
  currentTimeframe: TimeframeInterval
): TimeframeInterval {
  const { visibleCandles, candleWidth } = metrics;
  const currentConfig = TIMEFRAME_CONFIGS[currentTimeframe];
  const currentIndex = TIMEFRAME_HIERARCHY.indexOf(currentTimeframe);
  
  // Check if current timeframe is still within acceptable range
  const isCandleWidthOk = candleWidth >= currentConfig.minCandleWidth && 
                          candleWidth <= OPTIMAL_CANDLE_WIDTH.max * 1.2;
  const isCandleCountOk = visibleCandles >= currentConfig.minCandles * 0.8 && 
                          visibleCandles <= currentConfig.maxCandles * 1.2;
  
  // If current timeframe is acceptable, keep it
  if (isCandleWidthOk && isCandleCountOk) {
    return currentTimeframe;
  }
  
  // If candles are too small/crowded, step UP to next larger timeframe
  if (candleWidth < currentConfig.minCandleWidth * 0.9 || 
      visibleCandles > currentConfig.maxCandles * 1.1) {
    const nextIndex = currentIndex + 1;
    if (nextIndex < TIMEFRAME_HIERARCHY.length) {
      return TIMEFRAME_HIERARCHY[nextIndex]; // ALWAYS adjacent step up
    }
    return currentTimeframe; // Already at largest
  }
  
  // If candles are too large/sparse, step DOWN to next smaller timeframe
  if (candleWidth > OPTIMAL_CANDLE_WIDTH.max * 1.1 || 
      visibleCandles < currentConfig.minCandles * 0.9) {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      return TIMEFRAME_HIERARCHY[prevIndex]; // ALWAYS adjacent step down
    }
    return currentTimeframe; // Already at smallest
  }
  
  // Default: keep current timeframe
  return currentTimeframe;
}

/**
 * Get the ratio between two timeframes
 * For example: 1h to 4h = 4, 15m to 1h = 4
 */
export function getTimeframeRatio(from: TimeframeInterval, to: TimeframeInterval): number {
  const timeframes: Record<TimeframeInterval, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '1h': 60,
    '4h': 240,
    '1d': 1440
  };
  
  return timeframes[to] / timeframes[from];
}

/**
 * Check if a timeframe switch should occur
 */
export function shouldSwitchTimeframe(
  currentTimeframe: TimeframeInterval,
  suggestedTimeframe: TimeframeInterval,
  metrics: TimeframeMetrics
): boolean {
  // Don't switch if already on suggested timeframe
  if (currentTimeframe === suggestedTimeframe) {
    return false;
  }
  
  const currentConfig = TIMEFRAME_CONFIGS[currentTimeframe];
  const { candleWidth, visibleCandles } = metrics;
  
  // Switch if current conditions are significantly outside optimal range
  const isTooSmall = candleWidth < currentConfig.minCandleWidth * 0.8;
  const isTooLarge = candleWidth > OPTIMAL_CANDLE_WIDTH.max * 1.2;
  const tooManyCandlewidth = visibleCandles > currentConfig.maxCandles * 1.2;
  const tooFewCandles = visibleCandles < currentConfig.minCandles * 0.8;
  
  return isTooSmall || isTooLarge || tooManyCandlewidth || tooFewCandles;
}

/**
 * Format timeframe interval for display
 */
export function formatTimeframe(interval: TimeframeInterval): string {
  return TIMEFRAME_CONFIGS[interval].displayName;
}

/**
 * Get timeframe duration in milliseconds
 */
export function getTimeframeDuration(interval: TimeframeInterval): number {
  const durations: Record<TimeframeInterval, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
  };
  
  return durations[interval];
}

/**
 * Calculate how many candles of target timeframe would fit in the time range
 */
export function calculateTimeframeCandleCount(
  sourceCandleCount: number,
  sourceInterval: TimeframeInterval,
  targetInterval: TimeframeInterval
): number {
  const ratio = getTimeframeRatio(sourceInterval, targetInterval);
  return Math.ceil(sourceCandleCount / ratio);
}

/**
 * Validate if a timeframe is supported
 */
export function isValidTimeframe(interval: string): interval is TimeframeInterval {
  return TIMEFRAME_HIERARCHY.includes(interval as TimeframeInterval);
}

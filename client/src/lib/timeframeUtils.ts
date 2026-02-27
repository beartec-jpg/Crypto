/**
 * Utility functions for adaptive timeframe system
 */

import type { TimeframeInterval, TimeframeMetrics } from '@/types/timeframes';
import { TIMEFRAME_CONFIGS, TIMEFRAME_HIERARCHY } from '@/constants/timeframes';

/**
 * Hysteresis thresholds for smooth timeframe switching
 * These prevent flickering between timeframes
 */
const SWITCH_UP_THRESHOLD_PX = 1.0; // Switch to larger timeframe when candles reach this width
const SWITCH_DOWN_THRESHOLD_PX = 8.0; // Switch to smaller timeframe when candles reach this width


/**
 * Thresholds for shouldSwitchTimeframe decision
 */
const TOO_MANY_CANDLES_MULTIPLIER = 1.2; // 20% over max
const TOO_FEW_CANDLES_MULTIPLIER = 0.7; // 30% under min
const TOO_LARGE_WIDTH_PX = 10.0; // Candles are very wide

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
 * Uses hysteresis to prevent flickering between timeframes
 * PRIMARY focus is on candle WIDTH, not count
 */
export function determineOptimalTimeframe(
  metrics: TimeframeMetrics,
  currentTimeframe: TimeframeInterval
): TimeframeInterval {
  const { candleWidth } = metrics;
  const currentIndex = TIMEFRAME_HIERARCHY.indexOf(currentTimeframe);
  if (currentIndex === -1) {
    return currentTimeframe;
  }
  
  if (candleWidth <= SWITCH_UP_THRESHOLD_PX) {
    const nextIndex = currentIndex + 1;
    if (nextIndex < TIMEFRAME_HIERARCHY.length) {
      console.log(`📊 Suggesting UP: ${currentTimeframe} → ${TIMEFRAME_HIERARCHY[nextIndex]} (width: ${candleWidth.toFixed(2)}px)`);
      return TIMEFRAME_HIERARCHY[nextIndex]; // ALWAYS adjacent step up
    }
    return currentTimeframe; // Already at largest
  }
  
  // If candles are too large/sparse, step DOWN to next smaller timeframe
  // Wide hysteresis prevents immediate switch back
  if (candleWidth >= SWITCH_DOWN_THRESHOLD_PX) {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      console.log(`📊 Suggesting DOWN: ${currentTimeframe} → ${TIMEFRAME_HIERARCHY[prevIndex]} (width: ${candleWidth.toFixed(2)}px)`);
      return TIMEFRAME_HIERARCHY[prevIndex]; // ALWAYS adjacent step down
    }
    return currentTimeframe; // Already at smallest
  }
  
  // Current timeframe is still within acceptable range (between 1px and 8px)
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
 * Uses stricter thresholds to ensure switches happen decisively
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
  
  const { candleWidth, visibleCandles } = metrics;
  const currentConfig = TIMEFRAME_CONFIGS[currentTimeframe];
  
  // Switch if current conditions are significantly outside optimal range
  // More aggressive thresholds for clearer switches
  const isTooSmall = candleWidth <= SWITCH_UP_THRESHOLD_PX; // Candles at or below 1px
  const tooManyCandles = visibleCandles > currentConfig.maxCandles * TOO_MANY_CANDLES_MULTIPLIER;
  const isTooLarge = candleWidth >= TOO_LARGE_WIDTH_PX; // Candles very wide
  const tooFewCandles = visibleCandles < currentConfig.minCandles * TOO_FEW_CANDLES_MULTIPLIER;
  
  const shouldSwitch = isTooSmall || tooManyCandles || isTooLarge || tooFewCandles;
  
  if (shouldSwitch) {
    console.log(`🔄 Switch decision: ${currentTimeframe} → ${suggestedTimeframe}`, {
      width: `${candleWidth.toFixed(2)}px`,
      candles: visibleCandles,
      reason: isTooSmall ? 'too small' : tooManyCandles ? 'too many' : isTooLarge ? 'too large' : 'too few'
    });
  }
  
  return shouldSwitch;
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
  return interval in TIMEFRAME_CONFIGS;
}

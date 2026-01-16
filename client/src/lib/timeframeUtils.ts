/**
 * Utility functions for adaptive timeframe system
 */

import type { TimeframeInterval, TimeframeMetrics, TimeframeThresholds } from '@/types/timeframes';
import { TIMEFRAME_METADATA, TIMEFRAME_ORDER, DEFAULT_THRESHOLDS } from '@/constants/timeframes';

/**
 * Get the next higher timeframe (e.g., 1h -> 4h)
 */
export function getNextHigherTimeframe(current: TimeframeInterval): TimeframeInterval | null {
  const currentOrder = TIMEFRAME_METADATA[current]?.order;
  if (currentOrder === undefined) return null;
  
  const nextTf = TIMEFRAME_ORDER.find(tf => TIMEFRAME_METADATA[tf].order > currentOrder);
  return (nextTf as TimeframeInterval) || null;
}

/**
 * Get the next lower timeframe (e.g., 1h -> 15m)
 */
export function getNextLowerTimeframe(current: TimeframeInterval): TimeframeInterval | null {
  const currentOrder = TIMEFRAME_METADATA[current]?.order;
  if (currentOrder === undefined) return null;
  
  // Find timeframes with lower order, sorted descending
  const lowerTimeframes = TIMEFRAME_ORDER.filter(tf => TIMEFRAME_METADATA[tf].order < currentOrder);
  const nextTf = lowerTimeframes[lowerTimeframes.length - 1];
  return (nextTf as TimeframeInterval) || null;
}

/**
 * Evaluate whether a timeframe change is needed based on current metrics
 * Returns the suggested timeframe or null if no change needed
 */
export function evaluateTimeframeChange(
  currentTimeframe: TimeframeInterval,
  metrics: TimeframeMetrics,
  thresholds: TimeframeThresholds = DEFAULT_THRESHOLDS
): TimeframeInterval | null {
  const { visibleCandleCount, candleWidth } = metrics;
  
  // Check if we need to zoom out (switch to higher timeframe)
  if (visibleCandleCount > thresholds.maxCandlesVisible || candleWidth < thresholds.minCandleWidth) {
    return getNextHigherTimeframe(currentTimeframe);
  }
  
  // Check if we need to zoom in (switch to lower timeframe)
  if (visibleCandleCount < thresholds.minCandlesVisible || candleWidth > thresholds.maxCandleWidth) {
    return getNextLowerTimeframe(currentTimeframe);
  }
  
  return null;
}

/**
 * Calculate candle width based on visible candles and chart width
 */
export function calculateCandleWidth(visibleCandleCount: number, chartWidth: number): number {
  if (visibleCandleCount === 0) return 0;
  return chartWidth / visibleCandleCount;
}

/**
 * Format timeframe for display
 */
export function formatTimeframe(interval: TimeframeInterval): string {
  return TIMEFRAME_METADATA[interval]?.label || interval;
}

/**
 * Get timeframe in minutes
 */
export function getTimeframeMinutes(interval: TimeframeInterval): number {
  return TIMEFRAME_METADATA[interval]?.minutes || 0;
}

/**
 * Compare two timeframes (returns -1 if a < b, 0 if equal, 1 if a > b)
 */
export function compareTimeframes(a: TimeframeInterval, b: TimeframeInterval): number {
  const orderA = TIMEFRAME_METADATA[a]?.order || 0;
  const orderB = TIMEFRAME_METADATA[b]?.order || 0;
  return orderA - orderB;
}

/**
 * Check if a timeframe is valid
 */
export function isValidTimeframe(interval: string): interval is TimeframeInterval {
  return TIMEFRAME_ORDER.includes(interval);
}

/**
 * Get all adjacent timeframes (one higher and one lower)
 */
export function getAdjacentTimeframes(current: TimeframeInterval): {
  higher: TimeframeInterval | null;
  lower: TimeframeInterval | null;
} {
  return {
    higher: getNextHigherTimeframe(current),
    lower: getNextLowerTimeframe(current),
  };
}

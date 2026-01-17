/**
 * Constants for adaptive timeframe system
 */

import type { TimeframeConfig, TimeframeInterval, AdaptiveTimeframeOptions } from '@/types/timeframes';

/**
 * Timeframe hierarchy with switching thresholds
 * Each timeframe has optimal candle count and width ranges
 * IMPORTANT: minCandleWidth ensures candles NEVER render below specified pixels
 */
export const TIMEFRAME_CONFIGS: Record<TimeframeInterval, TimeframeConfig> = {
  '1m': {
    interval: '1m',
    minCandles: 120,
    maxCandles: 250,
    minCandleWidth: 1.5, // MINIMUM 1.5px - candles never shrink below this
    displayName: '1 Minute'
  },
  '5m': {
    interval: '5m',
    minCandles: 100,
    maxCandles: 200,
    minCandleWidth: 1.5, // MINIMUM 1.5px
    displayName: '5 Minutes'
  },
  '15m': {
    interval: '15m',
    minCandles: 80,
    maxCandles: 160,
    minCandleWidth: 1.5, // MINIMUM 1.5px
    displayName: '15 Minutes'
  },
  '1h': {
    interval: '1h',
    minCandles: 60,
    maxCandles: 120,
    minCandleWidth: 1.5, // MINIMUM 1.5px
    displayName: '1 Hour'
  },
  '4h': {
    interval: '4h',
    minCandles: 40,
    maxCandles: 80,
    minCandleWidth: 1.5, // MINIMUM 1.5px
    displayName: '4 Hours'
  },
  '1d': {
    interval: '1d',
    minCandles: 30,
    maxCandles: 60,
    minCandleWidth: 1.5, // MINIMUM 1.5px
    displayName: '1 Day'
  }
};

/**
 * Ordered list of timeframes from smallest to largest
 * Only includes the timeframes used in the multi-timeframe auto-zoom feature
 */
export const TIMEFRAME_HIERARCHY: TimeframeInterval[] = [
  '15m',
  '1h',
  '4h',
  '1d'
];

/**
 * Default configuration for adaptive timeframe behavior
 */
export const DEFAULT_ADAPTIVE_OPTIONS: AdaptiveTimeframeOptions = {
  enabled: true,
  debounceDelay: 300, // Was: 500 - faster response
  enableTransitions: true,
  transitionDuration: 300, // ms for fade transitions
  enablePrefetch: true,
  cacheMaxAge: 5 * 60 * 1000 // 5 minutes
};

/**
 * Optimal candle width range for best readability
 */
export const OPTIMAL_CANDLE_WIDTH = {
  min: 6,
  max: 20,
  ideal: 10
};

/**
 * Optimal visible candle count range
 */
export const OPTIMAL_CANDLE_COUNT = {
  min: 50,
  max: 150,
  ideal: 100
};

/**
 * Get the next larger timeframe
 */
export function getNextTimeframe(current: TimeframeInterval): TimeframeInterval | null {
  const currentIndex = TIMEFRAME_HIERARCHY.indexOf(current);
  if (currentIndex === -1 || currentIndex === TIMEFRAME_HIERARCHY.length - 1) {
    return null;
  }
  return TIMEFRAME_HIERARCHY[currentIndex + 1];
}

/**
 * Get the next smaller timeframe
 */
export function getPreviousTimeframe(current: TimeframeInterval): TimeframeInterval | null {
  const currentIndex = TIMEFRAME_HIERARCHY.indexOf(current);
  if (currentIndex <= 0) {
    return null;
  }
  return TIMEFRAME_HIERARCHY[currentIndex - 1];
}

/**
 * Get adjacent timeframes (previous and next)
 */
export function getAdjacentTimeframes(current: TimeframeInterval): {
  previous: TimeframeInterval | null;
  next: TimeframeInterval | null;
} {
  return {
    previous: getPreviousTimeframe(current),
    next: getNextTimeframe(current)
  };
}

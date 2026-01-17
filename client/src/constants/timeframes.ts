/**
 * Constants for adaptive timeframe system
 */

import type { TimeframeConfig, TimeframeInterval, AdaptiveTimeframeOptions } from '@/types/timeframes';

/**
 * Timeframe hierarchy with switching thresholds
 * Each timeframe has optimal candle count and width ranges
 */
export const TIMEFRAME_CONFIGS: Record<TimeframeInterval, TimeframeConfig> = {
  '1m': {
    interval: '1m',
    minCandles: 120,  // Was: 100 - tighter threshold
    maxCandles: 250,  // Was: 300 - tighter threshold
    minCandleWidth: 3,
    displayName: '1 Minute'
  },
  '5m': {
    interval: '5m',
    minCandles: 100,  // Was: 80 - tighter threshold
    maxCandles: 200,  // Was: 250 - tighter threshold
    minCandleWidth: 4,
    displayName: '5 Minutes'
  },
  '15m': {
    interval: '15m',
    minCandles: 80,   // Was: 60 - tighter threshold
    maxCandles: 160,  // Was: 200 - tighter threshold
    minCandleWidth: 5,
    displayName: '15 Minutes'
  },
  '1h': {
    interval: '1h',
    minCandles: 60,   // Was: 40 - tighter threshold
    maxCandles: 120,  // Was: 150 - tighter threshold
    minCandleWidth: 6,
    displayName: '1 Hour'
  },
  '4h': {
    interval: '4h',
    minCandles: 40,   // Was: 30 - tighter threshold
    maxCandles: 80,   // Was: 100 - tighter threshold
    minCandleWidth: 8,
    displayName: '4 Hours'
  },
  '1d': {
    interval: '1d',
    minCandles: 30,   // Was: 20 - tighter threshold
    maxCandles: 60,   // Was: 80 - tighter threshold
    minCandleWidth: 10,
    displayName: '1 Day'
  }
};

/**
 * Ordered list of timeframes from smallest to largest
 */
export const TIMEFRAME_HIERARCHY: TimeframeInterval[] = [
  '1m',
  '5m', 
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

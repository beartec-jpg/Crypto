/**
 * Timeframe constants for adaptive timeframe system
 */

import type { TimeframeMetadata, TimeframeThresholds } from '@/types/timeframes';

/**
 * Metadata for all supported timeframes
 */
export const TIMEFRAME_METADATA: Record<string, TimeframeMetadata> = {
  '1m': { interval: '1m', label: '1 Minute', minutes: 1, order: 0 },
  '5m': { interval: '5m', label: '5 Minutes', minutes: 5, order: 1 },
  '15m': { interval: '15m', label: '15 Minutes', minutes: 15, order: 2 },
  '1h': { interval: '1h', label: '1 Hour', minutes: 60, order: 3 },
  '4h': { interval: '4h', label: '4 Hours', minutes: 240, order: 4 },
  '1d': { interval: '1d', label: '1 Day', minutes: 1440, order: 5 },
};

/**
 * Ordered list of timeframe intervals from shortest to longest
 */
export const TIMEFRAME_ORDER: string[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

/**
 * Default thresholds for timeframe switching
 * These determine when to switch to a different timeframe based on visible candles and candle width
 */
export const DEFAULT_THRESHOLDS: TimeframeThresholds = {
  minCandlesVisible: 30,   // Switch to smaller timeframe if fewer candles visible
  maxCandlesVisible: 250,  // Switch to larger timeframe if more candles visible
  minCandleWidth: 3,       // Switch to larger timeframe if candles too narrow
  maxCandleWidth: 50,      // Switch to smaller timeframe if candles too wide
};

/**
 * Timeframe-specific thresholds (optional customization per timeframe)
 */
export const TIMEFRAME_SPECIFIC_THRESHOLDS: Record<string, Partial<TimeframeThresholds>> = {
  '1m': {
    minCandlesVisible: 20,
    maxCandlesVisible: 200,
  },
  '5m': {
    minCandlesVisible: 25,
    maxCandlesVisible: 220,
  },
  '15m': {
    minCandlesVisible: 30,
    maxCandlesVisible: 240,
  },
  '1h': {
    minCandlesVisible: 30,
    maxCandlesVisible: 250,
  },
  '4h': {
    minCandlesVisible: 35,
    maxCandlesVisible: 260,
  },
  '1d': {
    minCandlesVisible: 40,
    maxCandlesVisible: 280,
  },
};

/**
 * Default options for adaptive timeframe behavior
 */
export const DEFAULT_ADAPTIVE_OPTIONS = {
  enabled: true,
  debounceDelay: 500,
  enableTransitions: true,
  transitionDuration: 300,
  enablePrefetch: true,
  cacheMaxAge: 5 * 60 * 1000, // 5 minutes
};

/**
 * Minimum time between automatic timeframe changes (milliseconds)
 * Prevents rapid switching
 */
export const MIN_CHANGE_INTERVAL = 1000; // 1 second

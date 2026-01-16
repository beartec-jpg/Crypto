/**
 * Timeframe-related type definitions for adaptive timeframe system
 */

/**
 * Supported timeframe intervals
 */
export type TimeframeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

/**
 * Timeframe metadata including ordering and display properties
 */
export interface TimeframeMetadata {
  interval: TimeframeInterval;
  label: string;
  minutes: number;
  order: number;
}

/**
 * Options for configuring adaptive timeframe behavior
 */
export interface AdaptiveTimeframeOptions {
  enabled: boolean;
  debounceDelay: number;
  enableTransitions: boolean;
  transitionDuration: number;
  enablePrefetch: boolean;
  cacheMaxAge: number;
}

/**
 * Thresholds for determining when to switch timeframes
 */
export interface TimeframeThresholds {
  minCandlesVisible: number;
  maxCandlesVisible: number;
  minCandleWidth: number;
  maxCandleWidth: number;
}

/**
 * Current state of the adaptive timeframe system
 */
export interface AdaptiveTimeframeState {
  currentTimeframe: TimeframeInterval;
  previousTimeframe: TimeframeInterval | null;
  suggestedTimeframe: TimeframeInterval | null;
  isTransitioning: boolean;
  isAdaptiveMode: boolean;
  lastChangeTime: number;
}

/**
 * Metrics used for timeframe decision making
 */
export interface TimeframeMetrics {
  visibleCandleCount: number;
  chartWidth: number;
  candleWidth: number;
  zoomScale: number;
}

/**
 * Cached data for a specific timeframe
 */
export interface CachedTimeframeData {
  interval: TimeframeInterval;
  data: any[];
  timestamp: number;
}

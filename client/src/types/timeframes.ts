/**
 * Types for adaptive timeframe system
 */

/**
 * Supported timeframe intervals
 */
export type TimeframeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

/**
 * Configuration for a timeframe with switching thresholds
 */
export interface TimeframeConfig {
  /** Interval identifier */
  interval: TimeframeInterval;
  /** Minimum candles visible to switch to this timeframe */
  minCandles: number;
  /** Maximum candles visible to switch to this timeframe */
  maxCandles: number;
  /** Minimum candle width in pixels */
  minCandleWidth: number;
  /** Display name */
  displayName: string;
}

/**
 * State of the adaptive timeframe system
 */
export interface AdaptiveTimeframeState {
  /** Currently active timeframe */
  currentTimeframe: TimeframeInterval;
  /** Whether adaptive mode is enabled */
  adaptiveMode: boolean;
  /** Whether a transition is in progress */
  isTransitioning: boolean;
  /** Previous timeframe (for transitions) */
  previousTimeframe: TimeframeInterval | null;
  /** Suggested timeframe based on zoom level */
  suggestedTimeframe: TimeframeInterval | null;
  /** User's preferred base timeframe */
  baseTimeframe: TimeframeInterval;
}

/**
 * Cached data for a specific timeframe
 */
export interface TimeframeCache {
  /** Timeframe interval */
  interval: TimeframeInterval;
  /** Cached candle data */
  data: any[];
  /** Timestamp when data was fetched */
  fetchedAt: number;
  /** Whether data is currently being fetched */
  isFetching: boolean;
}

/**
 * Configuration options for adaptive timeframe behavior
 */
export interface AdaptiveTimeframeOptions {
  /** Enable/disable adaptive mode */
  enabled: boolean;
  /** Debounce delay in ms for timeframe switches */
  debounceDelay: number;
  /** Enable transition animations */
  enableTransitions: boolean;
  /** Transition duration in ms */
  transitionDuration: number;
  /** Enable pre-fetching of adjacent timeframes */
  enablePrefetch: boolean;
  /** Maximum age of cached data in ms */
  cacheMaxAge: number;
}

/**
 * Metrics for timeframe analysis
 */
export interface TimeframeMetrics {
  /** Number of visible candles */
  visibleCandles: number;
  /** Average candle width in pixels */
  candleWidth: number;
  /** Chart width in pixels */
  chartWidth: number;
  /** Current zoom scale */
  zoomScale: number;
}

/**
 * Transition information
 */
export interface TimeframeTransition {
  /** Previous timeframe */
  from: TimeframeInterval;
  /** New timeframe */
  to: TimeframeInterval;
  /** Transition start timestamp */
  startedAt: number;
  /** Transition completion percentage (0-1) */
  progress: number;
}

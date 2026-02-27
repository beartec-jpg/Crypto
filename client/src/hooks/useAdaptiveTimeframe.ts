/**
 * Adaptive timeframe hook - automatically switches timeframes based on zoom level
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { 
  TimeframeInterval, 
  AdaptiveTimeframeState, 
  AdaptiveTimeframeOptions,
  TimeframeCache,
  TimeframeMetrics
} from '@/types/timeframes';
import { 
  calculateTimeframeMetrics,
  determineOptimalTimeframe,
  shouldSwitchTimeframe,
  getTimeframeDuration
} from '@/lib/timeframeUtils';
import { DEFAULT_ADAPTIVE_OPTIONS, getAdjacentTimeframes } from '@/constants/timeframes';
import { TIMEFRAME_CONFIGS, TIMEFRAME_HIERARCHY } from '@/constants/timeframes';

interface UseAdaptiveTimeframeProps {
  /** Current symbol being viewed */
  symbol: string;
  /** Base/preferred timeframe */
  baseTimeframe: TimeframeInterval;
  /** Number of visible candles */
  visibleCandleCount: number;
  /** Chart width in pixels */
  chartWidth: number;
  /** Current zoom scale */
  zoomScale?: number;
  /** Configuration options */
  options?: Partial<AdaptiveTimeframeOptions>;
  /** Callback when timeframe changes */
  onTimeframeChange?: (newTimeframe: TimeframeInterval, previousTimeframe: TimeframeInterval) => void;
}

interface UseAdaptiveTimeframeReturn {
  /** Current adaptive timeframe state */
  state: AdaptiveTimeframeState;
  /** Current timeframe interval */
  currentTimeframe: TimeframeInterval;
  /** Whether adaptive mode is enabled */
  isAdaptiveMode: boolean;
  /** Whether currently transitioning */
  isTransitioning: boolean;
  /** Cached data for timeframes */
  cache: Map<TimeframeInterval, TimeframeCache>;
  /** Enable/disable adaptive mode */
  setAdaptiveMode: (enabled: boolean) => void;
  /** Manually set timeframe (disables adaptive mode temporarily) */
  setManualTimeframe: (timeframe: TimeframeInterval) => void;
  /** Force a timeframe evaluation */
  evaluateTimeframe: () => void;
  /** Clear cache for a specific timeframe */
  clearCache: (timeframe?: TimeframeInterval) => void;
  /** Get cached data for a timeframe */
  getCachedData: (timeframe: TimeframeInterval) => any[] | null;
  /** Set cached data for a timeframe */
  setCachedData: (timeframe: TimeframeInterval, data: any[]) => void;
}

/**
 * Hook for adaptive timeframe management
 */
export function useAdaptiveTimeframe(props: UseAdaptiveTimeframeProps): UseAdaptiveTimeframeReturn {
  const {
    symbol,
    baseTimeframe,
    visibleCandleCount,
    chartWidth,
    zoomScale = 1,
    options = {},
    onTimeframeChange
  } = props;

  // Merge options with defaults
  const config = useMemo(() => ({
    ...DEFAULT_ADAPTIVE_OPTIONS,
    ...options
  }), [options]);

  // State management
  const [state, setState] = useState<AdaptiveTimeframeState>({
    currentTimeframe: baseTimeframe,
    adaptiveMode: config.enabled,
    isTransitioning: false,
    previousTimeframe: null,
    suggestedTimeframe: null,
    baseTimeframe
  });

  // Cache management
  const [cache] = useState<Map<TimeframeInterval, TimeframeCache>>(() => new Map());

  // Refs for debouncing and tracking
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastEvaluationRef = useRef<number>(0);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Calculate current metrics
   */
  const metrics = useMemo<TimeframeMetrics>(() => 
    calculateTimeframeMetrics(visibleCandleCount, chartWidth, zoomScale),
    [visibleCandleCount, chartWidth, zoomScale]
  );

  /**
   * Clear cache for a specific timeframe or all
   */
  const clearCache = useCallback((timeframe?: TimeframeInterval) => {
    if (timeframe) {
      cache.delete(timeframe);
    } else {
      cache.clear();
    }
  }, [cache]);

  /**
   * Get cached data for a timeframe
   */
  const getCachedData = useCallback((timeframe: TimeframeInterval): any[] | null => {
    const cached = cache.get(timeframe);
    if (!cached) return null;
    
    // Check if cache is still valid
    const age = Date.now() - cached.fetchedAt;
    if (age > config.cacheMaxAge) {
      cache.delete(timeframe);
      return null;
    }
    
    return cached.data;
  }, [cache, config.cacheMaxAge]);

  /**
   * Set cached data for a timeframe
   */
  const setCachedData = useCallback((timeframe: TimeframeInterval, data: any[]) => {
    cache.set(timeframe, {
      interval: timeframe,
      data,
      fetchedAt: Date.now(),
      isFetching: false
    });
  }, [cache]);

  /**
   * Start a transition to a new timeframe
   */
  const startTransition = useCallback((newTimeframe: TimeframeInterval) => {
    if (newTimeframe === state.currentTimeframe) return;

    setState(prev => ({
      ...prev,
      isTransitioning: true,
      previousTimeframe: prev.currentTimeframe,
      currentTimeframe: newTimeframe
    }));

    // Call callback
    if (onTimeframeChange) {
      onTimeframeChange(newTimeframe, state.currentTimeframe);
    }

    // End transition after duration
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    if (config.enableTransitions) {
      transitionTimerRef.current = setTimeout(() => {
        setState(prev => ({
          ...prev,
          isTransitioning: false,
          previousTimeframe: null
        }));
      }, config.transitionDuration);
    } else {
      setState(prev => ({
        ...prev,
        isTransitioning: false,
        previousTimeframe: null
      }));
    }
  }, [state.currentTimeframe, config.enableTransitions, config.transitionDuration, onTimeframeChange]);

  /**
   * Evaluate and potentially switch timeframe
   */
  const evaluateTimeframe = useCallback(() => {
    if (!state.adaptiveMode) return;

    let suggestedTimeframe = determineOptimalTimeframe(metrics, state.currentTimeframe);

    // Fallback: when width-based hysteresis suggests no change, still react to extreme
    // candle-count pressure to keep adaptive mode responsive.
    if (suggestedTimeframe === state.currentTimeframe) {
      const configForTf = TIMEFRAME_CONFIGS[state.currentTimeframe];
      const currentIndex = TIMEFRAME_HIERARCHY.indexOf(state.currentTimeframe);

      if (configForTf && currentIndex !== -1) {
        const tooManyCandles = metrics.visibleCandles > configForTf.maxCandles * 1.2;
        const tooFewCandles = metrics.visibleCandles < configForTf.minCandles * 0.8;

        if (tooManyCandles && currentIndex < TIMEFRAME_HIERARCHY.length - 1) {
          suggestedTimeframe = TIMEFRAME_HIERARCHY[currentIndex + 1];
        } else if (tooFewCandles && currentIndex > 0) {
          suggestedTimeframe = TIMEFRAME_HIERARCHY[currentIndex - 1];
        }
      }
    }
    
    setState(prev => ({
      ...prev,
      suggestedTimeframe
    }));

    // Check if we should switch
    if (shouldSwitchTimeframe(state.currentTimeframe, suggestedTimeframe, metrics)) {
      console.log(`📊 Adaptive timeframe switch: ${state.currentTimeframe} → ${suggestedTimeframe}`, metrics);
      startTransition(suggestedTimeframe);
    }
  }, [state.adaptiveMode, state.currentTimeframe, metrics, startTransition]);

  /**
   * Debounced timeframe evaluation
   */
  const debouncedEvaluate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      evaluateTimeframe();
      lastEvaluationRef.current = Date.now();
    }, config.debounceDelay);
  }, [evaluateTimeframe, config.debounceDelay]);

  /**
   * Enable/disable adaptive mode
   */
  const setAdaptiveMode = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      adaptiveMode: enabled
    }));

    if (enabled) {
      // Immediately evaluate when enabling
      evaluateTimeframe();
    }
  }, [evaluateTimeframe]);

  /**
   * Manually set timeframe (temporarily disables adaptive mode)
   */
  const setManualTimeframe = useCallback((timeframe: TimeframeInterval) => {
    setState(prev => ({
      ...prev,
      currentTimeframe: timeframe,
      adaptiveMode: false, // Disable adaptive mode on manual change
      previousTimeframe: prev.currentTimeframe,
      suggestedTimeframe: null
    }));

    if (onTimeframeChange) {
      onTimeframeChange(timeframe, state.currentTimeframe);
    }
  }, [state.currentTimeframe, onTimeframeChange]);

  /**
   * Pre-fetch adjacent timeframes if enabled
   */
  useEffect(() => {
    if (!config.enablePrefetch || !state.adaptiveMode) return;

    const { previous, next } = getAdjacentTimeframes(state.currentTimeframe);
    const timeframesToPrefetch = [previous, next].filter(Boolean) as TimeframeInterval[];

    // Mark timeframes for prefetching (actual fetching would be done by the consumer)
    timeframesToPrefetch.forEach(tf => {
      const cached = cache.get(tf);
      if (!cached || Date.now() - cached.fetchedAt > config.cacheMaxAge) {
        // Set a placeholder to indicate prefetch is needed
        cache.set(tf, {
          interval: tf,
          data: [],
          fetchedAt: 0,
          isFetching: true
        });
      }
    });
  }, [state.currentTimeframe, state.adaptiveMode, config.enablePrefetch, config.cacheMaxAge, cache]);

  /**
   * Evaluate timeframe when metrics change
   */
  useEffect(() => {
    if (state.adaptiveMode && visibleCandleCount > 0 && chartWidth > 0) {
      debouncedEvaluate();
    }
  }, [visibleCandleCount, chartWidth, zoomScale, state.adaptiveMode, debouncedEvaluate]);

  /**
   * Update base timeframe when it changes
   */
  useEffect(() => {
    setState(prev => ({
      ...prev,
      baseTimeframe
    }));
  }, [baseTimeframe]);

  /**
   * Cleanup timers on unmount
   */
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  return {
    state,
    currentTimeframe: state.currentTimeframe,
    isAdaptiveMode: state.adaptiveMode,
    isTransitioning: state.isTransitioning,
    cache,
    setAdaptiveMode,
    setManualTimeframe,
    evaluateTimeframe,
    clearCache,
    getCachedData,
    setCachedData
  };
}

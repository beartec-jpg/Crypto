/**
 * Hook for managing adaptive timeframe switching based on zoom level and visible candles
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  TimeframeInterval,
  AdaptiveTimeframeOptions,
  AdaptiveTimeframeState,
  TimeframeMetrics,
  CachedTimeframeData,
} from '@/types/timeframes';
import {
  evaluateTimeframeChange,
  calculateCandleWidth,
  isValidTimeframe,
} from '@/lib/timeframeUtils';
import { DEFAULT_ADAPTIVE_OPTIONS, MIN_CHANGE_INTERVAL } from '@/constants/timeframes';

interface UseAdaptiveTimeframeProps {
  symbol: string;
  baseTimeframe: TimeframeInterval;
  visibleCandleCount: number;
  chartWidth: number;
  zoomScale: number;
  options?: Partial<AdaptiveTimeframeOptions>;
  onTimeframeChange?: (newTimeframe: TimeframeInterval, oldTimeframe: TimeframeInterval) => void;
}

interface UseAdaptiveTimeframeReturn {
  currentTimeframe: TimeframeInterval;
  isAdaptiveMode: boolean;
  isTransitioning: boolean;
  state: AdaptiveTimeframeState;
  setAdaptiveMode: (enabled: boolean) => void;
  setManualTimeframe: (timeframe: TimeframeInterval) => void;
  getCachedData: (interval: TimeframeInterval) => any[] | null;
  setCachedData: (interval: TimeframeInterval, data: any[]) => void;
  clearCache: () => void;
}

export function useAdaptiveTimeframe({
  symbol,
  baseTimeframe,
  visibleCandleCount,
  chartWidth,
  zoomScale,
  options: userOptions = {},
  onTimeframeChange,
}: UseAdaptiveTimeframeProps): UseAdaptiveTimeframeReturn {
  const options = { ...DEFAULT_ADAPTIVE_OPTIONS, ...userOptions };
  
  // State management
  const [state, setState] = useState<AdaptiveTimeframeState>({
    currentTimeframe: baseTimeframe,
    previousTimeframe: null,
    suggestedTimeframe: null,
    isTransitioning: false,
    isAdaptiveMode: options.enabled,
    lastChangeTime: 0,
  });

  // Cache management
  const cacheRef = useRef<Map<string, CachedTimeframeData>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  /**
   * Get cached data for a specific interval
   */
  const getCachedData = useCallback((interval: TimeframeInterval): any[] | null => {
    const cacheKey = `${symbol}-${interval}`;
    const cached = cacheRef.current.get(cacheKey);
    
    if (!cached) return null;
    
    // Check if cache is still valid
    const age = Date.now() - cached.timestamp;
    if (age > options.cacheMaxAge) {
      cacheRef.current.delete(cacheKey);
      return null;
    }
    
    return cached.data;
  }, [symbol, options.cacheMaxAge]);

  /**
   * Store data in cache
   */
  const setCachedData = useCallback((interval: TimeframeInterval, data: any[]) => {
    const cacheKey = `${symbol}-${interval}`;
    cacheRef.current.set(cacheKey, {
      interval,
      data,
      timestamp: Date.now(),
    });
  }, [symbol]);

  /**
   * Clear all cached data
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  /**
   * Enable or disable adaptive mode
   */
  const setAdaptiveMode = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      isAdaptiveMode: enabled,
      suggestedTimeframe: null,
    }));
  }, []);

  /**
   * Manually set a timeframe (temporarily disables adaptive mode)
   */
  const setManualTimeframe = useCallback((timeframe: TimeframeInterval) => {
    if (!isValidTimeframe(timeframe)) {
      console.warn(`Invalid timeframe: ${timeframe}`);
      return;
    }

    setState(prev => ({
      ...prev,
      currentTimeframe: timeframe,
      previousTimeframe: prev.currentTimeframe,
      isAdaptiveMode: false,
      suggestedTimeframe: null,
      lastChangeTime: Date.now(),
    }));
  }, []);

  /**
   * Perform timeframe change with transition
   */
  const changeTimeframe = useCallback((newTimeframe: TimeframeInterval) => {
    const oldTimeframe = state.currentTimeframe;
    
    // Check minimum change interval
    const timeSinceLastChange = Date.now() - state.lastChangeTime;
    if (timeSinceLastChange < MIN_CHANGE_INTERVAL) {
      console.log(`⏭️ Skipping timeframe change (too soon: ${timeSinceLastChange}ms)`);
      return;
    }

    setState(prev => ({
      ...prev,
      currentTimeframe: newTimeframe,
      previousTimeframe: oldTimeframe,
      isTransitioning: options.enableTransitions,
      lastChangeTime: Date.now(),
      suggestedTimeframe: null,
    }));

    // Call callback if provided
    if (onTimeframeChange) {
      onTimeframeChange(newTimeframe, oldTimeframe);
    }

    // Clear transition state after duration
    if (options.enableTransitions) {
      setTimeout(() => {
        setState(prev => ({ ...prev, isTransitioning: false }));
      }, options.transitionDuration);
    }
  }, [state.currentTimeframe, state.lastChangeTime, options, onTimeframeChange]);

  /**
   * Evaluate metrics and determine if timeframe change is needed
   */
  useEffect(() => {
    // Only evaluate if adaptive mode is enabled
    if (!state.isAdaptiveMode) {
      return;
    }

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the evaluation
    debounceTimerRef.current = setTimeout(() => {
      const candleWidth = calculateCandleWidth(visibleCandleCount, chartWidth);
      
      const metrics: TimeframeMetrics = {
        visibleCandleCount,
        chartWidth,
        candleWidth,
        zoomScale,
      };

      const suggestedTimeframe = evaluateTimeframeChange(
        state.currentTimeframe,
        metrics
      );

      if (suggestedTimeframe && suggestedTimeframe !== state.currentTimeframe) {
        console.log(`📊 Suggesting timeframe change: ${state.currentTimeframe} → ${suggestedTimeframe}`);
        setState(prev => ({ ...prev, suggestedTimeframe }));
        
        // Auto-apply if adaptive mode is enabled
        changeTimeframe(suggestedTimeframe);
      }
    }, options.debounceDelay);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    state.isAdaptiveMode,
    state.currentTimeframe,
    visibleCandleCount,
    chartWidth,
    zoomScale,
    options.debounceDelay,
    changeTimeframe,
  ]);

  // Update current timeframe when base timeframe changes (external control)
  useEffect(() => {
    if (baseTimeframe !== state.currentTimeframe && !state.isAdaptiveMode) {
      setState(prev => ({
        ...prev,
        currentTimeframe: baseTimeframe,
        previousTimeframe: prev.currentTimeframe,
      }));
    }
  }, [baseTimeframe, state.currentTimeframe, state.isAdaptiveMode]);

  return {
    currentTimeframe: state.currentTimeframe,
    isAdaptiveMode: state.isAdaptiveMode,
    isTransitioning: state.isTransitioning,
    state,
    setAdaptiveMode,
    setManualTimeframe,
    getCachedData,
    setCachedData,
    clearCache,
  };
}

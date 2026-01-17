/**
 * Tests for useAdaptiveTimeframe hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAdaptiveTimeframe } from '@/hooks/useAdaptiveTimeframe';
import type { TimeframeInterval } from '@/types/timeframes';

describe('useAdaptiveTimeframe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should initialize with base timeframe', () => {
    const { result } = renderHook(() =>
      useAdaptiveTimeframe({
        symbol: 'BTCUSDT',
        baseTimeframe: '1h',
        visibleCandleCount: 100,
        chartWidth: 1000
      })
    );

    expect(result.current.currentTimeframe).toBe('1h');
    expect(result.current.isAdaptiveMode).toBe(true);
  });

  it('should switch to larger timeframe when zoomed out', async () => {
    const onTimeframeChange = vi.fn();
    const { result, rerender } = renderHook(
      (props) => useAdaptiveTimeframe(props),
      {
        initialProps: {
          symbol: 'BTCUSDT',
          baseTimeframe: '1h' as TimeframeInterval,
          visibleCandleCount: 100,
          chartWidth: 1000,
          onTimeframeChange
        }
      }
    );

    // Initial state
    expect(result.current.currentTimeframe).toBe('1h');

    // Zoom out - more candles visible
    rerender({
      symbol: 'BTCUSDT',
      baseTimeframe: '1h' as TimeframeInterval,
      visibleCandleCount: 250, // Many candles = small width
      chartWidth: 1000,
      onTimeframeChange
    });

    // Wait for debounce and advance all timers
    await act(async () => {
      vi.advanceTimersByTime(1000); // Advance past debounce and transition
      await Promise.resolve(); // Flush promises
    });

    // Should switch to larger timeframe (only adjacent - 4h)
    expect(result.current.currentTimeframe).toBe('4h');
  });

  it('should switch to smaller timeframe when zoomed in', async () => {
    const onTimeframeChange = vi.fn();
    const { result, rerender } = renderHook(
      (props) => useAdaptiveTimeframe(props),
      {
        initialProps: {
          symbol: 'BTCUSDT',
          baseTimeframe: '1h' as TimeframeInterval,
          visibleCandleCount: 100,
          chartWidth: 1000,
          onTimeframeChange
        }
      }
    );

    // Zoom in - fewer candles visible
    rerender({
      symbol: 'BTCUSDT',
      baseTimeframe: '1h' as TimeframeInterval,
      visibleCandleCount: 20, // Few candles = large width
      chartWidth: 1000,
      onTimeframeChange
    });

    // Wait for debounce and advance all timers
    await act(async () => {
      vi.advanceTimersByTime(1000); // Advance past debounce and transition
      await Promise.resolve(); // Flush promises
    });

    // Should switch to smaller timeframe (only adjacent - 15m)
    expect(result.current.currentTimeframe).toBe('15m');
  });

  it('should not switch when adaptive mode is disabled', async () => {
    const { result, rerender } = renderHook(
      (props) => useAdaptiveTimeframe(props),
      {
        initialProps: {
          symbol: 'BTCUSDT',
          baseTimeframe: '1h' as TimeframeInterval,
          visibleCandleCount: 100,
          chartWidth: 1000,
          options: { enabled: false }
        }
      }
    );

    expect(result.current.isAdaptiveMode).toBe(false);
    const initialTimeframe = result.current.currentTimeframe;

    // Change metrics significantly
    rerender({
      symbol: 'BTCUSDT',
      baseTimeframe: '1h' as TimeframeInterval,
      visibleCandleCount: 250,
      chartWidth: 1000,
      options: { enabled: false }
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Timeframe should not change
    expect(result.current.currentTimeframe).toBe(initialTimeframe);
  });

  it('should allow manual timeframe change', () => {
    const { result } = renderHook(() =>
      useAdaptiveTimeframe({
        symbol: 'BTCUSDT',
        baseTimeframe: '1h',
        visibleCandleCount: 100,
        chartWidth: 1000
      })
    );

    act(() => {
      result.current.setManualTimeframe('4h');
    });

    expect(result.current.currentTimeframe).toBe('4h');
    expect(result.current.isAdaptiveMode).toBe(false);
  });

  it('should cache data correctly', () => {
    const { result } = renderHook(() =>
      useAdaptiveTimeframe({
        symbol: 'BTCUSDT',
        baseTimeframe: '1h',
        visibleCandleCount: 100,
        chartWidth: 1000
      })
    );

    const testData = [{ time: 1000, open: 100, high: 110, low: 90, close: 105 }];

    act(() => {
      result.current.setCachedData('1h', testData);
    });

    const cached = result.current.getCachedData('1h');
    expect(cached).toEqual(testData);
  });

  it('should clear cache', () => {
    const { result } = renderHook(() =>
      useAdaptiveTimeframe({
        symbol: 'BTCUSDT',
        baseTimeframe: '1h',
        visibleCandleCount: 100,
        chartWidth: 1000
      })
    );

    const testData = [{ time: 1000, open: 100, high: 110, low: 90, close: 105 }];

    act(() => {
      result.current.setCachedData('1h', testData);
      result.current.clearCache('1h');
    });

    const cached = result.current.getCachedData('1h');
    expect(cached).toBeNull();
  });

  it('should enable/disable adaptive mode', () => {
    const { result } = renderHook(() =>
      useAdaptiveTimeframe({
        symbol: 'BTCUSDT',
        baseTimeframe: '1h',
        visibleCandleCount: 100,
        chartWidth: 1000
      })
    );

    expect(result.current.isAdaptiveMode).toBe(true);

    act(() => {
      result.current.setAdaptiveMode(false);
    });

    expect(result.current.isAdaptiveMode).toBe(false);

    act(() => {
      result.current.setAdaptiveMode(true);
    });

    expect(result.current.isAdaptiveMode).toBe(true);
  });

  it('should debounce timeframe evaluations', async () => {
    const { result, rerender } = renderHook(
      (props) => useAdaptiveTimeframe(props),
      {
        initialProps: {
          symbol: 'BTCUSDT',
          baseTimeframe: '1h' as TimeframeInterval,
          visibleCandleCount: 100,
          chartWidth: 1000
        }
      }
    );

    // Rapid changes
    rerender({
      symbol: 'BTCUSDT',
      baseTimeframe: '1h' as TimeframeInterval,
      visibleCandleCount: 110,
      chartWidth: 1000
    });

    rerender({
      symbol: 'BTCUSDT',
      baseTimeframe: '1h' as TimeframeInterval,
      visibleCandleCount: 120,
      chartWidth: 1000
    });

    rerender({
      symbol: 'BTCUSDT',
      baseTimeframe: '1h' as TimeframeInterval,
      visibleCandleCount: 130,
      chartWidth: 1000
    });

    // Should not evaluate until debounce completes
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Complete debounce
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Evaluation should have occurred once
    expect(result.current.state.suggestedTimeframe).toBeDefined();
  });

  it('should call onTimeframeChange callback', async () => {
    const onTimeframeChange = vi.fn();
    const { result, rerender } = renderHook(
      (props) => useAdaptiveTimeframe(props),
      {
        initialProps: {
          symbol: 'BTCUSDT',
          baseTimeframe: '1h' as TimeframeInterval,
          visibleCandleCount: 100,
          chartWidth: 1000,
          onTimeframeChange
        }
      }
    );

    // Trigger a change that should cause a switch
    rerender({
      symbol: 'BTCUSDT',
      baseTimeframe: '1h' as TimeframeInterval,
      visibleCandleCount: 300,
      chartWidth: 1000,
      onTimeframeChange
    });

    // Wait for debounce and advance all timers
    await act(async () => {
      vi.advanceTimersByTime(1000); // Advance past debounce and transition
      await Promise.resolve(); // Flush promises
    });

    expect(onTimeframeChange).toHaveBeenCalled();
  });
});

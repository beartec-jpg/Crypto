import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLiquidityDetection } from '@/hooks/useLiquidityDetection';
import { DEFAULT_LIQUIDITY_SETTINGS } from '@/types/liquidity';
import type { Candle } from '@/types/candle';

/** Build a simple candle array with controlled highs/lows */
function makeCandles(count: number, basePrice: number = 100): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: 1000 + i * 60,
    open: basePrice,
    high: basePrice + 1,
    low: basePrice - 1,
    close: basePrice,
    volume: 1000,
  }));
}

describe('useLiquidityDetection', () => {
  it('returns empty array when disabled', () => {
    const candles = makeCandles(20);
    const { result } = renderHook(() =>
      useLiquidityDetection({
        candles,
        settings: { ...DEFAULT_LIQUIDITY_SETTINGS, enabled: false },
      }),
    );
    expect(result.current).toEqual([]);
  });

  it('returns empty array for insufficient candles', () => {
    const candles = makeCandles(5);
    const { result } = renderHook(() =>
      useLiquidityDetection({
        candles,
        settings: DEFAULT_LIQUIDITY_SETTINGS,
      }),
    );
    expect(result.current).toEqual([]);
  });

  it('detects equal highs forming a liquidity zone', () => {
    // Create candles with 3 swing highs at the same price
    const candles: Candle[] = [
      // Initial padding
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1000 + i * 60,
        open: 100, high: 101, low: 99, close: 100, volume: 1000,
      })),
      // Swing high 1 at 110
      { time: 1300, open: 100, high: 110, low: 99, close: 100, volume: 1000 },
      // 5 lower candles
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1360 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
      // Swing high 2 at 110.1 (within 0.15% threshold of 110)
      { time: 1660, open: 100, high: 110.1, low: 99, close: 100, volume: 1000 },
      // 5 lower candles
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1720 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
    ];

    const { result } = renderHook(() =>
      useLiquidityDetection({
        candles,
        settings: {
          ...DEFAULT_LIQUIDITY_SETTINGS,
          equalThreshold: 0.15,
          minTouches: 2,
        },
      }),
    );

    const highZones = result.current.filter(z => z.type === 'high');
    expect(highZones.length).toBeGreaterThanOrEqual(1);
    const zone = highZones[0];
    expect(zone.touchTimes.length).toBeGreaterThanOrEqual(2);
    expect(zone.swept).toBe(false);
  });

  it('detects sweep of a liquidity zone', () => {
    // Equal highs at ~110, then a candle that wicks above but closes below
    const candles: Candle[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1000 + i * 60,
        open: 100, high: 101, low: 99, close: 100, volume: 1000,
      })),
      // Swing high 1 at 110
      { time: 1300, open: 100, high: 110, low: 99, close: 100, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1360 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
      // Swing high 2 at 110.05 (within threshold)
      { time: 1660, open: 100, high: 110.05, low: 99, close: 100, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1720 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
      // Sweep candle: wick above 110, close below 110
      { time: 2020, open: 109, high: 111, low: 108, close: 109, volume: 2000 },
      ...Array.from({ length: 3 }, (_, i) => ({
        time: 2080 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
    ];

    const { result } = renderHook(() =>
      useLiquidityDetection({
        candles,
        settings: {
          ...DEFAULT_LIQUIDITY_SETTINGS,
          equalThreshold: 0.15,
          minTouches: 2,
          showSwept: true,
        },
      }),
    );

    const highZones = result.current.filter(z => z.type === 'high');
    const sweptZone = highZones.find(z => z.swept);
    expect(sweptZone).toBeDefined();
    expect(sweptZone?.sweepTime).toBe(2020);
    expect(sweptZone?.sweepPrice).toBe(111);
  });

  it('hides swept zones when showSwept is false', () => {
    const candles: Candle[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1000 + i * 60,
        open: 100, high: 101, low: 99, close: 100, volume: 1000,
      })),
      { time: 1300, open: 100, high: 110, low: 99, close: 100, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1360 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
      { time: 1660, open: 100, high: 110.05, low: 99, close: 100, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1720 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
      // Sweep candle
      { time: 2020, open: 109, high: 111, low: 108, close: 109, volume: 2000 },
      ...Array.from({ length: 3 }, (_, i) => ({
        time: 2080 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
    ];

    const { result } = renderHook(() =>
      useLiquidityDetection({
        candles,
        settings: {
          ...DEFAULT_LIQUIDITY_SETTINGS,
          equalThreshold: 0.15,
          minTouches: 2,
          showSwept: false,
        },
      }),
    );

    // Swept zones should be excluded
    const sweptZones = result.current.filter(z => z.swept);
    expect(sweptZones.length).toBe(0);
  });
});

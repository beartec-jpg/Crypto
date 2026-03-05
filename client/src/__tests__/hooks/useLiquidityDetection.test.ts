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
    // Equal highs at ~110, then a candle that wicks above (sweep wick),
    // confirmed by the next candle closing back below the level.
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
      // Wick candle: wicks above the level — sweep confirmation starts here
      { time: 2020, open: 109, high: 111, low: 108, close: 109, volume: 2000 },
      // Confirmation candles — first close below level confirms the sweep
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
    // sweepTime is the first confirmation candle after the wick
    expect(sweptZone?.sweepTime).toBe(2080);
    // sweepPrice is the wick extreme of the wick candle
    expect(sweptZone?.sweepPrice).toBe(111);
  });

  it('does NOT group equal highs when price closed above the level between touches', () => {
    // Two swing highs at ~100, but a candle closes at 105 (above level) between them
    const candles: Candle[] = [
      // Padding
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1000 + i * 60,
        open: 95, high: 96, low: 94, close: 95, volume: 1000,
      })),
      // Swing high 1 at 100
      { time: 1300, open: 95, high: 100, low: 94, close: 95, volume: 1000 },
      // Candles between: one closes ABOVE 100 (breakthrough)
      { time: 1360, open: 100, high: 106, low: 99, close: 105, volume: 1000 },
      ...Array.from({ length: 4 }, (_, i) => ({
        time: 1420 + i * 60,
        open: 95, high: 96, low: 94, close: 95, volume: 1000,
      })),
      // Swing high 2 at 100.05 (within threshold)
      { time: 1660, open: 95, high: 100.05, low: 94, close: 95, volume: 1000 },
      // Trailing padding
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1720 + i * 60,
        open: 95, high: 96, low: 94, close: 95, volume: 1000,
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

    // The two highs should NOT be grouped because price broke above the level
    const highZones = result.current.filter(z => z.type === 'high');
    const multiTouchZones = highZones.filter(z => z.touchTimes.length >= 2);
    expect(multiTouchZones.length).toBe(0);
  });

  it('DOES group equal highs when price stayed below the level between touches', () => {
    // Two swing highs at ~100, all candles between close below 100
    const candles: Candle[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1000 + i * 60,
        open: 95, high: 96, low: 94, close: 95, volume: 1000,
      })),
      // Swing high 1 at 100
      { time: 1300, open: 95, high: 100, low: 94, close: 95, volume: 1000 },
      // Candles between: all close BELOW 100 (no breakthrough)
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1360 + i * 60,
        open: 95, high: 96, low: 94, close: 95, volume: 1000,
      })),
      // Swing high 2 at 100.05 (within threshold)
      { time: 1660, open: 95, high: 100.05, low: 94, close: 95, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1720 + i * 60,
        open: 95, high: 96, low: 94, close: 95, volume: 1000,
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
    const multiTouchZones = highZones.filter(z => z.touchTimes.length >= 2);
    expect(multiTouchZones.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT group equal lows when price closed below the level between touches', () => {
    // Two swing lows at ~100, but a candle closes at 95 (below level) between them
    const candles: Candle[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1000 + i * 60,
        open: 105, high: 106, low: 104, close: 105, volume: 1000,
      })),
      // Swing low 1 at 100
      { time: 1300, open: 105, high: 106, low: 100, close: 105, volume: 1000 },
      // Candle that closes BELOW 100 (breakthrough)
      { time: 1360, open: 100, high: 101, low: 94, close: 95, volume: 1000 },
      ...Array.from({ length: 4 }, (_, i) => ({
        time: 1420 + i * 60,
        open: 105, high: 106, low: 104, close: 105, volume: 1000,
      })),
      // Swing low 2 at 100.05 (within threshold)
      { time: 1660, open: 105, high: 106, low: 100.05, close: 105, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1720 + i * 60,
        open: 105, high: 106, low: 104, close: 105, volume: 1000,
      })),
    ];

    const { result } = renderHook(() =>
      useLiquidityDetection({
        candles,
        settings: {
          ...DEFAULT_LIQUIDITY_SETTINGS,
          equalThreshold: 0.15,
          minTouches: 2,
          showHighs: false,
          showLows: true,
        },
      }),
    );

    const lowZones = result.current.filter(z => z.type === 'low');
    const multiTouchZones = lowZones.filter(z => z.touchTimes.length >= 2);
    expect(multiTouchZones.length).toBe(0);
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

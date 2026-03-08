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
      // Wick candle (index 17): wicks above the level
      { time: 2020, open: 109, high: 111, low: 108, close: 109, volume: 2000 },
      // Confirmation candles — first close below level (index 18) confirms the sweep
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
    // sweepTime is the deepest penetration candle's time (wick candle = index 17, time 2020)
    expect(sweptZone?.sweepTime).toBe(2020);
    // sweepPrice is the wick extreme of the wick candle
    expect(sweptZone?.sweepPrice).toBe(111);
    // sweepIndex is the wick candle (index 17); sweptIndex is the confirmation candle (index 18)
    expect(sweptZone?.sweepIndex).toBe(17);
    expect(sweptZone?.sweptIndex).toBe(18);
    // A confirmed sweep must not be pending
    expect(sweptZone?.sweepPending).toBeUndefined();
  });

  it('reports sweepPending when wick occurred but close confirmation not yet received', () => {
    // Equal highs at ~110, then a wick candle at the very end — no confirmation candle follows.
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
      // Wick candle: wicks above the level — this is the last candle (no confirmation yet)
      { time: 2020, open: 109, high: 111, low: 108, close: 109, volume: 2000 },
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
    // The zone should not yet be swept, but should be pending
    const pendingZone = highZones.find(z => z.sweepPending === true);
    expect(pendingZone).toBeDefined();
    expect(pendingZone?.swept).toBe(false);
    expect(pendingZone?.sweepPrice).toBe(111);
  });

  it('no look-ahead bias: sweep is pending when candles stop before confirmation', () => {
    // Equal lows at ~95; wick candle at index 17, confirmation would be at index 18
    // but we supply the candle array truncated just after the wick — no confirmation yet.
    const allCandles: Candle[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1000 + i * 60,
        open: 100, high: 101, low: 99, close: 100, volume: 1000,
      })),
      // Swing low 1 at 95
      { time: 1300, open: 100, high: 101, low: 95, close: 100, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1360 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
      // Swing low 2 at 95.05 (within threshold)
      { time: 1660, open: 100, high: 101, low: 95.05, close: 100, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1720 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
      // Wick candle (index 17): wicks below the level
      { time: 2020, open: 96, high: 97, low: 94, close: 95.5, volume: 2000 },
      // Confirmation candle (index 18): closes back above level
      { time: 2080, open: 95.5, high: 99, low: 95, close: 98, volume: 2000 },
      // Extra candles beyond confirmation
      ...Array.from({ length: 3 }, (_, i) => ({
        time: 2140 + i * 60,
        open: 98, high: 100, low: 97, close: 98, volume: 1000,
      })),
    ];

    // When candles end just at the wick (slice end is exclusive: indices 0-17, last = wick at 17)
    const candlesAtWick = allCandles.slice(0, 18);
    const { result: resultAtWick } = renderHook(() =>
      useLiquidityDetection({
        candles: candlesAtWick,
        settings: {
          ...DEFAULT_LIQUIDITY_SETTINGS,
          equalThreshold: 0.15,
          minTouches: 2,
          showSwept: true,
          showHighs: false,
          showLows: true,
        },
      }),
    );
    const lowZonesAtWick = resultAtWick.current.filter(z => z.type === 'low');
    const pendingZone = lowZonesAtWick.find(z => z.sweepPending === true);
    expect(pendingZone).toBeDefined();
    expect(pendingZone?.swept).toBe(false);

    // When candles include the confirmation (slice end exclusive: indices 0-18, last = confirmation at 18)
    const candlesAtConfirmation = allCandles.slice(0, 19);
    const { result: resultAtConfirmation } = renderHook(() =>
      useLiquidityDetection({
        candles: candlesAtConfirmation,
        settings: {
          ...DEFAULT_LIQUIDITY_SETTINGS,
          equalThreshold: 0.15,
          minTouches: 2,
          showSwept: true,
          showHighs: false,
          showLows: true,
        },
      }),
    );
    const lowZonesAtConfirmation = resultAtConfirmation.current.filter(z => z.type === 'low');
    const sweptZone = lowZonesAtConfirmation.find(z => z.swept === true);
    expect(sweptZone).toBeDefined();
    expect(sweptZone?.sweptIndex).toBe(18);
    expect(sweptZone?.sweepPending).toBeUndefined();
  });

  it('confirmation window timeout: sweep not confirmed when confirmation candle is too late', () => {
    // Equal lows at ~95; wick candle at index 17, no close back above within 3 candles,
    // then price recovers at index 21 (4 candles after wick — outside confirmation window).
    // Candles 18-20 stay above the level (no new wicks) so the only wick candidate is index 17.
    const candles: Candle[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1000 + i * 60,
        open: 100, high: 101, low: 99, close: 100, volume: 1000,
      })),
      // Swing low 1 at 95
      { time: 1300, open: 100, high: 101, low: 95, close: 100, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1360 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
      // Swing low 2 at 95.05 (within threshold)
      { time: 1660, open: 100, high: 101, low: 95.05, close: 100, volume: 1000 },
      ...Array.from({ length: 5 }, (_, i) => ({
        time: 1720 + i * 60,
        open: 100, high: 102, low: 99, close: 100, volume: 1000,
      })),
      // Wick candle (index 17): wicks below the level, closes below level (no same-bar confirmation)
      { time: 2020, open: 96, high: 96, low: 94, close: 94.5, volume: 2000 },
      // Candles 18-20: lows ABOVE the level (no new wicks), closes below level (no confirmation)
      { time: 2080, open: 94.5, high: 96, low: 95.1, close: 94.8, volume: 1000 },
      { time: 2140, open: 94.8, high: 96, low: 95.1, close: 94.9, volume: 1000 },
      { time: 2200, open: 94.9, high: 96, low: 95.1, close: 94.7, volume: 1000 },
      // Candle 21: recovers above level but is 4 candles after wick (outside window=3)
      { time: 2260, open: 94.7, high: 99, low: 95.1, close: 98, volume: 2000 },
    ];

    const { result } = renderHook(() =>
      useLiquidityDetection({
        candles,
        settings: {
          ...DEFAULT_LIQUIDITY_SETTINGS,
          equalThreshold: 0.15,
          minTouches: 2,
          confirmationCandles: 3,
          showSwept: true,
          showHighs: false,
          showLows: true,
        },
      }),
    );

    const lowZones = result.current.filter(z => z.type === 'low');
    // No sweep should be confirmed (confirmation candle is outside the window)
    const sweptZone = lowZones.find(z => z.swept === true);
    expect(sweptZone).toBeUndefined();
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

  describe('Rolling Sweep Window', () => {
    it('should confirm sweep with single break and immediate recovery', () => {
      // Level at 95 (low sweep): wick below, then next candle closes above.
      // candle indices (afterIndex = 0, level = 95):
      //   0: afterIndex  (normal, high=102, low=98)
      //   1: break to 94, close at 96  → window starts (1/3), pending
      //   2: close at 98 (above 95)    → CONFIRMED, sweptIndex=2, sweepIndex=1
      const candles: Candle[] = [
        { time: 0,   open: 100, high: 102, low: 98, close: 100, volume: 1000 },
        { time: 60,  open: 100, high: 100, low: 94, close: 96,  volume: 1000 },
        { time: 120, open: 96,  high: 99,  low: 95, close: 98,  volume: 1000 },
      ];

      // Build a full candle set around level 95 so the hook finds a liquidity zone.
      // We embed the above sweep sequence after a set of equal lows at 95.
      const baseLow = 95;
      const fullCandles: Candle[] = [
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1000 + i * 60,
          open: 100, high: 101, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 1 at 95
        { time: 1300, open: 100, high: 101, low: baseLow, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1360 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 2 at 95.05 (within threshold)
        { time: 1660, open: 100, high: 101, low: 95.05, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1720 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // Wick candle: low=94 (breaks below 95), close=96 (above 95)
        { time: 2020, open: 100, high: 100, low: 94, close: 96, volume: 1000 },
        // Confirmation: close=98 above 95
        { time: 2080, open: 96, high: 99, low: 95, close: 98, volume: 1000 },
      ];

      const { result } = renderHook(() =>
        useLiquidityDetection({
          candles: fullCandles,
          settings: {
            ...DEFAULT_LIQUIDITY_SETTINGS,
            equalThreshold: 0.15,
            minTouches: 2,
            showSwept: true,
            showHighs: false,
            showLows: true,
          },
        }),
      );

      const lowZones = result.current.filter(z => z.type === 'low');
      const sweptZone = lowZones.find(z => z.swept === true);
      expect(sweptZone).toBeDefined();
      // sweepTime is the deepest break candle's time (wick candle at time=2020)
      expect(sweptZone?.sweepTime).toBe(2020);
      expect(sweptZone?.sweepPrice).toBe(94);
      // sweepIndex = wick candle index, sweptIndex = confirmation candle index
      expect(sweptZone?.sweptIndex).toBeGreaterThan(sweptZone?.sweepIndex!);
      expect(sweptZone?.sweepPending).toBeUndefined();
    });

    it('should track deepest penetration across multiple candles', () => {
      // Level at 95 (low sweep): multiple breaks, each going deeper.
      // Window candles: break@94, break@93, break@92, then confirm above 95.
      // Lightning bolt (sweepIndex) must end up on the candle with low=92.
      const fullCandles: Candle[] = [
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1000 + i * 60,
          open: 100, high: 101, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 1 at 95
        { time: 1300, open: 100, high: 101, low: 95, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1360 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 2 at 95.05 (within threshold)
        { time: 1660, open: 100, high: 101, low: 95.05, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1720 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // Break 1 to 94 (window 1/3) — time=2020
        { time: 2020, open: 100, high: 100, low: 94, close: 94, volume: 1000 },
        // Break 2 deeper to 93 (window 2/3) — time=2080
        { time: 2080, open: 94,  high: 95,  low: 93, close: 93, volume: 1000 },
        // Break 3 deepest to 92 (window 3/3) — time=2140
        { time: 2140, open: 93,  high: 94,  low: 92, close: 92, volume: 1000 },
        // Confirmation: close above 95 — time=2200
        { time: 2200, open: 92,  high: 98,  low: 91, close: 96, volume: 1000 },
      ];

      const { result } = renderHook(() =>
        useLiquidityDetection({
          candles: fullCandles,
          settings: {
            ...DEFAULT_LIQUIDITY_SETTINGS,
            equalThreshold: 0.15,
            minTouches: 2,
            confirmationCandles: 3,
            showSwept: true,
            showHighs: false,
            showLows: true,
          },
        }),
      );

      const lowZones = result.current.filter(z => z.type === 'low');
      const sweptZone = lowZones.find(z => z.swept === true);
      expect(sweptZone).toBeDefined();
      // ⚡ must sit at the deepest break candle (time=2140, low=92)
      expect(sweptZone?.sweepTime).toBe(2140);
      expect(sweptZone?.sweepPrice).toBe(92);
      expect(sweptZone?.sweepPending).toBeUndefined();
    });

    it('should fail when window expires without recovery (3-candle limit)', () => {
      // Level at 95 (low sweep): breaks below on candle 1, stays below through
      // candles 2, 3, and 4 — no recovery → sweep fails, no zone swept.
      const fullCandles: Candle[] = [
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1000 + i * 60,
          open: 100, high: 101, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 1 at 95
        { time: 1300, open: 100, high: 101, low: 95, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1360 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 2 at 95.05 (within threshold)
        { time: 1660, open: 100, high: 101, low: 95.05, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1720 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // Break (window 1/3)
        { time: 2020, open: 100, high: 100, low: 94, close: 94, volume: 1000 },
        // Still below (window 2/3)
        { time: 2080, open: 94,  high: 95,  low: 93, close: 93, volume: 1000 },
        // Still below (window 3/3)
        { time: 2140, open: 93,  high: 94,  low: 92, close: 92, volume: 1000 },
        // Still below (4th candle — window expires, no confirmation)
        { time: 2200, open: 92,  high: 93,  low: 91, close: 91, volume: 1000 },
      ];

      const { result } = renderHook(() =>
        useLiquidityDetection({
          candles: fullCandles,
          settings: {
            ...DEFAULT_LIQUIDITY_SETTINGS,
            equalThreshold: 0.15,
            minTouches: 2,
            confirmationCandles: 3,
            showSwept: true,
            showHighs: false,
            showLows: true,
          },
        }),
      );

      const lowZones = result.current.filter(z => z.type === 'low');
      const sweptZone = lowZones.find(z => z.swept === true);
      expect(sweptZone).toBeUndefined();
    });

    it('should handle multiple break attempts within the window', () => {
      // Level at 95 (low sweep): break then partially recover, then break again,
      // then confirm — all within the 3-candle window from the first break.
      // candle A: break to 94, close above 95 (1/3, no confirm yet — first candle starts window)
      // candle B: break to 93, close below 95 (2/3, deeper, not confirmed)
      // candle C: close above 95 (3/3) → CONFIRMED
      const fullCandles: Candle[] = [
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1000 + i * 60,
          open: 100, high: 101, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 1 at 95
        { time: 1300, open: 100, high: 101, low: 95, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1360 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 2 at 95.05 (within threshold)
        { time: 1660, open: 100, high: 101, low: 95.05, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1720 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // candle A: break to 94, close above 95 — first break, window 1/3
        { time: 2020, open: 100, high: 100, low: 94, close: 96, volume: 1000 },
        // candle B: break deeper to 93, close below 95 — window 2/3
        { time: 2080, open: 96,  high: 97,  low: 93, close: 94, volume: 1000 },
        // candle C: close above 95 — window 3/3 → CONFIRMED
        { time: 2140, open: 94,  high: 98,  low: 93, close: 97, volume: 1000 },
      ];

      const { result } = renderHook(() =>
        useLiquidityDetection({
          candles: fullCandles,
          settings: {
            ...DEFAULT_LIQUIDITY_SETTINGS,
            equalThreshold: 0.15,
            minTouches: 2,
            confirmationCandles: 3,
            showSwept: true,
            showHighs: false,
            showLows: true,
          },
        }),
      );

      const lowZones = result.current.filter(z => z.type === 'low');
      const sweptZone = lowZones.find(z => z.swept === true);
      expect(sweptZone).toBeDefined();
      expect(sweptZone?.sweepPending).toBeUndefined();
      // deepest break is candle B (low=93, time=2080)
      expect(sweptZone?.sweepTime).toBe(2080);
      expect(sweptZone?.sweepPrice).toBe(93);
    });

    it('should place lightning bolt at deepest break candle, not first break candle', () => {
      // Level at 95 (low sweep): first break to 94, then deeper to 92.
      // sweepTime/sweepIndex must point to the deeper candle, not the first break.
      const fullCandles: Candle[] = [
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1000 + i * 60,
          open: 100, high: 101, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 1 at 95
        { time: 1300, open: 100, high: 101, low: 95, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1360 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // Swing low 2 at 95.05 (within threshold)
        { time: 1660, open: 100, high: 101, low: 95.05, close: 100, volume: 1000 },
        ...Array.from({ length: 5 }, (_, i) => ({
          time: 1720 + i * 60,
          open: 100, high: 102, low: 99, close: 100, volume: 1000,
        })),
        // First break to 94 (window 1/3) — time=2020
        { time: 2020, open: 100, high: 100, low: 94, close: 93, volume: 1000 },
        // Deeper break to 92 (window 2/3) — time=2080 ← ⚡ should be here
        { time: 2080, open: 93,  high: 94,  low: 92, close: 92, volume: 1000 },
        // Confirmation: close above 95 — time=2140
        { time: 2140, open: 92,  high: 98,  low: 91, close: 96, volume: 1000 },
      ];

      const { result } = renderHook(() =>
        useLiquidityDetection({
          candles: fullCandles,
          settings: {
            ...DEFAULT_LIQUIDITY_SETTINGS,
            equalThreshold: 0.15,
            minTouches: 2,
            confirmationCandles: 3,
            showSwept: true,
            showHighs: false,
            showLows: true,
          },
        }),
      );

      const lowZones = result.current.filter(z => z.type === 'low');
      const sweptZone = lowZones.find(z => z.swept === true);
      expect(sweptZone).toBeDefined();
      // ⚡ should be at the DEEPER candle (time=2080), NOT the first break (time=2020)
      expect(sweptZone?.sweepTime).toBe(2080);
      expect(sweptZone?.sweepPrice).toBe(92);
      expect(sweptZone?.sweepPending).toBeUndefined();
    });
  });
});

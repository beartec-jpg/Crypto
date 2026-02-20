import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePDZoneDetection } from '@/hooks/usePDZoneDetection';
import { DEFAULT_PD_ZONE_SETTINGS } from '@/types/liquidity';
import type { Candle } from '@/types/candle';

function makeCandles(prices: { high: number; low: number; time: number }[]): Candle[] {
  return prices.map(p => ({
    time: p.time,
    open: (p.high + p.low) / 2,
    high: p.high,
    low: p.low,
    close: (p.high + p.low) / 2,
    volume: 1000,
  }));
}

describe('usePDZoneDetection', () => {
  it('returns empty when disabled', () => {
    const candles = makeCandles(
      Array.from({ length: 25 }, (_, i) => ({ high: 110, low: 90, time: 1000 + i * 60 })),
    );
    const { result } = renderHook(() =>
      usePDZoneDetection({
        candles,
        settings: { ...DEFAULT_PD_ZONE_SETTINGS, enabled: false },
      }),
    );
    expect(result.current).toEqual([]);
  });

  it('returns empty for insufficient candles', () => {
    const { result } = renderHook(() =>
      usePDZoneDetection({
        candles: [],
        settings: DEFAULT_PD_ZONE_SETTINGS,
      }),
    );
    expect(result.current).toEqual([]);
  });

  it('detects swing range with correct equilibrium', () => {
    const candles = makeCandles(
      Array.from({ length: 50 }, (_, i) => ({
        high: 100 + (i % 5 === 0 ? 10 : 0),  // some spike to 110
        low: 100 - (i % 7 === 0 ? 10 : 0),   // some dip to 90
        time: 1000 + i * 60,
      })),
    );

    const { result } = renderHook(() =>
      usePDZoneDetection({
        candles,
        settings: { ...DEFAULT_PD_ZONE_SETTINGS, rangeSource: 'swing' },
      }),
    );

    expect(result.current.length).toBe(1);
    const zone = result.current[0];
    expect(zone.source).toBe('swing');
    expect(zone.rangeHigh).toBeGreaterThan(zone.rangeLow);
    // Equilibrium should be exactly midpoint
    expect(zone.equilibrium).toBeCloseTo((zone.rangeHigh + zone.rangeLow) / 2);
  });

  it('detects previous day range correctly', () => {
    // Set up candles: yesterday's candles + today's candles
    const now = new Date('2024-01-15T12:00:00Z');
    const todayStart = new Date('2024-01-15T00:00:00Z').getTime() / 1000;
    const prevDayStart = todayStart - 86400;

    const prevDayCandles: { high: number; low: number; time: number }[] = [
      { high: 105, low: 95, time: prevDayStart + 3600 },
      { high: 108, low: 94, time: prevDayStart + 7200 },
      { high: 106, low: 96, time: prevDayStart + 10800 },
    ];
    const todayCandles: { high: number; low: number; time: number }[] = [
      { high: 103, low: 98, time: todayStart + 3600 },
      { high: 104, low: 99, time: todayStart + 7200 },
    ];

    const candles = makeCandles([...prevDayCandles, ...todayCandles]);

    const { result } = renderHook(() =>
      usePDZoneDetection({
        candles,
        settings: { ...DEFAULT_PD_ZONE_SETTINGS, rangeSource: 'day' },
      }),
    );

    expect(result.current.length).toBe(1);
    const zone = result.current[0];
    expect(zone.source).toBe('day');
    expect(zone.rangeHigh).toBe(108);
    expect(zone.rangeLow).toBe(94);
    expect(zone.equilibrium).toBeCloseTo(101);
  });

  it('returns empty when no previous day data is available', () => {
    // Only today's candles
    const todayStart = new Date('2024-01-15T00:00:00Z').getTime() / 1000;
    const candles = makeCandles([
      { high: 105, low: 95, time: todayStart + 3600 },
      { high: 106, low: 96, time: todayStart + 7200 },
    ]);

    const { result } = renderHook(() =>
      usePDZoneDetection({
        candles,
        settings: { ...DEFAULT_PD_ZONE_SETTINGS, rangeSource: 'day' },
      }),
    );

    expect(result.current).toEqual([]);
  });
});

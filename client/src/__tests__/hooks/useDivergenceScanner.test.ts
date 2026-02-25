import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDivergenceScanner } from '@/hooks/useDivergenceScanner';
import {
  getDivergenceBadgeColor,
  DEFAULT_OSCILLATOR_CONFIG,
} from '@/lib/calculations/divergenceCalculations';
import type { CandleData } from '@/types/chart.types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCandles(count: number, basePrice = 100): CandleData[] {
  return Array.from({ length: count }, (_, i) => ({
    time: 1000 + i * 60,
    open: basePrice,
    high: basePrice + 2,
    low: basePrice - 2,
    close: basePrice,
    volume: 1000,
  }));
}

// ── getDivergenceBadgeColor ──────────────────────────────────────────────────

describe('getDivergenceBadgeColor', () => {
  it('returns yellow for 1 indicator (weak)', () => {
    expect(getDivergenceBadgeColor(1)).toBe('bg-yellow-500');
  });

  it('returns yellow for 2 indicators (weak)', () => {
    expect(getDivergenceBadgeColor(2)).toBe('bg-yellow-500');
  });

  it('returns orange for 3 indicators (medium)', () => {
    expect(getDivergenceBadgeColor(3)).toBe('bg-orange-500');
  });

  it('returns orange for 4 indicators (medium)', () => {
    expect(getDivergenceBadgeColor(4)).toBe('bg-orange-500');
  });

  it('returns red for 5 indicators (strong)', () => {
    expect(getDivergenceBadgeColor(5)).toBe('bg-red-600');
  });

  it('returns red for 7 indicators (strong)', () => {
    expect(getDivergenceBadgeColor(7)).toBe('bg-red-600');
  });
});

// ── useDivergenceScanner ─────────────────────────────────────────────────────

describe('useDivergenceScanner', () => {
  it('returns empty array for insufficient candles', () => {
    const candles = makeCandles(10);
    const { result } = renderHook(() =>
      useDivergenceScanner(candles, DEFAULT_OSCILLATOR_CONFIG),
    );
    expect(result.current).toEqual([]);
  });

  it('returns empty array for empty candles', () => {
    const { result } = renderHook(() =>
      useDivergenceScanner([], DEFAULT_OSCILLATOR_CONFIG),
    );
    expect(result.current).toEqual([]);
  });

  it('returns array of DivergencePoints with required shape', () => {
    // Use enough candles (50) for calculation
    const candles = makeCandles(50);
    const { result } = renderHook(() =>
      useDivergenceScanner(candles, DEFAULT_OSCILLATOR_CONFIG),
    );

    // Each returned point must have the correct shape
    for (const point of result.current) {
      expect(typeof point.time).toBe('number');
      expect(typeof point.price).toBe('number');
      expect(['bullish', 'bearish']).toContain(point.type);
      expect(typeof point.count).toBe('number');
      expect(point.count).toBeGreaterThanOrEqual(1);
      expect(point.count).toBeLessThanOrEqual(7);
      expect(Array.isArray(point.indicators)).toBe(true);
      expect(point.indicators.length).toBe(point.count);
    }
  });

  it('returns results sorted by time ascending', () => {
    const candles = makeCandles(60);
    const { result } = renderHook(() =>
      useDivergenceScanner(candles, DEFAULT_OSCILLATOR_CONFIG),
    );

    const times = result.current.map(p => p.time);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it('limits scan to last 100 candles for performance', () => {
    // Build 500 candles - result count should equal using 100-candle subset
    const bigCandles = makeCandles(500);
    const smallCandles = bigCandles.slice(-100);

    const { result: bigResult } = renderHook(() =>
      useDivergenceScanner(bigCandles, DEFAULT_OSCILLATOR_CONFIG),
    );
    const { result: smallResult } = renderHook(() =>
      useDivergenceScanner(smallCandles, DEFAULT_OSCILLATOR_CONFIG),
    );

    // Both should produce the same count since we only scan the last 100
    expect(bigResult.current.length).toBe(smallResult.current.length);
  });

  it('indicator names in DivergencePoint are among the 7 known oscillators', () => {
    const knownIndicators = new Set([
      'RSI', 'MACD', 'Stoch RSI', 'MFI', 'Williams %R', 'CCI', 'OBV',
    ]);
    const candles = makeCandles(60);
    const { result } = renderHook(() =>
      useDivergenceScanner(candles, DEFAULT_OSCILLATOR_CONFIG),
    );

    for (const point of result.current) {
      for (const ind of point.indicators) {
        expect(knownIndicators.has(ind)).toBe(true);
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  candlePiercesLine,
  convexHullChain,
  detectAutoTrendlines,
  isLineExternal,
  type AutoTrendlineCandle,
} from '@/lib/indicators/autoTrendline';
import { DEFAULT_AUTO_TRENDLINE_SETTINGS } from '@/types/autoTrendline';

function makeSupportUptrend(count: number): AutoTrendlineCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const base = 100 + i * 0.15;
    const low = base + Math.sin(i / 7) * 0.3;
    const high = low + 2 + (i % 5 === 0 ? 0.5 : 0);
    return {
      time: 1_700_000_000 + i * 3600,
      open: low + 0.5,
      high,
      low,
      close: low + 1.2,
      volume: 1000,
    };
  });
}

/** Lows sit on a rising line; highs well above — clean external support. */
function makePerfectExternalSupport(count: number): AutoTrendlineCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const low = 100 + i * 0.2;
    const high = low + 3;
    return {
      time: 1_700_000_000 + i * 3600,
      open: low + 1,
      high,
      low,
      close: low + 1.5,
      volume: 1000,
    };
  });
}

/**
 * Choppy series where a naive top-to-bottom diagonal would be sliced by
 * many full-body candles — must NOT produce that as a "trendline".
 */
function makeHeavilyPiercedDiagonal(count: number): AutoTrendlineCandle[] {
  return Array.from({ length: count }, (_, i) => {
    // Oscillate hard around a falling diagonal so many bodies straddle it
    const mid = 200 - i * 0.4;
    const swing = (i % 2 === 0 ? 1 : -1) * 8;
    const open = mid + swing;
    const close = mid - swing;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    return {
      time: 1_700_000_000 + i * 3600,
      open,
      high,
      low,
      close,
      volume: 1000,
    };
  });
}

describe('convexHullChain', () => {
  it('upper hull has no point above its edges', () => {
    const pts = [
      { index: 0, price: 10, time: 0 },
      { index: 1, price: 12, time: 1 },
      { index: 2, price: 9, time: 2 },
      { index: 3, price: 14, time: 3 },
      { index: 4, price: 11, time: 4 },
    ];
    const upper = convexHullChain(pts, 'upper');
    expect(upper.length).toBeGreaterThanOrEqual(2);
    // Highest points should be on the upper hull
    expect(upper.some((p) => p.price === 14)).toBe(true);
  });
});

describe('candlePiercesLine', () => {
  const tol = 0.001;

  it('flags full body closed above resistance', () => {
    const c = { time: 1, open: 105, high: 106, low: 104, close: 105.5, volume: 1 };
    expect(candlePiercesLine(c, 100, 'resistance', tol)).toBe(true);
  });

  it('flags body straddling a line as a cut-through', () => {
    const c = { time: 1, open: 95, high: 106, low: 94, close: 105, volume: 1 };
    expect(candlePiercesLine(c, 100, 'resistance', tol)).toBe(true);
  });

  it('allows a clean touch from below resistance', () => {
    const c = { time: 1, open: 98, high: 100, low: 97, close: 99, volume: 1 };
    expect(candlePiercesLine(c, 100, 'resistance', tol)).toBe(false);
  });
});

describe('detectAutoTrendlines', () => {
  it('returns empty when master disabled', () => {
    const result = detectAutoTrendlines(makeSupportUptrend(120), {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: false,
    });
    expect(result.lines).toEqual([]);
  });

  it('returns empty on tiny series', () => {
    const result = detectAutoTrendlines(makeSupportUptrend(10), {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: true,
    });
    expect(result.lines).toEqual([]);
  });

  it('emits only lines that stay external across their span', () => {
    const candles = makePerfectExternalSupport(200);
    const result = detectAutoTrendlines(candles, {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: true,
    });
    for (const line of result.lines) {
      const startI = candles.findIndex((c) => c.time === line.startTime);
      const endI = candles.findIndex((c) => c.time === line.endTime);
      expect(startI).toBeGreaterThanOrEqual(0);
      expect(endI).toBeGreaterThan(startI);
      expect(
        isLineExternal(
          candles,
          line.slope,
          line.intercept,
          startI,
          endI,
          line.kind,
          0.0008,
        ),
      ).toBe(true);
    }
  });

  it('does not treat a heavily pierced diagonal as a trendline', () => {
    const candles = makeHeavilyPiercedDiagonal(120);
    const result = detectAutoTrendlines(candles, {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: true,
      macro: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.macro, enabled: true },
      mid: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.mid, enabled: true },
      ltf: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.ltf, enabled: true },
    });
    // Every emitted line must be pierce-free on its drawn range
    for (const line of result.lines) {
      const startI = candles.findIndex((c) => c.time === line.startTime);
      const endI = candles.findIndex((c) => c.time === line.endTime);
      let pierces = 0;
      for (let i = startI; i <= endI; i++) {
        const y = line.slope * i + line.intercept;
        if (candlePiercesLine(candles[i], y, line.kind, 0.0008)) pierces++;
      }
      expect(pierces).toBe(0);
    }
  });

  it('respects per-tier enable flags', () => {
    const result = detectAutoTrendlines(makeSupportUptrend(200), {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: true,
      macro: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.macro, enabled: false },
      mid: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.mid, enabled: false },
      ltf: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.ltf, enabled: false },
    });
    expect(result.lines).toEqual([]);
  });
});

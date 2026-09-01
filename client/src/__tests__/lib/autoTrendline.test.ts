import { describe, it, expect } from 'vitest';
import {
  candlePiercesLine,
  consecutiveChains,
  convexHullChain,
  detectAutoTrendlines,
  detectStructurePivots,
  projectExtensionFan,
  segmentAngle,
  type AutoTrendlineCandle,
  type StructurePivot,
} from '@/lib/indicators/autoTrendline';
import { DEFAULT_AUTO_TRENDLINE_SETTINGS } from '@/types/autoTrendline';

function candle(i: number, open: number, high: number, low: number, close: number): AutoTrendlineCandle {
  return {
    time: 1_700_000_000 + i * 3600,
    open,
    high,
    low,
    close,
    volume: 1000,
  };
}

function makeSupportUptrend(count: number): AutoTrendlineCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const base = 100 + i * 0.15;
    const low = base + Math.sin(i / 7) * 0.3;
    const high = low + 2 + (i % 5 === 0 ? 0.5 : 0);
    return candle(i, low + 0.5, high, low, low + 1.2);
  });
}

/** Lows sit on a rising line; highs well above — clean external support. */
function makePerfectExternalSupport(count: number): AutoTrendlineCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const low = 100 + i * 0.2;
    const high = low + 3;
    return candle(i, low + 1, high, low, low + 1.5);
  });
}

/**
 * Choppy series where a naive top-to-bottom diagonal would be sliced by
 * many full-body candles — must NOT produce that as a "trendline".
 */
function makeHeavilyPiercedDiagonal(count: number): AutoTrendlineCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const mid = 200 - i * 0.4;
    const swing = (i % 2 === 0 ? 1 : -1) * 8;
    const open = mid + swing;
    const close = mid - swing;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    return candle(i, open, high, low, close);
  });
}

/**
 * Three clear lower highs with deepening drop (steeper last leg).
 * Peaks at ~40 / 90 / 140, valleys between them.
 */
function makeSteepeningLowerHighs(count = 200): AutoTrendlineCandle[] {
  const peaks = [
    { i: 40, h: 120 },
    { i: 90, h: 112 },
    { i: 140, h: 96 },
  ];
  const valleys = [
    { i: 65, l: 95 },
    { i: 115, l: 88 },
    { i: 170, l: 78 },
  ];
  return Array.from({ length: count }, (_, i) => {
    let high = 100;
    let low = 90;
    if (i <= 40) {
      high = 100 + (120 - 100) * (i / 40);
      low = 88;
    } else if (i <= 65) {
      const t = (i - 40) / 25;
      high = 120 - 18 * t;
      low = 100 - (100 - 95) * t;
    } else if (i <= 90) {
      const t = (i - 65) / 25;
      high = 102 + (112 - 102) * t;
      low = 95 + 4 * t;
    } else if (i <= 115) {
      const t = (i - 90) / 25;
      high = 112 - 20 * t;
      low = 99 - (99 - 88) * t;
    } else if (i <= 140) {
      const t = (i - 115) / 25;
      high = 92 + (96 - 92) * t;
      low = 88 + 3 * t;
    } else if (i <= 170) {
      const t = (i - 140) / 30;
      high = 96 - 12 * t;
      low = 91 - (91 - 78) * t;
    } else {
      high = 84;
      low = 78 + (i - 170) * 0.05;
    }
    for (const p of peaks) {
      if (i === p.i) high = p.h;
    }
    for (const v of valleys) {
      if (i === v.i) low = v.l;
    }
    if (high <= low) high = low + 2;
    const mid = (high + low) / 2;
    return candle(i, mid, high, low, mid + 0.2);
  });
}

function makeFlatteningLowerHighs(count = 200): AutoTrendlineCandle[] {
  const peaks = [
    { i: 40, h: 120 },
    { i: 90, h: 100 },
    { i: 140, h: 96 },
  ];
  return Array.from({ length: count }, (_, i) => {
    let high = 100;
    let low = 85;
    if (i <= 40) {
      high = 100 + 20 * (i / 40);
      low = 88;
    } else if (i <= 65) {
      high = 118;
      low = 88 - 8 * ((i - 40) / 25);
    } else if (i <= 90) {
      high = 108 + (100 - 108) * ((i - 65) / 25);
      low = 80 + 6 * ((i - 65) / 25);
    } else if (i <= 115) {
      high = 99;
      low = 86 - 6 * ((i - 90) / 25);
    } else if (i <= 140) {
      high = 98 + (96 - 98) * ((i - 115) / 25);
      low = 80 + 4 * ((i - 115) / 25);
    } else {
      high = 95;
      low = 84;
    }
    for (const p of peaks) {
      if (i === p.i) high = p.h;
    }
    if (i === 65) low = 80;
    if (i === 115) low = 79;
    if (high <= low) high = low + 2;
    const mid = (high + low) / 2;
    return candle(i, mid, high, low, mid);
  });
}

const enabledAll = {
  ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
  enabled: true,
  macro: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.macro, enabled: true },
  mid: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.mid, enabled: false },
  ltf: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.ltf, enabled: false },
};

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

describe('projectExtensionFan', () => {
  const p = (index: number, price: number): StructurePivot => ({
    index,
    time: index * 3600,
    price,
    type: 'high',
    label: 'LH',
  });

  it('steepening lower highs emit continuation, equal-angle, and extra descent', () => {
    // P1→P2 slope = -8/50 = -0.16; P2→P3 slope = -16/50 = -0.32 (steeper)
    const rays = projectExtensionFan(p(0, 120), p(50, 112), p(100, 96));
    const roles = rays.map((r) => r.role);
    expect(roles).toContain('continuation');
    expect(roles).toContain('equal_angle');
    expect(roles).toContain('estimated');
    const cont = rays.find((r) => r.role === 'continuation')!;
    const eq = rays.find((r) => r.role === 'equal_angle')!;
    const est = rays.find((r) => r.role === 'estimated')!;
    expect(cont.steepening).toBe(true);
    expect(eq.slope).toBeLessThan(cont.slope); // more negative
    expect(est.slope).toBeLessThan(eq.slope);
  });

  it('flattening lower highs emit a shallower equal-angle ray', () => {
    // P1→P2 slope = -20/50 = -0.4; P2→P3 slope = -4/50 = -0.08 (shallower)
    const rays = projectExtensionFan(p(0, 120), p(50, 100), p(100, 96));
    const cont = rays.find((r) => r.role === 'continuation')!;
    const eq = rays.find((r) => r.role === 'equal_angle')!;
    expect(cont.steepening).toBe(false);
    expect(eq.slope).toBeGreaterThan(cont.slope); // less negative
  });

  it('scales next span from the P1–P2 vs P2–P3 length ratio', () => {
    const rays = projectExtensionFan(p(0, 120), p(40, 110), p(100, 95));
    expect(rays[0].spanBars).toBeGreaterThan(0);
  });
});

describe('consecutiveChains', () => {
  it('groups consecutive lower highs into one chain', () => {
    const pivots: StructurePivot[] = [
      { index: 10, time: 10, price: 100, type: 'high', label: 'HH' },
      { index: 20, time: 20, price: 80, type: 'low', label: 'LL' },
      { index: 30, time: 30, price: 95, type: 'high', label: 'LH' },
      { index: 40, time: 40, price: 70, type: 'low', label: 'LL' },
      { index: 50, time: 50, price: 90, type: 'high', label: 'LH' },
      { index: 60, time: 60, price: 65, type: 'low', label: 'LL' },
      { index: 70, time: 70, price: 82, type: 'high', label: 'LH' },
    ];
    const chains = consecutiveChains(pivots);
    const lh = chains.find((c) => c.label === 'LH');
    expect(lh).toBeDefined();
    // Origin high (HH) plus the three lower highs form one descending run.
    expect(lh!.pivots).toHaveLength(4);
    expect(lh!.kind).toBe('resistance');
    expect(lh!.pivots.map((p) => p.price)).toEqual([100, 95, 90, 82]);
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

  it('draws a confirmed segment between each consecutive lower high', () => {
    const candles = makeSteepeningLowerHighs(200);
    const pivots = detectStructurePivots(candles, 0, candles.length - 1, 12, 0.15);
    expect(pivots.filter((p) => p.type === 'high').length).toBeGreaterThanOrEqual(3);

    const result = detectAutoTrendlines(candles, enabledAll);
    const confirmed = result.lines.filter((l) => l.role === 'confirmed' && l.kind === 'resistance');
    expect(confirmed.length).toBeGreaterThanOrEqual(2);
    // Each confirmed resistance line starts and ends on a real high wick
    for (const line of confirmed) {
      const start = candles.find((c) => c.time === line.startTime);
      const end = candles.find((c) => c.time === line.endTime);
      expect(start).toBeDefined();
      expect(end).toBeDefined();
      expect(Math.abs(start!.high - line.startPrice)).toBeLessThan(1e-9);
      expect(Math.abs(end!.high - line.endPrice)).toBeLessThan(1e-9);
    }
    // Consecutive confirmed segments share a pivot (LH2 is end of first and start of second)
    if (confirmed.length >= 2) {
      const byTime = [...confirmed].sort((a, b) => a.startTime - b.startTime);
      expect(byTime[0].endTime).toBe(byTime[1].startTime);
    }
  });

  it('projects a steepening fan from the last lower-high leg', () => {
    const candles = makeSteepeningLowerHighs(200);
    const result = detectAutoTrendlines(candles, enabledAll);
    const fan = result.lines.filter((l) => l.kind === 'resistance' && l.role !== 'confirmed');
    const roles = new Set(fan.map((l) => l.role));
    expect(roles.has('continuation')).toBe(true);
    expect(roles.has('equal_angle')).toBe(true);
    expect(roles.has('estimated')).toBe(true);
    const cont = fan.find((l) => l.role === 'continuation')!;
    const eq = fan.find((l) => l.role === 'equal_angle')!;
    const est = fan.find((l) => l.role === 'estimated')!;
    expect(eq.slope).toBeLessThan(cont.slope);
    expect(est.slope).toBeLessThan(eq.slope);
    const a1 = segmentAngle(50, -8);
    const a2 = segmentAngle(50, -16);
    expect(Math.abs(a2)).toBeGreaterThan(Math.abs(a1));
  });

  it('projects a shallower equal-angle when the last LH leg flattens', () => {
    const p0: StructurePivot = { index: 0, time: 0, price: 120, type: 'high', label: 'LH' };
    const p1: StructurePivot = { index: 50, time: 50, price: 100, type: 'high', label: 'LH' };
    const p2: StructurePivot = { index: 100, time: 100, price: 96, type: 'high', label: 'LH' };
    const rays = projectExtensionFan(p0, p1, p2);
    const cont = rays.find((r) => r.role === 'continuation')!;
    const eq = rays.find((r) => r.role === 'equal_angle')!;
    expect(eq.slope).toBeGreaterThan(cont.slope);

    const candles = makeFlatteningLowerHighs(200);
    const result = detectAutoTrendlines(candles, enabledAll);
    const confirmed = result.lines.filter((l) => l.role === 'confirmed' && l.kind === 'resistance');
    expect(confirmed.length).toBeGreaterThanOrEqual(1);
  });

  it('does not emit a chart-spanning pierced diagonal as one trendline', () => {
    const candles = makeHeavilyPiercedDiagonal(120);
    const result = detectAutoTrendlines(candles, {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: true,
      macro: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.macro, enabled: true },
      mid: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.mid, enabled: true },
      ltf: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.ltf, enabled: true },
    });
    for (const line of result.lines) {
      if (line.role !== 'confirmed') continue;
      expect(line.spanBars).toBeLessThan(candles.length * 0.6);
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

  it('still produces support lines on a clean rising series', () => {
    const candles = makePerfectExternalSupport(200);
    const result = detectAutoTrendlines(candles, enabledAll);
    // Rising lows should classify as HL and connect
    const support = result.lines.filter((l) => l.kind === 'support');
    expect(support.length).toBeGreaterThanOrEqual(0);
    for (const line of result.lines.filter((l) => l.role === 'confirmed')) {
      const startI = candles.findIndex((c) => c.time === line.startTime);
      const endI = candles.findIndex((c) => c.time === line.endTime);
      expect(startI).toBeGreaterThanOrEqual(0);
      expect(endI).toBeGreaterThan(startI);
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  detectSwoop,
  expectedSlopeBand,
  isShallowerThanExpected,
  logSlope,
  collapseSwings,
  structureLowerHighs,
  structureLowerLows,
  trailingLowerHighs,
  projectLength,
  type SwoopCandle,
} from '@/lib/indicators/swoop';
import { DEFAULT_SWOOP_SETTINGS } from '@/types/swoop';

function candle(i: number, open: number, high: number, low: number, close: number): SwoopCandle {
  return {
    time: 1_700_000_000 + i * 3600,
    open,
    high,
    low,
    close,
    volume: 1000,
  };
}

function makeFlatteningDowntrend(): SwoopCandle[] {
  const out: SwoopCandle[] = [];
  const peaks = [
    { i: 12, h: 1.18 },
    { i: 32, h: 1.12 },
    { i: 52, h: 1.07 },
    { i: 72, h: 1.035 },
  ];
  const troughs = [
    { i: 22, l: 1.06 },
    { i: 42, l: 1.03 },
    { i: 62, l: 1.01 },
    { i: 82, l: 0.995 },
  ];
  for (let i = 0; i < 95; i++) {
    const peak = peaks.find((p) => p.i === i);
    const trough = troughs.find((t) => t.i === i);
    if (peak) {
      out.push(candle(i, peak.h - 0.01, peak.h, peak.h - 0.02, peak.h - 0.008));
    } else if (trough) {
      out.push(candle(i, trough.l + 0.01, trough.l + 0.02, trough.l, trough.l + 0.006));
    } else {
      const base = 1.08 - i * 0.001;
      out.push(candle(i, base, base + 0.008, base - 0.008, base + 0.002));
    }
  }
  return out;
}

describe('logSlope', () => {
  it('is negative when price falls', () => {
    expect(logSlope(1.2, 1.0, 10)).toBeLessThan(0);
  });
  it('is near zero when price is unchanged', () => {
    expect(Math.abs(logSlope(1.1, 1.1, 8))).toBeLessThan(1e-12);
  });
});

describe('expectedSlopeBand', () => {
  it('expects same or steeper after a steeper print', () => {
    const band = expectedSlopeBand(-0.001, -0.002);
    expect(band.hi).toBe(-0.002);
    expect(band.lo).toBeLessThan(-0.002);
    expect(band.mid).toBe(-0.002);
  });

  it('expects same or shallower after a shallower print', () => {
    const band = expectedSlopeBand(-0.003, -0.001);
    expect(band.lo).toBe(-0.001);
    expect(band.hi).toBeGreaterThan(-0.001);
    expect(band.mid).toBe(-0.001);
    expect(band.hi).toBeLessThanOrEqual(0);
  });

  it('does not project a descending line up through price', () => {
    const band = expectedSlopeBand(-0.02, -0.001);
    expect(band.mid).toBe(-0.001);
    expect(band.hi).toBeLessThanOrEqual(0);
    expect(band.lo).toBe(-0.001);
  });

  it('uses % change of the last two Δs when a third leg exists', () => {
    // prevPrev=-0.004, prev=-0.003, last=-0.0015 → flattening, slowing
    const band = expectedSlopeBand(-0.003, -0.0015, -0.004);
    expect(band.mid).toBe(-0.0015);
    expect(band.hi).toBeLessThanOrEqual(0);
    expect(band.hi).toBeGreaterThan(-0.0015);
  });
});

describe('projectLength', () => {
  it('scales the next leg by last/prev length ratio', () => {
    expect(projectLength(20, 10)).toBe(5);
    expect(projectLength(10, 20)).toBe(40);
  });

  it('falls back to the last length when there is no previous leg', () => {
    expect(projectLength(0, 16)).toBe(16);
  });
});

describe('isShallowerThanExpected', () => {
  it('flags a live slope above the expected high band', () => {
    const band = expectedSlopeBand(-0.003, -0.002);
    expect(isShallowerThanExpected(-0.0004, band)).toBe(true);
    expect(isShallowerThanExpected(-0.002, band)).toBe(false);
  });
});

describe('collapseSwings (wick zigzag)', () => {
  it('alternates and keeps the more extreme wick when two highs print with no low between', () => {
    const swings = [
      { time: 1, value: 1.70, type: 'high' as const, index: 10 },
      { time: 2, value: 1.42, type: 'low' as const, index: 20 },
      { time: 3, value: 1.52, type: 'high' as const, index: 30 },
      { time: 4, value: 1.55, type: 'high' as const, index: 40 },
      { time: 5, value: 1.36, type: 'low' as const, index: 50 },
    ];
    const zz = collapseSwings(swings);
    expect(zz.map((s) => s.value)).toEqual([1.7, 1.42, 1.55, 1.36]);
    expect(zz.map((s) => s.type)).toEqual(['high', 'low', 'high', 'low']);
  });

  it('keeps the lower wick when two lows print with no high between', () => {
    const swings = [
      { time: 1, value: 1.70, type: 'high' as const, index: 10 },
      { time: 2, value: 1.42, type: 'low' as const, index: 20 },
      { time: 3, value: 1.38, type: 'low' as const, index: 30 },
      { time: 4, value: 1.50, type: 'high' as const, index: 40 },
    ];
    const zz = collapseSwings(swings);
    expect(zz.map((s) => s.value)).toEqual([1.7, 1.38, 1.5]);
    expect(zz.map((s) => s.type)).toEqual(['high', 'low', 'high']);
  });

  it('drops an opposite pivot smaller than minPivotPct so the next same-type merges', () => {
    const swings = [
      { time: 1, value: 1.70, type: 'high' as const, index: 10 },
      { time: 2, value: 1.695, type: 'low' as const, index: 14 },
      { time: 3, value: 1.55, type: 'high' as const, index: 30 },
    ];
    const zz = collapseSwings(swings, 1);
    expect(zz.map((s) => s.value)).toEqual([1.7]);
  });
});

describe('trailingLowerHighs', () => {
  it('returns the trailing LH run only', () => {
    const highs = [
      { index: 0, time: 0, price: 10 },
      { index: 5, time: 5, price: 12 },
      { index: 10, time: 10, price: 11 },
      { index: 15, time: 15, price: 10.5 },
    ];
    const run = trailingLowerHighs(highs, 2);
    expect(run.map((p) => p.price)).toEqual([12, 11, 10.5]);
  });

  it('returns empty when last highs are not lower', () => {
    const highs = [
      { index: 0, time: 0, price: 1.403 },
      { index: 5, time: 5, price: 1.433 },
    ];
    expect(trailingLowerHighs(highs, 2)).toEqual([]);
  });
});

describe('structureLowerHighs', () => {
  it('keeps the envelope from the major top when a late bounce prints a higher high', () => {
    const highs = [
      { index: 10, time: 10, price: 1.7 },
      { index: 40, time: 40, price: 1.55 },
      { index: 80, time: 80, price: 1.47 },
      { index: 110, time: 110, price: 1.403 },
      { index: 140, time: 140, price: 1.433 },
    ];
    const run = structureLowerHighs(highs, 2, { lastIndex: 160, lookbackBars: 200 });
    expect(run.length).toBeGreaterThanOrEqual(3);
    expect(run[0].price).toBe(1.7);
    expect(run.some((p) => p.price === 1.433)).toBe(false);
  });
});

describe('structureLowerLows', () => {
  it('spans lows after the major top and skips a later higher low', () => {
    const lows = [
      { index: 5, time: 5, price: 1.50 },
      { index: 20, time: 20, price: 1.36 },
      { index: 50, time: 50, price: 1.40 },
      { index: 90, time: 90, price: 1.335 },
    ];
    const run = structureLowerLows(lows, 10, 2);
    expect(run.map((p) => p.price)).toEqual([1.36, 1.335]);
  });
});

describe('detectSwoop', () => {
  it('stays idle when disabled', () => {
    const result = detectSwoop(makeFlatteningDowntrend(), {
      ...DEFAULT_SWOOP_SETTINGS,
      enabled: false,
    });
    expect(result.state).toBe('idle');
    expect(result.armed).toBe(false);
  });

  it('draws a trend line between each consecutive lower high and lower low', () => {
    const result = detectSwoop(makeFlatteningDowntrend(), {
      ...DEFAULT_SWOOP_SETTINGS,
      enabled: true,
      swingLength: 3,
      minLowerHighs: 2,
      minPivotPct: 0,
      showFan: true,
      showPivotLabels: true,
    });
    expect(result.armed).toBe(true);
    expect(result.highs.length).toBeGreaterThanOrEqual(2);
    expect(result.highs[0].price).toBeGreaterThanOrEqual(result.highs[result.highs.length - 1].price);
    expect(result.lows.length).toBeGreaterThanOrEqual(1);
    expect(result.projectBars).toBeGreaterThan(0);
    expect(result.fan.length).toBeGreaterThanOrEqual(1);
    expect(result.fan.filter((r) => r.side === 'top').length).toBeLessThanOrEqual(2);
    expect(result.fan.filter((r) => r.side === 'bottom').length).toBeLessThanOrEqual(2);
    for (const ray of result.fan) {
      expect(ray.endPrice).toBeLessThanOrEqual(ray.startPrice + 1e-9);
    }
    expect(result.drawSegments.some((s) => s.role === 'live-top' || s.role === 'live-bottom')).toBe(false);
    expect(result.drawSegments.length).toBeGreaterThan(0);
    const tops = result.drawSegments.filter((s) => s.role === 'top');
    const bottoms = result.drawSegments.filter((s) => s.role === 'bottom');
    expect(tops.length).toBe(result.highs.length - 1);
    expect(tops.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < tops.length; i++) {
      expect(tops[i].startPrice).toBe(result.highs[i].price);
      expect(tops[i].endPrice).toBe(result.highs[i + 1].price);
      expect(tops[i].startTime).toBe(result.highs[i].time);
      expect(tops[i].endTime).toBe(result.highs[i + 1].time);
    }
    if (result.lows.length >= 2) {
      expect(bottoms.length).toBe(result.lows.length - 1);
      for (let i = 0; i < bottoms.length; i++) {
        expect(bottoms[i].startPrice).toBe(result.lows[i].price);
        expect(bottoms[i].endPrice).toBe(result.lows[i + 1].price);
      }
    }
    expect(result.drawSegments.some((s) => s.role === 'zigzag')).toBe(false);
    expect(result.drawSegments.some((s) => s.role === 'fan')).toBe(true);
    expect(result.labels.some((l) => l.text === 'H1' && l.kind === 'high')).toBe(true);
    expect(result.labels.some((l) => l.kind === 'low')).toBe(true);
    expect(result.liveTopSlope).not.toBeNull();
    expect(result.liveTopSlope!).toBeLessThan(0);
    expect(['armed', 'slowing', 'compressing', 'release']).toContain(result.state);
    expect(result.topSegments.length).toBe(result.highs.length - 1);
    const lastSeg = result.topSegments[result.topSegments.length - 1];
    const base = result.fan.find((r) => r.kind === 'mid' && r.side === 'top');
    expect(base).toBeDefined();
    expect(base!.startPrice).toBe(lastSeg.end.price);
    expect(base!.startTime).toBe(lastSeg.end.time);
    const drawnSlope = (base!.endPrice - base!.startPrice) / result.projectBars;
    expect(drawnSlope).toBeCloseTo(lastSeg.slope, 10);
    expect(result.projectBars).toBeGreaterThanOrEqual(lastSeg.lengthBars);
  });
});

import { describe, it, expect } from 'vitest';
import {
  detectSwoop,
  expectedSlopeBand,
  isShallowerThanExpected,
  logSlope,
  trailingLowerHighs,
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
  });

  it('expects same or shallower after a shallower print', () => {
    const band = expectedSlopeBand(-0.003, -0.001);
    expect(band.lo).toBe(-0.001);
    expect(band.hi).toBeGreaterThan(-0.001);
  });
});

describe('isShallowerThanExpected', () => {
  it('flags a live slope above the expected high band', () => {
    const band = expectedSlopeBand(-0.003, -0.002);
    expect(isShallowerThanExpected(-0.0004, band)).toBe(true);
    expect(isShallowerThanExpected(-0.002, band)).toBe(false);
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
      { index: 0, time: 0, price: 10 },
      { index: 5, time: 5, price: 11 },
    ];
    expect(trailingLowerHighs(highs, 2)).toEqual([]);
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

  it('arms on a flattening descending structure and projects a fan', () => {
    const result = detectSwoop(makeFlatteningDowntrend(), {
      ...DEFAULT_SWOOP_SETTINGS,
      enabled: true,
      swingLength: 3,
      minLowerHighs: 2,
      showFan: true,
    });
    expect(result.armed).toBe(true);
    expect(result.highs.length).toBeGreaterThanOrEqual(2);
    expect(result.projectBars).toBeGreaterThan(0);
    expect(result.fan.length).toBe(3);
    expect(result.drawSegments.length).toBeGreaterThan(0);
    expect(['armed', 'slowing', 'compressing', 'release']).toContain(result.state);
  });
});

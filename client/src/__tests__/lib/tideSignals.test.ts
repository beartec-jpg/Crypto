// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { describe, it, expect, beforeEach } from 'vitest';
import { calculateTideZone, emaTideScore, type TideZoneCandle, type TideZonePoint } from '@/lib/indicators/tideZone';
import {
  computeTideCross,
  freshTideCross,
  inferTideTimeframe,
  resolveTideTimeframe,
  tideTimeframeOf,
  type TideCrossParams,
} from '@/lib/indicators/tideSignals';
import { calculateTideZoneForTimeframe } from '@/lib/indicators/tideTimeframe';
import {
  DEFAULT_TIDE_ZONE_SETTINGS,
  TIDE_ZONE_SETTINGS,
  normalizeTideZoneSettings,
} from '@/types/tideZoneSettings';
import {
  TIDE_SETTINGS_KEY,
  resetTideZoneSettingsCache,
  saveTideZoneSettings,
} from '@/hooks/useTideZoneSettings';
import fx4h from './fixtures/tide_btc_4h.json';
import fx1h from './fixtures/tide_btc_1h.json';

const HOUR = 3600;
const T0 = 1_700_000_000 - (1_700_000_000 % HOUR);
const FAR_FUTURE = 4_102_444_800; // every synthetic bar is closed

function pts(scores: number[]): TideZonePoint[] {
  return scores.map((score, i) => ({
    time: T0 + i * HOUR,
    score,
    tide: 0.5,
    energy: 0.5,
    tape: 0.5,
    kind: 'neutral',
  }));
}

const P: TideCrossParams = { emaShort: 3, emaLong: 10, tideInLevel: -40, tideOutLevel: 40, crossEma: 'short' };
const run = (scores: number[], over: Partial<TideCrossParams> = {}) =>
  computeTideCross(pts(scores), { ...P, ...over }, { nowSec: FAR_FUTURE });

// Down to a deep low, then back up through the EMA: score crosses ABOVE the EMA (Tide in).
const DIP = [0, 0, 0, 0, -20, -50, -70, -75, -60, -30, 10];
// Up to a high, then fall through the EMA: score crosses BELOW the EMA (Tide out).
const SPIKE = [0, 0, 0, 0, 20, 50, 70, 75, 60, 30, -10];

describe('Tide in / Tide out cross', () => {
  it('Tide in fires when the EMA crosses below the histogram, only at or under the Tide-in level', () => {
    const deep = run(DIP, { tideInLevel: -40 });
    // the cross happens as score recovers; with level -40 the cross bar score must be <= -40
    for (const s of deep.signals.filter((x) => x.kind === 'in')) expect(s.score).toBeLessThanOrEqual(-40);
    const lax = run(DIP, { tideInLevel: 0 });
    expect(lax.signals.filter((x) => x.kind === 'in').length).toBeGreaterThan(0);
    // a level of -80 is stricter than the dip allows at the cross bar: no signal
    const strict = run(DIP, { tideInLevel: -80 });
    expect(strict.signals.filter((x) => x.kind === 'in')).toHaveLength(0);
  });

  it('Tide in marks the bar where score moves from at/below the EMA to above it', () => {
    const r = run(DIP, { tideInLevel: 0 });
    const ema = emaTideScore(pts(DIP), 3);
    const sg = r.signals.find((x) => x.kind === 'in')!;
    const i = (sg.time - T0) / HOUR;
    expect(DIP[i - 1] - ema[i - 1].value).toBeLessThanOrEqual(0);
    expect(DIP[i] - ema[i].value).toBeGreaterThan(0);
    expect(sg.ema).toBeCloseTo(ema[i].value, 9);
  });

  it('Tide out fires when the EMA crosses above the histogram, only at or over the Tide-out level', () => {
    const lax = run(SPIKE, { tideOutLevel: 0 });
    const outs = lax.signals.filter((x) => x.kind === 'out');
    expect(outs.length).toBeGreaterThan(0);
    const ema = emaTideScore(pts(SPIKE), 3);
    const i = (outs[0].time - T0) / HOUR;
    expect(SPIKE[i - 1] - ema[i - 1].value).toBeGreaterThanOrEqual(0);
    expect(SPIKE[i] - ema[i].value).toBeLessThan(0);
    for (const s of run(SPIKE, { tideOutLevel: 40 }).signals.filter((x) => x.kind === 'out')) {
      expect(s.score).toBeGreaterThanOrEqual(40);
    }
    // level 80 is above every score in the series: nothing fires
    expect(run(SPIKE, { tideOutLevel: 80 }).signals.filter((x) => x.kind === 'out')).toHaveLength(0);
  });

  it('a Tide-out gate never lets a Tide in through, and vice versa', () => {
    expect(run(DIP, { tideInLevel: 0 }).signals.every((s) => s.kind === 'in')).toBe(true);
    expect(run(SPIKE, { tideOutLevel: 0 }).signals.every((s) => s.kind === 'out')).toBe(true);
  });

  it('level 0 / 0 allows crosses at any non-positive / non-negative score', () => {
    const wave = Array.from({ length: 80 }, (_, i) => Math.sin(i / 4) * 60);
    const r = run(wave, { tideInLevel: 0, tideOutLevel: 0 });
    expect(r.signals.some((s) => s.kind === 'in')).toBe(true);
    expect(r.signals.some((s) => s.kind === 'out')).toBe(true);
  });
});

describe('Short / Long driver toggle', () => {
  const wave = Array.from({ length: 160 }, (_, i) => Math.sin(i / 5) * 70 + Math.sin(i / 1.7) * 15);
  const loose = { tideInLevel: 0, tideOutLevel: 0, emaShort: 4, emaLong: 25 };

  it('short mode crosses the short EMA, long mode crosses the long EMA', () => {
    const data = pts(wave);
    const s = computeTideCross(data, { ...P, ...loose, crossEma: 'short' }, { nowSec: FAR_FUTURE });
    const l = computeTideCross(data, { ...P, ...loose, crossEma: 'long' }, { nowSec: FAR_FUTURE });
    expect(s.signals.length).toBeGreaterThan(0);
    expect(l.signals.length).toBeGreaterThan(0);
    expect(s.signals.map((x) => x.time)).not.toEqual(l.signals.map((x) => x.time));
    const eShort = emaTideScore(data, 4);
    const eLong = emaTideScore(data, 25);
    for (const x of s.signals) expect(x.ema).toBeCloseTo(eShort[(x.time - T0) / HOUR].value, 9);
    for (const x of l.signals) expect(x.ema).toBeCloseTo(eLong[(x.time - T0) / HOUR].value, 9);
  });

  it('the toggle follows the label, not which period is larger', () => {
    const data = pts(wave);
    // "short" has the LARGER period here: still the one that drives the cross when selected
    const swapped = { ...P, tideInLevel: 0, tideOutLevel: 0, emaShort: 25, emaLong: 4 };
    const s = computeTideCross(data, { ...swapped, crossEma: 'short' }, { nowSec: FAR_FUTURE });
    const e = emaTideScore(data, 25);
    for (const x of s.signals) expect(x.ema).toBeCloseTo(e[(x.time - T0) / HOUR].value, 9);
  });

  it('both EMAs are always returned for drawing', () => {
    const r = computeTideCross(pts(wave), { ...P, ...loose, crossEma: 'long' }, { nowSec: FAR_FUTURE });
    expect(r.emaShort).toHaveLength(wave.length);
    expect(r.emaLong).toHaveLength(wave.length);
  });
});

describe('no repaint', () => {
  const wave = Array.from({ length: 200 }, (_, i) => Math.sin(i / 5) * 70 + Math.sin(i / 1.7) * 15);
  const params: TideCrossParams = { emaShort: 5, emaLong: 20, tideInLevel: -10, tideOutLevel: 10, crossEma: 'short' };

  it.each(['short', 'long'] as const)('signals never change as bars are appended (%s)', (crossEma) => {
    const full = computeTideCross(pts(wave), { ...params, crossEma }, { nowSec: FAR_FUTURE }).signals;
    for (const n of [60, 100, 150, 199]) {
      const prefix = computeTideCross(pts(wave.slice(0, n)), { ...params, crossEma }, { nowSec: FAR_FUTURE }).signals;
      expect(prefix.length).toBeGreaterThan(0);
      expect(full.slice(0, prefix.length)).toEqual(prefix);
    }
  });

  it('ignores the still-forming last bar', () => {
    const data = pts(wave);
    const lastTime = data[data.length - 1].time;
    const open = computeTideCross(data, params, { nowSec: lastTime + 60 });
    expect(open.lastBarOpen).toBe(true);
    const closed = computeTideCross(data.slice(0, -1), params, { nowSec: FAR_FUTURE });
    expect(open.signals).toEqual(closed.signals);
    expect(computeTideCross(data, params, { nowSec: lastTime + HOUR }).lastBarOpen).toBe(false);
  });

  it('freshTideCross only returns a print from the last few bars', () => {
    const data = pts(SPIKE);
    const r = computeTideCross(data, { ...P, tideOutLevel: 0 }, { nowSec: FAR_FUTURE });
    const last = r.signals[r.signals.length - 1];
    const idx = (last.time - T0) / HOUR;
    expect(freshTideCross(r.signals, data.slice(0, idx + 1))).toEqual(last);
    expect(freshTideCross(r.signals, pts([...SPIKE, -20, -20, -20, -20]))).toBeNull();
    expect(freshTideCross([], data)).toBeNull();
  });
});

describe('Tide score is unchanged (real BTC bars)', () => {
  it.each([
    ['4h', fx4h],
    ['1h', fx1h],
  ])('matches the stored %s score bar for bar', (_tf, fx) => {
    const candles: TideZoneCandle[] = (fx.candles as number[][]).map(([time, open, high, low, close, volume]) => ({
      time,
      open,
      high,
      low,
      close,
      volume,
    }));
    const data = calculateTideZone(candles);
    const byTime = new Map(data.map((d) => [d.time, d.score]));
    (fx.score as (number | null)[]).forEach((want, i) => {
      const got = byTime.get(candles[i].time);
      if (want === null) expect(got).toBeUndefined();
      else expect(got).toBeCloseTo(want, 6);
    });
  });
});

describe('timeframe gating', () => {
  const mk = (n: number, step: number): TideZoneCandle[] =>
    Array.from({ length: n }, (_, i) => {
      const c = 100 + Math.sin(i / 7) * 5 + i * 0.01;
      return { time: 1_700_000_000 + i * step, open: c, high: c + 1, low: c - 1, close: c, volume: 10 + (i % 5) };
    });

  it('normalizes interval strings', () => {
    expect(tideTimeframeOf('1h')).toBe('1h');
    expect(tideTimeframeOf('4H')).toBe('4h');
    expect(tideTimeframeOf('240')).toBe('4h');
    expect(tideTimeframeOf('15m')).toBeNull();
    expect(tideTimeframeOf('1d')).toBeNull();
    expect(tideTimeframeOf(undefined)).toBeNull();
  });

  it('infers from bar spacing only when no interval is given', () => {
    expect(inferTideTimeframe(mk(10, 3600))).toBe('1h');
    expect(inferTideTimeframe(mk(10, 14400))).toBe('4h');
    expect(inferTideTimeframe(mk(10, 900))).toBeNull();
    expect(resolveTideTimeframe(undefined, mk(10, 14400))).toBe('4h');
    expect(resolveTideTimeframe('15m', mk(10, 14400))).toBeNull();
    expect(resolveTideTimeframe('1h', mk(10, 900))).toBe('1h');
  });

  it('Tide is blank off 1h/4h', () => {
    expect(calculateTideZoneForTimeframe(mk(400, 900), '15m')).toEqual({ timeframe: null, data: [] });
    expect(calculateTideZoneForTimeframe(mk(400, 86400), '1d').data).toEqual([]);
    const h1 = calculateTideZoneForTimeframe(mk(400, 3600), '1h');
    expect(h1.timeframe).toBe('1h');
    expect(h1.data.length).toBeGreaterThan(0);
    expect(calculateTideZoneForTimeframe(mk(400, 14400), '4h').timeframe).toBe('4h');
  });
});

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetTideZoneSettingsCache();
  });

  it('defaults: short 8, long 21, in -40, out 40, Short drives the cross', () => {
    expect(TIDE_ZONE_SETTINGS).toEqual({ emaShort: 8, emaLong: 21, tideInLevel: -40, tideOutLevel: 40, crossEma: 'short' });
    expect(DEFAULT_TIDE_ZONE_SETTINGS).toBe(TIDE_ZONE_SETTINGS);
  });

  it('clamps to the slider ranges and rejects garbage', () => {
    expect(normalizeTideZoneSettings({ emaShort: 0, emaLong: 500, tideInLevel: -200, tideOutLevel: 200 })).toMatchObject({
      emaShort: 1,
      emaLong: 100,
      tideInLevel: -80,
      tideOutLevel: 80,
    });
    expect(normalizeTideZoneSettings({ tideInLevel: 25, tideOutLevel: -25 })).toMatchObject({ tideInLevel: 0, tideOutLevel: 0 });
    expect(normalizeTideZoneSettings({ emaShort: 'x', crossEma: 'weird' })).toEqual(TIDE_ZONE_SETTINGS);
    expect(normalizeTideZoneSettings(null)).toEqual(TIDE_ZONE_SETTINGS);
    expect(normalizeTideZoneSettings({ emaShort: 7.6 }).emaShort).toBe(8);
  });

  it('persists every field including the Short/Long toggle', () => {
    saveTideZoneSettings({ emaShort: 5, emaLong: 34, tideInLevel: -55, tideOutLevel: 25, crossEma: 'long' });
    const stored = JSON.parse(localStorage.getItem(TIDE_SETTINGS_KEY)!);
    expect(stored).toEqual({ emaShort: 5, emaLong: 34, tideInLevel: -55, tideOutLevel: 25, crossEma: 'long' });
    resetTideZoneSettingsCache();
    // re-read from storage
    saveTideZoneSettings({});
    expect(JSON.parse(localStorage.getItem(TIDE_SETTINGS_KEY)!).crossEma).toBe('long');
  });

  it('ignores the old v2 storage key', () => {
    localStorage.setItem('tide-zone-settings-v2', JSON.stringify({ emaShort: 99 }));
    resetTideZoneSettingsCache();
    expect(saveTideZoneSettings({}).emaShort).toBe(8);
  });
});

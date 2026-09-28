import { describe, it, expect } from 'vitest';
import { calculateTideZone, type TideZoneCandle } from '@/lib/indicators/tideZone';
import {
  alignTideScores,
  buildTideTrades,
  computeTideV2,
  detectTideInPeaks,
  detectTideOutSignals,
  emaCarry,
  inferTideTimeframe,
  mergeTideSignals,
  resolveTideTimeframe,
  tideStopLevel,
  tideTimeframeOf,
  type TideOutSignal,
  type TideSignalParams,
} from '@/lib/indicators/tideSignals';
import { calculateTideZoneForTimeframe } from '@/lib/indicators/tideTimeframe';
import {
  DEFAULT_TIDE_ZONE_SETTINGS,
  TIDE_PRESETS,
  isTidePreset,
  normalizeTideZoneSettings,
  tideParamsFor,
} from '@/types/tideZoneSettings';
import fx4h from './fixtures/tide_btc_4h.json';
import fx1h from './fixtures/tide_btc_1h.json';

/**
 * Fixtures: real BTCUSDT perp bars from the research warehouse, with the expected output of
 * the Python live-accurate detector (tl_core.causal_divs / causal_ema_peaks / atr_series)
 * computed on exactly these bars. Regenerate with scripts/tide_v2_parity_fixture.py.
 */
interface Fixture {
  interval: '1h' | '4h';
  preset: {
    emaPeriod: number;
    pivotN: number;
    belowScore: number;
    exitEmaPeriod: number;
    exitPivotN: number;
    stop: { kind: 'atr'; mult: number } | { kind: 'pct'; pct: number };
  };
  candles: number[][];
  score: (number | null)[];
  emaOut: (number | null)[];
  emaIn: (number | null)[];
  signals: {
    confirmTime: number;
    pivotTime: number;
    pivotPrice: number;
    pivot1Time: number;
    pivot1Price: number;
    minRsi: number | null;
    rsiPlus: boolean;
  }[];
  alt: { params: { emaPeriod: number; pivotN: number; belowScore: number }; signals: { confirmTime: number; pivotTime: number; pivot1Time: number }[] };
  peaks: number[];
  trades: { confirmTime: number; entryPrice: number | null; stop: number; outcome: string; exitTime: number | null; tideInTime: number | null }[];
}

const FAR_FUTURE = 4_102_444_800; // 2100 — every fixture bar is closed
const ALL = { nowSec: FAR_FUTURE, warmupBars: 0 };

function candlesOf(fx: Fixture): TideZoneCandle[] {
  return fx.candles.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));
}

function paramsOf(fx: Fixture): TideSignalParams {
  const p = fx.preset;
  return {
    emaPeriod: p.emaPeriod,
    pivotN: p.pivotN,
    belowScore: p.belowScore,
    exitEmaPeriod: p.exitEmaPeriod,
    exitPivotN: p.exitPivotN,
    stopKind: p.stop.kind,
    stopAtrMult: p.stop.kind === 'atr' ? p.stop.mult : 0.5,
    stopPct: p.stop.kind === 'pct' ? p.stop.pct : 0.005,
  };
}

const sigKey = (s: Pick<TideOutSignal, 'confirmTime' | 'pivotTime'>) => `${s.confirmTime}:${s.pivotTime}`;

describe.each([
  ['4h', fx4h as unknown as Fixture],
  ['1h', fx1h as unknown as Fixture],
])('Python ↔ TS parity on real BTC %s bars', (_tf, fx) => {
  const candles = candlesOf(fx);
  const data = calculateTideZone(candles);
  const params = paramsOf(fx);
  const res = computeTideV2(candles, data, params, ALL);
  const lastTime = candles[candles.length - 1].time;

  it('uses the validated preset for this timeframe', () => {
    expect(params).toEqual(TIDE_PRESETS[fx.interval]);
  });

  it('Tide score matches bar for bar', () => {
    const scores = alignTideScores(candles, data);
    expect(scores).toHaveLength(fx.score.length);
    fx.score.forEach((want, i) => {
      if (want === null) expect(Number.isNaN(scores[i])).toBe(true);
      else expect(scores[i]).toBeCloseTo(want, 6);
    });
  });

  it('smoothing EMA and Tide-in EMA match', () => {
    const scores = alignTideScores(candles, data);
    const eo = emaCarry(scores, params.emaPeriod);
    const ei = emaCarry(scores, params.exitEmaPeriod);
    fx.emaOut.forEach((want, i) => {
      if (want === null) expect(Number.isNaN(eo[i])).toBe(true);
      else expect(eo[i]).toBeCloseTo(want, 6);
    });
    fx.emaIn.forEach((want, i) => {
      if (want === null) expect(Number.isNaN(ei[i])).toBe(true);
      else expect(ei[i]).toBeCloseTo(want, 6);
    });
  });

  it('Tide-out signals (bars, prices, RSI+) match', () => {
    // Python skips a signal on the final bar (no next bar to fill); the chart shows it.
    const got = res.signals.filter((s) => s.confirmTime < lastTime);
    expect(fx.signals.length).toBeGreaterThan(0);
    expect(got.map((s) => [s.confirmTime, s.pivotTime, s.pivot1Time])).toEqual(
      fx.signals.map((s) => [s.confirmTime, s.pivotTime, s.pivot1Time]),
    );
    got.forEach((s, k) => {
      const want = fx.signals[k];
      expect(s.pivotPrice).toBe(want.pivotPrice);
      expect(s.pivot1Price).toBe(want.pivot1Price);
      expect(s.rsiPlus).toBe(want.rsiPlus);
      if (want.minRsi !== null) expect(s.minRsi).toBeCloseTo(want.minRsi, 4);
    });
    expect(got.some((s) => s.rsiPlus)).toBe(true);
    expect(got.some((s) => !s.rsiPlus)).toBe(true);
  });

  it('alternate thresholds match too (detector is parameter-true)', () => {
    const scores = alignTideScores(candles, data);
    const a = fx.alt.params;
    const got = detectTideOutSignals(candles, emaCarry(scores, a.emaPeriod), a).filter(
      (s) => s.confirmTime < lastTime,
    );
    expect(got.map((s) => [s.confirmTime, s.pivotTime, s.pivot1Time])).toEqual(
      fx.alt.signals.map((s) => [s.confirmTime, s.pivotTime, s.pivot1Time]),
    );
  });

  it('Tide-in peaks match', () => {
    expect(res.peaks.filter((p) => p.confirmTime < lastTime).map((p) => p.confirmTime)).toEqual(fx.peaks);
  });

  it('stop levels and outcomes match', () => {
    const got = res.trades.filter((t) => t.signal.confirmTime < lastTime);
    expect(got).toHaveLength(fx.trades.length);
    got.forEach((t, k) => {
      const want = fx.trades[k];
      expect(t.signal.confirmTime).toBe(want.confirmTime);
      expect(t.entryPrice).toBe(want.entryPrice);
      expect(t.stop).toBeCloseTo(want.stop, 6);
      expect(t.outcome).toBe(want.outcome);
      expect(t.exitTime).toBe(want.exitTime);
      expect(t.tideInTime).toBe(want.tideInTime);
    });
    expect(got.some((t) => t.outcome === 'stop')).toBe(true);
    expect(got.some((t) => t.outcome === 'tide_in')).toBe(true);
  });

  it('signals never disappear or change as bars are appended', () => {
    const final = new Map(res.signals.map((s) => [sigKey(s), s]));
    const finalPeaks = res.peaks.map((p) => p.confirmTime);
    const finalScores = alignTideScores(candles, data);
    const start = 300;
    for (let k = start; k <= candles.length; k += 5) {
      const prefix = candles.slice(0, k);
      const prefixData = calculateTideZone(prefix);
      const r = computeTideV2(prefix, prefixData, params, ALL);
      const tEnd = prefix[prefix.length - 1].time;
      // the score itself is point-in-time (incl. the newest bar mid-4h-bucket on 1h)
      const ps = alignTideScores(prefix, prefixData);
      ps.forEach((v, i) => {
        if (Number.isNaN(finalScores[i])) expect(Number.isNaN(v)).toBe(true);
        else expect(v).toBe(finalScores[i]);
      });
      // point-in-time: exactly the final signals already confirmed by this bar, unchanged
      const expected = res.signals.filter((s) => s.confirmTime <= tEnd).map(sigKey);
      expect(r.signals.map(sigKey)).toEqual(expected);
      for (const s of r.signals) expect(s).toEqual(final.get(sigKey(s)));
      expect(r.peaks.map((p) => p.confirmTime)).toEqual(finalPeaks.filter((t) => t <= tEnd));
    }
  });

  it('hides signals inside the warm-up bars by default', () => {
    const def = computeTideV2(candles, data, params, { nowSec: FAR_FUTURE });
    const cutoff = candles[400].time;
    expect(def.signals.map(sigKey)).toEqual(res.signals.filter((s) => s.confirmTime >= cutoff).map(sigKey));
  });

  it('ignores the still-forming last bar', () => {
    const last = candles[candles.length - 1];
    const bar = candles[1].time - candles[0].time;
    const live = computeTideV2(candles, data, params, { nowSec: last.time + bar / 2, warmupBars: 0 });
    const closed = computeTideV2(candles.slice(0, -1), calculateTideZone(candles.slice(0, -1)), params, ALL);
    expect(live.lastBarOpen).toBe(true);
    expect(live.signals.map(sigKey)).toEqual(closed.signals.map(sigKey));
    expect(live.peaks).toEqual(closed.peaks);
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

describe('presets and settings', () => {
  it('ships the validated per-timeframe presets', () => {
    expect(TIDE_PRESETS['4h']).toMatchObject({ emaPeriod: 8, pivotN: 3, belowScore: -20, exitEmaPeriod: 8, exitPivotN: 5, stopKind: 'atr', stopAtrMult: 0.5 });
    expect(TIDE_PRESETS['1h']).toMatchObject({ emaPeriod: 21, pivotN: 8, belowScore: -40, exitEmaPeriod: 8, exitPivotN: 8, stopKind: 'pct', stopPct: 0.005 });
  });

  it('selects settings by timeframe and none elsewhere', () => {
    const s = normalizeTideZoneSettings(null);
    expect(tideParamsFor(s, '4h')).toEqual(TIDE_PRESETS['4h']);
    expect(tideParamsFor(s, '1h')).toEqual(TIDE_PRESETS['1h']);
    expect(tideParamsFor(s, null)).toBeNull();
    expect(isTidePreset(s.byTimeframe['1h'], '1h')).toBe(true);
  });

  it('keeps 1h and 4h edits separate and clamps bad values', () => {
    const s = normalizeTideZoneSettings({
      byTimeframe: {
        '1h': { ...TIDE_PRESETS['1h'], pivotN: 99, belowScore: -30 },
        '4h': { ...TIDE_PRESETS['4h'], stopKind: 'nope' as never, emaPeriod: Number.NaN },
      },
    });
    expect(s.byTimeframe['1h'].pivotN).toBe(21);
    expect(s.byTimeframe['1h'].belowScore).toBe(-30);
    expect(s.byTimeframe['4h']).toEqual(TIDE_PRESETS['4h']);
    expect(isTidePreset(s.byTimeframe['1h'], '1h')).toBe(false);
  });

  it('defaults hide nothing validated and keep absorb off', () => {
    expect(DEFAULT_TIDE_ZONE_SETTINGS.showTideOut && DEFAULT_TIDE_ZONE_SETTINGS.showTideIn && DEFAULT_TIDE_ZONE_SETTINGS.showStops).toBe(true);
    expect(DEFAULT_TIDE_ZONE_SETTINGS.showAbsorb).toBe(false);
    expect('minGap' in DEFAULT_TIDE_ZONE_SETTINGS).toBe(false);
  });
});

describe('RSI +, stops and Tide-in (synthetic)', () => {
  // Two-leg dip: price LL at bar 26 vs Tide-EMA HL, both troughs well below the threshold.
  function scenario() {
    const n = 60;
    const candles = [];
    const ema: number[] = [];
    for (let i = 0; i < n; i++) {
      let v: number;
      if (i <= 10) v = -5 * i;
      else if (i <= 18) v = -50 + 6 * (i - 10);
      else if (i <= 26) v = -2 - 3 * (i - 18);
      else if (i <= 40) v = -26 + 5 * (i - 26);
      else v = 44 - 4 * (i - 40);
      ema.push(v);
      let low = 100;
      if (i === 10) low = 50;
      else if (i === 26) low = 40;
      else if (i > 26) low = 60 + (i - 26);
      candles.push({ time: 1000 + i * 3600, open: low + 5, high: low + 10, low, close: low + 5 });
    }
    return { candles, ema };
  }

  it('flags RSI < 30 between pivot and confirmation as Tide out +', () => {
    const { candles, ema } = scenario();
    const rsiLow = candles.map((_, i) => (i === 27 ? 25 : 45));
    const rsiHigh = candles.map(() => 45);
    const plus = detectTideOutSignals(candles, ema, { pivotN: 3, belowScore: -20 }, rsiLow);
    const plain = detectTideOutSignals(candles, ema, { pivotN: 3, belowScore: -20 }, rsiHigh);
    expect(plus).toHaveLength(1);
    expect(plus[0].pivotTime).toBe(candles[26].time);
    expect(plus[0].confirmTime).toBe(candles[29].time);
    expect(plus[0].rsiPlus).toBe(true);
    expect(plus[0].minRsi).toBe(25);
    expect(plain[0].rsiPlus).toBe(false);
    // RSI < 30 before the pivot bar does not count
    const early = detectTideOutSignals(candles, ema, { pivotN: 3, belowScore: -20 }, candles.map((_, i) => (i === 25 ? 20 : 45)));
    expect(early[0].rsiPlus).toBe(false);
  });

  it('stop level: 4h pivot − 0.5 ATR, 1h pivot − 0.5%', () => {
    expect(tideStopLevel(100, 4, TIDE_PRESETS['4h'])).toBe(98);
    expect(tideStopLevel(100, 4, TIDE_PRESETS['1h'])).toBeCloseTo(99.5, 10);
    // never above the fill
    expect(tideStopLevel(100, 4, TIDE_PRESETS['1h'], 99)).toBeCloseTo(98.505, 10);
  });

  it('Tide-in peak closes the trade at the next open; stop line runs to it', () => {
    const { candles, ema } = scenario();
    const signals = detectTideOutSignals(candles, ema, { pivotN: 3, belowScore: -20 });
    const peaks = detectTideInPeaks(candles, ema, 3);
    expect(peaks.map((p) => p.peakTime)).toContain(candles[40].time);
    const pk = peaks.find((p) => p.peakTime === candles[40].time)!;
    expect(pk.confirmTime).toBe(candles[43].time);
    const [t] = buildTideTrades(candles, signals, peaks, TIDE_PRESETS['1h']);
    expect(t.entryPrice).toBe(candles[30].open);
    expect(t.stop).toBeCloseTo(40 * 0.995, 10);
    expect(t.outcome).toBe('tide_in');
    expect(t.tideInTime).toBe(candles[43].time);
    expect(t.exitTime).toBe(candles[44].time);
    expect(t.endTime).toBe(candles[44].time);
  });

  it('stop hit ends the line on the hit bar', () => {
    const { candles, ema } = scenario();
    candles[33] = { ...candles[33], low: 30 };
    const signals = detectTideOutSignals(candles, ema, { pivotN: 3, belowScore: -20 });
    const [t] = buildTideTrades(candles, signals, detectTideInPeaks(candles, ema, 3), TIDE_PRESETS['1h']);
    expect(t.outcome).toBe('stop');
    expect(t.exitTime).toBe(candles[33].time);
    expect(t.endTime).toBe(candles[33].time);
  });

  it('open trade runs to the newest bar', () => {
    const { candles, ema } = scenario();
    const cut = candles.slice(0, 36);
    const signals = detectTideOutSignals(cut, ema.slice(0, 36), { pivotN: 3, belowScore: -20 });
    const [t] = buildTideTrades(cut, signals, [], TIDE_PRESETS['1h']);
    expect(t.outcome).toBe('open');
    expect(t.endTime).toBe(cut[35].time);
  });
});

describe('mergeTideSignals', () => {
  const s = (c: number, p: number, rsiPlus = false): TideOutSignal => ({
    confirmTime: c,
    pivotTime: p,
    pivotPrice: 1,
    pivot1Time: p - 10,
    pivot1Price: 2,
    ema1: -50,
    ema2: -40,
    minRsi: null,
    rsiPlus,
  });
  it('never drops a signal that was already shown and keeps its first version', () => {
    const merged = mergeTideSignals([s(10, 5, true), s(20, 15)], [s(20, 15, true), s(30, 25)]);
    expect(merged.map((x) => x.confirmTime)).toEqual([10, 20, 30]);
    expect(merged[1].rsiPlus).toBe(false);
  });
});

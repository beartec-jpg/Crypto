import { describe, expect, it } from 'vitest';
import {
  alignToChart,
  bbCompFromPctB,
  bollingerPctB,
  buildTetherLadder,
  buildTetherLadderMarkers,
  buildTetherMarkers,
  detectRsiDivergences,
  findPivots,
  computeTetherDivergence,
  DAY_SECONDS,
  emaCompFromDist,
  emaSeries,
  rsiWilder,
  tetherZoneColor,
  tetherZoneLabel,
  utcMondayOpenSec,
  WEEK_SECONDS,
  zoneFromScore,
  type TetherCoinCandle,
  type DailyPoint,
} from '@/lib/indicators/tetherDivergence';
import {
  TETHER_STRETCH_SETTINGS,
  normalizeTetherDivergenceSettings,
} from '@/types/tetherDivergenceSettings';

function candle(time: number, close: number, extra: Partial<TetherCoinCandle> = {}): TetherCoinCandle {
  return {
    time,
    open: extra.open ?? close,
    high: extra.high ?? close,
    low: extra.low ?? close,
    close,
    volume: extra.volume ?? 1,
  };
}

function series(n: number, start: number, step = DAY_SECONDS, value: (i: number) => number): DailyPoint[] {
  return Array.from({ length: n }, (_, i) => ({ time: start + i * step, value: value(i) }));
}

function coins(n: number, start: number, step = DAY_SECONDS, close: (i: number) => number): TetherCoinCandle[] {
  return Array.from({ length: n }, (_, i) => candle(start + i * step, close(i)));
}

const DAY0 = Date.UTC(2024, 0, 1) / 1000; // Monday 2024-01-01
const FAR = DAY0 + 400 * DAY_SECONDS;

describe('rsiWilder', () => {
  it('returns null during warm-up and a known RSI(2)', () => {
    const values = [10, 12, 11, 13];
    const rsi = rsiWilder(values, 2);
    expect(rsi[0]).toBeNull();
    expect(rsi[1]).toBeNull();
    expect(rsi[2]).toBeCloseTo(100 - 100 / 3, 10);
    expect(rsi[3]).toBeCloseTo(100 - 100 / 7, 10);
  });

  it('is 100 after a run of ups and 0 after a run of downs', () => {
    const ups = rsiWilder([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 5);
    expect(ups[5]).toBe(100);
    expect(ups[14]).toBe(100);
    const downs = rsiWilder([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 5);
    expect(downs[5]).toBe(0);
    expect(downs[14]).toBe(0);
  });
});

describe('emaSeries / bollingerPctB', () => {
  it('SMA-seeds EMA then compounds', () => {
    const ema = emaSeries([1, 2, 3, 4], 3);
    expect(ema[0]).toBeNull();
    expect(ema[1]).toBeNull();
    expect(ema[2]).toBeCloseTo(2, 10);
    expect(ema[3]).toBeCloseTo(3, 10);
  });

  it('constant series: EMA equals the constant; %B is 0.5 when width is 0', () => {
    const vals = [10, 10, 10, 10, 10];
    const ema = emaSeries(vals, 3);
    expect(ema[4]).toBeCloseTo(10, 10);
    const pctB = bollingerPctB(vals, 3, 2);
    expect(pctB[0]).toBeNull();
    expect(pctB[1]).toBeNull();
    expect(pctB[2]).toBe(0.5);
    expect(pctB[4]).toBe(0.5);
  });

  it('population %B at the window high of [1,2,3]', () => {
    const pctB = bollingerPctB([1, 2, 3], 3, 2);
    const std = Math.sqrt(2 / 3);
    const lower = 2 - 2 * std;
    const upper = 2 + 2 * std;
    expect(pctB[2]).toBeCloseTo((3 - lower) / (upper - lower), 10);
  });
});

describe('component mapping', () => {
  it('clamps rsi/ema/bb components to 0..100 centred on 50', () => {
    expect(emaCompFromDist(0, 4)).toBe(50);
    expect(emaCompFromDist(4, 4)).toBe(100);
    expect(emaCompFromDist(-4, 4)).toBe(0);
    expect(emaCompFromDist(100, 4)).toBe(100);
    expect(emaCompFromDist(-100, 4)).toBe(0);
    expect(bbCompFromPctB(0)).toBe(0);
    expect(bbCompFromPctB(0.5)).toBe(50);
    expect(bbCompFromPctB(1)).toBe(100);
    expect(bbCompFromPctB(-1)).toBe(0);
    expect(bbCompFromPctB(2)).toBe(100);
  });
});

describe('zone thresholds', () => {
  it('treats exactly 80 as bottom, 60 as watch, just below as the lower band', () => {
    expect(zoneFromScore(80, 80, 60)).toBe('bottom');
    expect(zoneFromScore(79.999, 80, 60)).toBe('watch');
    expect(zoneFromScore(60, 80, 60)).toBe('watch');
    expect(zoneFromScore(59.999, 80, 60)).toBe('neutral');
    expect(zoneFromScore(null, 80, 60)).toBeNull();
  });
});

describe('computeTetherDivergence', () => {
  it('blends stretch vs coin-oversold with custom weights and inverts coin RSI', () => {
    const n = 80;
    const usdtd = series(n, DAY0, DAY_SECONDS, () => 8);
    const coinCandles = coins(n, DAY0, DAY_SECONDS, () => 100);
    const res = computeTetherDivergence({
      coinCandles,
      usdtd,
      nowSec: FAR,
      settings: { wRsi: 1, wEma: 0, wBb: 0, wStretch: 1, wCoin: 1 },
    });
    const last = res.score.length - 1;
    expect(res.usdtRsi[last]).not.toBeNull();
    expect(res.coinRsi[last]).not.toBeNull();
    expect(res.coinOversold[last]).toBeCloseTo(100 - (res.coinRsi[last] as number), 8);
    expect(res.score[last]).toBeCloseTo(
      ((res.stretch[last] as number) + (res.coinOversold[last] as number)) / 2,
      6,
    );
  });

  it('uses 2:1 stretch vs coin weights', () => {
    const n = 80;
    const usdtd = series(n, DAY0, DAY_SECONDS, (i) => 5 + i * 0.02);
    const coinCandles = coins(n, DAY0, DAY_SECONDS, (i) => 100 - i * 0.3);
    const res = computeTetherDivergence({
      coinCandles,
      usdtd,
      nowSec: FAR,
      settings: { wStretch: 2, wCoin: 1, wRsi: 1, wEma: 1, wBb: 1 },
    });
    const i = res.score.length - 1;
    const expected =
      (2 * (res.stretch[i] as number) + 1 * (res.coinOversold[i] as number)) / 3;
    expect(res.score[i]).toBeCloseTo(expected, 8);
  });

  it('computes the Stretch - (top) score formula', () => {
    const n = 80;
    const usdtd = series(n, DAY0, DAY_SECONDS, (i) => 6 + Math.sin(i / 7));
    const coinCandles = coins(n, DAY0, DAY_SECONDS, (i) => 50 + i);
    const res = computeTetherDivergence({
      coinCandles,
      usdtd,
      nowSec: FAR,
      settings: { wStretch: 1, wCoin: 1 },
    });
    const i = res.score.length - 1;
    const expected =
      (1 * (100 - (res.stretch[i] as number)) + 1 * (res.coinRsi[i] as number)) / 2;
    expect(res.topScore[i]).toBeCloseTo(expected, 8);
  });

  it('marks gap when USDT.D RSI is high and coin RSI is low', () => {
    const n = 60;
    const usdtd = series(n, DAY0, DAY_SECONDS, (i) => (i < 20 ? 5 : 5 + (i - 20) * 0.4));
    const coinCandles = coins(n, DAY0, DAY_SECONDS, (i) => (i < 20 ? 100 : 100 - (i - 20) * 3));
    const res = computeTetherDivergence({
      coinCandles,
      usdtd,
      nowSec: FAR,
      settings: { gapUsdtMin: 65, gapCoinMax: 35 },
    });
    expect(res.gap.some(Boolean)).toBe(true);
    const lastGap = res.gap.lastIndexOf(true);
    expect(res.usdtRsi[lastGap] as number).toBeGreaterThanOrEqual(65);
    expect(res.coinRsi[lastGap] as number).toBeLessThanOrEqual(35);
  });

  it('emits one marker per threshold cross, none while staying above, re-arms after drop', () => {
    const n = 100;
    const usdtd = series(n, DAY0, DAY_SECONDS, () => 8);
    const coinCloses = Array.from({ length: n }, () => 50);
    for (let i = 30; i < 50; i++) coinCloses[i] = 1;
    for (let i = 50; i < 75; i++) coinCloses[i] = 200;
    for (let i = 75; i < 95; i++) coinCloses[i] = 1;
    const coinCandles = coinCloses.map((c, i) => candle(DAY0 + i * DAY_SECONDS, c));
    const res = computeTetherDivergence({
      coinCandles,
      usdtd,
      nowSec: FAR,
      settings: { watchThreshold: 55, bottomThreshold: 60 },
    });
    expect(res.crosses.length).toBeGreaterThanOrEqual(2);
    const times = res.crosses.map((c) => c.time);
    expect(new Set(times).size).toBe(times.length);
    for (const c of res.crosses) {
      const idx = res.times.indexOf(c.time);
      expect(idx).toBeGreaterThan(0);
      expect(res.score[idx] as number).toBeGreaterThanOrEqual(60);
      expect(res.score[idx - 1] as number).toBeLessThan(60);
      expect(c.kind).toBe('bottom');
    }
  });

  it('excludes the forming bar and does not look ahead', () => {
    const n = 50;
    const usdtd = series(n, DAY0, DAY_SECONDS, (i) => 5 + i * 0.01);
    const coinCandles = coins(n, DAY0, DAY_SECONDS, (i) => 100 - i);
    const lastOpen = DAY0 + (n - 1) * DAY_SECONDS;
    const nowDuringLast = lastOpen + 3600;
    const closed = computeTetherDivergence({ coinCandles, usdtd, nowSec: nowDuringLast });
    expect(closed.times.includes(lastOpen)).toBe(false);
    expect(closed.times[closed.times.length - 1]).toBe(lastOpen - DAY_SECONDS);

    const baseNow = lastOpen + DAY_SECONDS;
    const a = computeTetherDivergence({ coinCandles, usdtd, nowSec: baseNow });
    const extraUsdtd = [
      ...usdtd,
      { time: lastOpen + DAY_SECONDS, value: 99 },
      { time: lastOpen + 2 * DAY_SECONDS, value: 120 },
    ];
    const extraCoin = [
      ...coinCandles,
      candle(lastOpen + DAY_SECONDS, 1),
      candle(lastOpen + 2 * DAY_SECONDS, 1),
    ];
    const b = computeTetherDivergence({
      coinCandles: extraCoin,
      usdtd: extraUsdtd,
      nowSec: lastOpen + 3 * DAY_SECONDS,
    });
    for (let i = 0; i < a.times.length; i++) {
      expect(b.times[i]).toBe(a.times[i]);
      expect(b.score[i]).toEqual(a.score[i]);
      expect(b.usdtRsi[i]).toEqual(a.usdtRsi[i]);
      expect(b.coinRsi[i]).toEqual(a.coinRsi[i]);
      expect(b.zone[i]).toEqual(a.zone[i]);
    }
  });

  it('resamples to UTC-Monday weeks and keeps closed weeks only', () => {
    const n = 28;
    const usdtd = series(n, DAY0, DAY_SECONDS, (i) => 5 + i);
    const coinCandles = coins(n, DAY0, DAY_SECONDS, (i) => 100 - i);
    const lastOpen = DAY0 + (n - 1) * DAY_SECONDS;
    const res = computeTetherDivergence({
      coinCandles,
      usdtd,
      nowSec: lastOpen + DAY_SECONDS,
      settings: { timeframe: '1W' },
    });
    expect(res.periodSeconds).toBe(WEEK_SECONDS);
    for (const t of res.times) {
      expect(utcMondayOpenSec(t)).toBe(t);
      expect(t + WEEK_SECONDS).toBeLessThanOrEqual(lastOpen + DAY_SECONDS);
    }
    expect(res.times.length).toBeGreaterThanOrEqual(2);
    expect(res.times.length).toBeLessThan(n / 5);
  });
});

describe('alignToChart', () => {
  const day = DAY0;
  const seriesPts = [
    { time: day, value: 10 },
    { time: day + DAY_SECONDS, value: 20 },
    { time: day + 2 * DAY_SECONDS, value: 30 },
  ];

  it('maps onto 1h bars only after the daily bar has closed', () => {
    const hours = Array.from({ length: 50 }, (_, i) => ({ time: day + i * 3600 }));
    const aligned = alignToChart(seriesPts, hours, 3600, DAY_SECONDS);
    expect(aligned[0]).toBeNull();
    const firstUse = hours.findIndex((h) => day + DAY_SECONDS <= h.time + 3600);
    expect(aligned[firstUse]).toBe(10);
    expect(aligned[firstUse - 1]).toBeNull();
    const secondUse = hours.findIndex((h) => day + 2 * DAY_SECONDS <= h.time + 3600);
    expect(aligned[secondUse]).toBe(20);
  });

  it('maps onto 4h bars without lookahead', () => {
    const bars = Array.from({ length: 20 }, (_, i) => ({ time: day + i * 14400 }));
    const aligned = alignToChart(seriesPts, bars, 14400, DAY_SECONDS);
    const firstUse = bars.findIndex((h) => day + DAY_SECONDS <= h.time + 14400);
    expect(aligned[firstUse]).toBe(10);
    if (firstUse > 0) expect(aligned[firstUse - 1]).toBeNull();
  });

  it('on 1D charts uses the same-day closed bar', () => {
    const days = [
      { time: day },
      { time: day + DAY_SECONDS },
      { time: day + 2 * DAY_SECONDS },
    ];
    const aligned = alignToChart(seriesPts, days, DAY_SECONDS, DAY_SECONDS);
    expect(aligned).toEqual([10, 20, 30]);
  });
});

describe('buildTetherMarkers / labels', () => {
  it('names the signals Stretch + / Stretch - and keeps Watch', () => {
    const crosses = [
      { time: DAY0, kind: 'bottom' as const },
      { time: DAY0 + DAY_SECONDS, kind: 'watch' as const },
      { time: DAY0 + 2 * DAY_SECONDS, kind: 'top' as const },
    ];
    const marks = buildTetherMarkers(crosses);
    expect(marks.map((m) => m.text)).toEqual(['Stretch +', 'Watch', 'Stretch -']);
    expect(marks[2].color).toBe(TETHER_STRETCH_SETTINGS.topColor);
    expect(tetherZoneLabel('bottom')).toBe('Stretch +');
    expect(tetherZoneLabel('watch')).toBe('Watch');
    expect(tetherZoneLabel('neutral')).toBe('—');
    expect(tetherZoneColor('bottom')).toBe('#22c55e');
  });
});

describe('fixed Tether Stretch settings', () => {
  it('uses the agreed constants', () => {
    const s = TETHER_STRETCH_SETTINGS;
    expect([s.usdtRsiLen, s.coinRsiLen, s.emaLen, s.bbLen, s.bbMult, s.emaDistFullPct]).toEqual([14, 14, 20, 20, 2, 4]);
    expect([s.wRsi, s.wEma, s.wBb, s.wStretch, s.wCoin]).toEqual([1, 1, 1, 1, 1]);
    expect([s.bottomThreshold, s.watchThreshold, s.topThreshold]).toEqual([80, 60, 80]);
  });
});

// Build a coin path with explicit lows/highs for divergence tests.
function ohlc(lows: number[], highs: number[], start = DAY0): TetherCoinCandle[] {
  return lows.map((l, i) => ({
    time: start + i * DAY_SECONDS,
    open: (l + highs[i]) / 2,
    high: highs[i],
    low: l,
    close: (l + highs[i]) / 2,
    volume: 1,
  }));
}

describe('findPivots', () => {
  it('finds strict pivots only and never at the edges', () => {
    const v = [5, 4, 3, 4, 5, 4, 4, 6, 7];
    expect(findPivots(v, 2, -1)).toEqual([2]);
    expect(findPivots(v, 2, 1)).toEqual([4]);
    expect(findPivots([1, 3, 1, 3, 1], 1, 1)).toEqual([1, 3]);
    expect(findPivots([3, 3, 1, 3, 3], 1, -1)).toEqual([2]);
    expect(findPivots([1, 1, 1, 1, 1], 1, -1)).toEqual([]);
  });
});

describe('detectRsiDivergences', () => {
  // pivot lows at 2 and 8 (k=2)
  const lowsLL = [9, 8, 5, 8, 9, 9, 8, 7, 4, 7, 8, 9, 9];
  const highs = lowsLL.map((l) => l + 5);
  it('bullish regular: lower low in price, higher low in RSI, stamped at pivot + k', () => {
    const rsi = lowsLL.map((_, i) => (i === 2 ? 20 : i === 8 ? 30 : 50));
    const d = detectRsiDivergences(lowsLL, highs, rsi, 2, 60).filter((x) => x.side === 'bull');
    expect(d).toEqual([{ confirmIdx: 10, side: 'bull', type: 'regular' }]);
  });
  it('bullish hidden: higher low in price, lower low in RSI', () => {
    const lows = [9, 8, 5, 8, 9, 9, 8, 7, 6, 7, 8, 9, 9];
    const rsi = lows.map((_, i) => (i === 2 ? 30 : i === 8 ? 20 : 50));
    const d = detectRsiDivergences(lows, lows.map((l) => l + 5), rsi, 2, 60).filter((x) => x.side === 'bull');
    expect(d).toEqual([{ confirmIdx: 10, side: 'bull', type: 'hidden' }]);
  });
  it('bearish regular and hidden mirror the bullish rules', () => {
    const hi = [1, 2, 5, 2, 1, 1, 2, 3, 6, 3, 2, 1, 1]; // higher high at 8
    const lo = hi.map((h) => h - 1);
    let rsi = hi.map((_, i) => (i === 2 ? 80 : i === 8 ? 70 : 50));
    expect(detectRsiDivergences(lo, hi, rsi, 2, 60).filter((x) => x.side === 'bear')).toEqual([
      { confirmIdx: 10, side: 'bear', type: 'regular' },
    ]);
    const hi2 = [1, 2, 6, 2, 1, 1, 2, 3, 5, 3, 2, 1, 1]; // lower high at 8
    rsi = hi2.map((_, i) => (i === 2 ? 70 : i === 8 ? 80 : 50));
    expect(detectRsiDivergences(hi2.map((h) => h - 1), hi2, rsi, 2, 60).filter((x) => x.side === 'bear')).toEqual([
      { confirmIdx: 10, side: 'bear', type: 'hidden' },
    ]);
  });
  it('ignores pivots further apart than the max gap, and null RSI', () => {
    const rsi = lowsLL.map((_, i) => (i === 2 ? 20 : i === 8 ? 30 : 50));
    expect(detectRsiDivergences(lowsLL, highs, rsi, 2, 5).filter((x) => x.side === 'bull')).toEqual([]);
    const rsiNull = lowsLL.map((_, i) => (i === 2 ? null : 50));
    expect(detectRsiDivergences(lowsLL, highs, rsiNull, 2, 60).filter((x) => x.side === 'bull')).toEqual([]);
  });
  it('does not use bars after the confirmation bar (truncating the future keeps the same result)', () => {
    const rsi = lowsLL.map((_, i) => (i === 2 ? 20 : i === 8 ? 30 : 50));
    const full = detectRsiDivergences(lowsLL, highs, rsi, 2, 60);
    const cut = detectRsiDivergences(lowsLL.slice(0, 11), highs.slice(0, 11), rsi.slice(0, 11), 2, 60);
    expect(cut.filter((x) => x.side === 'bull')).toEqual(full.filter((x) => x.side === 'bull' && x.confirmIdx <= 10));
  });
});

describe('buildTetherLadder', () => {
  // Zig-zag lows with progressively lower price and higher RSI: pivot lows every 6 bars from idx 3.
  const n = 60;
  const times = Array.from({ length: n }, (_, i) => DAY0 + i * DAY_SECONDS);
  const low = Array.from({ length: n }, (_, i) => {
    const phase = i % 6;
    const cycle = Math.floor(i / 6);
    const dip = 100 - cycle * 2; // lower lows
    return phase === 3 ? dip : dip + Math.min(Math.abs(phase - 3), 3) * 3;
  });
  const high = low.map((l) => l + 10);
  const rsi: Array<number | null> = low.map((_, i) => (i % 6 === 3 ? 20 + Math.floor(i / 6) * 2 : 50));
  const at = (i: number) => times[i];
  const bull = (i: number) => ({ time: at(i), kind: 'bottom' as const });

  it('counts +1, +2, +3 after Stretch + and caps at 3', () => {
    const l = buildTetherLadder({ times, low, high, rsi, bottomCrosses: [bull(0)], topCrosses: [] });
    const bulls = l.filter((m) => m.side === 'bull');
    expect(bulls.map((m) => m.n)).toEqual([1, 2, 3]);
    expect(bulls.every((m) => m.type === 'regular')).toBe(true);
    // first pair of pivots is (9, 15), confirmed at 15 + k(5)
    expect(bulls[0].time).toBe(at(20));
  });

  it('only counts divergences after the signal, and a new Stretch + restarts the count', () => {
    const l = buildTetherLadder({ times, low, high, rsi, bottomCrosses: [bull(12), bull(30)], topCrosses: [] });
    const n1 = l.filter((m) => m.time < at(30)).map((m) => m.n);
    expect(n1[0]).toBe(1);
    const afterSecond = l.filter((m) => m.time >= at(30));
    expect(afterSecond[0].n).toBe(1);
  });

  it('a Stretch - ends the bullish ladder', () => {
    const l = buildTetherLadder({
      times, low, high, rsi, bottomCrosses: [bull(0)], topCrosses: [{ time: at(20), kind: 'top' }],
    });
    expect(l.filter((m) => m.side === 'bull' && m.time > at(20))).toEqual([]);
  });

  it('expires after the zone window', () => {
    const l = buildTetherLadder({
      times, low, high, rsi, bottomCrosses: [bull(0)], topCrosses: [],
      settings: { ladderZoneBars: 10 },
    });
    expect(l.filter((m) => m.time > at(10)).length).toBe(0);
  });

  it('expires when price runs more than 20% beyond the signal bar low', () => {
    const crash = low.map((v, i) => (i >= 8 ? v * 0.5 : v));
    const l = buildTetherLadder({
      times, low: crash, high: crash.map((v) => v + 10), rsi, bottomCrosses: [bull(0)], topCrosses: [],
    });
    expect(l.length).toBe(0);
  });

  it('produces no markers without a signal', () => {
    expect(buildTetherLadder({ times, low, high, rsi, bottomCrosses: [], topCrosses: [] })).toEqual([]);
  });
});

describe('buildTetherLadderMarkers', () => {
  it('uses +n below bar for bullish and -n above bar for bearish; circle = regular, square = hidden', () => {
    const m = buildTetherLadderMarkers([
      { time: DAY0, side: 'bull', n: 1, type: 'regular' },
      { time: DAY0, side: 'bull', n: 2, type: 'hidden' },
      { time: DAY0, side: 'bear', n: 1, type: 'regular' },
      { time: DAY0, side: 'bear', n: 3, type: 'hidden' },
    ]);
    expect(m.map((x) => x.text)).toEqual(['+1', '+2', '-1', '-3']);
    expect(m.map((x) => x.position)).toEqual(['belowBar', 'belowBar', 'aboveBar', 'aboveBar']);
    expect(m.map((x) => x.shape)).toEqual(['circle', 'square', 'circle', 'square']);
    expect(new Set(m.map((x) => x.color)).size).toBe(4);
  });
});

describe('normalizeTetherDivergenceSettings', () => {
  it('clamps NaN / out-of-range and falls back when all weights are zero', () => {
    const n = normalizeTetherDivergenceSettings({
      usdtRsiLen: 999,
      coinRsiLen: -4,
      emaLen: Number.NaN,
      bbLen: 'nope' as unknown as number,
      bbMult: 99,
      emaDistFullPct: 0,
      wRsi: 0,
      wEma: 0,
      wBb: 0,
      wStretch: 0,
      wCoin: 0,
      bottomThreshold: 10,
      watchThreshold: 90,
      bottomColor: 'green',
      timeframe: '4h' as unknown as '1D',
      divPivotBars: 99,
      ladderExpiryPct: -3,
    });
    expect(n.usdtRsiLen).toBe(50);
    expect(n.coinRsiLen).toBe(2);
    expect(n.emaLen).toBe(20);
    expect(n.bbLen).toBe(20);
    expect(n.bbMult).toBe(5);
    expect(n.emaDistFullPct).toBe(0.5);
    expect(n.wRsi).toBe(1);
    expect(n.wEma).toBe(1);
    expect(n.wBb).toBe(1);
    expect(n.wStretch).toBe(1);
    expect(n.wCoin).toBe(1);
    expect(n.bottomThreshold).toBe(50);
    expect(n.watchThreshold).toBeLessThanOrEqual(n.bottomThreshold);
    expect(n.bottomColor).toBe(TETHER_STRETCH_SETTINGS.bottomColor);
    expect(n.timeframe).toBe('1D');
    expect(n.divPivotBars).toBe(20);
    expect(n.ladderExpiryPct).toBeGreaterThan(0);
  });
});

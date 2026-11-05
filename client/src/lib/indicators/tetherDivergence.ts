/**
 * Tether Stretch (internal id `tetherDivergence`) — USDT.D stretch vs coin oversold, plus the token's
 * daily-RSI divergence ladder.
 * Pure math: no React, no fetch. Causal: bar i depends only on bars <= i.
 * Forming (unclosed) bars are dropped before any indicator is computed.
 *
 * Signals: "Stretch +" (score crosses up through Bottom 80) and "Stretch -" (topScore crosses up
 * through Top 80). After a Stretch +/- the token's daily RSI divergences are counted +1/+2/+3 (bullish)
 * or -1/-2/-3 (bearish), regular and hidden, until the opposite/new signal resets the ladder.
 */

import {
  TETHER_STRETCH_SETTINGS,
  normalizeTetherDivergenceSettings,
  type TetherDivergenceSettings,
  type TetherMarkerOnCross,
} from '@/types/tetherDivergenceSettings';

export interface DailyPoint {
  /** Unix seconds, bar OPEN time, UTC. */
  time: number;
  value: number;
}

export interface TetherCoinCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type TetherZone = 'bottom' | 'watch' | 'neutral';

export interface TetherCross {
  time: number;
  kind: TetherMarkerOnCross;
}

export type TetherDivergenceType = 'regular' | 'hidden';

/** One rung of the ladder. `time` is the bar the divergence is CONFIRMED on (pivot + k), never earlier. */
export interface TetherLadderMarker {
  time: number;
  side: 'bull' | 'bear';
  /** 1..3 (rendered +1..+3 for bull, -1..-3 for bear). */
  n: 1 | 2 | 3;
  type: TetherDivergenceType;
}

export interface TetherDivergenceComputeResult {
  times: number[];
  usdtRsi: Array<number | null>;
  coinRsi: Array<number | null>;
  emaDistPct: Array<number | null>;
  pctB: Array<number | null>;
  stretch: Array<number | null>;
  coinOversold: Array<number | null>;
  score: Array<number | null>;
  topScore: Array<number | null>;
  zone: Array<TetherZone | null>;
  gap: boolean[];
  crosses: TetherCross[];
  /** Stretch - signals (topScore crossing up through the Top threshold). */
  topCrosses: TetherCross[];
  /** Daily RSI divergence ladder markers (+1..+3 after Stretch +, -1..-3 after Stretch -). */
  ladder: TetherLadderMarker[];
  periodSeconds: number;
  approximate?: boolean;
  source?: string | null;
}

export interface TetherPriceMarker {
  time: number;
  kind: TetherMarkerOnCross;
  text: string;
  color: string;
}

export interface TetherLadderPriceMarker {
  time: number;
  position: 'belowBar' | 'aboveBar';
  /** regular = circle, hidden = square. */
  shape: 'circle' | 'square';
  color: string;
  /** +1..+3 / -1..-3 */
  text: string;
  type: TetherDivergenceType;
  side: 'bull' | 'bear';
}

export const DAY_SECONDS = 86400;
export const WEEK_SECONDS = 7 * 86400;

export const CHART_TF_SECONDS: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '6h': 21600,
  '8h': 28800,
  '12h': 43200,
  '1d': DAY_SECONDS,
  '1D': DAY_SECONDS,
  '1w': WEEK_SECONDS,
  '1W': WEEK_SECONDS,
  '1wk': WEEK_SECONDS,
  '1M': 30 * DAY_SECONDS,
};

export function chartBarSeconds(timeframe: string | null | undefined): number {
  if (!timeframe) return DAY_SECONDS;
  return CHART_TF_SECONDS[timeframe] ?? DAY_SECONDS;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function utcDayOpenSec(timeSec: number): number {
  const ms = timeSec > 1e12 ? timeSec : timeSec * 1000;
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
}

export function utcMondayOpenSec(timeSec: number): number {
  const open = utcDayOpenSec(timeSec);
  const day = new Date(open * 1000).getUTCDay(); // 0 Sun .. 6 Sat
  const daysFromMonday = (day + 6) % 7;
  return open - daysFromMonday * DAY_SECONDS;
}

export function isBarClosed(timeSec: number, periodSeconds: number, nowSec: number): boolean {
  return timeSec + periodSeconds <= nowSec;
}

function closedOnly<T extends { time: number }>(
  bars: T[],
  periodSeconds: number,
  nowSec: number,
): T[] {
  return bars.filter((b) => isBarClosed(b.time, periodSeconds, nowSec));
}

/** Wilder RSI. First value at index `len` (needs len+1 prices). Warm-up is `null`. */
export function rsiWilder(values: number[], len: number): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  const p = Math.max(1, Math.floor(len));
  if (n <= p) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= p; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= p;
  loss /= p;
  out[p] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = p + 1; i < n; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (p - 1) + Math.max(d, 0)) / p;
    loss = (loss * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** SMA-seeded EMA. First value at index `len-1`. Warm-up is `null`. */
export function emaSeries(values: number[], len: number): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  const p = Math.max(1, Math.floor(len));
  if (n < p) return out;
  let sum = 0;
  for (let i = 0; i < p; i++) sum += values[i];
  let ema = sum / p;
  out[p - 1] = ema;
  const k = 2 / (p + 1);
  for (let i = p; i < n; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * Bollinger %B using population stdev.
 * %B = (close - lower) / (upper - lower); width 0 => 0.5.
 * Warm-up is `null`.
 */
export function bollingerPctB(values: number[], len: number, mult: number): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  const p = Math.max(1, Math.floor(len));
  if (n < p) return out;
  for (let i = p - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - p + 1; j <= i; j++) sum += values[j];
    const mean = sum / p;
    let sq = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const d = values[j] - mean;
      sq += d * d;
    }
    const std = Math.sqrt(sq / p);
    const width = 2 * mult * std;
    if (width === 0) {
      out[i] = 0.5;
    } else {
      const lower = mean - mult * std;
      const upper = mean + mult * std;
      out[i] = (values[i] - lower) / (upper - lower);
    }
  }
  return out;
}

export function emaCompFromDist(emaDistPct: number, emaDistFullPct: number): number {
  const full = emaDistFullPct === 0 ? 4 : emaDistFullPct;
  return clamp(50 + 50 * (emaDistPct / full), 0, 100);
}

export function bbCompFromPctB(pctB: number): number {
  return clamp(pctB, 0, 1) * 100;
}

function weightedMean(parts: Array<{ value: number | null; weight: number }>): number | null {
  let num = 0;
  let den = 0;
  for (const p of parts) {
    if (p.value == null || !Number.isFinite(p.value) || !(p.weight > 0)) continue;
    num += p.value * p.weight;
    den += p.weight;
  }
  if (den === 0) return null;
  return num / den;
}

interface JoinedBar {
  time: number;
  usdtd: number;
  coin: TetherCoinCandle;
}

function joinByTime(coin: TetherCoinCandle[], usdtd: DailyPoint[]): JoinedBar[] {
  const uMap = new Map<number, number>();
  for (const p of usdtd) {
    if (!Number.isFinite(p.time) || !Number.isFinite(p.value)) continue;
    uMap.set(p.time, p.value);
  }
  const out: JoinedBar[] = [];
  for (const c of coin) {
    if (!Number.isFinite(c.time) || !Number.isFinite(c.close)) continue;
    const v = uMap.get(c.time);
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ time: c.time, usdtd: v, coin: c });
  }
  return out;
}

function resampleJoinedToWeeks(joined: JoinedBar[]): JoinedBar[] {
  if (!joined.length) return [];
  const groups = new Map<number, JoinedBar[]>();
  for (const b of joined) {
    const week = utcMondayOpenSec(b.time);
    const arr = groups.get(week);
    if (arr) arr.push(b);
    else groups.set(week, [b]);
  }
  const weeks = [...groups.keys()].sort((a, b) => a - b);
  const out: JoinedBar[] = [];
  for (const week of weeks) {
    const bars = groups.get(week)!;
    bars.sort((a, b) => a.time - b.time);
    const first = bars[0].coin;
    const last = bars[bars.length - 1];
    let high = first.high;
    let low = first.low;
    let volume = 0;
    for (const b of bars) {
      if (b.coin.high > high) high = b.coin.high;
      if (b.coin.low < low) low = b.coin.low;
      volume += b.coin.volume ?? 0;
    }
    out.push({
      time: week,
      usdtd: last.usdtd,
      coin: {
        time: week,
        open: first.open,
        high,
        low,
        close: last.coin.close,
        volume,
      },
    });
  }
  return out;
}

export function zoneFromScore(
  score: number | null,
  bottomThreshold: number,
  watchThreshold: number,
): TetherZone | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= bottomThreshold) return 'bottom';
  if (score >= watchThreshold) return 'watch';
  return 'neutral';
}

export function tetherZoneColor(
  zone: TetherZone | null,
  settings: Pick<TetherDivergenceSettings, 'bottomColor' | 'watchColor' | 'neutralColor'> = TETHER_STRETCH_SETTINGS,
): string {
  if (zone === 'bottom') return settings.bottomColor;
  if (zone === 'watch') return settings.watchColor;
  return settings.neutralColor;
}

export function tetherZoneLabel(zone: TetherZone | null): string {
  if (zone === 'bottom') return 'Stretch +';
  if (zone === 'watch') return 'Watch';
  if (zone === 'neutral') return '—';
  return '—';
}

function detectCrosses(
  times: number[],
  score: Array<number | null>,
  threshold: number,
  kind: TetherMarkerOnCross,
): TetherCross[] {
  const crosses: TetherCross[] = [];
  let armed = true;
  let prev: number | null = null;
  for (let i = 0; i < score.length; i++) {
    const cur = score[i];
    if (cur == null) {
      prev = null;
      continue;
    }
    if (prev != null && armed && prev < threshold && cur >= threshold) {
      crosses.push({ time: times[i], kind });
      armed = false;
    }
    if (cur < threshold) armed = true;
    prev = cur;
  }
  return crosses;
}

/** Strict pivot (k bars each side) indices of `values`; `dir` -1 = pivot lows, +1 = pivot highs. */
export function findPivots(values: number[], k: number, dir: -1 | 1): number[] {
  const out: number[] = [];
  const n = values.length;
  for (let j = k; j < n - k; j++) {
    const v = values[j];
    if (!Number.isFinite(v)) continue;
    let ok = true;
    for (let m = 1; m <= k && ok; m++) {
      const a = values[j - m];
      const b = values[j + m];
      if (!Number.isFinite(a) || !Number.isFinite(b)) ok = false;
      else if (dir < 0 ? !(v < a && v < b) : !(v > a && v > b)) ok = false;
    }
    if (ok) out.push(j);
  }
  return out;
}

interface RawDivergence {
  confirmIdx: number;
  side: 'bull' | 'bear';
  type: TetherDivergenceType;
}

/**
 * Daily-RSI divergences between consecutive price pivots (no look-ahead: a pivot at j is only known
 * at j + k, which is the bar the divergence is stamped on).
 *  - bull regular: price lower low,  RSI higher low
 *  - bull hidden:  price higher low, RSI lower low
 *  - bear regular: price higher high, RSI lower high
 *  - bear hidden:  price lower high,  RSI higher high
 */
export function detectRsiDivergences(
  low: number[],
  high: number[],
  rsi: Array<number | null>,
  k: number,
  maxGap: number,
): RawDivergence[] {
  const out: RawDivergence[] = [];
  const scan = (values: number[], dir: -1 | 1) => {
    const piv = findPivots(values, k, dir);
    for (let q = 1; q < piv.length; q++) {
      const a = piv[q - 1];
      const b = piv[q];
      if (b - a > maxGap) continue;
      const ra = rsi[a];
      const rb = rsi[b];
      if (ra == null || rb == null) continue;
      const priceUp = values[b] > values[a];
      const priceDown = values[b] < values[a];
      const rsiUp = rb > ra;
      const rsiDown = rb < ra;
      if (dir < 0) {
        if (priceDown && rsiUp) out.push({ confirmIdx: b + k, side: 'bull', type: 'regular' });
        else if (priceUp && rsiDown) out.push({ confirmIdx: b + k, side: 'bull', type: 'hidden' });
      } else if (priceUp && rsiDown) {
        out.push({ confirmIdx: b + k, side: 'bear', type: 'regular' });
      } else if (priceDown && rsiUp) {
        out.push({ confirmIdx: b + k, side: 'bear', type: 'hidden' });
      }
    }
  };
  scan(low, -1);
  scan(high, 1);
  return out.sort((x, y) => x.confirmIdx - y.confirmIdx);
}

/**
 * Ladder: after a Stretch + (bottom cross) count successive bullish divergences +1, +2, +3; after a
 * Stretch - (top cross) count bearish ones -1, -2, -3. A new Stretch + / - starts a fresh count and
 * ends the opposite ladder. A ladder also ends after `ladderZoneBars` bars or when price runs
 * `ladderExpiryPct` beyond the Stretch bar's extreme (the call failed). Only the first 3 rungs are shown.
 */
export function buildTetherLadder({
  times,
  low,
  high,
  rsi,
  bottomCrosses,
  topCrosses,
  settings,
}: {
  times: number[];
  low: number[];
  high: number[];
  rsi: Array<number | null>;
  bottomCrosses: TetherCross[];
  topCrosses: TetherCross[];
  settings?: Partial<TetherDivergenceSettings> | null;
}): TetherLadderMarker[] {
  const s = normalizeTetherDivergenceSettings(settings);
  const divs = detectRsiDivergences(low, high, rsi, s.divPivotBars, s.divMaxGapBars);
  const bottomAt = new Set(bottomCrosses.map((c) => c.time));
  const topAt = new Set(topCrosses.map((c) => c.time));
  const byIdx = new Map<number, RawDivergence[]>();
  for (const d of divs) {
    const arr = byIdx.get(d.confirmIdx);
    if (arr) arr.push(d);
    else byIdx.set(d.confirmIdx, [d]);
  }
  let bull: { start: number; ref: number; n: number } | null = null;
  let bear: { start: number; ref: number; n: number } | null = null;
  const out: TetherLadderMarker[] = [];
  for (let i = 0; i < times.length; i++) {
    if (bottomAt.has(times[i])) {
      bull = { start: i, ref: low[i], n: 0 };
      bear = null;
    }
    if (topAt.has(times[i])) {
      bear = { start: i, ref: high[i], n: 0 };
      bull = null;
    }
    if (bull && i > bull.start && (i - bull.start > s.ladderZoneBars || low[i] < bull.ref * (1 - s.ladderExpiryPct))) {
      bull = null;
    }
    if (bear && i > bear.start && (i - bear.start > s.ladderZoneBars || high[i] > bear.ref * (1 + s.ladderExpiryPct))) {
      bear = null;
    }
    for (const d of byIdx.get(i) ?? []) {
      const z = d.side === 'bull' ? bull : bear;
      if (!z || z.n >= 3) continue;
      z.n += 1;
      out.push({ time: times[i], side: d.side, n: z.n as 1 | 2 | 3, type: d.type });
    }
  }
  return out;
}

export function computeTetherDivergence({
  coinCandles,
  usdtd,
  settings,
  nowSec,
}: {
  coinCandles: TetherCoinCandle[];
  usdtd: DailyPoint[];
  settings?: Partial<TetherDivergenceSettings> | null;
  nowSec: number;
}): TetherDivergenceComputeResult {
  const s = normalizeTetherDivergenceSettings(settings);
  const periodSeconds = s.timeframe === '1W' ? WEEK_SECONDS : DAY_SECONDS;
  const empty: TetherDivergenceComputeResult = {
    times: [],
    usdtRsi: [],
    coinRsi: [],
    emaDistPct: [],
    pctB: [],
    stretch: [],
    coinOversold: [],
    score: [],
    topScore: [],
    zone: [],
    gap: [],
    crosses: [],
    topCrosses: [],
    ladder: [],
    periodSeconds,
  };

  const coinClosed = closedOnly(coinCandles, DAY_SECONDS, nowSec);
  const usdtClosed = closedOnly(usdtd, DAY_SECONDS, nowSec);
  let joined = joinByTime(coinClosed, usdtClosed);
  if (s.timeframe === '1W') {
    joined = resampleJoinedToWeeks(joined);
    joined = closedOnly(joined, WEEK_SECONDS, nowSec);
  }
  if (!joined.length) return empty;

  const times = joined.map((b) => b.time);
  const usdtVals = joined.map((b) => b.usdtd);
  const coinCloses = joined.map((b) => b.coin.close);

  const usdtRsi = rsiWilder(usdtVals, s.usdtRsiLen);
  const coinRsi = rsiWilder(coinCloses, s.coinRsiLen);
  const ema = emaSeries(usdtVals, s.emaLen);
  const pctB = bollingerPctB(usdtVals, s.bbLen, s.bbMult);

  const emaDistPct: Array<number | null> = new Array(joined.length);
  const stretch: Array<number | null> = new Array(joined.length);
  const coinOversold: Array<number | null> = new Array(joined.length);
  const score: Array<number | null> = new Array(joined.length);
  const topScore: Array<number | null> = new Array(joined.length);
  const zone: Array<TetherZone | null> = new Array(joined.length);
  const gap: boolean[] = new Array(joined.length);

  for (let i = 0; i < joined.length; i++) {
    const e = ema[i];
    const dist = e != null && e !== 0 ? (usdtVals[i] / e - 1) * 100 : null;
    emaDistPct[i] = dist;

    const rsiComp = usdtRsi[i];
    const emaC = dist != null ? emaCompFromDist(dist, s.emaDistFullPct) : null;
    const bbC = pctB[i] != null ? bbCompFromPctB(pctB[i] as number) : null;
    const st = weightedMean([
      { value: rsiComp, weight: s.wRsi },
      { value: emaC, weight: s.wEma },
      { value: bbC, weight: s.wBb },
    ]);
    stretch[i] = st;

    const cr = coinRsi[i];
    const oversold = cr != null ? 100 - cr : null;
    coinOversold[i] = oversold;

    if (st == null || oversold == null) {
      score[i] = null;
      topScore[i] = null;
    } else {
      const den = s.wStretch + s.wCoin;
      score[i] = clamp((s.wStretch * st + s.wCoin * oversold) / den, 0, 100);
      topScore[i] = clamp((s.wStretch * (100 - st) + s.wCoin * cr!) / den, 0, 100);
    }
    zone[i] = zoneFromScore(score[i], s.bottomThreshold, s.watchThreshold);
    gap[i] =
      usdtRsi[i] != null &&
      coinRsi[i] != null &&
      (usdtRsi[i] as number) >= s.gapUsdtMin &&
      (coinRsi[i] as number) <= s.gapCoinMax;
  }

  const crosses = detectCrosses(times, score, s.bottomThreshold, 'bottom');
  const topCrosses = detectCrosses(times, topScore, s.topThreshold, 'top');
  const ladder = buildTetherLadder({
    times,
    low: joined.map((b) => b.coin.low),
    high: joined.map((b) => b.coin.high),
    rsi: coinRsi,
    bottomCrosses: crosses,
    topCrosses,
    settings: s,
  });

  return {
    times,
    usdtRsi,
    coinRsi,
    emaDistPct,
    pctB,
    stretch,
    coinOversold,
    score,
    topScore,
    zone,
    gap,
    crosses,
    topCrosses,
    ladder,
    periodSeconds,
  };
}

/**
 * Map a higher-timeframe series onto chart bars.
 * Chart bar at `t` may use the last series bar with
 * `seriesTime + periodSeconds <= t + chartBarSeconds`
 * (that HTF bar is already closed when this chart bar closes).
 */
export function alignToChart<T>(
  series: Array<{ time: number; value: T }>,
  chartBars: Array<{ time: number }> | number[],
  chartBarSeconds: number,
  periodSeconds: number,
): Array<T | null> {
  const times = chartBars.map((b) => (typeof b === 'number' ? b : b.time));
  const out: Array<T | null> = times.map(() => null);
  let j = -1;
  for (let i = 0; i < times.length; i++) {
    const close = times[i] + chartBarSeconds;
    while (j + 1 < series.length && series[j + 1].time + periodSeconds <= close) {
      j += 1;
    }
    if (j >= 0) out[i] = series[j].value;
  }
  return out;
}

export function alignScalarSeriesToChart(
  times: number[],
  values: Array<number | null>,
  chartBars: Array<{ time: number }> | number[],
  chartBarSeconds: number,
  periodSeconds: number,
): Array<number | null> {
  return alignToChart(
    times.map((time, i) => ({ time, value: values[i] })),
    chartBars,
    chartBarSeconds,
    periodSeconds,
  );
}

export function alignCrossesToChart(
  crosses: TetherCross[],
  chartBars: Array<{ time: number }> | number[],
  chartBarSeconds: number,
  periodSeconds: number,
): TetherCross[] {
  const times = chartBars.map((b) => (typeof b === 'number' ? b : b.time));
  const out: TetherCross[] = [];
  const seen = new Set<number>();
  for (const c of crosses) {
    for (const t of times) {
      if (c.time + periodSeconds <= t + chartBarSeconds) {
        if (!seen.has(t)) {
          out.push({ time: t, kind: c.kind });
          seen.add(t);
        }
        break;
      }
    }
  }
  return out;
}

export function alignLadderToChart(
  ladder: TetherLadderMarker[],
  chartBars: Array<{ time: number }> | number[],
  chartBarSeconds: number,
  periodSeconds: number,
): TetherLadderMarker[] {
  const times = chartBars.map((b) => (typeof b === 'number' ? b : b.time));
  const out: TetherLadderMarker[] = [];
  const seen = new Set<string>();
  for (const m of ladder) {
    for (const t of times) {
      if (m.time + periodSeconds <= t + chartBarSeconds) {
        const key = `${t}:${m.side}:${m.n}`;
        if (!seen.has(key)) {
          out.push({ ...m, time: t });
          seen.add(key);
        }
        break;
      }
    }
  }
  return out;
}

export function alignTetherDivergenceToChart(
  computed: TetherDivergenceComputeResult,
  chartBars: Array<{ time: number }>,
  chartBarSeconds: number,
): TetherDivergenceComputeResult {
  const period = computed.periodSeconds;
  const pick = <T,>(vals: T[]): Array<T | null> =>
    alignToChart(
      computed.times.map((time, i) => ({ time, value: vals[i] })),
      chartBars,
      chartBarSeconds,
      period,
    );
  const times = chartBars.map((b) => b.time);
  const score = pick(computed.score);
  const zone = pick(computed.zone);
  const gapAligned = pick(computed.gap).map((g) => g === true);
  return {
    times,
    usdtRsi: pick(computed.usdtRsi),
    coinRsi: pick(computed.coinRsi),
    emaDistPct: pick(computed.emaDistPct),
    pctB: pick(computed.pctB),
    stretch: pick(computed.stretch),
    coinOversold: pick(computed.coinOversold),
    score,
    topScore: pick(computed.topScore),
    zone,
    gap: gapAligned,
    crosses: alignCrossesToChart(computed.crosses, chartBars, chartBarSeconds, period),
    topCrosses: alignCrossesToChart(computed.topCrosses, chartBars, chartBarSeconds, period),
    ladder: alignLadderToChart(computed.ladder, chartBars, chartBarSeconds, period),
    periodSeconds: period,
  };
}

export function lastDefined<T>(arr: Array<T | null | undefined>): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v != null) return v as T;
  }
  return null;
}

export function buildTetherMarkers(
  crosses: TetherCross[],
  settings: Pick<TetherDivergenceSettings, 'bottomColor' | 'watchColor' | 'topColor'> = TETHER_STRETCH_SETTINGS,
): TetherPriceMarker[] {
  return crosses.map((c) => ({
    time: c.time,
    kind: c.kind,
    text: c.kind === 'watch' ? 'Watch' : c.kind === 'top' ? 'Stretch -' : 'Stretch +',
    color: c.kind === 'watch' ? settings.watchColor : c.kind === 'top' ? settings.topColor : settings.bottomColor,
  }));
}

/**
 * Separate divergence markers: +1..+3 under the bar (bullish), -1..-3 over the bar (bearish).
 * Regular = circle, hidden = square (and a different colour), so the two can be told apart on the chart.
 */
export function buildTetherLadderMarkers(
  ladder: TetherLadderMarker[],
  settings: Pick<
    TetherDivergenceSettings,
    'bullDivColor' | 'bullHiddenColor' | 'bearDivColor' | 'bearHiddenColor'
  > = TETHER_STRETCH_SETTINGS,
): TetherLadderPriceMarker[] {
  return ladder.map((m) => {
    const bull = m.side === 'bull';
    const hidden = m.type === 'hidden';
    return {
      time: m.time,
      side: m.side,
      type: m.type,
      position: bull ? 'belowBar' : 'aboveBar',
      shape: hidden ? 'square' : 'circle',
      color: bull
        ? hidden ? settings.bullHiddenColor : settings.bullDivColor
        : hidden ? settings.bearHiddenColor : settings.bearDivColor,
      text: `${bull ? '+' : '-'}${m.n}`,
    };
  });
}

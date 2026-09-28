/**
 * Tide v2 — point-in-time Tide-out / Tide-in signals, per-timeframe presets, stop levels.
 *
 * Every signal is emitted once, at the first bar where it could be seen on a live chart,
 * using only bars up to and including that bar. Nothing is removed when later bars arrive
 * (the old zigzag-collapse detector dropped a DIV when a lower low replaced its pivot, which
 * made the backtest look better than the live chart).
 *
 * This mirrors the live-accurate research detector (`scripts/tide_live_core.py`: causal_divs,
 * causal_ema_peaks, atr_series, sim) including the 5 Sep wick-tie fix. Parity is pinned by
 * fixtures in `__tests__/lib/fixtures/tide_btc_{4h,1h}.json`.
 */
import { rsiWilder, type TideZonePoint } from '@/lib/indicators/tideZone';

export type TideTimeframe = '1h' | '4h';
export const TIDE_TIMEFRAMES: readonly TideTimeframe[] = ['1h', '4h'] as const;

export type TideStopKind = 'atr' | 'pct';

export interface TideSignalParams {
  /** Smoothing EMA of the Tide score used for the Tide-out divergence. */
  emaPeriod: number;
  /** Pivot length N (bars either side) for price wick pivots and Tide-EMA pivots. */
  pivotN: number;
  /** Both Tide-EMA troughs must be below this score (0 = off). */
  belowScore: number;
  /** Tide-in exit: EMA of the score whose confirmed peak is the exit. */
  exitEmaPeriod: number;
  /** Tide-in exit: pivot length N for that EMA peak. */
  exitPivotN: number;
  /** Stop under the Tide-out pivot low: ATR buffer or % buffer. */
  stopKind: TideStopKind;
  /** pivot low − mult × ATR(14) at the confirmation bar. */
  stopAtrMult: number;
  /** pivot low × (1 − pct). Fraction: 0.005 = 0.5%. */
  stopPct: number;
}

export interface TideCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TideOutSignal {
  /** Bar on which the signal becomes visible (marker bar). */
  confirmTime: number;
  /** Second (lower) price pivot low. */
  pivotTime: number;
  pivotPrice: number;
  /** First price pivot low of the divergence pair. */
  pivot1Time: number;
  pivot1Price: number;
  /** Tide-EMA troughs matched to the two price lows. */
  ema1: number;
  ema2: number;
  /** Lowest RSI(14) from the pivot bar through the confirmation bar. */
  minRsi: number | null;
  /** RSI(14) < 30 between pivot and confirmation → "Tide out +". */
  rsiPlus: boolean;
}

export interface TideInPeak {
  /** Bar on which the peak is confirmed (marker bar). */
  confirmTime: number;
  peakTime: number;
  value: number;
}

export type TideTradeOutcome = 'open' | 'tide_in' | 'stop';

export interface TideTrade {
  signal: TideOutSignal;
  /** Next bar open after the signal (null if that bar has not opened yet). */
  entryTime: number | null;
  entryPrice: number | null;
  stop: number;
  outcome: TideTradeOutcome;
  /** Tide-in peak confirmation bar that closes this signal. */
  tideInTime: number | null;
  /** Bar where the exit happened: stop-hit bar, or the open after the Tide-in bar. */
  exitTime: number | null;
  /** Where the stop line ends on the chart. */
  endTime: number;
}

export interface TideV2Result {
  params: TideSignalParams;
  emaOut: { time: number; value: number }[];
  emaIn: { time: number; value: number }[];
  signals: TideOutSignal[];
  peaks: TideInPeak[];
  trades: TideTrade[];
  /** True when the newest candle is still forming (excluded from signal detection). */
  lastBarOpen: boolean;
}

// ─── timeframe helpers ──────────────────────────────────────────────────────

export function tideTimeframeOf(tf: string | null | undefined): TideTimeframe | null {
  if (!tf) return null;
  const s = String(tf).trim().toLowerCase();
  if (s === '1h' || s === '60' || s === '60m' || s === '1hour') return '1h';
  if (s === '4h' || s === '240' || s === '240m' || s === '4hour') return '4h';
  return null;
}

export function medianBarSeconds(candles: { time: number }[]): number {
  if (candles.length < 2) return 0;
  const dts: number[] = [];
  const n = Math.min(candles.length, 80);
  for (let i = 1; i < n; i++) {
    const d = candles[i].time - candles[i - 1].time;
    if (d > 0) dts.push(d);
  }
  if (!dts.length) return 0;
  dts.sort((a, b) => a - b);
  return dts[Math.floor(dts.length / 2)];
}

/** Bar spacing → timeframe. Used where the chart interval is not passed in. */
export function inferTideTimeframe(candles: { time: number }[]): TideTimeframe | null {
  const dt = medianBarSeconds(candles);
  if (dt === 3600) return '1h';
  if (dt === 14400) return '4h';
  return null;
}

/** Explicit interval wins; fall back to candle spacing only when none was given. */
export function resolveTideTimeframe(
  timeframe: string | null | undefined,
  candles: { time: number }[],
): TideTimeframe | null {
  if (timeframe != null && timeframe !== '') return tideTimeframeOf(timeframe);
  return inferTideTimeframe(candles);
}

// ─── series helpers ─────────────────────────────────────────────────────────

/** Score per candle (NaN where Tide has no value yet). */
export function alignTideScores(candles: { time: number }[], data: TideZonePoint[]): number[] {
  const byTime = new Map<number, number>();
  for (const d of data) byTime.set(d.time, d.score);
  return candles.map((c) => {
    const v = byTime.get(c.time);
    return v != null && Number.isFinite(v) ? v : NaN;
  });
}

/** EMA seeded at the first finite value; gaps carry the previous value (research `ema_of`). */
export function emaCarry(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const seed = values.findIndex((v) => Number.isFinite(v));
  if (seed < 0) return out;
  if (period <= 0) return values.map((v) => (Number.isFinite(v) ? v : NaN));
  const k = 2 / (period + 1);
  let prev = values[seed];
  out[seed] = prev;
  for (let i = seed + 1; i < values.length; i++) {
    const v = Number.isFinite(values[i]) ? values[i] : prev;
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder ATR seeded on TR[1..n] (research `atr_series`, used for stops). */
export function atrWilder(candles: TideCandle[], n = 14): number[] {
  const m = candles.length;
  const out = new Array<number>(m).fill(NaN);
  if (m < n + 1) return out;
  const tr = new Array<number>(m).fill(0);
  for (let i = 1; i < m; i++) {
    const { high: h, low: l } = candles[i];
    const pc = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let s = 0;
  for (let i = 1; i <= n; i++) s += tr[i];
  out[n] = s / n;
  for (let i = n + 1; i < m; i++) out[i] = (out[i - 1] * (n - 1) + tr[i]) / n;
  return out;
}

// ─── pivots ─────────────────────────────────────────────────────────────────

interface RawPivot {
  index: number;
  type: 'high' | 'low';
  value: number;
}

/** N-bar wick fractals with the 5 Sep tie fix (unique wick on one side + tie on the other). */
function rawPriceFractals(candles: { high: number; low: number }[], n: number): RawPivot[] {
  const m = candles.length;
  const out: RawPivot[] = [];
  for (let i = n; i < m - n; i++) {
    const hi = candles[i].high;
    const lo = candles[i].low;
    let isHigh = true;
    let isLow = true;
    let highTied = false;
    let lowTied = false;
    for (let j = i - n; j <= i + n; j++) {
      if (j === i) continue;
      const jh = candles[j].high;
      const jl = candles[j].low;
      if (jh > hi) isHigh = false;
      else if (jh === hi) highTied = true;
      if (jl < lo) isLow = false;
      else if (jl === lo) lowTied = true;
    }
    if (isHigh && isLow) {
      if (!lowTied && highTied) isHigh = false;
      else if (!highTied && lowTied) isLow = false;
    }
    if (isHigh === isLow) continue;
    out.push({ index: i, type: isHigh ? 'high' : 'low', value: isHigh ? hi : lo });
  }
  return out;
}

function rawValueFractals(values: number[], n: number): RawPivot[] {
  const m = values.length;
  const out: RawPivot[] = [];
  for (let i = n; i < m - n; i++) {
    const x = values[i];
    if (!Number.isFinite(x)) continue;
    let isHigh = true;
    let isLow = true;
    for (let j = i - n; j <= i + n; j++) {
      if (j === i) continue;
      const y = values[j];
      if (!Number.isFinite(y)) {
        isHigh = false;
        isLow = false;
        break;
      }
      if (y > x) isHigh = false;
      if (y < x) isLow = false;
    }
    if (isHigh === isLow) continue;
    out.push({ index: i, type: isHigh ? 'high' : 'low', value: x });
  }
  return out;
}

/** Collapse into an alternating zigzag. Returns true if `p` became the tail. */
function pushZigzag(zz: RawPivot[], p: RawPivot): boolean {
  const last = zz[zz.length - 1];
  if (last && last.type === p.type) {
    const more = p.type === 'high' ? p.value >= last.value : p.value <= last.value;
    if (more) {
      zz[zz.length - 1] = p;
      return true;
    }
    return false;
  }
  zz.push(p);
  return true;
}

function pivotLen(n: number): number {
  return Math.max(2, Math.round(n));
}

// ─── detectors ──────────────────────────────────────────────────────────────

/**
 * Tide-out = price wick lower low vs Tide-EMA higher low, both EMA troughs below `belowScore`.
 * Walks bar by bar; a pivot is only known N bars after it prints. Each pair is emitted once.
 */
export function detectTideOutSignals(
  candles: { time: number; high: number; low: number }[],
  emaOut: number[],
  params: Pick<TideSignalParams, 'pivotN' | 'belowScore'>,
  rsi?: number[],
): TideOutSignal[] {
  const m = candles.length;
  const n = pivotLen(params.pivotN);
  if (m < n * 2 + 3 || emaOut.length !== m) return [];
  const below = params.belowScore;
  const t = candles.map((c) => c.time);
  const byConfirm = new Map<number, { price?: RawPivot; ema?: RawPivot }>();
  for (const p of rawPriceFractals(candles, n)) {
    const e = byConfirm.get(p.index + n) ?? {};
    e.price = p;
    byConfirm.set(p.index + n, e);
  }
  for (const p of rawValueFractals(emaOut, n)) {
    const e = byConfirm.get(p.index + n) ?? {};
    e.ema = p;
    byConfirm.set(p.index + n, e);
  }
  const bar = Math.max(1, t[1] - t[0]);
  const maxDt = bar * n * 2;
  const zp: RawPivot[] = [];
  const ze: RawPivot[] = [];
  const seen = new Set<string>();
  const out: TideOutSignal[] = [];
  const confirmBars = [...byConfirm.keys()].sort((a, b) => a - b);

  for (const i of confirmBars) {
    const ev = byConfirm.get(i)!;
    if (ev.price) pushZigzag(zp, ev.price);
    if (ev.ema) pushZigzag(ze, ev.ema);
    const lows = zp.slice(-8).filter((z) => z.type === 'low').slice(-3);
    const emaLows = ze.slice(-16).filter((z) => z.type === 'low');
    const near = (ti: number): RawPivot | null => {
      let best: RawPivot | null = null;
      let bd = Infinity;
      for (const e of emaLows) {
        const d = Math.abs(t[e.index] - ti);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      return best && bd <= maxDt ? best : null;
    };
    for (let k = 1; k < lows.length; k++) {
      const a = lows[k - 1];
      const b = lows[k];
      const key = `${a.index}:${b.index}`;
      if (seen.has(key)) continue;
      if (!(b.value < a.value)) continue;
      const e1 = near(t[a.index]);
      const e2 = near(t[b.index]);
      if (!e1 || !e2 || e2.index <= e1.index) continue;
      if (below < 0 && (e1.value >= below || e2.value >= below)) continue;
      if (!(e2.value > e1.value)) continue;
      seen.add(key);
      let minRsi: number | null = null;
      if (rsi) {
        for (let j = b.index; j <= i; j++) {
          const r = rsi[j];
          if (Number.isFinite(r) && (minRsi === null || r < minRsi)) minRsi = r;
        }
      }
      out.push({
        confirmTime: t[i],
        pivotTime: t[b.index],
        pivotPrice: b.value,
        pivot1Time: t[a.index],
        pivot1Price: a.value,
        ema1: e1.value,
        ema2: e2.value,
        minRsi,
        rsiPlus: minRsi !== null && minRsi < 30,
      });
    }
  }
  return out;
}

/** Tide-in = confirmed peak of the exit EMA (zigzag high becoming the tail), N bars after it. */
export function detectTideInPeaks(
  candles: { time: number }[],
  emaIn: number[],
  pivotN: number,
  above = 0,
): TideInPeak[] {
  const n = pivotLen(pivotN);
  const m = candles.length;
  if (emaIn.length !== m) return [];
  const zz: RawPivot[] = [];
  const out: TideInPeak[] = [];
  for (const p of rawValueFractals(emaIn, n)) {
    if (!pushZigzag(zz, p)) continue;
    const i = p.index + n;
    if (p.type === 'high' && (above <= 0 || p.value > above) && i < m) {
      out.push({ confirmTime: candles[i].time, peakTime: candles[p.index].time, value: p.value });
    }
  }
  return out;
}

export function tideStopLevel(
  pivotPrice: number,
  atrAtConfirm: number,
  params: Pick<TideSignalParams, 'stopKind' | 'stopAtrMult' | 'stopPct'>,
  entryPrice: number | null = null,
): number {
  let sp: number;
  if (params.stopKind === 'atr') {
    const a = Number.isFinite(atrAtConfirm) ? atrAtConfirm : entryPrice != null ? entryPrice * 0.01 : 0;
    sp = pivotPrice - params.stopAtrMult * a;
  } else {
    sp = pivotPrice * (1 - params.stopPct);
  }
  // Stop can't sit above the fill (gap up through the pivot): fall back like the backtest.
  if (entryPrice != null && sp >= entryPrice) sp = Math.min(pivotPrice, entryPrice * 0.995);
  return sp;
}

/**
 * One lifecycle per Tide-out signal: enter next open, stop under the pivot, exit on the first
 * Tide-in peak confirmed at/after the entry bar (at the following open) or when the stop is hit.
 * Uses every loaded candle, including a still-forming one (a touched stop stays touched).
 */
export function buildTideTrades(
  candles: TideCandle[],
  signals: TideOutSignal[],
  peaks: TideInPeak[],
  params: Pick<TideSignalParams, 'stopKind' | 'stopAtrMult' | 'stopPct'>,
  atr: number[] = atrWilder(candles, 14),
): TideTrade[] {
  const m = candles.length;
  if (!m) return [];
  const idx = new Map<number, number>();
  candles.forEach((c, i) => idx.set(c.time, i));
  const peakIdx = peaks
    .map((p) => idx.get(p.confirmTime))
    .filter((i): i is number => i != null)
    .sort((a, b) => a - b);
  const out: TideTrade[] = [];
  for (const s of signals) {
    const ci = idx.get(s.confirmTime);
    if (ci == null) continue;
    const fill = ci + 1;
    const entryPrice = fill < m ? candles[fill].open : null;
    const stop = tideStopLevel(s.pivotPrice, atr[ci], params, entryPrice);
    const x = peakIdx.find((p) => p >= fill);
    let outcome: TideTradeOutcome = 'open';
    let exitIdx: number | null = null;
    for (let j = fill; j < m; j++) {
      if (x != null && j === x + 1) {
        outcome = 'tide_in';
        exitIdx = j;
        break;
      }
      if (candles[j].low <= stop) {
        outcome = 'stop';
        exitIdx = j;
        break;
      }
    }
    // Tide-in printed on the newest bar: exit is the next open, not loaded yet.
    if (outcome === 'open' && x != null) outcome = 'tide_in';
    const tideInTime = outcome === 'tide_in' && x != null ? candles[x].time : null;
    const endIdx = exitIdx ?? (outcome === 'tide_in' && x != null ? x : m - 1);
    out.push({
      signal: s,
      entryTime: fill < m ? candles[fill].time : null,
      entryPrice,
      stop,
      outcome,
      tideInTime,
      exitTime: exitIdx != null ? candles[exitIdx].time : null,
      endTime: candles[Math.max(ci, endIdx)].time,
    });
  }
  return out;
}

/** Union by (confirm, pivot). A signal already shown keeps its first version; nothing is dropped. */
export function mergeTideSignals(prev: TideOutSignal[], next: TideOutSignal[]): TideOutSignal[] {
  const key = (s: TideOutSignal) => `${s.confirmTime}:${s.pivotTime}`;
  const map = new Map<string, TideOutSignal>();
  for (const s of prev) map.set(key(s), s);
  for (const s of next) if (!map.has(key(s))) map.set(key(s), s);
  return [...map.values()].sort((a, b) => a.confirmTime - b.confirmTime || a.pivotTime - b.pivotTime);
}

export interface ComputeTideV2Options {
  /** Wall clock (unix seconds). The newest candle is treated as forming until time + bar ≤ now. */
  nowSec?: number;
  /** Override bar length (seconds). Defaults to the median spacing. */
  barSec?: number;
  /**
   * Skip signals confirmed within the first N loaded bars. Tide's percentiles/EMAs need history:
   * on 1000-bar windows vs full history, every mismatch was in the first ~400 bars (none later).
   */
  warmupBars?: number;
}

/** Default Tide warm-up (bars) before signals are shown. The site loads 3000 1h/4h bars. */
export const TIDE_WARMUP_BARS = 400;

/** Full v2 pass: signals + Tide-in peaks on closed bars, lifecycles on every loaded bar. */
export function computeTideV2(
  candles: TideCandle[],
  data: TideZonePoint[],
  params: TideSignalParams,
  options: ComputeTideV2Options = {},
): TideV2Result {
  const empty: TideV2Result = { params, emaOut: [], emaIn: [], signals: [], peaks: [], trades: [], lastBarOpen: false };
  if (!candles.length || !data.length) return empty;
  const barSec = options.barSec ?? medianBarSeconds(candles);
  const now = options.nowSec ?? Date.now() / 1000;
  const lastBarOpen = barSec > 0 && candles[candles.length - 1].time + barSec > now;
  const closed = lastBarOpen ? candles.slice(0, -1) : candles;
  const scores = alignTideScores(closed, data);
  const eo = emaCarry(scores, params.emaPeriod);
  const ei = emaCarry(scores, params.exitEmaPeriod);
  const rsi = rsiWilder(
    closed.map((c) => c.close),
    14,
  );
  const warmup = options.warmupBars ?? TIDE_WARMUP_BARS;
  const warmupTime = closed.length > warmup ? closed[warmup].time : Infinity;
  const signals = detectTideOutSignals(closed, eo, params, rsi).filter((s) => s.confirmTime >= warmupTime);
  const peaks = detectTideInPeaks(closed, ei, params.exitPivotN);
  const trades = buildTideTrades(candles, signals, peaks, params, atrWilder(candles, 14));
  const toLine = (xs: number[]) =>
    xs.flatMap((v, i) => (Number.isFinite(v) ? [{ time: closed[i].time, value: v }] : []));
  return { params, emaOut: toLine(eo), emaIn: toLine(ei), signals, peaks, trades, lastBarOpen };
}

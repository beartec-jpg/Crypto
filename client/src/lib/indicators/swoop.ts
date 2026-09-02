/**
 * Swoop — predictive pivot-slope accumulation from consecutive lower highs.
 *
 * Pivots are a zigzag of length N from wick extremes:
 *   1. n-bar fractal: wick high/low is the extreme of N bars left and N right
 *   2. swings must alternate H-L-H-L; consecutive same-type keep the more extreme wick
 *   3. minPivotPct is the minimum reversal to confirm the opposite pivot
 *
 * Trend lines are drawn between each consecutive lower high (H1→H2, H2→H3, …)
 * and each consecutive lower low (L1→L2, L2→L3, …). Projection from the last
 * pivot is two rays only:
 *   - base: same linear angle (Δprice/Δbars) as the last confirmed pivot line
 *   - fan: that angle + measured Δ (or % change of the Δs when 3 legs exist)
 * Flattening is clamped so a descending line cannot reverse up through price.
 * Detection is scoped to the visible chart range (plus a swing-length pad
 * so edge pivots can still confirm). Panning into history rebuilds Swoop
 * from the candles on screen.
 */
import type { CandleData } from '@/types/chart.types';
import type {
  SwoopDrawSegment,
  SwoopFanRay,
  SwoopGapStat,
  SwoopPivotLabel,
  SwoopPoint,
  SwoopResult,
  SwoopSegment,
  SwoopBookPattern,
  SwoopSettings,
  SwoopSlopeBand,
  SwoopState,
} from '@/types/swoop';
import { DEFAULT_SWOOP_SETTINGS, SWOOP_GAP_LABEL } from '@/types/swoop';
import { calculateSwings } from '@/lib/smc/pivots';
import { analyzeSwoopGaps, detectSwoopBuy } from '@/lib/indicators/swoopGapAnalysis';

export type SwoopCandle = Pick<CandleData, 'time' | 'open' | 'high' | 'low' | 'close'> & {
  volume?: number;
  takerBuyVolume?: number;
};

interface SwingLike {
  time: number;
  value: number;
  type: 'high' | 'low';
  index: number;
}

const EMPTY: SwoopResult = {
  state: 'idle',
  pattern: 'none',
  armed: false,
  highs: [],
  lows: [],
  topSegments: [],
  bottomSegments: [],
  liveTopSlope: null,
  liveBottomSlope: null,
  expectedTopBand: null,
  expectedBottomBand: null,
  gap: null,
  armGap: null,
  compression: null,
  prevGapBars: 0,
  projectBars: 0,
  fan: [],
  drawSegments: [],
  labels: [],
  label: 'Idle',
  gapStats: [],
  buy: null,
};

export function logSlope(p1: number, p2: number, bars: number): number {
  if (bars <= 0 || p1 <= 0 || p2 <= 0 || !Number.isFinite(p1) || !Number.isFinite(p2)) return 0;
  return (Math.log(p2) - Math.log(p1)) / bars;
}

/** Chart angle of a pivot gap: Δprice / Δbars. This is what the dashed base copies. */
export function linearSlope(p1: number, p2: number, bars: number): number {
  if (bars <= 0 || !Number.isFinite(p1) || !Number.isFinite(p2)) return 0;
  return (p2 - p1) / bars;
}

/** Ordinary least squares: fit series[k] = a + b*k, return the value at `at`. */
export function olsAt(series: number[], at: number): number {
  const n = series.length;
  if (n === 0) return 0;
  if (n === 1) return series[0];
  let sumK = 0;
  let sumY = 0;
  let sumKK = 0;
  let sumKY = 0;
  for (let k = 0; k < n; k++) {
    const y = series[k];
    sumK += k;
    sumY += y;
    sumKK += k * k;
    sumKY += k * y;
  }
  const denom = n * sumKK - sumK * sumK;
  if (Math.abs(denom) < 1e-18) return series[n - 1];
  const b = (n * sumKY - sumK * sumY) / denom;
  const a = (sumY - b * sumK) / n;
  return a + b * at;
}

/**
 * Next gap angle from the whole structure.
 * Base case (2 gaps): last + (last − prev).
 * 3+ gaps: differences of every consecutive pair, fit that Δ series, add the
 * next Δ to the last gap angle.
 */
export function predictNextSlope(slopes: number[]): number {
  if (slopes.length === 0) return 0;
  if (slopes.length === 1) return slopes[0];
  const last = slopes[slopes.length - 1];
  const deltas: number[] = [];
  for (let i = 1; i < slopes.length; i++) deltas.push(slopes[i] - slopes[i - 1]);
  const nextDelta = olsAt(deltas, deltas.length);
  return last + nextDelta;
}

/**
 * mid = last gap (base, same angle).
 * lo/hi = predicted next gap from every confirmed gap in the run.
 * A descending last-leg is never allowed to project above flat.
 */
export function expectedSlopeBand(slopes: number[]): SwoopSlopeBand {
  if (slopes.length === 0) return { lo: 0, mid: 0, hi: 0 };
  const last = slopes[slopes.length - 1];
  if (slopes.length === 1) return { lo: last, mid: last, hi: last };
  let predicted = predictNextSlope(slopes);
  if (last < 0) predicted = Math.min(0, predicted);
  if (last > 0) predicted = Math.max(0, predicted);
  return {
    lo: Math.min(last, predicted),
    mid: last,
    hi: Math.max(last, predicted),
  };
}

export function isShallowerThanExpected(actual: number, band: SwoopSlopeBand, eps = 1e-9): boolean {
  return actual > band.hi + eps;
}

/**
 * Next-leg length from P1→P2 vs P2→P3 bar counts.
 * If the last leg stretched, project a longer one; if it contracted, a shorter one.
 */
export function projectLength(prevBars: number, lastBars: number): number {
  const last = Math.max(1, lastBars || 0);
  if (!prevBars || prevBars <= 0) return Math.max(3, last);
  const ratio = last / prevBars;
  const scaled = last * Math.min(2.5, Math.max(0.4, ratio));
  return Math.max(3, Math.min(240, Math.round(scaled)));
}

function toPoint(index: number, time: number, price: number): SwoopPoint {
  return { index, time, price };
}

function swingToPoint(s: SwingLike): SwoopPoint {
  return toPoint(s.index, s.time, s.value);
}

function buildSegments(points: SwoopPoint[]): SwoopSegment[] {
  const segs: SwoopSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    const lengthBars = end.index - start.index;
    if (lengthBars <= 0) continue;
    segs.push({ start, end, slope: linearSlope(start.price, end.price, lengthBars), lengthBars });
  }
  return segs;
}

function linePriceAt(anchor: SwoopPoint, slope: number, index: number): number {
  return anchor.price + slope * (index - anchor.index);
}

function projectTime(candles: SwoopCandle[], fromIndex: number, barsAhead: number): number {
  const lastIdx = candles.length - 1;
  const last = candles[lastIdx];
  const prev = candles[Math.max(0, lastIdx - 1)];
  const step = last && prev ? Math.max(1, last.time - prev.time) : 1;
  const target = fromIndex + barsAhead;
  if (target <= lastIdx && target >= 0) return candles[target].time;
  const extra = target - lastIdx;
  return (last?.time ?? 0) + extra * step;
}

function stateLabel(state: SwoopState, compression: number | null): string {
  if (state === 'armed') return 'Armed';
  if (state === 'slowing') return 'Slowing';
  if (state === 'compressing') return compression != null ? `Compressing ${Math.round(compression * 100)}%` : 'Compressing';
  if (state === 'release') return 'Release';
  return 'Idle';
}

function fmtPx(n: number): string {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(5);
}

const FLAG_SHORT: Record<string, string> = {
  cvd_vs_price: 'CVD\u2191/px\u2193',
  rsi_div: 'RSI div',
  rsi_hold: 'RSI hold',
  vol_dry: 'vol dry',
  up_bar_vol: 'up-vol',
  flattening: 'flat',
  range_shrink: 'tight',
  equal_high: 'LH=',
};

/** Place gap-status text on the chart at the midpoint of each pivot period. */
export function buildGapLabels(stats: SwoopGapStat[]): SwoopPivotLabel[] {
  return stats.map((g) => {
    const flags = g.flags.map((f) => FLAG_SHORT[f] ?? f).filter(Boolean);
    return {
      time: (g.startTime + g.endTime) / 2,
      price: (g.startPrice + g.endPrice) / 2,
      text: `${SWOOP_GAP_LABEL[g.status]} ${g.score}`,
      sub: flags.length ? flags.join(' \u00b7 ') : undefined,
      kind: g.side === 'top' ? 'high' : 'low',
    };
  });
}

/** @deprecated H/L markers — kept for older tests; chart now uses buildGapLabels. */
export function buildZigzagLabels(swings: SwingLike[]): SwoopPivotLabel[] {
  const labels: SwoopPivotLabel[] = [];
  let hi = 0;
  let lo = 0;
  for (const s of swings) {
    if (s.type === 'high') {
      hi += 1;
      labels.push({ time: s.time, price: s.value, text: `H${hi}`, kind: 'high' });
    } else {
      lo += 1;
      labels.push({ time: s.time, price: s.value, text: `L${lo}`, kind: 'low' });
    }
  }
  return labels;
}

/**
 * True zigzag from n-bar wick fractals.
 * Consecutive same-type swings keep the more extreme wick (highest high / lowest low).
 * Opposite pivots must reverse at least minPivotPct or they are not confirmed.
 */
export function collapseSwings(swings: SwingLike[], minPivotPct = 0): SwingLike[] {
  if (swings.length === 0) return [];
  const zz: SwingLike[] = [];
  const threshold = minPivotPct / 100;

  for (const s of swings) {
    if (zz.length === 0) {
      zz.push(s);
      continue;
    }
    const last = zz[zz.length - 1];
    if (s.type === last.type) {
      const moreExtreme = s.type === 'high' ? s.value >= last.value : s.value <= last.value;
      if (moreExtreme) zz[zz.length - 1] = s;
      continue;
    }
    if (threshold > 0) {
      const change = Math.abs(s.value - last.value) / Math.max(last.value, 1e-12);
      if (change < threshold) continue;
    }
    zz.push(s);
  }
  return zz;
}

export function trailingLowerHighs(highs: SwoopPoint[], minCount: number): SwoopPoint[] {
  if (highs.length < minCount) return [];
  const run: SwoopPoint[] = [highs[highs.length - 1]];
  for (let i = highs.length - 2; i >= 0; i--) {
    if (highs[i].price > run[0].price) run.unshift(highs[i]);
    else break;
  }
  return run.length >= minCount ? run : [];
}

export function trailingLowerLows(lows: SwoopPoint[], minCount = 2): SwoopPoint[] {
  if (lows.length < 2) return lows.slice(-Math.max(1, lows.length));
  const run: SwoopPoint[] = [lows[lows.length - 1]];
  for (let i = lows.length - 2; i >= 0; i--) {
    if (lows[i].price > run[0].price) run.unshift(lows[i]);
    else break;
  }
  return run.length >= minCount ? run : lows.slice(-2);
}

/**
 * From the highest swing in the lookback, walk forward and keep every lower
 * high. A later bounce that prints a slightly higher high (XRP 1.433 vs 1.403
 * after the 1.70 spike) is skipped instead of disarming the envelope.
 */
export function structureLowerHighs(
  highs: SwoopPoint[],
  minCount: number,
  options: { minPivotPct?: number; lastIndex?: number; lookbackBars?: number } = {},
): SwoopPoint[] {
  const minPct = (options.minPivotPct ?? 0) / 100;
  const lastIndex = options.lastIndex ?? (highs.length ? highs[highs.length - 1].index : 0);
  const lookback = options.lookbackBars ?? 500;
  const pool = highs.filter((h) => lastIndex - h.index <= lookback);
  const use = pool.length >= minCount ? pool : highs;
  if (use.length < minCount) return [];

  let peak = 0;
  for (let i = 1; i < use.length; i++) {
    if (use[i].price > use[peak].price) peak = i;
  }

  const seq: SwoopPoint[] = [use[peak]];
  for (let i = peak + 1; i < use.length; i++) {
    const h = use[i];
    const last = seq[seq.length - 1];
    if (h.price >= last.price) continue;
    if (minPct > 0 && (last.price - h.price) / last.price < minPct) continue;
    seq.push(h);
  }
  return seq.length >= minCount ? seq : [];
}

/**
 * Bottom of the same structure: swing lows after the major top, keeping
 * successive lower lows so the channel spans the whole dump, not just the
 * last two troughs.
 */
export function structureLowerLows(
  lows: SwoopPoint[],
  afterIndex: number,
  minCount = 2,
  options: { minPivotPct?: number } = {},
): SwoopPoint[] {
  const minPct = (options.minPivotPct ?? 0) / 100;
  const pool = lows.filter((l) => l.index > afterIndex);
  if (pool.length === 0) return [];
  const seq: SwoopPoint[] = [pool[0]];
  for (let i = 1; i < pool.length; i++) {
    const l = pool[i];
    const last = seq[seq.length - 1];
    if (l.price >= last.price) continue;
    if (minPct > 0 && (last.price - l.price) / last.price < minPct) continue;
    seq.push(l);
  }
  if (seq.length >= minCount) return seq;
  return pool.slice(0, Math.min(Math.max(minCount, 1), pool.length));
}

/**
 * Higher-low run after the major top: trough, then every higher low.
 * Used for equal compression (triangle): LH + HL.
 */
export function structureHigherLows(
  lows: SwoopPoint[],
  afterIndex: number,
  minCount = 2,
  options: { minPivotPct?: number } = {},
): SwoopPoint[] {
  const minPct = (options.minPivotPct ?? 0) / 100;
  const pool = lows.filter((l) => l.index > afterIndex);
  if (pool.length < minCount) return [];
  let trough = 0;
  for (let i = 1; i < pool.length; i++) {
    if (pool[i].price < pool[trough].price) trough = i;
  }
  const seq: SwoopPoint[] = [pool[trough]];
  for (let i = trough + 1; i < pool.length; i++) {
    const l = pool[i];
    const last = seq[seq.length - 1];
    if (l.price <= last.price) continue;
    if (minPct > 0 && (l.price - last.price) / last.price < minPct) continue;
    seq.push(l);
  }
  return seq.length >= minCount ? seq : [];
}

function relMove(a: number, b: number): number {
  return Math.abs(b - a) / Math.max(Math.abs(a), 1e-12);
}

function isDeceleratingDescent(segs: SwoopSegment[]): boolean {
  if (segs.length < 2) return false;
  const slopes = segs.map((s) => s.slope);
  // The open of the run must be a dump; the last gap may already be flat.
  if (slopes[0] >= 0) return false;
  let flattening = 0;
  for (let i = 1; i < slopes.length; i++) {
    if (slopes[i] > slopes[i - 1] + 1e-12) flattening++;
  }
  return flattening >= Math.ceil((slopes.length - 1) / 2);
}

function overallDump(points: SwoopPoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0].price;
  const last = points[points.length - 1].price;
  return (first - last) / Math.max(Math.abs(first), 1e-12);
}

function pointsMostlyFlat(points: SwoopPoint[], maxRel = 0.01): boolean {
  if (points.length < 2) return false;
  let flat = 0;
  for (let i = 1; i < points.length; i++) {
    if (relMove(points[i - 1].price, points[i].price) <= maxRel) flat++;
  }
  return flat / (points.length - 1) >= 0.75;
}

/**
 * Whole-structure profile. A dump that flattens at the end is still a swoop
 * (completing), not a channel. Channel only if the entire run is sideways.
 */
export function classifyBookPattern(
  lh: SwoopPoint[],
  ll: SwoopPoint[],
  hl: SwoopPoint[],
  topSegs: SwoopSegment[],
): { pattern: SwoopBookPattern; bottom: 'll' | 'hl' | 'none' } {
  const hasLH = lh.length >= 2;
  const hasLL = ll.length >= 2;
  const hasHL = hl.length >= 2;
  if (!hasLH) return { pattern: 'none', bottom: 'none' };

  const dump = overallDump(lh);
  const curved = isDeceleratingDescent(topSegs);
  const bottom: 'll' | 'hl' | 'none' = hasHL ? 'hl' : hasLL ? 'll' : 'none';

  const wholeChannel =
    dump < 0.03 &&
    pointsMostlyFlat(lh) &&
    ((hasHL && pointsMostlyFlat(hl)) || (hasLL && pointsMostlyFlat(ll)) || (!hasHL && !hasLL));
  if (wholeChannel) return { pattern: 'channel', bottom: hasHL ? 'hl' : hasLL ? 'll' : 'none' };

  // Completing swoop: real LH dump that decelerated, even if the last gap is flat
  // or the last lows have started to rise (HL).
  if (dump >= 0.03 && curved) {
    return { pattern: 'swoop', bottom };
  }

  if (hasHL && dump < 0.12) {
    return { pattern: 'equal_compression', bottom: 'hl' };
  }
  if (hasLL) return { pattern: 'down_compression', bottom: 'll' };
  if (hasHL) return { pattern: 'equal_compression', bottom: 'hl' };
  return { pattern: dump >= 0.03 ? 'swoop' : 'down_compression', bottom: 'none' };
}

export interface SwoopVisibleRange {
  fromIndex?: number;
  toIndex?: number;
  from?: number;
  to?: number;
}

export function resolveSwoopWindow(
  candles: SwoopCandle[],
  visibleRange?: SwoopVisibleRange | null,
): { fromIdx: number; toIdx: number } {
  const n = candles.length;
  if (!n) return { fromIdx: 0, toIdx: 0 };
  let fromIdx = 0;
  let toIdx = n - 1;
  if (visibleRange) {
    if (Number.isFinite(visibleRange.fromIndex) && Number.isFinite(visibleRange.toIndex)) {
      fromIdx = Math.floor(visibleRange.fromIndex as number);
      toIdx = Math.ceil(visibleRange.toIndex as number);
    } else if (Number.isFinite(visibleRange.from) && Number.isFinite(visibleRange.to)) {
      const fromT = Number(visibleRange.from);
      const toT = Number(visibleRange.to);
      fromIdx = candles.findIndex((c) => c.time >= fromT);
      if (fromIdx < 0) fromIdx = 0;
      toIdx = n - 1;
      for (let i = n - 1; i >= 0; i--) {
        if (candles[i].time <= toT) {
          toIdx = i;
          break;
        }
      }
    }
  }
  fromIdx = Math.max(0, Math.min(n - 1, fromIdx));
  toIdx = Math.max(fromIdx, Math.min(n - 1, toIdx));
  return { fromIdx, toIdx };
}

export function detectSwoop(
  candles: SwoopCandle[],
  settings: SwoopSettings = DEFAULT_SWOOP_SETTINGS,
  visibleRange?: SwoopVisibleRange | null,
): SwoopResult {
  if (!settings.enabled || !candles || candles.length < settings.swingLength * 2 + 4) return EMPTY;
  const { fromIdx, toIdx } = resolveSwoopWindow(candles, visibleRange);
  const pad = settings.swingLength;
  const sliceFrom = Math.max(0, fromIdx - pad);
  const sliceTo = Math.min(candles.length - 1, toIdx + pad);
  const series = candles.slice(sliceFrom, sliceTo + 1);
  const visLo = fromIdx - sliceFrom;
  const visHi = toIdx - sliceFrom;
  if (series.length < settings.swingLength * 2 + 4) return EMPTY;

  const minPivotPct = settings.minPivotPct ?? 0;
  const raw = calculateSwings(series as CandleData[], settings.swingLength);
  const swings = collapseSwings(raw, minPivotPct);
  const highs: SwoopPoint[] = swings
    .filter((s) => s.type === 'high' && s.index >= visLo && s.index <= visHi)
    .map(swingToPoint);
  const lows: SwoopPoint[] = swings
    .filter((s) => s.type === 'low' && s.index >= visLo && s.index <= visHi)
    .map(swingToPoint);
  const lastIdx = visHi;
  const lookbackBars = visibleRange
    ? Math.max(toIdx - fromIdx + 1, settings.swingLength * 4)
    : Math.max(500, settings.swingLength * 40);
  const lhRun = structureLowerHighs(highs, settings.minLowerHighs, {
    minPivotPct,
    lastIndex: lastIdx,
    lookbackBars,
  });
  if (lhRun.length < settings.minLowerHighs) {
    const a = highs.length >= 2 ? highs[highs.length - 2] : null;
    const b = highs.length >= 1 ? highs[highs.length - 1] : null;
    let reason = `Idle · need ${settings.minLowerHighs} lower highs`;
    if (a && b && b.price >= a.price) {
      reason = `Idle · last high not lower (${fmtPx(b.price)} ≥ ${fmtPx(a.price)})`;
    } else if (highs.length < settings.minLowerHighs) {
      reason = `Idle · need ${settings.minLowerHighs} lower highs`;
    }
    const labels: SwoopPivotLabel[] = [];
    return { ...EMPTY, highs, lows, labels, label: reason };
  }
  const llRun = structureLowerLows(lows, lhRun[0].index, 2, { minPivotPct });
  const hlRun = structureHigherLows(lows, lhRun[0].index, 2, { minPivotPct });
  const lastCandle = series[lastIdx];
  const topSegments = buildSegments(lhRun);
  const book = classifyBookPattern(lhRun, llRun, hlRun, topSegments);
  const bottomRun = book.bottom === 'hl' ? hlRun : book.bottom === 'll' ? llRun : [];
  const bottomSegments = buildSegments(bottomRun);
  const lastHigh = lhRun[lhRun.length - 1];
  const lastLow = bottomRun.length ? bottomRun[bottomRun.length - 1] : null;
  const lastTop = topSegments[topSegments.length - 1];
  const prevTop = topSegments[topSegments.length - 2];
  const lastBot = bottomSegments[bottomSegments.length - 1];
  const prevBot = bottomSegments[bottomSegments.length - 2];
  const lastGapBars = lastTop?.lengthBars ?? lastBot?.lengthBars ?? settings.swingLength * 3;
  const projectBars = Math.max(
    lastGapBars,
    projectLength(prevTop?.lengthBars ?? prevBot?.lengthBars ?? 0, lastGapBars),
  );
  const prevGapBars = lastTop?.lengthBars ?? lastBot?.lengthBars ?? 0;
  const expectedTopBand = topSegments.length >= 1
    ? expectedSlopeBand(topSegments.map((s) => s.slope))
    : null;
  const expectedBottomBand = bottomSegments.length >= 1
    ? expectedSlopeBand(bottomSegments.map((s) => s.slope))
    : null;
  let liveHighPrice = lastHigh.price;
  let liveHighIndex = lastHigh.index;
  let lowAfterHighIndex = -1;
  if (lastLow && lastLow.index > lastHigh.index) lowAfterHighIndex = lastLow.index;
  else {
    for (let i = lastHigh.index + 1; i <= lastIdx; i++) {
      if (lowAfterHighIndex < 0 || series[i].low <= series[lowAfterHighIndex].low) lowAfterHighIndex = i;
    }
  }
  if (lowAfterHighIndex > lastHigh.index) {
    liveHighPrice = series[lowAfterHighIndex].high;
    liveHighIndex = lowAfterHighIndex;
    for (let i = lowAfterHighIndex; i <= lastIdx; i++) {
      if (series[i].high >= liveHighPrice) { liveHighPrice = series[i].high; liveHighIndex = i; }
    }
  }
  const lastCompletedTopSlope = lastTop?.slope ?? null;
  const formingTopSlope = liveHighIndex > lastHigh.index
    ? linearSlope(lastHigh.price, liveHighPrice, liveHighIndex - lastHigh.index)
    : lastCompletedTopSlope;
  let formingBottomSlope: number | null = null;
  let liveLowPrice = lastLow?.price ?? lastCandle.low;
  let liveLowIndex = lastLow?.index ?? lastIdx;
  if (lastLow) {
    liveLowPrice = lastLow.price;
    liveLowIndex = lastLow.index;
    for (let i = lastLow.index + 1; i <= lastIdx; i++) {
      if (series[i].low <= liveLowPrice) { liveLowPrice = series[i].low; liveLowIndex = i; }
    }
    if (liveLowIndex === lastLow.index) { liveLowPrice = lastCandle.low; liveLowIndex = lastIdx; }
    formingBottomSlope = liveLowIndex > lastLow.index
      ? linearSlope(lastLow.price, liveLowPrice, liveLowIndex - lastLow.index)
      : lastBot?.slope ?? null;
  }
  const liveTopSlope = formingTopSlope;
  const liveBottomSlope = formingBottomSlope;
  const topSlopeForGap = lastCompletedTopSlope ?? liveTopSlope ?? expectedTopBand?.mid ?? 0;
  const botAnchor = lastLow ?? { index: visLo, time: series[visLo].time, price: series[visLo].low };
  const botSlopeForGap = lastBot?.slope ?? liveBottomSlope ?? expectedBottomBand?.mid ?? 0;
  const upperNow = linePriceAt(lastHigh, topSlopeForGap, lastIdx);
  const lowerNow = linePriceAt(botAnchor, botSlopeForGap, lastIdx);
  const gap = Math.max(0, upperNow - lowerNow);
  const armIndex = lastTop?.start.index ?? lhRun[1]?.index ?? lastHigh.index;
  const upperArm = lastTop ? lastTop.start.price : lastHigh.price;
  const lowerArm = linePriceAt(botAnchor, botSlopeForGap, armIndex);
  const armGap = Math.max(gap, Math.abs(upperArm - lowerArm));
  const flattenCompression = (() => {
    if (prevTop == null || lastTop == null) return 0;
    const prev = prevTop.slope;
    const last = lastTop.slope;
    if (prev >= 0) return 0;
    if (last <= prev) return 0;
    return Math.max(0, Math.min(1, (last - prev) / (0 - prev)));
  })();
  const compression = Math.max(
    flattenCompression,
    armGap > 0 ? Math.max(0, Math.min(1, 1 - gap / armGap)) : 0,
  );
  const flatten = settings.flattenThreshold;
  const topFlattening = formingTopSlope != null && formingTopSlope >= -flatten;
  const topShallower = formingTopSlope != null && expectedTopBand != null && (formingTopSlope > expectedTopBand.mid + flatten * 0.25 || isShallowerThanExpected(formingTopSlope, expectedTopBand));
  const slowing = topFlattening || topShallower;
  const compressing = compression >= 0.18 && (slowing || flattenCompression >= 0.18);
  const closeAboveTop = lastCandle.close > upperNow * 1.001;
  let state: SwoopState = 'armed';
  if (closeAboveTop && (slowing || compressing)) state = 'release';
  else if (compressing) state = 'compressing';
  else if (slowing) state = 'slowing';
  const fan: SwoopFanRay[] = [];
  const pushFan = (
    anchor: SwoopPoint,
    band: SwoopSlopeBand,
    side: 'top' | 'bottom',
    lastSeg: SwoopSegment | undefined,
  ) => {
    // LH / LL projection must stay with the descent. A positive last-leg
    // is not this structure — skip so we never fire a ray up through price.
    if (band.mid > 1e-12) return;
    // Copy the last gap's Δtime so the dashed base is the same on-chart
    // angle as that segment (price/time), not a bar-count chord into "now".
    const dt = lastSeg ? lastSeg.end.time - lastSeg.start.time : 0;
    const bars = lastSeg?.lengthBars ?? projectBars;
    const endTime = dt > 0 ? anchor.time + dt : projectTime(series, anchor.index, bars);
    const pushRay = (kind: SwoopFanRay['kind'], slope: number) => {
      fan.push({
        startTime: anchor.time,
        startPrice: anchor.price,
        endTime,
        endPrice: anchor.price + slope * bars,
        kind,
        side,
      });
    };
    pushRay('mid', band.mid);
    const edgeKind: SwoopFanRay['kind'] = band.lo < band.mid - 1e-12 ? 'lo' : band.hi > band.mid + 1e-12 ? 'hi' : 'mid';
    const edgeSlope = edgeKind === 'lo' ? band.lo : edgeKind === 'hi' ? band.hi : band.mid;
    if (edgeKind !== 'mid') pushRay(edgeKind, edgeSlope);
  };
  if (settings.showFan && expectedTopBand) pushFan(lastHigh, expectedTopBand, 'top', lastTop);
  if (settings.showFan && expectedBottomBand && lastLow) pushFan(lastLow, expectedBottomBand, 'bottom', lastBot);
  const drawSegments: SwoopDrawSegment[] = [];
  const pushSeg = (start: SwoopPoint, end: { time: number; price: number }, color: string, role: SwoopDrawSegment['role'], style: SwoopDrawSegment['lineStyle'] = settings.lineStyle, width = settings.lineWidth) => {
    drawSegments.push({ startTime: start.time, startPrice: start.price, endTime: end.time, endPrice: end.price, color, lineWidth: width, lineStyle: style, role });
  };
  for (const seg of topSegments) {
    pushSeg(seg.start, { time: seg.end.time, price: seg.end.price }, settings.topColor, 'top');
  }
  for (const seg of bottomSegments) {
    pushSeg(seg.start, { time: seg.end.time, price: seg.end.price }, settings.bottomColor, 'bottom');
  }
  if (!settings.showFan && lastTop) {
    const endTime = projectTime(series, lastHigh.index, projectBars);
    pushSeg(lastHigh, { time: endTime, price: linePriceAt(lastHigh, lastTop.slope, lastHigh.index + projectBars) }, settings.topColor, 'live-top', 'dashed');
  }
  if (settings.showFan) {
    for (const ray of fan) {
      const isBase = ray.kind === 'mid';
      const color = isBase
        ? (ray.side === 'top' ? settings.topColor : settings.bottomColor)
        : settings.fanColor;
      drawSegments.push({
        startTime: ray.startTime,
        startPrice: ray.startPrice,
        endTime: ray.endTime,
        endPrice: ray.endPrice,
        color,
        lineWidth: isBase ? settings.lineWidth : Math.max(1, settings.lineWidth),
        lineStyle: isBase ? 'dashed' : 'dotted',
        role: 'fan',
      });
    }
  }
  const gapStats = analyzeSwoopGaps(series, topSegments, bottomSegments);
  const buy = detectSwoopBuy(
    book.pattern,
    lhRun,
    gapStats.filter((g) => g.side === 'top'),
    lastCandle.close,
    lastCandle.time,
  );
  const labels = settings.showPivotLabels ? buildGapLabels(gapStats) : [];
  if (buy?.triggered) {
    labels.push({
      time: buy.time,
      price: buy.price,
      text: 'BUY',
      sub: buy.reason,
      kind: 'buy',
    });
  }
  return {
    state,
    pattern: book.pattern,
    armed: true,
    highs: lhRun,
    lows: bottomRun,
    topSegments,
    bottomSegments,
    liveTopSlope,
    liveBottomSlope,
    expectedTopBand,
    expectedBottomBand,
    gap,
    armGap,
    compression,
    prevGapBars: Math.round(prevGapBars),
    projectBars,
    fan,
    drawSegments,
    labels,
    label: stateLabel(state, compression),
    gapStats,
    buy,
  };
}

/**
 * Swoop — predictive pivot-slope accumulation from consecutive lower highs.
 *
 * Pivots are a zigzag of length N from wick extremes:
 *   1. n-bar fractal: wick high/low is the extreme of N bars left and N right
 *   2. swings must alternate H-L-H-L; consecutive same-type keep the more extreme wick
 *   3. minPivotPct is the minimum reversal to confirm the opposite pivot
 *
 * Trend lines are drawn between each consecutive lower high (H1→H2, H2→H3, …)
 * and each consecutive lower low (L1→L2, L2→L3, …). The next-leg projection
 * compares the last two legs' angles and lengths:
 *   - equal angle: continue the last slope
 *   - steepening: fan a steeper descent (last + (last − prev))
 *   - shallowing: fan a flatter angle (last + (last − prev))
 *   - length: lastBars × (lastBars / prevBars)
 */
import type { CandleData } from '@/types/chart.types';
import type {
  SwoopDrawSegment,
  SwoopFanRay,
  SwoopPivotLabel,
  SwoopPoint,
  SwoopResult,
  SwoopSegment,
  SwoopSettings,
  SwoopSlopeBand,
  SwoopState,
} from '@/types/swoop';
import { DEFAULT_SWOOP_SETTINGS } from '@/types/swoop';
import { calculateSwings } from '@/lib/smc/pivots';

export type SwoopCandle = Pick<CandleData, 'time' | 'open' | 'high' | 'low' | 'close'> & {
  volume?: number;
};

interface SwingLike {
  time: number;
  value: number;
  type: 'high' | 'low';
  index: number;
}

const EMPTY: SwoopResult = {
  state: 'idle',
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
};

export function logSlope(p1: number, p2: number, bars: number): number {
  if (bars <= 0 || p1 <= 0 || p2 <= 0 || !Number.isFinite(p1) || !Number.isFinite(p2)) return 0;
  return (Math.log(p2) - Math.log(p1)) / bars;
}

/**
 * Next-segment slope band from the last two pivot-to-pivot legs.
 * mid = equal angle (continue last slope).
 * If last is steeper than prev (last < prev): lo = last + (last − prev) — estimated increase of descent.
 * If last is shallower than prev: hi = last + (last − prev) — decreasing angle.
 */
export function expectedSlopeBand(prev: number, last: number): SwoopSlopeBand {
  const delta = last - prev;
  if (last < prev) return { lo: last + delta, mid: last, hi: last };
  return { lo: last, mid: last, hi: last + Math.max(delta, 0) };
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
    segs.push({ start, end, slope: logSlope(start.price, end.price, lengthBars), lengthBars });
  }
  return segs;
}

function linePriceAt(anchor: SwoopPoint, slope: number, index: number): number {
  return anchor.price * Math.exp(slope * (index - anchor.index));
}

function projectTime(candles: SwoopCandle[], fromIndex: number, barsAhead: number): number {
  const last = candles[candles.length - 1];
  const prev = candles[Math.max(0, candles.length - 2)];
  const step = last && prev ? Math.max(1, last.time - prev.time) : 1;
  const base = candles[Math.min(fromIndex, candles.length - 1)]?.time ?? last?.time ?? 0;
  const extra = Math.max(0, fromIndex + barsAhead - (candles.length - 1));
  if (fromIndex + barsAhead <= candles.length - 1) return candles[fromIndex + barsAhead].time;
  return base + extra * step;
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

/** Label zigzag pivots in order: H1, L1, H2, L2… */
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

export function detectSwoop(candles: SwoopCandle[], settings: SwoopSettings = DEFAULT_SWOOP_SETTINGS): SwoopResult {
  if (!settings.enabled || !candles || candles.length < settings.swingLength * 2 + 4) return EMPTY;
  const minPivotPct = settings.minPivotPct ?? 0;
  const raw = calculateSwings(candles as CandleData[], settings.swingLength);
  const swings = collapseSwings(raw, minPivotPct);
  const highs: SwoopPoint[] = swings.filter((s) => s.type === 'high').map(swingToPoint);
  const lows: SwoopPoint[] = swings.filter((s) => s.type === 'low').map(swingToPoint);
  const lastIdx = candles.length - 1;
  const lhRun = structureLowerHighs(highs, settings.minLowerHighs, {
    minPivotPct,
    lastIndex: lastIdx,
    lookbackBars: Math.max(500, settings.swingLength * 40),
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
    const labels = settings.showPivotLabels ? buildZigzagLabels(swings.slice(-8)) : [];
    return { ...EMPTY, highs, lows, labels, label: reason };
  }
  const llRun = structureLowerLows(lows, lhRun[0].index, 2, { minPivotPct });
  const lastCandle = candles[lastIdx];
  const topSegments = buildSegments(lhRun);
  const bottomSegments = buildSegments(llRun);
  const lastHigh = lhRun[lhRun.length - 1];
  const lastLow = llRun.length ? llRun[llRun.length - 1] : null;
  const lastTop = topSegments[topSegments.length - 1];
  const prevTop = topSegments[topSegments.length - 2];
  const lastBot = bottomSegments[bottomSegments.length - 1];
  const prevBot = bottomSegments[bottomSegments.length - 2];
  const projectBars = projectLength(
    prevTop?.lengthBars ?? prevBot?.lengthBars ?? 0,
    lastTop?.lengthBars ?? lastBot?.lengthBars ?? settings.swingLength * 3,
  );
  const prevGapBars = lastTop?.lengthBars ?? lastBot?.lengthBars ?? 0;
  const expectedTopBand = topSegments.length >= 2
    ? expectedSlopeBand(topSegments[topSegments.length - 2].slope, topSegments[topSegments.length - 1].slope)
    : topSegments.length === 1 ? { lo: topSegments[0].slope, mid: topSegments[0].slope, hi: topSegments[0].slope } : null;
  const expectedBottomBand = bottomSegments.length >= 2
    ? expectedSlopeBand(bottomSegments[bottomSegments.length - 2].slope, bottomSegments[bottomSegments.length - 1].slope)
    : bottomSegments.length === 1 ? { lo: bottomSegments[0].slope, mid: bottomSegments[0].slope, hi: bottomSegments[0].slope } : null;
  let liveHighPrice = lastHigh.price;
  let liveHighIndex = lastHigh.index;
  let lowAfterHighIndex = -1;
  if (lastLow && lastLow.index > lastHigh.index) lowAfterHighIndex = lastLow.index;
  else {
    for (let i = lastHigh.index + 1; i <= lastIdx; i++) {
      if (lowAfterHighIndex < 0 || candles[i].low <= candles[lowAfterHighIndex].low) lowAfterHighIndex = i;
    }
  }
  if (lowAfterHighIndex > lastHigh.index) {
    liveHighPrice = candles[lowAfterHighIndex].high;
    liveHighIndex = lowAfterHighIndex;
    for (let i = lowAfterHighIndex; i <= lastIdx; i++) {
      if (candles[i].high >= liveHighPrice) { liveHighPrice = candles[i].high; liveHighIndex = i; }
    }
  }
  const lastCompletedTopSlope = lastTop?.slope ?? null;
  const formingTopSlope = liveHighIndex > lastHigh.index
    ? logSlope(lastHigh.price, liveHighPrice, liveHighIndex - lastHigh.index)
    : lastCompletedTopSlope;
  let formingBottomSlope: number | null = null;
  let liveLowPrice = lastLow?.price ?? lastCandle.low;
  let liveLowIndex = lastLow?.index ?? lastIdx;
  if (lastLow) {
    liveLowPrice = lastLow.price;
    liveLowIndex = lastLow.index;
    for (let i = lastLow.index + 1; i <= lastIdx; i++) {
      if (candles[i].low <= liveLowPrice) { liveLowPrice = candles[i].low; liveLowIndex = i; }
    }
    if (liveLowIndex === lastLow.index) { liveLowPrice = lastCandle.low; liveLowIndex = lastIdx; }
    formingBottomSlope = liveLowIndex > lastLow.index
      ? logSlope(lastLow.price, liveLowPrice, liveLowIndex - lastLow.index)
      : lastBot?.slope ?? null;
  }
  const liveTopSlope = formingTopSlope;
  const liveBottomSlope = formingBottomSlope;
  const topSlopeForGap = lastCompletedTopSlope ?? liveTopSlope ?? expectedTopBand?.mid ?? 0;
  const botAnchor = lastLow ?? { index: 0, time: candles[0].time, price: candles[0].low };
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
  const pushFan = (anchor: SwoopPoint, band: SwoopSlopeBand) => {
    const endTime = projectTime(candles, anchor.index, projectBars);
    const kinds: Array<SwoopFanRay['kind']> = ['lo', 'mid', 'hi'];
    const slopes = [band.lo, band.mid, band.hi];
    kinds.forEach((kind, i) => {
      fan.push({
        startTime: anchor.time,
        startPrice: anchor.price,
        endTime,
        endPrice: linePriceAt(anchor, slopes[i], anchor.index + projectBars),
        kind,
      });
    });
  };
  if (settings.showFan && expectedTopBand) pushFan(lastHigh, expectedTopBand);
  if (settings.showFan && expectedBottomBand && lastLow) pushFan(lastLow, expectedBottomBand);
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
  if (liveHighIndex > lastHigh.index) {
    pushSeg(lastHigh, { time: candles[liveHighIndex].time, price: liveHighPrice }, settings.topColor, 'live-top', 'dashed', Math.max(1, settings.lineWidth));
  }
  if (lastLow && liveLowIndex > lastLow.index) {
    pushSeg(lastLow, { time: candles[liveLowIndex].time, price: liveLowPrice }, settings.bottomColor, 'live-bottom', 'dashed', Math.max(1, settings.lineWidth));
  }
  if (!settings.showFan && lastTop) {
    const endTime = projectTime(candles, lastHigh.index, projectBars);
    pushSeg(lastHigh, { time: endTime, price: linePriceAt(lastHigh, lastTop.slope, lastHigh.index + projectBars) }, settings.topColor, 'live-top', 'dashed');
  }
  if (settings.showFan) {
    for (const ray of fan) {
      drawSegments.push({
        startTime: ray.startTime,
        startPrice: ray.startPrice,
        endTime: ray.endTime,
        endPrice: ray.endPrice,
        color: settings.fanColor,
        lineWidth: ray.kind === 'mid' ? settings.lineWidth : 1,
        lineStyle: ray.kind === 'mid' ? 'dashed' : 'dotted',
        role: 'fan',
      });
    }
  }
  const zzFromTop = swings.filter((s) => s.index >= lhRun[0].index);
  const labels = settings.showPivotLabels ? buildZigzagLabels(zzFromTop) : [];
  return {
    state,
    armed: true,
    highs: lhRun,
    lows: llRun,
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
  };
}

/**
 * Swoop — predictive pivot-slope accumulation envelope.
 */
import type { CandleData } from '@/types/chart.types';
import type {
  SwoopDrawSegment,
  SwoopFanRay,
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
  label: 'Idle',
};

export function logSlope(p1: number, p2: number, bars: number): number {
  if (bars <= 0 || p1 <= 0 || p2 <= 0 || !Number.isFinite(p1) || !Number.isFinite(p2)) return 0;
  return (Math.log(p2) - Math.log(p1)) / bars;
}

export function expectedSlopeBand(prev: number, last: number): SwoopSlopeBand {
  const delta = last - prev;
  if (last < prev) return { lo: last + delta, mid: last, hi: last };
  return { lo: last, mid: last, hi: last + Math.max(delta, 0) };
}

export function isShallowerThanExpected(actual: number, band: SwoopSlopeBand, eps = 1e-9): boolean {
  return actual > band.hi + eps;
}

function toPoint(index: number, time: number, price: number): SwoopPoint {
  return { index, time, price };
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

export function detectSwoop(candles: SwoopCandle[], settings: SwoopSettings = DEFAULT_SWOOP_SETTINGS): SwoopResult {
  if (!settings.enabled || !candles || candles.length < settings.swingLength * 2 + 4) return EMPTY;
  const swings = calculateSwings(candles as CandleData[], settings.swingLength);
  const highs: SwoopPoint[] = swings.filter((s) => s.type === 'high').map((s) => toPoint(s.index, s.time, s.value));
  const lows: SwoopPoint[] = swings.filter((s) => s.type === 'low').map((s) => toPoint(s.index, s.time, s.value));
  const lhRun = trailingLowerHighs(highs, settings.minLowerHighs);
  if (lhRun.length < settings.minLowerHighs) return { ...EMPTY, highs, lows, label: 'Idle · need 2 lower highs' };
  const llRun = trailingLowerLows(lows, 2);
  const lastIdx = candles.length - 1;
  const lastCandle = candles[lastIdx];
  const topSegments = buildSegments(lhRun);
  const bottomSegments = buildSegments(llRun);
  const lastHigh = lhRun[lhRun.length - 1];
  const lastLow = llRun.length ? llRun[llRun.length - 1] : null;
  const prevGapBars = median([...topSegments.map((s) => s.lengthBars), ...bottomSegments.map((s) => s.lengthBars)]);
  const projectBars = Math.max(3, Math.round(prevGapBars || settings.swingLength * 3));
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
  const lastCompletedTopSlope = topSegments.length ? topSegments[topSegments.length - 1].slope : null;
  const liveTopSlope = liveHighIndex > lastHigh.index
    ? logSlope(lastHigh.price, liveHighPrice, liveHighIndex - lastHigh.index)
    : lastCompletedTopSlope;
  let liveBottomSlope: number | null = null;
  let liveLowPrice = lastLow?.price ?? lastCandle.low;
  let liveLowIndex = lastLow?.index ?? lastIdx;
  if (lastLow) {
    liveLowPrice = lastLow.price;
    liveLowIndex = lastLow.index;
    for (let i = lastLow.index + 1; i <= lastIdx; i++) {
      if (candles[i].low <= liveLowPrice) { liveLowPrice = candles[i].low; liveLowIndex = i; }
    }
    if (liveLowIndex === lastLow.index) { liveLowPrice = lastCandle.low; liveLowIndex = lastIdx; }
    liveBottomSlope = liveLowIndex > lastLow.index
      ? logSlope(lastLow.price, liveLowPrice, liveLowIndex - lastLow.index)
      : bottomSegments.length ? bottomSegments[bottomSegments.length - 1].slope : null;
  }
  const topSlopeForGap = liveTopSlope ?? expectedTopBand?.mid ?? 0;
  const botAnchor = lastLow ?? { index: 0, time: candles[0].time, price: candles[0].low };
  const botSlopeForGap = liveBottomSlope ?? expectedBottomBand?.mid ?? 0;
  const upperNow = linePriceAt(lastHigh, topSlopeForGap, lastIdx);
  const lowerNow = linePriceAt(botAnchor, botSlopeForGap, lastIdx);
  const gap = Math.max(0, upperNow - lowerNow);
  const armIndex = lhRun[1]?.index ?? lastHigh.index;
  const upperArm = linePriceAt(lastHigh, topSegments[0]?.slope ?? topSlopeForGap, armIndex);
  const lowerArm = lastLow ? linePriceAt(botAnchor, bottomSegments[0]?.slope ?? botSlopeForGap, armIndex) : upperArm * 0.98;
  const armGap = Math.max(gap, Math.abs(upperArm - lowerArm));
  const compression = armGap > 0 ? Math.max(0, Math.min(1, 1 - gap / armGap)) : 0;
  const flatten = settings.flattenThreshold;
  const topFlattening = liveTopSlope != null && liveTopSlope >= -flatten;
  const topShallower = liveTopSlope != null && expectedTopBand != null && (liveTopSlope > expectedTopBand.mid + flatten * 0.25 || isShallowerThanExpected(liveTopSlope, expectedTopBand));
  const slowing = topFlattening || topShallower;
  const compressing = compression >= 0.18 && (slowing || (liveBottomSlope != null && expectedBottomBand != null && liveBottomSlope > expectedBottomBand.mid - flatten));
  const closeAboveTop = lastCandle.close > upperNow * 1.001;
  let state: SwoopState = 'armed';
  if (closeAboveTop && (slowing || compressing)) state = 'release';
  else if (compressing) state = 'compressing';
  else if (slowing) state = 'slowing';
  const fan: SwoopFanRay[] = [];
  if (settings.showFan && expectedTopBand) {
    const endTime = projectTime(candles, lastHigh.index, projectBars);
    const kinds: Array<SwoopFanRay['kind']> = ['lo', 'mid', 'hi'];
    const slopes = [expectedTopBand.lo, expectedTopBand.mid, expectedTopBand.hi];
    kinds.forEach((kind, i) => {
      fan.push({ startTime: lastHigh.time, startPrice: lastHigh.price, endTime, endPrice: linePriceAt(lastHigh, slopes[i], lastHigh.index + projectBars), kind });
    });
  }
  const drawSegments: SwoopDrawSegment[] = [];
  const pushSeg = (start: SwoopPoint, end: { time: number; price: number }, color: string, role: SwoopDrawSegment['role'], style: SwoopDrawSegment['lineStyle'] = settings.lineStyle, width = settings.lineWidth) => {
    drawSegments.push({ startTime: start.time, startPrice: start.price, endTime: end.time, endPrice: end.price, color, lineWidth: width, lineStyle: style, role });
  };
  for (const seg of topSegments) pushSeg(seg.start, seg.end, settings.topColor, 'top');
  for (const seg of bottomSegments) pushSeg(seg.start, seg.end, settings.bottomColor, 'bottom');
  if (liveHighIndex > lastHigh.index) pushSeg(lastHigh, { time: candles[liveHighIndex].time, price: liveHighPrice }, settings.topColor, 'live-top', 'dashed', Math.max(1, settings.lineWidth));
  if (lastLow && liveLowIndex > lastLow.index) pushSeg(lastLow, { time: candles[liveLowIndex].time, price: liveLowPrice }, settings.bottomColor, 'live-bottom', 'dashed', Math.max(1, settings.lineWidth));
  if (settings.showFan) {
    for (const ray of fan) {
      drawSegments.push({ startTime: ray.startTime, startPrice: ray.startPrice, endTime: ray.endTime, endPrice: ray.endPrice, color: settings.fanColor, lineWidth: ray.kind === 'mid' ? settings.lineWidth : 1, lineStyle: ray.kind === 'mid' ? 'dashed' : 'dotted', role: 'fan' });
    }
  }
  return { state, armed: true, highs: lhRun, lows: llRun, topSegments, bottomSegments, liveTopSlope, liveBottomSlope, expectedTopBand, expectedBottomBand, gap, armGap, compression, prevGapBars: Math.round(prevGapBars), projectBars, fan, drawSegments, label: stateLabel(state, compression) };
}

/**
 * Auto Trendline detection (macro / mid / ltf).
 *
 * For each enabled tier we:
 *  1. Take a lookback window of candles (full chart for macro, shorter for mid/ltf).
 *  2. Find swing wick pivots (highs for resistance, lows for support).
 *  3. Score candidate lines through pairs of pivots by wick touches + span,
 *     preferring the longest clean straight line — not forced from bar 0.
 *  4. Emit best support + best resistance for that tier.
 */

import type {
  AutoTrendlineKind,
  AutoTrendlineResult,
  AutoTrendlineSegment,
  AutoTrendlineSettings,
  AutoTrendlineTierId,
} from '@/types/autoTrendline';

export interface AutoTrendlineCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface Pivot {
  index: number;
  time: number;
  price: number;
}

interface TierDetectParams {
  /** Fraction of the series to search, measured from the right (1 = full chart). */
  lookbackFraction: number;
  minBars: number;
  pivotLength: number;
  minTouches: number;
  minSpanBars: number;
  /** Relative price tolerance for a wick "touch". */
  touchTolerancePct: number;
  maxViolationRate: number;
}

const TIER_PARAMS: Record<AutoTrendlineTierId, TierDetectParams> = {
  // Entire chart, wide pivots — largest structural lines
  macro: {
    lookbackFraction: 1,
    minBars: 80,
    pivotLength: 16,
    minTouches: 3,
    minSpanBars: 30,
    touchTolerancePct: 0.0025,
    maxViolationRate: 0.18,
  },
  // Middle ground
  mid: {
    lookbackFraction: 0.48,
    minBars: 55,
    pivotLength: 8,
    minTouches: 3,
    minSpanBars: 16,
    touchTolerancePct: 0.002,
    maxViolationRate: 0.18,
  },
  // Recent structure only
  ltf: {
    lookbackFraction: 0.2,
    minBars: 36,
    pivotLength: 4,
    minTouches: 2,
    minSpanBars: 8,
    touchTolerancePct: 0.0018,
    maxViolationRate: 0.22,
  },
};

const TIERS: AutoTrendlineTierId[] = ['macro', 'mid', 'ltf'];

function findWickPivots(
  candles: AutoTrendlineCandle[],
  startIdx: number,
  endIdx: number,
  pivotLength: number,
  kind: AutoTrendlineKind,
): Pivot[] {
  const pivots: Pivot[] = [];
  const lo = Math.max(startIdx + pivotLength, pivotLength);
  const hi = Math.min(endIdx - pivotLength, candles.length - 1 - pivotLength);
  if (hi <= lo) return pivots;

  for (let i = lo; i <= hi; i++) {
    if (kind === 'resistance') {
      let isPeak = true;
      const h = candles[i].high;
      for (let j = i - pivotLength; j <= i + pivotLength; j++) {
        if (j === i) continue;
        if (candles[j].high > h) {
          isPeak = false;
          break;
        }
      }
      if (isPeak) pivots.push({ index: i, time: candles[i].time, price: h });
    } else {
      let isTrough = true;
      const l = candles[i].low;
      for (let j = i - pivotLength; j <= i + pivotLength; j++) {
        if (j === i) continue;
        if (candles[j].low < l) {
          isTrough = false;
          break;
        }
      }
      if (isTrough) pivots.push({ index: i, time: candles[i].time, price: l });
    }
  }
  return pivots;
}

interface Candidate {
  slope: number;
  intercept: number;
  touches: number;
  spanBars: number;
  firstIdx: number;
  lastIdx: number;
  firstPrice: number;
  lastPrice: number;
  firstTime: number;
  lastTime: number;
  violationRate: number;
  score: number;
}

function priceOnLine(slope: number, intercept: number, index: number): number {
  return slope * index + intercept;
}

function evaluateCandidate(
  candles: AutoTrendlineCandle[],
  a: Pivot,
  b: Pivot,
  kind: AutoTrendlineKind,
  params: TierDetectParams,
): Candidate | null {
  const span = b.index - a.index;
  if (span < params.minSpanBars) return null;

  const slope = (b.price - a.price) / span;
  const intercept = a.price - slope * a.index;

  // Collect wick touches between (and including) the anchors
  const touchIndices: number[] = [a.index, b.index];
  for (let i = a.index + 1; i < b.index; i++) {
    const expected = priceOnLine(slope, intercept, i);
    if (!(expected > 0) || !Number.isFinite(expected)) continue;
    const tol = Math.max(expected * params.touchTolerancePct, expected * 0.0005);
    if (kind === 'resistance') {
      if (Math.abs(candles[i].high - expected) <= tol) touchIndices.push(i);
    } else {
      if (Math.abs(candles[i].low - expected) <= tol) touchIndices.push(i);
    }
  }

  if (touchIndices.length < params.minTouches) return null;

  // Tighten segment to outermost touches (not forced from chart start)
  touchIndices.sort((x, y) => x - y);
  const firstIdx = touchIndices[0];
  const lastIdx = touchIndices[touchIndices.length - 1];
  const firstPrice = priceOnLine(slope, intercept, firstIdx);
  const lastPrice = priceOnLine(slope, intercept, lastIdx);

  // Violations: closes clearly through the line during formation
  let violations = 0;
  let total = 0;
  for (let i = firstIdx; i <= lastIdx; i++) {
    const expected = priceOnLine(slope, intercept, i);
    total++;
    if (kind === 'resistance') {
      if (candles[i].close > expected * (1 + params.touchTolerancePct * 4)) violations++;
    } else {
      if (candles[i].close < expected * (1 - params.touchTolerancePct * 4)) violations++;
    }
  }
  const violationRate = total > 0 ? violations / total : 1;
  if (violationRate > params.maxViolationRate) return null;

  const spanBars = lastIdx - firstIdx;
  // Prefer many wick touches, then long span, then fewer violations
  const score =
    touchIndices.length * 1000 +
    spanBars * 3 -
    violationRate * 400 +
    // slight preference for more recent structure
    lastIdx * 0.01;

  return {
    slope,
    intercept,
    touches: touchIndices.length,
    spanBars,
    firstIdx,
    lastIdx,
    firstPrice,
    lastPrice,
    firstTime: candles[firstIdx].time,
    lastTime: candles[lastIdx].time,
    violationRate,
    score,
  };
}

function bestLineForKind(
  candles: AutoTrendlineCandle[],
  startIdx: number,
  endIdx: number,
  kind: AutoTrendlineKind,
  params: TierDetectParams,
): Candidate | null {
  const pivots = findWickPivots(candles, startIdx, endIdx, params.pivotLength, kind);
  if (pivots.length < 2) return null;

  // Cap pivot pairs for performance — keep extremities + evenly spaced sample
  let working = pivots;
  if (pivots.length > 28) {
    const sortedExt =
      kind === 'resistance'
        ? [...pivots].sort((a, b) => b.price - a.price)
        : [...pivots].sort((a, b) => a.price - b.price);
    const extremes = sortedExt.slice(0, 10);
    const step = Math.ceil(pivots.length / 18);
    const sampled = pivots.filter((_, i) => i % step === 0);
    const byIdx = new Map<number, Pivot>();
    for (const p of [...extremes, ...sampled]) byIdx.set(p.index, p);
    working = Array.from(byIdx.values()).sort((a, b) => a.index - b.index);
  }

  let best: Candidate | null = null;

  for (let i = 0; i < working.length; i++) {
    for (let j = i + 1; j < working.length; j++) {
      const cand = evaluateCandidate(candles, working[i], working[j], kind, params);
      if (!cand) continue;
      if (!best || cand.score > best.score) best = cand;
    }
  }

  return best;
}

function windowStart(n: number, params: TierDetectParams): number {
  const fromFraction = Math.floor(n * (1 - params.lookbackFraction));
  const fromMin = n - Math.max(params.minBars, 20);
  return Math.max(0, Math.min(fromFraction, fromMin));
}

/**
 * Detect auto trendlines for all enabled tiers in settings.
 */
export function detectAutoTrendlines(
  candles: AutoTrendlineCandle[],
  settings: AutoTrendlineSettings,
): AutoTrendlineResult {
  if (!settings.enabled || !candles.length || candles.length < 30) {
    return { lines: [] };
  }

  const lines: AutoTrendlineSegment[] = [];
  const n = candles.length;
  const endIdx = n - 1;

  for (const tier of TIERS) {
    const tierSettings = settings[tier];
    if (!tierSettings.enabled) continue;

    const params = TIER_PARAMS[tier];
    const startIdx = windowStart(n, params);
    if (endIdx - startIdx < params.minBars * 0.5) continue;

    for (const kind of ['support', 'resistance'] as AutoTrendlineKind[]) {
      const best = bestLineForKind(candles, startIdx, endIdx, kind, params);
      if (!best) continue;

      lines.push({
        tier,
        kind,
        startTime: best.firstTime,
        startPrice: best.firstPrice,
        endTime: best.lastTime,
        endPrice: best.lastPrice,
        slope: best.slope,
        intercept: best.intercept,
        touches: best.touches,
        spanBars: best.spanBars,
        color: kind === 'support' ? tierSettings.supportColor : tierSettings.resistanceColor,
        lineWidth: tierSettings.lineWidth,
        lineStyle: tierSettings.lineStyle,
        extendRight: tierSettings.extendRight,
      });
    }
  }

  return { lines };
}

/** Price of a segment at a given candle index. */
export function autoTrendlinePriceAt(
  line: Pick<AutoTrendlineSegment, 'slope' | 'intercept'>,
  index: number,
): number {
  return line.slope * index + line.intercept;
}

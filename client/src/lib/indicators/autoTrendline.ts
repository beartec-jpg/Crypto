/**
 * Auto Trendline detection (macro / mid / ltf).
 *
 * Lines must sit *outside* the candles (classic external trendlines):
 *  - Resistance: on/above every high between endpoints (never cuts down through bars)
 *  - Support: on/below every low between endpoints (never cuts up through bars)
 *
 * For each enabled tier we:
 *  1. Take a lookback window (full chart for macro, shorter for mid/ltf).
 *  2. Find swing wick pivots.
 *  3. Score external-only candidates by wick touches + span.
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
  /** Relative price tolerance for a wick "touch" / float slack on external check. */
  touchTolerancePct: number;
}

const TIER_PARAMS: Record<AutoTrendlineTierId, TierDetectParams> = {
  macro: {
    lookbackFraction: 1,
    minBars: 80,
    pivotLength: 16,
    minTouches: 3,
    minSpanBars: 30,
    touchTolerancePct: 0.0015,
  },
  mid: {
    lookbackFraction: 0.48,
    minBars: 55,
    pivotLength: 8,
    minTouches: 3,
    minSpanBars: 16,
    touchTolerancePct: 0.0012,
  },
  ltf: {
    lookbackFraction: 0.2,
    minBars: 36,
    pivotLength: 4,
    minTouches: 2,
    minSpanBars: 8,
    touchTolerancePct: 0.001,
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
  /** Furthest bar index (≤ series end) where the line is still external. */
  validToIdx: number;
  score: number;
}

function priceOnLine(slope: number, intercept: number, index: number): number {
  return slope * index + intercept;
}

function touchTol(price: number, pct: number): number {
  const p = Math.abs(price);
  return Math.max(p * pct, p * 0.00025, 1e-12);
}

/**
 * True when the line sits fully outside candles in [from, to] inclusive.
 * Resistance: line ≥ every high (above/on the structure).
 * Support: line ≤ every low (below/on the structure).
 */
export function isLineExternal(
  candles: AutoTrendlineCandle[],
  slope: number,
  intercept: number,
  from: number,
  to: number,
  kind: AutoTrendlineKind,
  touchTolerancePct: number,
): boolean {
  if (from > to || from < 0 || to >= candles.length) return false;

  for (let i = from; i <= to; i++) {
    const y = priceOnLine(slope, intercept, i);
    if (!Number.isFinite(y)) return false;
    const tol = touchTol(y, touchTolerancePct);

    if (kind === 'resistance') {
      // Candle must not poke above the line
      if (candles[i].high > y + tol) return false;
    } else {
      // Candle must not poke below the line
      if (candles[i].low < y - tol) return false;
    }
  }
  return true;
}

/**
 * Grow `fromLast` forward while the segment [firstIdx, j] stays external.
 * Stops at the first piercing bar (exclusive).
 */
function farthestExternalIndex(
  candles: AutoTrendlineCandle[],
  slope: number,
  intercept: number,
  firstIdx: number,
  fromLast: number,
  hardEnd: number,
  kind: AutoTrendlineKind,
  touchTolerancePct: number,
): number {
  let validTo = fromLast;
  for (let j = fromLast + 1; j <= hardEnd; j++) {
    if (!isLineExternal(candles, slope, intercept, firstIdx, j, kind, touchTolerancePct)) {
      break;
    }
    validTo = j;
  }
  return validTo;
}

function evaluateCandidate(
  candles: AutoTrendlineCandle[],
  a: Pivot,
  b: Pivot,
  kind: AutoTrendlineKind,
  params: TierDetectParams,
  windowEnd: number,
): Candidate | null {
  const span = b.index - a.index;
  if (span < params.minSpanBars) return null;

  const slope = (b.price - a.price) / span;
  const intercept = a.price - slope * a.index;

  // Hard reject if the anchors themselves already cut through anything between them
  if (
    !isLineExternal(
      candles,
      slope,
      intercept,
      a.index,
      b.index,
      kind,
      params.touchTolerancePct,
    )
  ) {
    return null;
  }

  // Collect wick touches on the exterior of the line
  const touchIndices: number[] = [a.index, b.index];
  for (let i = a.index + 1; i < b.index; i++) {
    const expected = priceOnLine(slope, intercept, i);
    if (!(expected > 0) || !Number.isFinite(expected)) continue;
    const tol = touchTol(expected, params.touchTolerancePct);
    if (kind === 'resistance') {
      // High kisses the underside of resistance
      if (Math.abs(candles[i].high - expected) <= tol) touchIndices.push(i);
    } else {
      // Low kisses the topside of support
      if (Math.abs(candles[i].low - expected) <= tol) touchIndices.push(i);
    }
  }

  if (touchIndices.length < params.minTouches) return null;

  touchIndices.sort((x, y) => x - y);
  const firstIdx = touchIndices[0];
  const lastIdx = touchIndices[touchIndices.length - 1];

  // Re-check external on the tightened touch span (should still pass)
  if (
    !isLineExternal(
      candles,
      slope,
      intercept,
      firstIdx,
      lastIdx,
      kind,
      params.touchTolerancePct,
    )
  ) {
    return null;
  }

  // Extend validity forward until the first pierce so extend-right never cuts bars
  const validToIdx = farthestExternalIndex(
    candles,
    slope,
    intercept,
    firstIdx,
    lastIdx,
    windowEnd,
    kind,
    params.touchTolerancePct,
  );

  const firstPrice = priceOnLine(slope, intercept, firstIdx);
  // Draw end = last external bar (keeps line outside candles even past last touch)
  const endIdx = validToIdx;
  const lastPrice = priceOnLine(slope, intercept, endIdx);

  const spanBars = lastIdx - firstIdx;
  const score =
    touchIndices.length * 1000 +
    spanBars * 3 +
    // Prefer lines that stay external further into recent price
    (validToIdx - lastIdx) * 0.5 +
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
    lastTime: candles[endIdx].time,
    validToIdx,
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
      const cand = evaluateCandidate(candles, working[i], working[j], kind, params, endIdx);
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

      // Only free-extend past the last bar when the line is still external through it
      const canFreeExtend = tierSettings.extendRight && best.validToIdx >= endIdx;

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
        // If a later candle would be pierced, keep extend off so we stop at validTo
        extendRight: canFreeExtend,
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

/**
 * Auto Trendline detection (macro / mid / ltf).
 *
 * A real trendline sits on the *outside* of price. If full candles keep
 * punching through it, it is not a trendline and must not be drawn.
 *
 * Method:
 *  1. Window candles for the tier (macro = full chart, mid/ltf = shorter).
 *  2. Build the upper convex hull of highs (resistance) / lower hull of lows
 *     (support). Every hull edge is, by construction, an external line —
 *     no wick of the window lies on the wrong side of that edge.
 *  3. Re-verify every bar on the edge (strict: no wick pierce, no full-body
 *     cross). Any pierce → discard.
 *  4. Score remaining edges by touches + span; emit the best support and
 *     resistance per enabled tier.
 *  5. Extend only while still external; free-extend to the chart edge only
 *     when the line is still clean through the latest bar.
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

interface Pt {
  index: number;
  price: number;
  time: number;
}

interface TierDetectParams {
  lookbackFraction: number;
  minBars: number;
  /** Subsample stride for hull when series is huge (1 = every bar). */
  sampleStride: number;
  minTouches: number;
  minSpanBars: number;
  /** Float slack only — not a free pass for pierces. */
  touchTolerancePct: number;
}

const TIER_PARAMS: Record<AutoTrendlineTierId, TierDetectParams> = {
  macro: {
    lookbackFraction: 1,
    minBars: 80,
    sampleStride: 1,
    minTouches: 3,
    minSpanBars: 30,
    touchTolerancePct: 0.0008,
  },
  mid: {
    lookbackFraction: 0.48,
    minBars: 55,
    sampleStride: 1,
    minTouches: 3,
    minSpanBars: 16,
    touchTolerancePct: 0.0008,
  },
  ltf: {
    lookbackFraction: 0.2,
    minBars: 36,
    sampleStride: 1,
    minTouches: 2,
    minSpanBars: 8,
    touchTolerancePct: 0.0008,
  },
};

const TIERS: AutoTrendlineTierId[] = ['macro', 'mid', 'ltf'];

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
  validToIdx: number;
  score: number;
}

function priceOnLine(slope: number, intercept: number, index: number): number {
  return slope * index + intercept;
}

function touchTol(price: number, pct: number): number {
  const p = Math.abs(price);
  return Math.max(p * pct, p * 0.00015, 1e-12);
}

/**
 * Cross product (b - a) × (c - a). >0 => c left of ab (CCW).
 */
function cross(a: Pt, b: Pt, c: Pt): number {
  return (b.index - a.index) * (c.price - a.price) - (b.price - a.price) * (c.index - a.index);
}

/**
 * Monotone-chain upper or lower hull of points sorted by index.
 * Upper: no point above any edge. Lower: no point below any edge.
 */
export function convexHullChain(points: Pt[], side: 'upper' | 'lower'): Pt[] {
  if (points.length <= 1) return points.slice();
  const sorted = [...points].sort((a, b) => a.index - b.index || a.price - b.price);
  // Deduplicate same index — keep extreme price for that bar
  const dedup: Pt[] = [];
  for (const p of sorted) {
    if (dedup.length && dedup[dedup.length - 1].index === p.index) {
      const prev = dedup[dedup.length - 1];
      if (side === 'upper' ? p.price > prev.price : p.price < prev.price) {
        dedup[dedup.length - 1] = p;
      }
      continue;
    }
    dedup.push(p);
  }

  const hull: Pt[] = [];
  for (const p of dedup) {
    if (side === 'upper') {
      // Keep turning right (clockwise) along the top
      while (
        hull.length >= 2 &&
        cross(hull[hull.length - 2], hull[hull.length - 1], p) >= 0
      ) {
        hull.pop();
      }
    } else {
      // Keep turning left (CCW) along the bottom
      while (
        hull.length >= 2 &&
        cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0
      ) {
        hull.pop();
      }
    }
    hull.push(p);
  }
  return hull;
}

/**
 * Does this candle count as a real pierce of the line?
 * - Wick on the wrong side, or
 * - Full body completely through (open & close on the wrong side), or
 * - Body straddling the line (open and close on opposite sides) = cut-through.
 */
export function candlePiercesLine(
  candle: AutoTrendlineCandle,
  linePrice: number,
  kind: AutoTrendlineKind,
  touchTolerancePct: number,
): boolean {
  const tol = touchTol(linePrice, touchTolerancePct);
  const o = candle.open;
  const c = candle.close;
  const bodyLo = Math.min(o, c);
  const bodyHi = Math.max(o, c);

  if (kind === 'resistance') {
    // Anything meaningfully above resistance is a pierce
    if (candle.high > linePrice + tol) return true;
    // Full body closed above the line
    if (bodyLo > linePrice + tol) return true;
    // Body straddles the line (opens one side, closes the other through it)
    if (bodyLo < linePrice - tol && bodyHi > linePrice + tol) return true;
    return false;
  }

  // support
  if (candle.low < linePrice - tol) return true;
  if (bodyHi < linePrice - tol) return true;
  if (bodyLo < linePrice - tol && bodyHi > linePrice + tol) return true;
  return false;
}

/**
 * Strict: every bar in [from, to] must leave the line outside the candle.
 * One pierce → not a trendline.
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
    if (candlePiercesLine(candles[i], y, kind, touchTolerancePct)) return false;
  }
  return true;
}

function countTouches(
  candles: AutoTrendlineCandle[],
  slope: number,
  intercept: number,
  from: number,
  to: number,
  kind: AutoTrendlineKind,
  touchTolerancePct: number,
): number {
  let touches = 0;
  for (let i = from; i <= to; i++) {
    const y = priceOnLine(slope, intercept, i);
    const tol = touchTol(y, touchTolerancePct * 2.5); // slightly looser for "kiss"
    if (kind === 'resistance') {
      if (Math.abs(candles[i].high - y) <= tol) touches++;
    } else {
      if (Math.abs(candles[i].low - y) <= tol) touches++;
    }
  }
  return touches;
}

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
    // Only need to test the new bar if prefix was already external
    const y = priceOnLine(slope, intercept, j);
    if (candlePiercesLine(candles[j], y, kind, touchTolerancePct)) break;
    validTo = j;
  }
  return validTo;
}

function edgeToCandidate(
  candles: AutoTrendlineCandle[],
  a: Pt,
  b: Pt,
  kind: AutoTrendlineKind,
  params: TierDetectParams,
  windowEnd: number,
): Candidate | null {
  const span = b.index - a.index;
  if (span < params.minSpanBars) return null;

  const slope = (b.price - a.price) / span;
  const intercept = a.price - slope * a.index;

  // Hull edges should already be external on sample points; re-check every bar
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

  const touches = countTouches(
    candles,
    slope,
    intercept,
    a.index,
    b.index,
    kind,
    params.touchTolerancePct,
  );
  if (touches < params.minTouches) return null;

  const validToIdx = farthestExternalIndex(
    candles,
    slope,
    intercept,
    a.index,
    b.index,
    windowEnd,
    kind,
    params.touchTolerancePct,
  );

  // If price has already ripped through this line many times after the edge,
  // validTo will stop early — that's fine. If the formation itself had pierces
  // we already returned null.

  const firstIdx = a.index;
  const lastIdx = b.index;
  const endIdx = validToIdx; // draw at least through last clean bar
  const firstPrice = priceOnLine(slope, intercept, firstIdx);
  const lastPrice = priceOnLine(slope, intercept, endIdx);

  const score =
    touches * 1000 +
    span * 3 +
    (validToIdx - lastIdx) * 0.25 +
    lastIdx * 0.01;

  return {
    slope,
    intercept,
    touches,
    spanBars: span,
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

function samplePoints(
  candles: AutoTrendlineCandle[],
  startIdx: number,
  endIdx: number,
  kind: AutoTrendlineKind,
  stride: number,
): Pt[] {
  const pts: Pt[] = [];
  const step = Math.max(1, stride);
  for (let i = startIdx; i <= endIdx; i += step) {
    const price = kind === 'resistance' ? candles[i].high : candles[i].low;
    pts.push({ index: i, price, time: candles[i].time });
  }
  // Always include window end so hull can reach the right edge of structure
  if (pts.length && pts[pts.length - 1].index !== endIdx) {
    const i = endIdx;
    const price = kind === 'resistance' ? candles[i].high : candles[i].low;
    pts.push({ index: i, price, time: candles[i].time });
  }
  return pts;
}

function bestLineForKind(
  candles: AutoTrendlineCandle[],
  startIdx: number,
  endIdx: number,
  kind: AutoTrendlineKind,
  params: TierDetectParams,
): Candidate | null {
  const pts = samplePoints(candles, startIdx, endIdx, kind, params.sampleStride);
  if (pts.length < 2) return null;

  const hull = convexHullChain(pts, kind === 'resistance' ? 'upper' : 'lower');
  if (hull.length < 2) return null;

  let best: Candidate | null = null;

  // Every consecutive hull edge is a pure external candidate
  for (let i = 0; i < hull.length - 1; i++) {
    const cand = edgeToCandidate(candles, hull[i], hull[i + 1], kind, params, endIdx);
    if (!cand) continue;
    if (!best || cand.score > best.score) best = cand;
  }

  // Also try non-adjacent hull vertices (longer external chords that skip
  // intermediate hull points — still external because hull is convex).
  // Cap pairs for performance.
  if (hull.length > 2) {
    const maxPairs = 40;
    let tried = 0;
    for (let i = 0; i < hull.length - 2 && tried < maxPairs; i++) {
      for (let j = i + 2; j < hull.length && tried < maxPairs; j++) {
        tried++;
        const cand = edgeToCandidate(candles, hull[i], hull[j], kind, params, endIdx);
        if (!cand) continue;
        if (!best || cand.score > best.score) best = cand;
      }
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
 * Detect auto trendlines for all enabled tiers.
 * Returns only lines that stay outside candles for their whole drawn span.
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

      // Final hard gate: re-verify the exact segment we will draw
      if (
        !isLineExternal(
          candles,
          best.slope,
          best.intercept,
          best.firstIdx,
          best.validToIdx,
          kind,
          params.touchTolerancePct,
        )
      ) {
        continue; // never emit a pierced "trendline"
      }

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
        extendRight: canFreeExtend,
      });
    }
  }

  return { lines };
}

export function autoTrendlinePriceAt(
  line: Pick<AutoTrendlineSegment, 'slope' | 'intercept'>,
  index: number,
): number {
  return line.slope * index + line.intercept;
}

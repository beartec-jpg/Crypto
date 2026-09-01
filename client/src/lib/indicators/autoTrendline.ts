/**
 * Auto Trendline detection (macro / mid / ltf).
 *
 * Method:
 *  1. Window candles for the tier.
 *  2. Detect confirmed swing pivots (lookback + zigzag + ATR-sized legs).
 *  3. Label consecutive highs HH/LH and lows HL/LL.
 *  4. Draw a trendline between each consecutive pair in a same-label run
 *     (LH1–LH2, LH2–LH3, HL1–HL2, …).
 *  5. From the last two legs, project a fan: straight continuation of P2–P3,
 *     equal-angle (apply Δangle again), and an estimated extra steepening
 *     or flattening depending on whether the last pivot line got steeper
 *     or started to shallow out.
 */

import type {
  AutoTrendlineChainLabel,
  AutoTrendlineKind,
  AutoTrendlineResult,
  AutoTrendlineRole,
  AutoTrendlineSegment,
  AutoTrendlineSettings,
  AutoTrendlineTierId,
  AutoTrendlineTierSettings,
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
  pivotLookback: number;
  minSwingAtr: number;
  maxConfirmedSegments: number;
  touchTolerancePct: number;
}

const TIER_PARAMS: Record<AutoTrendlineTierId, TierDetectParams> = {
  macro: {
    lookbackFraction: 1,
    minBars: 80,
    pivotLookback: 12,
    minSwingAtr: 0.35,
    maxConfirmedSegments: 8,
    touchTolerancePct: 0.0008,
  },
  mid: {
    lookbackFraction: 0.48,
    minBars: 55,
    pivotLookback: 7,
    minSwingAtr: 0.25,
    maxConfirmedSegments: 8,
    touchTolerancePct: 0.0008,
  },
  ltf: {
    lookbackFraction: 0.2,
    minBars: 36,
    pivotLookback: 4,
    minSwingAtr: 0.15,
    maxConfirmedSegments: 10,
    touchTolerancePct: 0.0008,
  },
};

const TIERS: AutoTrendlineTierId[] = ['macro', 'mid', 'ltf'];
const ANGLE_LIMIT = Math.PI / 2 - 0.08;

export interface StructurePivot {
  index: number;
  time: number;
  price: number;
  type: 'high' | 'low';
  label: AutoTrendlineChainLabel;
}

export interface PivotChain {
  kind: AutoTrendlineKind;
  label: AutoTrendlineChainLabel;
  pivots: StructurePivot[];
}

export interface ExtensionRay {
  role: Exclude<AutoTrendlineRole, 'confirmed'>;
  slope: number;
  intercept: number;
  spanBars: number;
  steepening: boolean;
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
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) >= 0) {
        hull.pop();
      }
    } else {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
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
    if (candle.high > linePrice + tol) return true;
    if (bodyLo > linePrice + tol) return true;
    if (bodyLo < linePrice - tol && bodyHi > linePrice + tol) return true;
    return false;
  }

  if (candle.low < linePrice - tol) return true;
  if (bodyHi < linePrice - tol) return true;
  if (bodyLo < linePrice - tol && bodyHi > linePrice + tol) return true;
  return false;
}

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

export function averageTrueRange(candles: AutoTrendlineCandle[], period = 14): number {
  if (candles.length < 2) return 0;
  const n = Math.min(period, candles.length - 1);
  let sum = 0;
  const start = candles.length - n;
  for (let i = start; i < candles.length; i++) {
    const prev = candles[i - 1];
    const c = candles[i];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
  }
  return sum / n;
}

function medianBarDuration(candles: AutoTrendlineCandle[]): number {
  if (candles.length < 2) return 60;
  const diffs: number[] = [];
  const from = Math.max(1, candles.length - 21);
  for (let i = from; i < candles.length; i++) {
    const d = candles[i].time - candles[i - 1].time;
    if (d > 0) diffs.push(d);
  }
  if (!diffs.length) return 60;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function rawSwings(
  candles: AutoTrendlineCandle[],
  startIdx: number,
  endIdx: number,
  lookback: number,
): Omit<StructurePivot, 'label'>[] {
  const out: Omit<StructurePivot, 'label'>[] = [];
  const lo = Math.max(startIdx, lookback);
  const hi = Math.min(endIdx, candles.length - 1 - lookback);
  for (let i = lo; i <= hi; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      // Strict unique extreme — a tied wick is not a pivot.
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (!isHigh && !isLow) continue;
    if (isHigh && isLow) continue;
    out.push({
      index: i,
      time: candles[i].time,
      price: isHigh ? candles[i].high : candles[i].low,
      type: isHigh ? 'high' : 'low',
    });
  }
  return out;
}

function zigzag(raw: Omit<StructurePivot, 'label'>[]): Omit<StructurePivot, 'label'>[] {
  const out: Omit<StructurePivot, 'label'>[] = [];
  for (const p of raw) {
    if (!out.length) {
      out.push(p);
      continue;
    }
    const last = out[out.length - 1];
    if (p.type === last.type) {
      if (p.type === 'high' ? p.price >= last.price : p.price <= last.price) {
        out[out.length - 1] = p;
      }
      continue;
    }
    out.push(p);
  }
  return out;
}

function filterMinSwing(
  pivots: Omit<StructurePivot, 'label'>[],
  minMove: number,
): Omit<StructurePivot, 'label'>[] {
  if (pivots.length < 2 || minMove <= 0) return pivots;
  const out: Omit<StructurePivot, 'label'>[] = [pivots[0]];
  for (let i = 1; i < pivots.length; i++) {
    const p = pivots[i];
    const last = out[out.length - 1];
    if (Math.abs(p.price - last.price) < minMove) {
      if (p.type === last.type) {
        if (p.type === 'high' ? p.price >= last.price : p.price <= last.price) {
          out[out.length - 1] = p;
        }
      }
      continue;
    }
    if (p.type === last.type) {
      if (p.type === 'high' ? p.price >= last.price : p.price <= last.price) {
        out[out.length - 1] = p;
      }
      continue;
    }
    out.push(p);
  }
  return out;
}

export function classifyStructurePivots(raw: Omit<StructurePivot, 'label'>[]): StructurePivot[] {
  let lastHigh: number | null = null;
  let lastLow: number | null = null;
  const out: StructurePivot[] = [];
  for (const p of raw) {
    let label: AutoTrendlineChainLabel;
    if (p.type === 'high') {
      label = lastHigh === null || p.price >= lastHigh ? 'HH' : 'LH';
      lastHigh = p.price;
    } else {
      label = lastLow === null || p.price <= lastLow ? 'LL' : 'HL';
      lastLow = p.price;
    }
    out.push({ ...p, label });
  }
  return out;
}

export function detectStructurePivots(
  candles: AutoTrendlineCandle[],
  startIdx: number,
  endIdx: number,
  lookback: number,
  minSwingAtr: number,
): StructurePivot[] {
  const atr = averageTrueRange(candles.slice(startIdx, endIdx + 1), 14);
  const minMove = atr > 0 ? atr * minSwingAtr : 0;
  const raw = rawSwings(candles, startIdx, endIdx, lookback);
  const z = filterMinSwing(zigzag(raw), minMove);
  return classifyStructurePivots(z);
}

/**
 * Group same-side pivots into monotonic runs.
 * A descending high run is LH1–LH2–LH3 including the origin high (often
 * labelled HH). An ascending low run is HL1–HL2 including the origin low.
 * The last pivot of a run can start the opposite run.
 */
export function consecutiveChains(pivots: StructurePivot[]): PivotChain[] {
  const chains: PivotChain[] = [];
  const highs = pivots.filter((p) => p.type === 'high');
  const lows = pivots.filter((p) => p.type === 'low');

  const collect = (
    seq: StructurePivot[],
    kind: AutoTrendlineKind,
    downLabel: AutoTrendlineChainLabel,
    upLabel: AutoTrendlineChainLabel,
  ) => {
    let i = 0;
    while (i < seq.length - 1) {
      const down = seq[i + 1].price < seq[i].price;
      const up = seq[i + 1].price > seq[i].price;
      if (!down && !up) {
        i++;
        continue;
      }
      const run: StructurePivot[] = [seq[i]];
      while (i + 1 < seq.length) {
        const nxt = seq[i + 1];
        const cont = down ? nxt.price < seq[i].price : nxt.price > seq[i].price;
        if (!cont) break;
        run.push(nxt);
        i++;
      }
      if (run.length >= 2) {
        chains.push({ kind, label: down ? downLabel : upLabel, pivots: run });
        // Stay on the last pivot so it can anchor the opposite run.
      } else {
        i++;
      }
    }
  };

  collect(highs, 'resistance', 'LH', 'HH');
  collect(lows, 'support', 'LL', 'HL');
  return chains;
}

export function segmentAngle(dx: number, dy: number): number {
  return Math.atan2(dy, dx);
}

function clampAngle(angle: number): number {
  return Math.max(-ANGLE_LIMIT, Math.min(ANGLE_LIMIT, angle));
}

function slopeFromAngle(angle: number): number {
  return Math.tan(clampAngle(angle));
}

function hypot2(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * From three consecutive same-label pivots, project the next leg.
 * Length of P2–P3 is scaled by the P1–P2 vs P2–P3 length ratio.
 * Angle of P2–P3 vs P1–P2 decides steepening vs flattening.
 */
export function projectExtensionFan(p1: StructurePivot, p2: StructurePivot, p3: StructurePivot): ExtensionRay[] {
  const dx12 = p2.index - p1.index;
  const dy12 = p2.price - p1.price;
  const dx23 = p3.index - p2.index;
  const dy23 = p3.price - p2.price;
  if (dx12 <= 0 || dx23 <= 0) return [];

  const a1 = segmentAngle(dx12, dy12);
  const a2 = segmentAngle(dx23, dy23);
  const dA = a2 - a1;
  const slope23 = dy23 / dx23;
  const intercept3 = p3.price - slope23 * p3.index;

  const len12 = hypot2(dx12, dy12);
  const len23 = hypot2(dx23, dy23);
  const scale = len12 > 1e-12 ? len23 / len12 : 1;
  const spanBars = Math.max(2, Math.round(dx23 * Math.max(0.5, Math.min(2, scale))));

  const steepening = Math.abs(a2) > Math.abs(a1) + 1e-6;
  const flattening = Math.abs(a2) < Math.abs(a1) - 1e-6;

  const rays: ExtensionRay[] = [
    { role: 'continuation', slope: slope23, intercept: intercept3, spanBars, steepening },
  ];

  if (Math.abs(dA) < 1e-5) return rays;

  const equalSlope = slopeFromAngle(a2 + dA);
  rays.push({
    role: 'equal_angle',
    slope: equalSlope,
    intercept: p3.price - equalSlope * p3.index,
    spanBars,
    steepening,
  });

  if (steepening) {
    // Extra estimated increase of descent / ascent (1.5× the last Δangle).
    const estSlope = slopeFromAngle(a2 + 1.5 * dA);
    if (Math.abs(estSlope - equalSlope) > Math.abs(slope23) * 1e-6 + 1e-12) {
      rays.push({
        role: 'estimated',
        slope: estSlope,
        intercept: p3.price - estSlope * p3.index,
        spanBars,
        steepening: true,
      });
    }
  } else if (flattening) {
    // Decreasing angle already lives on equal_angle; keep estimated as a
    // more conservative shallow (0.5× Δangle) so the fan has width.
    const estSlope = slopeFromAngle(a2 + 0.5 * dA);
    if (Math.abs(estSlope - slope23) > 1e-12) {
      rays.push({
        role: 'estimated',
        slope: estSlope,
        intercept: p3.price - estSlope * p3.index,
        spanBars,
        steepening: false,
      });
    }
  }

  return rays;
}

function closedThroughAfter(
  candles: AutoTrendlineCandle[],
  slope: number,
  intercept: number,
  fromExclusive: number,
  kind: AutoTrendlineKind,
  touchTolerancePct: number,
): boolean {
  for (let i = fromExclusive + 1; i < candles.length; i++) {
    const y = priceOnLine(slope, intercept, i);
    const tol = touchTol(y, touchTolerancePct);
    if (kind === 'resistance') {
      if (candles[i].close > y + tol) return true;
    } else if (candles[i].close < y - tol) {
      return true;
    }
  }
  return false;
}

function windowStart(n: number, params: TierDetectParams): number {
  const fromFraction = Math.floor(n * (1 - params.lookbackFraction));
  const fromMin = n - Math.max(params.minBars, 20);
  return Math.max(0, Math.min(fromFraction, fromMin));
}

function roleStyle(
  role: AutoTrendlineRole,
  tierSettings: AutoTrendlineTierSettings,
): Pick<AutoTrendlineSegment, 'lineStyle' | 'lineWidth' | 'extendRight'> {
  if (role === 'confirmed') {
    return {
      lineStyle: tierSettings.lineStyle,
      lineWidth: tierSettings.lineWidth,
      extendRight: false,
    };
  }
  if (role === 'continuation') {
    return {
      lineStyle: 'dashed',
      lineWidth: tierSettings.lineWidth,
      extendRight: tierSettings.extendRight,
    };
  }
  return {
    lineStyle: 'dotted',
    lineWidth: Math.max(1, tierSettings.lineWidth - (role === 'estimated' ? 1 : 0)),
    extendRight: tierSettings.extendRight,
  };
}

function makeSegment(args: {
  tier: AutoTrendlineTierId;
  kind: AutoTrendlineKind;
  start: { time: number; price: number; index: number };
  end: { time: number; price: number; index: number };
  slope: number;
  intercept: number;
  role: AutoTrendlineRole;
  chainLabel: AutoTrendlineChainLabel;
  color: string;
  tierSettings: AutoTrendlineTierSettings;
}): AutoTrendlineSegment {
  const style = roleStyle(args.role, args.tierSettings);
  return {
    tier: args.tier,
    kind: args.kind,
    startTime: args.start.time,
    startPrice: args.start.price,
    endTime: args.end.time,
    endPrice: args.end.price,
    slope: args.slope,
    intercept: args.intercept,
    touches: 2,
    spanBars: Math.max(1, args.end.index - args.start.index),
    color: args.color,
    lineWidth: style.lineWidth,
    lineStyle: style.lineStyle,
    extendRight: style.extendRight,
    role: args.role,
    chainLabel: args.chainLabel,
  };
}

/**
 * Detect auto trendlines for all enabled tiers.
 * Confirmed lines sit on consecutive same-structure pivots; the latest chain
 * also emits a projection fan from the last pivot.
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
  const barDur = medianBarDuration(candles);

  for (const tier of TIERS) {
    const tierSettings = settings[tier];
    if (!tierSettings.enabled) continue;

    const params = TIER_PARAMS[tier];
    const startIdx = windowStart(n, params);
    if (endIdx - startIdx < params.minBars * 0.5) continue;

    const pivots = detectStructurePivots(
      candles,
      startIdx,
      endIdx,
      params.pivotLookback,
      params.minSwingAtr,
    );
    const chains = consecutiveChains(pivots);
    if (!chains.length) continue;

    for (const kind of ['support', 'resistance'] as AutoTrendlineKind[]) {
      const kindChains = chains.filter((c) => c.kind === kind);
      if (!kindChains.length) continue;

      const color = kind === 'support' ? tierSettings.supportColor : tierSettings.resistanceColor;

      // Draw confirmed segments for the most recent chains of this kind,
      // newest first, capped so the pane does not fill with history.
      const recent = kindChains.slice(-3);
      let confirmedBudget = params.maxConfirmedSegments;
      const confirmed: AutoTrendlineSegment[] = [];

      for (let ci = recent.length - 1; ci >= 0 && confirmedBudget > 0; ci--) {
        const chain = recent[ci];
        const pts = chain.pivots;
        for (let i = pts.length - 1; i >= 1 && confirmedBudget > 0; i--) {
          const a = pts[i - 1];
          const b = pts[i];
          const slope = (b.price - a.price) / (b.index - a.index);
          const intercept = a.price - slope * a.index;
          confirmed.push(
            makeSegment({
              tier,
              kind,
              start: a,
              end: b,
              slope,
              intercept,
              role: 'confirmed',
              chainLabel: chain.label,
              color,
              tierSettings,
            }),
          );
          confirmedBudget--;
        }
      }

      confirmed.reverse();
      lines.push(...confirmed);

      // Projection fan lives on the latest chain only, and only while the
      // last confirmed leg has not already been closed through.
      const latest = kindChains[kindChains.length - 1];
      const pts = latest.pivots;
      if (pts.length < 2) continue;

      const lastA = pts[pts.length - 2];
      const lastB = pts[pts.length - 1];
      const lastSlope = (lastB.price - lastA.price) / (lastB.index - lastA.index);
      const lastIntercept = lastB.price - lastSlope * lastB.index;
      if (closedThroughAfter(candles, lastSlope, lastIntercept, lastB.index, kind, params.touchTolerancePct)) {
        continue;
      }

      const rays: ExtensionRay[] =
        pts.length >= 3
          ? projectExtensionFan(pts[pts.length - 3], lastA, lastB)
          : [
              {
                role: 'continuation',
                slope: lastSlope,
                intercept: lastIntercept,
                spanBars: Math.max(2, lastB.index - lastA.index),
                steepening: false,
              },
            ];

      for (const ray of rays) {
        const endIndex = lastB.index + ray.spanBars;
        const endTime = lastB.time + ray.spanBars * barDur;
        const endPrice = lastB.price + ray.slope * ray.spanBars;
        lines.push(
          makeSegment({
            tier,
            kind,
            start: lastB,
            end: { time: endTime, price: endPrice, index: endIndex },
            slope: ray.slope,
            intercept: ray.intercept,
            role: ray.role,
            chainLabel: latest.label,
            color,
            tierSettings,
          }),
        );
      }
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

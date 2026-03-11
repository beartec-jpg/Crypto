/**
 * Graduated scoring functions for all 8 trading systems.
 *
 * Each function returns a SystemEvaluation with a continuous score in the
 * range -100 (strong bearish) to +100 (strong bullish), a confidence
 * metric (0-100), and a list of individual scored conditions.
 */

import type { DivergencePoint } from '@/types/chart.types';
import type { FibSetResult } from '@/types/autoFib';
import type {
  SystemEvaluation,
  ScoredCondition,
  SignalLabel,
} from '@/types/systemScoring';
import type { SMTDivergenceResult } from '@/lib/smc/smtDivergence';
import {
  scoreRSI,
  scoreDistanceFromLevel,
  scoreVolume,
  scoreDivergence,
  scoreTrendAlignment,
} from '@/lib/conditionScoring';
import {
  getConditionWeights,
  calculateWeightedScore,
  type WeightLevel,
} from '@/lib/conditionWeights';
import { detectDivergence } from '@/lib/calculations/divergenceCalculations';

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Map a continuous score to a human-readable label and color. */
export function getSignalLabel(score: number): { label: SignalLabel; color: string } {
  if (score >= 80) return { label: 'BUY SIGNAL', color: '#22c55e' };
  if (score >= 50) return { label: 'BUILDING BUY', color: '#84cc16' };
  if (score >= 20) return { label: 'WEAK BULLISH', color: '#a3e635' };
  if (score > -20) return { label: 'NEUTRAL', color: '#94a3b8' };
  if (score > -50) return { label: 'WEAK BEARISH', color: '#fb923c' };
  if (score > -80) return { label: 'BEARISH SETUP', color: '#f97316' };
  return { label: 'SELL SIGNAL', color: '#ef4444' };
}

/** Map a continuous score to a label and color using custom buy/sell thresholds. */
export function getSignalLabelWithThresholds(
  score: number,
  buyThreshold: number = 80,
  sellThreshold: number = 80,
): { label: SignalLabel; color: string } {
  // 0.625 maps the threshold to the "building" intermediate zone (50/80 = 0.625)
  const buyBuildingThreshold = buyThreshold * 0.625;
  const sellBuildingThreshold = sellThreshold * 0.625;
  if (score >= buyThreshold) return { label: 'BUY SIGNAL', color: '#22c55e' };
  if (score >= buyBuildingThreshold) return { label: 'BUILDING BUY', color: '#84cc16' };
  if (score >= 20) return { label: 'WEAK BULLISH', color: '#a3e635' };
  if (score > -20) return { label: 'NEUTRAL', color: '#94a3b8' };
  if (score > -sellBuildingThreshold) return { label: 'WEAK BEARISH', color: '#fb923c' };
  if (score > -sellThreshold) return { label: 'BEARISH SETUP', color: '#f97316' };
  return { label: 'SELL SIGNAL', color: '#ef4444' };
}

/**
 * Extended signal labels for scores >100 (shows confluence stacking).
 * Falls back to standard labels for scores within the normal -100..+100 range.
 */
export function getExtendedSignalLabel(
  score: number,
  buyThreshold: number = 80,
  sellThreshold: number = 80,
): { label: SignalLabel; color: string } {
  const buyBuildingThreshold = buyThreshold * 0.625;
  const sellBuildingThreshold = sellThreshold * 0.625;

  // Extended positive ranges (>100)
  if (score >= 150) return { label: 'LEGENDARY LONG', color: '#10b981' };  // Emerald-500
  if (score >= 120) return { label: 'OUTSTANDING LONG', color: '#14b8a6' }; // Teal-500
  if (score >= 100) return { label: 'EXCELLENT LONG', color: '#22c55e' };   // Green-500

  // Standard positive ranges
  if (score >= buyThreshold) return { label: 'BUY SIGNAL', color: '#22c55e' };
  if (score >= buyBuildingThreshold) return { label: 'BUILDING BUY', color: '#84cc16' };
  if (score >= 20) return { label: 'WEAK BULLISH', color: '#a3e635' };

  // Neutral
  if (score > -20) return { label: 'NEUTRAL', color: '#94a3b8' };

  // Standard negative ranges
  if (score > -sellBuildingThreshold) return { label: 'WEAK BEARISH', color: '#fb923c' };
  if (score > -sellThreshold) return { label: 'BEARISH SETUP', color: '#f97316' };

  // Extended negative ranges (<-100)
  if (score > -100) return { label: 'SELL SIGNAL', color: '#ef4444' };
  if (score > -120) return { label: 'EXCELLENT SHORT', color: '#ef4444' };
  if (score > -150) return { label: 'OUTSTANDING SHORT', color: '#dc2626' }; // Red-600
  return { label: 'LEGENDARY SHORT', color: '#b91c1c' };                     // Red-700
}

/** Clamp a value to [-100, 100]. */
function clamp(value: number): number {
  return Math.max(-100, Math.min(100, value));
}
type GranularCondition = {
  id: string;
  name: string;
  score: number;
  value?: string;
  description?: string;
};

function normalizeByRange(value: number, range: number): number {
  if (range === 0) return 0;
  return clamp((value / range) * 100);
}

function scoreBoolean(bullish: boolean, bearish: boolean, magnitude = 80): number {
  if (bullish) return magnitude;
  if (bearish) return -magnitude;
  return 0;
}

function scorePercentMove(current: number, previous: number, rangePct = 2): number {
  if (previous === 0) return 0;
  const pct = ((current - previous) / previous) * 100;
  return normalizeByRange(pct, rangePct);
}

function mapWeightedConditions(
  systemId: string,
  granularConditions: GranularCondition[],
): { conditions: ScoredCondition[]; overallScore: number; reasoning: string[] } {
  const weights = getConditionWeights(systemId);

  const conditions: ScoredCondition[] = granularConditions.map(condition => {
    const userWeight = (weights[condition.id] ?? 1) as WeightLevel;
    const score = clamp(Math.round(condition.score));
    return {
      id: condition.id,
      name: condition.name,
      met: Math.abs(score) >= 40,
      weight: userWeight,
      score,
      userWeight,
      weightedScore: score * userWeight,
      value: condition.value,
      description: condition.description,
    };
  });

  const overallScore = calculateWeightedScore(
    conditions.map(c => ({ score: c.score ?? 0, weight: (c.userWeight ?? 1) as WeightLevel })),
  );

  const reasoning = conditions
    .filter(c => (c.userWeight ?? 0) > 0)
    .sort((a, b) => Math.abs((b.score ?? 0)) - Math.abs((a.score ?? 0)))
    .slice(0, 3)
    .filter(c => Math.abs(c.score ?? 0) >= 50)
    .map(c => `${c.name}: ${c.score}/100`);

  if (reasoning.length === 0) {
    reasoning.push('No strong confluence detected');
  }

  return { conditions, overallScore, reasoning };
}

/** Build the final SystemEvaluation from accumulated conditions. */
function buildEvaluation(
  systemId: string,
  conditions: ScoredCondition[],
  rawScore: number,
  reasoning?: string[],
): SystemEvaluation {
  // No clamp — allow scores >100 (Smart Money confluence stacking)
  const score = Math.round(rawScore);

  const buyThreshold = parseInt(
    localStorage.getItem(`tradingSystem_${systemId}_buyThreshold`) || '70',
    10,
  );
  const sellThreshold = parseInt(
    localStorage.getItem(`tradingSystem_${systemId}_sellThreshold`) || '70',
    10,
  );
  const { label, color } = getExtendedSignalLabel(score, buyThreshold, sellThreshold);

  const hasGranularScoring = conditions.some(
    c => c.score !== undefined && c.userWeight !== undefined,
  );

  let confidence = 0;
  if (hasGranularScoring) {
    const weightedMagnitude = conditions
      .filter(c => (c.userWeight ?? 0) > 0)
      .reduce((sum, c) => sum + (Math.abs(c.score ?? 0) * (c.userWeight ?? 0)), 0);
    const weightedMax = conditions
      .filter(c => (c.userWeight ?? 0) > 0)
      .reduce((sum, c) => sum + (100 * (c.userWeight ?? 0)), 0);

    confidence = weightedMax > 0 ? Math.round((weightedMagnitude / weightedMax) * 100) : 0;
  } else {
    const maxPossible = conditions.reduce((acc, c) => acc + Math.abs(c.weight), 0);
    confidence = maxPossible > 0
      ? Math.round((Math.abs(rawScore) / maxPossible) * 100)
      : 0;
  }

  return {
    systemId,
    score,
    confidence: Math.min(100, confidence),
    conditions,
    signalLabel: label,
    signalColor: color,
    reasoning,
  };
}

// ── Shared input type ─────────────────────────────────────────────────────────

/** Raw FVG as returned by useFVGDetection (uses top/bottom, not high/low). */
export interface RawSmcFVG {
  top: number;
  bottom: number;
  mitigated: boolean;
  type: 'bullish' | 'bearish';
  /** Unix timestamp (seconds) after which the FVG is considered formed — used as look-ahead guard. */
  endTime?: number;
  /** Sweep tracking (wick-through without close-through) */
  swept?: boolean;
  sweepTime?: number;
  sweepPrice?: number;
  sweepIndex?: number;
}

/** Raw OrderBlock as returned by useOrderBlockDetection (uses top/bottom, not high/low). */
export interface RawSmcOrderBlock {
  top: number;
  bottom: number;
  type: 'bullish' | 'bearish';
  /** Unix timestamp when OB was formed — used as look-ahead guard. */
  time?: number;
  mitigated?: boolean;
  mitigationTime?: number;
  /** Sweep tracking (wick-through without close-through) */
  swept?: boolean;
  sweepTime?: number;
  sweepPrice?: number;
  sweepIndex?: number;
}

/** Raw Breaker as returned by useBreakerBlockDetection (uses top/bottom, not high/low). */
export interface RawSmcBreaker {
  top: number;
  bottom: number;
  type: 'bullish' | 'bearish';
  mitigated?: boolean;
  mitigationTime?: number;
  conversionIndex?: number;
  conversionPrice?: number;
  /** Unix timestamp when the OB was converted to a breaker — used as look-ahead guard. */
  conversionTime?: number;
}

/** Raw LiquidityZone as returned by useLiquidityDetection. */
export interface RawSmcLiquidityZone {
  price: number;
  type: 'high' | 'low';
  swept: boolean;
  touchTimes?: number[];
  sweepPrice?: number;
  sweepIndex?: number;
  sweptIndex?: number;
}

/**
 * Build the SMC zone arrays (`fvgs`, `orderBlocks`, `breakers`, `liquidityZones`) for a
 * `ScoringInput` from the raw detector output.  This is the **single source-of-truth mapper**
 * used by every scoring path — both live/fullscreen and historical/backtest.
 *
 * When `currentTime` is provided (backtest / historical-candle mode), items that had not yet
 * formed at that candle timestamp are filtered out (look-ahead guard).  When omitted (live
 * fullscreen mode) all items are included as-is.
 *
 * Liquidity sweep metadata (`sweepPrice`, `sweepIndex`, `sweptIndex`) is always preserved.
 */
export function buildSmcZoneInputs(
  fvgs: RawSmcFVG[],
  orderBlocks: RawSmcOrderBlock[],
  breakers: RawSmcBreaker[],
  liquidityZones: RawSmcLiquidityZone[],
  currentTime?: number,
): Pick<ScoringInput, 'fvgs' | 'orderBlocks' | 'breakers' | 'liquidityZones'> {
  return {
    fvgs: fvgs
      .filter(fvg => currentTime === undefined || !fvg.endTime || fvg.endTime <= currentTime)
      .map(fvg => ({
        high: fvg.top,
        low: fvg.bottom,
        filled: fvg.mitigated,
        type: fvg.type,
        swept: fvg.swept,
        sweepIndex: fvg.sweepIndex,
        sweepPrice: fvg.sweepPrice,
      })),
    orderBlocks: orderBlocks
      .filter(ob => currentTime === undefined || !ob.time || ob.time <= currentTime)
      .map(ob => ({
        high: ob.top,
        low: ob.bottom,
        type: ob.type,
        mitigated: ob.mitigated === true &&
          (ob.mitigationTime === undefined || currentTime === undefined || ob.mitigationTime <= currentTime),
        swept: ob.swept,
        sweepIndex: ob.sweepIndex,
        sweepPrice: ob.sweepPrice,
      })),
    breakers: breakers
      .filter(b => currentTime === undefined || !b.conversionTime || b.conversionTime <= currentTime)
      .map(b => ({
        high: b.top,
        low: b.bottom,
        type: b.type,
        mitigated: b.mitigated === true &&
          (b.mitigationTime === undefined || currentTime === undefined || b.mitigationTime <= currentTime),
        conversionIndex: b.conversionIndex,
        conversionPrice: b.conversionPrice,
      })),
    liquidityZones: liquidityZones
      .filter(lz =>
        currentTime === undefined ||
        !lz.touchTimes ||
        lz.touchTimes.length === 0 ||
        lz.touchTimes[lz.touchTimes.length - 1] <= currentTime,
      )
      .map(lz => ({
        price: lz.price,
        type: lz.type,
        swept: lz.swept,
        sweepPrice: lz.sweepPrice,
        sweepIndex: lz.sweepIndex,
        sweptIndex: lz.sweptIndex,
      })),
  };
}

export interface ScoringInput {
  rsi?: number;
  currentPrice?: number;
  supportLevel?: number;
  resistanceLevel?: number;
  currentVolume?: number;
  avgVolume?: number;
  shortTermMA?: number;
  longTermMA?: number;
  lastRsi?: number;
  prevRsi?: number;
  macdNow?: number;
  macdPrev?: number;
  macdHistogram?: number;
  prevMacdHistogram?: number;
  sigNow?: number;
  sigPrev?: number;
  stTrend?: 'bullish' | 'bearish';
  latestStructureDirection?: 'bullish' | 'bearish';
  sqzOff?: boolean;
  sqzValue?: number;
  htfBullish: number;
  htfBearish: number;
  latestClose: number;
  previousClose: number;
  /** For divergence-master: recent divergence points from useDivergenceScanner */
  divergencePoints?: DivergencePoint[];
  /** Current candle's unix timestamp (seconds) for lookback filtering */
  currentTime?: number;
  /** Structure breaks array for time-based filtering */
  structureBreaks?: Array<{ breakTime: number; breakIndex?: number; direction: 'bullish' | 'bearish'; type?: 'bos' | 'choch' | 'mss'; swept?: boolean; brokenLevel?: number; confirmed?: boolean }>;
  /** Swing points for MSS invalidation checks */
  swingPoints?: Array<{ type: 'high' | 'low'; price: number; time: number; index: number }>;
  /** Current candle index for index-based structure break lookback */
  currentCandleIndex?: number;
  /** SMC Fair Value Gaps for Smart Money scoring */
  fvgs?: Array<{ high: number; low: number; filled: boolean; type: 'bullish' | 'bearish'; swept?: boolean; sweepIndex?: number; sweepPrice?: number }>;
  /** SMC Order Blocks for Smart Money scoring */
  orderBlocks?: Array<{ high: number; low: number; type: 'bullish' | 'bearish'; mitigated?: boolean; swept?: boolean; sweepIndex?: number; sweepPrice?: number }>;
  /** Breaker blocks (former OBs that flipped polarity) for Smart Money scoring */
  breakers?: Array<{ high: number; low: number; type: 'bullish' | 'bearish'; mitigated?: boolean; conversionIndex?: number; conversionPrice?: number }>;
  /** Liquidity zones for Smart Money scoring */
  liquidityZones?: Array<{ price: number; type: 'high' | 'low'; swept: boolean; sweepIndex?: number; sweptIndex?: number; sweepPrice?: number }>;
  /** Current timeframe for dynamic lookback calculation */
  timeframe?: string;
  /** Volume profile data for Volume Profile scoring */
  volumeProfileData?: {
    rows: Array<{ price: number; volume: number }>;
    valueAreaHigh?: number;
    valueAreaLow?: number;
    poc?: number;
  };
  /** Price history for divergence detection (at least 50 candles) */
  priceHistory?: number[];
  /** RSI value history for divergence detection (at least 50 candles) */
  rsiHistory?: number[];
  /** MACD histogram history for divergence detection (at least 50 candles) */
  macdHistHistory?: number[];
  /** Auto-Fib detection result for confluence scoring */
  autoFibResult?: { primary: FibSetResult | null; secondary: FibSetResult | null };
  /** SMT divergence detection result for multi-asset analysis */
  smtDivergence?: SMTDivergenceResult;
}

// ── 1. Trend Following Pro ────────────────────────────────────────────────────

export function scoreTrendFollowing(input: ScoringInput): SystemEvaluation {
  const {
    macdNow,
    macdPrev,
    sigNow,
    sigPrev,
    stTrend,
    lastRsi,
    latestClose,
    previousClose,
  } = input;

  // MACD crossover signal
  const macdBullCross =
    macdPrev !== undefined && sigPrev !== undefined &&
    macdNow !== undefined && sigNow !== undefined &&
    macdPrev <= sigPrev && macdNow > sigNow;
  const macdBearCross =
    macdPrev !== undefined && sigPrev !== undefined &&
    macdNow !== undefined && sigNow !== undefined &&
    macdPrev >= sigPrev && macdNow < sigNow;

  const superTrendScore = scoreBoolean(stTrend === 'bullish', stTrend === 'bearish', 85);

  const macdSignalScore =
    macdNow !== undefined && sigNow !== undefined
      ? normalizeByRange(macdNow - sigNow, 0.5)
      : 0;

  const macdCrossoverScore = scoreBoolean(macdBullCross, macdBearCross, 90);

  const rsiMomentumScore =
    lastRsi !== undefined
      ? normalizeByRange(lastRsi - 50, 25)
      : 0;

  const priceFollowScore = scorePercentMove(latestClose, previousClose, 2);

  const granularConditions: GranularCondition[] = [
    {
      id: 'supertrend',
      name: 'SuperTrend Direction',
      score: superTrendScore,
      description: 'Trend direction from SuperTrend state.',
    },
    {
      id: 'macdSignal',
      name: 'MACD vs Signal',
      score: macdSignalScore,
      description: 'Positive when MACD is above signal line.',
    },
    {
      id: 'macdCrossover',
      name: 'MACD Crossover',
      score: macdCrossoverScore,
      description: 'Recent crossover adds strong directional bias.',
    },
    {
      id: 'rsiMomentum',
      name: 'RSI Momentum',
      score: rsiMomentumScore,
      value: lastRsi !== undefined ? `RSI: ${lastRsi.toFixed(1)}` : undefined,
      description: 'RSI above 50 favors bulls, below 50 favors bears.',
    },
    {
      id: 'priceFollowThrough',
      name: 'Price Follow-Through',
      score: priceFollowScore,
      description: 'Latest candle direction and size.',
    },
  ];

  const { conditions, overallScore, reasoning } = mapWeightedConditions('trend-following', granularConditions);

  return buildEvaluation('trend-following', conditions, overallScore, reasoning);
}

// ── 2. Mean Reversion Hunter ──────────────────────────────────────────────────

export function scoreMeanReversion(input: ScoringInput): SystemEvaluation {
  const weights = getConditionWeights('mean-reversion');

  const rsiValue = input.rsi ?? input.lastRsi;
  const currentPrice = input.currentPrice ?? input.latestClose;

  const conditionResults: Array<{
    id: 'rsi' | 'support' | 'volume' | 'divergence' | 'trend';
    name: string;
    score: number;
    weight: WeightLevel;
    value?: string;
    description?: string;
  }> = [
    {
      id: 'rsi',
      name: 'RSI Oversold',
      score: rsiValue !== undefined ? scoreRSI(rsiValue) : 0,
      weight: (weights.rsi ?? 1) as WeightLevel,
      value: rsiValue !== undefined ? `RSI: ${rsiValue.toFixed(1)}` : undefined,
      description: 'Higher positive score means more oversold; negative means overbought.',
    },
    {
      id: 'support',
      name: 'Near Support Level',
      score: currentPrice !== undefined
        ? scoreDistanceFromLevel(
          currentPrice,
          input.supportLevel ?? null,
          input.resistanceLevel ?? null,
        )
        : 0,
      weight: (weights.support ?? 1) as WeightLevel,
      description: 'Positive near support, negative near resistance.',
    },
    {
      id: 'volume',
      name: 'Volume Spike',
      score: input.currentVolume !== undefined && input.avgVolume !== undefined
        ? scoreVolume(input.currentVolume, input.avgVolume)
        : 0,
      weight: (weights.volume ?? 1) as WeightLevel,
      description: 'High relative volume increases conviction.',
    },
    {
      id: 'divergence',
      name: 'Bullish Divergence',
      score: scoreDivergence(input.divergencePoints ?? []),
      weight: (weights.divergence ?? 1) as WeightLevel,
      description: 'Fresh bullish divergence is strongly positive.',
    },
    {
      id: 'trend',
      name: 'Trend Confirmation',
      score: input.shortTermMA !== undefined && input.longTermMA !== undefined && currentPrice !== undefined
        ? scoreTrendAlignment(input.shortTermMA, input.longTermMA, currentPrice)
        : 0,
      weight: (weights.trend ?? 1) as WeightLevel,
      description: 'Trend alignment can support or oppose mean reversion.',
    },
  ];

  const weightedScore = calculateWeightedScore(
    conditionResults.map(c => ({ score: c.score, weight: c.weight })),
  );

  const conditions: ScoredCondition[] = conditionResults.map(condition => ({
    id: condition.id,
    name: condition.name,
    met: Math.abs(condition.score) >= 40,
    weight: condition.weight,
    score: condition.score,
    userWeight: condition.weight,
    weightedScore: condition.score * condition.weight,
    value: condition.value,
    description: condition.description,
  }));

  const reasoning = conditions
    .filter(c => (c.userWeight ?? 0) > 0)
    .sort((a, b) => Math.abs((b.score ?? 0)) - Math.abs((a.score ?? 0)))
    .slice(0, 3)
    .filter(c => Math.abs(c.score ?? 0) >= 50)
    .map(c => `${c.name}: ${c.score}/100`);

  if (reasoning.length === 0) {
    reasoning.push('No strong confluence detected');
  }

  return buildEvaluation('mean-reversion', conditions, weightedScore, reasoning);
}

// ── 3. Breakout Momentum ──────────────────────────────────────────────────────

/**
 * @deprecated Use getStructureLookbackCandles(timeframe) instead for dynamic scaling
 * Lookback window in candles for recent structure break detection.
 */
const STRUCTURE_LOOKBACK_CANDLES = 15;

/** Proximity threshold (fraction) for FVG detection (0.5%). */
const FVG_PROXIMITY_THRESHOLD = 0.005;

/** Proximity threshold (fraction) for liquidity sweep detection (1%). */
const LIQUIDITY_SWEEP_PROXIMITY = 0.01;

/** Proximity threshold (fraction) for POC detection (1%). */
const POC_PROXIMITY_THRESHOLD = 0.01;

/** Proximity threshold (fraction) for value area boundary detection (0.2%). */
const VALUE_AREA_THRESHOLD = 0.002;

/** Proximity threshold (fraction) for volume row matching (0.1%). */
const VOLUME_ROW_PROXIMITY = 0.001;

/** Volume multiplier threshold for "high volume" classification. */
const HIGH_VOLUME_MULTIPLIER = 1.5;

/** Volume multiplier threshold for "low volume" classification. */
const LOW_VOLUME_MULTIPLIER = 0.5;

export function scoreBreakoutMomentum(input: ScoringInput): SystemEvaluation {
  const { sqzOff, sqzValue, macdNow, sigNow, latestClose, previousClose, structureBreaks, currentTime, currentCandleIndex } = input;

  // Structure break direction (±35) — only count breaks within last STRUCTURE_LOOKBACK_CANDLES candles
  const recentStructureBreak = structureBreaks
    ?.filter(sb => {
      if (sb.breakIndex !== undefined && currentCandleIndex !== undefined) {
        return sb.breakIndex >= currentCandleIndex - STRUCTURE_LOOKBACK_CANDLES;
      }
      return currentTime !== undefined ? sb.breakTime <= currentTime : true;
    })
    .sort((a, b) => b.breakTime - a.breakTime)[0];

  const latestStructureDirection = recentStructureBreak?.direction;

  const structureScore = scoreBoolean(
    latestStructureDirection === 'bullish',
    latestStructureDirection === 'bearish',
    90,
  );

  const squeezeScore = sqzOff
    ? normalizeByRange(sqzValue ?? 0, 3)
    : 0;

  const macdMomentumScore =
    macdNow !== undefined && sigNow !== undefined
      ? normalizeByRange(macdNow - sigNow, 0.6)
      : 0;

  const followThroughScore = scorePercentMove(latestClose, previousClose, 2);

  const granularConditions: GranularCondition[] = [
    {
      id: 'structureBreak',
      name: 'BOS / CHoCH Direction',
      score: structureScore,
      description: 'Most recent valid structure break direction.',
    },
    {
      id: 'squeezeRelease',
      name: 'Squeeze Release',
      score: squeezeScore,
      value: sqzValue !== undefined ? `SQZ: ${sqzValue.toFixed(2)}` : undefined,
      description: 'Directional momentum after squeeze release.',
    },
    {
      id: 'macdMomentum',
      name: 'MACD Momentum',
      score: macdMomentumScore,
      description: 'MACD distance from signal line.',
    },
    {
      id: 'priceFollowThrough',
      name: 'Price Follow-Through',
      score: followThroughScore,
      description: 'Latest candle follow-through strength.',
    },
  ];

  const { conditions, overallScore, reasoning } = mapWeightedConditions('breakout-momentum', granularConditions);
  return buildEvaluation('breakout-momentum', conditions, overallScore, reasoning);
}

// ── 4. Smart Money Tracker ────────────────────────────────────────────────────

/**
 * Score proximity to a zone (FVG, Order Block, Liquidity)
 * Returns 100 when inside zone, scales to 0 at maxDistancePct
 *
 * @param price - Current price
 * @param zoneTop - Top of the zone
 * @param zoneBottom - Bottom of the zone
 * @param maxDistancePct - Distance at which score reaches 0 (default 0.3%)
 * @returns Score 0-100
 */
function scoreZoneProximity(
  price: number,
  zoneTop: number,
  zoneBottom: number,
  maxDistancePct: number = 0.3
): number {
  // Inside the zone = 100 points
  if (price >= zoneBottom && price <= zoneTop) {
    return 100;
  }

  // Calculate distance from nearest edge
  const distanceFromTop = price > zoneTop ? price - zoneTop : 0;
  const distanceFromBottom = price < zoneBottom ? zoneBottom - price : 0;
  const nearestDistance = Math.max(distanceFromTop, distanceFromBottom);

  // Convert to percentage
  const distancePct = (nearestDistance / price) * 100;

  // Outside max distance = 0 points
  if (distancePct >= maxDistancePct) {
    return 0;
  }

  // Linear scale: 0% distance = 100, maxDistancePct = 0
  const score = 100 * (1 - (distancePct / maxDistancePct));

  return Math.round(score);
}

/**
 * Get structure lookback candles based on timeframe
 * Scales lookback window to be appropriate for each timeframe
 */
export function getStructureLookbackCandles(timeframe?: string): number {
  const lookbacks: Record<string, number> = {
    '1m': 30,   // 30 minutes
    '5m': 24,   // 2 hours
    '15m': 24,  // 6 hours
    '30m': 24,  // 12 hours
    '1h': 24,   // 24 hours (1 day)
    '4h': 18,   // 72 hours (3 days)
    '1d': 14,   // 14 days
  };
  return lookbacks[timeframe || '15m'] || 15;
}

function getTimeframeMinutes(timeframe?: string): number {
  const minutesByTimeframe: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  return minutesByTimeframe[timeframe || '15m'] || 15;
}

function getDivergenceTimeframeWeight(timeframe?: string): number {
  const weights: Record<string, number> = {
    '1m': 0.75,
    '5m': 0.9,
    '15m': 1.0,
    '30m': 1.1,
    '1h': 1.25,
    '4h': 1.5,
    '1d': 1.8,
  };
  return weights[timeframe || '15m'] || 1.0;
}

function scoreDivergencePointsConfluence(
  divergencePoints: DivergencePoint[] | undefined,
  currentTime: number | undefined,
  timeframe: string | undefined,
  htfBullish: number,
  htfBearish: number,
): { score: number; source: string; confidence: number } {
  if (!divergencePoints || divergencePoints.length === 0 || currentTime === undefined) {
    return { score: 0, source: 'No divergence points', confidence: 0 };
  }

  const tfMinutes = getTimeframeMinutes(timeframe);
  const barSeconds = tfMinutes * 60;
  const lookbackBars = 120;
  const lookbackSeconds = lookbackBars * barSeconds;

  const recentPoints = divergencePoints
    .filter(point => Math.abs(currentTime - point.time) <= lookbackSeconds)
    .sort((a, b) => b.time - a.time)
    .slice(0, 8);

  if (recentPoints.length === 0) {
    return { score: 0, source: 'No recent divergence points', confidence: 0 };
  }

  let weightedSignedSum = 0;
  let totalWeight = 0;

  for (const point of recentPoints) {
    const ageBars = Math.max(0, (currentTime - point.time) / barSeconds);
    const recencyWeight = Math.max(0.25, 1 - ageBars / 80);
    const oscillatorStrength = Math.max(1 / 7, Math.min(1, point.count / 7));
    const smtBonus = point.smtScore ? Math.min(0.5, point.smtScore / 200) : 0;
    const pointWeight = recencyWeight * (1 + smtBonus);

    const baseMagnitude = oscillatorStrength * 100;
    const signedMagnitude = point.type === 'bullish' ? baseMagnitude : -baseMagnitude;

    weightedSignedSum += signedMagnitude * pointWeight;
    totalWeight += pointWeight;
  }

  if (totalWeight === 0) {
    return { score: 0, source: 'No weighted divergence points', confidence: 0 };
  }

  const normalizedScore = weightedSignedSum / totalWeight;
  const timeframeWeight = getDivergenceTimeframeWeight(timeframe);

  const dominantIsBullish = normalizedScore >= 0;
  const alignedHtf = dominantIsBullish ? htfBullish : htfBearish;
  const opposingHtf = dominantIsBullish ? htfBearish : htfBullish;
  const totalHtf = Math.max(1, htfBullish + htfBearish);
  const htfBiasFactor = 1 + ((alignedHtf - opposingHtf) / totalHtf) * 0.35;

  const scaled = clamp(Math.round(normalizedScore * timeframeWeight * htfBiasFactor));
  const confidence = Math.min(100, Math.round((Math.abs(normalizedScore) / 100) * 100));

  return {
    score: scaled,
    source: `Scanner divergence (${recentPoints.length} pts, TF-weighted)`,
    confidence,
  };
}

/**
 * Score FVG proximity with distance scaling and directional sign.
 * Returns -100 to +100: positive for bullish FVGs, negative for bearish FVGs.
 * Entry/approach direction is validated:
 *   - Bullish FVG: only valid when price is above the zone (approaching down) or inside from above
 *   - Bearish FVG: only valid when price is below the zone (approaching up) or inside from below
 */
function scoreFVGProximity(currentPrice: number, previousPrice: number, fvgs?: Array<{ high: number; low: number; filled: boolean; type: 'bullish' | 'bearish' }>): number {
  if (!fvgs || fvgs.length === 0) return 0;

  // Find closest unfilled FVG
  const activeFVGs = fvgs.filter(fvg => !fvg.filled);
  if (activeFVGs.length === 0) return 0;

  const scores = activeFVGs.map(fvg => {
    const proximity = scoreZoneProximity(currentPrice, fvg.high, fvg.low, 0.5);

    const isInsideZone = currentPrice >= fvg.low && currentPrice <= fvg.high;
    const isAboveZone = currentPrice > fvg.high;
    const isBelowZone = currentPrice < fvg.low;

    // Inside a zone always scores full magnitude (±100).
    // When outside, keep directional approach validation.
    if (!isInsideZone) {
      // When outside: check if approaching from correct direction
      if (fvg.type === 'bullish') {
        // Bullish FVG: only valid if price is above (approaching down)
        if (!isAboveZone) return 0;
      } else {
        // Bearish FVG: only valid if price is below (approaching up)
        if (!isBelowZone) return 0;
      }
    }

    // Apply sign based on FVG type
    return fvg.type === 'bullish' ? proximity : -proximity;
  });

  // Return strongest signal by absolute magnitude
  return scores.reduce((max, s) => Math.abs(s) > Math.abs(max) ? s : max, scores[0]);
}

/**
 * Score Order Block proximity with distance scaling and directional sign.
 * Returns -100 to +100: positive for bullish OBs, negative for bearish OBs.
 * Entry/approach direction is validated:
 *   - Bullish OB: only valid when price is above the zone (approaching down) or inside from above
 *   - Bearish OB: only valid when price is below the zone (approaching up) or inside from below
 */
function scoreOrderBlockProximity(currentPrice: number, previousPrice: number, orderBlocks?: Array<{ high: number; low: number; type: 'bullish' | 'bearish'; mitigated?: boolean }>): number {
  if (!orderBlocks || orderBlocks.length === 0) return 0;

  // Only score active (unmitigated) order blocks
  const activeOBs = orderBlocks.filter(ob => !ob.mitigated);
  if (activeOBs.length === 0) return 0;

  const scores = activeOBs.map(ob => {
    const proximity = scoreZoneProximity(currentPrice, ob.high, ob.low, 0.5);

    const isInsideZone = currentPrice >= ob.low && currentPrice <= ob.high;
    const isAboveZone = currentPrice > ob.high;
    const isBelowZone = currentPrice < ob.low;

    // Inside a zone always scores full magnitude (±100).
    // When outside, keep directional approach validation.
    if (!isInsideZone) {
      // When outside: check if approaching from correct direction
      if (ob.type === 'bullish') {
        // Bullish OB: only valid if price is above (approaching down)
        if (!isAboveZone) return 0;
      } else {
        // Bearish OB: only valid if price is below (approaching up)
        if (!isBelowZone) return 0;
      }
    }

    // Apply sign based on OB type
    return ob.type === 'bullish' ? proximity : -proximity;
  });

  // Return strongest signal by absolute magnitude
  return scores.reduce((max, s) => Math.abs(s) > Math.abs(max) ? s : max, scores[0]);
}

/**
 * Score breaker block proximity with distance scaling.
 * Breakers are failed OBs that flipped polarity (support→resistance or vice versa).
 * Returns +100 for bullish breaker proximity, -100 for bearish, scaled by distance.
 */
function scoreBreakerBlockProximity(
  price: number,
  breakers?: Array<{
    high: number;
    low: number;
    type: 'bullish' | 'bearish';
    mitigated?: boolean;
  }>
): number {
  if (!breakers || breakers.length === 0) return 0;

  // Only consider active (unmitigated) breakers
  const activeBreakers = breakers.filter(b => b.mitigated !== true);

  if (activeBreakers.length === 0) return 0;

  // Score each breaker by proximity (0.5% max distance).
  const scores = activeBreakers.map(breaker => {
    const proximityScore = scoreZoneProximity(price, breaker.high, breaker.low, 0.5);
    return breaker.type === 'bullish' ? proximityScore : -proximityScore;
  });

  // Return score with highest absolute value
  return scores.reduce((best, curr) =>
    Math.abs(curr) > Math.abs(best) ? curr : best
  , 0);
}

/**
 * Score liquidity sweep with time-based linear decay.
 *
 * Rules:
 * - Starts at ±100 on confirmation candle
 * - Decays by 10 points per candle (reaches 0 after 10 candles)
 * - High sweep (bearish) = negative score, invalidated if price rises above sweep candle's high (sweepPrice)
 * - Low sweep (bullish) = positive score, invalidated if price drops below sweep candle's low (sweepPrice)
 * - FVG/OB sweeps apply the same decay and invalidation; bullish zone sweep = positive, bearish = negative
 * - Most recent sweep wins if multiple active
 *
 * @returns Score from -100 to +100, or 0 if no active sweep
 */
function scoreLiquiditySweepProximity(
  price: number,
  liquidityZones?: Array<{ price: number; type: 'high' | 'low'; swept: boolean; sweptIndex?: number; sweepPrice?: number }>,
  currentCandleIndex?: number,
  _structureBreaks?: Array<{ breakIndex?: number; direction: 'bullish' | 'bearish'; swept?: boolean; brokenLevel?: number }>,
  fvgs?: Array<{ type: 'bullish' | 'bearish'; swept?: boolean; sweepIndex?: number; sweepPrice?: number }>,
  orderBlocks?: Array<{ type: 'bullish' | 'bearish'; swept?: boolean; sweepIndex?: number; sweepPrice?: number; mitigated?: boolean }>,
): number {
  if (!currentCandleIndex) return 0;

  let bestScore = 0;
  let bestSweepIndex = -1;

  // Check liquidity zones (equal highs/lows)
  if (liquidityZones && liquidityZones.length > 0) {
    for (const lz of liquidityZones) {
      if (!lz.swept || lz.sweptIndex === undefined) continue;

      // Calculate age
      const candlesSinceSweep = currentCandleIndex - lz.sweptIndex;

      // Skip sweeps that haven't happened yet from the current candle's perspective
      // (prevents look-ahead bias in replay/backtest scoring).
      if (candlesSinceSweep < 0) continue;

      // Max lifetime: 10 candles
      if (candlesSinceSweep > 10) continue;

      // Check invalidation by price crossing the sweep candle's extreme (sweepPrice).
      // Fall back to zone level (lz.price) if sweepPrice is not available.
      const sweepExtremePrice = lz.sweepPrice ?? lz.price;
      if (lz.type === 'high' && price > sweepExtremePrice) continue; // High sweep invalid if price rises above sweep candle's high
      if (lz.type === 'low' && price < sweepExtremePrice) continue;  // Low sweep invalid if price drops below sweep candle's low

      // Linear decay: 100 → 90 → 80 → ... → 0
      const decayScore = Math.max(0, 100 - (candlesSinceSweep * 10));

      // Apply directional sign
      // High sweep (resistance grab) = bearish (negative)
      // Low sweep (support grab) = bullish (positive)
      const directionalScore = lz.type === 'high' ? -decayScore : decayScore;

      // Keep most recent sweep (highest sweptIndex)
      if (lz.sweptIndex > bestSweepIndex) {
        bestScore = directionalScore;
        bestSweepIndex = lz.sweptIndex;
      }
    }
  }

  // Check FVG sweeps
  if (fvgs && fvgs.length > 0) {
    for (const fvg of fvgs) {
      if (!fvg.swept || fvg.sweepIndex === undefined) continue;

      const candlesSinceSweep = currentCandleIndex - fvg.sweepIndex;
      if (candlesSinceSweep < 0) continue;
      if (candlesSinceSweep > 10) continue;

      // Invalidation: if price moves decisively beyond the sweep candle's extreme
      if (fvg.sweepPrice !== undefined) {
        if (fvg.type === 'bullish' && price < fvg.sweepPrice) continue; // Bullish sweep invalid if price drops below wick extreme
        if (fvg.type === 'bearish' && price > fvg.sweepPrice) continue; // Bearish sweep invalid if price rises above wick extreme
      }

      const decayScore = Math.max(0, 100 - (candlesSinceSweep * 10));
      // Bullish FVG swept = bullish signal (positive); bearish FVG swept = bearish signal (negative)
      const directionalScore = fvg.type === 'bullish' ? decayScore : -decayScore;

      if (fvg.sweepIndex > bestSweepIndex) {
        bestScore = directionalScore;
        bestSweepIndex = fvg.sweepIndex;
      }
    }
  }

  // Check Order Block sweeps
  if (orderBlocks && orderBlocks.length > 0) {
    for (const ob of orderBlocks) {
      if (!ob.swept || ob.sweepIndex === undefined) continue;

      const candlesSinceSweep = currentCandleIndex - ob.sweepIndex;
      if (candlesSinceSweep < 0) continue;
      if (candlesSinceSweep > 10) continue;

      // Invalidation: if price moves decisively beyond the sweep candle's extreme
      if (ob.sweepPrice !== undefined) {
        if (ob.type === 'bullish' && price < ob.sweepPrice) continue; // Bullish sweep invalid if price drops below wick extreme
        if (ob.type === 'bearish' && price > ob.sweepPrice) continue; // Bearish sweep invalid if price rises above wick extreme
      }

      const decayScore = Math.max(0, 100 - (candlesSinceSweep * 10));
      // Bullish OB swept = bullish signal (positive); bearish OB swept = bearish signal (negative)
      const directionalScore = ob.type === 'bullish' ? decayScore : -decayScore;

      if (ob.sweepIndex > bestSweepIndex) {
        bestScore = directionalScore;
        bestSweepIndex = ob.sweepIndex;
      }
    }
  }

  // Structure levels (BOS/CHoCH/MSS) are terminal once breached and are not
  // considered sweepable liquidity for this score.

  return Math.round(bestScore);
}

/**
 * Detect divergence confluence at current price level using peak/trough analysis.
 * Checks if RSI/MACD show divergence confirming the structure direction.
 *
 * @returns Bonus score: up to +50 for strong bullish divergence, -50 for bearish
 */
function scoreDivergenceConfluence(
  prices: number[],
  rsiValues: number[],
  macdHistValues: number[],
  structureDirection?: 'bullish' | 'bearish',
): number {
  if (!prices || prices.length < 30 || !structureDirection) return 0;
  if (!rsiValues || rsiValues.length < 30) return 0;

  const rsiDivergence = detectDivergence(prices, rsiValues, 5);
  const macdDivergence = macdHistValues && macdHistValues.length >= 30
    ? detectDivergence(prices, macdHistValues, 5)
    : 0;

  let score = 0;

  if (structureDirection === 'bullish') {
    if (rsiDivergence > 0) score += rsiDivergence * 15;   // Max +45
    if (macdDivergence > 0) score += macdDivergence * 10; // Max +30
  } else if (structureDirection === 'bearish') {
    if (rsiDivergence < 0) score += Math.abs(rsiDivergence) * 15;   // Max +45
    if (macdDivergence < 0) score += Math.abs(macdDivergence) * 10; // Max +30
  }

  // Return signed score: positive for bullish confluence, negative for bearish
  const magnitude = Math.round(Math.min(50, score));
  return structureDirection === 'bearish' ? -magnitude : magnitude;
}

/**
 * Score Auto-Fib confluence with FVG/OB zones.
 * Returns 0-100 when price is at a key fib level that aligns with an FVG or Order Block.
 */
function scoreAutoFibConfluence(
  fibResult: { primary: FibSetResult | null; secondary: FibSetResult | null } | undefined,
  currentPrice: number,
): number {
  if (!fibResult || !fibResult.primary) {
    return 0;
  }

  const primaryLevels = fibResult.primary.levels;
  if (!primaryLevels || primaryLevels.length === 0) return 0;

  const getLevelPrice = (target: string): number | null => {
    const level = primaryLevels.find(l => l.level === target || l.percentage === `${target}%`);
    return level?.price ?? null;
  };

  const level0 = getLevelPrice('0');
  const level100 = getLevelPrice('100');
  if (level0 === null || level100 === null || level0 === level100) return 0;

  // Normalize current price to fib percentage scale where 0%=level0 and 100%=level100.
  const fibPct = ((currentPrice - level0) / (level100 - level0)) * 100;
  const pct = Math.max(0, Math.min(100, fibPct));

  // Requested behavior:
  // - Above 50% (towards 0%) = mild negative, increasingly negative as it approaches 0.
  // - 61.8% to 78.6% zone = 100.
  // - Between 50% and 61.8% ramps from slight negative to strong positive.
  // - Above 78.6% decays from 100 toward moderate positive at 100%.
  if (pct < 50) {
    const t = (50 - pct) / 50; // 0 at 50%, 1 at 0%
    return Math.round(-5 - (t * 25)); // -5 .. -30
  }

  if (pct < 61.8) {
    const t = (pct - 50) / (61.8 - 50);
    return Math.round(-5 + (t * 85)); // -5 .. +80
  }

  if (pct <= 78.6) {
    return 100;
  }

  const t = Math.min(1, (pct - 78.6) / (100 - 78.6));
  return Math.round(100 - (t * 80)); // 100 .. 20
}

/**
 * Score SMT divergence confluence with FVG/OB zones and structure.
 * Returns -100 to 100: positive for bullish SMT, negative for bearish SMT.
 * 
 * @param smtDivergence - SMT divergence detection result
 * @returns Score from -100 (strong bearish) to +100 (strong bullish)
 */
function scoreSmtDivergenceConfluence(smtDivergence: SMTDivergenceResult | undefined): number {
  if (!smtDivergence || !smtDivergence.isValid || !smtDivergence.type) {
    return 0;
  }

  // Base score from divergence strength
  const baseScore = (smtDivergence.score / 100) * (smtDivergence.confidence / 100);

  // Apply sign based on type
  if (smtDivergence.type === 'bullish') {
    return Math.round(baseScore * 100);
  } else {
    return Math.round(baseScore * -100);
  }
}

/**
 * Hybrid divergence scoring: SMT primary + single-asset as fallback/confluence
 * 
 * Priority hierarchy:
 * 1. If SMT is valid → use SMT as primary signal
 * 2. If SMT invalid/unavailable → fall back to single-asset divergence (RSI/MACD)
 * 3. If BOTH are valid AND align → apply +30% confidence boost
 * 
 * @param smtDivergence - Multi-asset divergence result
 * @param singleAssetDivergenceScore - RSI/MACD divergence bonus (-100 to 100)
 * @returns Hybrid score with fallback chain applied
 */
function scoreHybridDivergence(
  smtDivergence: SMTDivergenceResult | undefined,
  singleAssetDivergenceScore: number,
): { score: number; source: string; confidence: number } {
  // Case 1: SMT available and valid → use as primary
  if (smtDivergence?.isValid && smtDivergence.type) {
    const smtScore = scoreSmtDivergenceConfluence(smtDivergence);
    
    // Case 1a: Both SMT and single-asset agree → add confluence bonus
    const bothBullish = smtDivergence.type === 'bullish' && singleAssetDivergenceScore > 0;
    const bothBearish = smtDivergence.type === 'bearish' && singleAssetDivergenceScore < 0;
    
    if ((bothBullish || bothBearish) && Math.abs(singleAssetDivergenceScore) > 0) {
      // Both signals aligned: boost confidence by 30%
      const boostFactor = 1.3;
      const boostedScore = Math.round(smtScore * boostFactor);
      const finalScore = Math.max(-100, Math.min(100, boostedScore));
      
      return {
        score: finalScore,
        source: `SMT (${smtDivergence.type}) + RSI/MACD confluence`,
        confidence: Math.min(100, (Math.abs(smtScore) / 100) * (smtDivergence.confidence / 100) * 100 * 1.3),
      };
    }
    
    // SMT alone (no single-asset backing)
    return {
      score: smtScore,
      source: `SMT primary (${smtDivergence.type})`,
      confidence: (Math.abs(smtScore) / 100) * (smtDivergence.confidence / 100) * 100,
    };
  }
  
  // Case 2: SMT unavailable → fall back to single-asset divergence
  if (singleAssetDivergenceScore !== 0) {
    return {
      score: singleAssetDivergenceScore,
      source: 'RSI/MACD divergence (SMT unavailable)',
      confidence: Math.abs(singleAssetDivergenceScore),
    };
  }
  
  // Case 3: No divergence signal available
  return {
    score: 0,
    source: 'No divergence signal',
    confidence: 0,
  };
}

/**
 * Determine if an MSS is invalidated.
 * Bullish MSS is invalidated when price breaks below the most recent LOW pivot that
 * existed before the MSS, or when a newer opposite MSS forms.
 * Bearish MSS is invalidated when price breaks above the most recent HIGH pivot that
 * existed before the MSS, or when a newer opposite MSS forms.
 */
function isMSSInvalidated(
  mss: { type?: string; direction: 'bullish' | 'bearish'; breakTime: number },
  currentPrice: number,
  swingPoints: Array<{ type: 'high' | 'low'; price: number; time: number; index: number }>,
  allStructureBreaks: Array<{ type?: string; direction: 'bullish' | 'bearish'; breakTime: number }>,
  currentTime?: number,
): boolean {
  if (mss.type !== 'mss') return false;

  const priorSwings = swingPoints.filter(swing => swing.time < mss.breakTime);

  if (mss.direction === 'bullish') {
    const priorLow = priorSwings
      .filter(s => s.type === 'low')
      .sort((a, b) => b.time - a.time)[0];
    if (priorLow && currentPrice < priorLow.price) return true;
  } else {
    const priorHigh = priorSwings
      .filter(s => s.type === 'high')
      .sort((a, b) => b.time - a.time)[0];
    if (priorHigh && currentPrice > priorHigh.price) return true;
  }

  const newerOppositeMSS = allStructureBreaks.find(sb =>
    sb.type === 'mss' &&
    sb.breakTime > mss.breakTime &&
    sb.direction !== mss.direction &&
    (currentTime === undefined || sb.breakTime <= currentTime)
  );

  return !!newerOppositeMSS;
}

/**
 * Count consecutive MSS/CHoCH in the same direction (stops at first opposing shift).
 */
export function getConsecutiveMSSCount(
  structureBreaks: Array<{ direction: 'bullish' | 'bearish'; type?: string; breakTime: number }>,
  currentDirection: 'bullish' | 'bearish',
  currentTime: number,
  lookbackCandles: number = 50,
): number {
  // Include all structure break types: CHoCH sets the direction (count=1), each subsequent BOS stacks (+1).
  const recentBreaks = structureBreaks
    .filter(sb => sb.type === 'bos' || sb.type === 'mss' || sb.type === 'choch')
    .filter(sb => sb.breakTime <= currentTime)
    .sort((a, b) => b.breakTime - a.breakTime);

  let consecutiveCount = 0;
  for (const sb of recentBreaks) {
    if (sb.direction === currentDirection) {
      consecutiveCount++;
    } else {
      break; // Stop at first opposing break (any type)
    }
  }

  return consecutiveCount;
}

/**
 * Calculate trend strength multiplier based on consecutive MSS/CHoCH in same direction.
 * 1 shift = 1.0x, 2 shifts = 1.1x, 3 shifts = 1.2x, ..., 6+ shifts = 1.5x (capped).
 */
export function getTrendStrengthMultiplier(
  structureBreaks: Array<{ direction: 'bullish' | 'bearish'; type?: string; breakTime: number }>,
  currentDirection: 'bullish' | 'bearish',
  currentTime: number,
  lookbackCandles: number = 50,
): number {
  const consecutiveCount = getConsecutiveMSSCount(structureBreaks, currentDirection, currentTime, lookbackCandles);
  return Math.min(1.0 + (consecutiveCount - 1) * 0.1, 1.5);
}

/**
 * Score the classic institutional inducement sequence:
 *   1. Liquidity sweep detected (equal highs/lows taken)
 *   2. MSS/CHoCH confirms AFTER the sweep (structure shifts against sweep direction)
 *   3. Price is currently near/in an OB, FVG, or Breaker aligned with the MSS direction
 *
 * When all three fire in chronological order this is a high-conviction setup.
 * Returns a directional score: positive = bullish inducement (low sweep → bullish MSS),
 * negative = bearish inducement (high sweep → bearish MSS).
 */
function scoreInducementSequence(
  currentPrice: number,
  liquidityZones: ScoringInput['liquidityZones'],
  structureBreaks: ScoringInput['structureBreaks'],
  orderBlocks: ScoringInput['orderBlocks'],
  fvgs: ScoringInput['fvgs'],
  breakers: ScoringInput['breakers'],
  currentCandleIndex: number | undefined,
): number {
  if (!liquidityZones || !structureBreaks) return 0;

  // Step 1: find the most recent confirmed sweep
  const recentSweeps = liquidityZones
    .filter(lz => lz.swept && (lz.sweptIndex !== undefined || lz.sweepIndex !== undefined))
    .sort((a, b) => (b.sweptIndex ?? b.sweepIndex ?? 0) - (a.sweptIndex ?? a.sweepIndex ?? 0));

  if (recentSweeps.length === 0) return 0;

  const latestSweep = recentSweeps[0];
  const sweepConfirmedIndex = latestSweep.sweptIndex ?? latestSweep.sweepIndex ?? 0;

  // Step 2: find an MSS or CHoCH that occurred AFTER the sweep confirmation
  const mssAfterSweep = structureBreaks
    .filter(sb => (sb.type === 'mss' || sb.type === 'choch') && sb.confirmed !== false)
    .filter(sb => {
      if (sb.breakIndex !== undefined && sweepConfirmedIndex > 0) {
        return sb.breakIndex > sweepConfirmedIndex;
      }
      return true; // fall back to including if no index available
    })
    .sort((a, b) => (b.breakIndex ?? 0) - (a.breakIndex ?? 0))[0];

  if (!mssAfterSweep) return 0;

  // The sweep direction and MSS direction must be opposite (inducement reversal pattern).
  // Low sweep → expect bullish MSS (price swept lows then reversed up).
  // High sweep → expect bearish MSS (price swept highs then reversed down).
  const expectBullishMSS = latestSweep.type === 'low';
  const mssIsBullish = mssAfterSweep.direction === 'bullish';
  if (expectBullishMSS !== mssIsBullish) return 0;

  // Step 3: is price near/in a zone aligned with the MSS direction?
  const zoneScanDistance = 0.01; // 1% from current price = "near a zone"
  let zoneAligned = false;

  if (orderBlocks) {
    for (const ob of orderBlocks) {
      if (ob.mitigated) continue;
      if (ob.type !== mssAfterSweep.direction) continue;
      const withinZone = currentPrice >= ob.low * (1 - zoneScanDistance) &&
                         currentPrice <= ob.high * (1 + zoneScanDistance);
      if (withinZone) { zoneAligned = true; break; }
    }
  }

  if (!zoneAligned && fvgs) {
    for (const fvg of fvgs) {
      if (fvg.filled) continue;
      if (fvg.type !== mssAfterSweep.direction) continue;
      const withinZone = currentPrice >= fvg.low * (1 - zoneScanDistance) &&
                         currentPrice <= fvg.high * (1 + zoneScanDistance);
      if (withinZone) { zoneAligned = true; break; }
    }
  }

  if (!zoneAligned && breakers) {
    for (const br of breakers) {
      if (br.mitigated) continue;
      if (br.type !== mssAfterSweep.direction) continue;
      const withinZone = currentPrice >= br.low * (1 - zoneScanDistance) &&
                         currentPrice <= br.high * (1 + zoneScanDistance);
      if (withinZone) { zoneAligned = true; break; }
    }
  }

  if (!zoneAligned) return 0;

  // All three steps confirmed — return a strong directional score
  return mssIsBullish ? 85 : -85;
}

export function scoreSmartMoney(input: ScoringInput): SystemEvaluation {
  const {
    latestClose,
    previousClose,
    structureBreaks,
    currentTime,
    currentCandleIndex,
    fvgs,
    orderBlocks,
    breakers,
    liquidityZones,
    timeframe,
    divergencePoints,
    htfBullish,
    htfBearish,
    priceHistory,
    rsiHistory,
    macdHistHistory,
    smtDivergence,
    autoFibResult,
    swingPoints,
  } = input;

  const weights = getConditionWeights('smart-money');
  const currentPrice = latestClose;
  const lookbackCandles = getStructureLookbackCandles(timeframe);

  // Filter structure breaks within the lookback window (for BOS/CHoCH fallback)
  const recentBreaks = structureBreaks?.filter(sb => {
    if (sb.breakIndex !== undefined && currentCandleIndex !== undefined) {
      return sb.breakIndex >= currentCandleIndex - lookbackCandles;
    }
    return true;
  });

  // MSS/CHoCH with invalidation logic: CHoCH signals direction change immediately;
  // MSS stays active until price breaks prior pivot or opposite MSS forms
  const activeMSS = structureBreaks
    ?.filter(sb => sb.type === 'mss' || sb.type === 'choch')
    .filter(sb => sb.type === 'choch' || !isMSSInvalidated(sb, currentPrice, swingPoints ?? [], structureBreaks ?? [], currentTime))
    .sort((a, b) => b.breakTime - a.breakTime)[0];

  const recentStructureBreak = activeMSS ?? recentBreaks
    ?.sort((a, b) => b.breakTime - a.breakTime)[0];

  const latestStructureDirection = recentStructureBreak?.direction;

  // Score entry zones (OB, FVG, Breaker) — always computed for display
  const obScore = scoreOrderBlockProximity(currentPrice, previousClose, orderBlocks);
  const fvgScore = scoreFVGProximity(currentPrice, previousClose, fvgs);
  const breakerScore = scoreBreakerBlockProximity(currentPrice, breakers);

  // Compute confluence scores upfront so they appear in conditions even when no entry zone qualifies
  const liquidityScore = scoreLiquiditySweepProximity(currentPrice, liquidityZones, currentCandleIndex, structureBreaks, fvgs, orderBlocks);

  const singleAssetDivergenceScore = scoreDivergenceConfluence(
    priceHistory ?? [],
    rsiHistory ?? [],
    macdHistHistory ?? [],
    latestStructureDirection,
  );

  const scannerDivergence = scoreDivergencePointsConfluence(
    divergencePoints,
    currentTime,
    timeframe,
    htfBullish,
    htfBearish,
  );

  const hybridDivergence = scoreHybridDivergence(smtDivergence, singleAssetDivergenceScore);
  const divergenceFinalScore = scannerDivergence.score !== 0
    ? clamp(Math.round(scannerDivergence.score * 0.8 + hybridDivergence.score * 0.2))
    : hybridDivergence.score;
  const divergenceSource = scannerDivergence.score !== 0
    ? `${scannerDivergence.source}; ${hybridDivergence.source}`
    : hybridDivergence.source;

  const autoFibWeight = weights.autoFibConfluence ?? 0;
  const autoFibScore = autoFibWeight > 0
    ? scoreAutoFibConfluence(autoFibResult, currentPrice)
    : 0;

  // Inducement sequence: sweep → MSS/CHoCH → zone entry (high-conviction institutional pattern)
  const inducementScore = scoreInducementSequence(
    currentPrice,
    liquidityZones,
    structureBreaks,
    orderBlocks,
    fvgs,
    breakers,
    currentCandleIndex,
  );

  // Trend strength (computed upfront for conditions display)
  // CHoCH sets direction (count=1), each subsequent BOS in that direction stacks (+1).
  // Multiplier: 1 break = ×1.0, 2 = ×1.1, 3 = ×1.2, … capped at ×1.5.
  const consecutiveMSSCount = latestStructureDirection
    ? getConsecutiveMSSCount(structureBreaks ?? [], latestStructureDirection, currentTime ?? 0, lookbackCandles)
    : 0;
  const trendMultiplier = latestStructureDirection
    ? Math.min(1.0 + (consecutiveMSSCount - 1) * 0.1, 1.5)
    : 1.0;

  // All possible entry zones — weights come from getConditionWeights (single source of truth)
  const allZones = [
    { id: 'orderBlockTouch', name: 'Order Block Proximity', score: obScore, weight: weights.orderBlockTouch as WeightLevel },
    { id: 'fvgProximity', name: 'FVG Proximity', score: fvgScore, weight: weights.fvgProximity as WeightLevel },
    { id: 'breakerBlockProximity', name: 'Breaker Block Proximity', score: breakerScore, weight: weights.breakerBlockProximity as WeightLevel },
  ];

  // Filter zones: must be enabled (weight>0), strong enough (≥20), and aligned with structure direction.
  // When no structure direction is known, no zones are valid (score will be 0).
  const validZones = allZones.filter(zone => {
    if (!latestStructureDirection) return false;
    if (zone.weight <= 0) return false;
    if (Math.abs(zone.score) < 20) return false;
    // Zone sign must match market structure direction
    const isBullishZone = zone.score > 0;
    const structureIsBullish = latestStructureDirection === 'bullish';
    return isBullishZone === structureIsBullish;  // Both bullish OR both bearish
  });

  // Calculate total possible weight from ALL enabled zones (weight>0), not just active ones.
  // This ensures a single active zone cannot score 100% when multiple zones are configured.
  const totalPossibleWeight = allZones
    .filter(z => z.weight > 0)
    .reduce((sum, z) => sum + z.weight, 0);

  // Calculate base entry score (weighted sum of active zones / total possible weight), or 0 when none qualify
  let baseEntryScore = 0;
  let boostedScore = 0;

  if (validZones.length > 0 && totalPossibleWeight > 0) {
    baseEntryScore = validZones.reduce((sum, z) => sum + (z.score * z.weight), 0) / totalPossibleWeight;

    // Apply confluence boosters (multiply base score instead of adding)
    boostedScore = baseEntryScore;

    if ((weights.liquiditySweep ?? 0) > 0 && Math.abs(liquidityScore) >= 40) {
      const sweepBoost = (Math.abs(liquidityScore) / 100) * 0.3;
      boostedScore *= (1 + sweepBoost);
    }

    if ((weights.divergenceConfluence ?? 0) > 0 && Math.abs(divergenceFinalScore) >= 20) {
      const structureIsBullish = latestStructureDirection === 'bullish';
      const divergenceIsBullish = divergenceFinalScore > 0;
      const isAligned = latestStructureDirection
        ? structureIsBullish === divergenceIsBullish
        : true;

      const divergenceFactor = Math.abs(divergenceFinalScore) / 100;
      if (isAligned) {
        const divBoost = divergenceFactor * 0.2;
        boostedScore *= (1 + divBoost);
      } else {
        const divPenalty = divergenceFactor * 0.35;
        boostedScore *= Math.max(0.55, 1 - divPenalty);
      }
    }

    if (autoFibScore >= 40) {
      const fibBoost = (autoFibScore / 100) * 0.15;
      boostedScore *= (1 + fibBoost);
    } else if (autoFibScore < 0) {
      const fibPenalty = (Math.abs(autoFibScore) / 100) * 0.12;
      boostedScore *= Math.max(0.7, 1 - fibPenalty);
    }

    // Inducement sequence (sweep → MSS/CHoCH → zone): highest-conviction bonus, up to +25%
    if (Math.abs(inducementScore) >= 40) {
      const inducementBoost = (Math.abs(inducementScore) / 100) * 0.25;
      boostedScore *= (1 + inducementBoost);
    }
  }

  const finalScore = validZones.length > 0 ? Math.round(boostedScore * trendMultiplier) : 0;

  // Build conditions for ALL zones so weight sliders are always visible and the debug
  // table can display raw scores regardless of whether zones qualify for an entry.
  const conditions: ScoredCondition[] = [
    {
      id: 'trendStrength',
      name: 'Trend Strength Multiplier',
      met: trendMultiplier > 1.0,
      weight: 1,
      score: trendMultiplier,
      userWeight: 1,
      weightedScore: trendMultiplier,
      value: `${trendMultiplier.toFixed(2)}x`,
      description: `${consecutiveMSSCount} consecutive ${latestStructureDirection ?? 'n/a'} structure breaks (CHoCH+BOS)`,
    },
    ...allZones.map(zone => {
      const isValidZone = validZones.some(vz => vz.id === zone.id);
      return {
        id: zone.id,
        name: zone.name,
        met: isValidZone,
        weight: zone.weight,
        score: Math.round(zone.score),
        userWeight: zone.weight,
        weightedScore: isValidZone ? Math.round(zone.score) * zone.weight : 0,
        value: `${Math.abs(Math.round(zone.score))}/100`,
        description: isValidZone
          ? `Active entry zone (weight: ${zone.weight})`
          : `Not qualifying (score: ${Math.round(zone.score)}/100)`,
      };
    }),
    {
      id: 'liquiditySweep',
      name: 'Liquidity Sweep',
      met: Math.abs(liquidityScore) >= 40,
      weight: (weights.liquiditySweep ?? 0) as WeightLevel,
      score: Math.round(liquidityScore),
      userWeight: (weights.liquiditySweep ?? 0) as WeightLevel,
      weightedScore: Math.round(liquidityScore) * (weights.liquiditySweep ?? 0),
      value: liquidityScore !== 0 ? `${Math.abs(Math.round(liquidityScore))}/100` : undefined,
      description: liquidityScore > 0
        ? `Low sweep (bullish): +${Math.round((Math.abs(liquidityScore) / 100) * 30)}% boost`
        : liquidityScore < 0
        ? `High sweep (bearish): +${Math.round((Math.abs(liquidityScore) / 100) * 30)}% boost`
        : 'No active liquidity sweeps',
    },
    {
      id: 'divergenceConfluence',
      name: 'Divergence Confluence',
      met: Math.abs(divergenceFinalScore) >= 40,
      weight: (weights.divergenceConfluence ?? 0) as WeightLevel,
      score: Math.round(divergenceFinalScore),
      userWeight: (weights.divergenceConfluence ?? 0) as WeightLevel,
      weightedScore: Math.round(divergenceFinalScore) * (weights.divergenceConfluence ?? 0),
      value: divergenceFinalScore !== 0 ? `${Math.abs(Math.round(divergenceFinalScore))}/100` : undefined,
      description:
        divergenceFinalScore === 0
          ? 'No active divergence'
          : latestStructureDirection &&
            ((latestStructureDirection === 'bullish' && divergenceFinalScore < 0) ||
              (latestStructureDirection === 'bearish' && divergenceFinalScore > 0))
          ? `${divergenceSource} (trend-opposing, up to -${Math.round((Math.abs(divergenceFinalScore) / 100) * 35)}% penalty)`
          : `${divergenceSource} (trend-aligned, +${Math.round((Math.abs(divergenceFinalScore) / 100) * 20)}% boost)`,
    },
    {
      id: 'autoFibConfluence',
      name: 'Auto-Fib Confluence',
      met: autoFibScore >= 40,
      weight: autoFibWeight as WeightLevel,
      score: Math.round(autoFibScore),
      userWeight: autoFibWeight as WeightLevel,
      weightedScore: Math.round(autoFibScore) * autoFibWeight,
      value: autoFibScore > 0 ? `${Math.round(autoFibScore)}/100` : undefined,
      description: autoFibScore >= 40
        ? `Primary fib in OTE region (+${Math.round((autoFibScore / 100) * 15)}% boost)`
        : autoFibScore < 0
        ? `Primary fib above 50% retracement (up to -${Math.round((Math.abs(autoFibScore) / 100) * 12)}% penalty)`
        : 'Primary fib neutral',
    },
    {
      id: 'inducementSequence',
      name: 'Inducement Sequence',
      met: Math.abs(inducementScore) >= 40,
      weight: 2 as WeightLevel,
      score: Math.round(inducementScore),
      userWeight: 2 as WeightLevel,
      weightedScore: Math.round(inducementScore) * 2,
      value: Math.abs(inducementScore) >= 40 ? `${Math.abs(Math.round(inducementScore))}/100` : undefined,
      description: Math.abs(inducementScore) >= 40
        ? `Sweep → MSS/CHoCH → Zone confirmed (${inducementScore > 0 ? 'bullish' : 'bearish'}) (+${Math.round((Math.abs(inducementScore) / 100) * 25)}% boost)`
        : 'No inducement sequence detected',
    },
  ];

  const confluenceBoostPct = baseEntryScore !== 0
    ? Math.round((boostedScore / baseEntryScore - 1) * 100)
    : 0;

  const reasoning: string[] = validZones.length === 0
    ? [latestStructureDirection
        ? 'No valid entry zones aligned with market structure'
        : 'No valid market structure detected']
    : [
      `Base Entry: ${Math.round(baseEntryScore)} (${validZones.map(z => z.name).join(' + ')})`,
      `Confluence Boosts: +${confluenceBoostPct}%` + (Math.abs(inducementScore) >= 40 ? ` (incl. Inducement +${Math.round((Math.abs(inducementScore) / 100) * 25)}%)` : ''),
      `Trend Multiplier: ${trendMultiplier.toFixed(2)}x (${consecutiveMSSCount} consecutive shifts)`,
      `Final Score: ${finalScore}`,
    ];

  return buildEvaluation('smart-money', conditions, finalScore, reasoning);
}

// ── 5. Momentum Scalper ───────────────────────────────────────────────────────

export function scoreMomentumScalper(input: ScoringInput): SystemEvaluation {
  const {
    macdNow,
    macdPrev,
    macdHistogram,
    prevMacdHistogram,
    sigNow,
    sigPrev,
    stTrend,
    latestClose,
    previousClose,
  } = input;

  const macdBullCross =
    macdPrev !== undefined && sigPrev !== undefined &&
    macdNow !== undefined && sigNow !== undefined &&
    macdPrev <= sigPrev && macdNow > sigNow;
  const macdBearCross =
    macdPrev !== undefined && sigPrev !== undefined &&
    macdNow !== undefined && sigNow !== undefined &&
    macdPrev >= sigPrev && macdNow < sigNow;

  const macdCrossoverScore = scoreBoolean(macdBullCross, macdBearCross, 90);

  const histogramScore =
    macdHistogram !== undefined && prevMacdHistogram !== undefined
      ? normalizeByRange(macdHistogram - prevMacdHistogram, 0.4)
      : 0;

  const trendDirectionScore = scoreBoolean(stTrend === 'bullish', stTrend === 'bearish', 80);

  const macdZeroLineScore =
    macdNow !== undefined
      ? normalizeByRange(macdNow, 0.6)
      : 0;

  const priceActionScore = scorePercentMove(latestClose, previousClose, 1.5);

  const granularConditions: GranularCondition[] = [
    {
      id: 'macdCrossover',
      name: 'MACD Crossover',
      score: macdCrossoverScore,
      description: 'Recent MACD crossover direction and strength.',
    },
    {
      id: 'histogramExpansion',
      name: 'Histogram Expansion',
      score: histogramScore,
      description: 'Acceleration in MACD histogram momentum.',
    },
    {
      id: 'trendDirection',
      name: 'Trend Direction',
      score: trendDirectionScore,
      description: 'Direction from trend filter.',
    },
    {
      id: 'macdZeroLine',
      name: 'MACD Zero-Line Position',
      score: macdZeroLineScore,
      description: 'Bias from MACD distance to zero.',
    },
    {
      id: 'priceAction',
      name: 'Price Action',
      score: priceActionScore,
      description: 'Short-term candle impulse.',
    },
  ];

  const { conditions, overallScore, reasoning } = mapWeightedConditions('momentum-scalper', granularConditions);
  return buildEvaluation('momentum-scalper', conditions, overallScore, reasoning);
}

// ── 6. Divergence Master ─────────────────────────────────────────────────────

/** Lookback period in candles for divergence detection (last N divergence points are considered). */
const DIVERGENCE_LOOKBACK_BARS = 50;

export function scoreDivergenceMaster(input: ScoringInput): SystemEvaluation {
  const {
    divergencePoints = [],
    currentTime,
    lastRsi,
    prevRsi,
    macdNow,
    macdPrev,
    macdHistogram,
    prevMacdHistogram,
    sigNow,
    sigPrev,
    smtDivergence,
  } = input;

  // ── Actual divergence detection from divergencePoints ──────────────────────
  // Use the most recent DIVERGENCE_LOOKBACK_BARS points, optionally filtered by currentTime.
  const recentSlice = divergencePoints.slice(-DIVERGENCE_LOOKBACK_BARS);
  const recentPoints = currentTime !== undefined
    ? recentSlice.filter(d => d.time <= currentTime)
    : recentSlice;

  const recentBullish = recentPoints.filter(d => d.type === 'bullish');
  const recentBearish = recentPoints.filter(d => d.type === 'bearish');

  const strongBullish = recentBullish
    .filter(d => d.count >= 3)
    .sort((a, b) => (b.time as number) - (a.time as number))[0];

  const strongBearish = recentBearish
    .filter(d => d.count >= 3)
    .sort((a, b) => (b.time as number) - (a.time as number))[0];

  const weakBullish = recentBullish
    .filter(d => d.count >= 1)
    .sort((a, b) => (b.time as number) - (a.time as number))[0];
  const weakBearish = recentBearish
    .filter(d => d.count >= 1)
    .sort((a, b) => (b.time as number) - (a.time as number))[0];

  const bullishDivScore = strongBullish
    ? Math.min(100, 65 + (strongBullish.count * 10))
    : weakBullish
      ? Math.min(80, 35 + (weakBullish.count * 10))
      : 0;

  const bearishDivScore = strongBearish
    ? -Math.min(100, 65 + (strongBearish.count * 10))
    : weakBearish
      ? -Math.min(80, 35 + (weakBearish.count * 10))
      : 0;

  const rsiLevelScore = lastRsi !== undefined ? scoreRSI(lastRsi) : 0;

  const rsiTurnScore =
    prevRsi !== undefined && lastRsi !== undefined
      ? normalizeByRange(lastRsi - prevRsi, 8)
      : 0;

  const macdTurnScore =
    macdHistogram !== undefined && prevMacdHistogram !== undefined
      ? normalizeByRange(macdHistogram - prevMacdHistogram, 0.4)
      : macdPrev !== undefined && sigPrev !== undefined && macdNow !== undefined && sigNow !== undefined
        ? normalizeByRange((macdNow - sigNow) - (macdPrev - sigPrev), 0.4)
        : 0;

  // SMT divergence as additional divergence type (primary but can be confluence with single-asset)
  let smtDivScore = 0;
  let smtDivDetails = '';
  
  if (smtDivergence?.isValid && smtDivergence.type) {
    const baseSmtScore = (smtDivergence.score / 100) * (smtDivergence.confidence / 100) * 100;
    
    // Check confluence: does SMT align with any existing divergence?
    const hasAlignedBullish = (smtDivergence.type === 'bullish' && bullishDivScore > 0);
    const hasAlignedBearish = (smtDivergence.type === 'bearish' && bearishDivScore < 0);
    
    if (hasAlignedBullish || hasAlignedBearish) {
      // Confluence bonus: SMT + single-asset divs both valid
      smtDivScore = Math.round(baseSmtScore * 1.25); // 25% boost for confluence
      smtDivDetails = `${smtDivergence.type} (vs ${smtDivergence.correlatedSymbol || 'correlated'}) + single-asset confluence`;
    } else {
      // SMT alone (valid but no single-asset confirmation)
      smtDivScore = Math.round(baseSmtScore);
      smtDivDetails = `${smtDivergence.type} multi-asset (vs ${smtDivergence.correlatedSymbol || 'correlated'})`;
    }
    
    // Apply sign based on type
    smtDivScore = smtDivergence.type === 'bearish' ? -smtDivScore : smtDivScore;
  }

  const granularConditions: GranularCondition[] = [
    {
      id: 'bullishDivergence',
      name: 'Bullish Divergence',
      score: bullishDivScore,
      value: (strongBullish ?? weakBullish)
        ? (strongBullish ?? weakBullish)!.indicators.slice(0, 3).join(', ')
        : undefined,
      description: 'Strength of recent bullish divergence cluster.',
    },
    {
      id: 'bearishDivergence',
      name: 'Bearish Divergence',
      score: bearishDivScore,
      value: (strongBearish ?? weakBearish)
        ? (strongBearish ?? weakBearish)!.indicators.slice(0, 3).join(', ')
        : undefined,
      description: 'Strength of recent bearish divergence cluster.',
    },
    {
      id: 'smtDivergence',
      name: 'SMT Divergence',
      score: smtDivScore,
      value: smtDivScore !== 0 ? `${Math.abs(smtDivScore)}/100` : undefined,
      description: smtDivDetails || 'No SMT divergence signal',
    },
    {
      id: 'rsiLevel',
      name: 'RSI Level Context',
      score: rsiLevelScore,
      value: lastRsi !== undefined ? `RSI: ${lastRsi.toFixed(1)}` : undefined,
      description: 'Oversold/overbought context from RSI.',
    },
    {
      id: 'rsiTurn',
      name: 'RSI Turn',
      score: rsiTurnScore,
      description: 'Momentum turn in RSI slope.',
    },
    {
      id: 'macdTurn',
      name: 'MACD Turn',
      score: macdTurnScore,
      description: 'Turning momentum in MACD structure.',
    },
  ];

  const { conditions, overallScore, reasoning } = mapWeightedConditions('divergence-master', granularConditions);
  return buildEvaluation('divergence-master', conditions, overallScore, reasoning);
}

// ── 7. Multi-Timeframe Confluence ─────────────────────────────────────────────

export function scoreMTFConfluence(input: ScoringInput): SystemEvaluation {
  const { stTrend, latestStructureDirection } = input;

  // HTF bias (htfBullish/htfBearish) is excluded — visual-only overlay.
  // MACD momentum is excluded — belongs to momentum systems, not SMC structure.

  const localTrendScore = scoreBoolean(stTrend === 'bullish', stTrend === 'bearish', 80);
  const structureDirectionScore = scoreBoolean(
    latestStructureDirection === 'bullish',
    latestStructureDirection === 'bearish',
    75,
  );

  const granularConditions: GranularCondition[] = [
    {
      id: 'localTrend',
      name: 'Local Trend',
      score: localTrendScore,
      description: 'Current timeframe trend direction.',
    },
    {
      id: 'structureDirection',
      name: 'Structure Direction',
      score: structureDirectionScore,
      description: 'Market structure direction on active timeframe.',
    },
  ];

  const { conditions, overallScore, reasoning } = mapWeightedConditions('mtf-confluence', granularConditions);
  return buildEvaluation('mtf-confluence', conditions, overallScore, reasoning);
}

// ── 8. Volume Profile Master ──────────────────────────────────────────────────

export function scoreVolumeProfile(input: ScoringInput): SystemEvaluation {
  const { lastRsi, prevRsi, latestClose, previousClose, macdNow, sigNow, volumeProfileData } = input;

  const currentPrice = latestClose;

  const currentRow = volumeProfileData?.rows?.find(r =>
    Math.abs(r.price - currentPrice) / currentPrice < VOLUME_ROW_PROXIMITY
  );

  const distanceToPOC = volumeProfileData?.poc
    ? Math.abs(currentPrice - volumeProfileData.poc) / currentPrice
    : undefined;
  const pocScore = distanceToPOC !== undefined
    ? normalizeByRange(POC_PROXIMITY_THRESHOLD - distanceToPOC, POC_PROXIMITY_THRESHOLD)
    : 0;

  const valueAreaScore = volumeProfileData?.valueAreaHigh && currentPrice >= volumeProfileData.valueAreaHigh * (1 - VALUE_AREA_THRESHOLD)
    ? -85
    : volumeProfileData?.valueAreaLow && currentPrice <= volumeProfileData.valueAreaLow * (1 + VALUE_AREA_THRESHOLD)
      ? 85
      : 0;

  const volumeNodeScore = currentRow && volumeProfileData?.rows && volumeProfileData.rows.length > 0
    ? (() => {
      const avgVolume = volumeProfileData.rows.reduce((sum, r) => sum + r.volume, 0) / volumeProfileData.rows.length;
      return normalizeByRange(currentRow.volume - avgVolume, Math.max(avgVolume * 0.8, 1));
    })()
    : 0;

  const rsiMidpointScore =
    prevRsi !== undefined && lastRsi !== undefined
      ? normalizeByRange((lastRsi - 50) + (lastRsi - prevRsi), 20)
      : 0;

  const followThroughScore = scorePercentMove(latestClose, previousClose, 2);

  const zoneBounceScore =
    lastRsi !== undefined
      ? (lastRsi <= 40
        ? Math.max(0, followThroughScore)
        : lastRsi >= 60
          ? Math.min(0, followThroughScore)
          : 0)
      : 0;

  const macdConfirmScore =
    macdNow !== undefined && sigNow !== undefined
      ? normalizeByRange(macdNow - sigNow, 0.5)
      : 0;

  const volumeConfirmScore =
    lastRsi !== undefined
      ? normalizeByRange((lastRsi - 50) + (followThroughScore / 4), 20)
      : 0;

  const granularConditions: GranularCondition[] = [
    {
      id: 'pocProximity',
      name: 'POC Proximity',
      score: pocScore,
      description: 'How close price is to the volume profile POC.',
    },
    {
      id: 'valueAreaBoundary',
      name: 'Value Area Boundary',
      score: valueAreaScore,
      description: 'Reversal opportunity at value area extremes.',
    },
    {
      id: 'volumeAtPrice',
      name: 'Volume at Price Level',
      score: volumeNodeScore,
      description: 'Relative node volume at current price.',
    },
    {
      id: 'rsiMidpoint',
      name: 'RSI Midpoint Context',
      score: rsiMidpointScore,
      value: lastRsi !== undefined ? `RSI: ${lastRsi.toFixed(1)}` : undefined,
      description: 'Momentum context around RSI midpoint.',
    },
    {
      id: 'followThrough',
      name: 'Candle Follow-Through',
      score: followThroughScore,
      description: 'Directional follow-through in current candle.',
    },
    {
      id: 'zoneBounce',
      name: 'Discount / Premium Bounce',
      score: zoneBounceScore,
      description: 'Price reaction quality in discount/premium zones.',
    },
    {
      id: 'macdConfirmation',
      name: 'MACD Confirmation',
      score: macdConfirmScore,
      description: 'Directional momentum confirmation from MACD.',
    },
    {
      id: 'volumeConfirmation',
      name: 'Volume Confirmation',
      score: volumeConfirmScore,
      description: 'Volume-backed directional conviction proxy.',
    },
  ];

  const { conditions, overallScore, reasoning } = mapWeightedConditions('volume-profile', granularConditions);
  return buildEvaluation('volume-profile', conditions, overallScore, reasoning);
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

import type { TradingSystemId } from '@/types/tradingSystems';

/** Score any trading system by ID. */
export function scoreSystem(systemId: TradingSystemId, input: ScoringInput): SystemEvaluation {
  switch (systemId) {
    case 'trend-following': return scoreTrendFollowing(input);
    case 'mean-reversion': return scoreMeanReversion(input);
    case 'breakout-momentum': return scoreBreakoutMomentum(input);
    case 'smart-money': return scoreSmartMoney(input);
    case 'momentum-scalper': return scoreMomentumScalper(input);
    case 'divergence-master': return scoreDivergenceMaster(input);
    case 'mtf-confluence': return scoreMTFConfluence(input);
    case 'volume-profile': return scoreVolumeProfile(input);
    default: return buildEvaluation(systemId, [], 0);
  }
}

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
import type { LiquidityZone } from '@/types/liquidity';
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
import {
  createEnhancedSweep,
  scoreSweepProximityEnhanced,
  calculateCompositeZoneScore,
  calculateATR,
  type EnhancedLiquiditySweep,
} from '@/lib/smc/enhancedLiquidityScoring';

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
  const score = clamp(rawScore);

  const buyThreshold = parseInt(
    localStorage.getItem(`tradingSystem_${systemId}_buyThreshold`) || '70',
    10,
  );
  const sellThreshold = parseInt(
    localStorage.getItem(`tradingSystem_${systemId}_sellThreshold`) || '70',
    10,
  );
  const { label, color } = getSignalLabelWithThresholds(score, buyThreshold, sellThreshold);

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
  fvgs?: Array<{ high: number; low: number; filled: boolean; type: 'bullish' | 'bearish' }>;
  /** SMC Order Blocks for Smart Money scoring */
  orderBlocks?: Array<{ high: number; low: number; type: 'bullish' | 'bearish'; mitigated?: boolean }>;
  /** Liquidity zones for Smart Money scoring */
  liquidityZones?: Array<{ price: number; type: 'high' | 'low'; swept: boolean; sweptIndex?: number }>;
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
function getStructureLookbackCandles(timeframe?: string): number {
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
    const proximity = scoreZoneProximity(currentPrice, fvg.high, fvg.low, 0.3);

    const isInsideZone = currentPrice >= fvg.low && currentPrice <= fvg.high;
    const isAboveZone = currentPrice > fvg.high;
    const isBelowZone = currentPrice < fvg.low;

    // Validate entry/approach direction
    if (isInsideZone) {
      // When inside: check where price came from
      const enteredFromAbove = previousPrice > fvg.high;
      const enteredFromBelow = previousPrice < fvg.low;

      // Bullish FVG: only valid if entered from above
      if (fvg.type === 'bullish' && !enteredFromAbove) return 0;
      // Bearish FVG: only valid if entered from below
      if (fvg.type === 'bearish' && !enteredFromBelow) return 0;
    } else {
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
    const proximity = scoreZoneProximity(currentPrice, ob.high, ob.low, 3.0);

    const isInsideZone = currentPrice >= ob.low && currentPrice <= ob.high;
    const isAboveZone = currentPrice > ob.high;
    const isBelowZone = currentPrice < ob.low;

    // Validate entry/approach direction
    if (isInsideZone) {
      // When inside: check where price came from
      const enteredFromAbove = previousPrice > ob.high;
      const enteredFromBelow = previousPrice < ob.low;

      // Bullish OB: only valid if entered from above
      if (ob.type === 'bullish' && !enteredFromAbove) return 0;
      // Bearish OB: only valid if entered from below
      if (ob.type === 'bearish' && !enteredFromBelow) return 0;
    } else {
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
 * Score liquidity sweep proximity with time decay.
 * Returns 0-100 based on distance and recency.
 * Checks both explicit liquidityZones and structure breaks where swept === true.
 */
function scoreLiquiditySweepProximity(
  price: number,
  liquidityZones?: Array<{ price: number; type: 'high' | 'low'; swept: boolean; sweptIndex?: number }>,
  currentCandleIndex?: number,
  lookbackCandles: number = 50,
  structureBreaks?: Array<{ breakTime: number; breakIndex?: number; direction: 'bullish' | 'bearish'; swept?: boolean; brokenLevel?: number }>,
): number {
  const scores: number[] = [];

  // Check explicit liquidity zones
  if (liquidityZones && liquidityZones.length > 0 && currentCandleIndex !== undefined) {
    const recentSwepts = liquidityZones.filter(lz =>
      lz.swept &&
      lz.sweptIndex !== undefined &&
      lz.sweptIndex >= currentCandleIndex - lookbackCandles
    );

    for (const lz of recentSwepts) {
      const distancePct = Math.abs(price - lz.price) / price * 100;
      if (distancePct >= 5.0) continue;
      const proximityScore = 100 * (1 - (distancePct / 5.0));
      const candlesSinceSweep = currentCandleIndex - (lz.sweptIndex || currentCandleIndex);
      const timeDecay = Math.max(0.5, 1 - (candlesSinceSweep / lookbackCandles));
      scores.push(Math.round(proximityScore * timeDecay));
    }
  }

  // Check structure breaks where swept === true (pre-filtered by invalidation logic in scoreSmartMoney)
  if (structureBreaks && structureBreaks.length > 0) {
    const activeSweeps = structureBreaks.filter(sb =>
      sb.swept === true &&
      sb.brokenLevel !== undefined
    );

    for (const sweep of activeSweeps) {
      const distancePct = Math.abs(price - (sweep.brokenLevel ?? 0)) / price * 100;
      if (distancePct >= 5.0) continue;
      const proximityScore = 100 * (1 - (distancePct / 5.0));
      const candlesSinceSweep = currentCandleIndex !== undefined
        ? currentCandleIndex - (sweep.breakIndex ?? currentCandleIndex)
        : 0;
      const timeDecay = Math.max(0.5, 1 - (candlesSinceSweep / lookbackCandles));
      scores.push(Math.round(proximityScore * timeDecay));
    }
  }

  return scores.length > 0 ? Math.max(...scores) : 0;
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
  fvgs?: Array<{ high: number; low: number; filled: boolean; type: 'bullish' | 'bearish' }>,
  orderBlocks?: Array<{ high: number; low: number; type: 'bullish' | 'bearish'; mitigated?: boolean }>,
  alignmentThreshold: number = 0.5,
): number {
  if (!fibResult || (!fibResult.primary && !fibResult.secondary)) {
    return 0;
  }

  let bestScore = 0;

  const allFibLevels: Array<{ price: number; isFrozen: boolean; isGolden: boolean }> = [];

  if (fibResult.primary) {
    allFibLevels.push(...fibResult.primary.levels.map(l => ({
      price: l.price,
      isFrozen: l.isFrozen,
      isGolden: l.isGolden,
    })));
  }

  if (fibResult.secondary) {
    allFibLevels.push(...fibResult.secondary.levels.map(l => ({
      price: l.price,
      isFrozen: l.isFrozen,
      isGolden: l.isGolden,
    })));
  }

  for (const fib of allFibLevels) {
    if (fib.price <= 0) continue;

    const frozenPenalty = fib.isFrozen ? 0.5 : 1.0;

    const distToFib = Math.abs(currentPrice - fib.price) / fib.price * 100;
    if (distToFib > 5.0) continue;

    let score = distToFib < 0.1
      ? 100 * frozenPenalty
      : ((5.0 - distToFib) / 5.0) * 50 * frozenPenalty;

    if (fib.isGolden) {
      score += 10 * frozenPenalty;
    }

    let hasFVGConfluence = false;
    if (fvgs) {
      for (const fvg of fvgs) {
        if (fvg.filled) continue;
        const fvgMid = (fvg.high + fvg.low) / 2;
        const alignment = Math.abs(fib.price - fvgMid) / fib.price * 100;
        if (alignment <= alignmentThreshold) {
          hasFVGConfluence = true;
          score += 25 * frozenPenalty;
          break;
        }
      }
    }

    let hasOBConfluence = false;
    if (orderBlocks) {
      for (const ob of orderBlocks) {
        if (ob.mitigated) continue;
        const obMid = (ob.high + ob.low) / 2;
        const alignment = Math.abs(fib.price - obMid) / fib.price * 100;
        if (alignment <= alignmentThreshold) {
          hasOBConfluence = true;
          score += 25 * frozenPenalty;
          break;
        }
      }
    }

    if (hasFVGConfluence && hasOBConfluence) {
      score += 15 * frozenPenalty; // Triple confluence bonus
    }

    if (score > bestScore) {
      bestScore = score;
    }
  }

  return Math.round(Math.min(bestScore, 100));
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
    sb.direction !== mss.direction
  );

  return !!newerOppositeMSS;
}

/**
 * Determine if a swept level is invalidated.
 * A sweep is invalidated when price moves >10% away from the swept level,
 * or when a later confirmed break occurs at the same level.
 */
function isSweptLevelInvalidated(
  sweep: { breakTime: number; brokenLevel?: number; confirmed?: boolean },
  currentPrice: number,
  allStructureBreaks: Array<{ breakTime: number; brokenLevel?: number; confirmed?: boolean }>,
): boolean {
  const distancePct = Math.abs(currentPrice - (sweep.brokenLevel ?? 0)) / currentPrice * 100;
  if (distancePct > 10.0) return true;

  const laterConfirmedBreak = allStructureBreaks.find(sb =>
    sb.breakTime > sweep.breakTime &&
    sb.confirmed === true &&
    Math.abs((sb.brokenLevel ?? 0) - (sweep.brokenLevel ?? 0)) / currentPrice * 100 < 1.0
  );

  return !!laterConfirmedBreak;
}

export function scoreSmartMoney(input: ScoringInput): SystemEvaluation {
  const {
    latestClose,
    structureBreaks,
    swingPoints,
    currentCandleIndex,
    fvgs,
    orderBlocks,
    liquidityZones,
    timeframe,
    priceHistory,
    rsiHistory,
    macdHistHistory,
    autoFibResult,
  } = input;

  const currentPrice = latestClose;

  // Dynamic lookback for BOS/CHoCH (not used for MSS)
  const lookbackCandles = getStructureLookbackCandles(timeframe);

  // Filter structure breaks within the lookback window (for BOS/CHoCH fallback)
  const recentBreaks = structureBreaks?.filter(sb => {
    if (sb.breakIndex !== undefined && currentCandleIndex !== undefined) {
      return sb.breakIndex >= currentCandleIndex - lookbackCandles;
    }
    return true;
  });

  // MSS with invalidation logic: stays active until price breaks prior pivot or opposite MSS forms
  const activeMSS = structureBreaks
    ?.filter(sb => sb.type === 'mss')
    .filter(sb => !isMSSInvalidated(sb, currentPrice, swingPoints ?? [], structureBreaks ?? []))
    .sort((a, b) => b.breakTime - a.breakTime)[0];

  const recentStructureBreak = activeMSS ?? recentBreaks
    ?.sort((a, b) => b.breakTime - a.breakTime)[0];

  const latestStructureDirection = recentStructureBreak?.direction;

  // Prior trend from most recent BOS/CHoCH (non-MSS), used to evaluate MSS direction
  const priorTrendBreak = structureBreaks
    ?.filter(sb => sb.type !== 'mss')
    .sort((a, b) => b.breakTime - a.breakTime)[0];
  const priorTrend = priorTrendBreak?.direction;

  // Score MSS direction relative to prior trend:
  //   - MSS confirming prior trend:  ±90 (strong continuation)
  //   - MSS counter to prior trend:  ∓60 (reversal warning)
  //   - No active MSS: fall back to BOS/CHoCH direction score (±90)
  let structureShiftScore: number;
  if (activeMSS) {
    const mssDir = activeMSS.direction;
    if (!priorTrend || mssDir === priorTrend) {
      structureShiftScore = mssDir === 'bullish' ? 90 : -90;
    } else {
      structureShiftScore = mssDir === 'bullish' ? 60 : -60;
    }
  } else {
    structureShiftScore =
      latestStructureDirection === 'bullish' ? 90 :
      latestStructureDirection === 'bearish' ? -90 : 0;
  }

  // Distance-scaled proximity scores (-100 to +100, signed by zone type)
  const fvgScore = scoreFVGProximity(currentPrice, input.previousClose, fvgs);
  const obScore = scoreOrderBlockProximity(currentPrice, input.previousClose, orderBlocks);

  // Enhanced liquidity sweep scoring
  // If we have full liquidity zone data with sweep details, use enhanced validation logic
  const enhancedSweeps: EnhancedLiquiditySweep[] = [];
  let liquidityScore = 0;
  let fvgScoreAdjusted = fvgScore;
  let obScoreAdjusted = obScore;

  if (
    liquidityZones && 
    liquidityZones.length > 0 && 
    currentCandleIndex !== undefined &&
    priceHistory && 
    priceHistory.length >= 50
  ) {
    // We have detailed data for enhanced sweep analysis
    // Create enhanced sweeps from liquidity zones where data is available
    const extendedLiqZones: Array<LiquidityZone & { sweptIndex?: number }> = 
      liquidityZones.map(lz => ({ ...lz, sweptIndex: lz.sweptIndex })) as any;

    for (const lz of extendedLiqZones) {
      if (lz.swept && lz.sweptIndex !== undefined && lz.sweptIndex < currentCandleIndex) {
        // For enhanced scoring, we'll use a simplified approach based on available data
        // Score based on sweep strength (wick depth) and proximity
        const fromSweep = currentCandleIndex - lz.sweptIndex;
        const timeDecay = Math.max(0.5, 1 - (fromSweep / 50)); // 50-candle decay
        
        // Simplified sweep score based on closeness to level
        const distancePct = Math.abs(currentPrice - lz.price) / currentPrice;
        
        if (distancePct <= 0.05) { // Within 5%
          const proximityScore = 100 * (1 - (distancePct / 0.05)); // 0-100
          const sweepScore = Math.round(proximityScore * timeDecay);
          
          enhancedSweeps.push({
            id: lz.id,
            direction: lz.type === 'low' ? 'buy-side' : 'sell-side',
            sweptLevel: lz.price,
            sweepTime: lz.sweepTime ?? 0,
            sweepIndex: lz.sweptIndex,
            wickSize: 0, // Not available in this context
            wickSizePct: 0,
            reversalStrength: 65, // Simplified
            confluenceScore: 50, // Simplified
            volumeConfirmation: 50,
            validationScore: Math.min(100, sweepScore + 20),
            isValid: !lz.invalidated && sweepScore > 30,
            candlesSinceSweep: fromSweep,
            ageDecayFactor: timeDecay,
          });
        }
      }
    }
    
    // Score using enhanced sweeps if available
    if (enhancedSweeps.length > 0) {
      liquidityScore = scoreSweepProximityEnhanced(currentPrice, enhancedSweeps, true);
      
      // Boost nearby FVG/OB scores if sweep is nearby
      for (const sweep of enhancedSweeps) {
        if (!sweep.isValid) continue;
        
        // Check FVGs for proximity
        if (fvgs) {
          for (let i = 0; i < fvgs.length; i++) {
            const fvg = fvgs[i];
            const distToFvg = Math.min(
              Math.abs(sweep.sweptLevel - fvg.low),
              Math.abs(sweep.sweptLevel - fvg.high)
            ) / sweep.sweptLevel;
            
            if (distToFvg <= 0.01) { // Within 1%
              const boostFactor = 1 + (sweep.validationScore / 100) * 0.5; // Up to 50% boost
              fvgScoreAdjusted = Math.round(Math.abs(fvgScore) * boostFactor) * (fvgScore < 0 ? -1 : 1);
            }
          }
        }
        
        // Check Order Blocks for proximity
        if (orderBlocks) {
          for (let i = 0; i < orderBlocks.length; i++) {
            const ob = orderBlocks[i];
            const distToOb = Math.min(
              Math.abs(sweep.sweptLevel - ob.low),
              Math.abs(sweep.sweptLevel - ob.high)
            ) / sweep.sweptLevel;
            
            if (distToOb <= 0.01) { // Within 1%
              const boostFactor = 1 + (sweep.validationScore / 100) * 0.4; // Up to 40% boost
              obScoreAdjusted = Math.round(Math.abs(obScore) * boostFactor) * (obScore < 0 ? -1 : 1);
            }
          }
        }
      }
    } else {
      // Fallback to original sweep proximity scoring
      const activeSweeps = structureBreaks?.filter(sb =>
        sb.swept === true &&
        !isSweptLevelInvalidated(sb, currentPrice, structureBreaks ?? [])
      );

      liquidityScore = scoreLiquiditySweepProximity(
        currentPrice,
        liquidityZones,
        currentCandleIndex,
        lookbackCandles,
        activeSweeps,
      );
    }
  } else {
    // Fallback to original scoring when data is insufficient
    const activeSweeps = structureBreaks?.filter(sb =>
      sb.swept === true &&
      !isSweptLevelInvalidated(sb, currentPrice, structureBreaks ?? [])
    );

    liquidityScore = scoreLiquiditySweepProximity(
      currentPrice,
      liquidityZones,
      currentCandleIndex,
      lookbackCandles,
      activeSweeps,
    );
  }

  // Divergence confluence using peak/trough analysis
  const divergenceBonus = scoreDivergenceConfluence(
    priceHistory ?? [],
    rsiHistory ?? [],
    macdHistHistory ?? [],
    latestStructureDirection,
  );

  // Auto-Fib confluence scoring (only when weight > 0)
  const autoFibWeight = getConditionWeights('smart-money').autoFibConfluence ?? 0;
  const autoFibScore = autoFibWeight > 0
    ? scoreAutoFibConfluence(autoFibResult, currentPrice, fvgs, orderBlocks)
    : 0;

  // SMT divergence scoring (multi-asset divergence detection)
  const smtScore = scoreSmtDivergenceConfluence(smtDivergence);

  const granularConditions: GranularCondition[] = [
    {
      id: 'structureShift',
      name: 'SMC Structure Shift',
      score: structureShiftScore,
      description: 'Direction of active MSS (invalidates when price breaks prior pivot or opposite MSS forms).',
    },
    {
      id: 'fvgProximity',
      name: 'FVG Proximity',
      score: fvgScoreAdjusted,
      value: fvgScoreAdjusted !== 0 ? `${Math.abs(fvgScoreAdjusted)}/100` : undefined,
      description: enhancedSweeps.length > 0 
        ? `Distance-scaled proximity to Fair Value Gap (boosted by ${enhancedSweeps.length} nearby sweep${enhancedSweeps.length > 1 ? 's' : ''}).`
        : 'Distance-scaled proximity to Fair Value Gap.',
    },
    {
      id: 'orderBlockTouch',
      name: 'Order Block Proximity',
      score: obScoreAdjusted,
      value: obScoreAdjusted !== 0 ? `${Math.abs(obScoreAdjusted)}/100` : undefined,
      description: enhancedSweeps.length > 0 
        ? `Distance-scaled proximity to Order Block (boosted by ${enhancedSweeps.length} nearby sweep${enhancedSweeps.length > 1 ? 's' : ''}).`
        : 'Distance-scaled proximity to Order Block.',
    },
    {
      id: 'liquiditySweep',
      name: 'Liquidity Sweep',
      score: liquidityScore,
      value: liquidityScore > 0 ? `${liquidityScore}/100` : undefined,
      description: enhancedSweeps.length > 0
        ? `Institutional sweep detection: ${enhancedSweeps.length} active sweep${enhancedSweeps.length > 1 ? 's' : ''} (avg validation ${Math.round(enhancedSweeps.reduce((sum, s) => sum + s.validationScore, 0) / enhancedSweeps.length)}/100).`
        : 'Active liquidity grab (invalidates when price moves >10% away or level is confirmed broken).',
    },
    {
      id: 'divergenceConfluence',
      name: 'Divergence Confluence',
      score: divergenceBonus,
      value: divergenceBonus !== 0 ? `${Math.abs(divergenceBonus)} pts` : undefined,
      description: 'RSI/MACD peak-trough divergence confirming structure reversal.',
    },
    {
      id: 'autoFibConfluence',
      name: 'Auto-Fib Confluence',
      score: autoFibScore,
      value: autoFibScore > 0 ? `${autoFibScore}/100` : undefined,
      description: 'Dynamic fib levels (primary + secondary) with FVG/OB alignment.',
    },
    {
      id: 'smtDivergence',
      name: 'SMT Divergence',
      score: smtScore,
      value: smtScore !== 0 ? `${Math.abs(smtScore)}/100` : undefined,
      description: smtDivergence?.isValid 
        ? `Multi-asset divergence (${smtDivergence.type}) vs ${smtDivergence.correlatedSymbol || 'correlated asset'}`
        : 'Insufficient divergence signal',
    },
  ];

  const { conditions, overallScore, reasoning } = mapWeightedConditions('smart-money', granularConditions);
  return buildEvaluation('smart-money', conditions, overallScore, reasoning);
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
  const { htfBullish, htfBearish, stTrend, latestStructureDirection, macdNow, sigNow } = input;

  const totalHTF = htfBullish + htfBearish;

  const htfBiasScore = totalHTF > 0
    ? normalizeByRange(htfBullish - htfBearish, totalHTF)
    : 0;

  const localTrendScore = scoreBoolean(stTrend === 'bullish', stTrend === 'bearish', 80);
  const structureDirectionScore = scoreBoolean(
    latestStructureDirection === 'bullish',
    latestStructureDirection === 'bearish',
    75,
  );
  const macdMomentumScore =
    macdNow !== undefined && sigNow !== undefined
      ? normalizeByRange(macdNow - sigNow, 0.5)
      : 0;

  const granularConditions: GranularCondition[] = [
    {
      id: 'htfBias',
      name: 'HTF Bias Alignment',
      score: htfBiasScore,
      value: totalHTF > 0 ? `${htfBullish}/${totalHTF} bullish` : undefined,
      description: 'Majority high-timeframe directional bias.',
    },
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
    {
      id: 'macdMomentum',
      name: 'MACD Momentum',
      score: macdMomentumScore,
      description: 'Momentum confirmation from MACD signal spread.',
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

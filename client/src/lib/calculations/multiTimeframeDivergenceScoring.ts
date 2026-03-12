/**
 * Multi-Timeframe Divergence Scoring
 *
 * Computes a cascading divergence score across user-selected timeframes.
 * Higher timeframes are weighted more heavily; divergences that activate in
 * sequence from lower to higher timeframes earn escalating cascade bonuses.
 */

/** All supported timeframe keys in ascending order. */
export type TimeframeKey = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

/** Canonical low-to-high ordering of all timeframe keys. */
export const TIMEFRAME_ORDER: TimeframeKey[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

/**
 * Base weights for each timeframe.
 * 15m is the baseline (1.0); weights increase for higher timeframes.
 */
export const TIMEFRAME_WEIGHTS: Record<TimeframeKey, number> = {
  '1m': 0.6,
  '5m': 0.75,
  '15m': 1.0,
  '30m': 1.15,
  '1h': 1.35,
  '4h': 1.6,
  '1d': 2.0,
};

/** Human-readable labels for display. */
export const TIMEFRAME_LABELS: Record<TimeframeKey, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

export interface MTFBreakdownItem {
  timeframe: TimeframeKey;
  baseScore: number;
  weight: number;
  active: boolean;
}

export interface MultiTimeframeDivergenceResult {
  /** Signed total score in range -100 to +100. Positive = bullish, negative = bearish. */
  totalScore: number;
  /** Timeframes (from the enabled set) that are currently active. */
  activeTimeframes: TimeframeKey[];
  /** Length of the longest consecutive low-to-high activation run (0 = none active). */
  cascadeLevel: number;
  /** Cascade multiplier applied: 1.0, 1.25, 1.5, or 2.0. */
  cascadeBonus: number;
  /** Per-timeframe breakdown for display. */
  breakdown: MTFBreakdownItem[];
}

/**
 * Returns the cascade multiplier for a given number of consecutively active timeframes.
 * - 0 or 1: ×1.0
 * - 2:      ×1.25
 * - 3:      ×1.5
 * - 4+:     ×2.0
 */
export function getCascadeBonus(consecutiveCount: number): number {
  if (consecutiveCount >= 4) return 2.0;
  if (consecutiveCount === 3) return 1.5;
  if (consecutiveCount === 2) return 1.25;
  return 1.0;
}

/**
 * Returns the length of the longest consecutive sequence of active timeframes
 * when the enabled timeframes are sorted from lowest to highest.
 *
 * Example: enabled=['15m','1h','4h'], active=['15m','4h']
 *   → sorted active positions are 0 and 2, not consecutive → returns 1
 *   (longest run: either '15m' alone or '4h' alone = 1)
 *
 * Example: enabled=['15m','1h','4h'], active=['15m','1h','4h']
 *   → sorted positions 0,1,2 are all consecutive → returns 3
 */
export function getLongestCascadeLength(
  enabledTimeframes: TimeframeKey[],
  activeTimeframes: TimeframeKey[],
): number {
  const activeSet = new Set(activeTimeframes);
  // Walk enabled TFs in ascending order (filtered from global order)
  const sorted = TIMEFRAME_ORDER.filter(tf => enabledTimeframes.includes(tf));

  let maxRun = 0;
  let currentRun = 0;
  for (const tf of sorted) {
    if (activeSet.has(tf)) {
      currentRun++;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 0;
    }
  }
  return maxRun;
}

/**
 * Calculates a multi-timeframe divergence score with cascade bonuses.
 *
 * @param enabledTimeframes - Timeframes the user has selected to include in scoring.
 * @param activeTimeframes  - Timeframes where divergence has been confirmed.
 * @param baseScores        - Signed base score (-100..+100) per active timeframe.
 *                            Positive = bullish divergence, negative = bearish.
 * @returns Enriched result including total score, cascade level, and breakdown.
 */
export function calculateMTFDivergenceScore(
  enabledTimeframes: TimeframeKey[],
  activeTimeframes: TimeframeKey[],
  baseScores: Partial<Record<TimeframeKey, number>>,
): MultiTimeframeDivergenceResult {
  const activeSet = new Set(activeTimeframes);
  // Only enabled TFs participate, sorted low→high
  const sortedEnabled = TIMEFRAME_ORDER.filter(tf => enabledTimeframes.includes(tf));

  // Build per-TF breakdown
  const breakdown: MTFBreakdownItem[] = sortedEnabled.map(tf => ({
    timeframe: tf,
    baseScore: baseScores[tf] ?? 0,
    weight: TIMEFRAME_WEIGHTS[tf],
    active: activeSet.has(tf),
  }));

  // Weighted average of active TF scores
  let weightedSum = 0;
  let totalWeight = 0;
  for (const item of breakdown) {
    if (item.active) {
      weightedSum += item.baseScore * item.weight;
      totalWeight += item.weight;
    }
  }
  const averageScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Cascade bonus based on longest consecutive activation run
  const activeTFsInEnabled = activeTimeframes.filter(tf => enabledTimeframes.includes(tf));
  const cascadeLevel = getLongestCascadeLength(enabledTimeframes, activeTFsInEnabled);
  const cascadeBonus = getCascadeBonus(cascadeLevel);

  const totalScore = Math.min(100, Math.max(-100, averageScore * cascadeBonus));

  return {
    totalScore,
    activeTimeframes: activeTFsInEnabled,
    cascadeLevel,
    cascadeBonus,
    breakdown,
  };
}

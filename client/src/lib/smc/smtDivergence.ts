/**
 * @fileoverview SMT (...) Divergence Detection
 * Compares swing pivots between two correlated assets to identify divergences
 */

import type { Pivot } from './pivots';
import { getRecentHighs, getRecentLows } from './pivots';

export interface SMTDivergenceResult {
  type: 'bullish' | 'bearish' | null;
  score: number; // 0-100
  confidence: number; // 0-100 based on time proximity and pivot quality
  details: string;
  correlatedSymbol?: string; // Symbol used for correlation
  mainHighChange?: number; // % change main asset recent highs
  corrHighChange?: number; // % change correlated asset recent highs
  mainLowChange?: number; // % change main asset recent lows
  corrLowChange?: number; // % change correlated asset recent lows
  timeSyncScore?: number; // 0-100, higher if pivots are time-aligned
  isValid: boolean; // Whether divergence passes validation
  invalidationReason?: string; // Why divergence is invalid if not valid
}

/**
 * Detect SMT divergence by comparing pivots of main and correlated assets
 * 
 * Bullish SMT: Main asset makes higher low (strength) while correlated asset makes lower low (weakness)
 * Bearish SMT: Main asset makes lower high (weakness) while correlated asset makes higher high (strength)
 * 
 * @param mainPivots - Pivots from main asset
 * @param corrPivots - Pivots from correlated asset
 * @param maxTimeGap - Maximum candle gap between pivots to consider synchronized (default 3)
 * @returns SMTDivergenceResult with type, score, and validation
 */
export function detectSMTDivergence(
  mainPivots: Pivot[],
  corrPivots: Pivot[],
  maxTimeGap: number = 3,
): SMTDivergenceResult {
  // Get recent highs and lows
  const mainHighs = getRecentHighs(mainPivots, 2);
  const corrHighs = getRecentHighs(corrPivots, 2);
  const mainLows = getRecentLows(mainPivots, 2);
  const corrLows = getRecentLows(corrPivots, 2);

  // Check minimum data requirements
  if (
    mainHighs.length < 2 ||
    corrHighs.length < 2 ||
    mainLows.length < 2 ||
    corrLows.length < 2
  ) {
    return {
      type: null,
      score: 0,
      confidence: 0,
      details: 'Insufficient pivots for divergence detection',
      isValid: false,
      invalidationReason: 'Need at least 2 recent highs and 2 recent lows',
    };
  }

  // Calculate pivot changes
  const mainHighChange =
    ((mainHighs[1].value - mainHighs[0].value) / mainHighs[0].value) * 100;
  const corrHighChange =
    ((corrHighs[1].value - corrHighs[0].value) / corrHighs[0].value) * 100;
  const mainLowChange =
    ((mainLows[1].value - mainLows[0].value) / mainLows[0].value) * 100;
  const corrLowChange =
    ((corrLows[1].value - corrLows[0].value) / corrLows[0].value) * 100;

  let divergenceType: 'bullish' | 'bearish' | null = null;
  let baseScore = 0;
  let validationPassed = true;
  let invalidationReason: string | undefined;

  // Detect BEARISH divergence: Main LH (lower high), Corr HH (higher high)
  if (mainHighChange < 0 && corrHighChange > 0) {
    divergenceType = 'bearish';
    // Score based on strength of mismatch
    const mismatchStrength = Math.abs(mainHighChange - corrHighChange);
    baseScore = 50 + Math.min(50, mismatchStrength / 2); // 50-100
  }
  // Detect BULLISH divergence: Main HL (higher low), Corr LL (lower low)
  else if (mainLowChange > 0 && corrLowChange < 0) {
    divergenceType = 'bullish';
    // Score based on strength of mismatch
    const mismatchStrength = Math.abs(mainLowChange - corrLowChange);
    baseScore = 50 + Math.min(50, mismatchStrength / 2); // 50-100
  } else {
    return {
      type: null,
      score: 0,
      confidence: 0,
      details: 'No clear divergence pattern detected',
      isValid: false,
      mainHighChange,
      corrHighChange,
      mainLowChange,
      corrLowChange,
    };
  }

  // Filter by time proximity (indexes should be close - within maxTimeGap)
  const timeGapHighs = Math.abs(mainHighs[1].index - corrHighs[1].index);
  const timeGapLows = Math.abs(mainLows[1].index - corrLows[1].index);
  const relevantGap =
    divergenceType === 'bearish' ? timeGapHighs : timeGapLows;

  if (relevantGap > maxTimeGap) {
    validationPassed = false;
    invalidationReason = `Pivots too far apart (${relevantGap} candles, max ${maxTimeGap})`;
  }

  // Calculate time sync score (higher if pivots are very close)
  const timeSyncScore = Math.max(0, 100 - (relevantGap / maxTimeGap) * 50);

  // Final score incorporates both strength and time sync
  const finalScore = Math.round((baseScore * 0.7 + timeSyncScore * 0.3) * (validationPassed ? 1 : 0.5));

  return {
    type: validationPassed ? divergenceType : null,
    score: finalScore,
    confidence: validationPassed ? timeSyncScore : Math.max(0, timeSyncScore - 30),
    details: validationPassed
      ? `${divergenceType === 'bullish' ? 'Bullish' : 'Bearish'} SMT divergence (${finalScore}/100)`
      : `Potential ${divergenceType} divergence but invalid: ${invalidationReason}`,
    mainHighChange,
    corrHighChange,
    mainLowChange,
    corrLowChange,
    timeSyncScore,
    isValid: validationPassed && finalScore >= 40, // Minimum 40 score threshold
    invalidationReason: !validationPassed ? invalidationReason : undefined,
  };
}

/**
 * Check if a divergence has been invalidated by price action
 * 
 * Bullish divergence invalidates if main lower low is broken
 * Bearish divergence invalidates if main lower high is broken
 * 
 * @param divergence - Current divergence
 * @param currentPrice - Current price
 * @param mainLows - Recent swing lows from main asset
 * @param mainHighs - Recent swing highs from main asset
 * @returns True if divergence is no longer valid
 */
export function isSmtDivergenceInvalidated(
  divergence: SMTDivergenceResult,
  currentPrice: number,
  mainLows: Pivot[],
  mainHighs: Pivot[],
): boolean {
  if (!divergence.isValid || !divergence.type) {
    return false;
  }

  if (divergence.type === 'bullish') {
    // Bullish divergence invalidates if price breaks below the recent low
    if (mainLows.length >= 2) {
      const recentLow = mainLows[mainLows.length - 1];
      if (currentPrice < recentLow.value) {
        return true;
      }
    }
  } else if (divergence.type === 'bearish') {
    // Bearish divergence invalidates if price breaks above the recent high
    if (mainHighs.length >= 2) {
      const recentHigh = mainHighs[mainHighs.length - 1];
      if (currentPrice > recentHigh.value) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Score SMT divergence strength for use in trading system scoring
 * Returns -100 (strong bearish) to +100 (strong bullish)
 * 
 * @param divergence - SMT divergence result
 * @returns Signed score (-100 to +100)
 */
export function scoreSmtDivergenceStrength(
  divergence: SMTDivergenceResult,
): number {
  if (!divergence.isValid || !divergence.type) {
    return 0;
  }

  // Combine score and confidence
  const weightedScore = (divergence.score / 100) * divergence.confidence / 100;

  if (divergence.type === 'bullish') {
    return Math.round(weightedScore * 100);
  } else {
    return Math.round(weightedScore * -100);
  }
}

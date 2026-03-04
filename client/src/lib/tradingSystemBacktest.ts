/**
 * Trend State Analysis and Reversal Detection for MSS/BOS Trend Confirmation.
 *
 * Analyzes structure breaks (MSS/BOS) in a visible viewport window to determine
 * the current trend direction and detect early trend reversals.
 */

import type { StructureBreak } from '@/types/structureBreak';

export interface TrendState {
  current: 'bullish' | 'bearish' | 'neutral';
  /** breakIndex of the first MSS that confirmed the trend, or the viewport start */
  confirmedAt: number;
  mssCount: { bullish: number; bearish: number };
  bosCount: { bullish: number; bearish: number };
  previousTrend?: 'bullish' | 'bearish';
  reversalWarning: boolean;
  reversalConfirmed: boolean;
}

export interface ReversalInfo {
  status: 'confirmed' | 'warning' | 'neutral';
  message: string;
  scoreAdjustment: { bullish: number; bearish: number };
}

/**
 * Returns true when the direction has sufficient MSS/BOS to be considered
 * a confirmed trend.
 */
function isTrendConfirmed(mssCount: number, bosCount: number): boolean {
  return mssCount >= 2 || (mssCount >= 1 && bosCount >= 2);
}

/**
 * Analyze the current trend state from structure breaks within the given time
 * window.  When `startTime` / `endTime` are omitted all breaks are included.
 *
 * Confirmation rules (mirror the problem spec):
 *   • 2+ MSS in same direction, OR
 *   • 1 MSS + 2+ BOS in same direction
 *
 * The dominant direction (most confirming MSS) becomes `current`.  When both
 * directions are confirmed the one with more MSS wins; ties go to bullish.
 */
export function analyzeTrendState(
  structureBreaks: StructureBreak[],
  startTime?: number,
  endTime?: number,
): TrendState {
  const filtered =
    startTime !== undefined && endTime !== undefined
      ? structureBreaks.filter(
          sb => sb.breakTime >= startTime && sb.breakTime <= endTime,
        )
      : structureBreaks;

  const bullishMSS = filtered.filter(sb => sb.type === 'mss' && sb.direction === 'bullish').length;
  const bearishMSS = filtered.filter(sb => sb.type === 'mss' && sb.direction === 'bearish').length;
  const bullishBOS = filtered.filter(sb => sb.type === 'bos' && sb.direction === 'bullish').length;
  const bearishBOS = filtered.filter(sb => sb.type === 'bos' && sb.direction === 'bearish').length;

  const isBullishConfirmed = isTrendConfirmed(bullishMSS, bullishBOS);
  const isBearishConfirmed = isTrendConfirmed(bearishMSS, bearishBOS);

  let current: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (isBullishConfirmed && !isBearishConfirmed) {
    current = 'bullish';
  } else if (isBearishConfirmed && !isBullishConfirmed) {
    current = 'bearish';
  } else if (isBullishConfirmed && isBearishConfirmed) {
    // Both confirmed – dominant (more MSS) wins; ties go to bullish
    current = bullishMSS >= bearishMSS ? 'bullish' : 'bearish';
  }

  // Index at which the trend was first confirmed
  const firstBullishMSS = filtered.find(sb => sb.type === 'mss' && sb.direction === 'bullish');
  const firstBearishMSS = filtered.find(sb => sb.type === 'mss' && sb.direction === 'bearish');
  const confirmedAt =
    current === 'bullish'
      ? (firstBullishMSS?.breakIndex ?? 0)
      : current === 'bearish'
        ? (firstBearishMSS?.breakIndex ?? 0)
        : 0;

  // A confirmed bullish trend with ANY bearish MSS = warning / confirmed reversal
  // Track whether each direction has an active confirmed trend
  const isBullishActive = current === 'bullish' && isBullishConfirmed;
  const isBearishActive = current === 'bearish' && isBearishConfirmed;

  const reversalWarning =
    (isBullishActive && bearishMSS >= 1) ||
    (isBearishActive && bullishMSS >= 1);

  const reversalConfirmed =
    (isBullishActive && isTrendConfirmed(bearishMSS, bearishBOS)) ||
    (isBearishActive && isTrendConfirmed(bullishMSS, bullishBOS));

  return {
    current,
    confirmedAt,
    mssCount: { bullish: bullishMSS, bearish: bearishMSS },
    bosCount: { bullish: bullishBOS, bearish: bearishBOS },
    reversalWarning,
    reversalConfirmed,
  };
}

/**
 * Detect whether the established trend is under threat of reversal.
 *
 * Stage 1 – Warning:  confirmed trend + 1 counter-direction MSS
 * Stage 2 – Confirmed: confirmed trend + 2 counter-direction MSS
 *                       (or 1 counter MSS + 2 counter BOS)
 */
export function detectTrendReversal(trendState: TrendState): ReversalInfo {
  const { current, mssCount, bosCount } = trendState;

  const isBullishActive = current === 'bullish' && isTrendConfirmed(mssCount.bullish, bosCount.bullish);
  const isBearishActive = current === 'bearish' && isTrendConfirmed(mssCount.bearish, bosCount.bearish);

  if (isBullishActive && mssCount.bearish >= 1) {
    if (isTrendConfirmed(mssCount.bearish, bosCount.bearish)) {
      return {
        status: 'confirmed',
        message: `🔄 TREND REVERSED\nPrevious: Bullish (${mssCount.bullish} MSS↑)\nNow: Bearish (${mssCount.bearish} MSS↓)`,
        scoreAdjustment: { bullish: -25, bearish: +15 },
      };
    }
    return {
      status: 'warning',
      message: `⚠️ TREND REVERSAL WARNING\nPrevious: Bullish (${mssCount.bullish} MSS↑, ${bosCount.bullish} BOS↑)\nCounter: ${mssCount.bearish} MSS↓ detected`,
      scoreAdjustment: { bullish: -20, bearish: +10 },
    };
  }

  if (isBearishActive && mssCount.bullish >= 1) {
    if (isTrendConfirmed(mssCount.bullish, bosCount.bullish)) {
      return {
        status: 'confirmed',
        message: `🔄 TREND REVERSED\nPrevious: Bearish (${mssCount.bearish} MSS↓)\nNow: Bullish (${mssCount.bullish} MSS↑)`,
        scoreAdjustment: { bullish: +15, bearish: -25 },
      };
    }
    return {
      status: 'warning',
      message: `⚠️ TREND REVERSAL WARNING\nPrevious: Bearish (${mssCount.bearish} MSS↓, ${bosCount.bearish} BOS↓)\nCounter: ${mssCount.bullish} MSS↑ detected`,
      scoreAdjustment: { bullish: +10, bearish: -20 },
    };
  }

  return {
    status: 'neutral',
    message: '',
    scoreAdjustment: { bullish: 0, bearish: 0 },
  };
}

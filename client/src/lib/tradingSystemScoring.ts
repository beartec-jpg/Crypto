/**
 * Graduated scoring functions for all 8 trading systems.
 *
 * Each function returns a SystemEvaluation with a continuous score in the
 * range -100 (strong bearish) to +100 (strong bullish), a confidence
 * metric (0-100), and a list of individual scored conditions.
 */

import type { DivergencePoint } from '@/types/chart.types';
import type {
  SystemEvaluation,
  ScoredCondition,
  SignalLabel,
} from '@/types/systemScoring';

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

/** Clamp a value to [-100, 100]. */
function clamp(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

/** Build the final SystemEvaluation from accumulated conditions. */
function buildEvaluation(
  systemId: string,
  conditions: ScoredCondition[],
  rawScore: number,
): SystemEvaluation {
  const score = clamp(rawScore);
  const { label, color } = getSignalLabel(score);

  // Confidence: proportion of max possible absolute score that was achieved
  const maxPossible = conditions.reduce((acc, c) => acc + Math.abs(c.weight), 0);
  const confidence = maxPossible > 0
    ? Math.round((Math.abs(rawScore) / maxPossible) * 100)
    : 0;

  return {
    systemId,
    score,
    confidence: Math.min(100, confidence),
    conditions,
    signalLabel: label,
    signalColor: color,
  };
}

// ── Shared input type ─────────────────────────────────────────────────────────

export interface ScoringInput {
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

  let score = 0;
  const conditions: ScoredCondition[] = [];

  // SuperTrend direction (±35)
  if (stTrend === 'bullish') {
    score += 35;
    conditions.push({ name: 'SuperTrend bullish', met: true, weight: 35 });
  } else if (stTrend === 'bearish') {
    score -= 35;
    conditions.push({ name: 'SuperTrend bearish', met: true, weight: -35 });
  } else {
    conditions.push({ name: 'SuperTrend direction', met: false, weight: 35 });
  }

  // MACD above/below signal line (±25)
  if (macdNow !== undefined && sigNow !== undefined) {
    if (macdNow > sigNow) {
      score += 25;
      conditions.push({ name: 'MACD above signal', met: true, weight: 25 });
    } else if (macdNow < sigNow) {
      score -= 25;
      conditions.push({ name: 'MACD below signal', met: true, weight: -25 });
    } else {
      conditions.push({ name: 'MACD vs signal', met: false, weight: 25 });
    }
  }

  // MACD crossover (±20)
  const macdBullCross =
    macdPrev !== undefined && sigPrev !== undefined &&
    macdNow !== undefined && sigNow !== undefined &&
    macdPrev <= sigPrev && macdNow > sigNow;
  const macdBearCross =
    macdPrev !== undefined && sigPrev !== undefined &&
    macdNow !== undefined && sigNow !== undefined &&
    macdPrev >= sigPrev && macdNow < sigNow;

  if (macdBullCross) {
    score += 20;
    conditions.push({ name: 'MACD bullish crossover', met: true, weight: 20 });
  } else if (macdBearCross) {
    score -= 20;
    conditions.push({ name: 'MACD bearish crossover', met: true, weight: -20 });
  } else {
    conditions.push({ name: 'MACD crossover', met: false, weight: 20 });
  }

  // RSI momentum confirmation (±10)
  if (lastRsi !== undefined) {
    if (lastRsi > 55) {
      score += 10;
      conditions.push({ name: 'RSI bullish momentum', met: true, weight: 10, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi < 45) {
      score -= 10;
      conditions.push({ name: 'RSI bearish momentum', met: true, weight: -10, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else {
      conditions.push({ name: 'RSI momentum', met: false, weight: 10, value: `RSI: ${lastRsi.toFixed(1)}` });
    }
  }

  // Price follow-through (±10)
  if (latestClose > previousClose) {
    score += 10;
    conditions.push({ name: 'Bullish candle', met: true, weight: 10 });
  } else if (latestClose < previousClose) {
    score -= 10;
    conditions.push({ name: 'Bearish candle', met: true, weight: -10 });
  }

  return buildEvaluation('trend-following', conditions, score);
}

// ── 2. Mean Reversion Hunter ──────────────────────────────────────────────────

export function scoreMeanReversion(input: ScoringInput): SystemEvaluation {
  const { lastRsi, prevRsi, latestClose, previousClose } = input;

  let score = 0;
  const conditions: ScoredCondition[] = [];

  // RSI extreme oversold/overbought (±40)
  if (lastRsi !== undefined) {
    if (lastRsi <= 25) {
      score += 40;
      conditions.push({ name: 'RSI extreme oversold', met: true, weight: 40, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi <= 30) {
      score += 30;
      conditions.push({ name: 'RSI oversold', met: true, weight: 30, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi <= 40) {
      score += 15;
      conditions.push({ name: 'RSI approaching oversold', met: true, weight: 15, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi >= 75) {
      score -= 40;
      conditions.push({ name: 'RSI extreme overbought', met: true, weight: -40, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi >= 70) {
      score -= 30;
      conditions.push({ name: 'RSI overbought', met: true, weight: -30, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi >= 60) {
      score -= 15;
      conditions.push({ name: 'RSI approaching overbought', met: true, weight: -15, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else {
      conditions.push({ name: 'RSI level', met: false, weight: 40, value: `RSI: ${lastRsi.toFixed(1)}` });
    }
  }

  // Bounce/rejection confirmation (±30)
  if (lastRsi !== undefined && lastRsi <= 35 && latestClose > previousClose) {
    score += 30;
    conditions.push({ name: 'Oversold bounce confirmed', met: true, weight: 30 });
  } else if (lastRsi !== undefined && lastRsi >= 65 && latestClose < previousClose) {
    score -= 30;
    conditions.push({ name: 'Overbought rejection confirmed', met: true, weight: -30 });
  } else {
    conditions.push({ name: 'Bounce/rejection confirmation', met: false, weight: 30 });
  }

  // RSI turning (±20)
  if (prevRsi !== undefined && lastRsi !== undefined) {
    if (prevRsi < 40 && lastRsi > prevRsi) {
      score += 20;
      conditions.push({ name: 'RSI turning up from low', met: true, weight: 20 });
    } else if (prevRsi > 60 && lastRsi < prevRsi) {
      score -= 20;
      conditions.push({ name: 'RSI turning down from high', met: true, weight: -20 });
    } else {
      conditions.push({ name: 'RSI momentum turn', met: false, weight: 20 });
    }
  }

  // Price follow-through (±10)
  if (latestClose > previousClose) {
    score += 5;
    conditions.push({ name: 'Bullish close', met: true, weight: 5 });
  } else if (latestClose < previousClose) {
    score -= 5;
    conditions.push({ name: 'Bearish close', met: true, weight: -5 });
  }

  return buildEvaluation('mean-reversion', conditions, score);
}

// ── 3. Breakout Momentum ──────────────────────────────────────────────────────

export function scoreBreakoutMomentum(input: ScoringInput): SystemEvaluation {
  const { latestStructureDirection, sqzOff, sqzValue, macdNow, sigNow, latestClose, previousClose } = input;

  let score = 0;
  const conditions: ScoredCondition[] = [];

  // Structure break direction (±35)
  if (latestStructureDirection === 'bullish') {
    score += 35;
    conditions.push({ name: 'Bullish BOS/CHoCH', met: true, weight: 35 });
  } else if (latestStructureDirection === 'bearish') {
    score -= 35;
    conditions.push({ name: 'Bearish BOS/CHoCH', met: true, weight: -35 });
  } else {
    conditions.push({ name: 'Structure break', met: false, weight: 35 });
  }

  // Squeeze release (±35)
  if (sqzOff) {
    const val = sqzValue ?? 0;
    if (val > 0) {
      score += 35;
      conditions.push({ name: 'Squeeze released upward', met: true, weight: 35 });
    } else if (val < 0) {
      score -= 35;
      conditions.push({ name: 'Squeeze released downward', met: true, weight: -35 });
    } else {
      conditions.push({ name: 'Squeeze release direction', met: false, weight: 35 });
    }
  } else {
    conditions.push({ name: 'Squeeze release', met: false, weight: 35 });
  }

  // MACD momentum (±20)
  if (macdNow !== undefined && sigNow !== undefined) {
    if (macdNow > sigNow) {
      score += 20;
      conditions.push({ name: 'MACD momentum bullish', met: true, weight: 20 });
    } else {
      score -= 20;
      conditions.push({ name: 'MACD momentum bearish', met: true, weight: -20 });
    }
  }

  // Price follow-through (±10)
  if (latestClose > previousClose) {
    score += 10;
    conditions.push({ name: 'Bullish follow-through', met: true, weight: 10 });
  } else if (latestClose < previousClose) {
    score -= 10;
    conditions.push({ name: 'Bearish follow-through', met: true, weight: -10 });
  }

  return buildEvaluation('breakout-momentum', conditions, score);
}

// ── 4. Smart Money Tracker ────────────────────────────────────────────────────

export function scoreSmartMoney(input: ScoringInput): SystemEvaluation {
  const { latestStructureDirection, stTrend, lastRsi, latestClose, previousClose } = input;

  let score = 0;
  const conditions: ScoredCondition[] = [];

  // SMC structure shift (±35)
  if (latestStructureDirection === 'bullish') {
    score += 35;
    conditions.push({ name: 'SMC bullish structure shift', met: true, weight: 35 });
  } else if (latestStructureDirection === 'bearish') {
    score -= 35;
    conditions.push({ name: 'SMC bearish structure shift', met: true, weight: -35 });
  } else {
    conditions.push({ name: 'SMC structure shift', met: false, weight: 35 });
  }

  // Trend alignment (±20)
  if (latestStructureDirection === 'bullish' && stTrend === 'bullish') {
    score += 20;
    conditions.push({ name: 'Trend aligned bullish', met: true, weight: 20 });
  } else if (latestStructureDirection === 'bearish' && stTrend === 'bearish') {
    score -= 20;
    conditions.push({ name: 'Trend aligned bearish', met: true, weight: -20 });
  } else {
    conditions.push({ name: 'Trend alignment', met: false, weight: 20 });
  }

  // Follow-through candle (±20)
  if (latestStructureDirection === 'bullish' && latestClose > previousClose) {
    score += 20;
    conditions.push({ name: 'Follow-through bullish candle', met: true, weight: 20 });
  } else if (latestStructureDirection === 'bearish' && latestClose < previousClose) {
    score -= 20;
    conditions.push({ name: 'Follow-through bearish candle', met: true, weight: -20 });
  } else {
    conditions.push({ name: 'Follow-through candle', met: false, weight: 20 });
  }

  // RSI momentum (±15)
  if (lastRsi !== undefined) {
    if (lastRsi > 52) {
      score += 15;
      conditions.push({ name: 'Bullish momentum (RSI)', met: true, weight: 15, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi < 48) {
      score -= 15;
      conditions.push({ name: 'Bearish momentum (RSI)', met: true, weight: -15, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else {
      conditions.push({ name: 'RSI momentum', met: false, weight: 15, value: `RSI: ${lastRsi.toFixed(1)}` });
    }
  }

  // SuperTrend (±10)
  if (stTrend === 'bullish') {
    score += 10;
    conditions.push({ name: 'SuperTrend bullish', met: true, weight: 10 });
  } else if (stTrend === 'bearish') {
    score -= 10;
    conditions.push({ name: 'SuperTrend bearish', met: true, weight: -10 });
  } else {
    conditions.push({ name: 'SuperTrend', met: false, weight: 10 });
  }

  return buildEvaluation('smart-money', conditions, score);
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

  let score = 0;
  const conditions: ScoredCondition[] = [];

  // MACD crossover (±30)
  const macdBullCross =
    macdPrev !== undefined && sigPrev !== undefined &&
    macdNow !== undefined && sigNow !== undefined &&
    macdPrev <= sigPrev && macdNow > sigNow;
  const macdBearCross =
    macdPrev !== undefined && sigPrev !== undefined &&
    macdNow !== undefined && sigNow !== undefined &&
    macdPrev >= sigPrev && macdNow < sigNow;

  if (macdBullCross) {
    score += 30;
    conditions.push({ name: 'MACD bullish crossover', met: true, weight: 30 });
  } else if (macdBearCross) {
    score -= 30;
    conditions.push({ name: 'MACD bearish crossover', met: true, weight: -30 });
  } else {
    conditions.push({ name: 'MACD crossover', met: false, weight: 30 });
  }

  // MACD histogram expanding (±25)
  if (macdHistogram !== undefined && prevMacdHistogram !== undefined) {
    if (macdHistogram > 0 && macdHistogram > prevMacdHistogram) {
      score += 25;
      conditions.push({ name: 'MACD histogram expanding up', met: true, weight: 25 });
    } else if (macdHistogram < 0 && macdHistogram < prevMacdHistogram) {
      score -= 25;
      conditions.push({ name: 'MACD histogram expanding down', met: true, weight: -25 });
    } else {
      conditions.push({ name: 'MACD histogram expansion', met: false, weight: 25 });
    }
  }

  // Trend alignment (±25)
  if (stTrend === 'bullish') {
    score += 25;
    conditions.push({ name: 'Trend bullish', met: true, weight: 25 });
  } else if (stTrend === 'bearish') {
    score -= 25;
    conditions.push({ name: 'Trend bearish', met: true, weight: -25 });
  } else {
    conditions.push({ name: 'Trend direction', met: false, weight: 25 });
  }

  // MACD zero-line (±10)
  if (macdNow !== undefined) {
    if (macdNow > 0) {
      score += 10;
      conditions.push({ name: 'MACD above zero', met: true, weight: 10 });
    } else if (macdNow < 0) {
      score -= 10;
      conditions.push({ name: 'MACD below zero', met: true, weight: -10 });
    } else {
      conditions.push({ name: 'MACD zero line', met: false, weight: 10 });
    }
  }

  // Price follow-through (±10)
  if (latestClose > previousClose) {
    score += 10;
    conditions.push({ name: 'Bullish price action', met: true, weight: 10 });
  } else if (latestClose < previousClose) {
    score -= 10;
    conditions.push({ name: 'Bearish price action', met: true, weight: -10 });
  }

  return buildEvaluation('momentum-scalper', conditions, score);
}

// ── 6. Divergence Master ─────────────────────────────────────────────────────

/** Lookback period in candles for divergence detection (last N divergence points are considered). */
const DIVERGENCE_LOOKBACK_BARS = 20;

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

  let score = 0;
  const conditions: ScoredCondition[] = [];

  // ── Actual divergence detection from divergencePoints ──────────────────────
  // Use the most recent DIVERGENCE_LOOKBACK_BARS points, optionally filtered by currentTime.
  const recentSlice = divergencePoints.slice(-DIVERGENCE_LOOKBACK_BARS);
  const recentPoints = currentTime !== undefined
    ? recentSlice.filter(d => d.time <= currentTime)
    : recentSlice;

  const recentBullish = recentPoints.filter(d => d.type === 'bullish');
  const recentBearish = recentPoints.filter(d => d.type === 'bearish');

  // Strong bullish divergence (count >= 3 oscillators confirming): +40
  const strongBullish = recentBullish.find(d => d.count >= 3);
  if (strongBullish) {
    score += 40;
    conditions.push({
      name: `Strong bullish divergence (${strongBullish.count} oscillators)`,
      met: true,
      weight: 40,
      value: strongBullish.indicators.slice(0, 3).join(', '),
    });
  } else {
    // Weak bullish divergence (count >= 1): +25
    const weakBullish = recentBullish.find(d => d.count >= 1);
    if (weakBullish) {
      score += 25;
      conditions.push({
        name: `Bullish divergence (${weakBullish.count} oscillator${weakBullish.count > 1 ? 's' : ''})`,
        met: true,
        weight: 25,
        value: weakBullish.indicators.slice(0, 3).join(', '),
      });
    } else {
      conditions.push({ name: 'Bullish divergence detected', met: false, weight: 40 });
    }
  }

  // Strong bearish divergence (count >= 3): -40
  const strongBearish = recentBearish.find(d => d.count >= 3);
  if (strongBearish) {
    score -= 40;
    conditions.push({
      name: `Strong bearish divergence (${strongBearish.count} oscillators)`,
      met: true,
      weight: -40,
      value: strongBearish.indicators.slice(0, 3).join(', '),
    });
  } else {
    const weakBearish = recentBearish.find(d => d.count >= 1);
    if (weakBearish) {
      score -= 25;
      conditions.push({
        name: `Bearish divergence (${weakBearish.count} oscillator${weakBearish.count > 1 ? 's' : ''})`,
        met: true,
        weight: -25,
        value: weakBearish.indicators.slice(0, 3).join(', '),
      });
    } else {
      conditions.push({ name: 'Bearish divergence detected', met: false, weight: -40 });
    }
  }

  // RSI level confirmation (±20)
  if (lastRsi !== undefined) {
    if (lastRsi < 30) {
      score += 20;
      conditions.push({ name: 'RSI oversold', met: true, weight: 20, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi < 40) {
      score += 10;
      conditions.push({ name: 'RSI weak/discount', met: true, weight: 10, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi > 70) {
      score -= 20;
      conditions.push({ name: 'RSI overbought', met: true, weight: -20, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi > 60) {
      score -= 10;
      conditions.push({ name: 'RSI premium zone', met: true, weight: -10, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else {
      conditions.push({ name: 'RSI level', met: false, weight: 20, value: `RSI: ${lastRsi.toFixed(1)}` });
    }
  }

  // RSI turning direction (±15)
  if (prevRsi !== undefined && lastRsi !== undefined) {
    if (prevRsi < 40 && lastRsi > prevRsi) {
      score += 15;
      conditions.push({ name: 'RSI turning up from low', met: true, weight: 15 });
    } else if (prevRsi > 60 && lastRsi < prevRsi) {
      score -= 15;
      conditions.push({ name: 'RSI turning down from high', met: true, weight: -15 });
    } else {
      conditions.push({ name: 'RSI momentum turn', met: false, weight: 15 });
    }
  }

  // MACD histogram turning (±15)
  if (macdHistogram !== undefined && prevMacdHistogram !== undefined) {
    if (macdHistogram > 0 && macdHistogram > prevMacdHistogram) {
      score += 15;
      conditions.push({ name: 'MACD turning up', met: true, weight: 15 });
    } else if (macdHistogram < 0 && macdHistogram < prevMacdHistogram) {
      score -= 15;
      conditions.push({ name: 'MACD turning down', met: true, weight: -15 });
    } else {
      conditions.push({ name: 'MACD histogram direction', met: false, weight: 15 });
    }
  } else {
    // Fallback: use MACD crossover when histogram not available
    const macdBullCross =
      macdPrev !== undefined && sigPrev !== undefined &&
      macdNow !== undefined && sigNow !== undefined &&
      macdPrev <= sigPrev && macdNow > sigNow;
    const macdBearCross =
      macdPrev !== undefined && sigPrev !== undefined &&
      macdNow !== undefined && sigNow !== undefined &&
      macdPrev >= sigPrev && macdNow < sigNow;
    if (macdBullCross) {
      score += 15;
      conditions.push({ name: 'MACD bullish crossover', met: true, weight: 15 });
    } else if (macdBearCross) {
      score -= 15;
      conditions.push({ name: 'MACD bearish crossover', met: true, weight: -15 });
    } else {
      conditions.push({ name: 'MACD crossover', met: false, weight: 15 });
    }
  }

  return buildEvaluation('divergence-master', conditions, score);
}

// ── 7. Multi-Timeframe Confluence ─────────────────────────────────────────────

export function scoreMTFConfluence(input: ScoringInput): SystemEvaluation {
  const { htfBullish, htfBearish, stTrend, latestStructureDirection, macdNow, sigNow } = input;

  let score = 0;
  const conditions: ScoredCondition[] = [];

  const totalHTF = htfBullish + htfBearish;

  // HTF bias (±40)
  if (htfBullish >= 2) {
    const strength = totalHTF > 0 ? htfBullish / totalHTF : 0;
    const pts = Math.round(strength * 40);
    score += pts;
    conditions.push({ name: `HTF mostly bullish (${htfBullish} TF)`, met: true, weight: 40, value: `${htfBullish}/${totalHTF}` });
  } else if (htfBearish >= 2) {
    const strength = totalHTF > 0 ? htfBearish / totalHTF : 0;
    const pts = Math.round(strength * 40);
    score -= pts;
    conditions.push({ name: `HTF mostly bearish (${htfBearish} TF)`, met: true, weight: -40, value: `${htfBearish}/${totalHTF}` });
  } else {
    conditions.push({ name: 'HTF bias alignment', met: false, weight: 40 });
  }

  // Local SuperTrend (±25)
  if (stTrend === 'bullish') {
    score += 25;
    conditions.push({ name: 'Local trend bullish', met: true, weight: 25 });
  } else if (stTrend === 'bearish') {
    score -= 25;
    conditions.push({ name: 'Local trend bearish', met: true, weight: -25 });
  } else {
    conditions.push({ name: 'Local trend', met: false, weight: 25 });
  }

  // Structure direction (±20)
  if (latestStructureDirection === 'bullish') {
    score += 20;
    conditions.push({ name: 'Structure bullish', met: true, weight: 20 });
  } else if (latestStructureDirection === 'bearish') {
    score -= 20;
    conditions.push({ name: 'Structure bearish', met: true, weight: -20 });
  } else {
    conditions.push({ name: 'Structure direction', met: false, weight: 20 });
  }

  // MACD momentum (±15)
  if (macdNow !== undefined && sigNow !== undefined) {
    if (macdNow > sigNow) {
      score += 15;
      conditions.push({ name: 'MACD momentum bullish', met: true, weight: 15 });
    } else {
      score -= 15;
      conditions.push({ name: 'MACD momentum bearish', met: true, weight: -15 });
    }
  }

  return buildEvaluation('mtf-confluence', conditions, score);
}

// ── 8. Volume Profile Master ──────────────────────────────────────────────────

export function scoreVolumeProfile(input: ScoringInput): SystemEvaluation {
  const { lastRsi, prevRsi, latestClose, previousClose, macdNow, sigNow } = input;

  let score = 0;
  const conditions: ScoredCondition[] = [];

  // RSI midpoint cross (±35)
  if (prevRsi !== undefined && lastRsi !== undefined) {
    if (prevRsi <= 50 && lastRsi > 50) {
      score += 35;
      conditions.push({ name: 'RSI crossed above midpoint', met: true, weight: 35 });
    } else if (prevRsi >= 50 && lastRsi < 50) {
      score -= 35;
      conditions.push({ name: 'RSI crossed below midpoint', met: true, weight: -35 });
    } else if (lastRsi > 50) {
      score += 15;
      conditions.push({ name: 'RSI above midpoint', met: true, weight: 15, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else if (lastRsi < 50) {
      score -= 15;
      conditions.push({ name: 'RSI below midpoint', met: true, weight: -15, value: `RSI: ${lastRsi.toFixed(1)}` });
    } else {
      conditions.push({ name: 'RSI midpoint', met: false, weight: 35 });
    }
  }

  // Price action follow-through (±25)
  if (latestClose > previousClose) {
    score += 25;
    conditions.push({ name: 'Bullish candle follow-through', met: true, weight: 25 });
  } else if (latestClose < previousClose) {
    score -= 25;
    conditions.push({ name: 'Bearish candle follow-through', met: true, weight: -25 });
  }

  // Discount/premium zone confirmation (±25)
  if (lastRsi !== undefined && lastRsi <= 40 && latestClose > previousClose) {
    score += 25;
    conditions.push({ name: 'Discount zone rebound', met: true, weight: 25 });
  } else if (lastRsi !== undefined && lastRsi >= 60 && latestClose < previousClose) {
    score -= 25;
    conditions.push({ name: 'Premium zone rejection', met: true, weight: -25 });
  } else {
    conditions.push({ name: 'Zone bounce confirmation', met: false, weight: 25 });
  }

  // MACD confirmation (±15)
  if (macdNow !== undefined && sigNow !== undefined) {
    if (macdNow > sigNow) {
      score += 15;
      conditions.push({ name: 'MACD bullish', met: true, weight: 15 });
    } else {
      score -= 15;
      conditions.push({ name: 'MACD bearish', met: true, weight: -15 });
    }
  }

  return buildEvaluation('volume-profile', conditions, score);
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

export type ConditionScore = number;

export interface ScorableDivergencePoint {
  type: string;
  timestamp?: number;
  time?: number;
}

function clampConditionScore(value: number): ConditionScore {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

/**
 * Score RSI from -100 (extremely overbought) to +100 (extremely oversold)
 */
export function scoreRSI(rsi: number): ConditionScore {
  if (rsi <= 20) return 100;
  if (rsi <= 25) return 85;
  if (rsi <= 30) return 70;
  if (rsi <= 35) return 50;
  if (rsi <= 45) return 20;
  if (rsi <= 55) return 0;
  if (rsi <= 65) return -20;
  if (rsi <= 70) return -50;
  if (rsi <= 75) return -70;
  if (rsi <= 80) return -85;
  return -100;
}

/**
 * Score distance from support/resistance
 * Returns +100 (at support) to -100 (at resistance)
 */
export function scoreDistanceFromLevel(
  currentPrice: number,
  supportLevel: number | null,
  resistanceLevel: number | null,
): ConditionScore {
  if (!supportLevel && !resistanceLevel) return 0;

  if (supportLevel) {
    const distanceFromSupport = ((currentPrice - supportLevel) / supportLevel) * 100;

    if (distanceFromSupport <= 0.5) return 100;
    if (distanceFromSupport <= 1.0) return 85;
    if (distanceFromSupport <= 2.0) return 70;
    if (distanceFromSupport <= 3.0) return 50;
    if (distanceFromSupport <= 5.0) return 30;
  }

  if (resistanceLevel) {
    const distanceFromResistance = ((resistanceLevel - currentPrice) / currentPrice) * 100;

    if (distanceFromResistance <= 0.5) return -100;
    if (distanceFromResistance <= 1.0) return -85;
    if (distanceFromResistance <= 2.0) return -70;
    if (distanceFromResistance <= 3.0) return -50;
    if (distanceFromResistance <= 5.0) return -30;
  }

  return 0;
}

/**
 * Score volume relative to average
 * Returns -70 (very low volume) to +100 (explosive volume)
 */
export function scoreVolume(currentVolume: number, avgVolume: number): ConditionScore {
  if (avgVolume === 0) return 0;

  const volumeRatio = currentVolume / avgVolume;

  if (volumeRatio >= 4.0) return 100;
  if (volumeRatio >= 3.0) return 85;
  if (volumeRatio >= 2.5) return 70;
  if (volumeRatio >= 2.0) return 55;
  if (volumeRatio >= 1.5) return 40;
  if (volumeRatio >= 1.2) return 20;
  if (volumeRatio >= 0.8) return 0;
  if (volumeRatio >= 0.5) return -30;
  if (volumeRatio >= 0.3) return -50;
  return -70;
}

/**
 * Score divergence based on type and recency
 * Returns -100 (bearish divergence) to +100 (bullish divergence)
 */
export function scoreDivergence(divergencePoints: ScorableDivergencePoint[]): ConditionScore {
  if (!divergencePoints || divergencePoints.length === 0) return 0;

  const recentDivergence = divergencePoints[0];
  const divergenceTimestamp = recentDivergence.timestamp ?? recentDivergence.time;
  if (!divergenceTimestamp) return 0;

  const ageInHours = (Date.now() - divergenceTimestamp) / (1000 * 60 * 60);

  if (recentDivergence.type === 'bullish') {
    if (ageInHours <= 2) return 100;
    if (ageInHours <= 4) return 85;
    if (ageInHours <= 8) return 70;
    if (ageInHours <= 12) return 50;
    if (ageInHours <= 24) return 30;
    return 10;
  }

  if (recentDivergence.type === 'bearish') {
    if (ageInHours <= 2) return -100;
    if (ageInHours <= 4) return -85;
    if (ageInHours <= 8) return -70;
    if (ageInHours <= 12) return -50;
    if (ageInHours <= 24) return -30;
    return -10;
  }

  return 0;
}

/**
 * Score trend alignment using moving averages
 * Returns -100 (strong downtrend) to +100 (strong uptrend)
 */
export function scoreTrendAlignment(
  shortTermMA: number,
  longTermMA: number,
  currentPrice: number,
): ConditionScore {
  if (longTermMA === 0) return 0;

  const maSpread = ((shortTermMA - longTermMA) / longTermMA) * 100;

  if (shortTermMA > longTermMA && currentPrice > shortTermMA) {
    if (maSpread >= 5) return 100;
    if (maSpread >= 3) return 80;
    if (maSpread >= 2) return 60;
    if (maSpread >= 1) return 40;
    return 20;
  }

  if (shortTermMA < longTermMA && currentPrice < shortTermMA) {
    if (maSpread <= -5) return -100;
    if (maSpread <= -3) return -80;
    if (maSpread <= -2) return -60;
    if (maSpread <= -1) return -40;
    return -20;
  }

  return clampConditionScore(0);
}

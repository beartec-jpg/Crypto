/**
 * Market Analysis Utilities
 * 
 * Functions for determining market bias, structure, and trend filters
 */

import { calculateEMA } from '@/lib/indicators/momentum';
import { calculateSwings } from '@/lib/smc/pivots';
import type { CandleData } from '@/types/chart.types';

// Re-export getCurrentATR from strategies helpers
export { getCurrentATR } from '@/lib/strategies/helpers';

// ==================== TYPES ====================

export type MarketBias = 'bullish' | 'bearish' | null;
export type StructureTrend = 'uptrend' | 'downtrend' | 'ranging' | null;
export type TrendFilterType = 'ema' | 'structure' | 'both' | 'none';
export type DirectionFilter = 'bull' | 'bear' | 'both';

// ==================== FUNCTIONS ====================

/**
 * Determine market bias using EMA crossover
 * 
 * @param data - Candle data
 * @param fastPeriod - Fast EMA period
 * @param slowPeriod - Slow EMA period
 * @returns Market bias ('bullish' or 'bearish')
 */
export function determineBias(
  data: CandleData[],
  fastPeriod: number,
  slowPeriod: number
): MarketBias {
  const closes = data.map(c => c.close);
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  return emaFast[emaFast.length - 1] > emaSlow[emaSlow.length - 1] ? 'bullish' : 'bearish';
}

/**
 * Determine structure-based trend (HH/HL vs LH/LL)
 * 
 * @param data - Candle data
 * @param swingLength - Swing length for structure analysis
 * @returns Structure trend ('uptrend', 'downtrend', or 'ranging')
 */
export function determineStructureTrend(
  data: CandleData[],
  swingLength: number
): StructureTrend {
  const swings = calculateSwings(data, swingLength);
  if (swings.length < 4) {
    return 'ranging';
  }

  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  if (highs.length < 2 || lows.length < 2) {
    return 'ranging';
  }

  // Check last 3 highs and lows for trend
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);

  const higherHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].value > recentHighs[recentHighs.length - 2].value;
  const higherLows = recentLows.length >= 2 && recentLows[recentLows.length - 1].value > recentLows[recentLows.length - 2].value;
  const lowerHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].value < recentHighs[recentHighs.length - 2].value;
  const lowerLows = recentLows.length >= 2 && recentLows[recentLows.length - 1].value < recentLows[recentLows.length - 2].value;

  if (higherHighs && higherLows) {
    return 'uptrend';
  } else if (lowerHighs && lowerLows) {
    return 'downtrend';
  } else {
    return 'ranging';
  }
}

/**
 * Check if trend filter passes
 * 
 * @param trendFilter - Trend filter type
 * @param bias - Market bias
 * @param structureTrend - Structure trend
 * @returns True if filter passes
 */
export function checkTrendFilter(
  trendFilter: TrendFilterType,
  bias: MarketBias,
  structureTrend: StructureTrend
): boolean {
  if (trendFilter === 'none') return true;
  if (trendFilter === 'ema') {
    return bias !== null;
  } else if (trendFilter === 'structure') {
    return structureTrend !== null && structureTrend !== 'ranging';
  } else { // both
    const emaBullish = bias === 'bullish';
    const structureBullish = structureTrend === 'uptrend';
    const emaBearish = bias === 'bearish';
    const structureBearish = structureTrend === 'downtrend';
    return (emaBullish && structureBullish) || (emaBearish && structureBearish);
  }
}

/**
 * Check if direction filter passes
 * 
 * @param directionFilter - Direction filter ('bull', 'bear', or 'both')
 * @param signalType - Signal type ('LONG' or 'SHORT')
 * @returns True if filter passes
 */
export function checkDirectionFilter(
  directionFilter: DirectionFilter,
  signalType: 'LONG' | 'SHORT'
): boolean {
  if (directionFilter === 'both') return true;
  if (directionFilter === 'bull') return signalType === 'LONG';
  if (directionFilter === 'bear') return signalType === 'SHORT';
  return false;
}

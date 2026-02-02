/**
 * VWAP Calculation Utilities
 * 
 * Functions for calculating rolling and periodic (anchored) VWAP
 */

import type { CandleData, VWAPData } from '@/types/chart.types';

// ==================== HELPER FUNCTIONS ====================

/**
 * Get period key for anchored VWAP
 * 
 * @param time - Unix timestamp
 * @param period - Period type ('daily', 'weekly', 'monthly')
 * @returns Period key string
 */
export function getPeriodKey(time: number, period: string): string {
  const date = new Date(time * 1000);
  if (period === 'daily') {
    return date.toISOString().slice(0, 10);
  } else if (period === 'weekly') {
    const startOfWeek = new Date(date);
    startOfWeek.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return startOfWeek.toISOString().slice(0, 10);
  } else if (period === 'monthly') {
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
  }
  return '';
}

// ==================== MAIN FUNCTIONS ====================

/**
 * Calculate rolling VWAP over specified period
 * 
 * @param data - Candle data
 * @param count - Rolling period (number of candles)
 * @returns Array of VWAP data points
 */
export function calculateRollingVWAP(data: CandleData[], count: number): VWAPData[] {
  const result: VWAPData[] = [];
  for (let i = count - 1; i < data.length; i++) {
    const slice = data.slice(i - count + 1, i + 1);
    let sumPV = 0, sumV = 0;
    slice.forEach(bar => {
      const typical = (bar.high + bar.low + bar.close) / 3;
      sumPV += typical * bar.volume;
      sumV += bar.volume;
    });
    result.push({ time: data[i].time, value: sumPV / sumV });
  }
  return result;
}

/**
 * Calculate periodic (anchored) VWAP with currentOnly option
 * 
 * @param data - Candle data
 * @param period - Period type ('daily', 'weekly', 'monthly')
 * @param currentOnly - If true, only return data for current period
 * @returns Array of VWAP data points
 */
export function calculatePeriodicVWAP(
  data: CandleData[],
  period: 'daily' | 'weekly' | 'monthly',
  currentOnly: boolean
): VWAPData[] {
  if (data.length === 0) return [];
  const result: VWAPData[] = [];
  let sumPV = 0, sumV = 0;
  let lastPeriodKey = getPeriodKey(data[0].time, period);
  const currentPeriodKey = getPeriodKey(data[data.length - 1].time, period);
  
  data.forEach(bar => {
    const periodKey = getPeriodKey(bar.time, period);
    if (periodKey !== lastPeriodKey) {
      sumPV = 0;
      sumV = 0;
    }
    lastPeriodKey = periodKey;
    const typical = (bar.high + bar.low + bar.close) / 3;
    sumPV += typical * bar.volume;
    sumV += bar.volume;
    if (sumV > 0 && (!currentOnly || periodKey === currentPeriodKey)) {
      result.push({ time: bar.time, value: sumPV / sumV });
    }
  });
  return result;
}

/**
 * Get closest VWAP value to current price
 * 
 * @param currentPrice - Current price
 * @param candles - Candle data
 * @param config - VWAP configuration
 * @returns Closest VWAP value or null if none available
 */
export function getClosestVWAP(
  currentPrice: number,
  candles: CandleData[],
  config: {
    showDaily: boolean;
    showWeekly: boolean;
    showRolling: boolean;
    rollingPeriod: number;
  }
): number | null {
  // Check which VWAPs are enabled and get their current values
  const vwaps: number[] = [];
  
  if (config.showDaily) {
    const dailyVWAP = calculatePeriodicVWAP(candles, 'daily', true);
    if (dailyVWAP.length > 0) vwaps.push(dailyVWAP[dailyVWAP.length - 1].value);
  }
  
  if (config.showWeekly) {
    const weeklyVWAP = calculatePeriodicVWAP(candles, 'weekly', true);
    if (weeklyVWAP.length > 0) vwaps.push(weeklyVWAP[weeklyVWAP.length - 1].value);
  }
  
  if (config.showRolling) {
    const rolling = calculateRollingVWAP(candles, config.rollingPeriod);
    if (rolling.length > 0) vwaps.push(rolling[rolling.length - 1].value);
  }
  
  if (vwaps.length === 0) return null;
  
  // Find closest VWAP to current price
  return vwaps.reduce((closest, vwap) => {
    return Math.abs(vwap - currentPrice) < Math.abs(closest - currentPrice) ? vwap : closest;
  });
}

import { useMemo } from 'react';
import type { Candle } from '@/types/candle';
import type { LiquidityZone, LiquiditySettings } from '@/types/liquidity';

interface SwingPoint {
  price: number;
  time: number;
  index: number;
}

interface LiquidityGroup {
  price: number;
  touchTimes: number[];
  touchPrices: number[];
  lastIndex: number;
}

interface UseLiquidityDetectionOptions {
  candles: Candle[];
  settings: LiquiditySettings;
}

/** Detect swing highs and lows using a lookback window. */
function detectSwings(
  candles: Candle[],
  lookback: number,
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }

    if (isHigh) highs.push({ price: c.high, time: c.time, index: i });
    if (isLow) lows.push({ price: c.low, time: c.time, index: i });
  }

  return { highs, lows };
}

/**
 * Group swing points that are within `threshold`% of each other into
 * liquidity clusters. Each group tracks all touch timestamps.
 */
function groupByPrice(
  points: SwingPoint[],
  thresholdPct: number,
): LiquidityGroup[] {
  const groups: LiquidityGroup[] = [];

  for (const pt of points) {
    let matched = false;
    for (const grp of groups) {
      const diffPct = Math.abs(pt.price - grp.price) / grp.price * 100;
      if (diffPct <= thresholdPct) {
        grp.touchTimes.push(pt.time);
        grp.touchPrices.push(pt.price);
        // Keep representative price as running average
        grp.price = grp.touchPrices.reduce((a, b) => a + b, 0) / grp.touchPrices.length;
        grp.lastIndex = Math.max(grp.lastIndex, pt.index);
        matched = true;
        break;
      }
    }
    if (!matched) {
      groups.push({
        price: pt.price,
        touchTimes: [pt.time],
        touchPrices: [pt.price],
        lastIndex: pt.index,
      });
    }
  }

  return groups;
}

/**
 * Check whether a liquidity level has been swept after the last recorded touch.
 * For highs: wick above the level + close below = sweep.
 * For lows:  wick below the level + close above = sweep.
 */
function detectSweep(
  candles: Candle[],
  level: number,
  afterIndex: number,
  type: 'high' | 'low',
): { swept: boolean; sweepTime?: number; sweepPrice?: number } {
  for (let i = afterIndex + 1; i < candles.length; i++) {
    const c = candles[i];
    if (type === 'high' && c.high > level && c.close < level) {
      return { swept: true, sweepTime: c.time, sweepPrice: c.high };
    }
    if (type === 'low' && c.low < level && c.close > level) {
      return { swept: true, sweepTime: c.time, sweepPrice: c.low };
    }
  }
  return { swept: false };
}

/**
 * Check whether a liquidity level has been invalidated (closed through).
 * For highs: close above level + buffer = invalidated.
 * For lows:  close below level - buffer = invalidated.
 */
function detectInvalidation(
  candles: Candle[],
  level: number,
  afterIndex: number,
  type: 'high' | 'low',
  bufferPct: number,
): { invalidated: boolean; invalidationTime?: number } {
  const buffer = level * (bufferPct / 100);

  for (let i = afterIndex + 1; i < candles.length; i++) {
    const c = candles[i];
    if (type === 'high' && c.close > level + buffer) {
      return { invalidated: true, invalidationTime: c.time };
    }
    if (type === 'low' && c.close < level - buffer) {
      return { invalidated: true, invalidationTime: c.time };
    }
  }
  return { invalidated: false };
}

/**
 * Detect liquidity zones (equal highs / equal lows) from candle data.
 */
export function useLiquidityDetection({
  candles,
  settings,
}: UseLiquidityDetectionOptions): LiquidityZone[] {
  return useMemo(() => {
    if (!settings.enabled || candles.length < 10) return [];

    const lookback = 3;
    const { highs, lows } = detectSwings(candles, lookback);
    const zones: LiquidityZone[] = [];

    if (settings.showHighs) {
      const highGroups = groupByPrice(highs, settings.equalThreshold);
      for (const grp of highGroups) {
        if (grp.touchTimes.length < settings.minTouches) continue;

        const sweep = detectSweep(candles, grp.price, grp.lastIndex, 'high');
        const invalidation = detectInvalidation(candles, grp.price, grp.lastIndex, 'high', settings.invalidationBuffer);
        if ((sweep.swept || invalidation.invalidated) && !settings.showSwept) continue;

        zones.push({
          id: `liq-high-${grp.touchTimes[0]}`,
          type: 'high',
          price: grp.price,
          touchTimes: grp.touchTimes,
          touchPrices: grp.touchPrices,
          ...sweep,
          ...invalidation,
        });
      }
    }

    if (settings.showLows) {
      const lowGroups = groupByPrice(lows, settings.equalThreshold);
      for (const grp of lowGroups) {
        if (grp.touchTimes.length < settings.minTouches) continue;

        const sweep = detectSweep(candles, grp.price, grp.lastIndex, 'low');
        const invalidation = detectInvalidation(candles, grp.price, grp.lastIndex, 'low', settings.invalidationBuffer);
        if ((sweep.swept || invalidation.invalidated) && !settings.showSwept) continue;

        zones.push({
          id: `liq-low-${grp.touchTimes[0]}`,
          type: 'low',
          price: grp.price,
          touchTimes: grp.touchTimes,
          touchPrices: grp.touchPrices,
          ...sweep,
          ...invalidation,
        });
      }
    }

    return zones;
  }, [candles, settings]);
}

import { useMemo, useRef } from 'react';
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
  touchIndices: number[];
  lastIndex: number;
}

interface UseLiquidityDetectionOptions {
  candles: Candle[];
  settings: LiquiditySettings;
  symbol?: string;
  timeframe?: string;
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
 * Validate that price has not broken through the level between two swing points.
 * For highs: price should not have closed above the level.
 * For lows: price should not have closed below the level.
 */
function validateNoBreakthrough(
  candles: Candle[],
  point1: SwingPoint,
  point2: SwingPoint,
  level: number,
  type: 'high' | 'low',
): boolean {
  const startIndex = Math.min(point1.index, point2.index);
  const endIndex = Math.max(point1.index, point2.index);

  for (let i = startIndex + 1; i < endIndex; i++) {
    if (type === 'high' && candles[i].close > level) {
      return false;
    }
    if (type === 'low' && candles[i].close < level) {
      return false;
    }
  }

  return true;
}

/**
 * Group swing points that are within `threshold`% of each other into
 * liquidity clusters. Each group tracks all touch timestamps.
 */
function groupByPrice(
  points: SwingPoint[],
  thresholdPct: number,
  candles: Candle[],
  type: 'high' | 'low',
): LiquidityGroup[] {
  const groups: LiquidityGroup[] = [];

  for (const pt of points) {
    let matched = false;
    for (const grp of groups) {
      const diffPct = Math.abs(pt.price - grp.price) / grp.price * 100;
      if (diffPct <= thresholdPct) {
        // Validate that price hasn't broken through between touches
        const lastPoint: SwingPoint = {
          index: grp.lastIndex,
          price: grp.touchPrices[grp.touchPrices.length - 1],
          time: grp.touchTimes[grp.touchTimes.length - 1],
        };

        const isValid = validateNoBreakthrough(candles, lastPoint, pt, grp.price, type);

        if (isValid) {
          grp.touchTimes.push(pt.time);
          grp.touchPrices.push(pt.price);
          grp.touchIndices.push(pt.index);
          // Keep representative price as running average
          grp.price = grp.touchPrices.reduce((a, b) => a + b, 0) / grp.touchPrices.length;
          grp.lastIndex = Math.max(grp.lastIndex, pt.index);
          matched = true;
          break;
        }
        // If validation failed, don't group these points - continue to next group or create new one
      }
    }
    if (!matched) {
      groups.push({
        price: pt.price,
        touchTimes: [pt.time],
        touchPrices: [pt.price],
        touchIndices: [pt.index],
        lastIndex: pt.index,
      });
    }
  }

  return groups;
}

/**
 * Check whether a liquidity level has been swept after the last recorded touch.
 * For highs: candle wicks above the level, then at least one of the next
 *            `confirmationWindow` candles closes back below = confirmed sweep.
 * For lows:  candle wicks below the level, then at least one of the next
 *            `confirmationWindow` candles closes back above = confirmed sweep.
 */
function detectSweep(
  candles: Candle[],
  level: number,
  afterIndex: number,
  type: 'high' | 'low',
  confirmationWindow: number = 3,
): { swept: boolean; sweepTime?: number; sweepPrice?: number } {
  for (let i = afterIndex + 1; i < candles.length; i++) {
    const c = candles[i];

    // Step 1: check if this candle wicks through the level
    const wickedThrough =
      (type === 'high' && c.high > level) ||
      (type === 'low' && c.low < level);

    if (!wickedThrough) continue;

    // Step 2: look for at least one confirmation close on the correct side
    //         within the next `confirmationWindow` candles
    for (let j = i + 1; j <= Math.min(i + confirmationWindow, candles.length - 1); j++) {
      const confirmCandle = candles[j];

      if (type === 'high' && confirmCandle.close < level) {
        return {
          swept: true,
          sweepTime: confirmCandle.time,
          sweepPrice: c.high,
        };
      }

      if (type === 'low' && confirmCandle.close > level) {
        return {
          swept: true,
          sweepTime: confirmCandle.time,
          sweepPrice: c.low,
        };
      }
    }
    // No confirmation within the window — this wick is not a confirmed sweep.
    // Continue scanning from the next candle.
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
  symbol = '',
  timeframe = '',
}: UseLiquidityDetectionOptions): LiquidityZone[] {
  // Per-symbol/timeframe registry of candle indices that have already been
  // part of a swept zone.  Keyed by `${symbol}_${timeframe}`.
  // useRef persists across re-renders without triggering extra renders.
  // Capped at MAX_CACHE_ENTRIES to prevent unbounded growth when users visit
  // many different symbol/timeframe combinations in a single session.
  const MAX_CACHE_ENTRIES = 50;
  const sweptHighCandlesRef = useRef(new Map<string, Set<number>>());
  const sweptLowCandlesRef = useRef(new Map<string, Set<number>>());

  return useMemo(() => {
    if (!settings.enabled || candles.length < 10) return [];

    const cacheKey = `${symbol}_${timeframe}`;
    const confirmationWindow = settings.confirmationCandles ?? 3;

    // Ensure Sets exist for this symbol/timeframe; evict oldest entry if cap reached
    if (!sweptHighCandlesRef.current.has(cacheKey)) {
      if (sweptHighCandlesRef.current.size >= MAX_CACHE_ENTRIES) {
        const firstKey = sweptHighCandlesRef.current.keys().next().value!;
        sweptHighCandlesRef.current.delete(firstKey);
      }
      sweptHighCandlesRef.current.set(cacheKey, new Set<number>());
    }
    if (!sweptLowCandlesRef.current.has(cacheKey)) {
      if (sweptLowCandlesRef.current.size >= MAX_CACHE_ENTRIES) {
        const firstKey = sweptLowCandlesRef.current.keys().next().value!;
        sweptLowCandlesRef.current.delete(firstKey);
      }
      sweptLowCandlesRef.current.set(cacheKey, new Set<number>());
    }
    const sweptHighCandles = sweptHighCandlesRef.current.get(cacheKey)!;
    const sweptLowCandles = sweptLowCandlesRef.current.get(cacheKey)!;

    const lookback = 3;
    const { highs, lows } = detectSwings(candles, lookback);
    const zones: LiquidityZone[] = [];

    if (settings.showHighs) {
      // Exclude candles that were part of previously swept zones
      const activeHighs = highs.filter(pt => !sweptHighCandles.has(pt.index));
      const highGroups = groupByPrice(activeHighs, settings.equalThreshold, candles, 'high');
      for (const grp of highGroups) {
        if (grp.touchTimes.length < settings.minTouches) continue;

        const sweep = detectSweep(candles, grp.price, grp.lastIndex, 'high', confirmationWindow);
        const invalidation = detectInvalidation(candles, grp.price, grp.lastIndex, 'high', settings.invalidationBuffer);

        // Permanently register swept candle indices so they cannot be reused
        if (sweep.swept) {
          for (const idx of grp.touchIndices) {
            sweptHighCandles.add(idx);
          }
        }

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
      // Exclude candles that were part of previously swept zones
      const activeLows = lows.filter(pt => !sweptLowCandles.has(pt.index));
      const lowGroups = groupByPrice(activeLows, settings.equalThreshold, candles, 'low');
      for (const grp of lowGroups) {
        if (grp.touchTimes.length < settings.minTouches) continue;

        const sweep = detectSweep(candles, grp.price, grp.lastIndex, 'low', confirmationWindow);
        const invalidation = detectInvalidation(candles, grp.price, grp.lastIndex, 'low', settings.invalidationBuffer);

        // Permanently register swept candle indices so they cannot be reused
        if (sweep.swept) {
          for (const idx of grp.touchIndices) {
            sweptLowCandles.add(idx);
          }
        }

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
  }, [candles, settings, symbol, timeframe]);
}

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
 * Internal state for a rolling sweep window.
 */
interface SweepWindow {
  firstBreakIndex: number;   // Candle index where sweep started
  deepestBreakIndex: number; // Candle index with the deepest penetration
  deepestPrice: number;      // Lowest low (low sweep) or highest high (high sweep)
  candlesInWindow: number;   // Rolling counter starting at 1 on first break
}

/**
 * Check whether a liquidity level has been swept after the last recorded touch.
 *
 * Rolling-window confirmation (replaces the per-wick inner loop):
 *   A sweep is ONE continuous event from the first candle that breaks the level
 *   until the event either confirms or expires.
 *
 *   Start  – First candle that penetrates the level (wick through).
 *   Update – Each subsequent candle within the window:
 *              • If it breaks deeper → move the ⚡ marker to that candle.
 *              • If it closes on the correct side → CONFIRMED (swept = true).
 *              • Always increment the window counter.
 *   End    – Confirmation (success) OR the window counter exceeds maxWindowCandles
 *            without a confirming close on that same candle (failure → reset, allow
 *            new window).  Concretely: the first break is candle 1/maxWindowCandles;
 *            the (maxWindowCandles+1)th candle is the last chance to confirm before
 *            the window expires.
 *
 * For highs: wick above the level; any candle within the window that closes
 *            below = confirmed sweep.
 * For lows:  wick below the level; any candle within the window that closes
 *            above = confirmed sweep.
 *
 * @param maxWindowCandles - How many candles (after the first break) may elapse
 *   before the window expires. Default 3.
 * @param currentCandleIndex - Optional upper bound for scanning (inclusive).
 *   Defaults to the last candle in the array. Pass a specific index to prevent
 *   look-ahead bias when evaluating historical/replay candle positions.
 */
function detectSweepRolling(
  candles: Candle[],
  level: number,
  afterIndex: number,
  type: 'high' | 'low',
  maxWindowCandles: number = 3,
  currentCandleIndex?: number,
): { swept: boolean; sweepPending?: boolean; sweepTime?: number; sweepPrice?: number; sweepIndex?: number; sweptIndex?: number } {
  // Clamp scanUpTo to valid array bounds.  The Math.min guards against a caller
  // passing a currentCandleIndex that exceeds the actual array length.
  const scanUpTo = Math.min(currentCandleIndex ?? candles.length - 1, candles.length - 1);

  let activeWindow: SweepWindow | null = null;

  for (let i = afterIndex + 1; i <= scanUpTo; i++) {
    const candle = candles[i];

    // Check whether this candle penetrates the level (wick or full body).
    const penetrated =
      (type === 'high' && candle.high > level) ||
      (type === 'low' && candle.low < level);

    // ── No active window ────────────────────────────────────────────────────
    if (!activeWindow) {
      if (penetrated) {
        activeWindow = {
          firstBreakIndex: i,
          deepestBreakIndex: i,
          deepestPrice: type === 'high' ? candle.high : candle.low,
          candlesInWindow: 1,
        };
      }
      continue; // First-break candle is always "pending"; check confirmation in subsequent candles within the window.
    }

    // ── Active window ────────────────────────────────────────────────────────
    activeWindow.candlesInWindow++;

    // Check for confirmation: a close that returns to the correct side.
    const confirmed =
      (type === 'high' && candle.close < level) ||
      (type === 'low' && candle.close > level);

    if (confirmed) {
      return {
        swept: true,
        // sweepTime anchors the visual ⚡ marker to the deepest penetration candle.
        sweepTime: candles[activeWindow.deepestBreakIndex].time,
        sweepPrice: activeWindow.deepestPrice,
        sweepIndex: activeWindow.deepestBreakIndex, // deepest penetration — for wick-size / visual marker
        sweptIndex: i,                              // confirmation candle — scoring decay starts here at ±100
      };
    }

    // If this candle pushes deeper, move the ⚡ marker.
    if (penetrated) {
      const isDeeper =
        (type === 'high' && candle.high > activeWindow.deepestPrice) ||
        (type === 'low' && candle.low < activeWindow.deepestPrice);

      if (isDeeper) {
        activeWindow.deepestBreakIndex = i;
        activeWindow.deepestPrice = type === 'high' ? candle.high : candle.low;
      }
    }

    // Expire the window when it has run its course without confirming.
    if (activeWindow.candlesInWindow > maxWindowCandles) {
      activeWindow = null;
    }
  }

  // Loop ended with a live window → sweep is still pending.
  if (activeWindow) {
    return {
      swept: false,
      sweepPending: true,
      sweepPrice: activeWindow.deepestPrice,
      sweepIndex: activeWindow.deepestBreakIndex,
    };
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
    // Pass the index of the last available candle so detectSweep never looks
    // beyond the current position (prevents look-ahead bias in replay/backtest).
    const currentCandleIndex = candles.length - 1;

    if (settings.showHighs) {
      // Keep History should preserve prior swept levels instead of excluding them.
      const activeHighs = settings.showSwept
        ? highs
        : highs.filter(pt => !sweptHighCandles.has(pt.index));
      const highGroups = groupByPrice(activeHighs, settings.equalThreshold, candles, 'high');
      for (const grp of highGroups) {
        if (grp.touchTimes.length < settings.minTouches) continue;

        const sweep = detectSweepRolling(candles, grp.price, grp.lastIndex, 'high', confirmationWindow, currentCandleIndex);
        const invalidation = detectInvalidation(candles, grp.price, grp.lastIndex, 'high', settings.invalidationBuffer);

        // Only suppress reuse when history is hidden.
        if (sweep.swept && !settings.showSwept) {
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
      // Keep History should preserve prior swept levels instead of excluding them.
      const activeLows = settings.showSwept
        ? lows
        : lows.filter(pt => !sweptLowCandles.has(pt.index));
      const lowGroups = groupByPrice(activeLows, settings.equalThreshold, candles, 'low');
      for (const grp of lowGroups) {
        if (grp.touchTimes.length < settings.minTouches) continue;

        const sweep = detectSweepRolling(candles, grp.price, grp.lastIndex, 'low', confirmationWindow, currentCandleIndex);
        const invalidation = detectInvalidation(candles, grp.price, grp.lastIndex, 'low', settings.invalidationBuffer);

        // Only suppress reuse when history is hidden.
        if (sweep.swept && !settings.showSwept) {
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

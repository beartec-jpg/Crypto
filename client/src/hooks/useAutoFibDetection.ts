import { useMemo } from 'react';
import type {
  AutoFibSettings,
  AutoFibResult,
  FibLevelData,
  FibSetConfig,
  FibSetResult,
  ConfluenceZone,
  SwingPoint,
} from '@/types/autoFib';
import type { Candle } from '@/types/candle';

/** All fib level definitions with metadata. */
const ALL_FIB_LEVELS: Array<{ key: string; ratio: number; isExtension: boolean; isGolden: boolean }> = [
  { key: '-61.8', ratio: -0.618, isExtension: true,  isGolden: false },
  { key: '-27.2', ratio: -0.272, isExtension: true,  isGolden: false },
  { key: '0',     ratio:  0,     isExtension: false, isGolden: false },
  { key: '23.6',  ratio:  0.236, isExtension: false, isGolden: false },
  { key: '38.2',  ratio:  0.382, isExtension: false, isGolden: false },
  { key: '50',    ratio:  0.5,   isExtension: false, isGolden: false },
  { key: '61.8',  ratio:  0.618, isExtension: false, isGolden: true  },
  { key: '78.6',  ratio:  0.786, isExtension: false, isGolden: false },
  { key: '100',   ratio:  1.0,   isExtension: false, isGolden: false },
  { key: '127.2', ratio:  1.272, isExtension: true,  isGolden: false },
  { key: '161.8', ratio:  1.618, isExtension: true,  isGolden: true  },
  { key: '200',   ratio:  2.0,   isExtension: true,  isGolden: false },
  { key: '261.8', ratio:  2.618, isExtension: true,  isGolden: false },
];

/**
 * Find the absolute highest high and lowest low within a candle array.
 * Returns null if the array is empty.
 */
function findCandleIndex(fullCandles: Candle[], time: number): number {
  let idx = -1;
  for (let i = 0; i < fullCandles.length; i++) {
    if (Number(fullCandles[i].time) === time) idx = i;
  }
  return idx;
}

function estimateBarInterval(candles: Candle[]): number {
  if (candles.length < 2) return 900;
  const last = Number(candles[candles.length - 1].time);
  const prev = Number(candles[candles.length - 2].time);
  const delta = last - prev;
  return Number.isFinite(delta) && delta > 0 ? delta : 900;
}

/**
 * Candles actually on screen. Prefer LWC logical indices so the live bar is
 * included; time filters can drop the forming 15m candle when `to` sits on
 * the previous bar.
 */
function sliceVisibleCandles(
  candles: Candle[],
  visibleRange: { from: number; to: number; fromIndex?: number; toIndex?: number } | null,
  settings: AutoFibSettings,
): Candle[] {
  if (
    visibleRange &&
    Number.isFinite(visibleRange.fromIndex) &&
    Number.isFinite(visibleRange.toIndex)
  ) {
    const fromIdx = Math.max(0, Math.floor(visibleRange.fromIndex as number));
    const toIdx = Math.min(candles.length - 1, Math.ceil(visibleRange.toIndex as number));
    if (toIdx >= fromIdx) {
      return candles.slice(fromIdx, toIdx + 1);
    }
  }

  if (visibleRange && Number.isFinite(visibleRange.from) && Number.isFinite(visibleRange.to)) {
    const slack = estimateBarInterval(candles);
    const from = Number(visibleRange.from) - slack;
    const to = Number(visibleRange.to) + slack;
    const windowed = candles.filter((c) => {
      const t = Number(c.time);
      return t >= from && t <= to;
    });
    if (windowed.length >= 2) return windowed;
  }

  return candles.slice(-Math.max(settings.swingLookback * 2, 40));
}

/**
 * Find the absolute highest high and lowest low within a candle array.
 * Returns null if the array is empty.
 */
function findHighLow(
  candles: Candle[],
  fullCandles: Candle[]
): { high: SwingPoint; low: SwingPoint } | null {
  if (candles.length === 0) return null;

  let highCandle = candles[0];
  let lowCandle = candles[0];

  for (const c of candles) {
    if (c.high > highCandle.high) highCandle = c;
    if (c.low < lowCandle.low) lowCandle = c;
  }

  const highIdx = findCandleIndex(fullCandles, Number(highCandle.time));
  const lowIdx = findCandleIndex(fullCandles, Number(lowCandle.time));

  if (highIdx === -1 || lowIdx === -1) return null;

  return {
    high: { index: highIdx, time: Number(highCandle.time), price: highCandle.high },
    low:  { index: lowIdx,  time: Number(lowCandle.time),  price: lowCandle.low  },
  };
}

/**
 * Calculate Fibonacci levels for a swing, with freeze detection using post-end candles.
 *
 * swingDirection:
 *   'up'   → upswing: 0% at HIGH (retracement start), 100% at LOW (retracing back to origin).
 *            After the swing ends at HIGH, price retraces DOWN →
 *            a level at price P is frozen when a post-end candle's low <= P.
 *   'down' → downswing: 0% at LOW (retracement start), 100% at HIGH (retracing back to origin).
 *            After the swing ends at LOW, price bounces UP →
 *            a level at price P is frozen when a post-end candle's high >= P.
 */
function calculateFibLevels(
  lowPrice: number,
  highPrice: number,
  config: FibSetConfig,
  postEndCandles: Candle[],
  swingDirection: 'up' | 'down'
): FibLevelData[] {
  // CORRECT: For retracements, 0% is where price ended, 100% is where it's retracing back to
  // Upswing: 0% at HIGH (retracement start), 100% at LOW; downswing: 0% at LOW (retracement start), 100% at HIGH
  const startPrice = swingDirection === 'up' ? highPrice : lowPrice;  // where the move ended
  const endPrice   = swingDirection === 'up' ? lowPrice : highPrice;  // where we're retracing back to
  const range = endPrice - startPrice;
  const result: FibLevelData[] = [];

  for (const def of ALL_FIB_LEVELS) {
    if (def.isExtension && !config.showExtensions) continue;
    if (!def.isExtension && !config.showRetracements) continue;

    const key = def.key as keyof typeof config.levels;
    if (!config.levels[key]) continue;

    const price = startPrice + range * def.ratio;

    // Freeze detection: find first post-end candle that crosses this level
    let isFrozen = false;
    let frozenAtTime: number | undefined;

    for (const candle of postEndCandles) {
      const crossed =
        swingDirection === 'up'
          ? candle.low  <= price   // after upswing ends at HIGH, price retraces down
          : candle.high >= price;  // after downswing ends at LOW, price bounces up

      if (crossed) {
        isFrozen = true;
        frozenAtTime = Number(candle.time);
        break;
      }
    }

    result.push({
      level: def.key,
      percentage: `${def.key}%`,
      price,
      isExtension: def.isExtension,
      isGolden: def.isGolden,
      isFrozen,
      frozenAtTime,
    });
  }

  return result;
}

/**
 * Detect confluence zones between two sets of fib levels.
 */
function detectConfluence(
  primaryLevels: FibLevelData[],
  secondaryLevels: FibLevelData[],
  thresholdPercent: number
): ConfluenceZone[] {
  const zones: ConfluenceZone[] = [];

  for (const pLevel of primaryLevels) {
    for (const sLevel of secondaryLevels) {
      const priceDiff = Math.abs(pLevel.price - sLevel.price);
      const percentDiff = pLevel.price !== 0 ? (priceDiff / Math.abs(pLevel.price)) * 100 : 0;

      if (percentDiff <= thresholdPercent) {
        const existing = zones.find(
          z => Math.abs(z.price - pLevel.price) / (Math.abs(pLevel.price) || 1) * 100 <= thresholdPercent
        );

        if (existing) {
          existing.strength += 1;
        } else {
          zones.push({
            price: (pLevel.price + sLevel.price) / 2,
            primaryLevel: pLevel.percentage,
            secondaryLevel: sLevel.percentage,
            strength: 1,
          });
        }
      }
    }
  }

  return zones.sort((a, b) => b.strength - a.strength);
}

/**
 * Main hook: detect dual Auto-Fibonacci sets from candle data.
 *
 * visibleRange (optional): time range currently visible on screen.
 *   When provided, anchor points are picked as the highest/lowest price
 *   within the visible range rather than a fixed lookback window.
 *   Falls back to the last swingLookback*2 candles when null.
 */
export function useAutoFibDetection(
  candles: Candle[],
  visibleRange: { from: number; to: number; fromIndex?: number; toIndex?: number } | null,
  settings: AutoFibSettings
): AutoFibResult {
  return useMemo(() => {
    const empty: AutoFibResult = { primary: null, secondary: null, confluence: [] };

    if (candles.length === 0) return empty;

    // Determine which candles are "visible" for anchor detection
    const anchorCandles = sliceVisibleCandles(candles, visibleRange, settings);

    if (anchorCandles.length < 2) return empty;

    // --- Primary Fibonacci ---
    let primaryFib: FibSetResult | null = null;

    if (settings.primary.enabled) {
      const extremes = findHighLow(anchorCandles, candles);
      if (extremes) {
        const { high, low } = extremes;

        // Direction: if high.time < low.time, high came first → downswing
        const isDownSwing = high.time < low.time;

        // Chronological anchor points
        const start: SwingPoint = isDownSwing ? high : low;  // earlier in time
        const end: SwingPoint   = isDownSwing ? low  : high; // later in time

        // Candles that occurred after the swing ended (for freeze detection)
        const postEndCandles = candles.slice(end.index + 1);

        // Primary levels: 0% at HIGH, 100% at LOW for upswing (retracing down to origin);
        // 0% at LOW, 100% at HIGH for downswing (retracing up to origin).
        // After downswing (ends at low), price bounces UP → freeze when candle.high >= P
        // After upswing  (ends at high), price retraces DOWN → freeze when candle.low <= P
        const swingDir: 'up' | 'down' = isDownSwing ? 'down' : 'up';
        const levels = calculateFibLevels(
          low.price, high.price,
          settings.primary,
          postEndCandles,
          swingDir
        );

        primaryFib = {
          start,
          end,
          levels,
          color: settings.primary.color,
          showLabels: settings.primary.showLabels,
          labelPosition: settings.primary.labelPosition,
          extendRight: settings.primary.extendRight,
        };
      }
    }

    // --- Secondary Fibonacci ---
    // Always opposite direction to primary.
    // Starts where primary ends (in time); finds new anchor in the visible
    // candles that occur AFTER the primary's end.
    let secondaryFib: FibSetResult | null = null;

    if (settings.secondary.enabled && primaryFib) {
      const primaryEndTime = primaryFib.end.time;
      const isPrimaryDown  = primaryFib.end.price < primaryFib.start.price;

      // Visible candles strictly after the primary swing ended
      const postPrimaryVisible = anchorCandles.filter(c => Number(c.time) > primaryEndTime);

      if (postPrimaryVisible.length >= 1) {
        const secExtremes = findHighLow(postPrimaryVisible, candles);

        if (secExtremes) {
          const { high: secHigh, low: secLow } = secExtremes;

          if (isPrimaryDown) {
            // Primary ended at LOW → secondary is an upswing (bounce)
            // Secondary: 0% at secHigh (peak of bounce), 100% at PRIMARY LOW (retracing back to origin)
            // After the bounce peak, price drops → freeze when candle.low <= P
            const postSecEnd = candles.slice(secHigh.index + 1);
            const secLevels  = calculateFibLevels(
              primaryFib.end.price, secHigh.price,
              settings.secondary,
              postSecEnd,
              'up'
            );

            secondaryFib = {
              start: primaryFib.end,    // PRIMARY LOW = chronological start of secondary
              end:   secHigh,            // new HIGH = chronological end of secondary
              levels: secLevels,
              color: settings.secondary.color,
              showLabels: settings.secondary.showLabels,
              labelPosition: settings.secondary.labelPosition,
              extendRight: settings.secondary.extendRight,
            };
          } else {
            // Primary ended at HIGH → secondary is a downswing (retracement)
            // Secondary: 0% at secLow (bottom of retracement), 100% at PRIMARY HIGH (retracing back to origin)
            // After the retracement low, price bounces → freeze when candle.high >= P
            const postSecEnd = candles.slice(secLow.index + 1);
            const secLevels  = calculateFibLevels(
              secLow.price, primaryFib.end.price,
              settings.secondary,
              postSecEnd,
              'down'
            );

            secondaryFib = {
              start: primaryFib.end,    // PRIMARY HIGH = chronological start of secondary
              end:   secLow,             // new LOW = chronological end of secondary
              levels: secLevels,
              color: settings.secondary.color,
              showLabels: settings.secondary.showLabels,
              labelPosition: settings.secondary.labelPosition,
              extendRight: settings.secondary.extendRight,
            };
          }
        }
      }
    }

    // --- Confluence Detection ---
    const confluence =
      settings.enableConfluence && primaryFib && secondaryFib
        ? detectConfluence(primaryFib.levels, secondaryFib.levels, settings.confluenceThreshold)
        : [];

    return { primary: primaryFib, secondary: secondaryFib, confluence };
  }, [candles, visibleRange, settings]);
}

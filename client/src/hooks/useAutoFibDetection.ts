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

/**
 * Find the most-recent swing high within the candle array.
 * Scans from newest to oldest (skipping edge buffers), optionally excluding one index.
 */
function findSwingHigh(
  candles: Candle[],
  lookback: number,
  excludeIndex?: number
): SwingPoint | null {
  if (candles.length < lookback * 2 + 1) return null;

  const start = candles.length - lookback - 1;
  const end = lookback;

  for (let i = start; i >= end; i--) {
    if (excludeIndex !== undefined && excludeIndex === i) continue;

    let isHigh = true;
    const centerHigh = candles[i].high;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= centerHigh) {
        isHigh = false;
        break;
      }
    }

    if (isHigh) {
      return { index: i, time: Number(candles[i].time), price: centerHigh };
    }
  }

  return null;
}

/**
 * Find the most-recent swing low within the candle array.
 */
function findSwingLow(
  candles: Candle[],
  lookback: number,
  excludeIndex?: number
): SwingPoint | null {
  if (candles.length < lookback * 2 + 1) return null;

  const start = candles.length - lookback - 1;
  const end = lookback;

  for (let i = start; i >= end; i--) {
    if (excludeIndex !== undefined && excludeIndex === i) continue;

    let isLow = true;
    const centerLow = candles[i].low;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].low <= centerLow) {
        isLow = false;
        break;
      }
    }

    if (isLow) {
      return { index: i, time: Number(candles[i].time), price: centerLow };
    }
  }

  return null;
}

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
 * Calculate Fibonacci levels between start (0%) and end (100%).
 * start = price at 0%, end = price at 100%.
 */
function calculateFibLevels(
  start: number,
  end: number,
  config: FibSetConfig
): FibLevelData[] {
  const range = end - start;
  const result: FibLevelData[] = [];

  for (const def of ALL_FIB_LEVELS) {
    // Filter by extension/retracement toggle
    if (def.isExtension && !config.showExtensions) continue;
    if (!def.isExtension && !config.showRetracements) continue;

    // Filter by per-level toggle
    const key = def.key as keyof typeof config.levels;
    if (!config.levels[key]) continue;

    let price: number;
    if (def.ratio < 0) {
      // Extension below start: start - |ratio| * range
      price = start + range * def.ratio;
    } else if (def.ratio <= 1) {
      // Retracement 0-100%
      price = start + range * def.ratio;
    } else {
      // Extension above 100%: end + (ratio - 1) * range
      price = start + range * def.ratio;
    }

    result.push({
      level: def.key,
      percentage: `${def.key}%`,
      price,
      isExtension: def.isExtension,
      isGolden: def.isGolden,
    });
  }

  return result;
}

/**
 * Build a FibSetResult from a swing high + low pair.
 */
function buildFibSet(
  swingHigh: SwingPoint,
  swingLow: SwingPoint,
  config: FibSetConfig
): FibSetResult {
  // Direction: whichever swing point came later in time is the "end"
  const isDownSwing = swingHigh.time > swingLow.time;

  const start = isDownSwing ? swingHigh : swingLow;
  const end = isDownSwing ? swingLow : swingHigh;
  const startPrice = isDownSwing ? swingHigh.price : swingLow.price;
  const endPrice = isDownSwing ? swingLow.price : swingHigh.price;

  const levels = calculateFibLevels(startPrice, endPrice, config);

  return {
    start,
    end,
    levels,
    color: config.color,
    showLabels: config.showLabels,
    labelPosition: config.labelPosition,
    extendRight: config.extendRight,
  };
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
 */
export function useAutoFibDetection(
  candles: Candle[],
  settings: AutoFibSettings
): AutoFibResult {
  return useMemo(() => {
    const empty: AutoFibResult = { primary: null, secondary: null, confluence: [] };

    if (!settings.enabled || candles.length < settings.swingLookback * 2 + 1) {
      return empty;
    }

    const lookback = settings.swingLookback;
    let primaryFib: FibSetResult | null = null;
    let secondaryFib: FibSetResult | null = null;

    // --- Primary Fibonacci ---
    if (settings.primary.enabled) {
      const primaryHigh = findSwingHigh(candles, lookback);
      const primaryLow = findSwingLow(candles, lookback);

      if (primaryHigh && primaryLow) {
        primaryFib = buildFibSet(primaryHigh, primaryLow, settings.primary);
      }
    }

    // --- Secondary Fibonacci (excluding primary swing indices) ---
    if (settings.secondary.enabled) {
      const excludeHighIdx = primaryFib
        ? (primaryFib.start.price > primaryFib.end.price ? primaryFib.start.index : primaryFib.end.index)
        : undefined;
      const excludeLowIdx = primaryFib
        ? (primaryFib.start.price < primaryFib.end.price ? primaryFib.start.index : primaryFib.end.index)
        : undefined;

      const secondaryHigh = findSwingHigh(candles, lookback, excludeHighIdx);
      const secondaryLow = findSwingLow(candles, lookback, excludeLowIdx);

      if (secondaryHigh && secondaryLow) {
        secondaryFib = buildFibSet(secondaryHigh, secondaryLow, settings.secondary);
      }
    }

    // --- Confluence Detection ---
    const confluence =
      settings.enableConfluence && primaryFib && secondaryFib
        ? detectConfluence(primaryFib.levels, secondaryFib.levels, settings.confluenceThreshold)
        : [];

    return { primary: primaryFib, secondary: secondaryFib, confluence };
  }, [candles, settings]);
}

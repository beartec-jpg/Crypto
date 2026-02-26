import { useMemo } from 'react';
import type { AutoFibZone, AutoFibLevel, AutoFibSettings } from '@/types/autoFib';
import type { Candle } from '@/types/candle';

/**
 * Detect swing high: highest high in lookback period on each side.
 */
function detectSwingHigh(
  candles: Candle[],
  index: number,
  lookback: number
): { time: number; price: number } | null {
  if (index < lookback || index >= candles.length - lookback) return null;

  const centerHigh = candles[index].high;

  for (let i = index - lookback; i <= index + lookback; i++) {
    if (i !== index && candles[i].high >= centerHigh) {
      return null;
    }
  }

  return { time: candles[index].time, price: centerHigh };
}

/**
 * Detect swing low: lowest low in lookback period on each side.
 */
function detectSwingLow(
  candles: Candle[],
  index: number,
  lookback: number
): { time: number; price: number } | null {
  if (index < lookback || index >= candles.length - lookback) return null;

  const centerLow = candles[index].low;

  for (let i = index - lookback; i <= index + lookback; i++) {
    if (i !== index && candles[i].low <= centerLow) {
      return null;
    }
  }

  return { time: candles[index].time, price: centerLow };
}

/**
 * Calculate fib levels between two price points.
 */
function calculateFibLevels(
  high: number,
  low: number,
  enabledLevels: number[]
): AutoFibLevel[] {
  const range = high - low;

  const allLevels = [
    { level: 0, label: '0%', isGolden: false, isExtension: false },
    { level: 0.236, label: '23.6%', isGolden: false, isExtension: false },
    { level: 0.382, label: '38.2%', isGolden: false, isExtension: false },
    { level: 0.5, label: '50%', isGolden: false, isExtension: false },
    { level: 0.618, label: '61.8%', isGolden: true, isExtension: false },
    { level: 0.786, label: '78.6%', isGolden: false, isExtension: false },
    { level: 1.0, label: '100%', isGolden: false, isExtension: false },
    { level: 1.272, label: '127.2%', isGolden: false, isExtension: true },
    { level: 1.618, label: '161.8%', isGolden: true, isExtension: true },
    { level: 2.0, label: '200%', isGolden: false, isExtension: true },
    { level: 2.618, label: '261.8%', isGolden: false, isExtension: true },
  ];

  return allLevels
    .filter(l => enabledLevels.includes(l.level))
    .map(l => ({
      ...l,
      price: high - range * l.level,
    }));
}

/**
 * Main hook: detect auto fib zones from candle data.
 */

/** Extra buffer on each edge to avoid detecting incomplete swings at chart boundaries. */
const EDGE_BUFFER = 5;
export function useAutoFibDetection(
  candles: Candle[],
  settings: AutoFibSettings
): AutoFibZone[] {
  return useMemo(() => {
    if (!settings.enabled || candles.length < settings.lookback * 2 + 1) {
      return [];
    }

    const lookback = settings.lookback;
    const startIdx = lookback + EDGE_BUFFER;
    const endIdx = candles.length - lookback - EDGE_BUFFER;

    let lastSwingHigh: { time: number; price: number } | null = null;
    let lastSwingLow: { time: number; price: number } | null = null;

    for (let i = startIdx; i < endIdx; i++) {
      const swingHigh = detectSwingHigh(candles, i, lookback);
      const swingLow = detectSwingLow(candles, i, lookback);

      if (swingHigh) lastSwingHigh = swingHigh;
      if (swingLow) lastSwingLow = swingLow;
    }

    if (!lastSwingHigh || !lastSwingLow) {
      return [];
    }

    const levels = calculateFibLevels(
      lastSwingHigh.price,
      lastSwingLow.price,
      settings.enabledLevels
    );

    const filteredLevels = levels.filter(l => {
      if (l.isExtension && !settings.showExtensions) return false;
      if (!l.isExtension && !settings.showRetracements) return false;
      return true;
    });

    return [
      {
        id: `autofib-${lastSwingHigh.time}-${lastSwingLow.time}`,
        swingHigh: lastSwingHigh,
        swingLow: lastSwingLow,
        direction: 'retracement' as const,
        levels: filteredLevels,
        active: true,
      },
    ];
  }, [candles, settings]);
}

/**
 * useDivergenceScanner
 *
 * Scans all 7 divergence-capable oscillators (RSI, MACD, Stoch RSI, MFI,
 * Williams %R, CCI, OBV) against recent price peaks and troughs regardless
 * of which oscillators are currently visible on the chart.
 *
 * Returns an array of DivergencePoint objects, each with a count and names
 * of the confirming oscillators so callers can display confluence strength.
 */

import { useMemo } from 'react';
import { findPeaksAndTroughs } from '@/lib/smc/pivots';
import {
  checkAllOscillatorDivergence,
  DEFAULT_OSCILLATOR_CONFIG,
  type OscillatorConfig,
} from '@/lib/calculations/divergenceCalculations';
import type { CandleData } from '@/types/chart.types';
import type { DivergencePoint } from '@/types/chart.types';

export type { OscillatorConfig };

/**
 * Number of recent candles to scan. 100 balances two concerns:
 *   1. Performance – calculating 7 oscillators is O(n); capping at 100 keeps
 *      each scan fast even on lower-end devices.
 *   2. Accuracy   – the slowest oscillator warm-up here is MACD(12,26,9) which
 *      needs ~35 candles, so 100 candles gives a comfortable detection window
 *      while limiting redundant historical signals.
 */
const SCAN_LOOKBACK = 100;

/** Lookback window for peak/trough detection. */
const PIVOT_LOOKBACK = 5;

/**
 * Scan candle data for divergence signals across all 7 oscillators.
 *
 * @param candles - Full candle array (only the last SCAN_LOOKBACK candles are used)
 * @param config  - Optional oscillator periods; falls back to DEFAULT_OSCILLATOR_CONFIG
 * @returns Array of DivergencePoint sorted by time ascending
 */
export function useDivergenceScanner(
  candles: CandleData[],
  config: OscillatorConfig = DEFAULT_OSCILLATOR_CONFIG,
): DivergencePoint[] {
  // Limit to recent candles for performance
  const recentCandles = useMemo(
    () => candles.slice(-SCAN_LOOKBACK),
    [candles],
  );

  return useMemo(() => {
    if (recentCandles.length < 30) return [];

    const priceData = recentCandles.map(c => c.close);
    const { peaks, troughs } = findPeaksAndTroughs(priceData, PIVOT_LOOKBACK);

    const results: DivergencePoint[] = [];

    // Bearish divergence: price makes higher high, oscillator(s) make lower high
    for (let i = 1; i < peaks.length; i++) {
      const prevIdx = peaks[i - 1];
      const currIdx = peaks[i];

      // Only flag when price confirms the higher-high condition
      if (priceData[currIdx] > priceData[prevIdx]) {
        const { count, indicators } = checkAllOscillatorDivergence(
          currIdx,
          prevIdx,
          'bearish',
          recentCandles,
          config,
        );
        if (count > 0) {
          results.push({
            time: recentCandles[currIdx].time,
            price: priceData[currIdx],
            type: 'bearish',
            count,
            indicators,
          });
        }
      }
    }

    // Bullish divergence: price makes lower low, oscillator(s) make higher low
    for (let i = 1; i < troughs.length; i++) {
      const prevIdx = troughs[i - 1];
      const currIdx = troughs[i];

      if (priceData[currIdx] < priceData[prevIdx]) {
        const { count, indicators } = checkAllOscillatorDivergence(
          currIdx,
          prevIdx,
          'bullish',
          recentCandles,
          config,
        );
        if (count > 0) {
          results.push({
            time: recentCandles[currIdx].time,
            price: priceData[currIdx],
            type: 'bullish',
            count,
            indicators,
          });
        }
      }
    }

    return results.sort((a, b) => a.time - b.time);
  }, [recentCandles, config]);
}

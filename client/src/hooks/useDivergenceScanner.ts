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
import { findPeaksAndTroughs, findPivotsZigZag } from '@/lib/smc/pivots';
import {
  checkAllOscillatorDivergence,
  DEFAULT_OSCILLATOR_CONFIG,
  type OscillatorConfig,
} from '@/lib/calculations/divergenceCalculations';
import { detectSMTDivergence } from '@/lib/smc/smtDivergence';
import { getCorrelatedSymbol } from '@/lib/smc/smtConfig';
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
 * Scan candle data for divergence signals across all 7 oscillators + SMT.
 *
 * @param candles - Full candle array (only the last SCAN_LOOKBACK candles are used)
 * @param config  - Optional oscillator periods; falls back to DEFAULT_OSCILLATOR_CONFIG
 * @param correlatedCandles - Optional correlated asset candles for SMT divergence detection
 * @param mainSymbol - Main asset symbol (used to auto-detect correlation if needed)
 * @returns Array of DivergencePoint sorted by time ascending
 */
export function useDivergenceScanner(
  candles: CandleData[],
  config: OscillatorConfig = DEFAULT_OSCILLATOR_CONFIG,
  correlatedCandles?: CandleData[],
  mainSymbol?: string,
): DivergencePoint[] {
  // Limit to recent candles for performance
  const recentCandles = useMemo(
    () => candles.slice(-SCAN_LOOKBACK),
    [candles],
  );

  const recentCorrCandles = useMemo(
    () => (correlatedCandles ? correlatedCandles.slice(-SCAN_LOOKBACK) : undefined),
    [correlatedCandles],
  );

  return useMemo(() => {
    if (recentCandles.length < 30) return [];

    const priceData = recentCandles.map(c => c.close);
    const { peaks, troughs } = findPeaksAndTroughs(priceData, PIVOT_LOOKBACK);

    const results: DivergencePoint[] = [];

    // Detect SMT divergences if correlated candles available
    let smtResults: Map<number, { score: number; confidence: number; timeSyncScore: number }> = new Map();
    let correlationSymbol: string | undefined;

    if (recentCorrCandles && recentCorrCandles.length >= 30) {
      try {
        // Auto-detect correlation symbol if not provided
        if (!correlationSymbol && mainSymbol) {
          correlationSymbol = getCorrelatedSymbol(mainSymbol);
        }

        // Find pivots for both assets
        const mainPivots = findPivotsZigZag(recentCandles);
        const corrPivots = findPivotsZigZag(recentCorrCandles);

        if (mainPivots.length > 0 && corrPivots.length > 0) {
          // Detect SMT divergence
          const smtDiv = detectSMTDivergence(mainPivots, corrPivots);

          if (smtDiv.isValid && smtDiv.type !== null) {
            // Map SMT divergence to most recent peak/trough time
            const recentTimeIndex = smtDiv.type === 'bearish'
              ? peaks[peaks.length - 1] ?? recentCandles.length - 1
              : troughs[troughs.length - 1] ?? recentCandles.length - 1;

            smtResults.set(recentTimeIndex, {
              score: smtDiv.score,
              confidence: smtDiv.confidence,
              timeSyncScore: smtDiv.timeSyncScore ?? 0,
            });
          }
        }
      } catch (err) {
        // Gracefully degrade if SMT detection fails
        console.debug('SMT divergence detection failed:', err);
      }
    }

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
          const smtData = smtResults.get(currIdx);
          results.push({
            time: recentCandles[currIdx].time,
            price: priceData[currIdx],
            type: 'bearish',
            count,
            indicators,
            smtScore: smtData?.score,
            smtConfidence: smtData?.confidence,
            correlationSymbol: smtData ? correlationSymbol : undefined,
            smtTimeSyncScore: smtData?.timeSyncScore,
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
          const smtData = smtResults.get(currIdx);
          results.push({
            time: recentCandles[currIdx].time,
            price: priceData[currIdx],
            type: 'bullish',
            count,
            indicators,
            smtScore: smtData?.score,
            smtConfidence: smtData?.confidence,
            correlationSymbol: smtData ? correlationSymbol : undefined,
            smtTimeSyncScore: smtData?.timeSyncScore,
          });
        }
      }
    }

    return results.sort((a, b) => a.time - b.time);
  }, [recentCandles, recentCorrCandles, config, mainSymbol]);

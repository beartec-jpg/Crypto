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
import {
  getCascadeBonus,
  type TimeframeKey,
} from '@/lib/calculations/multiTimeframeDivergenceScoring';
import type { CandleData } from '@/types/chart.types';
import type { DivergencePoint } from '@/types/chart.types';

export type { OscillatorConfig };

/**
 * A DivergencePoint without multi-timeframe cascade fields.
 * Used as the raw per-timeframe output before MTF enrichment.
 */
export type BasicDivergencePoint = Omit<DivergencePoint, 'mtfCascadeLevel' | 'mtfCascadeBonus' | 'mtfActiveTimeframes'>;

/**
 * Number of recent candles to scan. 100 balances two concerns:
 *   1. Performance – calculating 7 oscillators is O(n); capping at 100 keeps
 *      each scan fast even on lower-end devices.
 *   2. Accuracy   – the slowest oscillator warm-up here is MACD(12,26,9) which
 *      needs ~35 candles, so 100 candles gives a comfortable detection window
 *      while limiting redundant historical signals.
 */
export const SCAN_LOOKBACK = 100;

/** Lookback window for peak/trough detection. */
const PIVOT_LOOKBACK = 5;

/**
 * Pure (non-hook) divergence scan for a single set of candles.
 *
 * Detects bearish and bullish divergences across all 7 oscillators plus SMT,
 * and returns the results WITHOUT multi-timeframe cascade fields so that
 * callers (both the single-TF hook and the MTF hook) can attach the
 * appropriate cascade metadata themselves.
 *
 * @param candles           - Already-sliced candle array (caller is responsible for the lookback limit)
 * @param config            - Oscillator configuration
 * @param correlatedCandles - Optional correlated-asset candles for SMT detection
 * @param mainSymbol        - Main symbol, used to auto-detect the correlation pair
 * @returns BasicDivergencePoint[] sorted by time ascending
 */
export function scanDivergences(
  candles: CandleData[],
  config: OscillatorConfig = DEFAULT_OSCILLATOR_CONFIG,
  correlatedCandles?: CandleData[],
  mainSymbol?: string,
): BasicDivergencePoint[] {
  if (candles.length < 30) return [];

  const highData = candles.map(c => c.high);
  const lowData = candles.map(c => c.low);
  const { peaks } = findPeaksAndTroughs(highData, PIVOT_LOOKBACK);
  const { troughs } = findPeaksAndTroughs(lowData, PIVOT_LOOKBACK);

  const results: BasicDivergencePoint[] = [];

  // Detect SMT divergences if correlated candles available
  let smtResults: Map<number, { score: number; confidence: number; timeSyncScore: number }> = new Map();
  let correlationSymbol: string | undefined;

  if (correlatedCandles && correlatedCandles.length >= 30) {
    try {
      if (!correlationSymbol && mainSymbol) {
        correlationSymbol = getCorrelatedSymbol(mainSymbol);
      }

      const mainPivots = findPivotsZigZag(candles);
      const corrPivots = findPivotsZigZag(correlatedCandles);

      if (mainPivots.length > 0 && corrPivots.length > 0) {
        const smtDiv = detectSMTDivergence(mainPivots, corrPivots);

        if (smtDiv.isValid && smtDiv.type !== null) {
          const recentTimeIndex = smtDiv.type === 'bearish'
            ? peaks[peaks.length - 1] ?? candles.length - 1
            : troughs[troughs.length - 1] ?? candles.length - 1;

          smtResults.set(recentTimeIndex, {
            score: smtDiv.score,
            confidence: smtDiv.confidence,
            timeSyncScore: smtDiv.timeSyncScore ?? 0,
          });
        }
      }
    } catch (err) {
      console.debug('SMT divergence detection failed:', err);
    }
  }

  // Bearish divergence: price makes higher high, oscillator(s) make lower high
  for (let i = 1; i < peaks.length; i++) {
    const prevIdx = peaks[i - 1];
    const currIdx = peaks[i];

    if (highData[currIdx] > highData[prevIdx]) {
      const { count, indicators } = checkAllOscillatorDivergence(
        currIdx,
        prevIdx,
        'bearish',
        candles,
        config,
      );
      if (count > 0) {
        const smtData = smtResults.get(currIdx);
        results.push({
          time: candles[currIdx].time,
          price: highData[currIdx],
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

    if (lowData[currIdx] < lowData[prevIdx]) {
      const { count, indicators } = checkAllOscillatorDivergence(
        currIdx,
        prevIdx,
        'bullish',
        candles,
        config,
      );
      if (count > 0) {
        const smtData = smtResults.get(currIdx);
        results.push({
          time: candles[currIdx].time,
          price: lowData[currIdx],
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
}

/**
 * Scan candle data for divergence signals across all 7 oscillators + SMT.
 *
 * @param candles - Full candle array (only the last SCAN_LOOKBACK candles are used)
 * @param config  - Optional oscillator periods; falls back to DEFAULT_OSCILLATOR_CONFIG
 * @param correlatedCandles - Optional correlated asset candles for SMT divergence detection
 * @param mainSymbol - Main asset symbol (used to auto-detect correlation if needed)
 * @param enabledTimeframes - Timeframes selected in divergence settings for MTF cascade scoring
 * @param currentTimeframe  - The timeframe that `candles` represents (e.g. '1h')
 * @returns Array of DivergencePoint sorted by time ascending
 */
export function useDivergenceScanner(
  candles: CandleData[],
  config: OscillatorConfig = DEFAULT_OSCILLATOR_CONFIG,
  correlatedCandles?: CandleData[],
  mainSymbol?: string,
  enabledTimeframes?: TimeframeKey[],
  currentTimeframe?: TimeframeKey,
): DivergencePoint[] {
  const recentCandles = useMemo(
    () => candles.slice(-SCAN_LOOKBACK),
    [candles],
  );

  const recentCorrCandles = useMemo(
    () => (correlatedCandles ? correlatedCandles.slice(-SCAN_LOOKBACK) : undefined),
    [correlatedCandles],
  );

  return useMemo(() => {
    const tfIsEnabled = !!(currentTimeframe && enabledTimeframes?.includes(currentTimeframe));
    const mtfCascadeLevel = tfIsEnabled ? 1 : 0;
    const mtfCascadeBonus = getCascadeBonus(mtfCascadeLevel);
    const mtfActiveTimeframes: TimeframeKey[] = tfIsEnabled && currentTimeframe ? [currentTimeframe] : [];

    const base = scanDivergences(recentCandles, config, recentCorrCandles, mainSymbol);
    return base.map(d => ({ ...d, mtfCascadeLevel, mtfCascadeBonus, mtfActiveTimeframes }));
  }, [recentCandles, recentCorrCandles, config, mainSymbol, enabledTimeframes, currentTimeframe]);
}

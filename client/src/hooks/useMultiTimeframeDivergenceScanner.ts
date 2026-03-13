/**
 * useMultiTimeframeDivergenceScanner
 *
 * Fetches candle data for each user-selected timeframe, runs divergence
 * detection on each independently, and returns the primary (chart) timeframe's
 * divergence points enriched with true multi-timeframe cascade levels and
 * bonuses from the scoring engine.
 *
 * Cascade logic (from multiTimeframeDivergenceScoring.ts):
 *   - 1 active TF  → ×1.0 (no bonus)
 *   - 2 consecutive TFs → ×1.5
 *   - 3 consecutive TFs → ×2.5
 *   - 4+ consecutive TFs → ×4.0
 */

import { useState, useEffect, useMemo } from 'react';
import {
  scanDivergences,
  SCAN_LOOKBACK,
  DEFAULT_OSCILLATOR_CONFIG,
  type OscillatorConfig,
} from '@/hooks/useDivergenceScanner';
import {
  calculateMTFDivergenceScore,
  type TimeframeKey,
} from '@/lib/calculations/multiTimeframeDivergenceScoring';
import type { CandleData, DivergencePoint } from '@/types/chart.types';

/**
 * Total number of oscillators that can confirm a divergence.
 * Used to normalise a divergence's indicator count into a 0–100 base score.
 * Matches the 7 oscillators checked by checkAllOscillatorDivergence:
 * RSI, MACD, Stoch RSI, MFI, Williams %R, CCI, OBV.
 */
const MAX_OSCILLATOR_COUNT = 7;

/**
 * Scan candles for multiple timeframes and return the primary timeframe's
 * divergence points enriched with real MTF cascade data.
 *
 * @param symbol             - Trading pair symbol (e.g. 'BTCUSDT')
 * @param currentTimeframe   - The timeframe currently displayed on the chart
 * @param currentCandles     - Candle data for the current timeframe
 * @param enabledTimeframes  - Timeframes selected in divergence settings
 * @param config             - Oscillator configuration (optional)
 * @param correlatedCandles  - Optional correlated-asset candles for SMT detection
 * @param mainSymbol         - Main symbol for SMT correlation auto-detection
 * @returns DivergencePoint[] with correct mtfCascadeLevel/Bonus/ActiveTimeframes
 */
export function useMultiTimeframeDivergenceScanner(
  symbol: string,
  currentTimeframe: TimeframeKey,
  currentCandles: CandleData[],
  enabledTimeframes: TimeframeKey[],
  config: OscillatorConfig = DEFAULT_OSCILLATOR_CONFIG,
  correlatedCandles?: CandleData[],
  mainSymbol?: string,
): DivergencePoint[] {
  // ── State: fetched candles keyed by timeframe (non-current TFs only) ────────
  const [perTfCandles, setPerTfCandles] = useState<Partial<Record<TimeframeKey, CandleData[]>>>({});

  // Stable string key that changes only when the set of enabled TFs changes.
  // Sorting ensures ['1h','15m'] and ['15m','1h'] produce the same key.
  const enabledTfKey = useMemo(
    () => [...enabledTimeframes].sort().join(','),
    [enabledTimeframes],
  );

  // ── Fetch candles for non-current enabled timeframes ─────────────────────
  useEffect(() => {
    // Derive the other TFs from the stable key so there are no stale closures.
    const allTfs = enabledTfKey ? (enabledTfKey.split(',') as TimeframeKey[]) : [];
    const otherTfs = allTfs.filter(tf => tf !== currentTimeframe);

    if (!symbol || otherTfs.length === 0) {
      setPerTfCandles({});
      return;
    }

    let cancelled = false;

    const fetchAll = async () => {
      const results: Partial<Record<TimeframeKey, CandleData[]>> = {};

      await Promise.all(
        otherTfs.map(async tf => {
          try {
            const res = await fetch(
              `/api/crypto/extended-history?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(tf)}`,
            );
            if (!res.ok || cancelled) {
              if (!cancelled) {
                console.debug(`[MTF Divergence] HTTP ${res.status} fetching ${tf} candles for ${symbol}`);
              }
              return;
            }
            const data: unknown = await res.json();
            const candles =
              data !== null &&
              typeof data === 'object' &&
              'candles' in data &&
              Array.isArray((data as { candles: unknown }).candles)
                ? ((data as { candles: CandleData[] }).candles)
                : [];
            results[tf] = candles;
          } catch (err) {
            // Gracefully degrade: this TF simply won't contribute to cascade.
            console.debug(`[MTF Divergence] Failed to fetch ${tf} candles for ${symbol}:`, err);
          }
        }),
      );

      if (!cancelled) setPerTfCandles(results);
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [symbol, currentTimeframe, enabledTfKey]);

  // ── Scan each enabled TF for divergences ──────────────────────────────────
  //
  // For the primary (current) TF we always use the live `currentCandles`
  // (with SMT support). For other TFs we use the fetched candles without SMT.
  const perTfDivergences = useMemo(() => {
    const result: Partial<Record<TimeframeKey, ReturnType<typeof scanDivergences>>> = {};

    for (const tf of enabledTimeframes) {
      if (tf === currentTimeframe) {
        if (currentCandles.length >= 30) {
          result[tf] = scanDivergences(
            currentCandles.slice(-SCAN_LOOKBACK),
            config,
            correlatedCandles?.slice(-SCAN_LOOKBACK),
            mainSymbol,
          );
        }
      } else {
        const tfCandles = perTfCandles[tf];
        if (tfCandles && tfCandles.length >= 30) {
          result[tf] = scanDivergences(tfCandles.slice(-SCAN_LOOKBACK), config);
        }
      }
    }

    return result;
  }, [
    enabledTimeframes,
    currentTimeframe,
    currentCandles,
    config,
    correlatedCandles,
    mainSymbol,
    perTfCandles,
  ]);

  // ── Compute the MTF cascade result for each divergence direction ──────────
  //
  // We compute it once per type ('bullish'/'bearish') and reuse it for all
  // primary-TF divergence points of that type — this avoids redundant
  // calculateMTFDivergenceScore calls in the final map below.
  const cascadeByType = useMemo(() => {
    const computeForType = (type: 'bullish' | 'bearish') => {
      const sign = type === 'bullish' ? 1 : -1;
      const activeTimeframes: TimeframeKey[] = [];
      const baseScores: Partial<Record<TimeframeKey, number>> = {};

      for (const tf of enabledTimeframes) {
        const tfDivs = perTfDivergences[tf] ?? [];
        const typed = tfDivs.filter(d => d.type === type);
        if (typed.length > 0) {
          activeTimeframes.push(tf);
          // Use the most indicator-confluent divergence as the base score proxy.
          const best = typed.reduce((a, b) => (b.count > a.count ? b : a));
          baseScores[tf] = sign * (best.count / MAX_OSCILLATOR_COUNT) * 100;
        }
      }

      return calculateMTFDivergenceScore(enabledTimeframes, activeTimeframes, baseScores);
    };

    return {
      bullish: computeForType('bullish'),
      bearish: computeForType('bearish'),
    };
  }, [perTfDivergences, enabledTimeframes]);

  // ── Build the primary TF scan (always fresh, includes SMT) ────────────────
  //
  // If the current TF is in the enabled list, we already computed it above;
  // reuse it for consistency. Otherwise, compute separately so we always
  // have divergence points to display even when the current TF is not enabled.
  const primaryDivs = useMemo(() => {
    if (enabledTimeframes.includes(currentTimeframe)) {
      return perTfDivergences[currentTimeframe] ?? [];
    }
    if (currentCandles.length < 30) return [];
    return scanDivergences(
      currentCandles.slice(-SCAN_LOOKBACK),
      config,
      correlatedCandles?.slice(-SCAN_LOOKBACK),
      mainSymbol,
    );
  }, [
    enabledTimeframes,
    currentTimeframe,
    perTfDivergences,
    currentCandles,
    config,
    correlatedCandles,
    mainSymbol,
  ]);

  // ── Enrich each primary-TF divergence with the MTF cascade metadata ────────
  return useMemo(
    () =>
      primaryDivs.map(d => {
        const cascade = cascadeByType[d.type];
        return {
          ...d,
          mtfCascadeLevel: cascade.cascadeLevel,
          mtfCascadeBonus: cascade.cascadeBonus,
          mtfActiveTimeframes: cascade.activeTimeframes,
        };
      }),
    [primaryDivs, cascadeByType],
  );
}

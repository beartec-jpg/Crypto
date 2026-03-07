import { useMemo } from 'react';
import type { Candle } from '@/types/candle';
import type { FVGDetection, FVGSettings } from '@/types/fvg';

const VOLUME_LOOKBACK = 20;

interface UseFVGDetectionOptions {
  candles: Candle[];
  settings: FVGSettings;
}

/**
 * Calculate average volume over a lookback period ending at (but not including) index i.
 */
function getAverageVolume(candles: Candle[], index: number, lookback: number): number {
  const start = Math.max(0, index - lookback);
  const slice = candles.slice(start, index);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, c) => sum + c.volume, 0) / slice.length;
}

/**
 * Detect FVGs from a candle array and apply all filters and mitigation tracking.
 */
export function useFVGDetection({ candles, settings }: UseFVGDetectionOptions): FVGDetection[] {
  return useMemo(() => {
    if (!settings.enabled || candles.length < 3) return [];

    const raw: FVGDetection[] = [];

    // Phase 1: detect raw FVGs
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1]; // impulse candle
      const c3 = candles[i];

      let type: 'bullish' | 'bearish' | null = null;
      let top = 0;
      let bottom = 0;

      // Bullish FVG: candle 1 HIGH < candle 3 LOW
      if (c1.high < c3.low) {
        type = 'bullish';
        bottom = c1.high;
        top = c3.low;
      }
      // Bearish FVG: candle 1 LOW > candle 3 HIGH
      else if (c1.low > c3.high) {
        type = 'bearish';
        top = c1.low;
        bottom = c3.high;
      }

      if (!type) continue;

      const gapSize = top - bottom;
      const gapPercent = (gapSize / bottom) * 100;

      // Gap size filter
      if (gapPercent < settings.minGapPercent) continue;
      if (settings.maxGapPercent > 0 && gapPercent > settings.maxGapPercent) continue;

      // Volume filter
      const avgVolume = getAverageVolume(candles, i - 1, VOLUME_LOOKBACK);
      const volumeRatio = avgVolume > 0 ? c2.volume / avgVolume : 1;
      if (volumeRatio < settings.minVolumeRatio) continue;

      const ce = (top + bottom) / 2;

      raw.push({
        id: `fvg-${type}-${c1.time}`,
        type,
        startTime: c1.time,
        endTime: c3.time,
        top,
        bottom,
        ce,
        gapSize,
        gapPercent,
        volume: c2.volume,
        volumeRatio,
        mitigated: false,
        mitigationPercent: 0,
        mitigationTime: undefined,
        age: 0,
        isInverse: false,
        swept: false,
        sweepTime: undefined,
        sweepPrice: undefined,
        sweepIndex: undefined,
      });
    }

    // Phase 2: sweep detection, mitigation tracking and age
    const totalCandles = candles.length;
    const result: FVGDetection[] = [];
    const confirmationWindow = 3;

    for (const fvg of raw) {
      const startIdx = candles.findIndex(c => c.time === fvg.endTime);
      if (startIdx < 0) continue;

      let mitigated = false;
      let mitigationPercent = 0;
      let mitigationTime: number | undefined;
      let isInverse = false;
      let swept = false;
      let sweepTime: number | undefined;
      let sweepPrice: number | undefined;
      let sweepIndex: number | undefined;

      // Track lowest/highest price entry into the gap
      let lowestLowInGap = fvg.top;
      let highestHighInGap = fvg.bottom;

      for (let j = startIdx + 1; j < candles.length; j++) {
        const c = candles[j];

        if (fvg.type === 'bullish') {
          // Track partial mitigation
          if (c.low < fvg.top) {
            lowestLowInGap = Math.min(lowestLowInGap, c.low);
            mitigationPercent = Math.max(0, Math.min(100,
              (fvg.top - lowestLowInGap) / (fvg.top - fvg.bottom) * 100
            ));
          }

          // Check if wick went below the gap
          if (c.low < fvg.bottom && !swept && !mitigated) {
            // Look ahead for confirmation candles
            let closeBackInside = false;
            for (let k = j + 1; k <= Math.min(j + confirmationWindow, candles.length - 1); k++) {
              if (candles[k].close >= fvg.bottom) {
                swept = true;
                sweepTime = c.time;
                sweepPrice = c.low;
                sweepIndex = j;
                closeBackInside = true;
                break;
              }
            }

            // Fully mitigated when price closes below the bottom without returning
            if (c.close <= fvg.bottom) {
              mitigated = true;
              mitigationPercent = 100;
              mitigationTime = c.time;
              if (settings.detectIFVG) {
                isInverse = true;
              }
              break;
            }
          }
        } else {
          // Track partial mitigation
          if (c.high > fvg.bottom) {
            highestHighInGap = Math.max(highestHighInGap, c.high);
            mitigationPercent = Math.max(0, Math.min(100,
              (highestHighInGap - fvg.bottom) / (fvg.top - fvg.bottom) * 100
            ));
          }

          // Check if wick went above the gap
          if (c.high > fvg.top && !swept && !mitigated) {
            // Look ahead for confirmation candles
            let closeBackInside = false;
            for (let k = j + 1; k <= Math.min(j + confirmationWindow, candles.length - 1); k++) {
              if (candles[k].close <= fvg.top) {
                swept = true;
                sweepTime = c.time;
                sweepPrice = c.high;
                sweepIndex = j;
                closeBackInside = true;
                break;
              }
            }

            // Fully mitigated when price closes above the top without returning
            if (c.close >= fvg.top) {
              mitigated = true;
              mitigationPercent = 100;
              mitigationTime = c.time;
              if (settings.detectIFVG) {
                isInverse = true;
              }
              break;
            }
          }
        }
      }

      const age = totalCandles - 1 - startIdx;

      // Age filter
      if (age > settings.maxAge) continue;

      result.push({
        ...fvg,
        mitigated,
        mitigationPercent,
        mitigationTime,
        age,
        isInverse,
        swept,
        sweepTime,
        sweepPrice,
        sweepIndex,
      });
    }

    return result;
  }, [candles, settings]);
}

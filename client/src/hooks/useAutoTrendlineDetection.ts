import { useMemo } from 'react';
import { detectAutoTrendlines, type AutoTrendlineCandle } from '@/lib/indicators/autoTrendline';
import type { AutoTrendlineResult, AutoTrendlineSettings } from '@/types/autoTrendline';

export function useAutoTrendlineDetection(
  candles: AutoTrendlineCandle[],
  settings: AutoTrendlineSettings,
): AutoTrendlineResult {
  return useMemo(() => {
    if (!settings.enabled || !candles?.length) return { lines: [] };
    return detectAutoTrendlines(candles, settings);
  }, [candles, settings]);
}

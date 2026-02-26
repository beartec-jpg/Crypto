/**
 * Higher Timeframe (HTF) Bias type definitions.
 * Used to display multi-timeframe trend direction on the chart.
 */

import type { Bias } from '@/types/candle';

export interface HTFBiasEntry {
  timeframe: string;
  label: string;
  bias: Bias;
  isLoading: boolean;
}

export interface HTFBiasSettings {
  enabled: boolean;
  timeframes: string[];
}

export const DEFAULT_HTF_BIAS_SETTINGS: HTFBiasSettings = {
  enabled: true,
  timeframes: ['1d', '4h', '1h', '15m'],
};

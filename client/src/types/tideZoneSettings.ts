// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import type { TideSignalParams, TideStopKind, TideTimeframe } from '@/lib/indicators/tideSignals';

export type { TideTimeframe } from '@/lib/indicators/tideSignals';

/**
 * Per-timeframe Tide values (1h and 4h each keep their own).
 * `exitMinScore` is always present: a number means the exit-EMA peak must reach it, `null` means off.
 */
export type TideTimeframeSettings = Omit<TideSignalParams, 'exitMinScore'> & {
  exitMinScore: number | null;
};

export interface TideZoneSettings {
  byTimeframe: Record<TideTimeframe, TideTimeframeSettings>;
  showTideOut: boolean;
  showTideIn: boolean;
  showStops: boolean;
  /** Absorb boxes (legacy watch, not part of the validated presets). */
  showAbsorb: boolean;
  tideOutColor: string;
  tideOutPlusColor: string;
  tideInColor: string;
  stopColor: string;
  absorbColor: string;
  /** Absorb boxes kept on the chart. */
  keep: number;
}

/**
 * Fixed presets. Re-checked by the 205k-config grid in issue #609 (train 2019-2023, out-of-sample
 * 2024 to Nov 2026, 8 majors, fees included): nothing tuned beat these out of sample, and the
 * flip-flop guards, Pull exit and trend-EMA filters did not earn a place, so there are no settings.
 * Tide runs on 1h and 4h charts only (other intervals show "Tide: 1h/4h only").
 *
 * Original validation: presets from the live-accurate (non-repainting) re-search, BTC/ETH/XRP/SOL/BNB/DOGE,
 * train < 2024, holdout 2024+, fees included, Tide-in exit only.
 *  4h: 8/3/−20, exit EMA8 peak N5, stop pivot − 0.5 ATR → train PF 1.32 (n 206), holdout PF 1.92 (n 117, +1.44%/trade)
 *  1h: 21/8/−40, exit EMA8 peak N8, stop pivot − 0.5%  → train PF 2.00 (n 112), holdout PF 1.78 (n 66, +0.58%/trade)
 * Both also ship exitMinScore 0 (Tide in only when the exit-EMA peak is in the green). null turns that off.
 */
export const TIDE_PRESETS: Record<TideTimeframe, TideTimeframeSettings> = {
  '4h': {
    emaPeriod: 8,
    pivotN: 3,
    belowScore: -20,
    exitEmaPeriod: 8,
    exitPivotN: 5,
    exitMinScore: 0,
    stopKind: 'atr',
    stopAtrMult: 0.5,
    stopPct: 0.005,
  },
  '1h': {
    emaPeriod: 21,
    pivotN: 8,
    belowScore: -40,
    exitEmaPeriod: 8,
    exitPivotN: 8,
    exitMinScore: 0,
    stopKind: 'pct',
    stopAtrMult: 0.5,
    stopPct: 0.005,
  },
};

export const TIDE_ZONE_SETTINGS: TideZoneSettings = {
  byTimeframe: { '1h': { ...TIDE_PRESETS['1h'] }, '4h': { ...TIDE_PRESETS['4h'] } },
  showTideOut: true,
  showTideIn: true,
  showStops: true,
  showAbsorb: false,
  tideOutColor: '#c084fc',
  tideOutPlusColor: '#34d399',
  tideInColor: '#f59e0b',
  stopColor: '#f87171',
  absorbColor: '#22d3ee',
  keep: 8,
};

/** Kept as an alias for existing imports. */
export const DEFAULT_TIDE_ZONE_SETTINGS = TIDE_ZONE_SETTINGS;

/** Settings for the chart timeframe; null when Tide does not run on it. */
export function tideParamsFor(
  settings: TideZoneSettings,
  timeframe: TideTimeframe | null,
): TideTimeframeSettings | null {
  return timeframe ? settings.byTimeframe[timeframe] : null;
}

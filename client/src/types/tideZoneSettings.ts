import type { TideSignalParams, TideStopKind, TideTimeframe } from '@/lib/indicators/tideSignals';

export type { TideTimeframe } from '@/lib/indicators/tideSignals';

/** Per-timeframe Tide values (1h and 4h each keep their own). */
export type TideTimeframeSettings = TideSignalParams;

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
 * Validated presets from the live-accurate (non-repainting) re-search, BTC/ETH/XRP/SOL/BNB/DOGE,
 * train < 2024, holdout 2024+, fees included, Tide-in exit only.
 *  4h: 8/3/−20, exit EMA8 peak N5, stop pivot − 0.5 ATR → train PF 1.32 (n 206), holdout PF 1.92 (n 117, +1.44%/trade)
 *  1h: 21/8/−40, exit EMA8 peak N8, stop pivot − 0.5%  → train PF 2.00 (n 112), holdout PF 1.78 (n 66, +0.58%/trade)
 */
export const TIDE_PRESETS: Record<TideTimeframe, TideTimeframeSettings> = {
  '4h': {
    emaPeriod: 8,
    pivotN: 3,
    belowScore: -20,
    exitEmaPeriod: 8,
    exitPivotN: 5,
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
    stopKind: 'pct',
    stopAtrMult: 0.5,
    stopPct: 0.005,
  },
};

export const DEFAULT_TIDE_ZONE_SETTINGS: TideZoneSettings = {
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

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, x));
}

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

export function normalizeTideTimeframeSettings(
  raw: Partial<TideTimeframeSettings> | null | undefined,
  preset: TideTimeframeSettings,
): TideTimeframeSettings {
  const s = { ...preset, ...(raw || {}) };
  const stopKind: TideStopKind = s.stopKind === 'pct' || s.stopKind === 'atr' ? s.stopKind : preset.stopKind;
  return {
    emaPeriod: Math.round(clamp(s.emaPeriod, 2, 34, preset.emaPeriod)),
    pivotN: Math.round(clamp(s.pivotN, 2, 21, preset.pivotN)),
    belowScore: clamp(s.belowScore, -80, 0, preset.belowScore),
    exitEmaPeriod: Math.round(clamp(s.exitEmaPeriod, 2, 34, preset.exitEmaPeriod)),
    exitPivotN: Math.round(clamp(s.exitPivotN, 2, 21, preset.exitPivotN)),
    stopKind,
    stopAtrMult: clamp(s.stopAtrMult, 0, 5, preset.stopAtrMult),
    stopPct: clamp(s.stopPct, 0, 0.1, preset.stopPct),
  };
}

export function normalizeTideZoneSettings(raw: Partial<TideZoneSettings> | null | undefined): TideZoneSettings {
  const d = DEFAULT_TIDE_ZONE_SETTINGS;
  const s = { ...d, ...(raw || {}) };
  const by = (raw?.byTimeframe || {}) as Partial<Record<TideTimeframe, Partial<TideTimeframeSettings>>>;
  return {
    byTimeframe: {
      '1h': normalizeTideTimeframeSettings(by['1h'], TIDE_PRESETS['1h']),
      '4h': normalizeTideTimeframeSettings(by['4h'], TIDE_PRESETS['4h']),
    },
    showTideOut: s.showTideOut !== false,
    showTideIn: s.showTideIn !== false,
    showStops: s.showStops !== false,
    showAbsorb: s.showAbsorb === true,
    tideOutColor: color(s.tideOutColor, d.tideOutColor),
    tideOutPlusColor: color(s.tideOutPlusColor, d.tideOutPlusColor),
    tideInColor: color(s.tideInColor, d.tideInColor),
    stopColor: color(s.stopColor, d.stopColor),
    absorbColor: color(s.absorbColor, d.absorbColor),
    keep: Math.round(clamp(s.keep, 2, 24, d.keep)),
  };
}

/** Settings for the chart timeframe; null when Tide does not run on it. */
export function tideParamsFor(
  settings: TideZoneSettings,
  timeframe: TideTimeframe | null,
): TideTimeframeSettings | null {
  return timeframe ? settings.byTimeframe[timeframe] : null;
}

export function isTidePreset(values: TideTimeframeSettings, timeframe: TideTimeframe): boolean {
  const p = TIDE_PRESETS[timeframe];
  return (Object.keys(p) as (keyof TideTimeframeSettings)[]).every((k) => values[k] === p[k]);
}

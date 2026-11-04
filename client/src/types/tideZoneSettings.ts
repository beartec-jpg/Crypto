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
 * Validated presets from the live-accurate (non-repainting) re-search, BTC/ETH/XRP/SOL/BNB/DOGE,
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

function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

/** Preset default when the stored score is missing or not a finite number. */
function presetExitMinScore(preset: TideTimeframeSettings): number {
  return round1(clamp(preset.exitMinScore, -100, 100, 0));
}

/**
 * null stays disabled. Missing, undefined, or non-finite falls back to the preset (0).
 * Anything else is clamped to [-100, 100] and rounded to 1 decimal.
 */
function resolveExitMinScore(
  raw: Partial<TideTimeframeSettings> | null | undefined,
  preset: TideTimeframeSettings,
): number | null {
  const fallback = presetExitMinScore(preset);
  if (raw == null || !Object.prototype.hasOwnProperty.call(raw, 'exitMinScore')) return fallback;
  const v = raw.exitMinScore;
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return round1(clamp(v, -100, 100, fallback));
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
  // Other flip-flop guards: the key is stored only when it is not the default, so a stock preset
  // stays equal to TIDE_PRESETS. exitMinScore is first-class and always stored (number or null).
  const guards: {
    exitPeakAfterEntry?: true;
    minHoldBars?: number;
    cooldownBars?: number;
  } = {};
  if (s.exitPeakAfterEntry === true) guards.exitPeakAfterEntry = true;
  const minHold = Math.round(clamp(s.minHoldBars, 0, 48, 0));
  if (minHold > 0) guards.minHoldBars = minHold;
  const cooldown = Math.round(clamp(s.cooldownBars, 0, 96, 0));
  if (cooldown > 0) guards.cooldownBars = cooldown;
  return {
    ...guards,
    emaPeriod: Math.round(clamp(s.emaPeriod, 2, 34, preset.emaPeriod)),
    pivotN: Math.round(clamp(s.pivotN, 2, 21, preset.pivotN)),
    belowScore: clamp(s.belowScore, -80, 0, preset.belowScore),
    exitEmaPeriod: Math.round(clamp(s.exitEmaPeriod, 2, 34, preset.exitEmaPeriod)),
    exitPivotN: Math.round(clamp(s.exitPivotN, 2, 21, preset.exitPivotN)),
    exitMinScore: resolveExitMinScore(raw, preset),
    stopKind,
    stopAtrMult: clamp(s.stopAtrMult, 0, 5, preset.stopAtrMult),
    stopPct: clamp(s.stopPct, 0, 0.1, preset.stopPct),
  };
}

/** Dirty or partial timeframe values (persisted settings, including ones that predate exitMinScore). */
export type TideTimeframeSettingsInput = Partial<Omit<TideTimeframeSettings, 'exitMinScore'>> & {
  /** null = disabled. Missing or undefined = preset default. A number is clamped. */
  exitMinScore?: number | null;
};

export function normalizeTideZoneSettings(
  raw: (Partial<Omit<TideZoneSettings, 'byTimeframe'>> & {
    byTimeframe?: Partial<Record<TideTimeframe, TideTimeframeSettingsInput>>;
  }) | null | undefined,
): TideZoneSettings {
  const d = DEFAULT_TIDE_ZONE_SETTINGS;
  const s = { ...d, ...(raw || {}) };
  const by = raw?.byTimeframe ?? {};
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

// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import type { TideCrossDriver, TideCrossParams } from '@/lib/indicators/tideSignals';

export type { TideTimeframe, TideCrossDriver } from '@/lib/indicators/tideSignals';

/**
 * The only things you can change on Tide Zone: two EMAs of the score, the two signal levels,
 * and which EMA drives the Tide in / Tide out cross.
 */
export interface TideZoneSettings extends TideCrossParams {
  emaShort: number;
  emaLong: number;
  /** 0 to -80. Tide in only counts at score <= this. */
  tideInLevel: number;
  /** 0 to 80. Tide out only counts at score >= this. */
  tideOutLevel: number;
  crossEma: TideCrossDriver;
}

export const TIDE_EMA_MIN = 1;
export const TIDE_EMA_MAX = 100;
export const TIDE_IN_MIN = -80;
export const TIDE_OUT_MAX = 80;

export const TIDE_ZONE_SETTINGS: TideZoneSettings = {
  emaShort: 8,
  emaLong: 21,
  tideInLevel: -40,
  tideOutLevel: 40,
  crossEma: 'short',
};

/** Kept as an alias for existing imports. */
export const DEFAULT_TIDE_ZONE_SETTINGS = TIDE_ZONE_SETTINGS;

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Coerce anything (old/partial/garbage storage) into valid settings. Missing fields use the defaults. */
export function normalizeTideZoneSettings(raw: unknown): TideZoneSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = TIDE_ZONE_SETTINGS;
  return {
    emaShort: clampInt(r.emaShort, TIDE_EMA_MIN, TIDE_EMA_MAX, d.emaShort),
    emaLong: clampInt(r.emaLong, TIDE_EMA_MIN, TIDE_EMA_MAX, d.emaLong),
    tideInLevel: clampInt(r.tideInLevel, TIDE_IN_MIN, 0, d.tideInLevel),
    tideOutLevel: clampInt(r.tideOutLevel, 0, TIDE_OUT_MAX, d.tideOutLevel),
    crossEma: r.crossEma === 'long' ? 'long' : 'short',
  };
}

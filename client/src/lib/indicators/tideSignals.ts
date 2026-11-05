// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
/**
 * Tide in / Tide out: two EMAs of the Tide score, and the moments one of them crosses the histogram.
 *
 *   Tide in  = the EMA crosses BELOW the histogram (score crosses up through the EMA),
 *              and only counts when the score on that bar is <= the Tide-in level (0 to -80).
 *   Tide out = the EMA crosses ABOVE the histogram (score crosses down through the EMA),
 *              and only counts when the score on that bar is >= the Tide-out level (0 to 80).
 *
 * Which EMA drives the cross (Short or Long) is a setting. Both EMAs are always drawn.
 *
 * No repaint: a cross is only evaluated on a closed bar, using that bar and the one before it.
 * The EMA is causal (each value depends only on bars up to it), so a signal that has printed
 * never moves or disappears when later bars arrive. The still-forming last bar is ignored.
 */
import { emaTideScore, type TideZonePoint } from '@/lib/indicators/tideZone';

export type TideTimeframe = '1h' | '4h';
export const TIDE_TIMEFRAMES: readonly TideTimeframe[] = ['1h', '4h'] as const;

export interface TideCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ─── timeframe helpers ──────────────────────────────────────────────────────

export function tideTimeframeOf(tf: string | null | undefined): TideTimeframe | null {
  if (!tf) return null;
  const s = String(tf).trim().toLowerCase();
  if (s === '1h' || s === '60' || s === '60m' || s === '1hour') return '1h';
  if (s === '4h' || s === '240' || s === '240m' || s === '4hour') return '4h';
  return null;
}

export function medianBarSeconds(candles: { time: number }[]): number {
  if (candles.length < 2) return 0;
  const dts: number[] = [];
  const n = Math.min(candles.length, 80);
  for (let i = 1; i < n; i++) {
    const d = candles[i].time - candles[i - 1].time;
    if (d > 0) dts.push(d);
  }
  if (!dts.length) return 0;
  dts.sort((a, b) => a - b);
  return dts[Math.floor(dts.length / 2)];
}

/** Bar spacing → timeframe. Used where the chart interval is not passed in. */
export function inferTideTimeframe(candles: { time: number }[]): TideTimeframe | null {
  const dt = medianBarSeconds(candles);
  if (dt === 3600) return '1h';
  if (dt === 14400) return '4h';
  return null;
}

/** Explicit interval wins; fall back to candle spacing only when none was given. */
export function resolveTideTimeframe(
  timeframe: string | null | undefined,
  candles: { time: number }[],
): TideTimeframe | null {
  if (timeframe != null && timeframe !== '') return tideTimeframeOf(timeframe);
  return inferTideTimeframe(candles);
}

// ─── cross detection ────────────────────────────────────────────────────────

export type TideCrossDriver = 'short' | 'long';
export type TideCrossKind = 'in' | 'out';

export interface TideCrossParams {
  emaShort: number;
  emaLong: number;
  /** Tide in only counts at score <= this (0 to -80). */
  tideInLevel: number;
  /** Tide out only counts at score >= this (0 to 80). */
  tideOutLevel: number;
  /** Which EMA is crossed against the histogram. */
  crossEma: TideCrossDriver;
}

export interface TideCrossSignal {
  /** Time of the bar on which the cross is confirmed (the closed bar). */
  time: number;
  kind: TideCrossKind;
  score: number;
  /** Value of the driving EMA on that bar. */
  ema: number;
}

export interface TideCrossResult {
  emaShort: { time: number; value: number }[];
  emaLong: { time: number; value: number }[];
  signals: TideCrossSignal[];
  /** True when the newest bar is still forming (it is excluded from signals). */
  lastBarOpen: boolean;
}

export interface TideCrossOptions {
  /** Unix seconds "now" (tests). Defaults to the wall clock. */
  nowSec?: number;
}

/**
 * Compute both EMAs and the Tide in / Tide out crosses.
 * The first `period` bars of the driving EMA are a warm-up (the EMA is seeded on the first score)
 * and never signal.
 */
export function computeTideCross(
  data: TideZonePoint[],
  params: TideCrossParams,
  opts: TideCrossOptions = {},
): TideCrossResult {
  const emaShort = emaTideScore(data, params.emaShort);
  const emaLong = emaTideScore(data, params.emaLong);
  const driver = params.crossEma === 'long' ? emaLong : emaShort;
  const period = params.crossEma === 'long' ? params.emaLong : params.emaShort;

  const now = opts.nowSec ?? Date.now() / 1000;
  const barSec = medianBarSeconds(data);
  const last = data[data.length - 1];
  const lastBarOpen = !!last && barSec > 0 && last.time + barSec > now;
  const end = lastBarOpen ? data.length - 1 : data.length;

  const signals: TideCrossSignal[] = [];
  const warmup = Math.max(1, period);
  for (let i = Math.max(1, warmup); i < end; i++) {
    const prevDiff = data[i - 1].score - driver[i - 1].value;
    const diff = data[i].score - driver[i].value;
    const score = data[i].score;
    if (prevDiff <= 0 && diff > 0 && score <= params.tideInLevel) {
      signals.push({ time: data[i].time, kind: 'in', score, ema: driver[i].value });
    } else if (prevDiff >= 0 && diff < 0 && score >= params.tideOutLevel) {
      signals.push({ time: data[i].time, kind: 'out', score, ema: driver[i].value });
    }
  }
  return { emaShort, emaLong, signals, lastBarOpen };
}

/** The newest signal if it happened within `bars` bars of the last closed bar. */
export function freshTideCross(
  signals: TideCrossSignal[],
  data: TideZonePoint[],
  bars = 3,
): TideCrossSignal | null {
  const s = signals[signals.length - 1];
  if (!s || !data.length) return null;
  const idx = data.findIndex((p) => p.time === s.time);
  if (idx < 0) return null;
  return data.length - 1 - idx < bars ? s : null;
}

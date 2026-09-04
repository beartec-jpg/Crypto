/**
 * Keep bottom oscillator panes locked to the main chart viewport.
 *
 * Prefer **logical** range so empty space past the last candle (when the user
 * pans left / shifts price bars left) is mirrored on oscillators. Time-only
 * setVisibleRange often fails or clamps when `to` is past the last data point,
 * leaving volume/RSI full-width against the right edge.
 */

import type { IChartApi, Time } from 'lightweight-charts';

export type TimeVisibleRange = { from: Time; to: Time };

export type LogicalVisibleRange = { from: number; to: number };

/** Shape published by the fullscreen main chart (and accepted in legacy form). */
export type MainChartVisibleRange =
  | {
      time: TimeVisibleRange | null;
      logical: LogicalVisibleRange | null;
      /** candlesKey (`symbol_tf`) this range was read from — skip apply if it does not match. */
      key?: string;
    }
  | TimeVisibleRange
  | null
  | undefined;

function isLegacyTimeRange(range: MainChartVisibleRange): range is TimeVisibleRange {
  return (
    !!range &&
    typeof range === 'object' &&
    'from' in range &&
    'to' in range &&
    !('logical' in range) &&
    !('time' in range)
  );
}

function logicalLooksSane(logical: LogicalVisibleRange): boolean {
  if (!Number.isFinite(logical.from) || !Number.isFinite(logical.to)) return false;
  if (logical.to <= logical.from) return false;
  // Leftover range from a denser TF (e.g. 15m 2800–3000 on a 500-bar 1h pane)
  // shoves the oscillator into empty space / the far left.
  if (logical.from > 20_000 || logical.to > 50_000) return false;
  if (logical.to - logical.from < 2) return false;
  return true;
}

/**
 * Apply the main chart viewport to an oscillator chart.
 *
 * Prefer **logical** range. `setVisibleRange` (time) clamps `to` to the last
 * datapoint, so empty space past the last candle (main-chart rightOffset /
 * pan-left whitespace) is dropped and panes stay glued to the right edge.
 * Time is the fallback when logical is missing or looks like a leftover TF.
 */
export function applyMainChartVisibleRange(
  chart: IChartApi | null | undefined,
  range: MainChartVisibleRange,
  expectKey?: string,
): boolean {
  if (!chart || !range) return false;

  if (
    expectKey &&
    !isLegacyTimeRange(range) &&
    typeof (range as { key?: string }).key === 'string' &&
    (range as { key?: string }).key !== expectKey
  ) {
    return false;
  }

  try {
    const ts = chart.timeScale();

    if (isLegacyTimeRange(range)) {
      ts.setVisibleRange(range);
      return true;
    }

    const packed = range as {
      time: TimeVisibleRange | null;
      logical: LogicalVisibleRange | null;
    };

    if (packed.logical && logicalLooksSane(packed.logical)) {
      try {
        ts.setVisibleLogicalRange(packed.logical);
        return true;
      } catch {
        // fall through to time
      }
    }

    if (packed.time?.from != null && packed.time?.to != null) {
      try {
        ts.setVisibleRange(packed.time);
        return true;
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }

  return false;
}

/** Read both time + logical ranges from the main chart. */
export function readMainChartVisibleRange(
  chart: IChartApi | null | undefined,
  key?: string,
): {
  time: TimeVisibleRange | null;
  logical: LogicalVisibleRange | null;
  key?: string;
} {
  if (!chart) return { time: null, logical: null, key };
  try {
    const ts = chart.timeScale();
    const time = (ts.getVisibleRange?.() as TimeVisibleRange | null) ?? null;
    const logical = (ts.getVisibleLogicalRange?.() as LogicalVisibleRange | null) ?? null;
    return { time, logical, key };
  } catch {
    return { time: null, logical: null, key };
  }
}

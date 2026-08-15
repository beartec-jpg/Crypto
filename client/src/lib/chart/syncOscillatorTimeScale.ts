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

/**
 * Apply the main chart viewport to an oscillator chart.
 * Returns true if a range was applied.
 */
export function applyMainChartVisibleRange(
  chart: IChartApi | null | undefined,
  range: MainChartVisibleRange,
): boolean {
  if (!chart || !range) return false;

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

    if (
      packed.logical &&
      Number.isFinite(packed.logical.from) &&
      Number.isFinite(packed.logical.to) &&
      packed.logical.to > packed.logical.from
    ) {
      try {
        ts.setVisibleLogicalRange(packed.logical);
        return true;
      } catch {
        // fall through to time range
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
export function readMainChartVisibleRange(chart: IChartApi | null | undefined): {
  time: TimeVisibleRange | null;
  logical: LogicalVisibleRange | null;
} {
  if (!chart) return { time: null, logical: null };
  try {
    const ts = chart.timeScale();
    const time = (ts.getVisibleRange?.() as TimeVisibleRange | null) ?? null;
    const logical = (ts.getVisibleLogicalRange?.() as LogicalVisibleRange | null) ?? null;
    return { time, logical };
  } catch {
    return { time: null, logical: null };
  }
}

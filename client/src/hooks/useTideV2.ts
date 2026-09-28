import { useMemo, useRef } from 'react';
import {
  buildTideTrades,
  computeTideV2,
  mergeTideSignals,
  type TideCandle,
  type TideOutSignal,
  type TideTimeframe,
  type TideV2Result,
} from '@/lib/indicators/tideSignals';
import type { TidePrintZone, TideZonePoint } from '@/lib/indicators/tideZone';
import type { TideOverlay } from '@/lib/chartPrimitives/TideAccumPrimitive';
import type { TideZoneSettings } from '@/types/tideZoneSettings';

interface UseTideV2Args {
  candles: TideCandle[];
  tideZone: TideZonePoint[];
  /** '1h' | '4h'; null = Tide is off on this chart timeframe. */
  timeframe: TideTimeframe | null;
  settings: TideZoneSettings;
  /** Symbol + interval of the loaded candles. Signals are remembered per key for the session. */
  seriesKey: string;
  enabled: boolean;
}

/**
 * Tide v2 for one chart. Signals come from `computeTideV2` (point-in-time) and are also kept in a
 * per-series ledger, so a signal that was shown is never taken off the chart during the session —
 * even if the loaded history window shifts and the recomputed warm-up nudges a borderline value.
 */
export function useTideV2({ candles, tideZone, timeframe, settings, seriesKey, enabled }: UseTideV2Args): TideV2Result | null {
  const ledger = useRef<{ key: string; signals: TideOutSignal[] }>({ key: '', signals: [] });
  const params = timeframe ? settings.byTimeframe[timeframe] : null;
  const paramsKey = params ? JSON.stringify(params) : '';

  return useMemo(() => {
    if (!enabled || !timeframe || !params || !tideZone.length || !candles.length) return null;
    const res = computeTideV2(candles, tideZone, params);
    const key = `${seriesKey}|${timeframe}|${paramsKey}`;
    const prev = ledger.current.key === key ? ledger.current.signals : [];
    const merged = mergeTideSignals(prev, res.signals);
    ledger.current = { key, signals: merged };
    if (merged.length === res.signals.length) return res;
    return { ...res, signals: merged, trades: buildTideTrades(candles, merged, res.peaks, params) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeframe, paramsKey, tideZone, candles, seriesKey]);
}

/** Chart overlay (markers + stop lines) for the primitive. */
export function buildTideOverlay(
  candles: TideCandle[],
  res: TideV2Result | null,
  settings: Pick<TideZoneSettings, 'showTideOut' | 'showTideIn' | 'showStops'>,
  absorb: TidePrintZone[] = [],
): TideOverlay {
  if (!res) return { tideOut: [], tideIn: [], stops: [], absorb };
  const bars = new Map<number, TideCandle>();
  for (const c of candles) bars.set(c.time, c);
  const tideOut = settings.showTideOut
    ? res.signals.flatMap((s) => {
        const bar = bars.get(s.confirmTime);
        if (!bar) return [];
        return [
          {
            time: s.confirmTime,
            barLow: bar.low,
            plus: s.rsiPlus,
            pivotTime: s.pivotTime,
            pivotPrice: s.pivotPrice,
            pivot1Time: s.pivot1Time,
            pivot1Price: s.pivot1Price,
          },
        ];
      })
    : [];
  const inTimes = new Set<number>();
  for (const t of res.trades) if (t.outcome === 'tide_in' && t.tideInTime != null) inTimes.add(t.tideInTime);
  const tideIn = settings.showTideIn
    ? [...inTimes].sort((a, b) => a - b).flatMap((time) => {
        const bar = bars.get(time);
        return bar ? [{ time, barHigh: bar.high }] : [];
      })
    : [];
  const stops = settings.showStops
    ? res.trades.map((t) => ({ startTime: t.signal.confirmTime, endTime: t.endTime, price: t.stop, outcome: t.outcome }))
    : [];
  return { tideOut, tideIn, stops, absorb };
}

export interface TideStatus {
  /** Fresh print within the last `recentBars` bars. */
  fresh: 'out' | 'out_plus' | 'in' | 'stop' | null;
  /** Stop of the newest still-open Tide-out, if any. */
  activeStop: number | null;
  openCount: number;
}

export function summarizeTide(res: TideV2Result | null, candles: { time: number }[], recentBars = 3): TideStatus {
  if (!res || !candles.length) return { fresh: null, activeStop: null, openCount: 0 };
  const recent = new Set(candles.slice(-recentBars).map((c) => c.time));
  const open = res.trades.filter((t) => t.outcome === 'open');
  let fresh: TideStatus['fresh'] = null;
  const lastSig = [...res.signals].reverse().find((s) => recent.has(s.confirmTime));
  const lastIn = res.trades.find((t) => t.tideInTime != null && recent.has(t.tideInTime));
  const lastStop = res.trades.find((t) => t.outcome === 'stop' && t.exitTime != null && recent.has(t.exitTime));
  if (lastSig) fresh = lastSig.rsiPlus ? 'out_plus' : 'out';
  else if (lastIn) fresh = 'in';
  else if (lastStop) fresh = 'stop';
  return { fresh, activeStop: open.length ? open[open.length - 1].stop : null, openCount: open.length };
}

// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { useEffect, useMemo } from 'react';
import { createSeriesMarkers, type ISeriesApi, type SeriesMarker, type Time } from 'lightweight-charts';
import type { TideZonePoint } from '@/lib/indicators/tideZone';
import { computeTideCross, type TideTimeframe } from '@/lib/indicators/tideSignals';
import { TIDE_IN_COLOR, TIDE_OUT_COLOR } from '@/lib/indicators/tideColors';
import { useTideZoneSettings } from '@/hooks/useTideZoneSettings';

interface Props {
  candleSeries: ISeriesApi<'Candlestick'> | null;
  tideZone: TideZonePoint[];
  /** '1h' | '4h'; null = Tide is blank on this chart timeframe. */
  timeframe: TideTimeframe | null;
  enabled: boolean;
}

/** Main-chart Tide in / Tide out markers (same signals as the Tide pane). Renders nothing itself. */
export function TideCrossMarkers({ candleSeries, tideZone, timeframe, enabled }: Props) {
  const { settings } = useTideZoneSettings();
  const markers = useMemo<SeriesMarker<Time>[]>(() => {
    if (!enabled || !timeframe || !tideZone.length) return [];
    return computeTideCross(tideZone, settings).signals.map((sg) =>
      sg.kind === 'in'
        ? { time: sg.time as Time, position: 'belowBar', shape: 'arrowUp', color: TIDE_IN_COLOR, text: 'Tide in' }
        : { time: sg.time as Time, position: 'aboveBar', shape: 'arrowDown', color: TIDE_OUT_COLOR, text: 'Tide out' },
    );
  }, [enabled, timeframe, tideZone, settings]);

  useEffect(() => {
    if (!candleSeries || !markers.length) return;
    let plugin: ReturnType<typeof createSeriesMarkers<Time>> | null = null;
    try {
      plugin = createSeriesMarkers(candleSeries, markers);
    } catch {
      return;
    }
    return () => {
      try {
        plugin?.detach();
      } catch {
        /* series already disposed */
      }
    };
  }, [candleSeries, markers]);

  return null;
}

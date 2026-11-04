import { useEffect, useRef } from 'react';
import {
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import { buildTetherMarkers, type TetherDivergenceComputeResult } from '@/lib/indicators/tetherDivergence';
import type { TetherDivergenceSettings } from '@/types/tetherDivergenceSettings';

interface TetherDivergenceOverlayProps {
  chart: IChartApi | null;
  candles: Array<{ time: number; close?: number }>;
  result: TetherDivergenceComputeResult | null | undefined;
  settings: TetherDivergenceSettings;
  enabled: boolean;
}

export function TetherDivergenceOverlay({
  chart,
  candles,
  result,
  settings,
  enabled,
}: TetherDivergenceOverlayProps) {
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!chart || !enabled) {
      if (markersRef.current) {
        try { markersRef.current.detach(); } catch { /* disposed */ }
        markersRef.current = null;
      }
      if (seriesRef.current && chart) {
        try { chart.removeSeries(seriesRef.current); } catch { /* disposed */ }
        seriesRef.current = null;
      }
      return;
    }

    try {
      if (!seriesRef.current) {
        seriesRef.current = chart.addSeries(LineSeries, {
          color: 'rgba(0,0,0,0)',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
      }
      if (!markersRef.current && seriesRef.current) {
        markersRef.current = createSeriesMarkers(seriesRef.current, []);
      }
    } catch {
      return;
    }

    return () => {
      if (markersRef.current) {
        try { markersRef.current.detach(); } catch { /* disposed */ }
        markersRef.current = null;
      }
      if (seriesRef.current && chart) {
        try { chart.removeSeries(seriesRef.current); } catch { /* disposed */ }
        seriesRef.current = null;
      }
    };
  }, [chart, enabled]);

  useEffect(() => {
    if (!enabled || !seriesRef.current || !candles.length) {
      markersRef.current?.setMarkers([]);
      return;
    }
    try {
      seriesRef.current.setData(
        candles.map((c) => ({ time: c.time as Time, value: c.close ?? 0 })),
      );
      if (!settings.showMarkers || !result) {
        markersRef.current?.setMarkers([]);
        return;
      }
      const marks: SeriesMarker<Time>[] = buildTetherMarkers(result.crosses, settings).map((m) => ({
        time: m.time as Time,
        position: 'belowBar',
        shape: 'arrowUp',
        color: m.color,
        text: m.text,
      }));
      marks.sort((a, b) => (a.time as number) - (b.time as number));
      markersRef.current?.setMarkers(marks);
    } catch {
      /* disposed */
    }
  }, [enabled, candles, result, settings]);

  return null;
}

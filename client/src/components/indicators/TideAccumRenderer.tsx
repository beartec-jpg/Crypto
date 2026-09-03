import { useEffect, useMemo, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { TideAccumPrimitive } from '@/lib/chartPrimitives/TideAccumPrimitive';
import { findTideAccumZones, type TideZonePoint } from '@/lib/indicators/tideZone';

interface TideAccumRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  candles: { time: number; low: number }[];
  tideZone: TideZonePoint[];
  emaPeriod: number;
  enabled: boolean;
}

export function TideAccumRenderer({
  chart,
  candleSeries,
  candles,
  tideZone,
  emaPeriod,
  enabled,
}: TideAccumRendererProps) {
  const primitiveRef = useRef<TideAccumPrimitive | null>(null);
  const zones = useMemo(
    () => (enabled && tideZone.length ? findTideAccumZones(candles, tideZone, emaPeriod) : []),
    [enabled, candles, tideZone, emaPeriod],
  );

  useEffect(() => {
    if (!chart || !candleSeries || !enabled) return;
    const primitive = new TideAccumPrimitive(zones);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach Tide accum primitive:', e);
    }
    return () => {
      try {
        candleSeries.detachPrimitive(primitive);
      } catch {
        /* disposed */
      }
      if (primitiveRef.current === primitive) primitiveRef.current = null;
    };
  }, [chart, candleSeries, enabled]);

  useEffect(() => {
    primitiveRef.current?.update(zones);
  }, [zones]);

  return null;
}

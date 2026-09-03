import { useEffect, useMemo, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { TideAccumPrimitive } from '@/lib/chartPrimitives/TideAccumPrimitive';
import { findTideAbsorbZones, findTideDivZones, type TideZonePoint } from '@/lib/indicators/tideZone';
import type { TideZoneSettings } from '@/types/tideZoneSettings';

interface TideAccumRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  candles: { time: number; low: number; high?: number }[];
  tideZone: TideZonePoint[];
  settings: TideZoneSettings;
  enabled: boolean;
}

export function TideAccumRenderer({
  chart,
  candleSeries,
  candles,
  tideZone,
  settings,
  enabled,
}: TideAccumRendererProps) {
  const primitiveRef = useRef<TideAccumPrimitive | null>(null);
  const zones = useMemo(() => {
    if (!enabled || !tideZone.length) return [];
    const div = settings.showDiv
      ? findTideDivZones(candles, tideZone, settings)
      : [];
    const absorb = settings.showAbsorb
      ? findTideAbsorbZones(candles, tideZone, settings.keep)
      : [];
    return [...div, ...absorb];
  }, [enabled, candles, tideZone, settings]);
  const style = useMemo(
    () => ({ divColor: settings.divColor, absorbColor: settings.absorbColor }),
    [settings.divColor, settings.absorbColor],
  );

  useEffect(() => {
    if (!chart || !candleSeries || !enabled) return;
    const primitive = new TideAccumPrimitive(zones, style);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach Tide print primitive:', e);
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
    primitiveRef.current?.update(zones, style);
  }, [zones, style]);

  return null;
}

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
      ? findTideDivZones(candles, tideZone, {
          emaPeriod: settings.emaPeriod,
          confirmBars: settings.confirmBars,
          belowScore: settings.belowScore,
          keep: settings.keep,
        })
      : [];
    const absorb = settings.showAbsorb
      ? findTideAbsorbZones(candles, tideZone, {
          emaPeriod: settings.emaPeriod,
          confirmBars: settings.confirmBars,
          keep: settings.keep,
        })
      : [];
    const divKey = new Set(div.map((z) => `${z.t1}:${z.t2}`));
    return [...div, ...absorb.filter((z) => !divKey.has(`${z.t1}:${z.t2}`))];
  }, [
    enabled,
    candles,
    tideZone,
    settings.showDiv,
    settings.showAbsorb,
    settings.emaPeriod,
    settings.confirmBars,
    settings.belowScore,
    settings.keep,
  ]);
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
  }, [chart, candleSeries, enabled, settings.confirmBars, settings.emaPeriod]);

  useEffect(() => {
    primitiveRef.current?.update(zones, style);
  }, [zones, style]);

  return null;
}

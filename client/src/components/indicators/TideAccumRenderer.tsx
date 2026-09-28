import { useEffect, useMemo, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { EMPTY_TIDE_OVERLAY, TideAccumPrimitive } from '@/lib/chartPrimitives/TideAccumPrimitive';
import { findTideAbsorbZones, type TideZonePoint } from '@/lib/indicators/tideZone';
import type { TideCandle, TideTimeframe, TideV2Result } from '@/lib/indicators/tideSignals';
import { buildTideOverlay } from '@/hooks/useTideV2';
import type { TideZoneSettings } from '@/types/tideZoneSettings';

interface TideAccumRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  candles: TideCandle[];
  tideZone: TideZonePoint[];
  /** '1h' | '4h'; null = Tide is blank on this chart timeframe. */
  timeframe: TideTimeframe | null;
  /** Point-in-time Tide v2 signals for this chart (from useTideV2). */
  tide: TideV2Result | null;
  settings: TideZoneSettings;
  enabled: boolean;
}

/** Main-chart Tide overlay: Tide out / Tide out + markers, Tide in exits, stop lines. */
export function TideAccumRenderer({
  chart,
  candleSeries,
  candles,
  tideZone,
  timeframe,
  tide,
  settings,
  enabled,
}: TideAccumRendererProps) {
  const primitiveRef = useRef<TideAccumPrimitive | null>(null);
  const params = timeframe ? settings.byTimeframe[timeframe] : null;
  const absorb = useMemo(() => {
    if (!enabled || !params || !settings.showAbsorb || !tideZone.length) return [];
    return findTideAbsorbZones(candles, tideZone, {
      emaPeriod: params.emaPeriod,
      confirmBars: params.pivotN,
      keep: settings.keep,
    });
  }, [enabled, params, settings.showAbsorb, settings.keep, candles, tideZone]);

  const overlay = useMemo(
    () => (enabled && timeframe ? buildTideOverlay(candles, tide, settings, absorb) : EMPTY_TIDE_OVERLAY),
    [enabled, timeframe, candles, tide, settings, absorb],
  );
  const style = useMemo(
    () => ({
      tideOutColor: settings.tideOutColor,
      tideOutPlusColor: settings.tideOutPlusColor,
      tideInColor: settings.tideInColor,
      stopColor: settings.stopColor,
      absorbColor: settings.absorbColor,
    }),
    [settings.tideOutColor, settings.tideOutPlusColor, settings.tideInColor, settings.stopColor, settings.absorbColor],
  );

  useEffect(() => {
    if (!chart || !candleSeries || !enabled) return;
    const primitive = new TideAccumPrimitive(EMPTY_TIDE_OVERLAY, style);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach Tide primitive:', e);
    }
    return () => {
      try {
        candleSeries.detachPrimitive(primitive);
      } catch {
        /* disposed */
      }
      if (primitiveRef.current === primitive) primitiveRef.current = null;
    };
    // style/overlay are pushed by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, enabled]);

  useEffect(() => {
    primitiveRef.current?.update(overlay, style);
  }, [overlay, style, chart, candleSeries, enabled]);

  return null;
}

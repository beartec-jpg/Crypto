import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { SuperTrendPrimitive } from '@/lib/chartPrimitives/SuperTrendPrimitive';
import type { SuperTrendData } from '@/hooks/useSuperTrendCalculation';
import type { SuperTrendSettings, SuperTrendType } from '@/types/supertrend';

interface SuperTrendRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  data: SuperTrendData;
  settings: SuperTrendSettings;
}

const TYPES: SuperTrendType[] = ['standard', 'adx', 'keltner'];

export function SuperTrendRenderer({
  chart,
  candleSeries,
  data,
  settings,
}: SuperTrendRendererProps) {
  const primitivesRef = useRef<Partial<Record<SuperTrendType, SuperTrendPrimitive>>>({});

  // Create/destroy primitives when chart, series, or enabled state changes
  useEffect(() => {
    if (!chart || !candleSeries) return;

    for (const type of TYPES) {
      const config = settings[type];
      const existing = primitivesRef.current[type];

      if (config.enabled && !existing) {
        const primitive = new SuperTrendPrimitive(data[type], config);
        try {
          candleSeries.attachPrimitive(primitive);
          primitivesRef.current[type] = primitive;
        } catch (e) {
          console.error(`Failed to attach SuperTrend (${type}) primitive:`, e);
        }
      } else if (!config.enabled && existing) {
        try {
          candleSeries.detachPrimitive(existing);
        } catch (e) {
          console.warn(`Failed to detach SuperTrend (${type}) primitive:`, e);
        }
        delete primitivesRef.current[type];
      }
    }

    return () => {
      for (const type of TYPES) {
        const existing = primitivesRef.current[type];
        if (existing) {
          try {
            candleSeries.detachPrimitive(existing);
          } catch (e) {
            console.warn(`Failed to detach SuperTrend (${type}) primitive on cleanup:`, e);
          }
          delete primitivesRef.current[type];
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.standard.enabled, settings.adx.enabled, settings.keltner.enabled]);

  // Update data and config without recreating primitives
  useEffect(() => {
    for (const type of TYPES) {
      const primitive = primitivesRef.current[type];
      if (primitive) {
        primitive.update(data[type], settings[type]);
      }
    }
  }, [data, settings]);

  return null;
}

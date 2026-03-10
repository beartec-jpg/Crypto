import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { BreakerPrimitive } from '@/lib/chartPrimitives/BreakerPrimitive';
import type { Breaker, BreakerSettings } from '@/types/breaker';

interface BreakerRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  breakers: Breaker[];
  settings: BreakerSettings;
}

export function BreakerRenderer({
  chart,
  candleSeries,
  breakers,
  settings,
}: BreakerRendererProps) {
  const primitiveRef = useRef<BreakerPrimitive | null>(null);

  // Create/destroy primitive when chart or series changes
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new BreakerPrimitive(breakers, settings);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach Breaker primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach Breaker primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled]);

  // Update data and settings without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(breakers, settings);
    }
  }, [breakers, settings]);

  return null;
}

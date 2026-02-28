import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { AutoFibPrimitive } from '@/lib/chartPrimitives/AutoFibPrimitive';
import type { AutoFibResult, AutoFibSettings } from '@/types/autoFib';

interface AutoFibRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  result: AutoFibResult;
  settings: AutoFibSettings;
}

export function AutoFibRenderer({ chart, candleSeries, result, settings }: AutoFibRendererProps) {
  const primitiveRef = useRef<AutoFibPrimitive | null>(null);

  // Create/destroy primitive when chart or series changes, or when enabled toggles
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new AutoFibPrimitive(result);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach AutoFib primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach AutoFib primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled]);

  // Update result without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(result);
    }
  }, [result]);

  return null;
}

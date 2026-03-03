import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { AutoFibPrimitive } from '@/lib/chartPrimitives/AutoFibPrimitive';
import type { AutoFibResult, AutoFibSettings } from '@/types/autoFib';

interface AutoFibRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  result: AutoFibResult;
  settings: AutoFibSettings;
  weight?: number;
}

export function AutoFibRenderer({ chart, candleSeries, result, settings, weight = 0 }: AutoFibRendererProps) {
  const primitiveRef = useRef<AutoFibPrimitive | null>(null);

  const shouldShow = settings.enabled || weight > 0;

  // Create/destroy primitive when chart or series changes, or when visibility toggles
  useEffect(() => {
    if (!chart || !candleSeries || !shouldShow) return;

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
  }, [chart, candleSeries, shouldShow]);

  // Update result without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(result);
    }
  }, [result]);

  return null;
}

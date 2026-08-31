import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { SwoopPrimitive } from '@/lib/chartPrimitives/SwoopPrimitive';
import type { SwoopResult, SwoopSettings } from '@/types/swoop';

interface SwoopRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  result: SwoopResult;
  settings: SwoopSettings;
}

export function SwoopRenderer({ chart, candleSeries, result, settings }: SwoopRendererProps) {
  const primitiveRef = useRef<SwoopPrimitive | null>(null);
  const shouldShow = settings.enabled;

  useEffect(() => {
    if (!chart || !candleSeries || !shouldShow) {
      if (primitiveRef.current && candleSeries) {
        try {
          candleSeries.detachPrimitive(primitiveRef.current);
        } catch {
          /* disposed */
        }
        primitiveRef.current = null;
      }
      return;
    }

    const primitive = new SwoopPrimitive(result.drawSegments);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach Swoop primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try {
          candleSeries.detachPrimitive(primitiveRef.current);
        } catch {
          /* disposed */
        }
        primitiveRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, shouldShow]);

  useEffect(() => {
    if (primitiveRef.current && shouldShow) {
      primitiveRef.current.update(result.drawSegments);
    }
  }, [result, shouldShow]);

  return null;
}

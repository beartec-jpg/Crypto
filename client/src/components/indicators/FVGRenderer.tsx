import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { FVGPrimitive } from '@/lib/chartPrimitives/FVGPrimitive';
import type { FVGDetection, FVGSettings } from '@/types/fvg';

interface FVGRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  fvgs: FVGDetection[];
  settings: FVGSettings;
}

export function FVGRenderer({ chart, candleSeries, fvgs, settings }: FVGRendererProps) {
  const primitiveRef = useRef<FVGPrimitive | null>(null);

  // Create/destroy primitive when chart or series changes
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new FVGPrimitive(fvgs, settings);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach FVG primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach FVG primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled]);

  // Update FVG data and settings without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(fvgs, settings);
    }
  }, [fvgs, settings]);

  return null;
}

import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { PredictiveFibPrimitive } from '@/lib/chartPrimitives/PredictiveFibPrimitive';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';

interface PredictiveFibRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  fibLevels: FibLevel[];
  isActive: boolean;
}

export function PredictiveFibRenderer({
  chart,
  candleSeries,
  fibLevels,
  isActive,
}: PredictiveFibRendererProps) {
  const primitiveRef = useRef<PredictiveFibPrimitive | null>(null);

  // Create/destroy primitive when chart or series becomes available
  useEffect(() => {
    if (!chart || !candleSeries || !isActive) return;

    const primitive = new PredictiveFibPrimitive([]);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
      // Apply current levels immediately after attach
      primitive.update(fibLevels);
    } catch (e) {
      console.error('Failed to attach PredictiveFibPrimitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try {
          candleSeries.detachPrimitive(primitiveRef.current);
        } catch (e) {
          console.warn('Failed to detach PredictiveFibPrimitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, isActive]);

  // Update levels without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(fibLevels);
    }
  }, [fibLevels]);

  return null;
}

import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { AutoTrendlinePrimitive } from '@/lib/chartPrimitives/AutoTrendlinePrimitive';
import type { AutoTrendlineResult, AutoTrendlineSettings } from '@/types/autoTrendline';

interface AutoTrendlineRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  result: AutoTrendlineResult;
  settings: AutoTrendlineSettings;
  /** Latest candle index for extend-right projection. */
  lastIndex: number;
  /** Latest candle time for extend-right projection. */
  lastTime: number | null;
}

export function AutoTrendlineRenderer({
  chart,
  candleSeries,
  result,
  settings,
  lastIndex,
  lastTime,
}: AutoTrendlineRendererProps) {
  const primitiveRef = useRef<AutoTrendlinePrimitive | null>(null);
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

    const primitive = new AutoTrendlinePrimitive(result.lines, lastIndex, lastTime);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach AutoTrendline primitive:', e);
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
      primitiveRef.current.update(result.lines, lastIndex, lastTime);
    }
  }, [result, lastIndex, lastTime, shouldShow]);

  return null;
}

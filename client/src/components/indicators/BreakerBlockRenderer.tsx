import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { BreakerBlockPrimitive } from '@/lib/chartPrimitives/BreakerBlockPrimitive';
import type { BreakerBlock, BreakerBlockSettings } from '@/types/breakerBlock';

interface BreakerBlockRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  breakerBlocks: BreakerBlock[];
  settings: BreakerBlockSettings;
}

export function BreakerBlockRenderer({
  chart,
  candleSeries,
  breakerBlocks,
  settings,
}: BreakerBlockRendererProps) {
  const primitiveRef = useRef<BreakerBlockPrimitive | null>(null);

  // Create/destroy primitive when chart or series changes
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new BreakerBlockPrimitive(breakerBlocks, settings);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach BreakerBlock primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach BreakerBlock primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled]);

  // Update data and settings without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(breakerBlocks, settings);
    }
  }, [breakerBlocks, settings]);

  return null;
}

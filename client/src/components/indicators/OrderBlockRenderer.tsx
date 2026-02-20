import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { OrderBlockPrimitive } from '@/lib/chartPrimitives/OrderBlockPrimitive';
import type { OrderBlock, OrderBlockSettings } from '@/types/orderBlock';

interface OrderBlockRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  orderBlocks: OrderBlock[];
  settings: OrderBlockSettings;
}

export function OrderBlockRenderer({
  chart,
  candleSeries,
  orderBlocks,
  settings,
}: OrderBlockRendererProps) {
  const primitiveRef = useRef<OrderBlockPrimitive | null>(null);

  // Create/destroy primitive when chart or series changes
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new OrderBlockPrimitive(orderBlocks, settings);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach OrderBlock primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach OrderBlock primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled]);

  // Update data and settings without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(orderBlocks, settings);
    }
  }, [orderBlocks, settings]);

  return null;
}

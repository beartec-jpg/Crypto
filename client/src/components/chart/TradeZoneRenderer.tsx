import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { TradePrimitive } from '@/lib/chartPrimitives/TradePrimitive';
import type { ManualTrade } from '@/lib/chartPrimitives/TradePrimitive';

interface TradeZoneRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  trades: ManualTrade[];
  currentTime: number;
}

export function TradeZoneRenderer({ chart, candleSeries, trades, currentTime }: TradeZoneRendererProps) {
  const primitiveRef = useRef<TradePrimitive | null>(null);

  useEffect(() => {
    if (!chart || !candleSeries) return;

    const primitive = new TradePrimitive(trades, currentTime);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach TradePrimitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach TradePrimitive:', e);
        }
        primitiveRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries]);

  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(trades, currentTime);
    }
  }, [trades, currentTime]);

  return null;
}

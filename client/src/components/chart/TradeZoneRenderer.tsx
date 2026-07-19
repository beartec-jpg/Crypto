import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { TradePrimitive } from '@/lib/chartPrimitives/TradePrimitive';
import type { ManualTrade } from '@/lib/chartPrimitives/TradePrimitive';

interface TradeZoneRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  trades: ManualTrade[];
  currentTime: number;
  timeframe: string;
}

export function TradeZoneRenderer({ chart, candleSeries, trades, currentTime, timeframe }: TradeZoneRendererProps) {
  const primitiveRef = useRef<TradePrimitive | null>(null);
  const lastKnownCurrentTimeRef = useRef(0);

  useEffect(() => {
    if (currentTime > 0) {
      lastKnownCurrentTimeRef.current = currentTime;
    }
  }, [currentTime]);

  const effectiveCurrentTime = currentTime > 0 ? currentTime : lastKnownCurrentTimeRef.current;

  // Render trades that belong to the current timeframe.
  // Also include legacy trades that pre-date the timeframe field so they remain visible.
  const timeframeTrades = trades.filter(t => !t.timeframe || t.timeframe === timeframe);

  useEffect(() => {
    if (!chart || !candleSeries) return;

    const primitive = new TradePrimitive(timeframeTrades, effectiveCurrentTime);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
      // Explicitly trigger an update after attachment so the primitive redraws
      // with the current trades in case _requestUpdate was not yet available
      // during construction.
      primitive.update(timeframeTrades, effectiveCurrentTime);
    } catch (e) {
      console.error('Failed to attach TradePrimitive:', e);
    }

    return () => {
      try { candleSeries.detachPrimitive(primitive); } catch (e) {
        console.warn('Failed to detach TradePrimitive:', e);
      }
      if (primitiveRef.current === primitive) primitiveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, timeframe]);

  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(timeframeTrades, effectiveCurrentTime);
    }
  }, [timeframeTrades, effectiveCurrentTime, timeframe]);

  return null;
}

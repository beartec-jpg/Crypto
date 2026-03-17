import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { LiquidityHeatmapPrimitive } from '@/lib/chartPrimitives/LiquidityHeatmapPrimitive';
import type { CoinglassRange, LiquidityHeatmapData, LiquidityHeatmapSettings } from '@/types/liquidityHeatmap';

interface LiquidityHeatmapRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  data: LiquidityHeatmapData | null;
  settings: LiquidityHeatmapSettings;
  effectiveRange: CoinglassRange;
}

export function LiquidityHeatmapRenderer({ chart, candleSeries, data, settings, effectiveRange }: LiquidityHeatmapRendererProps) {
  const primitiveRef = useRef<LiquidityHeatmapPrimitive | null>(null);

  // Create/destroy primitive when chart or series changes or when enabled toggled
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new LiquidityHeatmapPrimitive(data, settings, effectiveRange);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach LiquidityHeatmap primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try {
          candleSeries.detachPrimitive(primitiveRef.current);
        } catch (e) {
          console.warn('Failed to detach LiquidityHeatmap primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled]);

  // Update data and settings without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(data, settings, effectiveRange);
    }
  }, [data, settings, effectiveRange]);

  return null;
}

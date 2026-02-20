import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { LiquidityPrimitive } from '@/lib/chartPrimitives/LiquidityPrimitive';
import type { LiquidityZone, LiquiditySettings } from '@/types/liquidity';

interface LiquidityRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  zones: LiquidityZone[];
  settings: LiquiditySettings;
}

export function LiquidityRenderer({
  chart,
  candleSeries,
  zones,
  settings,
}: LiquidityRendererProps) {
  const primitiveRef = useRef<LiquidityPrimitive | null>(null);

  // Create/destroy primitive when chart or series changes
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new LiquidityPrimitive(zones, settings);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach Liquidity primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach Liquidity primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled]);

  // Update data and settings without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(zones, settings);
    }
  }, [zones, settings]);

  return null;
}

import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { PDZonePrimitive } from '@/lib/chartPrimitives/PDZonePrimitive';
import type { PDZone, PDZoneSettings } from '@/types/liquidity';

interface PDZoneRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  zones: PDZone[];
  settings: PDZoneSettings;
}

export function PDZoneRenderer({
  chart,
  candleSeries,
  zones,
  settings,
}: PDZoneRendererProps) {
  const primitiveRef = useRef<PDZonePrimitive | null>(null);

  // Create/destroy primitive when chart or series changes
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new PDZonePrimitive(zones, settings);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach PDZone primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach PDZone primitive:', e);
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

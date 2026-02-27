import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { VolumeProfilePrimitive } from '@/lib/chartPrimitives/VolumeProfilePrimitive';
import type { VolumeProfileData, VolumeProfileSettings } from '@/types/volumeProfile';

interface VolumeProfileRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  data: VolumeProfileData | null;
  settings: VolumeProfileSettings;
}

export function VolumeProfileRenderer({ chart, candleSeries, data, settings }: VolumeProfileRendererProps) {
  const primitiveRef = useRef<VolumeProfilePrimitive | null>(null);

  // Create/destroy primitive when chart or series changes or when enabled toggled
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new VolumeProfilePrimitive(data, settings);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach VolumeProfile primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach VolumeProfile primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled]);

  // Update data and settings without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(data, settings);
    }
  }, [data, settings]);

  return null;
}

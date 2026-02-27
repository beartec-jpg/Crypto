import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { BOSPrimitive } from '@/lib/chartPrimitives/BOSPrimitive';
import type { BOSSettings, StructureBreak, SwingPoint } from '@/types/structureBreak';
import type { SessionSeparator } from '@/lib/sessions/sessionSeparators';

interface BOSRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  structureBreaks: StructureBreak[];
  swingPoints: SwingPoint[];
  sessionSeparators: SessionSeparator[];
  settings: BOSSettings;
}

export function BOSRenderer({
  chart,
  candleSeries,
  structureBreaks,
  swingPoints,
  sessionSeparators,
  settings,
}: BOSRendererProps) {
  const primitiveRef = useRef<BOSPrimitive | null>(null);

  // Create/destroy primitive when chart or series changes
  useEffect(() => {
    if (!chart || !candleSeries || !settings.enabled) return;

    const primitive = new BOSPrimitive(structureBreaks, swingPoints, sessionSeparators, settings);
    try {
      candleSeries.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } catch (e) {
      console.error('Failed to attach BOS primitive:', e);
    }

    return () => {
      if (primitiveRef.current) {
        try { candleSeries.detachPrimitive(primitiveRef.current); } catch (e) {
          console.warn('Failed to detach BOS primitive:', e);
        }
        primitiveRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, candleSeries, settings.enabled]);

  // Update data and settings without recreating the primitive
  useEffect(() => {
    if (primitiveRef.current) {
      primitiveRef.current.update(structureBreaks, swingPoints, sessionSeparators, settings);
    }
  }, [structureBreaks, swingPoints, sessionSeparators, settings]);

  return null;
}

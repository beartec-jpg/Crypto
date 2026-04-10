import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { 
  createDrawingPrimitive, 
  DrawingPrimitive,
  TrendLinePrimitive,
  HorizontalLinePrimitive,
  VerticalLinePrimitive,
  TextLabelPrimitive,
  RectanglePrimitive,
  FibRetracementPrimitive,
  TrendFibPrimitive,
  ChannelPrimitive
} from '@/lib/chartPrimitives';
import type { Drawing } from '@/types/drawing';

interface UseDrawingPrimitivesOptions {
  chartRef: React.MutableRefObject<IChartApi | null>;
  candleSeriesRef: React.MutableRefObject<ISeriesApi<'Candlestick'> | null>;
  drawings: Drawing[];
  selectedDrawingId: string | null;
  activeEdit?: { drawingId: string; pointIndex: number } | null;
  visible: boolean;
  candles?: Array<{ time: number | string }>;
}

export function useDrawingPrimitives({
  chartRef,
  candleSeriesRef,
  drawings,
  selectedDrawingId,
  activeEdit = null,
  visible,
  candles,
}: UseDrawingPrimitivesOptions): void {
  const primitivesRef = useRef<Map<string, DrawingPrimitive>>(new Map());

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    
    const candleSeries = candleSeriesRef.current;
    const currentPrimitives = primitivesRef.current;
    const currentDrawingIds = new Set(drawings.map(d => d.id));
    
    // Hide all if not visible
    if (!visible) {
      currentPrimitives.forEach((primitive) => {
        try { candleSeries.detachPrimitive(primitive); } catch (e) {}
      });
      currentPrimitives.clear();
      return;
    }
    
    // Remove primitives for deleted drawings or drawings being edited
    currentPrimitives.forEach((primitive, id) => {
      const isBeingEdited = activeEdit && activeEdit.drawingId === id;
      if (!currentDrawingIds.has(id) || isBeingEdited) {
        try { candleSeries.detachPrimitive(primitive); } catch (e) {}
        currentPrimitives.delete(id);
      }
    });
    
    // Add/update primitives for current drawings
    // Compute last candle time for autoTrack injection
    const lastCandleTime = candles && candles.length > 0
      ? Number(candles[candles.length - 1].time)
      : undefined;

    drawings.forEach(drawing => {
      const isBeingEdited = activeEdit && activeEdit.drawingId === drawing.id;
      if (isBeingEdited) return;
      
      const existingPrimitive = currentPrimitives.get(drawing.id);

      // For fib drawings with autoTrack, inject the latest candle time at render time
      const isFibDrawing = drawing.type === 'fib_retracement' || drawing.type === 'trend_fib';
      const effectiveStyle = (isFibDrawing && (drawing.style?.autoTrack ?? true) && lastCandleTime !== undefined)
        ? { ...drawing.style, _trackToTime: lastCandleTime }
        : drawing.style;
      
      if (existingPrimitive) {
        // Update existing primitive
        existingPrimitive.setSelected(selectedDrawingId === drawing.id);
        
        if ('updatePoints' in existingPrimitive) {
          (existingPrimitive as TrendLinePrimitive | RectanglePrimitive | FibRetracementPrimitive | TrendFibPrimitive | ChannelPrimitive).updatePoints(drawing.points);
        } else if ('updatePoint' in existingPrimitive) {
          (existingPrimitive as HorizontalLinePrimitive | VerticalLinePrimitive | TextLabelPrimitive).updatePoint(drawing.points[0]);
        }
        
        existingPrimitive.updateStyle(effectiveStyle);
      } else {
        // Create new primitive
        const primitive = createDrawingPrimitive(
          drawing.id,
          drawing.type as 'trendline' | 'horizontal' | 'vertical' | 'text' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel',
          drawing.points,
          effectiveStyle
        );
        
        if (primitive) {
          try {
            candleSeries.attachPrimitive(primitive);
            currentPrimitives.set(drawing.id, primitive);
          } catch (e) {
            console.error('Failed to attach primitive:', e);
          }
        }
      }
    });
    
    return () => {
      currentPrimitives.forEach((primitive) => {
        try { candleSeries.detachPrimitive(primitive); } catch (e) {}
      });
      currentPrimitives.clear();
    };
  }, [drawings, selectedDrawingId, activeEdit, visible, chartRef, candleSeriesRef, candles]);
}

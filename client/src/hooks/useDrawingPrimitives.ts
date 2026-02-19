import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { 
  createDrawingPrimitive, 
  DrawingPrimitive,
  TrendLinePrimitive,
  HorizontalLinePrimitive,
  RectanglePrimitive,
  FibRetracementPrimitive,
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
}

export function useDrawingPrimitives({
  chartRef,
  candleSeriesRef,
  drawings,
  selectedDrawingId,
  activeEdit = null,
  visible,
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
    drawings.forEach(drawing => {
      const isBeingEdited = activeEdit && activeEdit.drawingId === drawing.id;
      if (isBeingEdited) return;
      
      const existingPrimitive = currentPrimitives.get(drawing.id);
      
      if (existingPrimitive) {
        // Update existing primitive
        existingPrimitive.setSelected(selectedDrawingId === drawing.id);
        
        if ('updatePoints' in existingPrimitive) {
          (existingPrimitive as TrendLinePrimitive | RectanglePrimitive | FibRetracementPrimitive | ChannelPrimitive).updatePoints(drawing.points);
        } else if ('updatePoint' in existingPrimitive) {
          (existingPrimitive as HorizontalLinePrimitive).updatePoint(drawing.points[0]);
        }
        
        existingPrimitive.updateStyle(drawing.style);
      } else {
        // Create new primitive
        const primitive = createDrawingPrimitive(
          drawing.id,
          drawing.type as 'trendline' | 'horizontal' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel',
          drawing.points,
          drawing.style
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
  }, [drawings, selectedDrawingId, activeEdit, visible, chartRef, candleSeriesRef]);
}

import { useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { ISeriesApi } from 'lightweight-charts';
import {
  createDrawingPrimitive,
  DrawingPrimitive,
  TrendLinePrimitive,
  HorizontalLinePrimitive,
  TextLabelPrimitive,
  RectanglePrimitive,
  FibRetracementPrimitive,
  ChannelPrimitive
} from '@/lib/chartPrimitives';

interface DrawingManagerProps {
  chartReady: boolean;
  candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
  symbol: string;
  interval: string;
  isAuthenticated: boolean;
  authLoading: boolean;
  drawings: any[];
  setDrawings: React.Dispatch<React.SetStateAction<any[]>>;
  selectedDrawingId: string | null;
  activeEdit: { drawingId: string; pointIndex: number; originalDrawing: any } | null;
  drawingsVisible: boolean;
  drawingPrimitivesRef: React.MutableRefObject<Map<string, DrawingPrimitive>>;
  updateDrawingMutationRef: React.MutableRefObject<any>;
  onRefetchDrawings: () => void;
}

export function DrawingManager({
  chartReady,
  candleSeriesRef,
  symbol,
  interval,
  isAuthenticated,
  authLoading,
  drawings,
  setDrawings,
  selectedDrawingId,
  activeEdit,
  drawingsVisible,
  drawingPrimitivesRef,
  updateDrawingMutationRef,
  onRefetchDrawings,
}: DrawingManagerProps) {
  
  const { userId } = useAuth();
  const drawingsKey = [
    '/api/crypto/chart-drawings',
    userId ?? 'signed-out',
    symbol,
    interval,
  ] as const;

  // Load saved drawings from DB (scoped by user so caches never cross accounts)
  const { data: savedDrawings = [], refetch: refetchDrawings } = useQuery<any[]>({
    queryKey: drawingsKey,
    queryFn: async () => {
      const response = await authenticatedApiRequest(
        'GET',
        `/api/crypto/chart-drawings?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(interval)}`,
      );
      return response.json();
    },
    enabled: isAuthenticated && !authLoading && !!userId && !!symbol && !!interval,
  });
  
  // Load saved drawings into state when data changes
  useEffect(() => {
    if (!userId) {
      setDrawings([]);
      return;
    }
    // Always sync state with database, even for empty arrays
    if (savedDrawings) {
      setDrawings(savedDrawings.map(d => ({
        id: d.id,
        type: d.drawing_type || d.drawingType,
        timeframe: d.timeframe,
        points: d.coordinates?.points || [],
        style: d.style || { color: '#3b82f6', lineWidth: 2 },
      })).filter(d => d.points.length > 0)); // Only keep drawings with valid points
    }
  }, [savedDrawings, setDrawings, userId]);
  
  // Expose refetch to parent
  useEffect(() => {
    onRefetchDrawings();
  }, [refetchDrawings, onRefetchDrawings]);
  
  // Attach/detach native primitives for high-performance rendering
  useEffect(() => {
    if (!chartReady || !candleSeriesRef.current) return;
    
    const candleSeries = candleSeriesRef.current;
    const currentPrimitives = drawingPrimitivesRef.current;
    const currentDrawingIds = new Set(drawings.map(d => d.id));
    
    // If drawings are hidden, detach all primitives
    if (!drawingsVisible) {
      currentPrimitives.forEach((primitive) => {
        try {
          candleSeries.detachPrimitive(primitive);
        } catch (e) {
          // Already detached
        }
      });
      currentPrimitives.clear();
      return;
    }
    
    // Remove primitives for deleted drawings OR drawings being edited
    currentPrimitives.forEach((primitive, id) => {
      const isBeingEdited = activeEdit && activeEdit.drawingId === id;
      if (!currentDrawingIds.has(id) || isBeingEdited) {
        try {
          candleSeries.detachPrimitive(primitive);
        } catch (e) {
          // Already detached
        }
        currentPrimitives.delete(id);
      }
    });
    
    // Add or update primitives for current drawings (skip if being edited)
    drawings.forEach(drawing => {
      const isBeingEdited = activeEdit && activeEdit.drawingId === drawing.id;
      if (isBeingEdited) return; // Don't render primitive while editing
      
      const existingPrimitive = currentPrimitives.get(drawing.id);
      
      if (existingPrimitive) {
        // Update existing primitive
        existingPrimitive.setSelected(selectedDrawingId === drawing.id);
        
        // Update points if they changed
        if ('updatePoints' in existingPrimitive) {
          (existingPrimitive as TrendLinePrimitive | RectanglePrimitive | FibRetracementPrimitive | ChannelPrimitive).updatePoints(drawing.points);
        } else if ('updatePoint' in existingPrimitive) {
          (existingPrimitive as HorizontalLinePrimitive | TextLabelPrimitive).updatePoint(drawing.points[0]);
        }
        
        // Update style
        existingPrimitive.updateStyle(drawing.style);
      } else {
        // Create and attach new primitive
        const primitive = createDrawingPrimitive(
          drawing.id,
          drawing.type,
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
    
    // Cleanup on unmount
    return () => {
      currentPrimitives.forEach((primitive) => {
        try {
          candleSeries.detachPrimitive(primitive);
        } catch (e) {
          // Already detached or chart disposed
        }
      });
      currentPrimitives.clear();
    };
  }, [chartReady, drawings, selectedDrawingId, activeEdit, drawingsVisible, candleSeriesRef, drawingPrimitivesRef]);
  
  // Save drawing mutation
  const saveDrawingMutation = useMutation({
    mutationFn: async (drawing: any) => {
      const response = await authenticatedApiRequest('POST', '/api/crypto/chart-drawings', {
        symbol,
        timeframe: interval,
        drawingType: drawing.type,
        coordinates: { points: drawing.points },
        style: drawing.style,
      });
      return { ...(await response.json()), localId: drawing.id };
    },
    onSuccess: (serverDrawing) => {
      // Update local state with server ID before refetch
      setDrawings(prev => prev.map(d => 
        d.id === serverDrawing.localId 
          ? { ...d, id: serverDrawing.id }
          : d
      ));
      refetchDrawings();
    },
  });
  
  // Delete drawing mutation  
  const deleteDrawingMutation = useMutation({
    mutationFn: async (drawingId: string) => {
      // Immediately remove from local state for instant UI feedback
      setDrawings(prev => prev.filter(d => d.id !== drawingId));
      
      const response = await authenticatedApiRequest('DELETE', `/api/crypto/chart-drawings/${drawingId}`);
      return response.json();
    },
    onSuccess: () => {
      refetchDrawings();
    },
    onError: () => {
      // If delete fails, refetch to restore the drawing
      refetchDrawings();
    },
  });
  
  // Clear all drawings mutation
  const clearDrawingsMutation = useMutation({
    mutationFn: async () => {
      const response = await authenticatedApiRequest('DELETE', `/api/crypto/chart-drawings?symbol=${symbol}&timeframe=${interval}`);
      return response.json();
    },
    onSuccess: () => {
      setDrawings([]);
      refetchDrawings();
    },
  });
  
  // Update drawing mutation (for settings changes)
  const updateDrawingMutation = useMutation({
    mutationFn: async ({ id, style, coordinates }: { id: string; style?: any; coordinates?: any }) => {
      const body: Record<string, any> = {};
      if (style) body.style = style;
      if (coordinates) body.coordinates = coordinates;
      const response = await authenticatedApiRequest('PATCH', `/api/crypto/chart-drawings/${id}`, body);
      return response.json();
    },
    onSuccess: () => {
      refetchDrawings();
    },
  });
  
  // Keep mutation ref in sync for point dragging
  useEffect(() => {
    updateDrawingMutationRef.current = updateDrawingMutation;
  }, [updateDrawingMutation, updateDrawingMutationRef]);
  
  return null; // This component manages state, doesn't render UI
}

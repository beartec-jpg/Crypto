import { useState, useCallback, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { findDrawingsNearClick } from '@/lib/drawingHitDetection';
import { TOUCH_TAP_THRESHOLD, TOUCH_MOVE_THRESHOLD } from '@/lib/constants/layout';
import type { Drawing, ChartDrawingTool } from '@/types/drawing';

interface UseDrawingInteractionOptions {
  chartRef: React.MutableRefObject<IChartApi | null>;
  candleSeriesRef: React.MutableRefObject<ISeriesApi<'Candlestick'> | null>;
  containerRef: React.RefObject<HTMLDivElement>;
  drawings: Drawing[];
  activeTool: ChartDrawingTool;
}

interface NearbyDrawing {
  id: string;
  type: string;
  color?: string;
  points?: { time: number; price: number }[];
}

interface UseDrawingInteractionReturn {
  selectedDrawingId: string | null;
  setSelectedDrawingId: (id: string | null) => void;
  quickMenuPosition: { x: number; y: number } | null;
  closeQuickMenu: () => void;
  showSelectionModal: boolean;
  nearbyDrawings: NearbyDrawing[];
  closeSelectionModal: () => void;
  selectFromModal: (id: string) => void;
  handleChartClick: (event: MouseEvent | TouchEvent) => void;
  handleTouchEnd: (event: TouchEvent) => void;
}

export function useDrawingInteraction({
  chartRef,
  candleSeriesRef,
  containerRef,
  drawings,
  activeTool,
}: UseDrawingInteractionOptions): UseDrawingInteractionReturn {
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [quickMenuPosition, setQuickMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [nearbyDrawings, setNearbyDrawings] = useState<NearbyDrawing[]>([]);
  
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const closeQuickMenu = useCallback(() => {
    setQuickMenuPosition(null);
  }, []);

  const closeSelectionModal = useCallback(() => {
    setShowSelectionModal(false);
  }, []);

  const selectFromModal = useCallback((drawingId: string) => {
    setSelectedDrawingId(drawingId);
    setQuickMenuPosition({ 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
    });
    setShowSelectionModal(false);
  }, []);

  const processHits = useCallback((
    hits: Array<{ drawingId: string; drawingType: string; distance: number }>,
    clickX: number,
    clickY: number
  ) => {
    if (hits.length === 0) {
      setSelectedDrawingId(null);
      setQuickMenuPosition(null);
    } else if (hits.length === 1) {
      setSelectedDrawingId(hits[0].drawingId);
      setQuickMenuPosition({ x: clickX, y: clickY });
    } else {
      setNearbyDrawings(hits.map(h => {
        const drawing = drawings.find(d => d.id === h.drawingId);
        return {
          id: h.drawingId,
          type: h.drawingType,
          color: drawing?.style?.color || '#3b82f6',
          points: drawing?.points,
        };
      }));
      setShowSelectionModal(true);
    }
  }, [drawings]);

  const handleChartClick = useCallback((event: MouseEvent | TouchEvent) => {
    // Only handle clicks when no tool is active
    if (activeTool) return;
    
    if (event.type === 'click') {
      const chartElement = containerRef.current;
      if (!chartElement || !chartRef.current || !candleSeriesRef.current) return;
      
      const rect = chartElement.getBoundingClientRect();
      const mouseEvent = event as MouseEvent;
      const clickX = mouseEvent.clientX - rect.left;
      const clickY = mouseEvent.clientY - rect.top;
      
      const hits = findDrawingsNearClick(clickX, clickY, drawings, chartRef.current, candleSeriesRef.current);
      processHits(hits, mouseEvent.clientX, mouseEvent.clientY);
      return;
    }
    
    if (event.type === 'touchstart') {
      const touch = (event as TouchEvent).touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    }
  }, [activeTool, drawings, chartRef, candleSeriesRef, containerRef, processHits]);

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    if (!touchStartRef.current || activeTool) {
      touchStartRef.current = null;
      return;
    }
    
    const touch = event.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    const deltaTime = Date.now() - touchStartRef.current.time;
    
    const isTap = deltaTime < TOUCH_TAP_THRESHOLD && 
                  deltaX < TOUCH_MOVE_THRESHOLD && 
                  deltaY < TOUCH_MOVE_THRESHOLD;
    
    if (isTap) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !chartRef.current || !candleSeriesRef.current) {
        touchStartRef.current = null;
        return;
      }
      
      const clickX = touchStartRef.current.x - rect.left;
      const clickY = touchStartRef.current.y - rect.top;
      
      const hits = findDrawingsNearClick(clickX, clickY, drawings, chartRef.current, candleSeriesRef.current);
      processHits(hits, touchStartRef.current.x, touchStartRef.current.y);
    }
    
    touchStartRef.current = null;
  }, [activeTool, drawings, chartRef, candleSeriesRef, containerRef, processHits]);

  return {
    selectedDrawingId,
    setSelectedDrawingId,
    quickMenuPosition,
    closeQuickMenu,
    showSelectionModal,
    nearbyDrawings,
    closeSelectionModal,
    selectFromModal,
    handleChartClick,
    handleTouchEnd,
  };
}

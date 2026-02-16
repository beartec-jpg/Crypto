import { useEffect, useCallback } from 'react';
import { Time } from 'lightweight-charts';
import { useToast } from '@/hooks/use-toast';
import { getAutoColor } from '@/lib/chart/colorUtils';
import { GesturePoint } from '@/hooks/useChartGestures';

// Local DrawingTool type matching CryptoIndicators.tsx
type DrawingTool = 'trendline' | 'horizontal' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel' | null;

interface DrawingRendererProps {
  drawingMode: 'off' | 'draw' | 'select';
  activeTool: DrawingTool | null;
  activeToolRef: React.MutableRefObject<DrawingTool | null>;
  autoColorEnabledRef: React.MutableRefObject<boolean>;
  candles: any[];
  tempDrawing: { points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null;
  setTempDrawing: React.Dispatch<React.SetStateAction<{ points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null>>;
  setDrawings: React.Dispatch<React.SetStateAction<any[]>>;
  saveDrawingMutation: { mutate: (drawing: any) => void };
  onPointCommitRef?: React.MutableRefObject<((point: GesturePoint) => void) | null>;
}

export function DrawingRenderer({
  drawingMode,
  activeTool,
  activeToolRef,
  autoColorEnabledRef,
  candles,
  tempDrawing,
  setTempDrawing,
  setDrawings,
  saveDrawingMutation,
  onPointCommitRef,
}: DrawingRendererProps) {
  const { toast } = useToast();

  // Handle point commit from gesture controller
  const handlePointCommit = useCallback((point: GesturePoint) => {
    const currentTool = activeToolRef.current;
    if (drawingMode !== 'draw' || !currentTool) return;
    
    // For horizontal lines, save immediately on first click
    if (currentTool === 'horizontal') {
      const newPoint = { time: point.time as number, price: point.price, snapType: point.snapType };
      const color = autoColorEnabledRef.current ? getAutoColor([newPoint], candles) : '#3b82f6';
      
      const newDrawing = {
        id: `drawing-${Date.now()}`,
        type: currentTool,
        points: [newPoint],
        style: { color, lineWidth: 2 }
      };
      
      console.log('[Renderer] Creating horizontal line:', newDrawing);
      setDrawings(d => [...d, newDrawing]);
      
      // Save to database
      console.log('[Renderer] Calling saveDrawingMutation.mutate');
      saveDrawingMutation.mutate(newDrawing);
      toast({ title: 'Drawing Saved', description: 'horizontal line added to chart' });
      
      // Don't accumulate points for horizontal lines
      return;
    }
    
    setTempDrawing(prev => {
      if (!prev) return { points: [{ time: point.time as number, price: point.price, snapType: point.snapType }] };
      
      const newPoints = [...prev.points, { time: point.time as number, price: point.price, snapType: point.snapType }];
      const requiredPoints = (currentTool === 'trend_fib' || currentTool === 'fib_retracement') ? 3 : 2;
      
      // If we have enough points, save the drawing
      if (newPoints.length >= requiredPoints) {
        // Determine color based on auto-color setting and snap types
        const color = autoColorEnabledRef.current ? getAutoColor(newPoints, candles) : '#3b82f6';
        
        // Load saved defaults for fib and channel tools
        let savedDefaults: any = {};
        if (currentTool === 'fib_retracement' || currentTool === 'trend_fib' || currentTool === 'channel') {
          try {
            const defaultKey = currentTool === 'channel' ? 'channelDefaults' : `fibDefaults_${currentTool}`;
            const stored = localStorage.getItem(defaultKey);
            if (stored) savedDefaults = JSON.parse(stored);
          } catch (e) {}
        }
        
        // For channels, set autoColor based on global setting and default extendRight to true
        const channelStyle = currentTool === 'channel' 
          ? { autoColor: autoColorEnabledRef.current, labelPosition: 'right' as const, extendRight: true }
          : {};
        
        const newDrawing = {
          id: `drawing-${Date.now()}`,
          type: currentTool,
          points: newPoints,
          style: { color, lineWidth: 2, ...savedDefaults, ...channelStyle }
        };
        
        console.log('[Renderer] Creating new drawing:', newDrawing);
        setDrawings(d => [...d, newDrawing]);
        
        // Save to database
        console.log('[Renderer] Calling saveDrawingMutation.mutate');
        saveDrawingMutation.mutate(newDrawing);
        toast({ title: 'Drawing Saved', description: `${currentTool.replace('_', ' ')} added to chart` });
        
        // Reset for next drawing
        return { points: [] };
      }
      
      return { points: newPoints };
    });
  }, [drawingMode, activeToolRef, autoColorEnabledRef, candles, setTempDrawing, setDrawings, saveDrawingMutation, toast]);

  // Expose handlePointCommit through ref if provided
  useEffect(() => {
    if (onPointCommitRef) {
      onPointCommitRef.current = handlePointCommit;
    }
  }, [handlePointCommit, onPointCommitRef]);

  return null; // This component manages rendering logic, doesn't render UI
}

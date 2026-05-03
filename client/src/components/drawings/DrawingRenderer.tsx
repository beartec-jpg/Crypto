import { useEffect, useCallback } from 'react';
import { Time } from 'lightweight-charts';
import { useToast } from '@/hooks/use-toast';
import { getAutoColor } from '@/lib/chart/colorUtils';
import { GesturePoint } from '@/hooks/useChartGestures';
import type { ChartDrawingTool } from '@/types/drawing';

interface DrawingRendererProps {
  drawingMode: 'off' | 'draw' | 'select';
  activeTool: ChartDrawingTool | null;
  activeToolRef: React.MutableRefObject<ChartDrawingTool | null>;
  autoColorEnabledRef: React.MutableRefObject<boolean>;
  candles: any[];
  tempDrawing: { points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null;
  setTempDrawing: React.Dispatch<React.SetStateAction<{ points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null>>;
  setDrawings: React.Dispatch<React.SetStateAction<any[]>>;
  saveDrawingMutation: { mutate: (drawing: any) => void };
  onPointCommitRef?: React.MutableRefObject<((point: GesturePoint) => void) | null>;
  /** Called instead of standard drawing logic when tool is 'elliott_wave' */
  onElliottWavePoint?: (point: GesturePoint) => void;
  drawingDefaultsByTool?: Record<string, any>;
  onDrawingComplete?: (tool: Exclude<ChartDrawingTool, null>) => void;
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
  onElliottWavePoint,
  drawingDefaultsByTool,
  onDrawingComplete,
}: DrawingRendererProps) {
  const { toast } = useToast();

  const finishDrawing = useCallback((tool: Exclude<ChartDrawingTool, null>) => {
    queueMicrotask(() => onDrawingComplete?.(tool));
  }, [onDrawingComplete]);

  // Handle point commit from gesture controller
  const handlePointCommit = useCallback((point: GesturePoint) => {
    const currentTool = activeToolRef.current;
    if (drawingMode !== 'draw' || !currentTool) return;
    
    // Elliott Wave tool: delegate to external handler
    if (currentTool === 'elliott_wave') {
      onElliottWavePoint?.(point);
      return;
    }
    
    // For single-point tools, save immediately on first click
    if (currentTool === 'horizontal' || currentTool === 'vertical' || currentTool === 'text') {
      const newPoint = { time: point.time as number, price: point.price, snapType: point.snapType };
      const toolDefaults = drawingDefaultsByTool?.[currentTool] || {};
      const useAutoColor = toolDefaults.autoColor ?? autoColorEnabledRef.current;
      const fallbackColor = toolDefaults.color || '#3b82f6';
      const color = useAutoColor ? getAutoColor([newPoint], candles) : fallbackColor;

      const textDefaults = currentTool === 'text'
        ? {
            text: toolDefaults.text || 'Text',
            fontSize: toolDefaults.fontSize || 14,
            fontWeight: toolDefaults.fontWeight || 'normal',
            showBackground: toolDefaults.showBackground ?? true,
            backgroundColor: toolDefaults.backgroundColor || 'rgba(15, 23, 42, 0.8)',
          }
        : {};
      
      const newDrawing = {
        id: `drawing-${Date.now()}`,
        type: currentTool,
        points: [newPoint],
        style: { lineWidth: 2, ...toolDefaults, ...textDefaults, color, autoColor: useAutoColor }
      };
      
      console.log('[Renderer] Creating single-point drawing:', newDrawing);
      setDrawings(d => [...d, newDrawing]);
      
      // Save to database
      console.log('[Renderer] Calling saveDrawingMutation.mutate');
      saveDrawingMutation.mutate(newDrawing);
      toast({ title: 'Drawing Saved', description: `${currentTool === 'text' ? 'text label' : currentTool === 'vertical' ? 'vertical line' : 'horizontal line'} added to chart` });

      if (currentTool === 'text') {
        finishDrawing(currentTool);
      }
      
      // Don't accumulate points for single-point tools
      return;
    }
    
    setTempDrawing(prev => {
      if (!prev) return { points: [{ time: point.time as number, price: point.price, snapType: point.snapType }] };
      
      const newPoints = [...prev.points, { time: point.time as number, price: point.price, snapType: point.snapType }];
      const requiredPoints = currentTool === 'trend_fib' ? 3 : 2;
      
      // If we have enough points, save the drawing
      if (newPoints.length >= requiredPoints) {
        const toolDefaults = drawingDefaultsByTool?.[currentTool] || {};
        const useAutoColor = toolDefaults.autoColor ?? autoColorEnabledRef.current;
        const fallbackColor = toolDefaults.color || '#3b82f6';
        const color = useAutoColor ? getAutoColor(newPoints, candles) : fallbackColor;
        
        // Load saved defaults for fib and channel tools
        let savedDefaults: any = {};
        if (currentTool === 'fib_retracement' || currentTool === 'trend_fib' || currentTool === 'channel') {
          try {
            const defaultKey = currentTool === 'channel' ? 'channelDefaults' : `fibDefaults_${currentTool}`;
            const stored = localStorage.getItem(defaultKey);
            if (stored) savedDefaults = JSON.parse(stored);
          } catch (e) {}
        }

        // User-level defaults override local fallback defaults.
        savedDefaults = { ...savedDefaults, ...toolDefaults };
        
        // For channels, set autoColor based on global setting and default extendRight to true
        const channelStyle = currentTool === 'channel' 
          ? { autoColor: useAutoColor, labelPosition: 'right' as const, extendRight: true }
          : {};
        // For fib drawings, default autoTrack to true; respect explicit false saved in defaults
        const fibStyle = (currentTool === 'fib_retracement' || currentTool === 'trend_fib')
          ? { autoTrack: savedDefaults.autoTrack ?? true }
          : {};
        
        const newDrawing = {
          id: `drawing-${Date.now()}`,
          type: currentTool,
          points: newPoints,
          style: { lineWidth: 2, ...savedDefaults, ...fibStyle, ...channelStyle, color, autoColor: useAutoColor }
        };
        
        console.log('[Renderer] Creating new drawing:', newDrawing);
        setDrawings(d => [...d, newDrawing]);
        
        // Save to database
        console.log('[Renderer] Calling saveDrawingMutation.mutate');
        saveDrawingMutation.mutate(newDrawing);
        toast({ title: 'Drawing Saved', description: `${currentTool.replace('_', ' ')} added to chart` });

        if (currentTool === 'fib_retracement' || currentTool === 'trend_fib') {
          finishDrawing(currentTool);
        }
        
        // Reset for next drawing
        return { points: [] };
      }
      
      return { points: newPoints };
    });
  }, [drawingMode, activeToolRef, autoColorEnabledRef, candles, setTempDrawing, setDrawings, saveDrawingMutation, onElliottWavePoint, drawingDefaultsByTool, toast, finishDrawing]);

  // Expose handlePointCommit through ref if provided
  useEffect(() => {
    if (onPointCommitRef) {
      onPointCommitRef.current = handlePointCommit;
    }
  }, [handlePointCommit, onPointCommitRef]);

  return null; // This component manages rendering logic, doesn't render UI
}

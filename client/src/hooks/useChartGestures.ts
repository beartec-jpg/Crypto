import { useRef, useCallback, useEffect } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

// Industry-standard gesture tolerances
const GESTURE_CONFIG = {
  LONG_PRESS_MS: 500,       // Long press activates after 500ms
  MOVE_THRESHOLD_PX: 12,    // Cancel long press if moved more than 12px early
};

interface GesturePoint {
  time: number;
  price: number;
}

interface UseChartGesturesOptions {
  enabled: boolean;
  onPointCommit: (point: GesturePoint) => void;
  onCrosshairModeChange?: (active: boolean) => void;
}

interface UseChartGesturesReturn {
  attachToChart: (chart: IChartApi, candleSeries: ISeriesApi<'Candlestick'>, container: HTMLElement) => void;
  detachFromChart: () => void;
  isCrosshairModeActive: () => boolean;
  getCrosshairPoint: () => GesturePoint | null;
  resetState: () => void;
}

export function useChartGestures(options: UseChartGesturesOptions): UseChartGesturesReturn {
  const { enabled, onPointCommit, onCrosshairModeChange } = options;
  
  // State refs
  const isPreciseModeRef = useRef<boolean>(false);
  const currentCrosshairRef = useRef<GesturePoint | null>(null);
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const savedHandleScrollRef = useRef<{ horzTouchDrag?: boolean; vertTouchDrag?: boolean } | null>(null);
  
  // Chart refs
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const cleanupFnsRef = useRef<(() => void)[]>([]);
  
  // Reset state
  const resetState = useCallback(() => {
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
    startPosRef.current = null;
    isPreciseModeRef.current = false;
  }, []);
  
  // Get current crosshair point
  const getCrosshairPoint = useCallback(() => {
    return currentCrosshairRef.current;
  }, []);
  
  // Check if crosshair mode is active
  const isCrosshairModeActive = useCallback(() => {
    return isPreciseModeRef.current;
  }, []);
  
  // Attach gesture handlers to chart
  const attachToChart = useCallback((
    chart: IChartApi,
    candleSeries: ISeriesApi<'Candlestick'>,
    container: HTMLElement
  ) => {
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    containerRef.current = container;
    
    // Enter precise mode - disable chart panning so crosshair can move freely
    const enterPreciseMode = () => {
      isPreciseModeRef.current = true;
      onCrosshairModeChange?.(true);
      
      // Save original settings and disable panning
      const currentHS = (chart.options() as any).handleScroll ?? {};
      savedHandleScrollRef.current = {
        horzTouchDrag: currentHS.horzTouchDrag,
        vertTouchDrag: currentHS.vertTouchDrag,
      };
      
      chart.applyOptions({
        handleScroll: {
          horzTouchDrag: false,
          vertTouchDrag: false,
        },
      });
    };
    
    // Exit precise mode - restore chart panning
    const exitPreciseMode = () => {
      isPreciseModeRef.current = false;
      onCrosshairModeChange?.(false);
      
      if (savedHandleScrollRef.current) {
        chart.applyOptions({ handleScroll: savedHandleScrollRef.current });
        savedHandleScrollRef.current = null;
      }
    };
    
    // Track current crosshair position via subscribeCrosshairMove
    const crosshairHandler = (param: any) => {
      if (param.time && param.seriesData) {
        // Get price from series data
        const seriesData = param.seriesData.get(candleSeries);
        if (seriesData) {
          const price = (seriesData as any).close ?? (seriesData as any).value ?? seriesData;
          if (typeof price === 'number') {
            currentCrosshairRef.current = {
              time: param.time as number,
              price,
            };
          }
        }
      } else {
        currentCrosshairRef.current = null;
      }
    };
    chart.subscribeCrosshairMove(crosshairHandler);
    
    // Quick tap → immediate drop (uses magnet snap via subscribeClick)
    const clickHandler = (param: any) => {
      if (!enabled) return;
      
      // Don't process clicks if in precise mode (handled by touchend)
      if (isPreciseModeRef.current) return;
      
      if (param.time && param.seriesData) {
        const seriesData = param.seriesData.get(candleSeries);
        if (seriesData) {
          const price = (seriesData as any).close ?? (seriesData as any).value ?? seriesData;
          if (typeof price === 'number') {
            onPointCommit({
              time: param.time as number,
              price,
            });
          }
        }
      }
    };
    chart.subscribeClick(clickHandler);
    
    // Touch start - begin long press detection
    const handleTouchStart = (e: TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      
      if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = setTimeout(enterPreciseMode, GESTURE_CONFIG.LONG_PRESS_MS);
    };
    
    // Touch move - cancel long press if moved too much before timer fires
    const handleTouchMove = (e: TouchEvent) => {
      if (!startPosRef.current || e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      const dist = Math.hypot(touch.clientX - startPosRef.current.x, touch.clientY - startPosRef.current.y);
      
      // Cancel long-press if user starts dragging early (allow normal chart pan)
      if (!isPreciseModeRef.current && dist > GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
        if (touchTimeoutRef.current) {
          clearTimeout(touchTimeoutRef.current);
          touchTimeoutRef.current = null;
        }
      }
      // In precise mode, panning is already disabled so crosshair moves with finger
    };
    
    // Touch end - commit point if in precise mode
    const handleTouchEnd = (_e: TouchEvent) => {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
        touchTimeoutRef.current = null;
      }
      
      if (isPreciseModeRef.current && currentCrosshairRef.current) {
        onPointCommit(currentCrosshairRef.current);
        exitPreciseMode();
      }
      
      // Reset for next touch
      startPosRef.current = null;
    };
    
    // Touch cancel
    const handleTouchCancel = () => {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
        touchTimeoutRef.current = null;
      }
      exitPreciseMode();
      startPosRef.current = null;
    };
    
    // Add event listeners
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    
    // Store cleanup functions
    cleanupFnsRef.current = [
      () => chart.unsubscribeCrosshairMove(crosshairHandler),
      () => chart.unsubscribeClick(clickHandler),
      () => container.removeEventListener('touchstart', handleTouchStart),
      () => container.removeEventListener('touchmove', handleTouchMove),
      () => container.removeEventListener('touchend', handleTouchEnd),
      () => container.removeEventListener('touchcancel', handleTouchCancel),
    ];
  }, [enabled, onPointCommit, onCrosshairModeChange]);
  
  // Detach from chart
  const detachFromChart = useCallback(() => {
    cleanupFnsRef.current.forEach(fn => fn());
    cleanupFnsRef.current = [];
    chartRef.current = null;
    candleSeriesRef.current = null;
    containerRef.current = null;
    resetState();
  }, [resetState]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      detachFromChart();
    };
  }, [detachFromChart]);
  
  return {
    attachToChart,
    detachFromChart,
    isCrosshairModeActive,
    getCrosshairPoint,
    resetState,
  };
}

export { GESTURE_CONFIG };
export type { GesturePoint, UseChartGesturesOptions, UseChartGesturesReturn };

import { useRef, useCallback, useEffect, useMemo } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

// Industry-standard gesture tolerances
const GESTURE_CONFIG = {
  LONG_PRESS_MS: 500,       // Long press activates after 500ms
  MOVE_THRESHOLD_PX: 12,    // Cancel long press if moved more than 12px early
  TAP_MAX_MS: 300,          // Quick tap must be under 300ms
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
  
  // CRITICAL: Use refs for values that change over time but need to be accessed in closures
  const enabledRef = useRef(enabled);
  const onPointCommitRef = useRef(onPointCommit);
  const onCrosshairModeChangeRef = useRef(onCrosshairModeChange);
  
  // Keep refs in sync with props
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  
  useEffect(() => {
    onPointCommitRef.current = onPointCommit;
  }, [onPointCommit]);
  
  useEffect(() => {
    onCrosshairModeChangeRef.current = onCrosshairModeChange;
  }, [onCrosshairModeChange]);
  
  // State refs
  const isPreciseModeRef = useRef<boolean>(false);
  const currentCrosshairRef = useRef<GesturePoint | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const savedHandleScrollRef = useRef<{ horzTouchDrag?: boolean; vertTouchDrag?: boolean } | null>(null);
  
  // Chart refs
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const chartElementRef = useRef<HTMLElement | null>(null);
  const cleanupFnsRef = useRef<(() => void)[]>([]);
  
  // Reset state
  const resetState = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    pointerStartRef.current = null;
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
  
  // Convert screen coordinates to chart time/price
  const screenToChartPoint = useCallback((clientX: number, clientY: number): GesturePoint | null => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const chartElement = chartElementRef.current;
    
    if (!chart || !series || !chartElement) return null;
    
    try {
      const rect = chartElement.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      
      // Convert X to time using timeScale
      const timeScale = chart.timeScale();
      const logicalX = timeScale.coordinateToLogical(x);
      if (logicalX === null) return null;
      
      // For time, we need to get visible logical range and interpolate
      // Use the logical coordinate directly as time index, then look up actual time
      const visibleRange = timeScale.getVisibleLogicalRange();
      if (!visibleRange) return null;
      
      // Get time from logical coordinate by converting back
      const time = timeScale.coordinateToTime(x);
      if (time === null) return null;
      
      // Convert Y to price
      const price = series.coordinateToPrice(y);
      if (price === null) return null;
      
      return { time: time as number, price };
    } catch (e) {
      console.error('[Gesture] screenToChartPoint error:', e);
      return null;
    }
  }, []);
  
  // Attach gesture handlers to chart
  const attachToChart = useCallback((
    chart: IChartApi,
    candleSeries: ISeriesApi<'Candlestick'>,
    _container: HTMLElement
  ) => {
    // Get the actual chart canvas element (not the container)
    const chartElement = chart.chartElement();
    if (!chartElement) {
      console.error('[Gesture] chart.chartElement() returned null');
      return;
    }
    
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    chartElementRef.current = chartElement;
    
    console.log('[Gesture] Attaching to chart element:', chartElement);
    
    // Enter precise mode - disable chart panning so crosshair can move freely
    const enterPreciseMode = () => {
      console.log('[Gesture] Entering precise mode');
      isPreciseModeRef.current = true;
      onCrosshairModeChangeRef.current?.(true);
      
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
      console.log('[Gesture] Exiting precise mode');
      isPreciseModeRef.current = false;
      onCrosshairModeChangeRef.current?.(false);
      
      if (savedHandleScrollRef.current) {
        chart.applyOptions({ handleScroll: savedHandleScrollRef.current });
        savedHandleScrollRef.current = null;
      }
    };
    
    // Pointer down - start tracking for tap vs long press
    const handlePointerDown = (e: PointerEvent) => {
      const isEnabled = enabledRef.current;
      console.log('[Gesture] PointerDown:', { enabled: isEnabled, isPrecise: isPreciseModeRef.current, x: e.clientX, y: e.clientY });
      
      if (!isEnabled) return;
      
      // Only handle primary pointer (ignore multi-touch secondary fingers)
      if (!e.isPrimary) return;
      
      pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      
      // Update current crosshair position
      const point = screenToChartPoint(e.clientX, e.clientY);
      if (point) {
        currentCrosshairRef.current = point;
        console.log('[Gesture] Initial point:', point);
      }
      
      // Clear any existing timeout
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
      
      // Start long press timer
      longPressTimeoutRef.current = setTimeout(() => {
        console.log('[Gesture] Long press timer fired');
        if (pointerStartRef.current) {
          enterPreciseMode();
        }
      }, GESTURE_CONFIG.LONG_PRESS_MS);
    };
    
    // Pointer move - update crosshair position, cancel long press if moved too much early
    const handlePointerMove = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      if (!pointerStartRef.current) return;
      
      const dist = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y);
      
      // Cancel long-press if user starts dragging early (before timer fires)
      if (!isPreciseModeRef.current && dist > GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
        console.log('[Gesture] Movement cancelled long press:', dist);
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        return;
      }
      
      // In precise mode, update crosshair position
      if (isPreciseModeRef.current) {
        // Prevent default to stop page scrolling
        e.preventDefault();
        
        const point = screenToChartPoint(e.clientX, e.clientY);
        if (point) {
          currentCrosshairRef.current = point;
          console.log('[Gesture] Updated crosshair:', point);
        }
      }
    };
    
    // Pointer up - either quick tap commit or precise mode commit
    const handlePointerUp = (e: PointerEvent) => {
      const isEnabled = enabledRef.current;
      console.log('[Gesture] PointerUp:', { enabled: isEnabled, isPrecise: isPreciseModeRef.current });
      
      if (!e.isPrimary) return;
      
      // Clear long press timer
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      
      if (!isEnabled || !pointerStartRef.current) {
        pointerStartRef.current = null;
        return;
      }
      
      const elapsed = Date.now() - pointerStartRef.current.time;
      const dist = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y);
      
      if (isPreciseModeRef.current) {
        // In precise mode - commit at current crosshair position
        if (currentCrosshairRef.current) {
          console.log('[Gesture] Precise mode commit:', currentCrosshairRef.current);
          onPointCommitRef.current(currentCrosshairRef.current);
        }
        exitPreciseMode();
      } else if (elapsed < GESTURE_CONFIG.TAP_MAX_MS && dist < GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
        // Quick tap - commit at tap location
        const point = screenToChartPoint(e.clientX, e.clientY);
        if (point) {
          console.log('[Gesture] Quick tap commit:', point);
          onPointCommitRef.current(point);
        }
      }
      
      pointerStartRef.current = null;
    };
    
    // Pointer cancel
    const handlePointerCancel = () => {
      console.log('[Gesture] PointerCancel');
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      if (isPreciseModeRef.current) {
        exitPreciseMode();
      }
      pointerStartRef.current = null;
    };
    
    // Add event listeners - use passive: false for move to allow preventDefault
    chartElement.addEventListener('pointerdown', handlePointerDown, { passive: true });
    chartElement.addEventListener('pointermove', handlePointerMove, { passive: false });
    chartElement.addEventListener('pointerup', handlePointerUp, { passive: true });
    chartElement.addEventListener('pointercancel', handlePointerCancel, { passive: true });
    chartElement.addEventListener('pointerleave', handlePointerCancel, { passive: true });
    
    // Store cleanup functions
    cleanupFnsRef.current = [
      () => chartElement.removeEventListener('pointerdown', handlePointerDown),
      () => chartElement.removeEventListener('pointermove', handlePointerMove),
      () => chartElement.removeEventListener('pointerup', handlePointerUp),
      () => chartElement.removeEventListener('pointercancel', handlePointerCancel),
      () => chartElement.removeEventListener('pointerleave', handlePointerCancel),
    ];
  }, [screenToChartPoint]);
  
  // Detach from chart
  const detachFromChart = useCallback(() => {
    cleanupFnsRef.current.forEach(fn => fn());
    cleanupFnsRef.current = [];
    chartRef.current = null;
    candleSeriesRef.current = null;
    chartElementRef.current = null;
    resetState();
  }, [resetState]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      detachFromChart();
    };
  }, [detachFromChart]);
  
  // Memoize return value to prevent effect re-runs in consuming components
  return useMemo(() => ({
    attachToChart,
    detachFromChart,
    isCrosshairModeActive,
    getCrosshairPoint,
    resetState,
  }), [attachToChart, detachFromChart, isCrosshairModeActive, getCrosshairPoint, resetState]);
}

export { GESTURE_CONFIG };
export type { GesturePoint, UseChartGesturesOptions, UseChartGesturesReturn };

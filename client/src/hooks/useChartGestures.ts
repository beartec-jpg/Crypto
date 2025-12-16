import { useRef, useCallback, useEffect } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

// Industry-standard gesture tolerances based on Apple HIG, Google Material Design, and TradingView
const GESTURE_CONFIG = {
  // Timing thresholds (milliseconds)
  TAP_MAX_DURATION: 300,      // Quick tap must be under 300ms
  LONG_PRESS_MIN: 500,        // Long press activates after 500ms
  
  // Movement thresholds (pixels) - lenient for touch screens
  TAP_MAX_MOVEMENT: 10,       // Tap allows up to 10px accidental movement
  SWIPE_MIN_MOVEMENT: 30,     // Swipe requires at least 30px movement
  SLOP_TOLERANCE: 20,         // Extra tolerance for imprecise touches
};

type GestureState = 'idle' | 'touching' | 'longPressing' | 'crosshairActive';

interface GesturePoint {
  time: number;
  price: number;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
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
  const gestureStateRef = useRef<GestureState>('idle');
  const touchStateRef = useRef<TouchState | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const crosshairPointRef = useRef<GesturePoint | null>(null);
  const savedSwipePointRef = useRef<GesturePoint | null>(null);
  const suppressNextClickRef = useRef<boolean>(false);
  
  // Chart refs
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const cleanupFnsRef = useRef<(() => void)[]>([]);
  
  // Utility to calculate distance
  const getDistance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  };
  
  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  
  // Set crosshair mode
  const setCrosshairMode = useCallback((active: boolean) => {
    gestureStateRef.current = active ? 'crosshairActive' : 'idle';
    onCrosshairModeChange?.(active);
  }, [onCrosshairModeChange]);
  
  // Reset all state
  const resetState = useCallback(() => {
    clearLongPressTimer();
    gestureStateRef.current = 'idle';
    touchStateRef.current = null;
    savedSwipePointRef.current = null;
    crosshairPointRef.current = null;
  }, [clearLongPressTimer]);
  
  // Get current crosshair point
  const getCrosshairPoint = useCallback(() => {
    return savedSwipePointRef.current || crosshairPointRef.current;
  }, []);
  
  // Check if crosshair mode is active
  const isCrosshairModeActive = useCallback(() => {
    return gestureStateRef.current === 'crosshairActive';
  }, []);
  
  // Commit the current point
  const commitPoint = useCallback(() => {
    const point = getCrosshairPoint();
    if (point) {
      suppressNextClickRef.current = true;
      onPointCommit(point);
    }
    resetState();
  }, [getCrosshairPoint, onPointCommit, resetState]);
  
  // Attach gesture handlers to chart
  const attachToChart = useCallback((
    chart: IChartApi,
    candleSeries: ISeriesApi<'Candlestick'>,
    container: HTMLElement
  ) => {
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    containerRef.current = container;
    
    // Helper to convert touch to chart point and store it
    const updateCrosshairFromTouch = (clientX: number, clientY: number): GesturePoint | null => {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      
      const timeScale = chart.timeScale();
      const time = timeScale.coordinateToTime(x);
      const price = candleSeries.coordinateToPrice(y);
      
      if (time === null || price === null) return null;
      
      const point = { time: time as number, price };
      crosshairPointRef.current = point;
      return point;
    };
    
    // Handle chart click - this fires for both mouse and touch
    const clickHandler = (_param: any) => {
      if (!enabled) return;
      
      // Skip if this click should be suppressed (fired after touch commit)
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      
      // Only process clicks when in crosshair mode
      if (gestureStateRef.current === 'crosshairActive') {
        const point = getCrosshairPoint();
        if (point) {
          suppressNextClickRef.current = true;
          onPointCommit(point);
        }
        resetState();
        return;
      }
      
      // Regular clicks do nothing - user must activate crosshair mode first via long-press
    };
    chart.subscribeClick(clickHandler);
    
    // Touch start handler
    const handleTouchStart = (e: TouchEvent) => {
      if (!enabled) return;
      
      const touch = e.touches[0];
      touchStateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        currentX: touch.clientX,
        currentY: touch.clientY
      };
      
      // CRITICAL: Don't reset state if already in crosshair mode - this allows tap-to-commit
      if (gestureStateRef.current !== 'crosshairActive') {
        gestureStateRef.current = 'touching';
        
        // Start long press timer only when not already in crosshair mode
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          if (gestureStateRef.current === 'touching' && touchStateRef.current) {
            // Activate crosshair mode and calculate initial point from touch position
            const point = updateCrosshairFromTouch(
              touchStateRef.current.currentX,
              touchStateRef.current.currentY
            );
            if (point) {
              savedSwipePointRef.current = point;
            }
            setCrosshairMode(true);
          }
        }, GESTURE_CONFIG.LONG_PRESS_MIN);
      } else {
        // Already in crosshair mode - update position for potential tap commit
        updateCrosshairFromTouch(touch.clientX, touch.clientY);
      }
    };
    
    // Touch move handler
    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStateRef.current) return;
      
      const touch = e.touches[0];
      touchStateRef.current.currentX = touch.clientX;
      touchStateRef.current.currentY = touch.clientY;
      
      const distance = getDistance(
        touchStateRef.current.startX,
        touchStateRef.current.startY,
        touch.clientX,
        touch.clientY
      );
      
      // Cancel long press if moved too far before timer fires
      if (distance > GESTURE_CONFIG.SLOP_TOLERANCE && gestureStateRef.current === 'touching') {
        clearLongPressTimer();
      }
      
      // In crosshair mode, actively update the crosshair position from touch
      if (gestureStateRef.current === 'crosshairActive') {
        const point = updateCrosshairFromTouch(touch.clientX, touch.clientY);
        if (point && distance >= GESTURE_CONFIG.SWIPE_MIN_MOVEMENT) {
          // Save the swiped position
          savedSwipePointRef.current = point;
        }
      }
    };
    
    // Touch end handler
    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStateRef.current) return;
      
      clearLongPressTimer();
      
      const touchEnd = e.changedTouches[0];
      const distance = getDistance(
        touchStateRef.current.startX,
        touchStateRef.current.startY,
        touchEnd.clientX,
        touchEnd.clientY
      );
      const duration = Date.now() - touchStateRef.current.startTime;
      
      // Determine gesture type
      const isTap = duration < GESTURE_CONFIG.TAP_MAX_DURATION && 
                    distance < GESTURE_CONFIG.TAP_MAX_MOVEMENT;
      
      if (gestureStateRef.current === 'crosshairActive') {
        if (isTap) {
          // Tap in crosshair mode commits the point
          suppressNextClickRef.current = true;
          commitPoint();
        }
        // If not a tap, stay in crosshair mode - user can keep adjusting
      } else {
        // Not in crosshair mode - reset touch state
        touchStateRef.current = null;
        gestureStateRef.current = 'idle';
      }
      
      // Prevent ghost clicks
      e.preventDefault();
    };
    
    // Touch cancel handler
    const handleTouchCancel = () => {
      clearLongPressTimer();
      touchStateRef.current = null;
      if (gestureStateRef.current === 'touching') {
        gestureStateRef.current = 'idle';
      }
    };
    
    // Add event listeners
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    
    // Store cleanup functions
    cleanupFnsRef.current = [
      () => chart.unsubscribeClick(clickHandler),
      () => container.removeEventListener('touchstart', handleTouchStart),
      () => container.removeEventListener('touchmove', handleTouchMove),
      () => container.removeEventListener('touchend', handleTouchEnd),
      () => container.removeEventListener('touchcancel', handleTouchCancel),
    ];
  }, [enabled, onPointCommit, clearLongPressTimer, setCrosshairMode, getCrosshairPoint, resetState, commitPoint]);
  
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

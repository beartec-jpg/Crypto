import { useRef, useCallback, useEffect, useMemo } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { CrosshairMode, LineStyle } from 'lightweight-charts';

const GESTURE_CONFIG = {
  LONG_PRESS_MS: 500,
  MOVE_THRESHOLD_PX: 12,
  TAP_MAX_MS: 300,
};

interface BarData {
  time: Time;
  open?: number;
  high: number;
  low: number;
  close?: number;
}

interface GesturePoint {
  time: Time;
  price: number;
}

interface UseChartGesturesOptions {
  enabled: boolean;
  data: BarData[];
  onPointCommit: (point: GesturePoint) => void;
  onPreviewPoint?: (point: GesturePoint | null) => void;
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
  const { enabled, data, onPointCommit, onPreviewPoint, onCrosshairModeChange } = options;

  const enabledRef = useRef(enabled);
  const dataRef = useRef<BarData[]>(data);
  const onPointCommitRef = useRef(onPointCommit);
  const onPreviewPointRef = useRef(onPreviewPoint);
  const onCrosshairModeChangeRef = useRef(onCrosshairModeChange);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { onPointCommitRef.current = onPointCommit; }, [onPointCommit]);
  useEffect(() => { onPreviewPointRef.current = onPreviewPoint; }, [onPreviewPoint]);
  useEffect(() => { onCrosshairModeChangeRef.current = onCrosshairModeChange; }, [onCrosshairModeChange]);

  // STATE MACHINE:
  // crosshairActiveRef = true means crosshair mode is ON (persists between touches)
  // isDraggingRef = true means user is currently dragging to reposition crosshair
  const crosshairActiveRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  
  // The stored crosshair position - THIS is the only source of truth for commits
  const crosshairCoordsRef = useRef<{ time: Time; price: number; localX: number; localY: number } | null>(null);
  
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number; id: number } | null>(null);
  const savedHandleScrollRef = useRef<{ horzTouchDrag?: boolean; vertTouchDrag?: boolean } | null>(null);
  const savedCrosshairStyleRef = useRef<any>(null);
  const crosshairLabelRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const chartElementRef = useRef<HTMLElement | null>(null);
  const cleanupFnsRef = useRef<(() => void)[]>([]);

  const getLocalCoords = (clientX: number, clientY: number) => {
    if (!chartElementRef.current) return null;
    const rect = chartElementRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const getTimeFromCoord = (localX: number): Time | null => {
    if (!chartRef.current) return null;
    const timeScale = chartRef.current.timeScale();
    const logical = timeScale.coordinateToLogical(localX);
    if (logical === null) return null;
    
    const bars = dataRef.current;
    if (bars.length === 0) return null;
    
    const idx = Math.max(0, Math.min(bars.length - 1, Math.round(logical)));
    return bars[idx].time;
  };

  const getBarAtTime = (targetTime: Time): BarData | null => {
    const bars = dataRef.current;
    const targetTimeStr = JSON.stringify(targetTime);
    for (let i = 0; i < bars.length; i++) {
      if (JSON.stringify(bars[i].time) === targetTimeStr) {
        return bars[i];
      }
    }
    return null;
  };

  const updateCrosshairLabel = (localX: number, localY: number, time: Time, price: number) => {
    if (!chartElementRef.current) return;
    
    let label = crosshairLabelRef.current;
    if (!label) {
      label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        background: rgba(255, 0, 0, 0.9);
        color: white;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: bold;
        pointer-events: none;
        z-index: 1000;
        white-space: nowrap;
        transform: translate(-50%, -100%);
        margin-top: -15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      `;
      chartElementRef.current.style.position = 'relative';
      chartElementRef.current.appendChild(label);
      crosshairLabelRef.current = label;
    }
    
    let timeStr = '';
    if (typeof time === 'number') {
      const date = new Date(time * 1000);
      timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      timeStr = String(time);
    }
    
    label.textContent = `📍 ${timeStr} | $${price.toFixed(4)}`;
    label.style.left = `${localX}px`;
    label.style.top = `${localY}px`;
    label.style.display = 'block';
  };

  const hideCrosshairLabel = () => {
    if (crosshairLabelRef.current) {
      crosshairLabelRef.current.style.display = 'none';
    }
  };

  const removeCrosshairLabel = () => {
    if (crosshairLabelRef.current && crosshairLabelRef.current.parentNode) {
      crosshairLabelRef.current.parentNode.removeChild(crosshairLabelRef.current);
      crosshairLabelRef.current = null;
    }
  };

  // Update the stored crosshair position from screen coordinates
  const updateCrosshairPosition = (localX: number, localY: number) => {
    if (!chartRef.current || !candleSeriesRef.current) return false;
    
    const price = candleSeriesRef.current.coordinateToPrice(localY);
    if (price === null) return false;
    
    const time = getTimeFromCoord(localX);
    if (time === null) return false;
    
    crosshairCoordsRef.current = { time, price, localX, localY };
    updateCrosshairLabel(localX, localY, time, price);
    onPreviewPointRef.current?.({ time, price });
    
    return true;
  };

  // Apply red crosshair styling
  const applyRedCrosshair = () => {
    if (!chartRef.current) return;
    
    const currentOptions = chartRef.current.options();
    const currentHS = (currentOptions as any).handleScroll ?? {};
    savedHandleScrollRef.current = {
      horzTouchDrag: currentHS.horzTouchDrag,
      vertTouchDrag: currentHS.vertTouchDrag,
    };
    savedCrosshairStyleRef.current = currentOptions.crosshair ?? {};

    chartRef.current.applyOptions({
      handleScroll: { horzTouchDrag: false, vertTouchDrag: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#FF0000', width: 2, style: LineStyle.Solid },
        horzLine: { color: '#FF0000', width: 2, style: LineStyle.Solid },
      },
    });
  };

  // Restore normal crosshair styling
  const restoreNormalCrosshair = () => {
    if (!chartRef.current) return;
    
    if (savedHandleScrollRef.current) {
      chartRef.current.applyOptions({ handleScroll: savedHandleScrollRef.current });
      savedHandleScrollRef.current = null;
    }

    if (savedCrosshairStyleRef.current) {
      chartRef.current.applyOptions({ crosshair: savedCrosshairStyleRef.current });
      savedCrosshairStyleRef.current = null;
    }
  };

  // ACTIVATE crosshair mode (stays on until commit or cancel)
  const activateCrosshairMode = (localX: number, localY: number) => {
    console.log('[Gesture] ACTIVATING crosshair mode');
    crosshairActiveRef.current = true;
    isDraggingRef.current = true;
    
    applyRedCrosshair();
    updateCrosshairPosition(localX, localY);
    onCrosshairModeChangeRef.current?.(true);
  };

  // DEACTIVATE crosshair mode completely
  const deactivateCrosshairMode = () => {
    console.log('[Gesture] DEACTIVATING crosshair mode');
    crosshairActiveRef.current = false;
    isDraggingRef.current = false;
    crosshairCoordsRef.current = null;
    
    restoreNormalCrosshair();
    hideCrosshairLabel();
    onCrosshairModeChangeRef.current?.(false);
    onPreviewPointRef.current?.(null);
  };

  // COMMIT point using the stored crosshair position (ignores finger position)
  const commitFromCrosshair = () => {
    const coords = crosshairCoordsRef.current;
    if (!coords) {
      console.warn('[Gesture] Cannot commit - no crosshair coords');
      return;
    }

    console.log('[Gesture] Committing from crosshair:', coords);

    // Find the bar at crosshair time
    const bar = getBarAtTime(coords.time);
    
    let commitPoint: GesturePoint;
    if (bar) {
      // Snap to high or low based on crosshair price position
      const mid = (bar.high + bar.low) / 2;
      const snapPrice = coords.price >= mid ? bar.high : bar.low;
      commitPoint = { time: bar.time, price: snapPrice };
      console.log('[Gesture] Snapped to bar:', { mid, snapPrice, high: bar.high, low: bar.low });
    } else {
      // Fallback: use raw coords
      commitPoint = { time: coords.time, price: coords.price };
      console.warn('[Gesture] Bar not found, using raw coords');
    }

    console.log('[Gesture] COMMIT POINT:', commitPoint);
    onPointCommitRef.current(commitPoint);
    
    // Exit crosshair mode after commit
    deactivateCrosshairMode();
  };

  // Quick tap for non-crosshair mode
  const commitQuickTap = (clientX: number, clientY: number) => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const local = getLocalCoords(clientX, clientY);
    if (!local) return;

    const timeScale = chartRef.current.timeScale();
    const logical = timeScale.coordinateToLogical(local.x);
    if (logical === null) return;

    const bars = dataRef.current;
    const idx = Math.round(logical);
    if (idx < 0 || idx >= bars.length) return;

    const bar = bars[idx];
    const tapPrice = candleSeriesRef.current.coordinateToPrice(local.y);
    if (tapPrice === null) return;

    const mid = (bar.high + bar.low) / 2;
    const point: GesturePoint = tapPrice >= mid
      ? { time: bar.time, price: bar.high }
      : { time: bar.time, price: bar.low };

    console.log('[Gesture] Quick tap committed:', point);
    onPointCommitRef.current(point);
  };

  const resetState = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    pointerStartRef.current = null;
    isDraggingRef.current = false;
  }, []);

  const getCrosshairPoint = useCallback(() => {
    const coords = crosshairCoordsRef.current;
    return coords ? { time: coords.time, price: coords.price } : null;
  }, []);
  
  const isCrosshairModeActive = useCallback(() => crosshairActiveRef.current, []);

  const attachToChart = useCallback((
    chart: IChartApi,
    candleSeries: ISeriesApi<'Candlestick'>,
    _container: HTMLElement
  ) => {
    const chartElement = chart.chartElement();
    if (!chartElement) {
      console.error('[Gesture] chart.chartElement() returned null');
      return;
    }

    console.log('[Gesture] Attaching to chart element');
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    chartElementRef.current = chartElement;

    chart.applyOptions({
      crosshair: { mode: CrosshairMode.Normal },
    });

    const handlePointerDown = (e: PointerEvent) => {
      if (!enabledRef.current || !e.isPrimary) return;

      console.log('[Gesture] PointerDown - crosshairActive:', crosshairActiveRef.current);
      
      pointerStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
        id: e.pointerId,
      };

      // If crosshair is already active, start a drag to reposition
      if (crosshairActiveRef.current) {
        isDraggingRef.current = true;
        try {
          chartElement.setPointerCapture(e.pointerId);
        } catch (err) {}
        return;
      }

      // Otherwise, start long press timer to activate crosshair mode
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = setTimeout(() => {
        console.log('[Gesture] Long press triggered - activating crosshair');
        const local = getLocalCoords(e.clientX, e.clientY);
        if (local) {
          activateCrosshairMode(local.x, local.y);
          try {
            chartElement.setPointerCapture(e.pointerId);
          } catch (err) {}
        }
      }, GESTURE_CONFIG.LONG_PRESS_MS);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!e.isPrimary || !pointerStartRef.current) return;

      const dist = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y);

      // If not in crosshair mode and moved too much, cancel long press
      if (!crosshairActiveRef.current && dist > GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        return;
      }

      // If crosshair is active and dragging, update crosshair position
      if (crosshairActiveRef.current && isDraggingRef.current) {
        e.preventDefault();
        const local = getLocalCoords(e.clientX, e.clientY);
        if (local) {
          updateCrosshairPosition(local.x, local.y);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!e.isPrimary) return;

      console.log('[Gesture] PointerUp - crosshairActive:', crosshairActiveRef.current, 'isDragging:', isDraggingRef.current);

      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }

      // Release pointer capture
      try {
        if (chartElement.hasPointerCapture(e.pointerId)) {
          chartElement.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}

      if (crosshairActiveRef.current) {
        const elapsed = Date.now() - (pointerStartRef.current?.time ?? 0);
        const dist = pointerStartRef.current 
          ? Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y)
          : 0;

        console.log('[Gesture] Crosshair mode - elapsed:', elapsed, 'dist:', dist);

        // If this was a quick tap (not a drag), COMMIT from crosshair position
        if (elapsed < GESTURE_CONFIG.TAP_MAX_MS && dist < GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
          console.log('[Gesture] TAP detected while crosshair active - committing from crosshair');
          commitFromCrosshair();
        } else {
          // This was a drag - just stop dragging, don't commit
          console.log('[Gesture] Drag ended - crosshair stays active, no commit');
          isDraggingRef.current = false;
        }
      } else if (pointerStartRef.current) {
        // Not in crosshair mode - handle quick tap
        const elapsed = Date.now() - pointerStartRef.current.time;
        const dist = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y);

        if (elapsed < GESTURE_CONFIG.TAP_MAX_MS && dist < GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
          commitQuickTap(e.clientX, e.clientY);
        }
      }

      pointerStartRef.current = null;
    };

    const handlePointerCancel = () => {
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
      isDraggingRef.current = false;
      pointerStartRef.current = null;
    };

    chartElement.addEventListener('pointerdown', handlePointerDown, { passive: true });
    chartElement.addEventListener('pointermove', handlePointerMove, { passive: false });
    chartElement.addEventListener('pointerup', handlePointerUp, { passive: true });
    chartElement.addEventListener('pointercancel', handlePointerCancel, { passive: true });
    chartElement.addEventListener('pointerleave', handlePointerCancel, { passive: true });

    cleanupFnsRef.current = [
      () => chartElement.removeEventListener('pointerdown', handlePointerDown),
      () => chartElement.removeEventListener('pointermove', handlePointerMove),
      () => chartElement.removeEventListener('pointerup', handlePointerUp),
      () => chartElement.removeEventListener('pointercancel', handlePointerCancel),
      () => chartElement.removeEventListener('pointerleave', handlePointerCancel),
    ];

    console.log('[Gesture] Attachment complete');
  }, []);

  const detachFromChart = useCallback(() => {
    cleanupFnsRef.current.forEach(fn => fn());
    cleanupFnsRef.current = [];
    removeCrosshairLabel();
    deactivateCrosshairMode();
    chartRef.current = null;
    candleSeriesRef.current = null;
    chartElementRef.current = null;
    resetState();
  }, [resetState]);

  useEffect(() => {
    return () => detachFromChart();
  }, [detachFromChart]);

  return useMemo(() => ({
    attachToChart,
    detachFromChart,
    isCrosshairModeActive,
    getCrosshairPoint,
    resetState,
  }), [attachToChart, detachFromChart, isCrosshairModeActive, getCrosshairPoint, resetState]);
}

export { GESTURE_CONFIG };
export type { GesturePoint, UseChartGesturesOptions, UseChartGesturesReturn, BarData };

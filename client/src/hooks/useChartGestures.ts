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

  const isPreciseModeRef = useRef<boolean>(false);
  const currentPreviewRef = useRef<GesturePoint | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number; id: number } | null>(null);
  const savedHandleScrollRef = useRef<{ horzTouchDrag?: boolean; vertTouchDrag?: boolean } | null>(null);
  const savedCrosshairStyleRef = useRef<any>(null);
  
  // Store the live crosshair coordinates (always updated during drag)
  const crosshairCoordsRef = useRef<{ time: Time; price: number } | null>(null);
  const crosshairLabelRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const chartElementRef = useRef<HTMLElement | null>(null);
  const cleanupFnsRef = useRef<(() => void)[]>([]);

  const resetState = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    pointerStartRef.current = null;
    isPreciseModeRef.current = false;
    currentPreviewRef.current = null;
    onPreviewPointRef.current?.(null);
  }, []);

  const getCrosshairPoint = useCallback(() => currentPreviewRef.current, []);
  const isCrosshairModeActive = useCallback(() => isPreciseModeRef.current, []);

  const getLocalCoords = (clientX: number, clientY: number) => {
    if (!chartElementRef.current) return null;
    const rect = chartElementRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const getBarAtLogical = (logical: number): BarData | null => {
    const bars = dataRef.current;
    const idx = Math.round(logical);
    if (idx < 0 || idx >= bars.length) return null;
    return bars[idx];
  };

  const calculateMagnetPoint = useCallback((localX: number, localY: number): GesturePoint | null => {
    if (!chartRef.current || !candleSeriesRef.current) return null;

    const timeScale = chartRef.current.timeScale();

    const logical = timeScale.coordinateToLogical(localX);
    if (logical === null) return null;

    const bar = getBarAtLogical(logical);
    if (!bar) return null;

    const highCoord = candleSeriesRef.current.priceToCoordinate(bar.high);
    const lowCoord = candleSeriesRef.current.priceToCoordinate(bar.low);
    if (highCoord === null || lowCoord === null) return null;

    const distH = Math.abs(localY - highCoord);
    const distL = Math.abs(localY - lowCoord);

    const price = distH <= distL ? bar.high : bar.low;

    return { time: bar.time, price };
  }, []);

  const enterPreciseMode = useCallback(() => {
    if (!chartRef.current || !pointerStartRef.current || !chartElementRef.current) return;

    isPreciseModeRef.current = true;
    onCrosshairModeChangeRef.current?.(true);

    try {
      chartElementRef.current.setPointerCapture(pointerStartRef.current.id);
    } catch (e) {
      console.warn('[Gesture] Pointer capture failed:', e);
    }

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

    const rect = chartElementRef.current.getBoundingClientRect();
    const localX = pointerStartRef.current.x - rect.left;
    const localY = pointerStartRef.current.y - rect.top;

    const initialPoint = calculateMagnetPoint(localX, localY);
    currentPreviewRef.current = initialPoint;
    onPreviewPointRef.current?.(initialPoint);
    
    // Initialize crosshair tracking with the initial touch position
    console.log('[Gesture] enterPreciseMode - initializing crosshair at localX:', localX, 'localY:', localY);
    if (candleSeriesRef.current) {
      const price = candleSeriesRef.current.coordinateToPrice(localY);
      const time = getTimeFromCoord(localX);
      console.log('[Gesture] Initial coords - time:', time, 'price:', price);
      if (time !== null && price !== null) {
        crosshairCoordsRef.current = { time, price };
        updateCrosshairLabel(localX, localY, time, price);
        console.log('[Gesture] Crosshair coords initialized:', crosshairCoordsRef.current);
      } else {
        console.warn('[Gesture] Failed to get initial time/price');
      }
    } else {
      console.warn('[Gesture] candleSeriesRef.current is null');
    }
  }, [calculateMagnetPoint]);

  const exitPreciseMode = useCallback(() => {
    if (!chartRef.current) return;

    isPreciseModeRef.current = false;
    onCrosshairModeChangeRef.current?.(false);
    currentPreviewRef.current = null;
    crosshairCoordsRef.current = null;
    onPreviewPointRef.current?.(null);
    
    // Hide the crosshair label
    hideCrosshairLabel();

    if (savedHandleScrollRef.current) {
      chartRef.current.applyOptions({ handleScroll: savedHandleScrollRef.current });
      savedHandleScrollRef.current = null;
    }

    if (savedCrosshairStyleRef.current) {
      chartRef.current.applyOptions({ crosshair: savedCrosshairStyleRef.current });
      savedCrosshairStyleRef.current = null;
    }

    if (chartElementRef.current && pointerStartRef.current) {
      try {
        if (chartElementRef.current.hasPointerCapture(pointerStartRef.current.id)) {
          chartElementRef.current.releasePointerCapture(pointerStartRef.current.id);
        }
      } catch (e) {}
    }
  }, []);

  // Get time from local X coordinate by finding nearest bar or interpolating
  const getTimeFromCoord = (localX: number): Time | null => {
    if (!chartRef.current) return null;
    const timeScale = chartRef.current.timeScale();
    const logical = timeScale.coordinateToLogical(localX);
    if (logical === null) return null;
    
    const bars = dataRef.current;
    if (bars.length === 0) return null;
    
    // Clamp to valid bar range
    const idx = Math.max(0, Math.min(bars.length - 1, Math.round(logical)));
    return bars[idx].time;
  };

  // Create or update the crosshair label element
  const updateCrosshairLabel = (localX: number, localY: number, time: Time, price: number) => {
    if (!chartElementRef.current) return;
    
    let label = crosshairLabelRef.current;
    if (!label) {
      label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        background: rgba(255, 0, 0, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
        pointer-events: none;
        z-index: 1000;
        white-space: nowrap;
        transform: translate(-50%, -100%);
        margin-top: -10px;
      `;
      chartElementRef.current.style.position = 'relative';
      chartElementRef.current.appendChild(label);
      crosshairLabelRef.current = label;
    }
    
    // Format time for display
    let timeStr = '';
    if (typeof time === 'number') {
      const date = new Date(time * 1000);
      timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      timeStr = String(time);
    }
    
    label.textContent = `${timeStr} | $${price.toFixed(4)}`;
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

  // Update crosshair tracking during precise mode drag
  const updatePreviewForPrecise = (localX: number, localY: number) => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    
    // Get price directly from Y coordinate
    const price = candleSeriesRef.current.coordinateToPrice(localY);
    if (price === null) return;
    
    // Get time from X coordinate (clamps to valid bar range)
    const time = getTimeFromCoord(localX);
    if (time === null) return;
    
    // Always save the current crosshair position
    crosshairCoordsRef.current = { time, price };
    
    // Update the visual label
    updateCrosshairLabel(localX, localY, time, price);
    
    // Also update preview for any external listeners
    const point = calculateMagnetPoint(localX, localY);
    currentPreviewRef.current = point;
    onPreviewPointRef.current?.(point);
    
    console.log('[Gesture] Crosshair tracking:', { time, price: price.toFixed(4) });
  };

  const getVisibleBarCount = () => {
    if (!chartRef.current) return 100;
    const ts = chartRef.current.timeScale();
    const vr = ts.getVisibleLogicalRange();
    if (!vr) return 100;
    return Math.round(vr.to - vr.from) + 1;
  };

  const getWindowRadius = (visibleCount: number) => {
    if (visibleCount <= 50) return 0;
    if (visibleCount <= 100) return 1;
    if (visibleCount <= 200) return 2;
    if (visibleCount <= 400) return 3;
    return 4;
  };

  const commitQuickTap = (clientX: number, clientY: number) => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const local = getLocalCoords(clientX, clientY);
    if (!local) return;

    const visibleCount = getVisibleBarCount();
    const radius = getWindowRadius(visibleCount);

    const logical = chartRef.current.timeScale().coordinateToLogical(local.x);
    if (logical === null) return;

    const center = Math.round(logical);
    const bars = dataRef.current;

    const windowBars: BarData[] = [];
    for (let i = -radius; i <= radius; i++) {
      const idx = center + i;
      if (idx >= 0 && idx < bars.length) {
        windowBars.push(bars[idx]);
      }
    }

    if (windowBars.length === 0) return;

    let maxHigh = -Infinity;
    let maxHighTime: Time | null = null;
    let minLow = Infinity;
    let minLowTime: Time | null = null;

    windowBars.forEach((b) => {
      if (b.high > maxHigh) {
        maxHigh = b.high;
        maxHighTime = b.time;
      }
      if (b.low < minLow) {
        minLow = b.low;
        minLowTime = b.time;
      }
    });

    if (maxHighTime === null || minLowTime === null) return;

    const tapPrice = candleSeriesRef.current.coordinateToPrice(local.y);
    if (tapPrice === null) return;

    const mid = (maxHigh + minLow) / 2;

    const point: GesturePoint = tapPrice >= mid
      ? { time: maxHighTime, price: maxHigh }
      : { time: minLowTime, price: minLow };

    console.log('[Gesture] Quick tap committed:', point);
    onPointCommitRef.current(point);
  };

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
      console.log('[Gesture] PointerDown RAW - enabled:', enabledRef.current, 'isPrimary:', e.isPrimary);
      if (!enabledRef.current || !e.isPrimary) return;

      console.log('[Gesture] PointerDown PASSED -');
      pointerStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
        id: e.pointerId,
      };

      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = setTimeout(() => {
        console.log('[Gesture] Long press triggered');
        enterPreciseMode();
      }, GESTURE_CONFIG.LONG_PRESS_MS);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!e.isPrimary || !pointerStartRef.current) return;

      const dist = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y);

      if (!isPreciseModeRef.current && dist > GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
      }

      if (isPreciseModeRef.current) {
        e.preventDefault();
        const local = getLocalCoords(e.clientX, e.clientY);
        if (local) {
          updatePreviewForPrecise(local.x, local.y);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!e.isPrimary) return;

      console.log('[Gesture] PointerUp - isPreciseMode:', isPreciseModeRef.current);

      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }

      if (isPreciseModeRef.current) {
        // Use the saved crosshair coordinates to determine the commit point
        const crosshairCoords = crosshairCoordsRef.current;
        console.log('[Gesture] Precise mode release - crosshairCoords:', crosshairCoords);
        
        if (crosshairCoords) {
          // Find the candle at the crosshair time
          const bars = dataRef.current;
          const targetTime = crosshairCoords.time;
          
          // Find bar by time (compare as strings to handle object Time types)
          let bar: BarData | null = null;
          const targetTimeStr = JSON.stringify(targetTime);
          for (let i = 0; i < bars.length; i++) {
            if (JSON.stringify(bars[i].time) === targetTimeStr) {
              bar = bars[i];
              break;
            }
          }
          
          console.log('[Gesture] Bar lookup - targetTime:', targetTime, 'found bar:', bar ? 'yes' : 'no');
          
          if (bar) {
            // Determine if crosshair price is above or below candle midpoint
            const mid = (bar.high + bar.low) / 2;
            const snapPrice = crosshairCoords.price >= mid ? bar.high : bar.low;
            
            const commitPoint: GesturePoint = {
              time: bar.time,
              price: snapPrice,
            };
            
            console.log('[Gesture] Precise mode commit - crosshair:', crosshairCoords, 'snapped to:', commitPoint);
            onPointCommitRef.current(commitPoint);
          } else {
            // Fallback: use crosshair coords directly without snapping
            console.warn('[Gesture] Bar not found, using crosshair coords directly');
            onPointCommitRef.current(crosshairCoords);
          }
        } else {
          console.warn('[Gesture] No crosshair coords saved - nothing to commit');
        }
        exitPreciseMode();
      } else if (pointerStartRef.current) {
        const elapsed = Date.now() - pointerStartRef.current.time;
        const dist = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y);

        console.log('[Gesture] Tap check - elapsed:', elapsed, 'dist:', dist);
        if (elapsed < GESTURE_CONFIG.TAP_MAX_MS && dist < GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
          commitQuickTap(e.clientX, e.clientY);
        }
      }

      pointerStartRef.current = null;
    };

    const handlePointerCancel = () => {
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
      if (isPreciseModeRef.current) exitPreciseMode();
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
  }, [enterPreciseMode, exitPreciseMode]);

  const detachFromChart = useCallback(() => {
    cleanupFnsRef.current.forEach(fn => fn());
    cleanupFnsRef.current = [];
    removeCrosshairLabel();
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

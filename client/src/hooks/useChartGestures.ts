import { useRef, useCallback, useEffect, useMemo } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { CrosshairMode } from 'lightweight-charts';

const GESTURE_CONFIG = {
  LONG_PRESS_MS: 500,
  MOVE_THRESHOLD_PX: 12,
  TAP_MAX_MS: 300,
  DRAG_PROXIMITY_PX: 50,
};

// Snap window sizes based on visible candles - returns number of candles to search (radius from center)
// User requested thresholds: <50→1, <150→3, <300→5, <500→7, <700→9, >=700→11
const getCrosshairSnapRadius = (visibleCandles: number): number => {
  if (visibleCandles >= 700) return 5; // 11 candle window
  if (visibleCandles >= 500) return 4; // 9 candle window
  if (visibleCandles >= 300) return 3; // 7 candle window
  if (visibleCandles >= 150) return 2; // 5 candle window  
  if (visibleCandles >= 50) return 1;  // 3 candle window
  return 0; // 1 candle (single) for <50 visible
};

// Tap mode uses same thresholds as crosshair for consistency
const getTapSnapRadius = (visibleCandles: number): number => {
  if (visibleCandles >= 700) return 5; // 11 candle window
  if (visibleCandles >= 500) return 4; // 9 candle window
  if (visibleCandles >= 300) return 3; // 7 candle window
  if (visibleCandles >= 150) return 2; // 5 candle window
  if (visibleCandles >= 50) return 1;  // 3 candle window
  return 0; // 1 candle (single) for <50 visible
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
  snapType?: 'high' | 'low' | 'none';
}

interface UseChartGesturesOptions {
  enabled: boolean;
  data: BarData[];
  onPointCommit: (point: GesturePoint) => void;
  onPreviewPoint?: (point: GesturePoint | null) => void;
  onCrosshairModeChange?: (active: boolean) => void;
  autoSnapEnabled?: boolean;
}

interface UseChartGesturesReturn {
  attachToChart: (chart: IChartApi, candleSeries: ISeriesApi<'Candlestick'>, container: HTMLElement) => void;
  detachFromChart: () => void;
  isCrosshairModeActive: () => boolean;
  getCrosshairPoint: () => GesturePoint | null;
  resetState: () => void;
  cancelCrosshairMode: () => void;
}

export function useChartGestures(options: UseChartGesturesOptions): UseChartGesturesReturn {
  const { enabled, data, onPointCommit, onPreviewPoint, onCrosshairModeChange, autoSnapEnabled = true } = options;

  const enabledRef = useRef(enabled);
  const dataRef = useRef<BarData[]>(data);
  const onPointCommitRef = useRef(onPointCommit);
  const onPreviewPointRef = useRef(onPreviewPoint);
  const onCrosshairModeChangeRef = useRef(onCrosshairModeChange);
  const autoSnapEnabledRef = useRef(autoSnapEnabled);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { onPointCommitRef.current = onPointCommit; }, [onPointCommit]);
  useEffect(() => { onPreviewPointRef.current = onPreviewPoint; }, [onPreviewPoint]);
  useEffect(() => { onCrosshairModeChangeRef.current = onCrosshairModeChange; }, [onCrosshairModeChange]);
  useEffect(() => { autoSnapEnabledRef.current = autoSnapEnabled; }, [autoSnapEnabled]);

  const crosshairActiveRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  
  // The stored crosshair position - ONLY source of truth
  // Now also stores logicalIdx to prevent issues when chart scrolls
  const crosshairCoordsRef = useRef<{ time: Time; price: number; localX: number; localY: number; logicalIdx: number } | null>(null);
  
  // For delta-based dragging: store where the finger started and where crosshair was at drag start
  const dragStartRef = useRef<{ fingerX: number; fingerY: number; crosshairX: number; crosshairY: number } | null>(null);
  
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number; id: number } | null>(null);
  const savedHandleScrollRef = useRef<{ horzTouchDrag?: boolean; vertTouchDrag?: boolean } | null>(null);
  
  // Custom crosshair elements (we draw our own, don't rely on chart's native one)
  const crosshairContainerRef = useRef<HTMLDivElement | null>(null);
  const vertLineRef = useRef<HTMLDivElement | null>(null);
  const horzLineRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);

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

  // Get number of visible candles on screen
  const getVisibleCandleCount = (): number => {
    if (!chartRef.current) return 100;
    const ts = chartRef.current.timeScale();
    const vr = ts.getVisibleLogicalRange();
    if (!vr) return 100;
    return Math.round(vr.to - vr.from) + 1;
  };

  // Get the logical index for a local X coordinate
  const getLogicalIndex = (localX: number): number | null => {
    if (!chartRef.current) return null;
    const ts = chartRef.current.timeScale();
    const logical = ts.coordinateToLogical(localX);
    
    // Debug logging
    const visibleRange = ts.getVisibleLogicalRange();
    console.log(`[Gesture] getLogicalIndex: localX=${localX.toFixed(1)}, raw logical=${logical?.toFixed(2)}, visibleRange=${visibleRange ? `${visibleRange.from.toFixed(0)}-${visibleRange.to.toFixed(0)}` : 'null'}`);
    
    return logical !== null ? Math.round(logical) : null;
  };

  // Get time from a logical index
  const getTimeFromLogical = (logicalIdx: number): Time | null => {
    const bars = dataRef.current;
    if (bars.length === 0) return null;
    const idx = Math.max(0, Math.min(bars.length - 1, logicalIdx));
    return bars[idx].time;
  };

  // Find best high/low in a window of candles around a center index
  const findSnapPointInWindow = (
    centerIdx: number, 
    radius: number, 
    priceAtCursor: number
  ): GesturePoint | null => {
    const bars = dataRef.current;
    const visibleCandles = getVisibleCandleCount();
    
    console.log(`[Gesture] findSnapPointInWindow called: centerIdx=${centerIdx}, radius=${radius}, priceAtCursor=${priceAtCursor.toFixed(4)}, totalBars=${bars.length}`);
    
    // Validate center index
    if (centerIdx < 0 || centerIdx >= bars.length) {
      console.warn(`[Gesture] centerIdx ${centerIdx} out of bounds [0, ${bars.length - 1}]`);
      return null;
    }
    
    // Log center candle details
    const centerBar = bars[centerIdx];
    console.log(`[Gesture] Center candle: idx=${centerIdx}, time=${centerBar.time}, H=${centerBar.high.toFixed(4)}, L=${centerBar.low.toFixed(4)}`);
    
    // Collect bars in window
    const windowBars: { bar: BarData; idx: number }[] = [];
    for (let i = -radius; i <= radius; i++) {
      const idx = centerIdx + i;
      if (idx >= 0 && idx < bars.length) {
        windowBars.push({ bar: bars[idx], idx });
      }
    }
    
    if (windowBars.length === 0) return null;
    
    console.log(`[Gesture] Window contains ${windowBars.length} bars from idx ${windowBars[0].idx} to ${windowBars[windowBars.length - 1].idx}`);
    
    // Find highest high and lowest low in window
    let maxHigh = -Infinity;
    let maxHighTime: Time | null = null;
    let maxHighIdx = -1;
    let minLow = Infinity;
    let minLowTime: Time | null = null;
    let minLowIdx = -1;
    
    for (const { bar, idx } of windowBars) {
      if (bar.high > maxHigh) {
        maxHigh = bar.high;
        maxHighTime = bar.time;
        maxHighIdx = idx;
      }
      if (bar.low < minLow) {
        minLow = bar.low;
        minLowTime = bar.time;
        minLowIdx = idx;
      }
    }
    
    if (maxHighTime === null || minLowTime === null) return null;
    
    // Snap to high or low based on cursor price position
    const mid = (maxHigh + minLow) / 2;
    const isHigh = priceAtCursor >= mid;
    const resultTime = isHigh ? maxHighTime : minLowTime;
    const resultPrice = isHigh ? maxHigh : minLow;
    const resultIdx = isHigh ? maxHighIdx : minLowIdx;
    const snapType: 'high' | 'low' = isHigh ? 'high' : 'low';
    
    console.log(`[Gesture] Window HIGH: idx=${maxHighIdx}, price=${maxHigh.toFixed(4)} | LOW: idx=${minLowIdx}, price=${minLow.toFixed(4)}`);
    console.log(`[Gesture] Cursor at ${priceAtCursor.toFixed(4)}, mid=${mid.toFixed(4)} → snapping to ${isHigh ? 'HIGH' : 'LOW'} at idx=${resultIdx}, price=${resultPrice.toFixed(4)}`);
    
    return { time: resultTime, price: resultPrice, snapType };
  };

  // Create the custom crosshair elements
  const createCrosshairElements = () => {
    if (!chartElementRef.current || crosshairContainerRef.current) return;
    
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 999;
    `;
    
    const vertLine = document.createElement('div');
    vertLine.style.cssText = `
      position: absolute;
      width: 2px;
      background: #FF0000;
      top: 0;
      bottom: 50px;
      display: none;
    `;
    
    const horzLine = document.createElement('div');
    horzLine.style.cssText = `
      position: absolute;
      height: 2px;
      background: #FF0000;
      left: 0;
      right: 50px;
      display: none;
    `;
    
    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      background: rgba(255, 0, 0, 0.95);
      color: white;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: bold;
      white-space: nowrap;
      transform: translate(-50%, -100%);
      margin-top: -12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: none;
    `;
    
    container.appendChild(vertLine);
    container.appendChild(horzLine);
    container.appendChild(label);
    
    chartElementRef.current.style.position = 'relative';
    chartElementRef.current.appendChild(container);
    
    crosshairContainerRef.current = container;
    vertLineRef.current = vertLine;
    horzLineRef.current = horzLine;
    labelRef.current = label;
  };

  // Update crosshair visuals at a specific position
  const drawCrosshairAt = (localX: number, localY: number, time: Time, price: number) => {
    if (!vertLineRef.current || !horzLineRef.current || !labelRef.current) return;
    
    // Position the vertical line
    vertLineRef.current.style.left = `${localX}px`;
    vertLineRef.current.style.display = 'block';
    
    // Position the horizontal line
    horzLineRef.current.style.top = `${localY}px`;
    horzLineRef.current.style.display = 'block';
    
    // Format time for label
    let timeStr = '';
    if (typeof time === 'number') {
      const date = new Date(time * 1000);
      timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      timeStr = String(time);
    }
    
    // Calculate window size for display
    const visibleCount = getVisibleCandleCount();
    const radius = getCrosshairSnapRadius(visibleCount);
    const windowSize = radius * 2 + 1;
    
    // Position and update the label with window size
    labelRef.current.textContent = `📍 ${timeStr} | $${price.toFixed(4)} | ${windowSize} candle${windowSize > 1 ? 's' : ''}`;
    labelRef.current.style.left = `${localX}px`;
    labelRef.current.style.top = `${localY}px`;
    labelRef.current.style.display = 'block';
  };

  const hideCrosshair = () => {
    if (vertLineRef.current) vertLineRef.current.style.display = 'none';
    if (horzLineRef.current) horzLineRef.current.style.display = 'none';
    if (labelRef.current) labelRef.current.style.display = 'none';
  };

  const removeCrosshairElements = () => {
    if (crosshairContainerRef.current && crosshairContainerRef.current.parentNode) {
      crosshairContainerRef.current.parentNode.removeChild(crosshairContainerRef.current);
    }
    crosshairContainerRef.current = null;
    vertLineRef.current = null;
    horzLineRef.current = null;
    labelRef.current = null;
  };

  // Set crosshair position (stores coords and draws crosshair at that location)
  const setCrosshairPosition = (localX: number, localY: number): boolean => {
    if (!chartRef.current || !candleSeriesRef.current) return false;
    
    const price = candleSeriesRef.current.coordinateToPrice(localY);
    if (price === null) return false;
    
    const time = getTimeFromCoord(localX);
    if (time === null) return false;
    
    // Get logical index at this position and store it to prevent drift when chart updates
    const logicalIdx = getLogicalIndex(localX);
    if (logicalIdx === null) return false;
    
    // Store the position with logical index
    crosshairCoordsRef.current = { time, price, localX, localY, logicalIdx };
    
    // Draw crosshair at the STORED position (not finger position)
    drawCrosshairAt(localX, localY, time, price);
    
    onPreviewPointRef.current?.({ time, price });
    
    console.log('[Gesture] Crosshair set to:', { time, price: price.toFixed(4), localX, localY, logicalIdx });
    return true;
  };


  // Activate crosshair mode
  const activateCrosshairMode = (localX: number, localY: number) => {
    console.log('[Gesture] ACTIVATING crosshair mode at:', localX, localY);
    
    createCrosshairElements();
    
    crosshairActiveRef.current = true;
    isDraggingRef.current = false; // Start as false - only set true when user actually drags
    
    // Disable chart scrolling
    if (chartRef.current) {
      const currentOptions = chartRef.current.options();
      const currentHS = (currentOptions as any).handleScroll ?? {};
      savedHandleScrollRef.current = {
        horzTouchDrag: currentHS.horzTouchDrag,
        vertTouchDrag: currentHS.vertTouchDrag,
      };
      chartRef.current.applyOptions({
        handleScroll: { horzTouchDrag: false, vertTouchDrag: false },
        crosshair: { mode: CrosshairMode.Hidden },
      });
    }
    
    setCrosshairPosition(localX, localY);
    onCrosshairModeChangeRef.current?.(true);
  };

  // Deactivate crosshair mode
  const deactivateCrosshairMode = () => {
    console.log('[Gesture] DEACTIVATING crosshair mode');
    
    crosshairActiveRef.current = false;
    isDraggingRef.current = false;
    crosshairCoordsRef.current = null;
    
    hideCrosshair();
    
    if (chartRef.current) {
      if (savedHandleScrollRef.current) {
        chartRef.current.applyOptions({ handleScroll: savedHandleScrollRef.current });
        savedHandleScrollRef.current = null;
      }
      chartRef.current.applyOptions({
        crosshair: { mode: CrosshairMode.Normal },
      });
    }
    
    onCrosshairModeChangeRef.current?.(false);
    onPreviewPointRef.current?.(null);
  };

  // Commit point from stored crosshair position with window snapping
  const commitFromCrosshair = () => {
    const coords = crosshairCoordsRef.current;
    if (!coords) {
      console.warn('[Gesture] Cannot commit - no crosshair coords');
      return;
    }

    console.log('[Gesture] Committing from crosshair:', coords, 'autoSnap:', autoSnapEnabledRef.current);

    // If auto-snap is disabled, use raw coords
    if (!autoSnapEnabledRef.current) {
      console.log('[Gesture] COMMIT POINT (no snap - raw):', { time: coords.time, price: coords.price });
      onPointCommitRef.current({ time: coords.time, price: coords.price, snapType: 'none' });
      deactivateCrosshairMode();
      return;
    }

    // Use the STORED logical index (not recalculated) to prevent drift
    const centerIdx = coords.logicalIdx;

    // Get snap radius based on visible candles (crosshair mode)
    const visibleCount = getVisibleCandleCount();
    const radius = getCrosshairSnapRadius(visibleCount);
    
    console.log('[Gesture] Crosshair snap - visible:', visibleCount, 'radius:', radius, 'centerIdx:', centerIdx);

    // Find best snap point in window
    const snapPoint = findSnapPointInWindow(centerIdx, radius, coords.price);
    
    if (snapPoint) {
      console.log('[Gesture] COMMIT POINT (snapped):', snapPoint);
      onPointCommitRef.current(snapPoint);
    } else {
      // Fallback to raw coords
      console.warn('[Gesture] No snap point found, using raw coords');
      onPointCommitRef.current({ time: coords.time, price: coords.price, snapType: 'none' });
    }
    
    deactivateCrosshairMode();
  };

  // Quick tap for non-crosshair mode with window snapping
  const commitQuickTap = (clientX: number, clientY: number) => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const local = getLocalCoords(clientX, clientY);
    if (!local) return;

    const centerIdx = getLogicalIndex(local.x);
    if (centerIdx === null) return;

    const tapPrice = candleSeriesRef.current.coordinateToPrice(local.y);
    if (tapPrice === null) return;

    const tapTime = getTimeFromLogical(centerIdx);
    if (tapTime === null) return;

    console.log('[Gesture] Quick tap - autoSnap:', autoSnapEnabledRef.current);

    // If auto-snap is disabled, use raw coords
    if (!autoSnapEnabledRef.current) {
      console.log('[Gesture] Quick tap committed (no snap - raw):', { time: tapTime, price: tapPrice });
      onPointCommitRef.current({ time: tapTime, price: tapPrice, snapType: 'none' });
      return;
    }

    // Get snap radius based on visible candles (tap mode - more lenient)
    const visibleCount = getVisibleCandleCount();
    const radius = getTapSnapRadius(visibleCount);
    
    console.log('[Gesture] Tap snap - visible:', visibleCount, 'radius:', radius, 'centerIdx:', centerIdx);

    // Find best snap point in window
    const snapPoint = findSnapPointInWindow(centerIdx, radius, tapPrice);
    
    if (snapPoint) {
      console.log('[Gesture] Quick tap committed (snapped):', snapPoint);
      onPointCommitRef.current(snapPoint);
    } else {
      // Fallback to raw coords if no snap found
      console.log('[Gesture] Quick tap committed (no snap - fallback):', { time: tapTime, price: tapPrice });
      onPointCommitRef.current({ time: tapTime, price: tapPrice, snapType: 'none' });
    }
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

    const handlePointerDown = (e: PointerEvent) => {
      console.log('[Gesture] PointerDown RAW - enabled:', enabledRef.current, 'isPrimary:', e.isPrimary);
      
      if (!enabledRef.current || !e.isPrimary) {
        console.log('[Gesture] PointerDown IGNORED - enabled:', enabledRef.current, 'isPrimary:', e.isPrimary);
        return;
      }

      const local = getLocalCoords(e.clientX, e.clientY);
      if (!local) {
        console.log('[Gesture] PointerDown IGNORED - no local coords');
        return;
      }

      console.log('[Gesture] PointerDown - crosshairActive:', crosshairActiveRef.current, 'local:', local);
      
      pointerStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
        id: e.pointerId,
      };

      if (crosshairActiveRef.current) {
        // Crosshair is already active - any swipe moves it (delta-based)
        // Store the starting positions for delta calculation
        const currentCrosshair = crosshairCoordsRef.current;
        if (currentCrosshair) {
          dragStartRef.current = {
            fingerX: local.x,
            fingerY: local.y,
            crosshairX: currentCrosshair.localX,
            crosshairY: currentCrosshair.localY,
          };
          console.log('[Gesture] Drag start - finger:', local, 'crosshair:', currentCrosshair.localX, currentCrosshair.localY);
        }
        isDraggingRef.current = false; // Will be set true on move
        try {
          chartElement.setPointerCapture(e.pointerId);
        } catch (err) {}
        return;
      }

      // Not in crosshair mode - start long press timer
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = setTimeout(() => {
        console.log('[Gesture] Long press triggered');
        const currentLocal = getLocalCoords(e.clientX, e.clientY);
        if (currentLocal) {
          activateCrosshairMode(currentLocal.x, currentLocal.y);
          try {
            chartElement.setPointerCapture(e.pointerId);
          } catch (err) {}
        }
      }, GESTURE_CONFIG.LONG_PRESS_MS);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!e.isPrimary || !pointerStartRef.current) return;

      const dist = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y);

      // Cancel long press if moved too much before activation
      if (!crosshairActiveRef.current && dist > GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        return;
      }

      // If crosshair active and finger has moved, apply delta to crosshair position
      if (crosshairActiveRef.current && dragStartRef.current) {
        const local = getLocalCoords(e.clientX, e.clientY);
        if (local) {
          const deltaX = local.x - dragStartRef.current.fingerX;
          const deltaY = local.y - dragStartRef.current.fingerY;
          
          // Check if moved enough to count as a drag
          if (Math.abs(deltaX) > GESTURE_CONFIG.MOVE_THRESHOLD_PX || 
              Math.abs(deltaY) > GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
            isDraggingRef.current = true;
          }
          
          if (isDraggingRef.current) {
            e.preventDefault();
            // Apply delta to the crosshair's ORIGINAL position (not finger position)
            const newX = dragStartRef.current.crosshairX + deltaX;
            const newY = dragStartRef.current.crosshairY + deltaY;
            setCrosshairPosition(newX, newY);
          }
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

        console.log('[Gesture] Crosshair mode - elapsed:', elapsed, 'dist:', dist, 'wasDragging:', isDraggingRef.current);

        if (isDraggingRef.current) {
          // Was dragging - just stop, don't commit
          console.log('[Gesture] Drag ended - crosshair stays, no commit');
          isDraggingRef.current = false;
          dragStartRef.current = null;
        } else if (elapsed < GESTURE_CONFIG.TAP_MAX_MS && dist < GESTURE_CONFIG.MOVE_THRESHOLD_PX) {
          // Quick tap while not dragging - COMMIT from stored crosshair position
          console.log('[Gesture] TAP detected - committing from crosshair');
          commitFromCrosshair();
        }
      } else if (pointerStartRef.current) {
        // Not in crosshair mode
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
      dragStartRef.current = null;
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
    removeCrosshairElements();
    if (crosshairActiveRef.current) {
      deactivateCrosshairMode();
    }
    chartRef.current = null;
    candleSeriesRef.current = null;
    chartElementRef.current = null;
    resetState();
  }, [resetState]);

  // Force cancel crosshair mode - can be called externally when draw mode is disabled
  const cancelCrosshairMode = useCallback(() => {
    if (crosshairActiveRef.current) {
      console.log('[Gesture] Force canceling crosshair mode (external)');
      deactivateCrosshairMode();
    }
    hideCrosshair();
    removeCrosshairElements();
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
    cancelCrosshairMode,
  }), [attachToChart, detachFromChart, isCrosshairModeActive, getCrosshairPoint, resetState, cancelCrosshairMode]);
}

export { GESTURE_CONFIG };
export type { GesturePoint, UseChartGesturesOptions, UseChartGesturesReturn, BarData };

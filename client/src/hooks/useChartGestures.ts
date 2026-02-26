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
  waveEndpoints?: { time: number; price: number }[];
}

interface UseChartGesturesReturn {
  attachToChart: (chart: IChartApi, candleSeries: ISeriesApi<'Candlestick'>, container: HTMLElement) => void;
  detachFromChart: () => void;
  isCrosshairModeActive: () => boolean;
  getCrosshairPoint: () => GesturePoint | null;
  resetState: () => void;
  cancelCrosshairMode: () => void;
  findSnapPoint: (clientX: number, clientY: number) => GesturePoint | null;
}

export function useChartGestures(options: UseChartGesturesOptions): UseChartGesturesReturn {
  const { enabled, data, onPointCommit, onPreviewPoint, onCrosshairModeChange, autoSnapEnabled = true, waveEndpoints } = options;

  const enabledRef = useRef(enabled);
  const dataRef = useRef<BarData[]>(data);
  const onPointCommitRef = useRef(onPointCommit);
  const onPreviewPointRef = useRef(onPreviewPoint);
  const onCrosshairModeChangeRef = useRef(onCrosshairModeChange);
  const autoSnapEnabledRef = useRef(autoSnapEnabled);
  const waveEndpointsRef = useRef<{ time: number; price: number }[] | undefined>(waveEndpoints);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { onPointCommitRef.current = onPointCommit; }, [onPointCommit]);
  useEffect(() => { onPreviewPointRef.current = onPreviewPoint; }, [onPreviewPoint]);
  useEffect(() => { onCrosshairModeChangeRef.current = onCrosshairModeChange; }, [onCrosshairModeChange]);
  useEffect(() => { autoSnapEnabledRef.current = autoSnapEnabled; }, [autoSnapEnabled]);
  useEffect(() => { waveEndpointsRef.current = waveEndpoints; }, [waveEndpoints]);

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
    // Use coordinateToTime directly to avoid logical-index mismatch when
    // multiple series with different time ranges are on the chart (e.g. HTF EMAs).
    return chartRef.current.timeScale().coordinateToTime(localX) as Time | null;
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

  // Get number of seconds between consecutive candles (used for future time extrapolation)
  const getCandleInterval = (): number => {
    const bars = dataRef.current;
    if (bars.length < 2) return 3600; // Default to 1H
    return (bars[1].time as number) - (bars[0].time as number);
  };

  // Get time from a logical index
  const getTimeFromLogical = (logicalIdx: number): Time | null => {
    const bars = dataRef.current;
    if (bars.length === 0) return null;
    if (logicalIdx < 0) return bars[0].time;
    if (logicalIdx >= bars.length) {
      // Extrapolate future time beyond the last candle
      const lastBar = bars[bars.length - 1];
      const interval = getCandleInterval();
      const barsIntoFuture = logicalIdx - (bars.length - 1);
      return ((lastBar.time as number) + barsIntoFuture * interval) as Time;
    }
    return bars[logicalIdx].time;
  };

  // Fixed pixel radius for snap circle (2D mode)
  const SNAP_CIRCLE_RADIUS = 40; // pixels
  // Larger radius for wave endpoint snapping (higher priority)
  const WAVE_SNAP_RADIUS = 55; // pixels
  // Color for wave endpoint snap indicator
  const WAVE_SNAP_COLOR = '#00BFFF';
  
  // Reference for snap circle visual element
  const snapCircleRef = useRef<HTMLDivElement | null>(null);
  
  // Show a visual circle at the tap point that fades out
  const showSnapCircle = (tapX: number, tapY: number, foundSnap: boolean, snapColor?: string) => {
    if (!chartElementRef.current) return;
    
    // Create circle if it doesn't exist
    if (!snapCircleRef.current) {
      const circle = document.createElement('div');
      circle.style.cssText = `
        position: absolute;
        pointer-events: none;
        border: 3px solid;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        z-index: 1000;
        transition: opacity 0.5s ease-out;
      `;
      chartElementRef.current.style.position = 'relative';
      chartElementRef.current.appendChild(circle);
      snapCircleRef.current = circle;
    }
    
    const circle = snapCircleRef.current;
    const diameter = SNAP_CIRCLE_RADIUS * 2;
    
    // Color: provided color > green if snap found, red if no snap
    const color = snapColor ?? (foundSnap ? '#00FF00' : '#FF0000');
    
    circle.style.width = `${diameter}px`;
    circle.style.height = `${diameter}px`;
    circle.style.left = `${tapX}px`;
    circle.style.top = `${tapY}px`;
    circle.style.borderColor = color;
    circle.style.boxShadow = `0 0 10px ${color}`;
    circle.style.opacity = '1';
    circle.style.display = 'block';
    
    // Fade out after 500ms
    setTimeout(() => {
      if (snapCircleRef.current) {
        snapCircleRef.current.style.opacity = '0';
      }
    }, 500);
  };
  
  // Find best high/low within a fixed PIXEL CIRCLE around the tap point
  // Uses 2D Euclidean distance to find the closest wick to where user tapped
  const findSnapPointInCircle = (
    tapX: number,
    tapY: number
  ): GesturePoint | null => {
    const bars = dataRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    
    if (!chart || !series || bars.length === 0) {
      console.warn('[Gesture] Chart/series not available');
      showSnapCircle(tapX, tapY, false);
      return null;
    }
    
    // Check wave endpoints first – they have highest snap priority
    const waveEndpointsData = waveEndpointsRef.current;
    if (waveEndpointsData && waveEndpointsData.length > 0) {
      type WaveCandidate = { time: number; price: number; dist2D: number };
      const waveCandidates: WaveCandidate[] = [];

      for (const endpoint of waveEndpointsData) {
        const screenX = chart.timeScale().timeToCoordinate(endpoint.time as Time);
        if (screenX === null) continue;
        const screenY = series.priceToCoordinate(endpoint.price);
        if (screenY === null) continue;

        const dx = screenX - tapX;
        const dy = screenY - tapY;
        const dist2D = Math.sqrt(dx * dx + dy * dy);

        if (dist2D <= WAVE_SNAP_RADIUS) {
          waveCandidates.push({ time: endpoint.time, price: endpoint.price, dist2D });
        }
      }

      if (waveCandidates.length > 0) {
        waveCandidates.sort((a, b) => a.dist2D - b.dist2D);
        const best = waveCandidates[0];
        console.log(`[Gesture] → Snapped to wave endpoint @ price=${best.price.toFixed(4)}, dist=${best.dist2D.toFixed(1)}px`);
        showSnapCircle(tapX, tapY, true, WAVE_SNAP_COLOR);
        return { time: best.time as Time, price: best.price, snapType: 'none' };
      }
    }

    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleLogicalRange();
    if (!visibleRange) {
      showSnapCircle(tapX, tapY, false);
      return null;
    }
    
    console.log(`[Gesture] 2D Circle Snap: tap=(${tapX.toFixed(0)}, ${tapY.toFixed(0)}), radius=${SNAP_CIRCLE_RADIUS}px`);
    
    // Collect all candidate points within the circle
    type Candidate = {
      time: Time;
      price: number;
      screenX: number;
      screenY: number;
      dist2D: number;
      snapType: 'high' | 'low';
      idx: number;
    };
    
    const candidates: Candidate[] = [];
    
    // Iterate all bars and use timeToCoordinate for correct screen X.
    // Using logicalToCoordinate(idx) was broken when HTF series (e.g. a 4h EMA
    // on a 5m chart) added extra timestamps to the merged timeline, causing the
    // logical index for bar[i] to differ from the array index i.
    for (let idx = 0; idx < bars.length; idx++) {
      const bar = bars[idx];
      
      // Get screen X using the bar's actual timestamp (correct regardless of
      // how many series are on the chart and their time ranges).
      const screenX = timeScale.timeToCoordinate(bar.time as any);
      if (screenX === null) continue;
      
      // Fast horizontal reject: skip if bar is outside the snap circle
      if (Math.abs(screenX - tapX) > SNAP_CIRCLE_RADIUS) continue;
      
      // Check the HIGH point
      const highY = series.priceToCoordinate(bar.high);
      if (highY !== null) {
        const dx = screenX - tapX;
        const dy = highY - tapY;
        const dist2D = Math.sqrt(dx * dx + dy * dy);
        
        // Only include if within the circle
        if (dist2D <= SNAP_CIRCLE_RADIUS) {
          candidates.push({
            time: bar.time,
            price: bar.high,
            screenX,
            screenY: highY,
            dist2D,
            snapType: 'high',
            idx
          });
        }
      }
      
      // Check the LOW point
      const lowY = series.priceToCoordinate(bar.low);
      if (lowY !== null) {
        const dx = screenX - tapX;
        const dy = lowY - tapY;
        const dist2D = Math.sqrt(dx * dx + dy * dy);
        
        // Only include if within the circle
        if (dist2D <= SNAP_CIRCLE_RADIUS) {
          candidates.push({
            time: bar.time,
            price: bar.low,
            screenX,
            screenY: lowY,
            dist2D,
            snapType: 'low',
            idx
          });
        }
      }
    }
    
    console.log(`[Gesture] Found ${candidates.length} candidates within ${SNAP_CIRCLE_RADIUS}px circle`);
    
    if (candidates.length === 0) {
      console.warn('[Gesture] No snap points within circle');
      showSnapCircle(tapX, tapY, false);
      return null;
    }
    
    // Sort by 2D distance and pick the closest
    candidates.sort((a, b) => a.dist2D - b.dist2D);
    const best = candidates[0];
    
    // Log top 3 candidates
    for (let i = 0; i < Math.min(3, candidates.length); i++) {
      const c = candidates[i];
      console.log(`[Gesture]   #${i + 1}: idx=${c.idx} ${c.snapType} @ ${c.price.toFixed(4)}, pos=(${c.screenX.toFixed(0)}, ${c.screenY.toFixed(0)}), dist=${c.dist2D.toFixed(1)}px`);
    }
    
    console.log(`[Gesture] → Snapped to ${best.snapType.toUpperCase()} at idx=${best.idx}, price=${best.price.toFixed(4)}`);
    
    showSnapCircle(tapX, tapY, true);
    return { time: best.time, price: best.price, snapType: best.snapType };
  };
  
  // Legacy function kept for API compatibility - now redirects to circle-based snap
  const findSnapPointInWindow = (
    _centerIdx: number, 
    _radius: number, 
    _priceAtCursor: number,
    tapX?: number,
    tapY?: number
  ): GesturePoint | null => {
    // If we have tap coordinates, use the new 2D circle method
    if (tapX !== undefined && tapY !== undefined) {
      return findSnapPointInCircle(tapX, tapY);
    }
    // Fallback: shouldn't happen but just in case
    console.warn('[Gesture] findSnapPointInWindow called without tap coordinates');
    return null;
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

    // Find best snap point in window using 2D screen distance
    const snapPoint = findSnapPointInWindow(centerIdx, radius, coords.price, coords.localX, coords.localY);
    
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

    const tapPrice = candleSeriesRef.current.coordinateToPrice(local.y);
    if (tapPrice === null) return;

    // Use coordinateToTime for accurate fallback time (avoids logical-index
    // mismatch when HTF series shift the merged timeline).
    const tapTime = getTimeFromCoord(local.x);
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
    
    console.log('[Gesture] Tap snap - visible:', visibleCount, 'radius:', radius);

    // Pass 0 as the legacy centerIdx - findSnapPointInWindow ignores it when
    // tapX/tapY are provided and dispatches directly to findSnapPointInCircle.
    const snapPoint = findSnapPointInWindow(0, radius, tapPrice, local.x, local.y);
    
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
    console.log('[Gesture] Detaching from chart');
    cleanupFnsRef.current.forEach(fn => fn());
    cleanupFnsRef.current = [];
    removeCrosshairElements();
    // Also clear snap circle reference - it was attached to old chart element
    if (snapCircleRef.current && snapCircleRef.current.parentNode) {
      snapCircleRef.current.parentNode.removeChild(snapCircleRef.current);
    }
    snapCircleRef.current = null;
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

  // Exposed snap function for external use (e.g., editing points)
  const findSnapPoint = useCallback((clientX: number, clientY: number): GesturePoint | null => {
    const local = getLocalCoords(clientX, clientY);
    if (!local) return null;
    return findSnapPointInCircle(local.x, local.y);
  }, []);

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
    findSnapPoint,
  }), [attachToChart, detachFromChart, isCrosshairModeActive, getCrosshairPoint, resetState, cancelCrosshairMode, findSnapPoint]);
}

export { GESTURE_CONFIG };
export type { GesturePoint, UseChartGesturesOptions, UseChartGesturesReturn, BarData };

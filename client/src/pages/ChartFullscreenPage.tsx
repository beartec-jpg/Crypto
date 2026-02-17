import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, CandlestickSeries, Time } from 'lightweight-charts';
import { X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { VerticalDrawingToolbar } from '@/components/drawings/VerticalDrawingToolbar';
import { DrawingRenderer } from '@/components/drawings/DrawingRenderer';
import { DrawingQuickMenu } from '@/components/drawings/DrawingQuickMenu';
import { DrawingSettingsModal } from '@/components/modals/DrawingSettingsModal';
import { DrawingSelectionModal } from '@/components/drawings/DrawingSelectionModal';
import { findDrawingsNearClick } from '@/lib/drawingHitDetection';
import { useDrawingState } from '@/hooks/useDrawingState';
import { useChartGestures, type GesturePoint } from '@/hooks/useChartGestures';
import { useDrawingsPersistence } from '@/hooks/useDrawingsPersistence';
import { useIndicatorState } from '@/hooks/useIndicatorState';
import { IndicatorToolbar, EmaSmaModal } from '@/components/indicators';
import { 
  createDrawingPrimitive, 
  DrawingPrimitive,
  TrendLinePrimitive,
  HorizontalLinePrimitive,
  RectanglePrimitive,
  FibRetracementPrimitive,
  ChannelPrimitive
} from '@/lib/chartPrimitives';
import { getAutoColor } from '@/lib/chart/colorUtils';
import { MovingAverages } from '@/components/chart/MovingAverages';
import { calculateEMA } from '@/lib/indicators';
import { calculateRSI, calculateMACD } from '@/lib/indicators/momentum';
import { RSIPanel } from '@/components/indicators/oscillators/RSIPanel';
import { MACDPanel } from '@/components/indicators/oscillators/MACDPanel';
import { VolumePanel } from '@/components/indicators/oscillators/VolumePanel';
import { OscillatorSelectorModal } from '@/components/modals/OscillatorSelectorModal';
import { OscillatorStatusBar } from '@/components/indicators/OscillatorStatusBar';
import { DraggableToolbar } from '@/components/draggable/DraggableToolbar';
import { OscillatorPopoutWindow } from '@/components/oscillators/OscillatorPopoutWindow';

interface Drawing {
  id: string;
  type: string;
  points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[];
  style: {
    color: string;
    lineWidth: number;
    opacity?: number;
    lineStyle?: 'solid' | 'dashed' | 'dotted';
    internalLineStyle?: 'solid' | 'dashed' | 'dotted';
    extendLeft?: boolean;
    extendRight?: boolean;
    labelPosition?: 'left' | 'right';
    hiddenLevels?: number[];
    customLabels?: Record<number | string, string>;
    customValues?: Record<number, number>;
    label?: string;
    autoColor?: boolean;
    hideLabels?: boolean;
    levelColors?: Record<number, string>;
    boundaryColors?: Record<string, string>;
    fillOpacity?: number;
    __openColorPicker?: string | null;
  };
}

interface DrawingDefaults {
  opacity?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  internalLineStyle?: 'solid' | 'dashed' | 'dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  labelPosition?: 'left' | 'right';
  hiddenLevels?: number[];
  customLabels?: Record<number | string, string>;
  customValues?: Record<number, number>;
  label?: string;
  autoColor?: boolean;
  hideLabels?: boolean;
  levelColors?: Record<number, string>;
  boundaryColors?: Record<string, string>;
  fillOpacity?: number;
}

type DrawingTool = 'trendline' | 'horizontal' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel' | null;

interface ChartFullscreenPageProps {
  onClose: () => void;
  initialSymbol: string;
  initialTimeframe: string;
  watchlistTickers: string[];
}

// Convert timeframe to Binance API format
const convertTimeframe = (tf: string): string => {
  const map: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  return map[tf] || '1h';
};

// Format symbol for display (e.g., 'XRPUSDT' -> 'XRP/USDT')
const formatSymbol = (symbol: string): string => {
  if (symbol.endsWith('USDT')) {
    return symbol.replace('USDT', '/USDT');
  }
  return symbol;
};

// Touch gesture detection thresholds
const TOUCH_TAP_THRESHOLD = 150; // ms - max duration for a tap
const TOUCH_MOVE_THRESHOLD = 10; // pixels - max movement for a tap

// Chart resize debounce delay
const RESIZE_DEBOUNCE_MS = 100; // ms - debounce delay for resize events

export function ChartFullscreenPage({
  onClose,
  initialSymbol,
  initialTimeframe,
  watchlistTickers,
}: ChartFullscreenPageProps) {
  // Independent state - not controlled by parent
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [activeTool, setActiveTool] = useState<DrawingTool>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reinitializeChartKey, setReinitializeChartKey] = useState(0); // Key to trigger chart re-initialization
  const [chartReady, setChartReady] = useState(false); // Track when chart is initialized and ready for data
  const [tempDrawing, setTempDrawing] = useState<{
    points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[]
  } | null>(null);
  
  // Drawing state
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [activeEdit, setActiveEdit] = useState<{ drawingId: string; pointIndex: number; originalDrawing: Drawing } | null>(null);
  const [autoColorEnabled, setAutoColorEnabled] = useState(true);
  
  // Quick menu and settings modal state
  const [quickMenuPosition, setQuickMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  
  // Selection modal state
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [nearbyDrawings, setNearbyDrawings] = useState<Array<{ 
    id: string; 
    type: string; 
    color?: string;
    points?: { time: number; price: number }[];
  }>>([]);
  
  // Indicator state
  const indicators = useIndicatorState();

// Chart refs
const chartContainerRef = useRef<HTMLDivElement>(null);
const chartRef = useRef<IChartApi | null>(null);
const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
const drawingPrimitivesRef = useRef<Map<string, DrawingPrimitive>>(new Map());
const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const isFirstResizeRef = useRef(true); // Track if this is the first resize event
const isRetryingInitRef = useRef(false); // Prevent multiple retry attempts

// Refs for drawing logic (to avoid recreating callbacks)
const activeToolRef = useRef<DrawingTool>(null);
const autoColorEnabledRef = useRef(autoColorEnabled);
const onPointCommitRef = useRef<((point: GesturePoint) => void) | null>(null);

// Touch gesture detection refs
const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

// Drawing state - independent from parent
const drawingState = useDrawingState();

// Drawing persistence hook
const drawingsPersistence = useDrawingsPersistence(symbol, timeframe);

// EMA/SMA modal state
const [showEmaSmaModal, setShowEmaSmaModal] = useState(false);

// EMA HTF data cache for higher-timeframe data
const emaHTFDataCache = useRef<Record<string, any[]>>({});

// Oscillator state
const [selectedOscillators, setSelectedOscillators] = useState<Set<string>>(new Set());
const [showOscillatorSelector, setShowOscillatorSelector] = useState(false);
const [oscillatorPopout, setOscillatorPopout] = useState(false);

// Oscillator panel height constant
// 120px per oscillator (panel + padding)
const OSCILLATOR_PANEL_HEIGHT_PER = 120; // Height per oscillator in pixels
const OSCILLATOR_TAB_HEIGHT = 48; // Height of tabs section
const OSCILLATOR_STATUS_BAR_HEIGHT = 36; // Height of status bar

// Drawing toolbar positioning constants
const DRAWING_TOOLBAR_BOTTOM_MARGIN = 16; // Margin above oscillators when active
const DRAWING_TOOLBAR_DEFAULT_BOTTOM = 80; // Default bottom position (5rem = 80px)

// Calculate total oscillator panel height
const totalOscillatorHeight = selectedOscillators.size > 0 
  ? OSCILLATOR_TAB_HEIGHT + (selectedOscillators.size * OSCILLATOR_PANEL_HEIGHT_PER) + OSCILLATOR_STATUS_BAR_HEIGHT
  : 0;

/**
 * Helper function to fit chart content to visible data range
 * @param candleCount - Optional number of candles loaded, for logging purposes
 * 
 * Note: chartRef is intentionally not in the dependency array as refs don't trigger re-renders
 * and the ref object itself is stable across renders
 */
const fitChartContent = useCallback((candleCount?: number) => {
  if (chartRef.current) {
    chartRef.current.timeScale().fitContent();
    if (candleCount !== undefined) {
      console.log('[Chart] Fit content with', candleCount, 'candles');
    }
  }
}, []);

// Tool selection handler
const handleSelectTool = useCallback((tool: DrawingTool) => {
  setActiveTool(tool);
  activeToolRef.current = tool;
}, []);

// Handler for chart clicks (radial selection)
const handleChartClick = useCallback((event: MouseEvent | TouchEvent) => {
  console.log('[ChartClick] Event fired, type:', event.type);
  console.log('[ChartClick] activeTool:', activeTool);
  
  // Only handle clicks when no tool is active (not in drawing mode)
  if (activeTool) {
    console.log('[ChartClick] Tool is active, ignoring click');
      return;
    }
    
    // Handle mouse clicks immediately
    if (event.type === 'click') {
      const chartElement = chartContainerRef.current;
      if (!chartElement || !chartRef.current || !candleSeriesRef.current) {
        console.log('[ChartClick] Missing refs');
        return;
      }
      
      const rect = chartElement.getBoundingClientRect();
      const mouseEvent = event as MouseEvent;
      const clickX = mouseEvent.clientX - rect.left;
      const clickY = mouseEvent.clientY - rect.top;
      
      console.log('[ChartClick] Coordinates:', { clickX, clickY });
      console.log('[ChartClick] Available drawings:', drawings.length);
      
      // Find all drawings within click radius
      const hits = findDrawingsNearClick(clickX, clickY, drawings, chartRef.current, candleSeriesRef.current);
      
      console.log('[ChartClick] Hits found:', hits.length);
      
      if (hits.length === 0) {
        console.log('[ChartClick] No hits - deselecting');
        setSelectedDrawingId(null);
        setQuickMenuPosition(null);
      } else if (hits.length === 1) {
        console.log('[ChartClick] Single hit - selecting:', hits[0].drawingId);
        setSelectedDrawingId(hits[0].drawingId);
        setQuickMenuPosition({ x: mouseEvent.clientX, y: mouseEvent.clientY });
      } else {
        console.log('[ChartClick] Multiple hits - showing modal');
        // Map hits to include drawing details for preview
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
      return;
    }
    
    // For touch events, just record the start position
    if (event.type === 'touchstart') {
      const touch = (event as TouchEvent).touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
      // Don't process yet - wait for touchend
      return;
    }
  }, [activeTool, drawings]);
  
  // Handler for touch end - differentiate taps from swipes
  const handleTouchEnd = useCallback((event: TouchEvent) => {
    if (!touchStartRef.current) return;
    
    // Only process when no tool is active (not in drawing mode)
    if (activeTool) {
      touchStartRef.current = null;
      return;
    }
    
    const touch = event.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    const deltaTime = Date.now() - touchStartRef.current.time;
    
    // Only treat as tap if movement was minimal and quick
    const isTap = deltaTime < TOUCH_TAP_THRESHOLD && 
                  deltaX < TOUCH_MOVE_THRESHOLD && 
                  deltaY < TOUCH_MOVE_THRESHOLD;
    
    if (isTap) {
      // This was a tap - check for drawing hits
      const rect = chartContainerRef.current?.getBoundingClientRect();
      if (!rect || !chartRef.current || !candleSeriesRef.current) {
        touchStartRef.current = null;
        return;
      }
      
      const clickX = touchStartRef.current.x - rect.left;
      const clickY = touchStartRef.current.y - rect.top;
      
      const hits = findDrawingsNearClick(
        clickX,
        clickY,
        drawings,
        chartRef.current,
        candleSeriesRef.current
      );
      
      if (hits.length === 0) {
        setSelectedDrawingId(null);
        setQuickMenuPosition(null);
      } else if (hits.length === 1) {
        setSelectedDrawingId(hits[0].drawingId);
        setQuickMenuPosition({ x: touchStartRef.current.x, y: touchStartRef.current.y });
      } else {
        // Map hits to include drawing details for preview
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
    }
    
    touchStartRef.current = null;
  }, [activeTool, drawings]);
  
  // Handler to close quick menu
  const handleCloseQuickMenu = useCallback(() => {
    setQuickMenuPosition(null);
  }, []);
  
  // Handler to open settings modal
  const handleOpenSettings = useCallback(() => {
    setSettingsModalOpen(true);
  }, []);
  
  // Handler to close settings modal
  const handleCloseSettings = useCallback(() => {
    setSettingsModalOpen(false);
  }, []);
  
  // Handler to delete selected drawing
  const handleDeleteDrawing = useCallback(() => {
    if (selectedDrawingId) {
      drawingsPersistence.deleteDrawing(selectedDrawingId);
      setDrawings(prev => prev.filter(d => d.id !== selectedDrawingId));
      setSelectedDrawingId(null);
    }
  }, [selectedDrawingId, drawingsPersistence]);
  
  // Handler to update drawing
  const handleUpdateDrawing = useCallback((updates: { style: Partial<Drawing['style']> }) => {
    if (!selectedDrawingId) return;
    
    // Validate drawing exists and has server ID
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) {
      console.error('[Update] Drawing not found:', selectedDrawingId);
      return;
    }
    
    if (selectedDrawingId.startsWith('drawing-')) {
      console.error('[Update] Cannot update drawing with temp ID:', selectedDrawingId);
      // Wait for server ID to be assigned
      return;
    }
    
    console.log('[Update] Updating drawing:', selectedDrawingId, 'with:', updates);
    
    // Update locally first
    setDrawings(prev => prev.map(d => 
      d.id === selectedDrawingId 
        ? { ...d, style: { ...d.style, ...updates.style } }
        : d
    ));
    
    // Then update in database
    drawingsPersistence.updateDrawing({ 
      id: selectedDrawingId, 
      updates: { style: updates.style } 
    });
  }, [selectedDrawingId, drawings, drawingsPersistence]);
  
  // Handler for selection from modal
  const handleSelectFromModal = useCallback((drawingId: string) => {
    setSelectedDrawingId(drawingId);
    // Position quick menu in center of screen
    setQuickMenuPosition({ 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
    });
  }, []);
  
  // Oscillator toggle handler
  const handleToggleOscillator = useCallback((oscillator: string) => {
    setSelectedOscillators(prev => {
      const next = new Set(prev);
      if (next.has(oscillator)) {
        next.delete(oscillator);
      } else {
        next.add(oscillator);
      }
      return next;
    });
  }, []);
  
  // Memoize selected drawing to avoid redundant searches and transformations
  const selectedDrawingForModal = useMemo(() => {
    if (!selectedDrawingId) return null;
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return null;
    
    return {
      ...drawing,
      points: drawing.points.map(p => ({ 
        time: p.time, 
        value: p.price 
      })),
    };
  }, [selectedDrawingId, drawings]);
  
  // Update refs when values change
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);
  
  useEffect(() => {
    autoColorEnabledRef.current = autoColorEnabled;
  }, [autoColorEnabled]);

  // Initialize gesture controller
  const gestureController = useChartGestures({
    enabled: activeTool !== null,
    data: candles as unknown as { time: Time; open: number; high: number; low: number; close: number }[],
    onPointCommit: (point) => onPointCommitRef.current?.(point),
    onCrosshairModeChange: () => {},
    autoSnapEnabled: true,
  });

  // Calculate oscillator data
  const oscillatorData = useMemo(() => {
    if (candles.length === 0) {
      return {
        rsi: [],
        macd: { macd: [], signal: [], hist: [] },
        volume: [],
        avgVolume: 0,
      };
    }

    // Calculate RSI
    const rsiData = calculateRSI(candles, 14);

    // Calculate MACD
    const macdData = calculateMACD(candles, 12, 26, 9);

    // Calculate average volume for percentage
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;

    // Format volume data
    const volumeData = candles.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? '#26a69a' : '#ef5350',
    }));

    return {
      rsi: rsiData,
      macd: macdData,
      volume: volumeData,
      avgVolume,
    };
  }, [candles]);

  // Get latest oscillator values for status bar
  const latestOscillatorValues = useMemo(() => {
    if (candles.length === 0) return {};

    const result: {
      rsiValue?: number;
      macdValue?: number;
      macdPrevValue?: number;
      volumePercent?: number;
    } = {};

    if (oscillatorData.rsi.length > 0) {
      result.rsiValue = oscillatorData.rsi[oscillatorData.rsi.length - 1].value;
    }

    if (oscillatorData.macd.macd.length > 1) {
      const macdArray = oscillatorData.macd.macd;
      result.macdValue = macdArray[macdArray.length - 1].value;
      result.macdPrevValue = macdArray[macdArray.length - 2].value;
    }

    if (oscillatorData.volume.length > 0 && oscillatorData.avgVolume > 0) {
      const latestVolume = oscillatorData.volume[oscillatorData.volume.length - 1].value;
      result.volumePercent = (latestVolume / oscillatorData.avgVolume) * 100;
    }

    return result;
  }, [oscillatorData, candles.length]);

// Initialize chart
useEffect(() => {
  if (!chartContainerRef.current) {
    console.warn('[Chart] Container ref not available');
    return;
  }

  const container = chartContainerRef.current;
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Validate dimensions before initializing chart
  if (width === 0 || height === 0) {
    console.warn('[Chart] Container has invalid dimensions:', { width, height });
    
    // Use ResizeObserver to retry when dimensions become valid
    const retryObserver = new ResizeObserver((entries) => {
      const [entry] = entries;
      const { width: newWidth, height: newHeight } = entry.contentRect;
      
      const hasValidDimensions = newWidth > 0 && newHeight > 0;
      const chartNotInitialized = !chartRef.current;
      const notCurrentlyRetrying = !isRetryingInitRef.current;
      const shouldRetryInitialization = hasValidDimensions && chartNotInitialized && notCurrentlyRetrying;
      
      if (shouldRetryInitialization) {
        console.log('[Chart] Container dimensions now valid, triggering initialization:', { width: newWidth, height: newHeight });
        isRetryingInitRef.current = true;
        retryObserver.disconnect();
        // Trigger re-initialization by updating state
        setReinitializeChartKey(prev => prev + 1);
      }
    });
    
    retryObserver.observe(container);
    
    return () => {
      retryObserver.disconnect();
    };
  }

  // Reset retry flag when we successfully initialize
  isRetryingInitRef.current = false;
  
  console.log('[Chart] Initializing chart with dimensions:', { width, height });

  const chart = createChart(container, {
    layout: {
      background: { type: ColorType.Solid, color: '#0f172a' },
      textColor: '#cbd5e1',
    },
    grid: {
      vertLines: { color: '#1e293b' },
      horzLines: { color: '#1e293b' },
    },
    width,
    height,
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
    },
    rightPriceScale: {
      borderVisible: false,
    },
  });

  const candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderUpColor: '#22c55e',
    borderDownColor: '#ef4444',
    wickUpColor: '#22c55e',
    wickDownColor: '#ef4444',
  });

  chartRef.current = chart;
  candleSeriesRef.current = candleSeries;
  setChartReady(true); // Signal that chart is ready for data
  
  console.log('[Chart] Chart initialized successfully');
  
  // Reset first resize flag when chart is initialized
  isFirstResizeRef.current = true;

  // Handle resize with debouncing
  const handleResize = () => {
    // Skip the initial resize event that fires immediately when observation starts
    if (isFirstResizeRef.current) {
      isFirstResizeRef.current = false;
      return;
    }
    
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    
    resizeTimeoutRef.current = setTimeout(() => {
      if (chartContainerRef.current && chartRef.current) {
        const newWidth = chartContainerRef.current.clientWidth;
        const newHeight = chartContainerRef.current.clientHeight;
        
        if (newWidth > 0 && newHeight > 0) {
          chartRef.current.applyOptions({
            width: newWidth,
            height: newHeight,
          });
        }
      }
    }, RESIZE_DEBOUNCE_MS);
  };

  // Use ResizeObserver for reliable resize detection
  // Note: ResizeObserver handles all container resize scenarios, including window resize
  const resizeObserver = new ResizeObserver(handleResize);
  
  resizeObserver.observe(container);

  return () => {
    setChartReady(false); // Reset chart ready state
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = null;
    }
    resizeObserver.disconnect();
    if (chartRef.current) {
      console.log('[Chart] Cleaning up chart');
      chartRef.current.remove();
    }
  };
}, [reinitializeChartKey]);

// Attach click handler to chart
useEffect(() => {
  const chartElement = chartContainerRef.current;
  if (!chartElement) return;
  
  chartElement.addEventListener('click', handleChartClick as EventListener);
  chartElement.addEventListener('touchstart', handleChartClick as EventListener, { passive: true });
  chartElement.addEventListener('touchend', handleTouchEnd as EventListener);
  
  return () => {
    chartElement.removeEventListener('click', handleChartClick as EventListener);
    chartElement.removeEventListener('touchstart', handleChartClick as EventListener);
    chartElement.removeEventListener('touchend', handleTouchEnd as EventListener);
  };
}, [handleChartClick, handleTouchEnd]);

// REMOVED: The "Prevent native browser gestures" useEffect has been deleted
// The lightweight-charts library handles touch interactions properly on its own
// This was blocking scroll on the main page when the fullscreen chart was closed

  // Fetch candles data directly from Binance API
  useEffect(() => {
    if (!chartReady || !candleSeriesRef.current) return;

    let mounted = true;

    const fetchCandles = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const binanceInterval = convertTimeframe(timeframe);
        
        // Direct Binance API call (works perfectly - confirmed via testing)
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=1000`
        );
        
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status}`);
        }
        
        const klines = await response.json();
        
        // Transform Binance kline format to CandleData
        // Binance format: [openTime, open, high, low, close, volume, closeTime, ...]
        const transformedCandles = klines.map((kline: any[]) => ({
          time: Math.floor(kline[0] / 1000), // Convert ms to seconds
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5])
        }));
        
        if (mounted) {
          setCandles(transformedCandles);
          
          // Update chart with data
          if (candleSeriesRef.current && transformedCandles.length > 0) {
            candleSeriesRef.current.setData(transformedCandles);
            
            // Fit content after data is loaded
            fitChartContent(transformedCandles.length);
            
            console.log(`✅ [Chart] Loaded ${transformedCandles.length} candles from Binance`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch data';
        console.error('❌ [Chart] Data fetch failed:', message);
        if (mounted) {
          setError(message);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchCandles();
    
    return () => {
      mounted = false;
    };
    // fitChartContent is stable (useCallback with empty deps) and doesn't need to be in dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, chartReady]);
  
  // Clear HTF cache when symbol changes (but not timeframe)
  const prevSymbolRef = useRef<string>(symbol);
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      emaHTFDataCache.current = {};
      prevSymbolRef.current = symbol;
      console.log('[EMA HTF] Cache cleared due to symbol change');
    }
  }, [symbol]);
  
  // Fetch higher timeframe data for EMA calculations
  useEffect(() => {
    const fetchHTFData = async () => {
      const htfTimeframes = indicators.ema.configs
        .filter(c => c.timeframe !== 'current' && c.timeframe !== timeframe)
        .map(c => c.timeframe);
      
      const uniqueTimeframes = [...new Set(htfTimeframes)];
      
      for (const tf of uniqueTimeframes) {
        const cacheKey = `${symbol}_${tf}`;
        if (emaHTFDataCache.current[cacheKey]) continue; // Already cached
        
        try {
          const binanceInterval = convertTimeframe(tf);
          const response = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=500`
          );
          
          if (response.ok) {
            const klines = await response.json();
            const transformedCandles = klines.map((kline: any[]) => ({
              time: Math.floor(kline[0] / 1000),
              open: parseFloat(kline[1]),
              high: parseFloat(kline[2]),
              low: parseFloat(kline[3]),
              close: parseFloat(kline[4]),
              volume: parseFloat(kline[5])
            }));
            emaHTFDataCache.current[cacheKey] = transformedCandles;
            console.log(`[EMA HTF] Fetched ${tf} data for ${symbol}: ${transformedCandles.length} candles`);
          }
        } catch (e) {
          console.error(`[EMA HTF] Failed to fetch ${tf} data:`, e);
        }
      }
    };
    
    if (indicators.ema.show && symbol) {
      fetchHTFData();
    }
  }, [indicators.ema.show, indicators.ema.configs, symbol, timeframe]);
  
  // Load saved drawings from database
  useEffect(() => {
    if (drawingsPersistence.drawings) {
      console.log('[Persistence] Loaded from DB:', drawingsPersistence.drawings.length, 'drawings');
      
      const loadedDrawings = drawingsPersistence.drawings
        .map((d: any): Drawing | null => {
          try {
            // Always use server ID if available
            const serverId = d.id;
            if (!serverId) {
              console.warn('[Persistence] Drawing missing server ID:', d);
              return null;
            }
            
            return {
              id: serverId, // Use server ID directly, no fallback
              type: d.drawingType || d.drawing_type || d.tool || 'trendline',
              points: d.coordinates?.points || d.points || [],
              style: {
                color: d.style?.color || '#3b82f6',
                lineWidth: d.style?.lineWidth || 2,
                ...d.style,
              },
            };
          } catch (e) {
            console.warn('Failed to parse drawing:', d, e);
            return null;
          }
        })
        .filter((d): d is Drawing => d !== null && d.points.length > 0);
      
      console.log('[Persistence] Parsed drawings with server IDs:', loadedDrawings.map(d => d.id));
      
      // Always sync with server data
      setDrawings(loadedDrawings);
    }
  }, [drawingsPersistence.drawings]);

  // Attach gesture controller to chart
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const container = chartContainerRef.current;
    
    if (!chart || !candleSeries || !container) return;
    
    gestureController.attachToChart(chart, candleSeries, container);
    
    return () => {
      gestureController.detachFromChart();
    };
  }, [gestureController]);
  
  // Attach/detach native primitives for high-performance rendering
  useEffect(() => {
    console.log('[Primitives] Effect triggered');
    console.log('[Primitives] - chartReady:', !!chartRef.current);
    console.log('[Primitives] - candleSeriesReady:', !!candleSeriesRef.current);
    console.log('[Primitives] - drawings.length:', drawings.length);
    console.log('[Primitives] - drawings:', drawings.map(d => ({ id: d.id, type: d.type })));
    
    if (!chartRef.current || !candleSeriesRef.current) return;
    
    const candleSeries = candleSeriesRef.current;
    const currentPrimitives = drawingPrimitivesRef.current;
    const currentDrawingIds = new Set(drawings.map(d => d.id));
    
    if (!drawingsVisible) {
      currentPrimitives.forEach((primitive) => {
        try {
          candleSeries.detachPrimitive(primitive);
        } catch (e) {}
      });
      currentPrimitives.clear();
      return;
    }
    
    currentPrimitives.forEach((primitive, id) => {
      const isBeingEdited = activeEdit && activeEdit.drawingId === id;
      if (!currentDrawingIds.has(id) || isBeingEdited) {
        try {
          candleSeries.detachPrimitive(primitive);
        } catch (e) {}
        currentPrimitives.delete(id);
      }
    });
    
    drawings.forEach(drawing => {
      const isBeingEdited = activeEdit && activeEdit.drawingId === drawing.id;
      if (isBeingEdited) return;
      
      const existingPrimitive = currentPrimitives.get(drawing.id);
      
      if (existingPrimitive) {
        existingPrimitive.setSelected(selectedDrawingId === drawing.id);
        
        if ('updatePoints' in existingPrimitive) {
          (existingPrimitive as TrendLinePrimitive | RectanglePrimitive | FibRetracementPrimitive | ChannelPrimitive).updatePoints(drawing.points);
        } else if ('updatePoint' in existingPrimitive) {
          (existingPrimitive as HorizontalLinePrimitive).updatePoint(drawing.points[0]);
        }
        
        existingPrimitive.updateStyle(drawing.style);
      } else {
        console.log('[Primitives] Creating new primitive for drawing:', drawing.id, 'type:', drawing.type);
        const primitive = createDrawingPrimitive(
          drawing.id,
          drawing.type as 'trendline' | 'horizontal' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel',
          drawing.points,
          drawing.style
        );
        
        if (primitive) {
          try {
            console.log('[Primitives] Attaching primitive for:', drawing.id);
            candleSeries.attachPrimitive(primitive);
            currentPrimitives.set(drawing.id, primitive);
          } catch (e) {
            console.error('Failed to attach primitive:', e);
          }
        } else {
          console.warn('[Primitives] Failed to create primitive for:', drawing.id);
        }
      }
    });
    
    return () => {
      currentPrimitives.forEach((primitive) => {
        try {
          candleSeries.detachPrimitive(primitive);
        } catch (e) {}
      });
      currentPrimitives.clear();
    };
  }, [drawings, selectedDrawingId, activeEdit, drawingsVisible]);

  return (
  <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col h-screen">
      {/* Top Toolbar */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between gap-4">
        <Button variant="outline" size="sm" onClick={onClose} className="gap-2">
          <X className="h-4 w-4" />
          Close
        </Button>

        <div className="flex-1 text-center">
          <span className="text-lg font-semibold text-white">{formatSymbol(symbol)}</span>
        </div>

        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-40 bg-slate-800 text-white border-slate-600 hover:bg-slate-700 focus:ring-slate-500">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            {watchlistTickers.map((ticker) => (
              <SelectItem key={ticker} value={ticker} className="text-white hover:bg-slate-700 focus:bg-slate-700 cursor-pointer">
                {formatSymbol(ticker)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={timeframe} onValueChange={setTimeframe}>
          <SelectTrigger className="w-24 bg-slate-800 text-white border-slate-600 hover:bg-slate-700 focus:ring-slate-500">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            <SelectItem value="1m" className="text-white hover:bg-slate-700 focus:bg-slate-700 cursor-pointer">1m</SelectItem>
            <SelectItem value="5m" className="text-white hover:bg-slate-700 focus:bg-slate-700 cursor-pointer">5m</SelectItem>
            <SelectItem value="15m" className="text-white hover:bg-slate-700 focus:bg-slate-700 cursor-pointer">15m</SelectItem>
            <SelectItem value="1h" className="text-white hover:bg-slate-700 focus:bg-slate-700 cursor-pointer">1h</SelectItem>
            <SelectItem value="4h" className="text-white hover:bg-slate-700 focus:bg-slate-700 cursor-pointer">4h</SelectItem>
            <SelectItem value="1d" className="text-white hover:bg-slate-700 focus:bg-slate-700 cursor-pointer">1d</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Chart Area */}
      <div className="flex-1 relative overflow-hidden" style={{ height: selectedOscillators.size > 0 ? `calc(100% - ${totalOscillatorHeight}px)` : '100%' }}>
        {/* Combined Toolbar - Top Left */}
        <div className="absolute top-2 left-2 z-20 flex gap-2">
          <IndicatorToolbar 
            onOpenEmaSma={() => setShowEmaSmaModal(true)}
          />
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowOscillatorSelector(true)}
            className="bg-slate-900/95 backdrop-blur-sm border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            Oscillators {selectedOscillators.size > 0 && `(${selectedOscillators.size})`}
          </Button>
        </div>

        {/* Drawing Toolbar - Draggable */}
        <DraggableToolbar 
          storageKey="fullscreen-drawing-toolbar"
          defaultPosition={() => ({ 
            x: window.innerWidth / 2 - 40, 
            y: window.innerHeight - 150 
          })}
        >
          <VerticalDrawingToolbar 
            activeTool={activeTool} 
            onSelectTool={handleSelectTool}
          />
        </DraggableToolbar>
        
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 z-10">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
              <div className="mt-2 text-slate-400">Loading chart...</div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 z-10">
            <div className="text-center text-red-400">
              <div className="text-lg font-semibold">Error</div>
              <div className="mt-2">{error}</div>
            </div>
          </div>
        )}
        
<div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />        
        <MovingAverages
          chart={chartRef.current}
          maConfigs={indicators.ema.configs}
          show={indicators.ema.show}
          candles={candles}
          calculateEMA={calculateEMA}
          emaHTFDataCache={emaHTFDataCache}
          symbol={symbol}
          interval={timeframe}
        />
        <DrawingRenderer
          drawingMode={activeTool ? 'draw' : 'off'}
          activeTool={activeTool}
          activeToolRef={activeToolRef}
          autoColorEnabledRef={autoColorEnabledRef}
          candles={candles}
          tempDrawing={tempDrawing}
          setTempDrawing={setTempDrawing}
          setDrawings={setDrawings}
          saveDrawingMutation={{ mutate: drawingsPersistence.saveDrawing }}
          onPointCommitRef={onPointCommitRef}
        />
        
        <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 10 }}>
          {tempDrawing && tempDrawing.points.length > 0 && chartRef.current && (
            tempDrawing.points.map((point, i) => {
              const x = chartRef.current?.timeScale().timeToCoordinate(point.time as Time);
              const y = candleSeriesRef.current?.priceToCoordinate(point.price);
              
              return (
                <circle 
                  key={i} 
                  cx={x ?? 0} 
                  cy={y ?? 0} 
                  r={6} 
                  fill={point.snapType === 'high' ? '#ef4444' : point.snapType === 'low' ? '#22c55e' : '#3b82f6'} 
                  stroke="#fff" 
                  strokeWidth={2}
                />
              );
            })
          )}
        </svg>
        
        {quickMenuPosition && selectedDrawingId && (
          <DrawingQuickMenu
            x={quickMenuPosition.x}
            y={quickMenuPosition.y}
            onSettings={handleOpenSettings}
            onDelete={handleDeleteDrawing}
            onClose={handleCloseQuickMenu}
          />
        )}
      </div>
      
      {/* Oscillator Section */}
      {selectedOscillators.size > 0 && !oscillatorPopout && (
        <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {/* Oscillator tabs */}
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Oscillators:</span>
              <Button 
                variant="outline"
                size="sm" 
                className="text-xs"
                onClick={() => setShowOscillatorSelector(true)}
              >
                Select ({selectedOscillators.size})
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setOscillatorPopout(!oscillatorPopout)}
            >
              {oscillatorPopout ? 'Dock' : 'Popout'}
            </Button>
          </div>
          
          {/* Oscillator panels */}
          <div className="bg-slate-900">
            {selectedOscillators.has('rsi') && (
              <div style={{ height: `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="border-b border-slate-700 p-2">
                <div className="text-xs text-slate-400 mb-1">RSI (14)</div>
                <RSIPanel 
                  data={oscillatorData.rsi}
                  period={14}
                  candles={candles}
                />
              </div>
            )}
            
            {selectedOscillators.has('macd') && (
              <div style={{ height: `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="border-b border-slate-700 p-2">
                <div className="text-xs text-slate-400 mb-1">MACD (12, 26, 9)</div>
                <MACDPanel 
                  macdData={oscillatorData.macd.macd}
                  signalData={oscillatorData.macd.signal}
                  histogramData={oscillatorData.macd.hist}
                  fastPeriod={12}
                  slowPeriod={26}
                  signalPeriod={9}
                />
              </div>
            )}
            
            {selectedOscillators.has('volume') && (
              <div style={{ height: `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="border-b border-slate-700 p-2">
                <div className="text-xs text-slate-400 mb-1">Volume</div>
                <VolumePanel 
                  data={oscillatorData.volume}
                />
              </div>
            )}
          </div>
          
          {/* Status Bar */}
          <OscillatorStatusBar
            rsiValue={selectedOscillators.has('rsi') ? latestOscillatorValues.rsiValue : undefined}
            macdValue={selectedOscillators.has('macd') ? latestOscillatorValues.macdValue : undefined}
            macdPrevValue={selectedOscillators.has('macd') ? latestOscillatorValues.macdPrevValue : undefined}
            volumePercent={selectedOscillators.has('volume') ? latestOscillatorValues.volumePercent : undefined}
          />
        </div>
      )}
      
      {/* Show selector button when no oscillators selected */}
      {selectedOscillators.size === 0 && (
        <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-2">
          <Button 
            variant="outline"
            size="sm" 
            className="text-xs"
            onClick={() => setShowOscillatorSelector(true)}
          >
            + Add Oscillators
          </Button>
        </div>
      )}
      
      {selectedDrawingId && (
        <DrawingSettingsModal
          isOpen={settingsModalOpen}
          onClose={handleCloseSettings}
          drawing={selectedDrawingForModal}
          onUpdate={handleUpdateDrawing}
        />
      )}
      
      {showSelectionModal && (
        <DrawingSelectionModal
          open={showSelectionModal}
          drawings={nearbyDrawings}
          onSelect={handleSelectFromModal}
          onClose={() => setShowSelectionModal(false)}
        />
      )}
      
      {/* EMA/SMA Modal */}
      <EmaSmaModal
        isOpen={showEmaSmaModal}
        onClose={() => setShowEmaSmaModal(false)}
        emaShow={indicators.ema.show}
        emaConfigs={indicators.ema.configs}
        emaInputs={indicators.ema.inputs}
        onEmaToggle={indicators.ema.setShow}
        onEmaConfigsChange={indicators.ema.setConfigs}
        onEmaInputsChange={indicators.ema.setInputs}
        smaShow={indicators.sma.show}
        smaConfigs={indicators.sma.configs}
        onSmaToggle={indicators.sma.setShow}
        onSmaConfigsChange={indicators.sma.setConfigs}
      />
      
      {/* Oscillator Selector Modal */}
      <OscillatorSelectorModal
        isOpen={showOscillatorSelector}
        onClose={() => setShowOscillatorSelector(false)}
        selectedOscillators={selectedOscillators}
        onToggleOscillator={handleToggleOscillator}
      />

      {/* Popout Oscillator Windows */}
      {oscillatorPopout && selectedOscillators.has('rsi') && (
        <OscillatorPopoutWindow
          oscillatorType="rsi"
          title="RSI (14)"
          isOpen={true}
          onClose={() => handleToggleOscillator('rsi')}
          storageKey="oscillator-rsi-position"
          defaultSize={{ width: 500, height: 240 }}
        >
          <div className="p-2 h-full">
            <RSIPanel 
              data={oscillatorData.rsi}
              period={14}
              candles={candles}
            />
          </div>
        </OscillatorPopoutWindow>
      )}

      {oscillatorPopout && selectedOscillators.has('macd') && (
        <OscillatorPopoutWindow
          oscillatorType="macd"
          title="MACD (12, 26, 9)"
          isOpen={true}
          onClose={() => handleToggleOscillator('macd')}
          storageKey="oscillator-macd-position"
          defaultSize={{ width: 500, height: 240 }}
        >
          <div className="p-2 h-full">
            <MACDPanel 
              macdData={oscillatorData.macd.macd}
              signalData={oscillatorData.macd.signal}
              histogramData={oscillatorData.macd.hist}
              fastPeriod={12}
              slowPeriod={26}
              signalPeriod={9}
            />
          </div>
        </OscillatorPopoutWindow>
      )}

      {oscillatorPopout && selectedOscillators.has('volume') && (
        <OscillatorPopoutWindow
          oscillatorType="volume"
          title="Volume"
          isOpen={true}
          onClose={() => handleToggleOscillator('volume')}
          storageKey="oscillator-volume-position"
          defaultSize={{ width: 500, height: 180 }}
        >
          <div className="p-2 h-full">
            <VolumePanel 
              data={oscillatorData.volume}
            />
          </div>
        </OscillatorPopoutWindow>
      )}
    </div>
  );
}

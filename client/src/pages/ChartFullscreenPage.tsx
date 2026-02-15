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
  const [nearbyDrawings, setNearbyDrawings] = useState<Array<{ id: string; type: string }>>([]);

  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const drawingPrimitivesRef = useRef<Map<string, DrawingPrimitive>>(new Map());
  
  // Refs for drawing logic (to avoid recreating callbacks)
  const activeToolRef = useRef<DrawingTool>(null);
  const autoColorEnabledRef = useRef(autoColorEnabled);
  const onPointCommitRef = useRef<((point: GesturePoint) => void) | null>(null);

  // Drawing state - independent from parent
  const drawingState = useDrawingState();
  
  // Drawing persistence hook
  const drawingsPersistence = useDrawingsPersistence(symbol, timeframe);

  // Tool selection handler
  const handleSelectTool = useCallback((tool: DrawingTool) => {
    setActiveTool(tool);
    activeToolRef.current = tool;
  }, []);
  
  // Handler for chart clicks (radial selection)
  const handleChartClick = useCallback((event: MouseEvent) => {
    // Only handle clicks when no tool is active (not in drawing mode)
    if (activeTool) return;
    
    const chartElement = chartContainerRef.current;
    if (!chartElement || !chartRef.current || !candleSeriesRef.current) return;
    
    const rect = chartElement.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    // Find all drawings within click radius
    const hits = findDrawingsNearClick(clickX, clickY, drawings, chartRef.current, candleSeriesRef.current);
    
    if (hits.length === 0) {
      // Clicked empty space - deselect
      setSelectedDrawingId(null);
      setQuickMenuPosition(null);
    } else if (hits.length === 1) {
      // Single drawing found - select directly
      setSelectedDrawingId(hits[0].drawingId);
      setQuickMenuPosition({ x: event.clientX, y: event.clientY });
    } else {
      // Multiple drawings found - show selection modal
      setNearbyDrawings(hits.map(h => ({ id: h.drawingId, type: h.drawingType })));
      setShowSelectionModal(true);
    }
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
  }, [selectedDrawingId, drawingsPersistence]);
  
  // Handler for selection from modal
  const handleSelectFromModal = useCallback((drawingId: string) => {
    setSelectedDrawingId(drawingId);
    // Position quick menu in center of screen
    setQuickMenuPosition({ 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
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

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#cbd5e1',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
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
    
    // Capture ref value for cleanup
    const chartContainer = chartContainerRef.current;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, []);
  
  // Attach click handler to chart
  useEffect(() => {
    const chartElement = chartContainerRef.current;
    if (!chartElement) return;
    
    chartElement.addEventListener('click', handleChartClick);
    return () => chartElement.removeEventListener('click', handleChartClick);
  }, [handleChartClick]);

  // Fetch candles data
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const fetchCandles = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const binanceTimeframe = convertTimeframe(timeframe);
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceTimeframe}&limit=500`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch candles: ${response.status} ${response.statusText}`);
        }

        const klines = await response.json();
        const candleData = klines.map((kline: any) => ({
          time: Math.floor(kline[0] / 1000),
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
        }));

        setCandles(candleData);
        candleSeriesRef.current?.setData(candleData);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to fetch candle data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch candle data');
        setIsLoading(false);
      }
    };

    fetchCandles();
  }, [symbol, timeframe]);
  
  // Load saved drawings from database
  useEffect(() => {
    if (drawingsPersistence.drawings) {
      console.log('[Persistence] Loaded from DB:', drawingsPersistence.drawings.length, 'drawings');
      
      const loadedDrawings = drawingsPersistence.drawings
        .map((d: any): Drawing | null => {
          try {
            return {
              id: d.id || `drawing-${Date.now()}`,
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
      
      console.log('[Persistence] Parsed drawings:', loadedDrawings.length);
      
      setDrawings(prev => {
        const hasTempIds = prev.some(d => d.id.startsWith('drawing-'));
        if (hasTempIds && loadedDrawings.length === prev.length) {
          console.log('[Persistence] Skipping update - waiting for server IDs');
          return prev;
        }
        return loadedDrawings;
      });
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
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
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
      <div className="flex-1 relative overflow-hidden">
        <VerticalDrawingToolbar activeTool={activeTool} onSelectTool={handleSelectTool} />
        
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
        
        <div ref={chartContainerRef} className="absolute inset-0" />
        
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
    </div>
  );
}

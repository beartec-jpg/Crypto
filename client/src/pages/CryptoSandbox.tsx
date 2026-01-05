import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Crosshair, ChevronDown } from 'lucide-react';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'];
const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function CryptoSandbox() {
  const { isAdmin, isLoading: authLoading } = useCryptoAuth();
  const [, setLocation] = useLocation();
  
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Scales refs for zoom/pan
  const xScaleRef = useRef<d3.ScaleTime<number, number> | null>(null);
  const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  // Auto/manual scale mode (double-click axis to reset to auto)
  const [yAxisManual, setYAxisManual] = useState(false);
  const [xAxisManual, setXAxisManual] = useState(false);
  const [manualYDomain, setManualYDomain] = useState<[number, number] | null>(null);
  const [manualXDomain, setManualXDomain] = useState<[Date, Date] | null>(null);
  // Refs to access latest domain values inside D3 callbacks
  const manualYDomainRef = useRef<[number, number] | null>(null);
  const manualXDomainRef = useRef<[Date, Date] | null>(null);
  const yAxisManualRef = useRef(false);
  const xAxisManualRef = useRef(false);
  // Keep refs in sync with state
  manualYDomainRef.current = manualYDomain;
  manualXDomainRef.current = manualXDomain;
  yAxisManualRef.current = yAxisManual;
  xAxisManualRef.current = xAxisManual;
  const yAxisDragRef = useRef<{ startY: number; startDomain: [number, number] } | null>(null);
  const xAxisDragRef = useRef<{ startX: number; startDomain: [Date, Date] } | null>(null);
  
  // Crosshair state - toggle mode instead of long press (conflicts with D3 zoom)
  const [crosshairMode, setCrosshairMode] = useState(false);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  // For mobile "push" behavior - track touch start position
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const crosshairStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false); // Track if touch moved significantly
  const TOUCH_THRESHOLD = 15; // pixels - movement above this is a drag, not a tap
  
  // Drawing tool state
  type DrawingTool = 'trendline' | 'horizontal' | 'channel' | 'fibretracement' | 'trendfib' | 'label' | 'impulse' | 'abc' | 'wxy' | 'abcde' | 'wxyxz' | null;
  const [activeTool, setActiveTool] = useState<DrawingTool>(null);
  
  // Shared types
  type LineStyle = 'solid' | 'dashed' | 'dotted';
  type TrendlineMode = 'magnet' | 'free' | null;
  
  // Trendline data
  interface TrendlineData {
    id: string;
    p1: { time: number; price: number };
    p2: { time: number; price: number };
    color: string;
    opacity: number;
    lineStyle: LineStyle;
    thickness: number;
    extendLeft: boolean;
    extendRight: boolean;
    label?: { text: string; positions: ('top-left' | 'top-right' | 'bottom-left' | 'bottom-right')[] };
  }
  
  // Horizontal line data
  interface HorizontalLineData {
    id: string;
    price: number;
    color: string;
    opacity: number;
    lineStyle: LineStyle;
    thickness: number;
    label?: { text: string; position: 'left' | 'right' };
  }
  
  // Channel data
  interface ChannelData {
    id: string;
    p1: { time: number; price: number };
    p2: { time: number; price: number };
    width: number; // Distance in price units
    color: string;
    opacity: number;
    lineStyle: LineStyle;
    thickness: number;
    internalLines: { percent: number; visible: boolean; label: string }[];
    internalLineStyle: LineStyle;
    internalLineColor: string;
    showExternalLines: boolean;
  }
  
  // Text label data
  interface TextLabelData {
    id: string;
    x: number; // screen x (updated on pan/zoom)
    y: number; // screen y
    time: number; // anchor time for repositioning
    price: number; // anchor price
    text: string;
    color: string;
    opacity: number;
    backgroundColor: string;
    fontSize: number;
  }
  
  const [trendlineMode, setTrendlineMode] = useState<TrendlineMode>(null);
  const [trendlinePoints, setTrendlinePoints] = useState<{ x: number; y: number; time: number; price: number }[]>([]);
  const [drawnTrendlines, setDrawnTrendlines] = useState<TrendlineData[]>([]);
  const [drawnHorizontals, setDrawnHorizontals] = useState<HorizontalLineData[]>([]);
  const [drawnChannels, setDrawnChannels] = useState<ChannelData[]>([]);
  const [drawnTextLabels, setDrawnTextLabels] = useState<TextLabelData[]>([]);
  const [channelPoints, setChannelPoints] = useState<{ x: number; y: number; time: number; price: number }[]>([]);
  const [magnetPulse, setMagnetPulse] = useState<{ x: number; y: number } | null>(null);
  const MAGNET_RADIUS = 30; // pixels
  
  // Selection state for all drawing types
  const [selectedHorizontal, setSelectedHorizontal] = useState<string | null>(null);
  const [horizontalMenuPos, setHorizontalMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [channelMenuPos, setChannelMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedTextLabel, setSelectedTextLabel] = useState<string | null>(null);
  const [textLabelMenuPos, setTextLabelMenuPos] = useState<{ x: number; y: number } | null>(null);
  // Zoom counter to trigger re-renders for trendlines during zoom/pan
  const [zoomVersion, setZoomVersion] = useState(0);
  
  // Trendline selection and menu state
  const [selectedTrendline, setSelectedTrendline] = useState<string | null>(null);
  const [trendlineMenuPos, setTrendlineMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'color' | 'extend' | 'label' | 'h-color' | 'h-label' | 'ch-color' | 'ch-lines' | 'tl-color' | 'tl-text' | null>(null);
  const [movingTrendline, setMovingTrendline] = useState<string | null>(null);
  const [draggingMenu, setDraggingMenu] = useState(false);
  const menuDragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Move mode state
  const [moveMode, setMoveMode] = useState(false);
  const [movingPoint, setMovingPoint] = useState<{ lineId: string; point: 'p1' | 'p2' } | null>(null);
  const [movingWholeLine, setMovingWholeLine] = useState<string | null>(null);
  
  // Move states for other drawing types
  const [movingHorizontal, setMovingHorizontal] = useState<string | null>(null);
  const [movingChannel, setMovingChannel] = useState<string | null>(null);
  const [movingTextLabel, setMovingTextLabel] = useState<string | null>(null);
  
  // Undo/redo history for ALL drawing types (unified)
  type DrawingState = {
    trendlines: TrendlineData[];
    horizontals: HorizontalLineData[];
    channels: ChannelData[];
    labels: TextLabelData[];
  };
  const [drawingHistory, setDrawingHistory] = useState<DrawingState[]>([{
    trendlines: [],
    horizontals: [],
    channels: [],
    labels: []
  }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false); // Track if change is from undo/redo
  
  // Save to history with explicit new state
  const saveToHistory = useCallback((state: DrawingState) => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    setDrawingHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(state);
      // Keep last 50 states
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);
  
  // Wrapper to save current drawing state
  const saveDrawingState = useCallback(() => {
    saveToHistory({
      trendlines: drawnTrendlines,
      horizontals: drawnHorizontals,
      channels: drawnChannels,
      labels: drawnTextLabels
    });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);
  
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex - 1;
      const state = drawingHistory[newIndex];
      setHistoryIndex(newIndex);
      setDrawnTrendlines(state.trendlines);
      setDrawnHorizontals(state.horizontals);
      setDrawnChannels(state.channels);
      setDrawnTextLabels(state.labels);
      // Close all menus
      setSelectedTrendline(null);
      setTrendlineMenuPos(null);
      setSelectedHorizontal(null);
      setHorizontalMenuPos(null);
      setSelectedChannel(null);
      setChannelMenuPos(null);
      setSelectedTextLabel(null);
      setTextLabelMenuPos(null);
    }
  }, [historyIndex, drawingHistory]);
  
  const redo = useCallback(() => {
    if (historyIndex < drawingHistory.length - 1) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex + 1;
      const state = drawingHistory[newIndex];
      setHistoryIndex(newIndex);
      setDrawnTrendlines(state.trendlines);
      setDrawnHorizontals(state.horizontals);
      setDrawnChannels(state.channels);
      setDrawnTextLabels(state.labels);
      // Close all menus
      setSelectedTrendline(null);
      setTrendlineMenuPos(null);
      setSelectedHorizontal(null);
      setHorizontalMenuPos(null);
      setSelectedChannel(null);
      setChannelMenuPos(null);
      setSelectedTextLabel(null);
      setTextLabelMenuPos(null);
    }
  }, [historyIndex, drawingHistory]);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < drawingHistory.length - 1;
  
  
  // Color palette for trendlines
  const TRENDLINE_COLORS = ['#facc15', '#22c55e', '#ef4444', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#ffffff'];
  
  // Default trendline settings (loaded from localStorage)
  const [trendlineDefaults, setTrendlineDefaults] = useState(() => {
    try {
      const saved = localStorage.getItem('trendlineDefaults');
      return saved ? JSON.parse(saved) : { color: '#facc15', opacity: 1, lineStyle: 'solid' as LineStyle, thickness: 2 };
    } catch {
      return { color: '#facc15', opacity: 1, lineStyle: 'solid' as LineStyle, thickness: 2 };
    }
  });
  
  // Save as favorite function
  const saveAsFavorite = useCallback(() => {
    const selectedLine = drawnTrendlines.find(l => l.id === selectedTrendline);
    if (selectedLine) {
      const defaults = {
        color: selectedLine.color,
        opacity: selectedLine.opacity,
        lineStyle: selectedLine.lineStyle,
        thickness: selectedLine.thickness
      };
      setTrendlineDefaults(defaults);
      localStorage.setItem('trendlineDefaults', JSON.stringify(defaults));
    }
  }, [drawnTrendlines, selectedTrendline]);

  // Default horizontal line settings (loaded from localStorage)
  const [horizontalDefaults, setHorizontalDefaults] = useState(() => {
    try {
      const saved = localStorage.getItem('horizontalDefaults');
      return saved ? JSON.parse(saved) : { color: '#3b82f6', opacity: 1, lineStyle: 'solid' as LineStyle, thickness: 2 };
    } catch {
      return { color: '#3b82f6', opacity: 1, lineStyle: 'solid' as LineStyle, thickness: 2 };
    }
  });

  // Save horizontal as favorite
  const saveHorizontalAsFavorite = useCallback(() => {
    const selectedLine = drawnHorizontals.find(l => l.id === selectedHorizontal);
    if (selectedLine) {
      const defaults = { color: selectedLine.color, opacity: selectedLine.opacity, lineStyle: selectedLine.lineStyle, thickness: selectedLine.thickness };
      setHorizontalDefaults(defaults);
      localStorage.setItem('horizontalDefaults', JSON.stringify(defaults));
    }
  }, [drawnHorizontals, selectedHorizontal]);

  // Default channel settings
  const [channelDefaults, setChannelDefaults] = useState(() => {
    try {
      const saved = localStorage.getItem('channelDefaults');
      return saved ? JSON.parse(saved) : { color: '#22c55e', opacity: 0.8, lineStyle: 'solid' as LineStyle, thickness: 2, internalLineStyle: 'dashed' as LineStyle, internalLineColor: '#22c55e' };
    } catch {
      return { color: '#22c55e', opacity: 0.8, lineStyle: 'solid' as LineStyle, thickness: 2, internalLineStyle: 'dashed' as LineStyle, internalLineColor: '#22c55e' };
    }
  });

  // Default text label settings
  const [textLabelDefaults, setTextLabelDefaults] = useState(() => {
    try {
      const saved = localStorage.getItem('textLabelDefaults');
      return saved ? JSON.parse(saved) : { color: '#ffffff', opacity: 1, backgroundColor: 'transparent', fontSize: 14 };
    } catch {
      return { color: '#ffffff', opacity: 1, backgroundColor: 'transparent', fontSize: 14 };
    }
  });

  // Save text label as favorite
  const saveTextLabelAsFavorite = useCallback(() => {
    const label = drawnTextLabels.find(l => l.id === selectedTextLabel);
    if (label) {
      const defaults = { color: label.color, opacity: label.opacity, backgroundColor: label.backgroundColor, fontSize: label.fontSize };
      setTextLabelDefaults(defaults);
      localStorage.setItem('textLabelDefaults', JSON.stringify(defaults));
    }
  }, [drawnTextLabels, selectedTextLabel]);
  
  // Indicator states - Trend Tools
  const [showEMA, setShowEMA] = useState(false);
  const [showSMA, setShowSMA] = useState(false);
  const [showSupertrend, setShowSupertrend] = useState(false);
  const [showIchimoku, setShowIchimoku] = useState(false);
  const [showBollingerBands, setShowBollingerBands] = useState(false);
  
  // Indicator states - SMC
  const [showBOS, setShowBOS] = useState(false);
  const [showCHoCH, setShowCHoCH] = useState(false);
  const [showFVG, setShowFVG] = useState(false);
  const [showOrderBlocks, setShowOrderBlocks] = useState(false);
  const [showSwingPivots, setShowSwingPivots] = useState(false);
  
  // Indicator states - VWAP
  const [showVWAPSession, setShowVWAPSession] = useState(false);
  const [showVWAPDaily, setShowVWAPDaily] = useState(false);
  const [showVWAPWeekly, setShowVWAPWeekly] = useState(false);
  const [showVWAPBands, setShowVWAPBands] = useState(false);
  
  // Indicator states - Oscillators
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showMFI, setShowMFI] = useState(false);
  const [showADX, setShowADX] = useState(false);
  
  // Margins for the chart
  const margin = { top: 20, right: 80, bottom: 40, left: 20 };
  
  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      setLocation('/crypto/account');
    }
  }, [authLoading, isAdmin, setLocation]);
  
  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width,
          height: rect.height
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  // Fetch candle data - use backend proxy for reliable data (up to 5000+ candles)
  const fetchCandles = useCallback(async () => {
    setLoading(true);
    try {
      // Use backend proxy which handles CORS and can fetch more data
      // First batch - most recent 1000
      const url1 = `/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=1000`;
      const response1 = await fetch(url1);
      if (!response1.ok) throw new Error('Failed to fetch data');
      const data1 = await response1.json();
      
      let allData = [...data1];
      console.log(`📊 Batch 1: ${data1.length} candles`);
      
      // Fetch additional batches for more history
      const batchCount = 5; // Total 5 batches = up to 5000 candles
      let lastEndTime = data1.length > 0 ? data1[0][0] - 1 : null;
      
      for (let i = 2; i <= batchCount && lastEndTime; i++) {
        const url = `/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=1000&endTime=${lastEndTime}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.length > 0) {
            console.log(`📊 Batch ${i}: ${data.length} candles`);
            allData = [...data, ...allData];
            lastEndTime = data[0][0] - 1;
          } else {
            break; // No more data available
          }
        } else {
          break;
        }
      }
      
      console.log(`✅ Total candles loaded: ${allData.length}`);
      
      const formattedCandles: CandleData[] = allData.map((k: any) => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
      
      setCandles(formattedCandles);
    } catch (error) {
      console.error('Error fetching candles:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);
  
  useEffect(() => {
    fetchCandles();
  }, [fetchCandles]);
  
  // Document-level handlers for menu dragging and click-off to deselect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingMenu) {
        const newX = e.clientX - menuDragOffset.current.x;
        const newY = e.clientY - menuDragOffset.current.y;
        // Update whichever menu is being dragged
        if (trendlineMenuPos) setTrendlineMenuPos({ x: newX, y: newY });
        if (horizontalMenuPos) setHorizontalMenuPos({ x: newX, y: newY });
        if (channelMenuPos) setChannelMenuPos({ x: newX, y: newY });
        if (textLabelMenuPos) setTextLabelMenuPos({ x: newX, y: newY });
      }
    };
    
    const handleMouseUp = () => {
      if (draggingMenu) setDraggingMenu(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingMenu, trendlineMenuPos, horizontalMenuPos, channelMenuPos, textLabelMenuPos]);
  
  // Click-off handler: deselect tool and close menus when clicking on chart background
  const handleChartBackgroundClick = useCallback((e: React.MouseEvent) => {
    // Check if clicking on a menu, toolbar, or drawing overlay - if so, don't close
    const target = e.target as HTMLElement;
    const isMenuClick = target.closest('[data-menu]') !== null;
    const isToolbarClick = target.closest('[data-toolbar]') !== null;
    const isDrawingOverlay = target.closest('[data-drawing-overlay]') !== null;
    
    if (!isMenuClick && !isToolbarClick && !isDrawingOverlay) {
      // Deselect active tool
      setActiveTool(null);
      // Close all menus
      setSelectedTrendline(null);
      setTrendlineMenuPos(null);
      setSelectedHorizontal(null);
      setHorizontalMenuPos(null);
      setSelectedChannel(null);
      setChannelMenuPos(null);
      setSelectedTextLabel(null);
      setTextLabelMenuPos(null);
      setActiveSubmenu(null);
      // Clear any in-progress drawing
      setTrendlineMode(null);
      setTrendlinePoints([]);
      setChannelPoints([]);
    }
  }, []);
  
  // Magnet snap logic - find high/low within circle radius
  const findMagnetPoint = useCallback((clickX: number, clickY: number): { x: number; y: number; time: number; price: number } | null => {
    if (!xScaleRef.current || !yScaleRef.current || candles.length === 0) return null;
    
    const xScale = xScaleRef.current;
    const yScale = yScaleRef.current;
    
    // Find candles whose x position is within the radius
    const candidateCandles: { candle: CandleData; distance: number }[] = [];
    
    for (const candle of candles) {
      const candleX = xScale(new Date(candle.time)) + margin.left;
      const distanceX = Math.abs(candleX - clickX);
      
      if (distanceX <= MAGNET_RADIUS) {
        // Check if high or low is within vertical radius
        const highY = yScale(candle.high) + margin.top;
        const lowY = yScale(candle.low) + margin.top;
        
        const distHigh = Math.sqrt(distanceX * distanceX + Math.pow(highY - clickY, 2));
        const distLow = Math.sqrt(distanceX * distanceX + Math.pow(lowY - clickY, 2));
        
        if (distHigh <= MAGNET_RADIUS || distLow <= MAGNET_RADIUS) {
          candidateCandles.push({ candle, distance: Math.min(distHigh, distLow) });
        }
      }
    }
    
    if (candidateCandles.length === 0) return null;
    
    // Determine if click is above or below candles (use average midpoint of candidates)
    const avgMid = candidateCandles.reduce((sum, c) => {
      const midY = yScale((c.candle.high + c.candle.low) / 2) + margin.top;
      return sum + midY;
    }, 0) / candidateCandles.length;
    
    const selectHigh = clickY < avgMid; // Above mid = select highs, below = select lows
    
    // Find the best point
    let bestCandle: CandleData | null = null;
    let bestPrice = selectHigh ? -Infinity : Infinity;
    
    for (const { candle } of candidateCandles) {
      if (selectHigh && candle.high > bestPrice) {
        bestPrice = candle.high;
        bestCandle = candle;
      } else if (!selectHigh && candle.low < bestPrice) {
        bestPrice = candle.low;
        bestCandle = candle;
      }
    }
    
    if (!bestCandle) return null;
    
    const finalX = xScale(new Date(bestCandle.time)) + margin.left;
    const finalY = yScale(bestPrice) + margin.top;
    
    return { x: finalX, y: finalY, time: bestCandle.time, price: bestPrice };
  }, [candles, margin.left, margin.top, MAGNET_RADIUS]);
  
  // Handle trendline point placement - combined mode (magnet with free fallback)
  const handleTrendlineClick = useCallback((clickX: number, clickY: number) => {
    if (!trendlineMode || !xScaleRef.current || !yScaleRef.current) return;
    
    let point: { x: number; y: number; time: number; price: number };
    
    // Try magnet first, fallback to free if no candle nearby
    const magnetPoint = findMagnetPoint(clickX, clickY);
    if (magnetPoint) {
      point = magnetPoint;
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
    } else {
      // Free placement if no candle in radius
      const xScale = xScaleRef.current;
      const yScale = yScaleRef.current;
      const time = xScale.invert(clickX - margin.left).getTime();
      const price = yScale.invert(clickY - margin.top);
      point = { x: clickX, y: clickY, time, price };
    }
    
    if (trendlinePoints.length === 0) {
      // First point
      setTrendlinePoints([point]);
    } else {
      // Second point - complete the trendline with full properties
      const newTrendline: TrendlineData = {
        id: `tl-${Date.now()}`,
        p1: { time: trendlinePoints[0].time, price: trendlinePoints[0].price },
        p2: { time: point.time, price: point.price },
        color: trendlineDefaults.color,
        opacity: trendlineDefaults.opacity,
        lineStyle: trendlineDefaults.lineStyle,
        thickness: trendlineDefaults.thickness,
        extendLeft: false,
        extendRight: false,
      };
      const newTrendlines = [...drawnTrendlines, newTrendline];
      setDrawnTrendlines(newTrendlines);
      saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, labels: drawnTextLabels });
      setTrendlinePoints([]);
      // Keep tool active for drawing more lines
    }
  }, [trendlineMode, trendlinePoints, findMagnetPoint, margin.left, margin.top, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory, trendlineDefaults]);
  
  // Handle click on trendline to select it - auto enters move mode
  const handleTrendlineSelect = useCallback((lineId: string, clickX: number, clickY: number) => {
    setSelectedTrendline(lineId);
    setMoveMode(true);
    setMovingTrendline(lineId);
    
    // Calculate menu position with edge detection
    let menuX = clickX + 10;
    let menuY = clickY;
    const menuHeight = 180; // Approximate menu height (reduced, no Move button)
    const menuWidth = 40;
    
    // Keep menu within chart bounds
    if (menuX + menuWidth > dimensions.width - margin.right) {
      menuX = clickX - menuWidth - 10;
    }
    if (menuY + menuHeight > dimensions.height - margin.bottom) {
      menuY = dimensions.height - margin.bottom - menuHeight;
    }
    if (menuY < margin.top) {
      menuY = margin.top;
    }
    
    setTrendlineMenuPos({ x: menuX, y: menuY });
    setActiveSubmenu(null);
  }, [dimensions, margin]);
  
  // Delete selected trendline
  const deleteTrendline = useCallback(() => {
    if (selectedTrendline) {
      const newTrendlines = drawnTrendlines.filter(l => l.id !== selectedTrendline);
      setDrawnTrendlines(newTrendlines);
      saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, labels: drawnTextLabels });
      setSelectedTrendline(null);
      setTrendlineMenuPos(null);
      setActiveSubmenu(null);
    }
  }, [selectedTrendline, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);
  
  // Update trendline property
  const updateTrendline = useCallback((id: string, updates: Partial<TrendlineData>) => {
    const newTrendlines = drawnTrendlines.map(l => l.id === id ? { ...l, ...updates } : l);
    setDrawnTrendlines(newTrendlines);
    saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, labels: drawnTextLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);
  
  // Close trendline menu when clicking elsewhere
  const closeTrendlineMenu = useCallback(() => {
    setSelectedTrendline(null);
    setTrendlineMenuPos(null);
    setActiveSubmenu(null);
    setMovingTrendline(null);
    setMoveMode(false);
    setMovingPoint(null);
    setMovingWholeLine(null);
  }, []);

  // === HORIZONTAL LINE HANDLERS ===
  // Handle click to place horizontal line - uses magnet mode
  const handleHorizontalClick = useCallback((clickX: number, clickY: number) => {
    if (!yScaleRef.current) return;
    
    // Try magnet mode first
    const magnetPoint = findMagnetPoint(clickX, clickY);
    let price: number;
    if (magnetPoint) {
      price = magnetPoint.price;
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
    } else {
      price = yScaleRef.current.invert(clickY - margin.top);
    }
    
    const newLine: HorizontalLineData = {
      id: `hl-${Date.now()}`,
      price,
      color: horizontalDefaults.color,
      opacity: horizontalDefaults.opacity,
      lineStyle: horizontalDefaults.lineStyle,
      thickness: horizontalDefaults.thickness,
    };
    const newHorizontals = [...drawnHorizontals, newLine];
    setDrawnHorizontals(newHorizontals);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: newHorizontals, channels: drawnChannels, labels: drawnTextLabels });
  }, [margin.top, horizontalDefaults, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);

  // Handle click on horizontal line to select it
  const handleHorizontalSelect = useCallback((lineId: string, clickX: number, clickY: number) => {
    setSelectedHorizontal(lineId);
    closeTrendlineMenu();
    setSelectedChannel(null);
    setChannelMenuPos(null);
    setSelectedTextLabel(null);
    setTextLabelMenuPos(null);
    let menuX = clickX + 10;
    let menuY = clickY - 50;
    if (menuX > dimensions.width - 60) menuX = dimensions.width - 60;
    if (menuY < margin.top) menuY = margin.top;
    setHorizontalMenuPos({ x: menuX, y: menuY });
  }, [dimensions, margin, closeTrendlineMenu]);

  // Delete selected horizontal line
  const deleteHorizontal = useCallback(() => {
    if (selectedHorizontal) {
      const newHorizontals = drawnHorizontals.filter(l => l.id !== selectedHorizontal);
      setDrawnHorizontals(newHorizontals);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: newHorizontals, channels: drawnChannels, labels: drawnTextLabels });
      setSelectedHorizontal(null);
      setHorizontalMenuPos(null);
    }
  }, [selectedHorizontal, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);

  // Update horizontal line property
  const updateHorizontal = useCallback((id: string, updates: Partial<HorizontalLineData>) => {
    const newHorizontals = drawnHorizontals.map(l => l.id === id ? { ...l, ...updates } : l);
    setDrawnHorizontals(newHorizontals);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: newHorizontals, channels: drawnChannels, labels: drawnTextLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);

  // Close horizontal menu
  const closeHorizontalMenu = useCallback(() => {
    setSelectedHorizontal(null);
    setHorizontalMenuPos(null);
  }, []);

  // === CHANNEL HANDLERS === (3-click: start, height, direction)
  const handleChannelClick = useCallback((clickX: number, clickY: number) => {
    if (!xScaleRef.current || !yScaleRef.current) return;
    
    // Try magnet mode first
    const magnetPoint = findMagnetPoint(clickX, clickY);
    let point: { x: number; y: number; time: number; price: number };
    if (magnetPoint) {
      point = magnetPoint;
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
    } else {
      const time = xScaleRef.current.invert(clickX - margin.left).getTime();
      const price = yScaleRef.current.invert(clickY - margin.top);
      point = { x: clickX, y: clickY, time, price };
    }
    
    if (channelPoints.length === 0) {
      // First click: start point
      setChannelPoints([point]);
    } else if (channelPoints.length === 1) {
      // Second click: defines height (vertical distance from start)
      setChannelPoints([channelPoints[0], point]);
    } else if (channelPoints.length === 2) {
      // Third click: defines direction/end point
      const p1 = channelPoints[0];
      const p2 = channelPoints[1];
      const channelHeight = Math.abs(p1.price - p2.price);
      const newChannel: ChannelData = {
        id: `ch-${Date.now()}`,
        p1: { time: p1.time, price: p1.price },
        p2: { time: point.time, price: point.price },
        width: channelHeight,
        color: channelDefaults.color,
        opacity: channelDefaults.opacity,
        lineStyle: channelDefaults.lineStyle,
        thickness: channelDefaults.thickness,
        internalLines: [
          { percent: 25, visible: true, label: '25%' },
          { percent: 50, visible: true, label: '50%' },
          { percent: 75, visible: true, label: '75%' },
        ],
        internalLineStyle: channelDefaults.internalLineStyle,
        internalLineColor: channelDefaults.internalLineColor,
        showExternalLines: true,
      };
      const newChannels = [...drawnChannels, newChannel];
      setDrawnChannels(newChannels);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: newChannels, labels: drawnTextLabels });
      setChannelPoints([]);
    }
  }, [channelPoints, margin, channelDefaults, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);

  // Handle click on channel to select it
  const handleChannelSelect = useCallback((channelId: string, clickX: number, clickY: number) => {
    setSelectedChannel(channelId);
    closeTrendlineMenu();
    closeHorizontalMenu();
    setSelectedTextLabel(null);
    setTextLabelMenuPos(null);
    let menuX = clickX + 10;
    let menuY = clickY - 50;
    if (menuX > dimensions.width - 60) menuX = dimensions.width - 60;
    if (menuY < margin.top) menuY = margin.top;
    setChannelMenuPos({ x: menuX, y: menuY });
  }, [dimensions, margin, closeTrendlineMenu, closeHorizontalMenu]);

  // Delete selected channel
  const deleteChannel = useCallback(() => {
    if (selectedChannel) {
      const newChannels = drawnChannels.filter(c => c.id !== selectedChannel);
      setDrawnChannels(newChannels);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: newChannels, labels: drawnTextLabels });
      setSelectedChannel(null);
      setChannelMenuPos(null);
    }
  }, [selectedChannel, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);

  // Update channel property
  const updateChannel = useCallback((id: string, updates: Partial<ChannelData>) => {
    const newChannels = drawnChannels.map(c => c.id === id ? { ...c, ...updates } : c);
    setDrawnChannels(newChannels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: newChannels, labels: drawnTextLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);

  // Close channel menu
  const closeChannelMenu = useCallback(() => {
    setSelectedChannel(null);
    setChannelMenuPos(null);
  }, []);

  // === TEXT LABEL HANDLERS ===
  const handleTextLabelClick = useCallback((clickX: number, clickY: number) => {
    if (!xScaleRef.current || !yScaleRef.current) return;
    
    // Try magnet mode first
    const magnetPoint = findMagnetPoint(clickX, clickY);
    let time: number, price: number;
    if (magnetPoint) {
      time = magnetPoint.time;
      price = magnetPoint.price;
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
    } else {
      time = xScaleRef.current.invert(clickX - margin.left).getTime();
      price = yScaleRef.current.invert(clickY - margin.top);
    }
    
    const newLabel: TextLabelData = {
      id: `txt-${Date.now()}`,
      x: clickX,
      y: clickY,
      time,
      price,
      text: 'Label',
      color: textLabelDefaults.color,
      opacity: textLabelDefaults.opacity,
      backgroundColor: textLabelDefaults.backgroundColor,
      fontSize: textLabelDefaults.fontSize,
    };
    const newLabels = [...drawnTextLabels, newLabel];
    setDrawnTextLabels(newLabels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, labels: newLabels });
  }, [margin, textLabelDefaults, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);

  // Handle click on text label to select it
  const handleTextLabelSelect = useCallback((labelId: string, clickX: number, clickY: number) => {
    setSelectedTextLabel(labelId);
    closeTrendlineMenu();
    closeHorizontalMenu();
    closeChannelMenu();
    let menuX = clickX + 10;
    let menuY = clickY - 50;
    if (menuX > dimensions.width - 60) menuX = dimensions.width - 60;
    if (menuY < margin.top) menuY = margin.top;
    setTextLabelMenuPos({ x: menuX, y: menuY });
  }, [dimensions, margin, closeTrendlineMenu, closeHorizontalMenu, closeChannelMenu]);

  // Delete selected text label
  const deleteTextLabel = useCallback(() => {
    if (selectedTextLabel) {
      const newLabels = drawnTextLabels.filter(l => l.id !== selectedTextLabel);
      setDrawnTextLabels(newLabels);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, labels: newLabels });
      setSelectedTextLabel(null);
      setTextLabelMenuPos(null);
    }
  }, [selectedTextLabel, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);

  // Update text label property
  const updateTextLabel = useCallback((id: string, updates: Partial<TextLabelData>) => {
    const newLabels = drawnTextLabels.map(l => l.id === id ? { ...l, ...updates } : l);
    setDrawnTextLabels(newLabels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, labels: newLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);
  
  // Move whole line - places center at click position
  const moveWholeLine = useCallback((clickX: number, clickY: number) => {
    if (!movingWholeLine || !xScaleRef.current || !yScaleRef.current) return;
    
    const line = drawnTrendlines.find(l => l.id === movingWholeLine);
    if (!line) return;
    
    // Get current center in screen coords
    const oldCenterX = (xScaleRef.current(new Date(line.p1.time)) + xScaleRef.current(new Date(line.p2.time))) / 2 + margin.left;
    const oldCenterY = (yScaleRef.current(line.p1.price) + yScaleRef.current(line.p2.price)) / 2 + margin.top;
    
    // Calculate offset
    const offsetX = clickX - oldCenterX;
    const offsetY = clickY - oldCenterY;
    
    // Convert back to time/price
    const newP1Time = xScaleRef.current.invert(xScaleRef.current(new Date(line.p1.time)) + offsetX).getTime();
    const newP2Time = xScaleRef.current.invert(xScaleRef.current(new Date(line.p2.time)) + offsetX).getTime();
    const newP1Price = yScaleRef.current.invert(yScaleRef.current(line.p1.price) + offsetY);
    const newP2Price = yScaleRef.current.invert(yScaleRef.current(line.p2.price) + offsetY);
    
    const newTrendlines = drawnTrendlines.map(l => {
      if (l.id === movingWholeLine) {
        return {
          ...l,
          p1: { time: newP1Time, price: newP1Price },
          p2: { time: newP2Time, price: newP2Price }
        };
      }
      return l;
    });
    
    setDrawnTrendlines(newTrendlines);
    saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, labels: drawnTextLabels });
    setMovingWholeLine(null);
    setSelectedTrendline(null);
  }, [movingWholeLine, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, margin.left, margin.top, saveToHistory]);
  
  // Move horizontal line to new position
  const placeMovingHorizontal = useCallback((clickX: number, clickY: number) => {
    if (!movingHorizontal || !yScaleRef.current) return;
    
    const magnetPoint = findMagnetPoint(clickX, clickY);
    let newPrice: number;
    if (magnetPoint) {
      newPrice = magnetPoint.price;
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
    } else {
      newPrice = yScaleRef.current.invert(clickY - margin.top);
    }
    
    const newHorizontals = drawnHorizontals.map(l => 
      l.id === movingHorizontal ? { ...l, price: newPrice } : l
    );
    setDrawnHorizontals(newHorizontals);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: newHorizontals, channels: drawnChannels, labels: drawnTextLabels });
    setMovingHorizontal(null);
    setSelectedHorizontal(null);
    setHorizontalMenuPos(null);
  }, [movingHorizontal, margin.top, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);
  
  // Move text label to new position
  const placeMovingTextLabel = useCallback((clickX: number, clickY: number) => {
    if (!movingTextLabel || !xScaleRef.current || !yScaleRef.current) return;
    
    const magnetPoint = findMagnetPoint(clickX, clickY);
    let time: number, price: number;
    if (magnetPoint) {
      time = magnetPoint.time;
      price = magnetPoint.price;
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
    } else {
      time = xScaleRef.current.invert(clickX - margin.left).getTime();
      price = yScaleRef.current.invert(clickY - margin.top);
    }
    
    const newLabels = drawnTextLabels.map(l => 
      l.id === movingTextLabel ? { ...l, time, price, x: clickX, y: clickY } : l
    );
    setDrawnTextLabels(newLabels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, labels: newLabels });
    setMovingTextLabel(null);
    setSelectedTextLabel(null);
    setTextLabelMenuPos(null);
  }, [movingTextLabel, margin.left, margin.top, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);
  
  // Move channel to new position (translates the whole channel)
  const placeMovingChannel = useCallback((clickX: number, clickY: number) => {
    if (!movingChannel || !xScaleRef.current || !yScaleRef.current) return;
    
    const channel = drawnChannels.find(c => c.id === movingChannel);
    if (!channel) return;
    
    const magnetPoint = findMagnetPoint(clickX, clickY);
    let newTime: number, newPrice: number;
    if (magnetPoint) {
      newTime = magnetPoint.time;
      newPrice = magnetPoint.price;
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
    } else {
      newTime = xScaleRef.current.invert(clickX - margin.left).getTime();
      newPrice = yScaleRef.current.invert(clickY - margin.top);
    }
    
    // Calculate center of current channel
    const oldCenterTime = (channel.p1.time + channel.p2.time) / 2;
    const oldCenterPrice = (channel.p1.price + channel.p2.price) / 2;
    
    // Calculate offset
    const timeDelta = newTime - oldCenterTime;
    const priceDelta = newPrice - oldCenterPrice;
    
    // Apply offset to both points
    const newChannels = drawnChannels.map(c => 
      c.id === movingChannel ? {
        ...c,
        p1: { time: c.p1.time + timeDelta, price: c.p1.price + priceDelta },
        p2: { time: c.p2.time + timeDelta, price: c.p2.price + priceDelta }
      } : c
    );
    setDrawnChannels(newChannels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: newChannels, labels: drawnTextLabels });
    setMovingChannel(null);
    setSelectedChannel(null);
    setChannelMenuPos(null);
  }, [movingChannel, drawnChannels, drawnTrendlines, drawnHorizontals, drawnTextLabels, margin.left, margin.top, findMagnetPoint, saveToHistory]);
  
  // Handle clicking an endpoint in move mode - immediately start moving
  const handleEndpointClick = useCallback((lineId: string, point: 'p1' | 'p2') => {
    if (!moveMode) return;
    // Immediately start moving the point (magnet with free fallback)
    setMovingPoint({ lineId, point });
    setTrendlineMenuPos(null);
  }, [moveMode]);
  
  // Find if a point is near any trendline (for crosshair-based selection)
  const findNearbyTrendline = useCallback((clickX: number, clickY: number): string | null => {
    if (!xScaleRef.current || !yScaleRef.current) return null;
    const threshold = 15; // pixels distance to consider "near" a line
    
    for (const line of drawnTrendlines) {
      const x1 = xScaleRef.current(new Date(line.p1.time)) + margin.left;
      const y1 = yScaleRef.current(line.p1.price) + margin.top;
      const x2 = xScaleRef.current(new Date(line.p2.time)) + margin.left;
      const y2 = yScaleRef.current(line.p2.price) + margin.top;
      
      // Calculate distance from point to line segment
      const lineLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (lineLen === 0) continue;
      
      const t = Math.max(0, Math.min(1, ((clickX - x1) * (x2 - x1) + (clickY - y1) * (y2 - y1)) / (lineLen * lineLen)));
      const nearestX = x1 + t * (x2 - x1);
      const nearestY = y1 + t * (y2 - y1);
      const distance = Math.sqrt((clickX - nearestX) ** 2 + (clickY - nearestY) ** 2);
      
      if (distance <= threshold) {
        return line.id;
      }
    }
    return null;
  }, [drawnTrendlines, margin.left, margin.top]);
  
  // Find if crosshair is near an endpoint of the moving trendline
  const findNearbyEndpoint = useCallback((clickX: number, clickY: number): 'p1' | 'p2' | null => {
    if (!xScaleRef.current || !yScaleRef.current || !movingTrendline) return null;
    const line = drawnTrendlines.find(l => l.id === movingTrendline);
    if (!line) return null;
    
    const threshold = 20; // pixels
    const x1 = xScaleRef.current(new Date(line.p1.time)) + margin.left;
    const y1 = yScaleRef.current(line.p1.price) + margin.top;
    const x2 = xScaleRef.current(new Date(line.p2.time)) + margin.left;
    const y2 = yScaleRef.current(line.p2.price) + margin.top;
    
    const dist1 = Math.sqrt((clickX - x1) ** 2 + (clickY - y1) ** 2);
    const dist2 = Math.sqrt((clickX - x2) ** 2 + (clickY - y2) ** 2);
    
    if (dist1 <= threshold && dist1 < dist2) return 'p1';
    if (dist2 <= threshold) return 'p2';
    return null;
  }, [drawnTrendlines, movingTrendline, margin.left, margin.top]);

  // Place the moving point at new location - magnet with free fallback
  const placeMovingPoint = useCallback((clickX: number, clickY: number) => {
    if (!movingPoint || !xScaleRef.current || !yScaleRef.current) return;
    
    let newPoint: { time: number; price: number };
    
    // Try magnet first, fallback to free if no candle nearby
    const magnetResult = findMagnetPoint(clickX, clickY);
    if (magnetResult) {
      newPoint = { time: magnetResult.time, price: magnetResult.price };
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
    } else {
      // Free mode fallback
      const time = xScaleRef.current.invert(clickX - margin.left).getTime();
      const price = yScaleRef.current.invert(clickY - margin.top);
      newPoint = { time, price };
    }
    
    // Update the trendline
    const newTrendlines = drawnTrendlines.map(l => {
      if (l.id === movingPoint.lineId) {
        return {
          ...l,
          [movingPoint.point]: newPoint
        };
      }
      return l;
    });
    setDrawnTrendlines(newTrendlines);
    saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, labels: drawnTextLabels });
    
    // Stay in move mode, just clear the moving point
    setMovingPoint(null);
  }, [movingPoint, findMagnetPoint, margin.left, margin.top, drawnTrendlines, drawnHorizontals, drawnChannels, drawnTextLabels, saveToHistory]);
  
  // Universal click pulse - show on any placement/move/selection
  const [clickPulse, setClickPulse] = useState<{ x: number; y: number } | null>(null);
  const showClickPulse = useCallback((x: number, y: number) => {
    setClickPulse({ x, y });
    setTimeout(() => setClickPulse(null), 400);
  }, []);
  
  // Global mouse/touch handlers for axis drag
  useEffect(() => {
    console.log('Axis handlers mounted');
    
    const handleMove = (clientX: number, clientY: number) => {
      const yDrag = yAxisDragRef.current;
      const xDrag = xAxisDragRef.current;
      
      if (yDrag) {
        const deltaY = clientY - yDrag.startY;
        const sensitivity = 0.005;
        const factor = 1 + deltaY * sensitivity;
        const [minPrice, maxPrice] = yDrag.startDomain;
        const midPrice = (minPrice + maxPrice) / 2;
        const halfRange = (maxPrice - minPrice) / 2;
        const newHalfRange = halfRange * Math.max(0.1, factor);
        const newDomain: [number, number] = [midPrice - newHalfRange, midPrice + newHalfRange];
        setManualYDomain(newDomain);
        // Don't trigger full rebuild - just store domain for next D3 zoom event
      }
      
      if (xDrag) {
        const deltaX = clientX - xDrag.startX;
        const sensitivity = 0.003;
        const factor = 1 - deltaX * sensitivity;
        const [minTime, maxTime] = xDrag.startDomain;
        const midTime = new Date((minTime.getTime() + maxTime.getTime()) / 2);
        const halfRange = (maxTime.getTime() - minTime.getTime()) / 2;
        const newHalfRange = halfRange * Math.max(0.1, factor);
        const newDomain: [Date, Date] = [
          new Date(midTime.getTime() - newHalfRange),
          new Date(midTime.getTime() + newHalfRange)
        ];
        setManualXDomain(newDomain);
        // Don't trigger full rebuild - just store domain for next D3 zoom event
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (yAxisDragRef.current || xAxisDragRef.current) {
        e.preventDefault();
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
      }
    };
    
    const handleEnd = () => {
      if (yAxisDragRef.current || xAxisDragRef.current) {
        console.log('Axis drag ended');
      }
      yAxisDragRef.current = null;
      xAxisDragRef.current = null;
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('touchcancel', handleEnd);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('touchcancel', handleEnd);
    };
  }, []);
  
  // Render D3 chart
  useEffect(() => {
    if (!svgRef.current || candles.length === 0 || dimensions.width === 0) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    const width = dimensions.width;
    const height = dimensions.height;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create main group with margins
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Create clip path for chart area
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'chart-clip')
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight);
    
    // Time extent
    const timeExtent = d3.extent(candles, d => d.time) as [number, number];
    const priceExtent = [
      d3.min(candles, d => d.low) as number * 0.999,
      d3.max(candles, d => d.high) as number * 1.001
    ];
    
    // X Scale (time) - preserve manual domain if set
    const xScale = d3.scaleTime()
      .domain(xAxisManual && manualXDomain ? manualXDomain : [new Date(timeExtent[0]), new Date(timeExtent[1])])
      .range([0, innerWidth]);
    xScaleRef.current = xScale;
    
    // Y Scale (price) - use manual domain if set
    const yScale = d3.scaleLinear()
      .domain(yAxisManual && manualYDomain ? manualYDomain : priceExtent)
      .range([innerHeight, 0]);
    if (!yAxisManual) yScale.nice();
    yScaleRef.current = yScale;
    
    // Background
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', '#0f172a');
    
    // Grid lines
    g.append('g')
      .attr('class', 'grid-y')
      .selectAll('line')
      .data(yScale.ticks(10))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 1);
    
    // Candles group with clip path
    const candlesGroup = g.append('g')
      .attr('class', 'candles')
      .attr('clip-path', 'url(#chart-clip)');
    
    // Draw candles
    const drawCandles = (xS: d3.ScaleTime<number, number>, yS: d3.ScaleLinear<number, number>) => {
      candlesGroup.selectAll('*').remove();
      
      const visibleTimeRange = xS.domain();
      const visibleCandles = candles.filter(d => {
        const date = new Date(d.time);
        return date >= visibleTimeRange[0] && date <= visibleTimeRange[1];
      });
      
      const dynamicCandleWidth = Math.max(1, Math.min(20, (innerWidth / visibleCandles.length) * 0.8));
      
      // Wicks
      candlesGroup.selectAll('.wick')
        .data(visibleCandles)
        .enter()
        .append('line')
        .attr('class', 'wick')
        .attr('x1', d => xS(new Date(d.time)))
        .attr('x2', d => xS(new Date(d.time)))
        .attr('y1', d => yS(d.high))
        .attr('y2', d => yS(d.low))
        .attr('stroke', d => d.close >= d.open ? '#22c55e' : '#ef4444')
        .attr('stroke-width', 1);
      
      // Bodies
      candlesGroup.selectAll('.body')
        .data(visibleCandles)
        .enter()
        .append('rect')
        .attr('class', 'body')
        .attr('x', d => xS(new Date(d.time)) - dynamicCandleWidth / 2)
        .attr('y', d => yS(Math.max(d.open, d.close)))
        .attr('width', dynamicCandleWidth)
        .attr('height', d => Math.max(1, Math.abs(yS(d.open) - yS(d.close))))
        .attr('fill', d => d.close >= d.open ? '#22c55e' : '#ef4444');
    };
    
    drawCandles(xScale, yScale);
    
    // X Axis (bottom)
    const xAxisGroup = g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat(d => {
        const date = d as Date;
        // Show date and time for better readability
        if (interval === '1d' || interval === '4h') {
          return d3.timeFormat('%b %d')(date);
        }
        return d3.timeFormat('%b %d %H:%M')(date);
      }))
      .call(g => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '11px'))
      .call(g => g.selectAll('line').attr('stroke', '#475569'))
      .call(g => g.select('.domain').attr('stroke', '#475569'));
    
    // Y Axis (right side - price scale)
    const yAxisGroup = g.append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(d3.axisRight(yScale).ticks(10).tickFormat(d => {
        const price = d as number;
        return price >= 1000 ? d3.format(',.0f')(price) : d3.format('.4f')(price);
      }))
      .call(g => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '11px'))
      .call(g => g.selectAll('line').attr('stroke', '#475569'))
      .call(g => g.select('.domain').attr('stroke', '#475569'));
    
    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .translateExtent([[-100, 0], [width + 100, height]])
      .on('zoom', (event) => {
        const transform = event.transform;
        
        // Update x scale based on zoom
        const newXScale = transform.rescaleX(xScale);
        xScaleRef.current = newXScale;
        
        // Recalculate y scale based on visible candles
        const visibleTimeRange = newXScale.domain();
        const visibleCandles = candles.filter(d => {
          const date = new Date(d.time);
          return date >= visibleTimeRange[0] && date <= visibleTimeRange[1];
        });
        
        if (visibleCandles.length > 0) {
          // Use manual Y domain if set (via refs for latest value), otherwise auto-calculate
          const useManualY = yAxisManualRef.current && manualYDomainRef.current;
          const newPriceExtent = useManualY 
            ? manualYDomainRef.current!
            : [
                d3.min(visibleCandles, d => d.low) as number * 0.999,
                d3.max(visibleCandles, d => d.high) as number * 1.001
              ];
          
          const newYScale = d3.scaleLinear()
            .domain(newPriceExtent)
            .range([innerHeight, 0]);
          if (!useManualY) newYScale.nice();
          yScaleRef.current = newYScale;
          
          // Update axes
          xAxisGroup.call(d3.axisBottom(newXScale).ticks(8).tickFormat(d => {
            const date = d as Date;
            if (interval === '1d' || interval === '4h') {
              return d3.timeFormat('%b %d')(date);
            }
            return d3.timeFormat('%b %d %H:%M')(date);
          }))
          .call(g => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '11px'))
          .call(g => g.selectAll('line').attr('stroke', '#475569'))
          .call(g => g.select('.domain').attr('stroke', '#475569'));
          
          yAxisGroup.call(d3.axisRight(newYScale).ticks(10).tickFormat(d => {
            const price = d as number;
            return price >= 1000 ? d3.format(',.0f')(price) : d3.format('.4f')(price);
          }))
          .call(g => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '11px'))
          .call(g => g.selectAll('line').attr('stroke', '#475569'))
          .call(g => g.select('.domain').attr('stroke', '#475569'));
          
          // Redraw candles
          drawCandles(newXScale, newYScale);
          
          // Update grid lines
          g.select('.grid-y').selectAll('line').remove();
          g.select('.grid-y')
            .selectAll('line')
            .data(newYScale.ticks(10))
            .enter()
            .append('line')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', d => newYScale(d))
            .attr('y2', d => newYScale(d))
            .attr('stroke', '#1e293b')
            .attr('stroke-width', 1);
          
          // Update current price line and label
          const lastCandle = candles[candles.length - 1];
          if (lastCandle) {
            const priceLineColor = lastCandle.close >= lastCandle.open ? '#22c55e' : '#ef4444';
            g.select('.current-price-line')
              .attr('y1', newYScale(lastCandle.close))
              .attr('y2', newYScale(lastCandle.close));
            g.select('.current-price-rect')
              .attr('y', newYScale(lastCandle.close) - 10);
            g.select('.current-price-text')
              .attr('y', newYScale(lastCandle.close) + 4);
          }
          
          // Trigger React re-render for trendlines
          setZoomVersion(v => v + 1);
        }
      });
    
    zoomRef.current = zoom;
    svg.call(zoom);
    
    // Current price line
    const lastCandle = candles[candles.length - 1];
    if (lastCandle) {
      const priceLineColor = lastCandle.close >= lastCandle.open ? '#22c55e' : '#ef4444';
      
      // Dashed horizontal line at current price
      g.append('line')
        .attr('class', 'current-price-line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(lastCandle.close))
        .attr('y2', yScale(lastCandle.close))
        .attr('stroke', priceLineColor)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.7);
      
      // Price label on right
      g.append('rect')
        .attr('class', 'current-price-rect')
        .attr('x', innerWidth + 2)
        .attr('y', yScale(lastCandle.close) - 10)
        .attr('width', 70)
        .attr('height', 20)
        .attr('fill', priceLineColor)
        .attr('rx', 3);
      
      g.append('text')
        .attr('class', 'current-price-text')
        .attr('x', innerWidth + 37)
        .attr('y', yScale(lastCandle.close) + 4)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', '11px')
        .attr('font-weight', 'bold')
        .text(lastCandle.close >= 1000 ? d3.format(',.2f')(lastCandle.close) : d3.format('.4f')(lastCandle.close));
    }
    
  }, [candles, dimensions, margin.left, margin.right, margin.top, margin.bottom, interval, zoomVersion, xAxisManual, yAxisManual]);
  
  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }
  
  // Non-admin users shouldn't see this page
  if (!isAdmin) {
    return null;
  }
  
  return (
    <div className="h-screen bg-slate-900 text-white overflow-hidden flex flex-col">
      {/* Header Controls */}
      <div className="p-4 border-b border-slate-700 flex items-center gap-4 flex-shrink-0">
        <h1 className="text-xl font-bold text-blue-400">Sandbox Chart</h1>
        
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-32 bg-slate-800 border-slate-600" data-testid="select-symbol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SYMBOLS.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={interval} onValueChange={setInterval}>
          <SelectTrigger className="w-24 bg-slate-800 border-slate-600" data-testid="select-interval">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERVALS.map(i => (
              <SelectItem key={i} value={i}>{i}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button 
          onClick={fetchCandles} 
          variant="outline" 
          className="bg-slate-800 border-slate-600 hover:bg-slate-700"
          data-testid="btn-refresh"
        >
          Refresh
        </Button>
        
        <div className="ml-auto text-sm text-slate-400">
          {candles.length} candles loaded
        </div>
      </div>
      
      {/* Chart Container */}
      <div 
        ref={containerRef} 
        className="w-full flex-1 overflow-hidden"
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="relative w-full h-full chart-background" onClick={handleChartBackgroundClick}>
            <svg 
              ref={svgRef} 
              width={dimensions.width} 
              height={dimensions.height}
              style={{ display: 'block' }}
              className="chart-background"
              data-testid="sandbox-chart"
            />
            
            {/* Y-axis drag zone (right side) for zoom control */}
            <div
              className="absolute cursor-ns-resize z-[50]"
              style={{ 
                right: 0, 
                top: margin.top, 
                width: margin.right, 
                height: dimensions.height - margin.top - margin.bottom,
                background: yAxisManual ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                touchAction: 'none'
              }}
              onMouseDown={(e) => {
                if (!yScaleRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                const domain = yScaleRef.current.domain() as [number, number];
                yAxisDragRef.current = { startY: e.clientY, startDomain: domain };
                setManualYDomain(domain);
                setYAxisManual(true);
              }}
              onTouchStart={(e) => {
                if (!yScaleRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                const touch = e.touches[0];
                const domain = yScaleRef.current.domain() as [number, number];
                console.log('Y-axis touchStart, domain:', domain);
                yAxisDragRef.current = { startY: touch.clientY, startDomain: domain };
                setManualYDomain(domain);
                setYAxisManual(true);
              }}
              onDoubleClick={() => {
                setYAxisManual(false);
                setManualYDomain(null);
                setZoomVersion(v => v + 1);
              }}
              title={yAxisManual ? "Drag to zoom, double-click to auto-scale" : "Drag to zoom"}
            />
            
            {/* X-axis drag zone (bottom) for zoom control */}
            <div
              className="absolute cursor-ew-resize z-[50]"
              style={{ 
                left: margin.left, 
                bottom: 0, 
                width: dimensions.width - margin.left - margin.right, 
                height: margin.bottom,
                background: xAxisManual ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                touchAction: 'none'
              }}
              onMouseDown={(e) => {
                if (!xScaleRef.current) return;
                e.preventDefault();
                const domain = xScaleRef.current.domain() as [Date, Date];
                xAxisDragRef.current = { startX: e.clientX, startDomain: domain };
                setManualXDomain(domain);
                setXAxisManual(true);
              }}
              onTouchStart={(e) => {
                if (!xScaleRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                const touch = e.touches[0];
                const domain = xScaleRef.current.domain() as [Date, Date];
                console.log('X-axis touchStart, domain:', domain);
                xAxisDragRef.current = { startX: touch.clientX, startDomain: domain };
                setManualXDomain(domain);
                setXAxisManual(true);
              }}
              onDoubleClick={() => {
                setXAxisManual(false);
                setManualXDomain(null);
                setZoomVersion(v => v + 1);
              }}
              title={xAxisManual ? "Drag to zoom, double-click to auto-scale" : "Drag to zoom"}
            />
            
            {/* Top indicator dropdowns */}
            <div className="absolute top-2 left-14 flex gap-2 z-20">
              {/* Trend Tools Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-slate-700 text-sm font-medium transition-all" data-testid="dropdown-trend">
                    Trend <ChevronDown className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-slate-900 border-slate-700" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">EMA</Label>
                      <Switch checked={showEMA} onCheckedChange={setShowEMA} data-testid="switch-ema" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">SMA</Label>
                      <Switch checked={showSMA} onCheckedChange={setShowSMA} data-testid="switch-sma" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Supertrend</Label>
                      <Switch checked={showSupertrend} onCheckedChange={setShowSupertrend} data-testid="switch-supertrend" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Ichimoku</Label>
                      <Switch checked={showIchimoku} onCheckedChange={setShowIchimoku} data-testid="switch-ichimoku" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Bollinger Bands</Label>
                      <Switch checked={showBollingerBands} onCheckedChange={setShowBollingerBands} data-testid="switch-bb" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* SMC Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-slate-700 text-sm font-medium transition-all" data-testid="dropdown-smc">
                    SMC <ChevronDown className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-slate-900 border-slate-700" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">BOS</Label>
                      <Switch checked={showBOS} onCheckedChange={setShowBOS} data-testid="switch-bos" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">CHoCH</Label>
                      <Switch checked={showCHoCH} onCheckedChange={setShowCHoCH} data-testid="switch-choch" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">FVG</Label>
                      <Switch checked={showFVG} onCheckedChange={setShowFVG} data-testid="switch-fvg" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Order Blocks</Label>
                      <Switch checked={showOrderBlocks} onCheckedChange={setShowOrderBlocks} data-testid="switch-ob" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Swing Pivots</Label>
                      <Switch checked={showSwingPivots} onCheckedChange={setShowSwingPivots} data-testid="switch-pivots" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* VWAP Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-slate-700 text-sm font-medium transition-all" data-testid="dropdown-vwap">
                    VWAP <ChevronDown className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-slate-900 border-slate-700" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Session VWAP</Label>
                      <Switch checked={showVWAPSession} onCheckedChange={setShowVWAPSession} data-testid="switch-vwap-session" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Daily VWAP</Label>
                      <Switch checked={showVWAPDaily} onCheckedChange={setShowVWAPDaily} data-testid="switch-vwap-daily" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Weekly VWAP</Label>
                      <Switch checked={showVWAPWeekly} onCheckedChange={setShowVWAPWeekly} data-testid="switch-vwap-weekly" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">VWAP Bands</Label>
                      <Switch checked={showVWAPBands} onCheckedChange={setShowVWAPBands} data-testid="switch-vwap-bands" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Oscillators Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-slate-700 text-sm font-medium transition-all" data-testid="dropdown-osc">
                    OSC <ChevronDown className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-slate-900 border-slate-700" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">RSI</Label>
                      <Switch checked={showRSI} onCheckedChange={setShowRSI} data-testid="switch-rsi" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">MACD</Label>
                      <Switch checked={showMACD} onCheckedChange={setShowMACD} data-testid="switch-macd" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">MFI</Label>
                      <Switch checked={showMFI} onCheckedChange={setShowMFI} data-testid="switch-mfi" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">ADX</Label>
                      <Switch checked={showADX} onCheckedChange={setShowADX} data-testid="switch-adx" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Left toolbar - drawing tools */}
            <div className="absolute top-2 left-2 flex flex-col gap-1 z-[60] bg-slate-900/80 rounded-lg p-1" data-toolbar="drawing">
              {/* Crosshair toggle button - mobile only */}
              <button
                onClick={() => {
                  setCrosshairMode(prev => !prev);
                  if (crosshairMode) setCrosshairPos(null);
                  setActiveTool(null);
                }}
                className={`p-2 rounded transition-all md:hidden ${
                  crosshairMode 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Crosshair"
                data-testid="btn-crosshair"
              >
                <Crosshair className="w-5 h-5" />
              </button>
              
              {/* Undo button */}
              <button
                onClick={undo}
                disabled={!canUndo}
                className={`p-2 rounded transition-all ${
                  canUndo 
                    ? 'bg-transparent text-gray-300 hover:bg-slate-700' 
                    : 'bg-transparent text-gray-600 cursor-not-allowed'
                }`}
                title="Undo"
                data-testid="btn-undo"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 8h9a4 4 0 014 4v0a4 4 0 01-4 4H9M4 8l3-3M4 8l3 3" />
                </svg>
              </button>
              
              {/* Redo button */}
              <button
                onClick={redo}
                disabled={!canRedo}
                className={`p-2 rounded transition-all ${
                  canRedo 
                    ? 'bg-transparent text-gray-300 hover:bg-slate-700' 
                    : 'bg-transparent text-gray-600 cursor-not-allowed'
                }`}
                title="Redo"
                data-testid="btn-redo"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 8H7a4 4 0 00-4 4v0a4 4 0 004 4h4M16 8l-3-3M16 8l-3 3" />
                </svg>
              </button>
              
              <div className="h-px bg-slate-600 my-1" />
              
              {/* Trend Line - single click to activate */}
              <button
                onClick={() => {
                  if (activeTool === 'trendline') {
                    setActiveTool(null);
                    setTrendlineMode(null);
                    setTrendlinePoints([]);
                  } else {
                    setActiveTool('trendline');
                    setTrendlineMode('magnet'); // Always use combined mode
                  }
                }}
                className={`p-2 rounded transition-all ${
                  activeTool === 'trendline' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Trend Line"
                data-testid="btn-trendline"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="17" x2="17" y2="3" />
                </svg>
              </button>
              
              {/* Horizontal Line */}
              <button
                onClick={() => setActiveTool(activeTool === 'horizontal' ? null : 'horizontal')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'horizontal' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Horizontal Line"
                data-testid="btn-horizontal"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="2" y1="10" x2="18" y2="10" />
                </svg>
              </button>
              
              {/* Channel */}
              <button
                onClick={() => setActiveTool(activeTool === 'channel' ? null : 'channel')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'channel' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Channel"
                data-testid="btn-channel"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="14" x2="18" y2="6" />
                  <line x1="2" y1="18" x2="18" y2="10" strokeDasharray="2,2" />
                </svg>
              </button>
              
              {/* Fib Retracement */}
              <button
                onClick={() => setActiveTool(activeTool === 'fibretracement' ? null : 'fibretracement')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'fibretracement' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Fib Retracement"
                data-testid="btn-fibretracement"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="3" x2="18" y2="3" />
                  <line x1="2" y1="7" x2="18" y2="7" strokeOpacity="0.7" />
                  <line x1="2" y1="10" x2="18" y2="10" strokeOpacity="0.5" />
                  <line x1="2" y1="13" x2="18" y2="13" strokeOpacity="0.7" />
                  <line x1="2" y1="17" x2="18" y2="17" />
                </svg>
              </button>
              
              {/* Trend-based Fib */}
              <button
                onClick={() => setActiveTool(activeTool === 'trendfib' ? null : 'trendfib')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'trendfib' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Trend-based Fib"
                data-testid="btn-trendfib"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="3" y1="17" x2="10" y2="3" strokeWidth="2" />
                  <line x1="10" y1="3" x2="17" y2="12" strokeWidth="2" />
                  <line x1="3" y1="8" x2="17" y2="8" strokeOpacity="0.5" strokeDasharray="2,1" />
                  <line x1="3" y1="12" x2="17" y2="12" strokeOpacity="0.5" strokeDasharray="2,1" />
                </svg>
              </button>
              
              {/* Label/Text */}
              <button
                onClick={() => setActiveTool(activeTool === 'label' ? null : 'label')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'label' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Label/Text"
                data-testid="btn-label"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                  <text x="3" y="15" fontSize="12" fontWeight="bold">T</text>
                </svg>
              </button>
              
              <div className="h-px bg-slate-600 my-1" />
              
              {/* Impulse (12345) */}
              <button
                onClick={() => setActiveTool(activeTool === 'impulse' ? null : 'impulse')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'impulse' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Impulse (12345)"
                data-testid="btn-impulse"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="2,16 5,10 7,12 12,3 15,8 18,4" strokeLinejoin="round" />
                  <circle cx="5" cy="10" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="3" r="1.5" fill="currentColor" />
                </svg>
              </button>
              
              {/* ABC */}
              <button
                onClick={() => setActiveTool(activeTool === 'abc' ? null : 'abc')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'abc' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="ABC Correction"
                data-testid="btn-abc"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="2,5 10,15 18,3" strokeLinejoin="round" />
                  <text x="1" y="4" fontSize="5" fill="currentColor" stroke="none">A</text>
                  <text x="8" y="18" fontSize="5" fill="currentColor" stroke="none">B</text>
                  <text x="15" y="4" fontSize="5" fill="currentColor" stroke="none">C</text>
                </svg>
              </button>
              
              {/* WXY */}
              <button
                onClick={() => setActiveTool(activeTool === 'wxy' ? null : 'wxy')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'wxy' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="WXY"
                data-testid="btn-wxy"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                  <text x="1" y="14" fontSize="7" fontWeight="bold">WXY</text>
                </svg>
              </button>
              
              {/* ABCDE */}
              <button
                onClick={() => setActiveTool(activeTool === 'abcde' ? null : 'abcde')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'abcde' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="ABCDE Triangle"
                data-testid="btn-abcde"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polygon points="10,2 2,16 18,16" strokeLinejoin="round" />
                  <line x1="4" y1="12" x2="16" y2="12" strokeOpacity="0.5" />
                </svg>
              </button>
              
              {/* WXYXZ */}
              <button
                onClick={() => setActiveTool(activeTool === 'wxyxz' ? null : 'wxyxz')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'wxyxz' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="WXYXZ"
                data-testid="btn-wxyxz"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                  <text x="0" y="8" fontSize="5" fontWeight="bold">WXY</text>
                  <text x="3" y="15" fontSize="5" fontWeight="bold">XZ</text>
                </svg>
              </button>
            </div>
            {/* Crosshair overlay - only captures events when crosshair mode enabled */}
            <div 
              className="absolute inset-0"
              style={{ pointerEvents: crosshairMode ? 'auto' : 'none' }}
              onMouseMove={(e) => {
                if (crosshairMode) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setCrosshairPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }
              }}
              onTouchStart={(e) => {
                if (crosshairMode && e.touches[0]) {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  // Store where the touch started
                  touchStartRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
                  // Store where crosshair currently is (or center if not set)
                  crosshairStartRef.current = crosshairPos || { 
                    x: dimensions.width / 2, 
                    y: dimensions.height / 2 
                  };
                  touchMovedRef.current = false;
                  // If no crosshair yet, initialize at center
                  if (!crosshairPos) {
                    setCrosshairPos({ x: dimensions.width / 2, y: dimensions.height / 2 });
                  }
                }
              }}
              onTouchMove={(e) => {
                if (crosshairMode && e.touches[0] && touchStartRef.current && crosshairStartRef.current) {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  // Calculate how much the finger moved
                  const deltaX = (touch.clientX - rect.left) - touchStartRef.current.x;
                  const deltaY = (touch.clientY - rect.top) - touchStartRef.current.y;
                  // Check if moved beyond threshold
                  if (Math.abs(deltaX) > TOUCH_THRESHOLD || Math.abs(deltaY) > TOUCH_THRESHOLD) {
                    touchMovedRef.current = true;
                  }
                  // Move crosshair by that delta from its starting position
                  const newX = Math.max(margin.left, Math.min(dimensions.width - margin.right, crosshairStartRef.current.x + deltaX));
                  const newY = Math.max(margin.top, Math.min(dimensions.height - margin.bottom, crosshairStartRef.current.y + deltaY));
                  setCrosshairPos({ x: newX, y: newY });
                }
              }}
              onTouchEnd={() => {
                // Only handle as tap if didn't move significantly
                if (crosshairMode && crosshairPos && !touchMovedRef.current && !activeTool) {
                  // Check for move mode - place point or pick endpoint
                  if (movingPoint) {
                    placeMovingPoint(crosshairPos.x, crosshairPos.y);
                  } else if (moveMode && movingTrendline) {
                    // Find nearby endpoint to pick up
                    const endpoint = findNearbyEndpoint(crosshairPos.x, crosshairPos.y);
                    if (endpoint) {
                      handleEndpointClick(movingTrendline, endpoint);
                    }
                  } else {
                    // Try to select a trendline
                    const nearbyLine = findNearbyTrendline(crosshairPos.x, crosshairPos.y);
                    if (nearbyLine) {
                      handleTrendlineSelect(nearbyLine, crosshairPos.x, crosshairPos.y);
                    } else {
                      // Tap on empty space - close any open menu
                      closeTrendlineMenu();
                    }
                  }
                }
                // Clear touch tracking on end
                touchStartRef.current = null;
                crosshairStartRef.current = null;
                touchMovedRef.current = false;
              }}
            >
              {/* Crosshair lines */}
              {crosshairMode && crosshairPos && (
                <>
                  {/* Vertical line */}
                  <div 
                    className="absolute top-0 bottom-0 w-px bg-gray-400 pointer-events-none"
                    style={{ left: crosshairPos.x }}
                  />
                  {/* Horizontal line */}
                  <div 
                    className="absolute left-0 right-0 h-px bg-gray-400 pointer-events-none"
                    style={{ top: crosshairPos.y }}
                  />
                  {/* Price label */}
                  {yScaleRef.current && crosshairPos.y > margin.top && crosshairPos.y < dimensions.height - margin.bottom && (
                    <div 
                      className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none"
                      style={{ 
                        right: 4, 
                        top: crosshairPos.y - 10,
                      }}
                    >
                      {(() => {
                        const price = yScaleRef.current?.invert(crosshairPos.y - margin.top);
                        return price ? (price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : price.toFixed(4)) : '';
                      })()}
                    </div>
                  )}
                  {/* Time label */}
                  {xScaleRef.current && crosshairPos.x > margin.left && crosshairPos.x < dimensions.width - margin.right && (
                    <div 
                      className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none"
                      style={{ 
                        left: crosshairPos.x - 40, 
                        bottom: 4,
                      }}
                    >
                      {(() => {
                        const date = xScaleRef.current?.invert(crosshairPos.x - margin.left);
                        return date ? d3.timeFormat('%b %d %H:%M')(date) : '';
                      })()}
                    </div>
                  )}
                  {/* Crosshair active indicator - positioned below dropdowns */}
                  <div className="absolute top-14 left-14 bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                    Crosshair Mode (click button to exit)
                  </div>
                </>
              )}
            </div>
            
            {/* Trendline drawing overlay */}
            {activeTool === 'trendline' && trendlineMode && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ pointerEvents: 'auto' }}
                data-drawing-overlay
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = crosshairMode && crosshairPos ? crosshairPos.x : e.clientX - rect.left;
                  const clickY = crosshairMode && crosshairPos ? crosshairPos.y : e.clientY - rect.top;
                  showClickPulse(clickX, clickY);
                  handleTrendlineClick(clickX, clickY);
                }}
                onTouchStart={(e) => {
                  if (crosshairMode && crosshairPos) {
                    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                    crosshairStartRef.current = { x: crosshairPos.x, y: crosshairPos.y };
                    touchMovedRef.current = false;
                  }
                }}
                onTouchMove={(e) => {
                  if (crosshairMode && touchStartRef.current && crosshairStartRef.current) {
                    e.preventDefault();
                    const touch = e.touches[0];
                    const deltaX = touch.clientX - touchStartRef.current.x;
                    const deltaY = touch.clientY - touchStartRef.current.y;
                    // Check if moved beyond threshold
                    if (Math.abs(deltaX) > TOUCH_THRESHOLD || Math.abs(deltaY) > TOUCH_THRESHOLD) {
                      touchMovedRef.current = true;
                    }
                    const newX = Math.max(margin.left, Math.min(dimensions.width - margin.right, crosshairStartRef.current.x + deltaX));
                    const newY = Math.max(margin.top, Math.min(dimensions.height - margin.bottom, crosshairStartRef.current.y + deltaY));
                    setCrosshairPos({ x: newX, y: newY });
                  }
                }}
                onTouchEnd={(e) => {
                  // Only trigger click if touch didn't move significantly (was a tap)
                  if (crosshairMode && crosshairPos && !touchMovedRef.current) {
                    e.preventDefault();
                    handleTrendlineClick(crosshairPos.x, crosshairPos.y);
                  }
                  touchStartRef.current = null;
                  crosshairStartRef.current = null;
                  touchMovedRef.current = false;
                }}
              >
                {/* Magnet pulse animation */}
                {magnetPulse && (
                  <div 
                    className="absolute pointer-events-none"
                    style={{ 
                      left: magnetPulse.x - MAGNET_RADIUS, 
                      top: magnetPulse.y - MAGNET_RADIUS,
                      width: MAGNET_RADIUS * 2,
                      height: MAGNET_RADIUS * 2,
                    }}
                  >
                    <div 
                      className="w-full h-full rounded-full border-2 border-white animate-ping"
                      style={{ animationDuration: '0.4s' }}
                    />
                  </div>
                )}
                
                {/* First point marker */}
                {trendlinePoints.length === 1 && (
                  <div 
                    className="absolute w-3 h-3 bg-yellow-400 rounded-full pointer-events-none"
                    style={{ 
                      left: trendlinePoints[0].x - 6, 
                      top: trendlinePoints[0].y - 6,
                    }}
                  />
                )}
                
                {/* Preview line from first point to crosshair/cursor */}
                {trendlinePoints.length === 1 && crosshairMode && crosshairPos && (
                  <svg className="absolute inset-0 pointer-events-none overflow-visible">
                    <line 
                      x1={trendlinePoints[0].x}
                      y1={trendlinePoints[0].y}
                      x2={crosshairPos.x}
                      y2={crosshairPos.y}
                      stroke="#facc15"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                    />
                  </svg>
                )}
                
                {/* Mode indicator */}
                <div className="absolute top-14 left-14 bg-yellow-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                  {trendlinePoints.length === 0 ? 'Click for 1st point' : 'Click for 2nd point'}
                </div>
              </div>
            )}
            
            
            {/* Overlay for whole-line move mode - click to place line */}
            {movingWholeLine && (
              <div 
                className="absolute inset-0 z-40 cursor-crosshair"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  moveWholeLine(e.clientX - rect.left, e.clientY - rect.top);
                }}
              />
            )}
            
            {/* Render drawn trendlines - clickable with selection */}
            {/* zoomVersion ensures re-render on zoom/pan */}
            <svg 
              className="absolute inset-0 overflow-visible z-30" 
              data-zoom={zoomVersion}
              style={{ pointerEvents: activeTool === 'trendline' ? 'none' : 'auto' }}
            >
              {drawnTrendlines.map((line) => {
                if (!xScaleRef.current || !yScaleRef.current) return null;
                let x1 = xScaleRef.current(new Date(line.p1.time)) + margin.left;
                let y1 = yScaleRef.current(line.p1.price) + margin.top;
                let x2 = xScaleRef.current(new Date(line.p2.time)) + margin.left;
                let y2 = yScaleRef.current(line.p2.price) + margin.top;
                
                // Chart boundaries
                const chartLeft = margin.left;
                const chartRight = dimensions.width - margin.right;
                const chartTop = margin.top;
                const chartBottom = dimensions.height - margin.bottom;
                
                // Function to clip line to chart boundaries
                const clipToChart = (px1: number, py1: number, px2: number, py2: number) => {
                  const dx = px2 - px1;
                  const dy = py2 - py1;
                  let t0 = 0, t1 = 1;
                  
                  // Clip against each boundary
                  const clip = (p: number, q: number) => {
                    if (p === 0) return q >= 0;
                    const r = q / p;
                    if (p < 0) {
                      if (r > t1) return false;
                      if (r > t0) t0 = r;
                    } else {
                      if (r < t0) return false;
                      if (r < t1) t1 = r;
                    }
                    return true;
                  };
                  
                  if (!clip(-dx, px1 - chartLeft)) return null;
                  if (!clip(dx, chartRight - px1)) return null;
                  if (!clip(-dy, py1 - chartTop)) return null;
                  if (!clip(dy, chartBottom - py1)) return null;
                  
                  return {
                    x1: px1 + t0 * dx,
                    y1: py1 + t0 * dy,
                    x2: px1 + t1 * dx,
                    y2: py1 + t1 * dy
                  };
                };
                
                // Calculate extended line coordinates
                const dx = x2 - x1;
                const dy = y2 - y1;
                const extendAmount = 2000; // pixels to extend
                let extX1 = x1, extY1 = y1, extX2 = x2, extY2 = y2;
                if (line.extendLeft && (dx !== 0 || dy !== 0)) {
                  const ratio = extendAmount / Math.sqrt(dx * dx + dy * dy);
                  extX1 = x1 - dx * ratio;
                  extY1 = y1 - dy * ratio;
                  // Clip to chart boundaries
                  const clipped = clipToChart(extX1, extY1, x1, y1);
                  if (clipped) {
                    extX1 = clipped.x1;
                    extY1 = clipped.y1;
                  }
                }
                if (line.extendRight && (dx !== 0 || dy !== 0)) {
                  const ratio = extendAmount / Math.sqrt(dx * dx + dy * dy);
                  extX2 = x2 + dx * ratio;
                  extY2 = y2 + dy * ratio;
                  // Clip to chart boundaries
                  const clipped = clipToChart(x2, y2, extX2, extY2);
                  if (clipped) {
                    extX2 = clipped.x2;
                    extY2 = clipped.y2;
                  }
                }
                
                const isSelected = selectedTrendline === line.id;
                const strokeDash = line.lineStyle === 'dashed' ? '8,4' : line.lineStyle === 'dotted' ? '2,4' : 'none';
                
                return (
                  <g key={line.id}>
                    {/* Extended line parts - matches main line style exactly */}
                    {line.extendLeft && (
                      <line 
                        x1={extX1} y1={extY1} x2={x1} y2={y1}
                        stroke={line.color}
                        strokeWidth={line.thickness || 2}
                        strokeOpacity={line.opacity}
                        strokeDasharray={strokeDash}
                      />
                    )}
                    {line.extendRight && (
                      <line 
                        x1={x2} y1={y2} x2={extX2} y2={extY2}
                        stroke={line.color}
                        strokeWidth={line.thickness || 2}
                        strokeOpacity={line.opacity}
                        strokeDasharray={strokeDash}
                      />
                    )}
                    
                    {/* Main line - clickable with invisible wider hit area */}
                    <line 
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="transparent"
                      strokeWidth="12"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTrendlineSelect(line.id, e.clientX - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().left || 0), e.clientY - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().top || 0));
                      }}
                    />
                    <line 
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={line.color}
                      strokeWidth={line.thickness || 2}
                      strokeOpacity={line.opacity}
                      strokeDasharray={strokeDash}
                      style={{ pointerEvents: 'none' }}
                    />
                    
                    {/* Endpoint circles and center point - visible when selected */}
                    {(isSelected || (moveMode && movingTrendline === line.id)) && (
                      <>
                        {/* Endpoint 1 - larger invisible hit area + visible circle */}
                        <circle 
                          cx={x1} cy={y1} r={moveMode ? 20 : 5} 
                          fill="transparent"
                          style={{ cursor: moveMode ? 'pointer' : 'default' }}
                          onClick={(e) => {
                            if (moveMode) {
                              e.stopPropagation();
                              handleEndpointClick(line.id, 'p1');
                            }
                          }}
                        />
                        <circle 
                          cx={x1} cy={y1} r={moveMode ? 8 : 5} 
                          fill={line.color} stroke="white" strokeWidth="2"
                          style={{ pointerEvents: 'none' }}
                        />
                        {/* Center point - larger invisible hit area + visible circle */}
                        <circle 
                          cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={18}
                          fill="transparent"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (movingWholeLine === line.id) {
                              setMovingWholeLine(null);
                            } else {
                              setMovingWholeLine(line.id);
                              setTrendlineMenuPos(null);
                            }
                          }}
                        />
                        <circle 
                          cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={movingWholeLine === line.id ? 8 : 6}
                          fill={movingWholeLine === line.id ? '#22c55e' : 'white'} 
                          stroke={line.color} strokeWidth="2"
                          style={{ pointerEvents: 'none' }}
                        />
                        {/* Endpoint 2 - larger invisible hit area + visible circle */}
                        <circle 
                          cx={x2} cy={y2} r={moveMode ? 20 : 5} 
                          fill="transparent"
                          style={{ cursor: moveMode ? 'pointer' : 'default' }}
                          onClick={(e) => {
                            if (moveMode) {
                              e.stopPropagation();
                              handleEndpointClick(line.id, 'p2');
                            }
                          }}
                        />
                        <circle 
                          cx={x2} cy={y2} r={moveMode ? 8 : 5} 
                          fill={line.color} stroke="white" strokeWidth="2"
                          style={{ pointerEvents: 'none' }}
                        />
                      </>
                    )}
                    
                    {/* Labels if set - render at each selected position */}
                    {line.label?.positions?.map(pos => (
                      <text
                        key={pos}
                        x={pos.includes('left') ? x1 : x2}
                        y={pos.includes('top') 
                          ? (pos.includes('left') ? y1 : y2) - 10 
                          : (pos.includes('left') ? y1 : y2) + 20}
                        fill={line.color}
                        fontSize="12"
                        textAnchor="middle"
                      >
                        {line.label.text}
                      </text>
                    ))}
                  </g>
                );
              })}
              
              {/* Render horizontal lines */}
              {drawnHorizontals.map((line) => {
                if (!yScaleRef.current) return null;
                const y = yScaleRef.current(line.price) + margin.top;
                const isSelected = selectedHorizontal === line.id;
                const strokeDash = line.lineStyle === 'dashed' ? '8,4' : line.lineStyle === 'dotted' ? '2,4' : 'none';
                
                return (
                  <g key={line.id}>
                    {/* Invisible hit area */}
                    <line 
                      x1={margin.left} y1={y} x2={dimensions.width - margin.right} y2={y}
                      stroke="transparent"
                      strokeWidth="12"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHorizontalSelect(line.id, e.clientX - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().left || 0), e.clientY - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().top || 0));
                      }}
                    />
                    {/* Visible line */}
                    <line 
                      x1={margin.left} y1={y} x2={dimensions.width - margin.right} y2={y}
                      stroke={line.color}
                      strokeWidth={line.thickness || 2}
                      strokeOpacity={line.opacity}
                      strokeDasharray={strokeDash}
                      style={{ pointerEvents: 'none' }}
                    />
                    {/* Selection indicator */}
                    {isSelected && (
                      <>
                        <circle cx={margin.left + 20} cy={y} r={5} fill={line.color} stroke="white" strokeWidth="2" />
                        <circle cx={dimensions.width - margin.right - 20} cy={y} r={5} fill={line.color} stroke="white" strokeWidth="2" />
                      </>
                    )}
                    {/* Label if set */}
                    {line.label && (
                      <text
                        x={line.label.position === 'left' ? margin.left + 5 : dimensions.width - margin.right - 5}
                        y={y - 5}
                        fill={line.color}
                        fontSize="11"
                        textAnchor={line.label.position === 'left' ? 'start' : 'end'}
                      >
                        {line.label.text}
                      </text>
                    )}
                  </g>
                );
              })}
              
              {/* Render channels */}
              {drawnChannels.map((channel) => {
                if (!xScaleRef.current || !yScaleRef.current) return null;
                const x1 = xScaleRef.current(new Date(channel.p1.time)) + margin.left;
                const y1 = yScaleRef.current(channel.p1.price) + margin.top;
                const x2 = xScaleRef.current(new Date(channel.p2.time)) + margin.left;
                const y2 = yScaleRef.current(channel.p2.price) + margin.top;
                
                const isSelected = selectedChannel === channel.id;
                const strokeDash = channel.lineStyle === 'dashed' ? '8,4' : channel.lineStyle === 'dotted' ? '2,4' : 'none';
                const internalDash = channel.internalLineStyle === 'dashed' ? '8,4' : channel.internalLineStyle === 'dotted' ? '2,4' : 'none';
                
                // Calculate perpendicular offset for channel width
                const dx = x2 - x1;
                const dy = y2 - y1;
                const len = Math.sqrt(dx * dx + dy * dy);
                const perpX = len > 0 ? (-dy / len) * 50 : 0;
                const perpY = len > 0 ? (dx / len) * 50 : 50;
                
                return (
                  <g key={channel.id}>
                    {/* Top line */}
                    {channel.showExternalLines && (
                      <line x1={x1 + perpX} y1={y1 + perpY} x2={x2 + perpX} y2={y2 + perpY}
                        stroke={channel.color} strokeWidth={channel.thickness} strokeOpacity={channel.opacity} strokeDasharray={strokeDash}
                      />
                    )}
                    {/* Bottom line */}
                    {channel.showExternalLines && (
                      <line x1={x1 - perpX} y1={y1 - perpY} x2={x2 - perpX} y2={y2 - perpY}
                        stroke={channel.color} strokeWidth={channel.thickness} strokeOpacity={channel.opacity} strokeDasharray={strokeDash}
                      />
                    )}
                    {/* Center line (main) */}
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={channel.color} strokeWidth={channel.thickness} strokeOpacity={channel.opacity} strokeDasharray={strokeDash}
                    />
                    {/* Internal lines */}
                    {channel.internalLines.filter(il => il.visible).map((il, idx) => {
                      const ratio = il.percent / 100;
                      return (
                        <g key={idx}>
                          <line 
                            x1={x1 + perpX * ratio} y1={y1 + perpY * ratio} 
                            x2={x2 + perpX * ratio} y2={y2 + perpY * ratio}
                            stroke={channel.internalLineColor} strokeWidth={1} strokeOpacity={channel.opacity * 0.7} strokeDasharray={internalDash}
                          />
                          <line 
                            x1={x1 - perpX * ratio} y1={y1 - perpY * ratio} 
                            x2={x2 - perpX * ratio} y2={y2 - perpY * ratio}
                            stroke={channel.internalLineColor} strokeWidth={1} strokeOpacity={channel.opacity * 0.7} strokeDasharray={internalDash}
                          />
                        </g>
                      );
                    })}
                    {/* Hit area */}
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="transparent" strokeWidth="20" style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChannelSelect(channel.id, e.clientX - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().left || 0), e.clientY - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().top || 0));
                      }}
                    />
                    {isSelected && (
                      <>
                        <circle cx={x1} cy={y1} r={6} fill={channel.color} stroke="white" strokeWidth="2" />
                        <circle cx={x2} cy={y2} r={6} fill={channel.color} stroke="white" strokeWidth="2" />
                      </>
                    )}
                  </g>
                );
              })}
              
              {/* Render text labels */}
              {drawnTextLabels.map((label) => {
                if (!xScaleRef.current || !yScaleRef.current) return null;
                const x = xScaleRef.current(new Date(label.time)) + margin.left;
                const y = yScaleRef.current(label.price) + margin.top;
                const isSelected = selectedTextLabel === label.id;
                
                return (
                  <g key={label.id} style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTextLabelSelect(label.id, e.clientX - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().left || 0), e.clientY - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().top || 0));
                    }}
                  >
                    {label.backgroundColor !== 'transparent' && (
                      <rect x={x - 5} y={y - label.fontSize} width={label.text.length * label.fontSize * 0.6 + 10} height={label.fontSize + 6}
                        fill={label.backgroundColor} rx="3" opacity={label.opacity}
                      />
                    )}
                    <text x={x} y={y} fill={label.color} fontSize={label.fontSize} opacity={label.opacity}>
                      {label.text}
                    </text>
                    {isSelected && (
                      <rect x={x - 8} y={y - label.fontSize - 3} width={label.text.length * label.fontSize * 0.6 + 16} height={label.fontSize + 12}
                        fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4,2" rx="3"
                      />
                    )}
                  </g>
                );
              })}
            </svg>
            
            {/* React hit layer for horizontal lines - above drawing overlays so always clickable */}
            {drawnHorizontals.map((line) => {
              if (!yScaleRef.current) return null;
              const y = yScaleRef.current(line.price) + margin.top;
              return (
                <div
                  key={`hit-${line.id}`}
                  className="absolute cursor-pointer z-[30]"
                  style={{
                    left: margin.left,
                    top: y - 6,
                    width: dimensions.width - margin.left - margin.right,
                    height: 12,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    showClickPulse(e.clientX - (e.currentTarget.parentElement?.getBoundingClientRect().left || 0), y);
                    handleHorizontalSelect(line.id, e.clientX - (e.currentTarget.parentElement?.getBoundingClientRect().left || 0), y);
                  }}
                />
              );
            })}
            
            {/* Horizontal line drawing overlay - magnet mode handled by handler */}
            {activeTool === 'horizontal' && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ pointerEvents: 'auto' }}
                data-drawing-overlay
                onMouseMove={(e) => {
                  if (crosshairMode) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setCrosshairPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseLeave={() => { if (crosshairMode) setCrosshairPos(null); }}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;
                  showClickPulse(clickX, clickY);
                  handleHorizontalClick(clickX, clickY);
                }}
              >
                {magnetPulse && (
                  <div className="absolute pointer-events-none" style={{ left: magnetPulse.x - MAGNET_RADIUS, top: magnetPulse.y - MAGNET_RADIUS, width: MAGNET_RADIUS * 2, height: MAGNET_RADIUS * 2 }}>
                    <div className="w-full h-full rounded-full border-2 border-white animate-ping" style={{ animationDuration: '0.4s' }} />
                  </div>
                )}
                <div className="absolute top-14 left-14 bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                  Click to place horizontal line
                </div>
              </div>
            )}
            
            {/* Channel drawing overlay - magnet mode handled by handler */}
            {activeTool === 'channel' && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ pointerEvents: 'auto' }}
                data-drawing-overlay
                onMouseMove={(e) => {
                  if (crosshairMode) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setCrosshairPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseLeave={() => { if (crosshairMode) setCrosshairPos(null); }}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;
                  showClickPulse(clickX, clickY);
                  handleChannelClick(clickX, clickY);
                }}
              >
                {magnetPulse && (
                  <div className="absolute pointer-events-none" style={{ left: magnetPulse.x - MAGNET_RADIUS, top: magnetPulse.y - MAGNET_RADIUS, width: MAGNET_RADIUS * 2, height: MAGNET_RADIUS * 2 }}>
                    <div className="w-full h-full rounded-full border-2 border-white animate-ping" style={{ animationDuration: '0.4s' }} />
                  </div>
                )}
                {channelPoints.length >= 1 && (
                  <div className="absolute w-3 h-3 bg-green-400 rounded-full pointer-events-none" style={{ left: channelPoints[0].x - 6, top: channelPoints[0].y - 6 }} />
                )}
                {channelPoints.length === 2 && (
                  <div className="absolute w-3 h-3 bg-green-400 rounded-full pointer-events-none" style={{ left: channelPoints[1].x - 6, top: channelPoints[1].y - 6 }} />
                )}
                {channelPoints.length >= 1 && crosshairMode && crosshairPos && (
                  <svg className="absolute inset-0 pointer-events-none overflow-visible">
                    {channelPoints.length === 1 && (
                      <line x1={channelPoints[0].x} y1={channelPoints[0].y} x2={channelPoints[0].x} y2={crosshairPos.y} stroke="#22c55e" strokeWidth="2" strokeDasharray="5,5" />
                    )}
                    {channelPoints.length === 2 && (
                      <line x1={channelPoints[0].x} y1={channelPoints[0].y} x2={crosshairPos.x} y2={crosshairPos.y} stroke="#22c55e" strokeWidth="2" strokeDasharray="5,5" />
                    )}
                  </svg>
                )}
                <div className="absolute top-14 left-14 bg-green-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                  {channelPoints.length === 0 ? 'Click for start point' : channelPoints.length === 1 ? 'Click for height' : 'Click for direction'}
                </div>
              </div>
            )}
            
            {/* Text label drawing overlay - magnet mode handled by handler */}
            {activeTool === 'label' && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ pointerEvents: 'auto' }}
                data-drawing-overlay
                onMouseMove={(e) => {
                  if (crosshairMode) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setCrosshairPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseLeave={() => { if (crosshairMode) setCrosshairPos(null); }}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;
                  showClickPulse(clickX, clickY);
                  handleTextLabelClick(clickX, clickY);
                }}
              >
                {magnetPulse && (
                  <div className="absolute pointer-events-none" style={{ left: magnetPulse.x - MAGNET_RADIUS, top: magnetPulse.y - MAGNET_RADIUS, width: MAGNET_RADIUS * 2, height: MAGNET_RADIUS * 2 }}>
                    <div className="w-full h-full rounded-full border-2 border-white animate-ping" style={{ animationDuration: '0.4s' }} />
                  </div>
                )}
                <div className="absolute top-14 left-14 bg-purple-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                  Click to place text label
                </div>
              </div>
            )}
            
            {/* Trendline action menu */}
            {trendlineMenuPos && selectedTrendline && (
              <div 
                className="absolute flex flex-col gap-1 bg-slate-800 border border-slate-600 rounded-b rounded-t-sm z-50"
                style={{ left: trendlineMenuPos.x, top: trendlineMenuPos.y }}
                data-menu="trendline"
              >
                {/* Drag handle */}
                <div 
                  className="h-2 bg-slate-600 rounded-t-sm cursor-grab active:cursor-grabbing flex items-center justify-center hover:bg-slate-500 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDraggingMenu(true);
                    menuDragOffset.current = {
                      x: e.clientX - trendlineMenuPos.x,
                      y: e.clientY - trendlineMenuPos.y
                    };
                  }}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    setDraggingMenu(true);
                    menuDragOffset.current = {
                      x: touch.clientX - trendlineMenuPos.x,
                      y: touch.clientY - trendlineMenuPos.y
                    };
                  }}
                >
                  <div className="w-6 h-0.5 bg-slate-400 rounded" />
                </div>
                <div className="p-1 flex flex-col gap-1">
                {/* Delete */}
                <button
                  onClick={deleteTrendline}
                  className="p-2 hover:bg-slate-700 rounded text-red-400"
                  title="Delete"
                >
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h12M6 6v10a2 2 0 002 2h4a2 2 0 002-2V6M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                  </svg>
                </button>
                
                {/* Colour */}
                <button
                  onClick={() => setActiveSubmenu(activeSubmenu === 'color' ? null : 'color')}
                  className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'color' ? 'bg-slate-600' : ''}`}
                  title="Colour"
                >
                  {(() => {
                    const selectedLine = drawnTrendlines.find(l => l.id === selectedTrendline);
                    return (
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="10" cy="10" r="7" />
                        <circle cx="10" cy="10" r="3" fill={selectedLine?.color || 'currentColor'} stroke="none" />
                      </svg>
                    );
                  })()}
                </button>
                
                {/* Extend */}
                <button
                  onClick={() => setActiveSubmenu(activeSubmenu === 'extend' ? null : 'extend')}
                  className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'extend' ? 'bg-slate-600' : ''}`}
                  title="Extend"
                >
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 10h12M16 10l-4-4M16 10l-4 4" />
                  </svg>
                </button>
                
                {/* Label */}
                <button
                  onClick={() => setActiveSubmenu(activeSubmenu === 'label' ? null : 'label')}
                  className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'label' ? 'bg-slate-600' : ''}`}
                  title="Label"
                >
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                    <text x="5" y="15" fontSize="14" fontWeight="bold">T</text>
                  </svg>
                </button>
                
                {/* Save as Favorite */}
                <button
                  onClick={saveAsFavorite}
                  className="p-2 hover:bg-slate-700 rounded text-yellow-400"
                  title="Save as Default"
                >
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                    <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
                  </svg>
                </button>
                </div>
              </div>
            )}
            
            {/* Drag overlay for menu */}
            {draggingMenu && trendlineMenuPos && (
              <div 
                className="fixed inset-0 z-[100] cursor-grabbing"
                onMouseMove={(e) => {
                  setTrendlineMenuPos({
                    x: e.clientX - menuDragOffset.current.x,
                    y: e.clientY - menuDragOffset.current.y
                  });
                }}
                onMouseUp={() => setDraggingMenu(false)}
                onTouchMove={(e) => {
                  const touch = e.touches[0];
                  setTrendlineMenuPos({
                    x: touch.clientX - menuDragOffset.current.x,
                    y: touch.clientY - menuDragOffset.current.y
                  });
                }}
                onTouchEnd={() => setDraggingMenu(false)}
              />
            )}
            
            {/* Submenu for Color */}
            {activeSubmenu === 'color' && trendlineMenuPos && selectedTrendline && (() => {
              const selectedLine = drawnTrendlines.find(l => l.id === selectedTrendline);
              const submenuX = trendlineMenuPos.x + 50 < dimensions.width - 150 ? trendlineMenuPos.x + 50 : trendlineMenuPos.x - 160;
              return (
                <div 
                  className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50"
                  data-menu="submenu"
                  style={{ left: submenuX, top: trendlineMenuPos.y }}
                >
                  <div className="text-xs text-gray-400 mb-2">Colors</div>
                  <div className="flex flex-wrap gap-1 mb-3 w-32">
                    {TRENDLINE_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => updateTrendline(selectedTrendline, { color })}
                        className={`w-6 h-6 rounded border-2 ${selectedLine?.color === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  
                  <div className="text-xs text-gray-400 mb-1">Opacity</div>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.1"
                    value={selectedLine?.opacity || 1}
                    onChange={(e) => updateTrendline(selectedTrendline, { opacity: parseFloat(e.target.value) })}
                    className="w-full mb-3"
                  />
                  
                  <div className="text-xs text-gray-400 mb-1">Line Style</div>
                  <div className="flex gap-1 mb-3">
                    {(['solid', 'dashed', 'dotted'] as LineStyle[]).map(style => (
                      <button
                        key={style}
                        onClick={() => updateTrendline(selectedTrendline, { lineStyle: style })}
                        className={`px-2 py-1 text-xs rounded ${selectedLine?.lineStyle === style ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                  
                  <div className="text-xs text-gray-400 mb-1">Thickness</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(t => (
                      <button
                        key={t}
                        onClick={() => updateTrendline(selectedTrendline, { thickness: t })}
                        className={`w-8 h-6 flex items-center justify-center rounded ${(selectedLine?.thickness || 2) === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                      >
                        <div style={{ width: 16, height: t, backgroundColor: 'currentColor', borderRadius: 1 }} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* Submenu for Extend */}
            {activeSubmenu === 'extend' && trendlineMenuPos && selectedTrendline && (() => {
              const selectedLine = drawnTrendlines.find(l => l.id === selectedTrendline);
              const submenuX = trendlineMenuPos.x + 50 < dimensions.width - 100 ? trendlineMenuPos.x + 50 : trendlineMenuPos.x - 110;
              return (
                <div 
                  className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50"
                  data-menu="submenu"
                  style={{ left: submenuX, top: trendlineMenuPos.y }}
                >
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLine?.extendLeft || false}
                        onChange={(e) => updateTrendline(selectedTrendline, { extendLeft: e.target.checked })}
                        className="w-4 h-4"
                      />
                      Extend Left
                    </label>
                    <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLine?.extendRight || false}
                        onChange={(e) => updateTrendline(selectedTrendline, { extendRight: e.target.checked })}
                        className="w-4 h-4"
                      />
                      Extend Right
                    </label>
                  </div>
                </div>
              );
            })()}
            
            {/* Submenu for Label */}
            {activeSubmenu === 'label' && trendlineMenuPos && selectedTrendline && (() => {
              const selectedLine = drawnTrendlines.find(l => l.id === selectedTrendline);
              const submenuX = trendlineMenuPos.x + 50 < dimensions.width - 160 ? trendlineMenuPos.x + 50 : trendlineMenuPos.x - 170;
              return (
                <div 
                  className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50 w-40"
                  data-menu="submenu"
                  style={{ left: submenuX, top: trendlineMenuPos.y }}
                >
                  <div className="text-xs text-gray-400 mb-1">Text</div>
                  <input
                    type="text"
                    placeholder="Label text..."
                    value={selectedLine?.label?.text || ''}
                    onChange={(e) => updateTrendline(selectedTrendline, { 
                      label: { 
                        text: e.target.value, 
                        positions: selectedLine?.label?.positions || ['top-right'] 
                      } 
                    })}
                    className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mb-2"
                  />
                  
                  <div className="text-xs text-gray-400 mb-1">Position (toggle multiple)</div>
                  <div className="grid grid-cols-2 gap-1">
                    {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(pos => {
                      const currentPositions = selectedLine?.label?.positions || [];
                      const isSelected = currentPositions.includes(pos);
                      return (
                        <button
                          key={pos}
                          onClick={() => {
                            const newPositions = isSelected 
                              ? currentPositions.filter(p => p !== pos)
                              : [...currentPositions, pos];
                            updateTrendline(selectedTrendline, { 
                              label: { 
                                text: selectedLine?.label?.text || '', 
                                positions: newPositions.length > 0 ? newPositions : ['top-right']
                              } 
                            });
                          }}
                          className={`px-1 py-1 text-xs rounded ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        >
                          {pos.replace('-', ' ')}
                        </button>
                      );
                    })}
                  </div>
                  
                  {selectedLine?.label?.text && (
                    <button
                      onClick={() => {
                        const { label, ...rest } = drawnTrendlines.find(l => l.id === selectedTrendline) || {};
                        if (rest.id) setDrawnTrendlines(prev => prev.map(l => l.id === selectedTrendline ? { ...l, label: undefined } : l));
                      }}
                      className="w-full mt-2 px-2 py-1 text-xs bg-red-600 text-white rounded"
                    >
                      Remove Label
                    </button>
                  )}
                </div>
              );
            })()}
            
            {/* Horizontal line action menu - matches trendline menu structure */}
            {horizontalMenuPos && selectedHorizontal && (
              <div 
                className="absolute flex flex-col gap-1 bg-slate-800 border border-slate-600 rounded-b rounded-t-sm z-50"
                style={{ left: horizontalMenuPos.x, top: horizontalMenuPos.y }}
                data-menu="horizontal"
              >
                {/* Drag handle */}
                <div 
                  className="h-2 bg-slate-600 rounded-t-sm cursor-grab active:cursor-grabbing flex items-center justify-center hover:bg-slate-500 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDraggingMenu(true);
                    menuDragOffset.current = { x: e.clientX - horizontalMenuPos.x, y: e.clientY - horizontalMenuPos.y };
                  }}
                >
                  <div className="w-6 h-0.5 bg-slate-400 rounded" />
                </div>
                <div className="p-1 flex flex-col gap-1">
                  {/* Delete */}
                  <button onClick={deleteHorizontal} className="p-2 hover:bg-slate-700 rounded text-red-400" title="Delete">
                    <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h12M6 6v10a2 2 0 002 2h4a2 2 0 002-2V6M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                    </svg>
                  </button>
                  {/* Move */}
                  <button 
                    onClick={() => {
                      setMovingHorizontal(selectedHorizontal);
                      setHorizontalMenuPos(null);
                      setActiveSubmenu(null);
                    }} 
                    className="p-2 hover:bg-slate-700 rounded text-white" 
                    title="Move"
                  >
                    <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10 2v16M2 10h16M10 2l-3 3M10 2l3 3M10 18l-3-3M10 18l3-3M2 10l3-3M2 10l3 3M18 10l-3-3M18 10l-3 3" />
                    </svg>
                  </button>
                  {/* Color - circle with colored dot */}
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === 'h-color' ? null : 'h-color')}
                    className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'h-color' ? 'bg-slate-600' : ''}`}
                    title="Colour"
                  >
                    <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="10" cy="10" r="7" />
                      <circle cx="10" cy="10" r="3" fill={drawnHorizontals.find(l => l.id === selectedHorizontal)?.color || '#facc15'} stroke="none" />
                    </svg>
                  </button>
                  {/* Label */}
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === 'h-label' ? null : 'h-label')}
                    className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'h-label' ? 'bg-slate-600' : ''}`}
                    title="Label"
                  >
                    <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                      <text x="5" y="15" fontSize="14" fontWeight="bold">T</text>
                    </svg>
                  </button>
                  {/* Save as Favorite */}
                  <button onClick={saveHorizontalAsFavorite} className="p-2 hover:bg-slate-700 rounded text-yellow-400" title="Save as Default">
                    <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                      <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            {/* Horizontal line color submenu */}
            {activeSubmenu === 'h-color' && horizontalMenuPos && selectedHorizontal && (() => {
              const selectedLine = drawnHorizontals.find(l => l.id === selectedHorizontal);
              const submenuX = horizontalMenuPos.x + 50 < dimensions.width - 150 ? horizontalMenuPos.x + 50 : horizontalMenuPos.x - 160;
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: horizontalMenuPos.y }}>
                  <div className="text-xs text-gray-400 mb-2">Colors</div>
                  <div className="flex flex-wrap gap-1 mb-3 w-32">
                    {TRENDLINE_COLORS.map(color => (
                      <button key={color} onClick={() => updateHorizontal(selectedHorizontal, { color })}
                        className={`w-6 h-6 rounded border-2 ${selectedLine?.color === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Opacity</div>
                  <input type="range" min="0.2" max="1" step="0.1" value={selectedLine?.opacity || 1}
                    onChange={(e) => updateHorizontal(selectedHorizontal, { opacity: parseFloat(e.target.value) })} className="w-full mb-3" />
                  <div className="text-xs text-gray-400 mb-1">Line Style</div>
                  <div className="flex gap-1 mb-3">
                    {(['solid', 'dashed', 'dotted'] as LineStyle[]).map(style => (
                      <button key={style} onClick={() => updateHorizontal(selectedHorizontal, { lineStyle: style })}
                        className={`px-2 py-1 text-xs rounded ${selectedLine?.lineStyle === style ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}>
                        {style}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Thickness</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(t => (
                      <button key={t} onClick={() => updateHorizontal(selectedHorizontal, { thickness: t })}
                        className={`w-8 h-6 flex items-center justify-center rounded ${(selectedLine?.thickness || 2) === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}>
                        <div style={{ width: 16, height: t, backgroundColor: 'currentColor', borderRadius: 1 }} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* Horizontal line label submenu */}
            {activeSubmenu === 'h-label' && horizontalMenuPos && selectedHorizontal && (() => {
              const selectedLine = drawnHorizontals.find(l => l.id === selectedHorizontal);
              const submenuX = horizontalMenuPos.x + 50 < dimensions.width - 150 ? horizontalMenuPos.x + 50 : horizontalMenuPos.x - 160;
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: horizontalMenuPos.y }}>
                  <div className="text-xs text-gray-400 mb-1">Label Text</div>
                  <input type="text" value={selectedLine?.label?.text || ''} placeholder="Enter label..."
                    onChange={e => updateHorizontal(selectedHorizontal, { label: { text: e.target.value, position: selectedLine?.label?.position || 'right' } })}
                    className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mb-3" />
                  <div className="text-xs text-gray-400 mb-1">Position</div>
                  <div className="flex gap-1">
                    {(['left', 'right'] as const).map(pos => (
                      <button key={pos} onClick={() => updateHorizontal(selectedHorizontal, { label: { text: selectedLine?.label?.text || '', position: pos } })}
                        className={`px-3 py-1 text-xs rounded ${selectedLine?.label?.position === pos ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}>
                        {pos}
                      </button>
                    ))}
                  </div>
                  {selectedLine?.label?.text && (
                    <button onClick={() => updateHorizontal(selectedHorizontal, { label: undefined })}
                      className="w-full mt-2 px-2 py-1 text-xs bg-red-600 text-white rounded">
                      Remove Label
                    </button>
                  )}
                </div>
              );
            })()}
            
            {/* Channel action menu - vertical icon bar structure */}
            {channelMenuPos && selectedChannel && (() => {
              const channel = drawnChannels.find(c => c.id === selectedChannel);
              return (
                <div 
                  className="absolute flex flex-col gap-1 bg-slate-800 border border-slate-600 rounded-b rounded-t-sm z-50"
                  style={{ left: channelMenuPos.x, top: channelMenuPos.y }}
                  data-menu="channel"
                >
                  {/* Drag handle */}
                  <div 
                    className="h-2 bg-slate-600 rounded-t-sm cursor-grab active:cursor-grabbing flex items-center justify-center hover:bg-slate-500 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDraggingMenu(true);
                      menuDragOffset.current = { x: e.clientX - channelMenuPos.x, y: e.clientY - channelMenuPos.y };
                    }}
                  >
                    <div className="w-6 h-0.5 bg-slate-400 rounded" />
                  </div>
                  <div className="p-1 flex flex-col gap-1">
                    {/* Delete */}
                    <button onClick={deleteChannel} className="p-2 hover:bg-slate-700 rounded text-red-400" title="Delete">
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 6h12M6 6v10a2 2 0 002 2h4a2 2 0 002-2V6M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                      </svg>
                    </button>
                    {/* Move */}
                    <button 
                      onClick={() => {
                        setMovingChannel(selectedChannel);
                        setChannelMenuPos(null);
                        setActiveSubmenu(null);
                      }} 
                      className="p-2 hover:bg-slate-700 rounded text-white" 
                      title="Move"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 2v16M2 10h16M10 2l-3 3M10 2l3 3M10 18l-3-3M10 18l3-3M2 10l3-3M2 10l3 3M18 10l-3-3M18 10l-3 3" />
                      </svg>
                    </button>
                    {/* Color - circle with colored dot */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'ch-color' ? null : 'ch-color')}
                      className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'ch-color' ? 'bg-slate-600' : ''}`}
                      title="Colour"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="10" cy="10" r="7" />
                        <circle cx="10" cy="10" r="3" fill={channel?.color || '#22c55e'} stroke="none" />
                      </svg>
                    </button>
                    {/* Labels/Lines */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'ch-lines' ? null : 'ch-lines')}
                      className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'ch-lines' ? 'bg-slate-600' : ''}`}
                      title="Lines"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 5h16M2 10h16M2 15h16" />
                      </svg>
                    </button>
                    {/* Save as Favorite */}
                    <button onClick={() => {
                      if (channel) {
                        const defaults = { color: channel.color, opacity: channel.opacity, lineStyle: channel.lineStyle, thickness: channel.thickness, internalLineStyle: channel.internalLineStyle, internalLineColor: channel.internalLineColor };
                        localStorage.setItem('channelDefaults', JSON.stringify(defaults));
                      }
                    }} className="p-2 hover:bg-slate-700 rounded text-yellow-400" title="Save as Default">
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                        <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })()}
            
            {/* Channel color submenu */}
            {activeSubmenu === 'ch-color' && channelMenuPos && selectedChannel && (() => {
              const channel = drawnChannels.find(c => c.id === selectedChannel);
              const submenuX = channelMenuPos.x + 200;
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: channelMenuPos.y }}>
                  <div className="text-xs text-gray-400 mb-2">Colors</div>
                  <div className="flex flex-wrap gap-1 mb-3 w-32">
                    {TRENDLINE_COLORS.map(color => (
                      <button key={color} onClick={() => updateChannel(selectedChannel, { color })}
                        className={`w-6 h-6 rounded border-2 ${channel?.color === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Opacity</div>
                  <input type="range" min="0.2" max="1" step="0.1" value={channel?.opacity || 1}
                    onChange={(e) => updateChannel(selectedChannel, { opacity: parseFloat(e.target.value) })} className="w-full mb-3" />
                  <div className="text-xs text-gray-400 mb-1">Line Style</div>
                  <div className="flex gap-1">
                    {(['solid', 'dashed', 'dotted'] as LineStyle[]).map(style => (
                      <button key={style} onClick={() => updateChannel(selectedChannel, { lineStyle: style })}
                        className={`px-2 py-1 text-xs rounded ${channel?.lineStyle === style ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}>
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* Channel lines submenu */}
            {activeSubmenu === 'ch-lines' && channelMenuPos && selectedChannel && (() => {
              const channel = drawnChannels.find(c => c.id === selectedChannel);
              const submenuX = channelMenuPos.x + 50 < dimensions.width - 200 ? channelMenuPos.x + 50 : channelMenuPos.x - 210;
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: channelMenuPos.y, minWidth: '180px' }}>
                  {/* External Lines */}
                  <div className="text-xs text-gray-400 mb-1">External Lines</div>
                  <label className="flex items-center gap-2 text-white text-sm mb-3 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={channel?.showExternalLines} 
                      onChange={e => updateChannel(selectedChannel, { showExternalLines: e.target.checked })} />
                    Show
                  </label>
                  
                  {/* Internal Lines */}
                  <div className="text-xs text-gray-400 mb-1">Internal Lines</div>
                  {channel?.internalLines.map((il, idx) => (
                    <div key={idx} className="flex items-center gap-1 mb-1">
                      <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={il.visible} 
                        onChange={e => {
                          const newLines = [...(channel?.internalLines || [])];
                          newLines[idx] = { ...newLines[idx], visible: e.target.checked };
                          updateChannel(selectedChannel, { internalLines: newLines });
                        }} />
                      <input type="number" value={il.percent} min="1" max="99" 
                        className="w-10 bg-slate-700 text-white px-1 py-0.5 text-xs rounded text-center"
                        onChange={e => {
                          const newLines = [...(channel?.internalLines || [])];
                          newLines[idx] = { ...newLines[idx], percent: parseInt(e.target.value) || 25 };
                          updateChannel(selectedChannel, { internalLines: newLines });
                        }} />
                      <span className="text-white text-xs">%</span>
                      <input type="text" value={il.label} placeholder="Label"
                        className="w-14 bg-slate-700 text-white px-1 py-0.5 text-xs rounded"
                        onChange={e => {
                          const newLines = [...(channel?.internalLines || [])];
                          newLines[idx] = { ...newLines[idx], label: e.target.value };
                          updateChannel(selectedChannel, { internalLines: newLines });
                        }} />
                    </div>
                  ))}
                  <button onClick={() => {
                    const newLines = [...(channel?.internalLines || []), { percent: 50, visible: true, label: '50%' }];
                    updateChannel(selectedChannel, { internalLines: newLines });
                  }} className="text-xs text-blue-400 hover:underline mt-1">+ Add line</button>
                </div>
              );
            })()}
            
            {/* Text label action menu - simplified: delete, color, text */}
            {textLabelMenuPos && selectedTextLabel && (() => {
              const label = drawnTextLabels.find(l => l.id === selectedTextLabel);
              return (
                <div 
                  className="absolute flex flex-col gap-1 bg-slate-800 border border-slate-600 rounded-b rounded-t-sm z-50"
                  style={{ left: textLabelMenuPos.x, top: textLabelMenuPos.y }}
                  data-menu="textlabel"
                >
                  {/* Drag handle */}
                  <div 
                    className="h-2 bg-slate-600 rounded-t-sm cursor-grab active:cursor-grabbing flex items-center justify-center hover:bg-slate-500 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDraggingMenu(true);
                      menuDragOffset.current = { x: e.clientX - textLabelMenuPos.x, y: e.clientY - textLabelMenuPos.y };
                    }}
                  >
                    <div className="w-6 h-0.5 bg-slate-400 rounded" />
                  </div>
                  <div className="p-1 flex flex-col gap-1">
                    {/* Delete */}
                    <button onClick={deleteTextLabel} className="p-2 hover:bg-slate-700 rounded text-red-400" title="Delete">
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 6h12M6 6v10a2 2 0 002 2h4a2 2 0 002-2V6M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                      </svg>
                    </button>
                    {/* Color - circle with colored dot */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'tl-color' ? null : 'tl-color')}
                      className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'tl-color' ? 'bg-slate-600' : ''}`}
                      title="Colour"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="10" cy="10" r="7" />
                        <circle cx="10" cy="10" r="3" fill={label?.color || '#facc15'} stroke="none" />
                      </svg>
                    </button>
                    {/* Move/Arrow icon */}
                    <button
                      onClick={() => {
                        setMovingTextLabel(selectedTextLabel);
                        setTextLabelMenuPos(null);
                        setActiveSubmenu(null);
                      }}
                      className="p-2 hover:bg-slate-700 rounded text-white"
                      title="Move"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 2v16M2 10h16M10 2l-3 3M10 2l3 3M10 18l-3-3M10 18l3-3M2 10l3-3M2 10l3 3M18 10l-3-3M18 10l-3 3" />
                      </svg>
                    </button>
                    {/* Text/Label */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'tl-text' ? null : 'tl-text')}
                      className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'tl-text' ? 'bg-slate-600' : ''}`}
                      title="Text"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                        <text x="5" y="15" fontSize="14" fontWeight="bold">T</text>
                      </svg>
                    </button>
                    {/* Save as Favorite */}
                    <button onClick={saveTextLabelAsFavorite} className="p-2 hover:bg-slate-700 rounded text-yellow-400" title="Save as Default">
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                        <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })()}
            
            {/* Text label color submenu */}
            {activeSubmenu === 'tl-color' && textLabelMenuPos && selectedTextLabel && (() => {
              const label = drawnTextLabels.find(l => l.id === selectedTextLabel);
              const submenuX = textLabelMenuPos.x + 50 < dimensions.width - 150 ? textLabelMenuPos.x + 50 : textLabelMenuPos.x - 160;
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: textLabelMenuPos.y }}>
                  <div className="text-xs text-gray-400 mb-2">Colors</div>
                  <div className="flex flex-wrap gap-1 mb-3 w-32">
                    {TRENDLINE_COLORS.map(color => (
                      <button key={color} onClick={() => updateTextLabel(selectedTextLabel, { color })}
                        className={`w-6 h-6 rounded border-2 ${label?.color === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Opacity</div>
                  <input type="range" min="0.2" max="1" step="0.1" value={label?.opacity || 1}
                    onChange={(e) => updateTextLabel(selectedTextLabel, { opacity: parseFloat(e.target.value) })} className="w-full mb-3" />
                  <div className="text-xs text-gray-400 mb-1">Background</div>
                  <div className="flex gap-1 flex-wrap">
                    {['transparent', '#000000', '#1e293b', '#374151', '#ffffff'].map(bg => (
                      <button key={bg} onClick={() => updateTextLabel(selectedTextLabel, { backgroundColor: bg })}
                        className={`w-6 h-6 rounded border-2 ${label?.backgroundColor === bg ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: bg === 'transparent' ? 'transparent' : bg }}>
                        {bg === 'transparent' && <span className="text-white text-xs">∅</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* Text label text submenu - just text input */}
            {activeSubmenu === 'tl-text' && textLabelMenuPos && selectedTextLabel && (() => {
              const label = drawnTextLabels.find(l => l.id === selectedTextLabel);
              const submenuX = textLabelMenuPos.x + 50 < dimensions.width - 150 ? textLabelMenuPos.x + 50 : textLabelMenuPos.x - 160;
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: textLabelMenuPos.y }}>
                  <div className="text-xs text-gray-400 mb-1">Label Text</div>
                  <input type="text" value={label?.text || ''} placeholder="Enter label text..."
                    onChange={e => updateTextLabel(selectedTextLabel, { text: e.target.value })}
                    className="w-32 bg-slate-700 text-white px-2 py-1 rounded text-sm" />
                </div>
              );
            })()}
            
            {/* Move mode indicator */}
            {moveMode && !movingPoint && !movingWholeLine && (
              <div className="absolute top-14 left-14 bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                Click endpoint or center to move
              </div>
            )}
            
            {/* Whole line move indicator */}
            {movingWholeLine && (
              <div className="absolute top-14 left-14 bg-green-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-50">
                Click to place line
              </div>
            )}
            
            {/* Moving point indicator */}
            {movingPoint && (
              <div className="absolute top-14 left-14 bg-green-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                Click to place point
              </div>
            )}
            
            {/* Moving horizontal indicator */}
            {movingHorizontal && (
              <div className="absolute top-14 left-14 bg-green-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                Click to place horizontal line
              </div>
            )}
            
            {/* Moving text label indicator */}
            {movingTextLabel && (
              <div className="absolute top-14 left-14 bg-green-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                Click to place label
              </div>
            )}
            
            {/* Moving channel indicator */}
            {movingChannel && (
              <div className="absolute top-14 left-14 bg-green-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                Click to place channel
              </div>
            )}
            
            {/* Universal click pulse - visual feedback for all clicks */}
            {clickPulse && (
              <div 
                className="absolute pointer-events-none z-[100]"
                style={{ 
                  left: clickPulse.x - 10, 
                  top: clickPulse.y - 10,
                  width: 20,
                  height: 20,
                }}
              >
                <div 
                  className="w-full h-full rounded-full border-2 border-cyan-400 animate-ping"
                  style={{ animationDuration: '0.4s' }}
                />
              </div>
            )}
            
            {/* Click overlay for placing moved point */}
            {movingPoint && (
              <div 
                className="absolute top-0 right-0 bottom-0 cursor-crosshair z-20"
                style={{ left: 40 }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left + 40;
                  const clickY = e.clientY - rect.top;
                  showClickPulse(clickX, clickY);
                  placeMovingPoint(clickX, clickY);
                }}
              />
            )}
            
            {/* Click overlay for placing moved horizontal line */}
            {movingHorizontal && (
              <div 
                className="absolute top-0 right-0 bottom-0 cursor-crosshair z-20"
                style={{ left: 40 }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left + 40;
                  const clickY = e.clientY - rect.top;
                  showClickPulse(clickX, clickY);
                  placeMovingHorizontal(clickX, clickY);
                }}
              >
                {magnetPulse && (
                  <div className="absolute pointer-events-none" style={{ left: magnetPulse.x - MAGNET_RADIUS, top: magnetPulse.y - MAGNET_RADIUS, width: MAGNET_RADIUS * 2, height: MAGNET_RADIUS * 2 }}>
                    <div className="w-full h-full rounded-full border-2 border-white animate-ping" style={{ animationDuration: '0.4s' }} />
                  </div>
                )}
              </div>
            )}
            
            {/* Click overlay for placing moved text label */}
            {movingTextLabel && (
              <div 
                className="absolute top-0 right-0 bottom-0 cursor-crosshair z-20"
                style={{ left: 40 }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left + 40;
                  const clickY = e.clientY - rect.top;
                  showClickPulse(clickX, clickY);
                  placeMovingTextLabel(clickX, clickY);
                }}
              >
                {magnetPulse && (
                  <div className="absolute pointer-events-none" style={{ left: magnetPulse.x - MAGNET_RADIUS, top: magnetPulse.y - MAGNET_RADIUS, width: MAGNET_RADIUS * 2, height: MAGNET_RADIUS * 2 }}>
                    <div className="w-full h-full rounded-full border-2 border-white animate-ping" style={{ animationDuration: '0.4s' }} />
                  </div>
                )}
              </div>
            )}
            
            {/* Click overlay for placing moved channel */}
            {movingChannel && (
              <div 
                className="absolute top-0 right-0 bottom-0 cursor-crosshair z-20"
                style={{ left: 40 }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left + 40;
                  const clickY = e.clientY - rect.top;
                  showClickPulse(clickX, clickY);
                  placeMovingChannel(clickX, clickY);
                }}
              >
                {magnetPulse && (
                  <div className="absolute pointer-events-none" style={{ left: magnetPulse.x - MAGNET_RADIUS, top: magnetPulse.y - MAGNET_RADIUS, width: MAGNET_RADIUS * 2, height: MAGNET_RADIUS * 2 }}>
                    <div className="w-full h-full rounded-full border-2 border-white animate-ping" style={{ animationDuration: '0.4s' }} />
                  </div>
                )}
              </div>
            )}
            
            {/* Click overlay for exiting move mode when clicking chart */}
            {moveMode && !movingPoint && !movingWholeLine && (
              <div 
                className="absolute top-0 right-0 bottom-0 z-20"
                style={{ left: 40 }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left + 40; // Offset for toolbar
                  const clickY = e.clientY - rect.top;
                  
                  // Check if click is near any endpoint of the selected trendline
                  const selectedLine = drawnTrendlines.find(l => l.id === selectedTrendline);
                  if (selectedLine && xScaleRef.current && yScaleRef.current) {
                    const x1 = xScaleRef.current(new Date(selectedLine.p1.time)) + margin.left;
                    const y1 = yScaleRef.current(selectedLine.p1.price);
                    const x2 = xScaleRef.current(new Date(selectedLine.p2.time)) + margin.left;
                    const y2 = yScaleRef.current(selectedLine.p2.price);
                    const centerX = (x1 + x2) / 2;
                    const centerY = (y1 + y2) / 2;
                    
                    const hitRadius = 25; // Generous hit radius
                    const distToP1 = Math.sqrt((clickX - x1) ** 2 + (clickY - y1) ** 2);
                    const distToP2 = Math.sqrt((clickX - x2) ** 2 + (clickY - y2) ** 2);
                    const distToCenter = Math.sqrt((clickX - centerX) ** 2 + (clickY - centerY) ** 2);
                    
                    // If near endpoint, trigger the endpoint click
                    if (distToP1 < hitRadius) {
                      handleEndpointClick(selectedLine.id, 'p1');
                      return;
                    }
                    if (distToP2 < hitRadius) {
                      handleEndpointClick(selectedLine.id, 'p2');
                      return;
                    }
                    // If near center, trigger whole line move
                    if (distToCenter < hitRadius) {
                      setMovingWholeLine(selectedLine.id);
                      setTrendlineMenuPos(null);
                      return;
                    }
                  }
                  
                  // Otherwise exit move mode
                  closeTrendlineMenu();
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

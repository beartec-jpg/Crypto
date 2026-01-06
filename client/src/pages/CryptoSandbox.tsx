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
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  
  
  // Crosshair state - toggle mode instead of long press (conflicts with D3 zoom)
  const [crosshairMode, setCrosshairMode] = useState(false);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  // For mobile "push" behavior - track touch start position with time for tap detection
  const touchStartRef = useRef<{ x: number; y: number; time: number; initX?: number; initY?: number; pinchDist?: number; pinchMidX?: number } | null>(null);
  const crosshairStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false); // Track if touch moved significantly
  const touchHandledRef = useRef(false); // Prevent duplicate calls from touch+click
  const lastClickTimeRef = useRef(0); // Debounce rapid clicks
  const lastSelectionTimeRef = useRef(0); // Debounce rapid selection events
  const TOUCH_THRESHOLD = 35; // pixels - movement above this is a drag, not a tap (increased for mobile)
  const CLICK_DEBOUNCE = 100; // ms - ignore clicks within this time of each other
  const TAP_TIME_LIMIT = 300; // ms - max time for a tap
  
  // SVG-level tap detection for selection when crosshair is OFF
  const svgTapStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const TAP_MAX_DURATION = 300; // ms - max time for a tap
  
  // Drawing tool state
  type DrawingTool = 'trendline' | 'horizontal' | 'channel' | 'fibretracement' | 'trendfib' | 'label' | 'impulse' | 'abc' | 'wxy' | 'abcde' | 'wxyxz' | 'hchannel' | 'schannel' | null;
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
    label?: { text: string; positions: ('top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right')[] };
    createdAtZoomScale?: number; // Zoom level when trendline was created for dynamic visibility
  }
  
  // Horizontal line data
  interface HorizontalLineData {
    id: string;
    price: number;
    color: string;
    opacity: number;
    lineStyle: LineStyle;
    thickness: number;
    label?: { text: string; positions: ('left' | 'center' | 'right')[] };
  }
  
  // Channel data (legacy - kept for backward compatibility)
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
  
  // Horizontal Channel - 2 click mode
  interface HorizontalChannelData {
    id: string;
    x1: number; // First click x position (time)
    x2: number; // Second click x position (time)
    topPrice: number; // Top external line price
    bottomPrice: number; // Bottom external line price
    color: string;
    fillColor?: string;
    fillOpacity?: number;
    opacity: number;
    lineStyle: LineStyle;
    thickness: number;
    topLineColor: string;
    topLineThickness: number;
    topLineStyle: LineStyle;
    topLabel?: string;
    bottomLineColor: string;
    bottomLineThickness: number;
    bottomLineStyle: LineStyle;
    bottomLabel?: string;
    internalLines: { percent: number; visible: boolean; color: string; style: LineStyle; label?: string; bgColor?: string }[]; // 25, 50, 75%
    label?: { text: string; value?: string };
    showLabelLeft?: boolean;
    showLabelCenter?: boolean;
    showLabelRight?: boolean;
    isFavorite?: boolean;
    extendLeft?: boolean;
    extendRight?: boolean;
  }

  // Sloped Channel - 3 click mode
  interface SlopedChannelData {
    id: string;
    // First two clicks define external lines and height
    topLine: { p1: { time: number; price: number }; p2: { time: number; price: number } };
    bottomLine: { p1: { time: number; price: number }; p2: { time: number; price: number } };
    color: string;
    fillColor?: string;
    fillOpacity?: number;
    opacity: number;
    lineStyle: LineStyle;
    thickness: number;
    topLineColor: string;
    topLineThickness: number;
    topLineStyle: LineStyle;
    topLabel?: string;
    bottomLineColor: string;
    bottomLineThickness: number;
    bottomLineStyle: LineStyle;
    bottomLabel?: string;
    internalLines: { percent: number; visible: boolean; color: string; style: LineStyle; label?: string; bgColor?: string }[]; // 25, 50, 75%
    label?: { text: string; value?: string };
    showLabelLeft?: boolean;
    showLabelCenter?: boolean;
    showLabelRight?: boolean;
    isFavorite?: boolean;
    extendLeft?: boolean;
    extendRight?: boolean;
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
    createdAtZoomScale?: number; // zoom scale (k) when label was created - for dynamic visibility
  }
  
  // Fibonacci Retracement data
  interface FibRetracementData {
    id: string;
    anchor1: { time: number; price: number }; // Lower price anchor (0%)
    anchor2: { time: number; price: number }; // Higher price anchor (100%)
    color: string;
    opacity: number;
    lineStyle: LineStyle;
    thickness: number;
    labelPosition: 'left' | 'right';
    showPrices: boolean;
    showExtensions: boolean;
    levels: { ratio: number; visible: boolean }[];
    createdAtZoomScale?: number;
  }
  
  const DEFAULT_FIB_LEVELS = [
    { ratio: 0, visible: true },
    { ratio: 0.236, visible: true },
    { ratio: 0.382, visible: true },
    { ratio: 0.5, visible: true },
    { ratio: 0.618, visible: true },
    { ratio: 0.786, visible: true },
    { ratio: 1, visible: true },
    { ratio: 1.272, visible: false },
    { ratio: 1.618, visible: false },
    { ratio: 2.618, visible: false },
  ];
  
  const [trendlineMode, setTrendlineMode] = useState<TrendlineMode>(null);
  const [trendlinePoints, setTrendlinePoints] = useState<{ x: number; y: number; time: number; price: number }[]>([]);
  const [drawnTrendlines, setDrawnTrendlines] = useState<TrendlineData[]>([]);
  const [drawnHorizontals, setDrawnHorizontals] = useState<HorizontalLineData[]>([]);
  const [drawnChannels, setDrawnChannels] = useState<ChannelData[]>([]);
  const [drawnTextLabels, setDrawnTextLabels] = useState<TextLabelData[]>([]);
  const [channelPoints, setChannelPoints] = useState<{ x: number; y: number; time: number; price: number }[]>([]);
  const [magnetPulse, setMagnetPulse] = useState<{ x: number; y: number } | null>(null);
  const MAGNET_RADIUS = 30; // pixels
  
  // Horizontal Channel state (2-click)
  const [drawnHChannels, setDrawnHChannels] = useState<HorizontalChannelData[]>([]);
  const [hchannelPoints, setHChannelPoints] = useState<{ x: number; y: number; time: number; price: number }[]>([]);
  const [selectedHChannel, setSelectedHChannel] = useState<string | null>(null);
  const [hchannelMenuPos, setHChannelMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [movingHChannel, setMovingHChannel] = useState<string | null>(null);
  
  // Sloped Channel state (3-click)
  const [drawnSChannels, setDrawnSChannels] = useState<SlopedChannelData[]>([]);
  const [schannelPoints, setSChannelPoints] = useState<{ x: number; y: number; time: number; price: number }[]>([]);
  const [selectedSChannel, setSelectedSChannel] = useState<string | null>(null);
  const [schannelMenuPos, setSChannelMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [movingSChannel, setMovingSChannel] = useState<string | null>(null);
  
  // Fibonacci Retracement state (2-click)
  const [drawnFibRetraces, setDrawnFibRetraces] = useState<FibRetracementData[]>([]);
  const [fibPoints, setFibPoints] = useState<{ x: number; y: number; time: number; price: number }[]>([]);
  const [selectedFib, setSelectedFib] = useState<string | null>(null);
  const [fibMenuPos, setFibMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [movingFibAnchor, setMovingFibAnchor] = useState<'anchor1' | 'anchor2' | 'whole' | null>(null);
  
  // Selection state for all drawing types
  const [selectedHorizontal, setSelectedHorizontal] = useState<string | null>(null);
  const [horizontalMenuPos, setHorizontalMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [channelMenuPos, setChannelMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedTextLabel, setSelectedTextLabel] = useState<string | null>(null);
  const [textLabelMenuPos, setTextLabelMenuPos] = useState<{ x: number; y: number } | null>(null);
  
  // Trendline selection and menu state
  const [selectedTrendline, setSelectedTrendline] = useState<string | null>(null);
  const [trendlineMenuPos, setTrendlineMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'color' | 'extend' | 'label' | 'h-color' | 'h-label' | 'ch-color' | 'ch-lines' | 'hch-lines' | 'sch-lines' | 'tl-color' | 'tl-text' | null>(null);
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
  
  // Selection picker state for overlapping elements
  type SelectionCandidate = { id: string; type: 'trendline' | 'horizontal' | 'channel' | 'hchannel' | 'schannel' | 'label' };
  const [selectionCandidates, setSelectionCandidates] = useState<SelectionCandidate[]>([]);
  const [selectionPickerPos, setSelectionPickerPos] = useState<{ x: number; y: number } | null>(null);
  const [selectionPickerClickPos, setSelectionPickerClickPos] = useState<{ x: number; y: number } | null>(null); // Original click position
  
  // Tap feedback circle (visual indicator where user tapped)
  const [tapFeedback, setTapFeedback] = useState<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0); // Debounce double-taps
  const tapInProgressRef = useRef<boolean>(false); // Block concurrent taps
  const selectionTimeRef = useRef<number>(0); // Track when selection occurred to prevent immediate close
  
  // Undo/redo history for ALL drawing types (unified)
  type DrawingState = {
    trendlines: TrendlineData[];
    horizontals: HorizontalLineData[];
    channels: ChannelData[];
    hchannels: HorizontalChannelData[];
    schannels: SlopedChannelData[];
    labels: TextLabelData[];
  };
  const [drawingHistory, setDrawingHistory] = useState<DrawingState[]>([{
    trendlines: [],
    horizontals: [],
    channels: [],
    hchannels: [],
    schannels: [],
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
      hchannels: drawnHChannels,
      schannels: drawnSChannels,
      labels: drawnTextLabels
    });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);
  
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex - 1;
      const state = drawingHistory[newIndex];
      setHistoryIndex(newIndex);
      setDrawnTrendlines(state.trendlines);
      setDrawnHorizontals(state.horizontals);
      setDrawnChannels(state.channels);
      setDrawnHChannels(state.hchannels || []);
      setDrawnSChannels(state.schannels || []);
      setDrawnTextLabels(state.labels);
      // Close all menus
      setSelectedTrendline(null);
      setTrendlineMenuPos(null);
      setSelectedHorizontal(null);
      setHorizontalMenuPos(null);
      setSelectedChannel(null);
      setChannelMenuPos(null);
      setSelectedHChannel(null);
      setHChannelMenuPos(null);
      setSelectedSChannel(null);
      setSChannelMenuPos(null);
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
      setDrawnHChannels(state.hchannels || []);
      setDrawnSChannels(state.schannels || []);
      setDrawnTextLabels(state.labels);
      // Close all menus
      setSelectedTrendline(null);
      setTrendlineMenuPos(null);
      setSelectedHorizontal(null);
      setHorizontalMenuPos(null);
      setSelectedChannel(null);
      setChannelMenuPos(null);
      setSelectedHChannel(null);
      setHChannelMenuPos(null);
      setSelectedSChannel(null);
      setSChannelMenuPos(null);
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
  
  // Helper to constrain menu position within visible chart area
  const constrainMenuPosition = useCallback((clickX: number, clickY: number, menuWidth: number, menuHeight: number) => {
    const leftToolbar = 60; // Left toolbar width
    const topArea = margin.top + 60; // Top controls area
    const rightEdge = dimensions.width - margin.right - 10;
    const bottomEdge = dimensions.height - 20; // Leave some padding at bottom
    
    let menuX = clickX + 10;
    let menuY = clickY;
    
    // Keep menu to the right of left toolbar
    if (menuX < leftToolbar) {
      menuX = leftToolbar;
    }
    
    // Keep menu from going off right edge
    if (menuX + menuWidth > rightEdge) {
      menuX = clickX - menuWidth - 10;
      if (menuX < leftToolbar) menuX = leftToolbar;
    }
    
    // Keep menu from going off bottom
    if (menuY + menuHeight > bottomEdge) {
      menuY = bottomEdge - menuHeight;
    }
    
    // Keep menu below top controls
    if (menuY < topArea) {
      menuY = topArea;
    }
    
    return { x: menuX, y: menuY };
  }, [dimensions, margin]);
  
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
    // Don't close immediately after selection (prevents touch event propagation issues)
    const timeSinceSelection = Date.now() - selectionTimeRef.current;
    if (timeSinceSelection < 150) {
      console.log('⏭️ handleChartBackgroundClick ignored - selection just occurred', timeSinceSelection);
      return;
    }

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
      setSelectedHChannel(null);
      setHChannelMenuPos(null);
      setSelectedSChannel(null);
      setSChannelMenuPos(null);
      setActiveSubmenu(null);
      // Clear any in-progress drawing
      setTrendlineMode(null);
      setTrendlinePoints([]);
      setChannelPoints([]);
      setHChannelPoints([]);
      setSChannelPoints([]);
      // Close selection picker
      setSelectionCandidates([]);
      setSelectionPickerPos(null);
      setSelectionPickerClickPos(null);
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
  
  // Handle trendline point placement - unified handler with single pulse at final position
  const handleTrendlinePlacement = useCallback((clickX: number, clickY: number) => {
    const now = Date.now();
    // Debounce rapid clicks (touch often fires multiple events)
    if (now - lastClickTimeRef.current < CLICK_DEBOUNCE) {
      return;
    }
    lastClickTimeRef.current = now;
    
    if (!trendlineMode || !xScaleRef.current || !yScaleRef.current) {
      return;
    }
    
    // Try magnet first, fallback to free if no candle nearby
    const magnetPoint = findMagnetPoint(clickX, clickY);
    const finalPoint = magnetPoint || {
      x: clickX,
      y: clickY,
      time: xScaleRef.current.invert(clickX - margin.left).getTime(),
      price: yScaleRef.current.invert(clickY - margin.top)
    };
    
    // Single pulse at FINAL placement position (snapped if magnet hit)
    setMagnetPulse({ x: finalPoint.x, y: finalPoint.y });
    setTimeout(() => setMagnetPulse(null), 400);
    
    if (trendlinePoints.length === 0) {
      // First point
      setTrendlinePoints([finalPoint]);
    } else {
      // Second point - complete the trendline with full properties
      const newTrendline: TrendlineData = {
        id: `tl-${Date.now()}`,
        p1: { time: trendlinePoints[0].time, price: trendlinePoints[0].price },
        p2: { time: finalPoint.time, price: finalPoint.price },
        color: trendlineDefaults.color,
        opacity: trendlineDefaults.opacity,
        lineStyle: trendlineDefaults.lineStyle,
        thickness: trendlineDefaults.thickness,
        extendLeft: false,
        extendRight: false,
        createdAtZoomScale: zoomTransformRef.current?.k ?? 1,
      };
      const newTrendlines = [...drawnTrendlines, newTrendline];
      setDrawnTrendlines(newTrendlines);
      saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
      setTrendlinePoints([]);
    }
  }, [trendlineMode, trendlinePoints, findMagnetPoint, margin.left, margin.top, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory, trendlineDefaults]);
  
  // Handle click on trendline to select it - auto enters move mode
  const handleTrendlineSelect = useCallback((lineId: string, clickX: number, clickY: number) => {
    const now = Date.now();
    // Debounce rapid selection events (prevents duplicate touch+click)
    if (now - lastSelectionTimeRef.current < CLICK_DEBOUNCE) {
      return;
    }
    lastSelectionTimeRef.current = now;
    
    console.log('✅ handleTrendlineSelect called:', { lineId, clickX, clickY, alreadySelected: selectedTrendline === lineId });
    
    // If already selected, don't re-select (let pickup point handlers work)
    if (selectedTrendline === lineId) {
      console.log('⏭️ Line already selected, skipping re-selection');
      return;
    }
    
    // Track when selection occurred to prevent immediate close
    selectionTimeRef.current = now;
    
    // Close all other menus first
    setHorizontalMenuPos(null);
    setSelectedHorizontal(null);
    setChannelMenuPos(null);
    setSelectedChannel(null);
    setHChannelMenuPos(null);
    setSelectedHChannel(null);
    setMovingHChannel(null);
    setSChannelMenuPos(null);
    setSelectedSChannel(null);
    setTextLabelMenuPos(null);
    setSelectedTextLabel(null);
    
    setSelectedTrendline(lineId);
    setMoveMode(true);
    // Don't set movingTrendline yet - that happens when user taps a pickup point (endpoint/center)
    
    // Calculate menu position with edge detection
    const menuPos = constrainMenuPosition(clickX, clickY, 50, 200);
    console.log('📍 Menu position set:', menuPos);
    setTrendlineMenuPos(menuPos);
    setActiveSubmenu(null);
  }, [constrainMenuPosition, selectedTrendline]);
  
  // Delete selected trendline
  const deleteTrendline = useCallback(() => {
    if (selectedTrendline) {
      const newTrendlines = drawnTrendlines.filter(l => l.id !== selectedTrendline);
      setDrawnTrendlines(newTrendlines);
      saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
      setSelectedTrendline(null);
      setTrendlineMenuPos(null);
      setActiveSubmenu(null);
    }
  }, [selectedTrendline, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);
  
  // Update trendline property
  const updateTrendline = useCallback((id: string, updates: Partial<TrendlineData>) => {
    const newTrendlines = drawnTrendlines.map(l => l.id === id ? { ...l, ...updates } : l);
    setDrawnTrendlines(newTrendlines);
    saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);
  
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
    saveToHistory({ trendlines: drawnTrendlines, horizontals: newHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
  }, [margin.top, horizontalDefaults, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Handle click on horizontal line to select it
  const handleHorizontalSelect = useCallback((lineId: string, clickX: number, clickY: number) => {
    const now = Date.now();
    // Debounce rapid selection events (prevents duplicate touch+click)
    if (now - lastSelectionTimeRef.current < CLICK_DEBOUNCE) {
      return;
    }
    lastSelectionTimeRef.current = now;
    
    console.log('✅ handleHorizontalSelect called:', { lineId, clickX, clickY });
    
    // Track when selection occurred to prevent immediate close
    selectionTimeRef.current = now;
    
    // Close all other menus
    closeTrendlineMenu();
    setSelectedChannel(null);
    setChannelMenuPos(null);
    setSelectedTextLabel(null);
    setTextLabelMenuPos(null);
    
    setSelectedHorizontal(lineId);
    setMoveMode(true);
    // Don't set movingHorizontal yet - that happens when user taps the line AGAIN 
    // with a delay in handleSvgTapSelection or via a separate click handler
    
    const menuPos = constrainMenuPosition(clickX, clickY, 180, 200);
    console.log('📍 Horizontal menu position set:', menuPos);
    setHorizontalMenuPos(menuPos);
  }, [constrainMenuPosition, closeTrendlineMenu]);

  // Delete selected horizontal line
  const deleteHorizontal = useCallback(() => {
    if (selectedHorizontal) {
      const newHorizontals = drawnHorizontals.filter(l => l.id !== selectedHorizontal);
      setDrawnHorizontals(newHorizontals);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: newHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
      setSelectedHorizontal(null);
      setHorizontalMenuPos(null);
    }
  }, [selectedHorizontal, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Update horizontal line property
  const updateHorizontal = useCallback((id: string, updates: Partial<HorizontalLineData>) => {
    const newHorizontals = drawnHorizontals.map(l => l.id === id ? { ...l, ...updates } : l);
    setDrawnHorizontals(newHorizontals);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: newHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

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
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: newChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
      setChannelPoints([]);
    }
  }, [channelPoints, margin, channelDefaults, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Handle click on channel to select it
  const handleChannelSelect = useCallback((channelId: string, clickX: number, clickY: number) => {
    const now = Date.now();
    // Debounce rapid selection events (prevents duplicate touch+click)
    if (now - lastSelectionTimeRef.current < CLICK_DEBOUNCE) {
      return;
    }
    lastSelectionTimeRef.current = now;
    
    // Track when selection occurred to prevent immediate close
    selectionTimeRef.current = now;
    
    setSelectedChannel(channelId);
    closeTrendlineMenu();
    closeHorizontalMenu();
    setSelectedTextLabel(null);
    setTextLabelMenuPos(null);
    const menuPos = constrainMenuPosition(clickX, clickY, 180, 250);
    setChannelMenuPos(menuPos);
  }, [constrainMenuPosition, closeTrendlineMenu, closeHorizontalMenu]);

  // Delete selected channel
  const deleteChannel = useCallback(() => {
    if (selectedChannel) {
      const newChannels = drawnChannels.filter(c => c.id !== selectedChannel);
      setDrawnChannels(newChannels);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: newChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
      setSelectedChannel(null);
      setChannelMenuPos(null);
    }
  }, [selectedChannel, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Update channel property
  const updateChannel = useCallback((id: string, updates: Partial<ChannelData>) => {
    const newChannels = drawnChannels.map(c => c.id === id ? { ...c, ...updates } : c);
    setDrawnChannels(newChannels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: newChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Close channel menu
  const closeChannelMenu = useCallback(() => {
    setSelectedChannel(null);
    setChannelMenuPos(null);
  }, []);

  // === HORIZONTAL CHANNEL HANDLERS === (2-click)
  const handleHChannelPlacement = useCallback((clickX: number, clickY: number) => {
    const now = Date.now();
    // Debounce rapid clicks
    if (now - lastClickTimeRef.current < CLICK_DEBOUNCE) {
      return;
    }
    lastClickTimeRef.current = now;
    
    if (!xScaleRef.current || !yScaleRef.current) return;
    
    // Try magnet first, fallback to free
    const magnetPoint = findMagnetPoint(clickX, clickY);
    const finalPoint = magnetPoint || {
      x: clickX,
      y: clickY,
      time: xScaleRef.current.invert(clickX - margin.left).getTime(),
      price: yScaleRef.current.invert(clickY - margin.top)
    };
    
    // Single pulse at FINAL placement position
    setMagnetPulse({ x: finalPoint.x, y: finalPoint.y });
    setTimeout(() => setMagnetPulse(null), 400);
    
    if (hchannelPoints.length === 0) {
      // First click: first external line
      setHChannelPoints([finalPoint]);
    } else {
      // Second click: second external line - complete horizontal channel
      const click1 = hchannelPoints[0];
      const click2 = finalPoint;
      const topPrice = Math.max(click1.price, click2.price);
      const bottomPrice = Math.min(click1.price, click2.price);
      
      // Load saved defaults from localStorage
      let hchDefaults = {
        topLineColor: '#22c55e',
        topLineThickness: 2,
        topLineStyle: 'solid' as LineStyle,
        bottomLineColor: '#ef4444',
        bottomLineThickness: 2,
        bottomLineStyle: 'solid' as LineStyle,
        fillColor: 'transparent' as string,
        fillOpacity: 0.1,
        internalLines: [
          { percent: 25, visible: true, color: '#facc15', style: 'dashed' as LineStyle },
          { percent: 50, visible: true, color: '#facc15', style: 'dashed' as LineStyle },
          { percent: 75, visible: true, color: '#facc15', style: 'dashed' as LineStyle },
        ],
        showLabelLeft: false,
        showLabelCenter: false,
        showLabelRight: false,
        extendLeft: false,
        extendRight: false,
      };
      try {
        const saved = localStorage.getItem('hchannelDefaults');
        if (saved) {
          const parsed = JSON.parse(saved);
          hchDefaults = { 
            ...hchDefaults, 
            ...parsed, 
            internalLines: parsed.internalLines ? JSON.parse(JSON.stringify(parsed.internalLines)) : hchDefaults.internalLines 
          };
        }
      } catch {}
      
      const newHChannel: HorizontalChannelData = {
        id: `hch-${Date.now()}`,
        x1: click1.time,
        x2: click2.time,
        topPrice,
        bottomPrice,
        color: channelDefaults.color,
        opacity: channelDefaults.opacity,
        lineStyle: channelDefaults.lineStyle,
        thickness: channelDefaults.thickness,
        topLineColor: hchDefaults.topLineColor,
        topLineThickness: hchDefaults.topLineThickness,
        topLineStyle: hchDefaults.topLineStyle,
        bottomLineColor: hchDefaults.bottomLineColor,
        bottomLineThickness: hchDefaults.bottomLineThickness,
        bottomLineStyle: hchDefaults.bottomLineStyle,
        fillColor: hchDefaults.fillColor,
        fillOpacity: hchDefaults.fillOpacity,
        internalLines: hchDefaults.internalLines,
        showLabelLeft: hchDefaults.showLabelLeft,
        showLabelCenter: hchDefaults.showLabelCenter,
        showLabelRight: hchDefaults.showLabelRight,
        extendLeft: hchDefaults.extendLeft,
        extendRight: hchDefaults.extendRight,
      };
      const newHChannels = [...drawnHChannels, newHChannel];
      setDrawnHChannels(newHChannels);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: newHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
      setHChannelPoints([]);
      // Keep tool active for drawing more
    }
  }, [hchannelPoints, margin, channelDefaults, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Handle click on horizontal channel to select it
  const handleHChannelSelect = useCallback((channelId: string, clickX: number, clickY: number) => {
    const now = Date.now();
    // Debounce rapid selection events (prevents duplicate touch+click)
    if (now - lastSelectionTimeRef.current < CLICK_DEBOUNCE) {
      return;
    }
    lastSelectionTimeRef.current = now;
    
    // Close all other menus first
    setSelectedTrendline(null);
    setTrendlineMenuPos(null);
    setActiveSubmenu(null);
    setMovingTrendline(null);
    setMoveMode(false);
    setMovingPoint(null);
    setMovingWholeLine(null);
    setHorizontalMenuPos(null);
    setSelectedHorizontal(null);
    setChannelMenuPos(null);
    setSelectedChannel(null);
    setSChannelMenuPos(null);
    setSelectedSChannel(null);
    setTextLabelMenuPos(null);
    setSelectedTextLabel(null);
    
    setSelectedHChannel(channelId);
    setMovingHChannel(channelId); // Auto enter move mode
    const menuPos = constrainMenuPosition(clickX, clickY, 200, 350);
    setHChannelMenuPos(menuPos);
  }, [constrainMenuPosition]);

  // Delete selected horizontal channel
  const deleteHChannel = useCallback(() => {
    if (selectedHChannel) {
      const newHChannels = drawnHChannels.filter(c => c.id !== selectedHChannel);
      setDrawnHChannels(newHChannels);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: newHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
      setSelectedHChannel(null);
      setHChannelMenuPos(null);
      setMovingHChannel(null);
    }
  }, [selectedHChannel, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Update horizontal channel property
  const updateHChannel = useCallback((id: string, updates: Partial<HorizontalChannelData>) => {
    const newHChannels = drawnHChannels.map(c => c.id === id ? { ...c, ...updates } : c);
    setDrawnHChannels(newHChannels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: newHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Close horizontal channel menu
  const closeHChannelMenu = useCallback(() => {
    setSelectedHChannel(null);
    setHChannelMenuPos(null);
    setMovingHChannel(null);
  }, []);

  // === SLOPED CHANNEL HANDLERS === (3-click)
  // Click 1 & 2: Establish baseline direction and length
  // Click 3: Set channel height (perpendicular offset for parallel line)
  const handleSChannelPlacement = useCallback((clickX: number, clickY: number) => {
    const now = Date.now();
    // Debounce rapid clicks
    if (now - lastClickTimeRef.current < CLICK_DEBOUNCE) {
      return;
    }
    lastClickTimeRef.current = now;
    
    if (!xScaleRef.current || !yScaleRef.current) return;
    
    // Try magnet first, fallback to free
    const magnetPoint = findMagnetPoint(clickX, clickY);
    const finalPoint = magnetPoint || {
      x: clickX,
      y: clickY,
      time: xScaleRef.current.invert(clickX - margin.left).getTime(),
      price: yScaleRef.current.invert(clickY - margin.top)
    };
    
    // Single pulse at FINAL placement position
    setMagnetPulse({ x: finalPoint.x, y: finalPoint.y });
    setTimeout(() => setMagnetPulse(null), 400);
    
    if (schannelPoints.length === 0) {
      // First click: start of baseline
      setSChannelPoints([finalPoint]);
    } else if (schannelPoints.length === 1) {
      // Second click: end of baseline (establishes direction and length)
      setSChannelPoints([schannelPoints[0], finalPoint]);
    } else if (schannelPoints.length === 2) {
      // Third click: sets the parallel offset (channel height)
      const baseP1 = schannelPoints[0];
      const baseP2 = schannelPoints[1];
      const offsetPoint = finalPoint;
      
      // Calculate perpendicular price offset from baseline to click3
      // Project click3 onto the baseline to get the perpendicular distance in price terms
      const baseSlope = (baseP2.price - baseP1.price) / (baseP2.time - baseP1.time);
      
      // Find price on baseline at the same time as offsetPoint
      const baselinePriceAtOffset = baseP1.price + baseSlope * (offsetPoint.time - baseP1.time);
      const priceOffset = offsetPoint.price - baselinePriceAtOffset;
      
      // Create parallel lines - baseline becomes one line, offset line is parallel
      let topLine: { p1: { time: number; price: number }; p2: { time: number; price: number } };
      let bottomLine: { p1: { time: number; price: number }; p2: { time: number; price: number } };
      
      if (priceOffset >= 0) {
        // Click3 is above baseline - baseline is bottom, parallel is top
        bottomLine = {
          p1: { time: baseP1.time, price: baseP1.price },
          p2: { time: baseP2.time, price: baseP2.price }
        };
        topLine = {
          p1: { time: baseP1.time, price: baseP1.price + priceOffset },
          p2: { time: baseP2.time, price: baseP2.price + priceOffset }
        };
      } else {
        // Click3 is below baseline - baseline is top, parallel is bottom
        topLine = {
          p1: { time: baseP1.time, price: baseP1.price },
          p2: { time: baseP2.time, price: baseP2.price }
        };
        bottomLine = {
          p1: { time: baseP1.time, price: baseP1.price + priceOffset },
          p2: { time: baseP2.time, price: baseP2.price + priceOffset }
        };
      }
      
      // Load saved defaults from localStorage
      let schDefaults = {
        topLineColor: '#22c55e',
        topLineThickness: 2,
        topLineStyle: 'solid' as LineStyle,
        bottomLineColor: '#ef4444',
        bottomLineThickness: 2,
        bottomLineStyle: 'solid' as LineStyle,
        fillColor: 'transparent' as string,
        fillOpacity: 0.1,
        internalLines: [
          { percent: 25, visible: true, color: '#facc15', style: 'dashed' as LineStyle },
          { percent: 50, visible: true, color: '#facc15', style: 'dashed' as LineStyle },
          { percent: 75, visible: true, color: '#facc15', style: 'dashed' as LineStyle },
        ],
        showLabelLeft: false,
        showLabelCenter: false,
        showLabelRight: false,
        extendLeft: false,
        extendRight: false,
      };
      try {
        const saved = localStorage.getItem('schannelDefaults');
        if (saved) {
          const parsed = JSON.parse(saved);
          schDefaults = { 
            ...schDefaults, 
            ...parsed, 
            internalLines: parsed.internalLines ? JSON.parse(JSON.stringify(parsed.internalLines)) : schDefaults.internalLines 
          };
        }
      } catch {}
      
      const newSChannel: SlopedChannelData = {
        id: `sch-${Date.now()}`,
        topLine,
        bottomLine,
        color: channelDefaults.color,
        opacity: channelDefaults.opacity,
        lineStyle: channelDefaults.lineStyle,
        thickness: channelDefaults.thickness,
        topLineColor: schDefaults.topLineColor,
        topLineThickness: schDefaults.topLineThickness,
        topLineStyle: schDefaults.topLineStyle,
        bottomLineColor: schDefaults.bottomLineColor,
        bottomLineThickness: schDefaults.bottomLineThickness,
        bottomLineStyle: schDefaults.bottomLineStyle,
        fillColor: schDefaults.fillColor,
        fillOpacity: schDefaults.fillOpacity,
        internalLines: schDefaults.internalLines,
        showLabelLeft: schDefaults.showLabelLeft,
        showLabelCenter: schDefaults.showLabelCenter,
        showLabelRight: schDefaults.showLabelRight,
        extendLeft: schDefaults.extendLeft,
        extendRight: schDefaults.extendRight,
      };
      const newSChannels = [...drawnSChannels, newSChannel];
      setDrawnSChannels(newSChannels);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: newSChannels, labels: drawnTextLabels });
      setSChannelPoints([]);
      // Keep tool active for drawing more
    }
  }, [schannelPoints, margin, channelDefaults, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Handle click on sloped channel to select it
  const handleSChannelSelect = useCallback((channelId: string, clickX: number, clickY: number) => {
    const now = Date.now();
    // Debounce rapid selection events (prevents duplicate touch+click)
    if (now - lastSelectionTimeRef.current < CLICK_DEBOUNCE) {
      return;
    }
    lastSelectionTimeRef.current = now;
    
    // Track when selection occurred to prevent immediate close
    selectionTimeRef.current = now;
    
    setSelectedSChannel(channelId);
    setMovingSChannel(channelId); // Auto enter move mode
    closeTrendlineMenu();
    closeHorizontalMenu();
    closeChannelMenu();
    setSelectedTextLabel(null);
    setTextLabelMenuPos(null);
    setSelectedHChannel(null);
    setHChannelMenuPos(null);
    const menuPos = constrainMenuPosition(clickX, clickY, 200, 350);
    setSChannelMenuPos(menuPos);
  }, [constrainMenuPosition, closeTrendlineMenu, closeHorizontalMenu, closeChannelMenu]);

  // Delete selected sloped channel
  const deleteSChannel = useCallback(() => {
    if (selectedSChannel) {
      const newSChannels = drawnSChannels.filter(c => c.id !== selectedSChannel);
      setDrawnSChannels(newSChannels);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: newSChannels, labels: drawnTextLabels });
      setSelectedSChannel(null);
      setSChannelMenuPos(null);
      setMovingSChannel(null);
    }
  }, [selectedSChannel, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Update sloped channel property
  const updateSChannel = useCallback((id: string, updates: Partial<SlopedChannelData>) => {
    const newSChannels = drawnSChannels.map(c => c.id === id ? { ...c, ...updates } : c);
    setDrawnSChannels(newSChannels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: newSChannels, labels: drawnTextLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Close sloped channel menu
  const closeSChannelMenu = useCallback(() => {
    setSelectedSChannel(null);
    setSChannelMenuPos(null);
    setMovingSChannel(null);
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
    
    // Capture current zoom scale for dynamic visibility
    const currentZoomScale = zoomTransformRef.current?.k ?? 1;
    
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
      createdAtZoomScale: currentZoomScale,
    };
    const newLabels = [...drawnTextLabels, newLabel];
    setDrawnTextLabels(newLabels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: newLabels });
  }, [margin, textLabelDefaults, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Handle click on text label to select it
  const handleTextLabelSelect = useCallback((labelId: string, clickX: number, clickY: number) => {
    const now = Date.now();
    // Debounce rapid selection events (prevents duplicate touch+click)
    if (now - lastSelectionTimeRef.current < CLICK_DEBOUNCE) {
      return;
    }
    lastSelectionTimeRef.current = now;
    
    // Track when selection occurred to prevent immediate close
    selectionTimeRef.current = now;
    
    setSelectedTextLabel(labelId);
    closeTrendlineMenu();
    closeHorizontalMenu();
    closeChannelMenu();
    const menuPos = constrainMenuPosition(clickX, clickY, 180, 200);
    setTextLabelMenuPos(menuPos);
  }, [constrainMenuPosition, closeTrendlineMenu, closeHorizontalMenu, closeChannelMenu]);

  // Delete selected text label
  const deleteTextLabel = useCallback(() => {
    if (selectedTextLabel) {
      const newLabels = drawnTextLabels.filter(l => l.id !== selectedTextLabel);
      setDrawnTextLabels(newLabels);
      saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: newLabels });
      setSelectedTextLabel(null);
      setTextLabelMenuPos(null);
    }
  }, [selectedTextLabel, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);

  // Update text label property
  const updateTextLabel = useCallback((id: string, updates: Partial<TextLabelData>) => {
    const newLabels = drawnTextLabels.map(l => l.id === id ? { ...l, ...updates } : l);
    setDrawnTextLabels(newLabels);
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: newLabels });
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);
  
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
    saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
    setMovingWholeLine(null);
    setSelectedTrendline(null);
  }, [movingWholeLine, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, margin.left, margin.top, saveToHistory]);
  
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
    saveToHistory({ trendlines: drawnTrendlines, horizontals: newHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
    setMovingHorizontal(null);
    setSelectedHorizontal(null);
    setHorizontalMenuPos(null);
  }, [movingHorizontal, margin.top, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);
  
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
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: newLabels });
    setMovingTextLabel(null);
    setSelectedTextLabel(null);
    setTextLabelMenuPos(null);
  }, [movingTextLabel, margin.left, margin.top, findMagnetPoint, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);
  
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
    saveToHistory({ trendlines: drawnTrendlines, horizontals: drawnHorizontals, channels: newChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
    setMovingChannel(null);
    setSelectedChannel(null);
    setChannelMenuPos(null);
  }, [movingChannel, drawnChannels, drawnTrendlines, drawnHorizontals, drawnHChannels, drawnSChannels, drawnTextLabels, margin.left, margin.top, findMagnetPoint, saveToHistory]);
  
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
  
  // Collect all drawing elements within the hit radius (for selection picker)
  const collectHitCandidates = useCallback((clickX: number, clickY: number): SelectionCandidate[] => {
    if (!xScaleRef.current || !yScaleRef.current) return [];
    const threshold = MAGNET_RADIUS; // Use magnet radius for hit detection
    const candidates: SelectionCandidate[] = [];
    
    // Helper to calculate distance from point to line segment
    const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
      const lineLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (lineLen === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (lineLen * lineLen)));
      const nearestX = x1 + t * (x2 - x1);
      const nearestY = y1 + t * (y2 - y1);
      return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
    };
    
    // Helper to calculate distance from point to infinite line (not clamped to segment)
    const distToLine = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
      const lineLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (lineLen === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      // Distance = |cross product| / |line length|
      return Math.abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1) / lineLen;
    };
    
    // Check trendlines - account for extensions when detecting hits
    // Also check visibility based on zoom level
    const currentK = zoomTransformRef.current?.k ?? 1;
    console.log('🎯 Hit detection:', { clickX, clickY, currentK, trendlineCount: drawnTrendlines.length });
    for (const line of drawnTrendlines) {
      // Calculate visibility based on zoom level when created
      const createdK = line.createdAtZoomScale ?? 1;
      const zoomRatio = currentK / createdK;
      // Skip if invisible (zoomed out too far from creation level)
      if (zoomRatio < 0.2) {
        console.log('🚫 Skipping invisible trendline:', line.id, { currentK, createdK, zoomRatio });
        continue;
      }
      
      let x1 = xScaleRef.current(new Date(line.p1.time)) + margin.left;
      let y1 = yScaleRef.current(line.p1.price) + margin.top;
      let x2 = xScaleRef.current(new Date(line.p2.time)) + margin.left;
      let y2 = yScaleRef.current(line.p2.price) + margin.top;
      
      // Calculate extended segment points if extensions are enabled
      const dx = x2 - x1;
      const dy = y2 - y1;
      if ((dx !== 0 || dy !== 0) && (line.extendLeft || line.extendRight)) {
        const slope = dy / dx;
        if (line.extendLeft) {
          // Extend to left edge of chart
          const leftX = margin.left;
          const leftY = y1 + slope * (leftX - x1);
          // Use extended point as x1,y1 if it extends left
          if (leftX < x1) {
            x1 = leftX;
            y1 = leftY;
          }
        }
        if (line.extendRight) {
          // Extend to right edge of chart
          const rightX = dimensions.width - margin.right;
          const rightY = y1 + slope * (rightX - x1);
          // Use extended point as x2,y2 if it extends right
          if (rightX > x2) {
            x2 = rightX;
            y2 = rightY;
          }
        }
      }
      
      const dist = distToSegment(clickX, clickY, x1, y1, x2, y2);
      console.log('📏 Trendline distance:', { id: line.id, dist, threshold, x1, y1, x2, y2, extendLeft: line.extendLeft, extendRight: line.extendRight });
      // Use segment distance for the (potentially extended) line
      if (dist <= threshold) {
        candidates.push({ id: line.id, type: 'trendline' });
      }
    }
    
    // Check horizontals
    for (const h of drawnHorizontals) {
      const y = yScaleRef.current(h.price) + margin.top;
      if (Math.abs(clickY - y) <= threshold) {
        candidates.push({ id: h.id, type: 'horizontal' });
      }
    }
    
    // Check legacy channels (top and bottom lines)
    for (const ch of drawnChannels) {
      const x1Top = xScaleRef.current(new Date(ch.topLine.p1.time)) + margin.left;
      const y1Top = yScaleRef.current(ch.topLine.p1.price) + margin.top;
      const x2Top = xScaleRef.current(new Date(ch.topLine.p2.time)) + margin.left;
      const y2Top = yScaleRef.current(ch.topLine.p2.price) + margin.top;
      const x1Bot = xScaleRef.current(new Date(ch.bottomLine.p1.time)) + margin.left;
      const y1Bot = yScaleRef.current(ch.bottomLine.p1.price) + margin.top;
      const x2Bot = xScaleRef.current(new Date(ch.bottomLine.p2.time)) + margin.left;
      const y2Bot = yScaleRef.current(ch.bottomLine.p2.price) + margin.top;
      if (distToSegment(clickX, clickY, x1Top, y1Top, x2Top, y2Top) <= threshold ||
          distToSegment(clickX, clickY, x1Bot, y1Bot, x2Bot, y2Bot) <= threshold) {
        candidates.push({ id: ch.id, type: 'channel' });
      }
    }
    
    // Check horizontal channels (top and bottom horizontal lines)
    for (const hch of drawnHChannels) {
      const topY = yScaleRef.current(hch.topPrice) + margin.top;
      const botY = yScaleRef.current(hch.bottomPrice) + margin.top;
      // Account for channel extensions when calculating bounds
      let leftX = xScaleRef.current(new Date(Math.min(hch.x1, hch.x2))) + margin.left;
      let rightX = xScaleRef.current(new Date(Math.max(hch.x1, hch.x2))) + margin.left;
      // If extended, use full chart width
      if (hch.extendLeft) leftX = margin.left;
      if (hch.extendRight) rightX = dimensions.width - margin.right;
      
      // Check if click is within x-range and near top or bottom line
      if (clickX >= leftX - threshold && clickX <= rightX + threshold) {
        if (Math.abs(clickY - topY) <= threshold || Math.abs(clickY - botY) <= threshold) {
          candidates.push({ id: hch.id, type: 'hchannel' });
        }
      }
      // Also check if click is inside the channel fill area (between top and bottom lines)
      const minY = Math.min(topY, botY);
      const maxY = Math.max(topY, botY);
      if (clickX >= leftX && clickX <= rightX && clickY >= minY && clickY <= maxY) {
        if (!candidates.find(c => c.id === hch.id)) {
          candidates.push({ id: hch.id, type: 'hchannel' });
        }
      }
    }
    
    // Check sloped channels (top and bottom sloped lines + fill area)
    for (const sch of drawnSChannels) {
      let x1Top = xScaleRef.current(new Date(sch.topLine.p1.time)) + margin.left;
      let y1Top = yScaleRef.current(sch.topLine.p1.price) + margin.top;
      let x2Top = xScaleRef.current(new Date(sch.topLine.p2.time)) + margin.left;
      let y2Top = yScaleRef.current(sch.topLine.p2.price) + margin.top;
      let x1Bot = xScaleRef.current(new Date(sch.bottomLine.p1.time)) + margin.left;
      let y1Bot = yScaleRef.current(sch.bottomLine.p1.price) + margin.top;
      let x2Bot = xScaleRef.current(new Date(sch.bottomLine.p2.time)) + margin.left;
      let y2Bot = yScaleRef.current(sch.bottomLine.p2.price) + margin.top;
      
      // Extend lines if extensions are enabled
      if (sch.extendLeft || sch.extendRight) {
        const dxTop = x2Top - x1Top;
        const dyTop = y2Top - y1Top;
        const dxBot = x2Bot - x1Bot;
        const dyBot = y2Bot - y1Bot;
        
        if (dxTop !== 0 || dyTop !== 0) {
          const slopeTop = dyTop / dxTop;
          const slopeBot = dyBot / dxBot;
          
          if (sch.extendLeft) {
            const leftX = margin.left;
            x1Top = leftX;
            y1Top = y1Top + slopeTop * (leftX - x1Top);
            x1Bot = leftX;
            y1Bot = y1Bot + slopeBot * (leftX - x1Bot);
          }
          if (sch.extendRight) {
            const rightX = dimensions.width - margin.right;
            x2Top = rightX;
            y2Top = y1Top + slopeTop * (rightX - x1Top);
            x2Bot = rightX;
            y2Bot = y1Bot + slopeBot * (rightX - x1Bot);
          }
        }
      }
      
      // Check if near top or bottom line
      if (distToSegment(clickX, clickY, x1Top, y1Top, x2Top, y2Top) <= threshold ||
          distToSegment(clickX, clickY, x1Bot, y1Bot, x2Bot, y2Bot) <= threshold) {
        candidates.push({ id: sch.id, type: 'schannel' });
      } else {
        // Also check if click is inside the channel fill area (parallelogram)
        // Check if point is between the two lines using cross product
        const minX = Math.min(x1Top, x2Top, x1Bot, x2Bot);
        const maxX = Math.max(x1Top, x2Top, x1Bot, x2Bot);
        if (clickX >= minX && clickX <= maxX) {
          // Interpolate Y positions on both lines at clickX
          const tTop = (clickX - x1Top) / (x2Top - x1Top || 1);
          const tBot = (clickX - x1Bot) / (x2Bot - x1Bot || 1);
          if (tTop >= 0 && tTop <= 1 && tBot >= 0 && tBot <= 1) {
            const yOnTop = y1Top + tTop * (y2Top - y1Top);
            const yOnBot = y1Bot + tBot * (y2Bot - y1Bot);
            const minY = Math.min(yOnTop, yOnBot);
            const maxY = Math.max(yOnTop, yOnBot);
            if (clickY >= minY && clickY <= maxY) {
              if (!candidates.find(c => c.id === sch.id)) {
                candidates.push({ id: sch.id, type: 'schannel' });
              }
            }
          }
        }
      }
    }
    
    // Check text labels
    for (const lbl of drawnTextLabels) {
      const x = xScaleRef.current(new Date(lbl.time)) + margin.left;
      const y = yScaleRef.current(lbl.price) + margin.top;
      // Labels have a wider hit area
      if (Math.abs(clickX - x) <= threshold && Math.abs(clickY - y) <= threshold) {
        candidates.push({ id: lbl.id, type: 'label' });
      }
    }
    
    return candidates;
  }, [drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, margin.left, margin.top, margin.right, dimensions.width, MAGNET_RADIUS]);
  
  // Close selection picker
  const closeSelectionPicker = useCallback(() => {
    setSelectionCandidates([]);
    setSelectionPickerPos(null);
    setSelectionPickerClickPos(null);
  }, []);
  
  // Handle selection from picker - uses original click position for correct menu placement
  const handlePickerSelect = useCallback((candidate: SelectionCandidate) => {
    const clickX = selectionPickerClickPos?.x ?? 0;
    const clickY = selectionPickerClickPos?.y ?? 0;
    console.log('🔘 handlePickerSelect:', { candidate, clickX, clickY });
    closeSelectionPicker();
    switch (candidate.type) {
      case 'trendline':
        handleTrendlineSelect(candidate.id, clickX, clickY);
        break;
      case 'horizontal':
        handleHorizontalSelect(candidate.id, clickX, clickY);
        break;
      case 'channel':
        handleChannelSelect(candidate.id, clickX, clickY);
        break;
      case 'hchannel':
        handleHChannelSelect(candidate.id, clickX, clickY);
        break;
      case 'schannel':
        handleSChannelSelect(candidate.id, clickX, clickY);
        break;
      case 'label':
        handleTextLabelSelect(candidate.id, clickX, clickY);
        break;
    }
  }, [closeSelectionPicker, selectionPickerClickPos, handleTrendlineSelect, handleHorizontalSelect, handleChannelSelect, handleHChannelSelect, handleSChannelSelect, handleTextLabelSelect]);

    // Unified drawing click handler - legacy support for direct element clicks
    const handleDrawingClick = useCallback((clickedId: string, clickedType: SelectionCandidate['type'], clickX: number, clickY: number) => {
      // Don't select if in drawing mode
      if (activeTool) return;
      
      // Since we now use handleSvgTapSelection for most interactions, 
      // this is mainly a fallback for desktop mouse clicks on specific elements.
      console.log('🎯 handleDrawingClick:', { clickedId, clickedType, clickX, clickY });
      
      switch (clickedType) {
        case 'trendline':
          handleTrendlineSelect(clickedId, clickX, clickY);
          break;
        case 'horizontal':
          handleHorizontalSelect(clickedId, clickX, clickY);
          break;
        case 'channel':
          handleChannelSelect(clickedId, clickX, clickY);
          break;
        case 'hchannel':
          handleHChannelSelect(clickedId, clickX, clickY);
          break;
        case 'schannel':
          handleSChannelSelect(clickedId, clickX, clickY);
          break;
        case 'label':
          handleTextLabelSelect(clickedId, clickX, clickY);
          break;
      }
    }, [activeTool, handleTrendlineSelect, handleHorizontalSelect, handleChannelSelect, handleHChannelSelect, handleSChannelSelect, handleTextLabelSelect]);
  
  // Main selection dispatcher for tap events
  const handleSvgTapSelection = useCallback((clickX: number, clickY: number) => {
    // Don't select if in drawing mode
    if (activeTool) return;
    
    // Show tap feedback circle (only if not already showing)
    // Use functional update to check current state and prevent double-pulse
    setTapFeedback(current => {
      if (current !== null) {
        console.log('⏭️ Tap feedback already showing, skipping');
        return current; // Keep existing feedback, don't restart animation
      }
      // Start new feedback with auto-clear
      setTimeout(() => setTapFeedback(null), 400);
      return { x: clickX, y: clickY };
    });
    
    const candidates = collectHitCandidates(clickX, clickY);
    console.log('🎯 Candidates found:', candidates);
    if (candidates.length > 1) {
      // Multiple overlapping elements - show picker
      const pickerX = Math.min(Math.max(clickX + 12, 60), dimensions.width - margin.right - 60);
      const pickerY = Math.min(Math.max(clickY, 50), dimensions.height - 150);
      setSelectionCandidates(candidates);
      setSelectionPickerPos({ x: pickerX, y: pickerY });
      setSelectionPickerClickPos({ x: clickX, y: clickY });
    } else if (candidates.length === 1) {
      // Single element - select directly
      const candidate = candidates[0];
      switch (candidate.type) {
        case 'trendline':
          handleTrendlineSelect(candidate.id, clickX, clickY);
          break;
        case 'horizontal':
          handleHorizontalSelect(candidate.id, clickX, clickY);
          break;
        case 'channel':
          handleChannelSelect(candidate.id, clickX, clickY);
          break;
        case 'hchannel':
          handleHChannelSelect(candidate.id, clickX, clickY);
          break;
        case 'schannel':
          handleSChannelSelect(candidate.id, clickX, clickY);
          break;
        case 'label':
          handleTextLabelSelect(candidate.id, clickX, clickY);
          break;
      }
    } else {
      // Clicked on empty space - close all menus and deselect
      console.log('🔄 Closing all menus (clicked empty space)');
      closeTrendlineMenu();
      closeHorizontalMenu();
      setSelectedChannel(null);
      setChannelMenuPos(null);
      setSelectedHChannel(null);
      setHChannelMenuPos(null);
      setMovingHChannel(null);
      setSelectedSChannel(null);
      setSChannelMenuPos(null);
      setSelectedTextLabel(null);
      setTextLabelMenuPos(null);
      setMovingWholeLine(null);
      setSelectionPickerPos(null);
      setSelectionCandidates([]);
    }
  }, [activeTool, collectHitCandidates, dimensions, margin, handleTrendlineSelect, handleHorizontalSelect, handleChannelSelect, handleHChannelSelect, handleSChannelSelect, handleTextLabelSelect, closeTrendlineMenu, closeHorizontalMenu]);
  
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
    saveToHistory({ trendlines: newTrendlines, horizontals: drawnHorizontals, channels: drawnChannels, hchannels: drawnHChannels, schannels: drawnSChannels, labels: drawnTextLabels });
    
    // Stay in move mode, just clear the moving point
    setMovingPoint(null);
  }, [movingPoint, findMagnetPoint, margin.left, margin.top, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, saveToHistory]);
  
  // Universal click pulse - show on any placement/move/selection
  const [clickPulse, setClickPulse] = useState<{ x: number; y: number } | null>(null);
  const showClickPulse = useCallback((x: number, y: number) => {
    // Use functional update to prevent double-pulse from touch + synthetic click
    setClickPulse(current => {
      if (current !== null) {
        console.log('⏭️ Click pulse already showing, skipping');
        return current; // Keep existing pulse, don't restart animation
      }
      setTimeout(() => setClickPulse(null), 400);
      return { x, y };
    });
  }, []);
  
  // Render D3 chart - D3's built-in zoom handles pan/zoom
  useEffect(() => {
    if (!svgRef.current || candles.length === 0 || dimensions.width === 0) return;
    
    const svg = d3.select(svgRef.current);
    
    // Save current zoom transform before clearing
    const currentTransform = d3.zoomTransform(svgRef.current);
    if (currentTransform.k !== 1 || currentTransform.x !== 0 || currentTransform.y !== 0) {
      zoomTransformRef.current = currentTransform;
    }
    
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
    
    // X Scale (time) - D3 zoom handles transforms
    const xScale = d3.scaleTime()
      .domain([new Date(timeExtent[0]), new Date(timeExtent[1])])
      .range([0, innerWidth]);
    xScaleRef.current = xScale;
    
    // Y Scale (price) - D3 zoom recalculates based on visible candles
    const yScale = d3.scaleLinear()
      .domain(priceExtent)
      .range([innerHeight, 0])
      .nice();
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
    
    // Drawings group (above candles, below axes overlays)
    const drawingsGroup = g.append('g')
      .attr('class', 'drawings')
      .attr('clip-path', 'url(#chart-clip)');
    
    // Function to draw all drawings with current scales
    // zoomK parameter is required for dynamic label visibility based on zoom level
    const drawDrawings = (xS: d3.ScaleTime<number, number>, yS: d3.ScaleLinear<number, number>, zoomK: number = 1) => {
      drawingsGroup.selectAll('*').remove();
      
      // Current zoom scale for dynamic visibility calculations
      const currentZoomK = zoomK;
      
      // Helper: clip line to chart boundaries
      const clipToChart = (px1: number, py1: number, px2: number, py2: number) => {
        const dx = px2 - px1;
        const dy = py2 - py1;
        let t0 = 0, t1 = 1;
        
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
        
        if (!clip(-dx, px1)) return null;
        if (!clip(dx, innerWidth - px1)) return null;
        if (!clip(-dy, py1)) return null;
        if (!clip(dy, innerHeight - py1)) return null;
        
        return {
          x1: px1 + t0 * dx,
          y1: py1 + t0 * dy,
          x2: px1 + t1 * dx,
          y2: py1 + t1 * dy
        };
      };
      
      // Draw trendlines with dynamic zoom visibility
      drawnTrendlines.forEach(line => {
        // Calculate visibility based on zoom level when created
        const createdK = line.createdAtZoomScale ?? 1;
        const zoomRatio = currentZoomK / createdK;
        // Visibility: fully visible when zoomed in more than creation level (ratio >= 1)
        // Fades out when zooming out: starts fading at ratio 0.5, invisible at ratio 0.2
        let visibilityFactor = 1;
        if (zoomRatio < 1) {
          if (zoomRatio <= 0.2) {
            visibilityFactor = 0;
          } else if (zoomRatio < 0.5) {
            visibilityFactor = (zoomRatio - 0.2) / 0.3; // Linear fade from 0.2 to 0.5
          }
        }
        
        // Skip rendering if completely invisible
        if (visibilityFactor <= 0) return;
        
        const x1 = xS(new Date(line.p1.time));
        const y1 = yS(line.p1.price);
        const x2 = xS(new Date(line.p2.time));
        const y2 = yS(line.p2.price);
        const strokeDash = line.lineStyle === 'dashed' ? '8,4' : line.lineStyle === 'dotted' ? '2,4' : '';
        const isSelected = selectedTrendline === line.id;
        
        // Apply visibility factor to opacity
        const effectiveOpacity = line.opacity * visibilityFactor;
        
        const lineGroup = drawingsGroup.append('g').attr('class', `trendline-${line.id}`);
        
        // Calculate extensions
        const dx = x2 - x1;
        const dy = y2 - y1;
        const extendAmount = 2000;
        
        if (line.extendLeft && (dx !== 0 || dy !== 0)) {
          const ratio = extendAmount / Math.sqrt(dx * dx + dy * dy);
          let extX1 = x1 - dx * ratio;
          let extY1 = y1 - dy * ratio;
          const clipped = clipToChart(extX1, extY1, x1, y1);
          if (clipped) {
            lineGroup.append('line')
              .attr('x1', clipped.x1).attr('y1', clipped.y1)
              .attr('x2', x1).attr('y2', y1)
              .attr('stroke', line.color)
              .attr('stroke-width', line.thickness || 2)
              .attr('stroke-opacity', effectiveOpacity)
              .attr('stroke-dasharray', strokeDash);
          }
        }
        
        if (line.extendRight && (dx !== 0 || dy !== 0)) {
          const ratio = extendAmount / Math.sqrt(dx * dx + dy * dy);
          let extX2 = x2 + dx * ratio;
          let extY2 = y2 + dy * ratio;
          const clipped = clipToChart(x2, y2, extX2, extY2);
          if (clipped) {
            lineGroup.append('line')
              .attr('x1', x2).attr('y1', y2)
              .attr('x2', clipped.x2).attr('y2', clipped.y2)
              .attr('stroke', line.color)
              .attr('stroke-width', line.thickness || 2)
              .attr('stroke-opacity', effectiveOpacity)
              .attr('stroke-dasharray', strokeDash);
          }
        }
        
        // Invisible hit area - no click handler, selection handled via SVG tap detection
        lineGroup.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
          .attr('stroke', 'transparent')
          .attr('stroke-width', 12)
          .style('pointer-events', 'none');
        
        // Visible line
        lineGroup.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
          .attr('stroke', line.color)
          .attr('stroke-width', line.thickness || 2)
          .attr('stroke-opacity', effectiveOpacity)
          .attr('stroke-dasharray', strokeDash)
          .style('pointer-events', 'none');
        
        // Selection indicators
        if (isSelected || (moveMode && movingTrendline === line.id)) {
          // Endpoint 1
          lineGroup.append('circle')
            .attr('cx', x1).attr('cy', y1).attr('r', moveMode ? 20 : 5)
            .attr('fill', 'transparent')
            .style('cursor', moveMode ? 'pointer' : 'default')
            .on('click', function(event) {
              if (moveMode) {
                event.stopPropagation();
                // Prevent phantom clicks from activating move mode right after selection
                const timeSinceSelection = Date.now() - selectionTimeRef.current;
                if (timeSinceSelection < 300) return;
                handleEndpointClick(line.id, 'p1');
              }
            });
          lineGroup.append('circle')
            .attr('cx', x1).attr('cy', y1).attr('r', moveMode ? 8 : 5)
            .attr('fill', line.color).attr('stroke', 'white').attr('stroke-width', 2)
            .style('pointer-events', 'none');
          
          // Center point
          lineGroup.append('circle')
            .attr('cx', (x1 + x2) / 2).attr('cy', (y1 + y2) / 2).attr('r', 18)
            .attr('fill', 'transparent')
            .style('cursor', 'pointer')
            .on('click', function(event) {
              event.stopPropagation();
              // Prevent phantom clicks from activating move mode right after selection
              const timeSinceSelection = Date.now() - selectionTimeRef.current;
              if (timeSinceSelection < 300) {
                console.log('⏭️ Ignoring phantom click on center point');
                return;
              }
              if (movingWholeLine === line.id) {
                setMovingWholeLine(null);
              } else {
                setMovingWholeLine(line.id);
                setTrendlineMenuPos(null);
              }
            });
          lineGroup.append('circle')
            .attr('cx', (x1 + x2) / 2).attr('cy', (y1 + y2) / 2)
            .attr('r', movingWholeLine === line.id ? 8 : 6)
            .attr('fill', movingWholeLine === line.id ? '#22c55e' : 'white')
            .attr('stroke', line.color).attr('stroke-width', 2)
            .style('pointer-events', 'none');
          
          // Endpoint 2
          lineGroup.append('circle')
            .attr('cx', x2).attr('cy', y2).attr('r', moveMode ? 20 : 5)
            .attr('fill', 'transparent')
            .style('cursor', moveMode ? 'pointer' : 'default')
            .on('click', function(event) {
              if (moveMode) {
                event.stopPropagation();
                // Prevent phantom clicks from activating move mode right after selection
                const timeSinceSelection = Date.now() - selectionTimeRef.current;
                if (timeSinceSelection < 300) return;
                handleEndpointClick(line.id, 'p2');
              }
            });
          lineGroup.append('circle')
            .attr('cx', x2).attr('cy', y2).attr('r', moveMode ? 8 : 5)
            .attr('fill', line.color).attr('stroke', 'white').attr('stroke-width', 2)
            .style('pointer-events', 'none');
        }
        
        // Labels - 6 position support (top-left, top-center, top-right, bottom-left, bottom-center, bottom-right)
        if (line.label && line.label.positions) {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          line.label.positions.forEach(pos => {
            let labelX: number;
            let labelY: number;
            let textAnchor: string;
            
            // Horizontal position
            if (pos.includes('left')) {
              labelX = x1;
              textAnchor = 'start';
            } else if (pos.includes('center')) {
              labelX = midX;
              textAnchor = 'middle';
            } else {
              labelX = x2;
              textAnchor = 'end';
            }
            
            // Vertical position - get the Y at that X point
            const baseY = pos.includes('left') ? y1 : pos.includes('center') ? midY : y2;
            labelY = pos.includes('top') ? baseY - 10 : baseY + 18;
            
            lineGroup.append('text')
              .attr('x', labelX)
              .attr('y', labelY)
              .attr('fill', line.color)
              .attr('font-size', '11px')
              .attr('font-weight', 'bold')
              .attr('text-anchor', textAnchor)
              .text(line.label.text);
          });
        }
      });
      
      // Draw horizontal lines
      drawnHorizontals.forEach(line => {
        const y = yS(line.price);
        const strokeDash = line.lineStyle === 'dashed' ? '8,4' : line.lineStyle === 'dotted' ? '2,4' : '';
        const isSelected = selectedHorizontal === line.id;
        
        const lineGroup = drawingsGroup.append('g').attr('class', `horizontal-${line.id}`);
        
        // Invisible hit area - no click handler, selection handled via SVG tap detection
        lineGroup.append('line')
          .attr('x1', 0).attr('y1', y).attr('x2', innerWidth).attr('y2', y)
          .attr('stroke', 'transparent')
          .attr('stroke-width', 12)
          .style('pointer-events', 'none');
        
        // Visible line
        lineGroup.append('line')
          .attr('x1', 0).attr('y1', y).attr('x2', innerWidth).attr('y2', y)
          .attr('stroke', line.color)
          .attr('stroke-width', line.thickness || 2)
          .attr('stroke-opacity', line.opacity)
          .attr('stroke-dasharray', strokeDash)
          .style('pointer-events', 'none');
        
        // Selection indicators
        if (isSelected) {
          lineGroup.append('circle')
            .attr('cx', 20).attr('cy', y).attr('r', 5)
            .attr('fill', line.color).attr('stroke', 'white').attr('stroke-width', 2);
          lineGroup.append('circle')
            .attr('cx', innerWidth - 20).attr('cy', y).attr('r', 5)
            .attr('fill', line.color).attr('stroke', 'white').attr('stroke-width', 2);
        }
        
        // Price label - always show for horizontal lines
        const priceText = line.price >= 1000 ? line.price.toFixed(2) : line.price.toFixed(4);
        lineGroup.append('rect')
          .attr('x', innerWidth + 2).attr('y', y - 10)
          .attr('width', 60).attr('height', 20)
          .attr('fill', line.color).attr('rx', 3);
        lineGroup.append('text')
          .attr('x', innerWidth + 32).attr('y', y + 4)
          .attr('text-anchor', 'middle')
          .attr('fill', 'white').attr('font-size', '10px')
          .text(priceText);
        
        // Custom text labels at 6 positions (with backward compatibility for old formats)
        if (line.label && line.label.text) {
          // Support old formats and new 6-position format
          const positions = line.label.positions || ((line.label as any).position ? [(line.label as any).position] : ['top-right']);
          positions.forEach(pos => {
            let labelX: number;
            let labelY: number;
            let textAnchor: string;
            
            // Horizontal position
            if (pos.includes('left')) {
              labelX = 10;
              textAnchor = 'start';
            } else if (pos.includes('center')) {
              labelX = innerWidth / 2;
              textAnchor = 'middle';
            } else {
              labelX = innerWidth - 70; // Offset from price label
              textAnchor = 'end';
            }
            
            // Vertical position
            labelY = pos.includes('top') ? y - 8 : y + 18;
            
            lineGroup.append('text')
              .attr('x', labelX).attr('y', labelY)
              .attr('fill', line.color)
              .attr('font-size', '11px')
              .attr('font-weight', 'bold')
              .attr('text-anchor', textAnchor)
              .text(line.label!.text);
          });
        }
      });
      
      // Draw channels (parallel lines offset by width)
      drawnChannels.forEach(channel => {
        const x1 = xS(new Date(channel.p1.time));
        const y1 = yS(channel.p1.price);
        const x2 = xS(new Date(channel.p2.time));
        const y2 = yS(channel.p2.price);
        // Channel width is in price units, convert to screen
        const widthPx = Math.abs(yS(0) - yS(channel.width));
        const isSelected = selectedChannel === channel.id;
        
        const channelGroup = drawingsGroup.append('g').attr('class', `channel-${channel.id}`);
        
        // Calculate perpendicular offset for parallel lines
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = len > 0 ? -dy / len * widthPx / 2 : 0;
        const ny = len > 0 ? dx / len * widthPx / 2 : widthPx / 2;
        
        // Top line (offset up)
        const y1Top = y1 - ny;
        const y2Top = y2 - ny;
        const x1Top = x1 - nx;
        const x2Top = x2 - nx;
        
        // Bottom line (offset down)
        const y1Bot = y1 + ny;
        const y2Bot = y2 + ny;
        const x1Bot = x1 + nx;
        const x2Bot = x2 + nx;
        
        // Fill - no click handler, selection handled via SVG tap detection
        channelGroup.append('polygon')
          .attr('points', `${x1Top},${y1Top} ${x2Top},${y2Top} ${x2Bot},${y2Bot} ${x1Bot},${y1Bot}`)
          .attr('fill', channel.color)
          .attr('fill-opacity', 0.1)
          .style('pointer-events', 'none');
        
        // Top line
        channelGroup.append('line')
          .attr('x1', x1Top).attr('y1', y1Top).attr('x2', x2Top).attr('y2', y2Top)
          .attr('stroke', channel.color)
          .attr('stroke-width', channel.thickness || 2)
          .attr('stroke-opacity', channel.opacity)
          .style('pointer-events', 'none');
        
        // Bottom line
        channelGroup.append('line')
          .attr('x1', x1Bot).attr('y1', y1Bot).attr('x2', x2Bot).attr('y2', y2Bot)
          .attr('stroke', channel.color)
          .attr('stroke-width', channel.thickness || 2)
          .attr('stroke-opacity', channel.opacity)
          .style('pointer-events', 'none');
        
        // Selection indicators
        if (isSelected) {
          [{ x: x1Top, y: y1Top }, { x: x1Bot, y: y1Bot }, { x: x2Top, y: y2Top }, { x: x2Bot, y: y2Bot }].forEach(pt => {
            channelGroup.append('circle')
              .attr('cx', pt.x).attr('cy', pt.y).attr('r', 5)
              .attr('fill', channel.color).attr('stroke', 'white').attr('stroke-width', 2);
          });
        }
      });
      
      // Draw horizontal channels (new - 2 click mode)
      drawnHChannels.forEach(hchannel => {
        let x1 = xS(new Date(hchannel.x1));
        let x2 = xS(new Date(hchannel.x2));
        const yTop = yS(hchannel.topPrice);
        const yBottom = yS(hchannel.bottomPrice);
        const isSelected = selectedHChannel === hchannel.id;
        
        // Extend left/right for horizontal channels
        const origX1 = x1, origX2 = x2;
        if (hchannel.extendLeft) x1 = margin.left;
        if (hchannel.extendRight) x2 = dimensions.width - margin.right;
        
        const hchannelGroup = drawingsGroup.append('g').attr('class', `hchannel-${hchannel.id}`);
        
        // Fill area - use min/max to handle any draw direction, no click handler
        const yMin = Math.min(yTop, yBottom);
        const yMax = Math.max(yTop, yBottom);
        hchannelGroup.append('rect')
          .attr('x', Math.min(x1, x2))
          .attr('y', yMin)
          .attr('width', Math.abs(x2 - x1))
          .attr('height', Math.max(1, yMax - yMin))
          .attr('fill', hchannel.fillColor || hchannel.color)
          .attr('fill-opacity', hchannel.fillOpacity ?? 0.1)
          .style('pointer-events', 'none');
        
        // Top external line
        const topStrokeDash = hchannel.topLineStyle === 'dashed' ? '8,4' : hchannel.topLineStyle === 'dotted' ? '2,4' : '';
        hchannelGroup.append('line')
          .attr('x1', x1).attr('y1', yTop).attr('x2', x2).attr('y2', yTop)
          .attr('stroke', hchannel.topLineColor || hchannel.color)
          .attr('stroke-width', hchannel.topLineThickness || 2)
          .attr('stroke-opacity', hchannel.opacity)
          .attr('stroke-dasharray', topStrokeDash)
          .style('pointer-events', 'none');
        
        // Calculate label positions, keeping on screen (avoid toolbar ~50px and axis ~60px)
        const chartLeft = margin.left + 50;
        const chartRight = dimensions.width - margin.right - 60;
        const leftX = Math.max(Math.min(x1, x2) + 5, chartLeft);
        const centerX = Math.max(chartLeft, Math.min(chartRight, (x1 + x2) / 2));
        const rightX = Math.min(Math.max(x1, x2) - 5, chartRight);
        
        // Helper to render label at multiple positions with optional background
        const renderHLabel = (text: string, yPos: number, yOffset: number, color: string, fontSize: string = '11px', bold: boolean = true, bgColor?: string) => {
          const renderWithBg = (x: number, anchor: string) => {
            const textEl = hchannelGroup.append('text').attr('x', x).attr('y', yPos + yOffset)
              .attr('fill', color).attr('font-size', fontSize).attr('font-weight', bold ? 'bold' : 'normal')
              .attr('text-anchor', anchor).text(text);
            if (bgColor && bgColor !== 'transparent') {
              const bbox = (textEl.node() as SVGTextElement)?.getBBox();
              if (bbox) {
                hchannelGroup.insert('rect', 'text').attr('x', bbox.x - 2).attr('y', bbox.y - 1)
                  .attr('width', bbox.width + 4).attr('height', bbox.height + 2)
                  .attr('fill', bgColor).attr('rx', 2);
              }
            }
          };
          if (hchannel.showLabelLeft) renderWithBg(leftX, 'start');
          if (hchannel.showLabelCenter) renderWithBg(centerX, 'middle');
          if (hchannel.showLabelRight) renderWithBg(rightX, 'end');
        };
        
        // Top line label
        if (hchannel.topLabel) {
          renderHLabel(hchannel.topLabel, yTop, -3, hchannel.topLineColor || hchannel.color);
        }
        
        // Bottom external line
        const bottomStrokeDash = hchannel.bottomLineStyle === 'dashed' ? '8,4' : hchannel.bottomLineStyle === 'dotted' ? '2,4' : '';
        hchannelGroup.append('line')
          .attr('x1', x1).attr('y1', yBottom).attr('x2', x2).attr('y2', yBottom)
          .attr('stroke', hchannel.bottomLineColor || hchannel.color)
          .attr('stroke-width', hchannel.bottomLineThickness || 2)
          .attr('stroke-opacity', hchannel.opacity)
          .attr('stroke-dasharray', bottomStrokeDash)
          .style('pointer-events', 'none');
        
        // Bottom line label
        if (hchannel.bottomLabel) {
          renderHLabel(hchannel.bottomLabel, yBottom, 12, hchannel.bottomLineColor || hchannel.color);
        }
        
        // Internal lines (25%, 50%, 75% - dashed)
        hchannel.internalLines.forEach(line => {
          if (line.visible) {
            const yInternal = yTop + (yBottom - yTop) * (line.percent / 100);
            const strokeDash = line.style === 'dashed' ? '8,4' : line.style === 'dotted' ? '2,4' : '';
            hchannelGroup.append('line')
              .attr('x1', x1).attr('y1', yInternal).attr('x2', x2).attr('y2', yInternal)
              .attr('stroke', line.color || hchannel.color)
              .attr('stroke-width', 1)
              .attr('stroke-opacity', hchannel.opacity * 0.7)
              .attr('stroke-dasharray', strokeDash)
              .style('pointer-events', 'none');
            
            // Internal line label
            if (line.label) {
              renderHLabel(line.label, yInternal, 4, line.color || hchannel.color, '10px', false, line.bgColor);
            }
          }
        });
        
        // Selection indicators
        if (isSelected) {
          [{ x: x1, y: yTop }, { x: x2, y: yTop }, { x: x1, y: yBottom }, { x: x2, y: yBottom }].forEach(pt => {
            hchannelGroup.append('circle')
              .attr('cx', pt.x).attr('cy', pt.y).attr('r', 5)
              .attr('fill', hchannel.color).attr('stroke', 'white').attr('stroke-width', 2);
          });
        }
      });
      
      // Draw sloped channels (new - 3 click mode)
      drawnSChannels.forEach(schannel => {
        let topX1 = xS(new Date(schannel.topLine.p1.time));
        let topY1 = yS(schannel.topLine.p1.price);
        let topX2 = xS(new Date(schannel.topLine.p2.time));
        let topY2 = yS(schannel.topLine.p2.price);
        let botX1 = xS(new Date(schannel.bottomLine.p1.time));
        let botY1 = yS(schannel.bottomLine.p1.price);
        let botX2 = xS(new Date(schannel.bottomLine.p2.time));
        let botY2 = yS(schannel.bottomLine.p2.price);
        const isSelected = selectedSChannel === schannel.id;
        
        // Extend left/right for sloped channels (calculate slope and extend)
        if (schannel.extendLeft || schannel.extendRight) {
          const topSlope = topX2 !== topX1 ? (topY2 - topY1) / (topX2 - topX1) : 0;
          const botSlope = botX2 !== botX1 ? (botY2 - botY1) / (botX2 - botX1) : 0;
          if (schannel.extendLeft) {
            const leftX = margin.left;
            topY1 = topY1 + topSlope * (leftX - topX1);
            topX1 = leftX;
            botY1 = botY1 + botSlope * (leftX - botX1);
            botX1 = leftX;
          }
          if (schannel.extendRight) {
            const rightX = dimensions.width - margin.right;
            topY2 = topY2 + topSlope * (rightX - topX2);
            topX2 = rightX;
            botY2 = botY2 + botSlope * (rightX - botX2);
            botX2 = rightX;
          }
        }
        
        const schannelGroup = drawingsGroup.append('g').attr('class', `schannel-${schannel.id}`);
        
        // Fill area (polygon between the two lines) - no click handler
        schannelGroup.append('polygon')
          .attr('points', `${topX1},${topY1} ${topX2},${topY2} ${botX2},${botY2} ${botX1},${botY1}`)
          .attr('fill', schannel.fillColor || schannel.color)
          .attr('fill-opacity', schannel.fillOpacity ?? 0.1)
          .style('pointer-events', 'none');
        
        // Top external line
        const sTopStrokeDash = schannel.topLineStyle === 'dashed' ? '8,4' : schannel.topLineStyle === 'dotted' ? '2,4' : '';
        schannelGroup.append('line')
          .attr('x1', topX1).attr('y1', topY1).attr('x2', topX2).attr('y2', topY2)
          .attr('stroke', schannel.topLineColor || schannel.color)
          .attr('stroke-width', schannel.topLineThickness || 2)
          .attr('stroke-opacity', schannel.opacity)
          .attr('stroke-dasharray', sTopStrokeDash)
          .style('pointer-events', 'none');
        
        // Calculate label positions for sloped channel, keeping on screen (avoid toolbar ~50px and axis ~60px)
        const sChartLeft = margin.left + 50;
        const sChartRight = dimensions.width - margin.right - 60;
        
        // Helper to render sloped channel labels at multiple positions with optional background
        const renderSLabel = (text: string, lx1: number, ly1: number, lx2: number, ly2: number, yOffset: number, color: string, fontSize: string = '11px', bold: boolean = true, bgColor?: string) => {
          const renderWithBg = (x: number, y: number, anchor: string) => {
            const textEl = schannelGroup.append('text').attr('x', x).attr('y', y + yOffset)
              .attr('fill', color).attr('font-size', fontSize).attr('font-weight', bold ? 'bold' : 'normal')
              .attr('text-anchor', anchor).text(text);
            if (bgColor && bgColor !== 'transparent') {
              const bbox = (textEl.node() as SVGTextElement)?.getBBox();
              if (bbox) {
                schannelGroup.insert('rect', 'text').attr('x', bbox.x - 2).attr('y', bbox.y - 1)
                  .attr('width', bbox.width + 4).attr('height', bbox.height + 2)
                  .attr('fill', bgColor).attr('rx', 2);
              }
            }
          };
          if (schannel.showLabelLeft) {
            const lX = Math.max(Math.min(lx1, lx2) + 5, sChartLeft);
            const lY = lx1 < lx2 ? ly1 : ly2;
            renderWithBg(lX, lY, 'start');
          }
          if (schannel.showLabelCenter) {
            const cX = Math.max(sChartLeft, Math.min(sChartRight, (lx1 + lx2) / 2));
            const cY = (ly1 + ly2) / 2;
            renderWithBg(cX, cY, 'middle');
          }
          if (schannel.showLabelRight) {
            const rX = Math.min(Math.max(lx1, lx2) - 5, sChartRight);
            const rY = lx1 > lx2 ? ly1 : ly2;
            renderWithBg(rX, rY, 'end');
          }
        };
        
        // Top line label
        if (schannel.topLabel) {
          renderSLabel(schannel.topLabel, topX1, topY1, topX2, topY2, -5, schannel.topLineColor || schannel.color);
        }
        
        // Bottom external line
        const sBottomStrokeDash = schannel.bottomLineStyle === 'dashed' ? '8,4' : schannel.bottomLineStyle === 'dotted' ? '2,4' : '';
        schannelGroup.append('line')
          .attr('x1', botX1).attr('y1', botY1).attr('x2', botX2).attr('y2', botY2)
          .attr('stroke', schannel.bottomLineColor || schannel.color)
          .attr('stroke-width', schannel.bottomLineThickness || 2)
          .attr('stroke-opacity', schannel.opacity)
          .attr('stroke-dasharray', sBottomStrokeDash)
          .style('pointer-events', 'none');
        
        // Bottom line label
        if (schannel.bottomLabel) {
          renderSLabel(schannel.bottomLabel, botX1, botY1, botX2, botY2, 14, schannel.bottomLineColor || schannel.color);
        }
        
        // Internal lines (25%, 50%, 75% - interpolated between top and bottom)
        schannel.internalLines.forEach(line => {
          if (line.visible) {
            const t = line.percent / 100;
            const intX1 = topX1 + (botX1 - topX1) * t;
            const intY1 = topY1 + (botY1 - topY1) * t;
            const intX2 = topX2 + (botX2 - topX2) * t;
            const intY2 = topY2 + (botY2 - topY2) * t;
            const strokeDash = line.style === 'dashed' ? '8,4' : line.style === 'dotted' ? '2,4' : '';
            schannelGroup.append('line')
              .attr('x1', intX1).attr('y1', intY1).attr('x2', intX2).attr('y2', intY2)
              .attr('stroke', line.color || schannel.color)
              .attr('stroke-width', 1)
              .attr('stroke-opacity', schannel.opacity * 0.7)
              .attr('stroke-dasharray', strokeDash)
              .style('pointer-events', 'none');
            
            // Internal line label
            if (line.label) {
              renderSLabel(line.label, intX1, intY1, intX2, intY2, 4, line.color || schannel.color, '10px', false, line.bgColor);
            }
          }
        });
        
        // Selection indicators (4 corner points)
        if (isSelected) {
          [{ x: topX1, y: topY1 }, { x: topX2, y: topY2 }, { x: botX1, y: botY1 }, { x: botX2, y: botY2 }].forEach(pt => {
            schannelGroup.append('circle')
              .attr('cx', pt.x).attr('cy', pt.y).attr('r', 5)
              .attr('fill', schannel.color).attr('stroke', 'white').attr('stroke-width', 2);
          });
        }
      });
      
      // Draw text labels with dynamic zoom visibility
      drawnTextLabels.forEach(label => {
        const x = xS(new Date(label.time));
        const y = yS(label.price);
        const isSelected = selectedTextLabel === label.id;
        
        // Calculate dynamic visibility based on zoom level
        // If created at high zoom (k=4) and now at low zoom (k=1), ratio = 0.25
        // Label fades/shrinks as you zoom out from where it was created
        const createdK = label.createdAtZoomScale ?? 1;
        const zoomRatio = currentZoomK / createdK;
        
        // Calculate visibility factor: 1.0 at same zoom or zoomed in more, fades when zoomed out
        // Uses a smooth curve: fully visible above 0.5 ratio, fades to 0 at 0.2 ratio
        let visibilityFactor = 1;
        if (zoomRatio < 1) {
          // Zoomed out from creation level
          // Smooth fade: clamp between 0.2 and 0.7 ratio, map to 0-1
          visibilityFactor = Math.max(0, Math.min(1, (zoomRatio - 0.2) / 0.5));
        }
        
        // Skip rendering if completely invisible
        if (visibilityFactor <= 0) return;
        
        // Apply visibility to opacity and font size
        const effectiveOpacity = label.opacity * visibilityFactor;
        const effectiveFontSize = label.fontSize * Math.max(0.5, visibilityFactor); // Min 50% size
        
        const labelGroup = drawingsGroup.append('g').attr('class', `textlabel-${label.id}`);
        
        // Background if set
        if (label.backgroundColor !== 'transparent') {
          labelGroup.append('rect')
            .attr('x', x - 5).attr('y', y - effectiveFontSize)
            .attr('width', label.text.length * effectiveFontSize * 0.6 + 10)
            .attr('height', effectiveFontSize + 6)
            .attr('fill', label.backgroundColor)
            .attr('rx', 3)
            .attr('opacity', effectiveOpacity);
        }
        
        // Text
        labelGroup.append('text')
          .attr('x', x).attr('y', y)
          .attr('fill', label.color)
          .attr('font-size', `${effectiveFontSize}px`)
          .attr('opacity', effectiveOpacity)
          .style('cursor', 'pointer')
          .text(label.text)
          .on('click', function(event) {
            event.stopPropagation();
            const rect = svgRef.current?.getBoundingClientRect();
            if (rect) {
              handleTextLabelSelect(label.id, event.clientX - rect.left, event.clientY - rect.top);
            }
          });
        
        // Selection indicator
        if (isSelected) {
          labelGroup.append('rect')
            .attr('x', x - 8).attr('y', y - effectiveFontSize - 3)
            .attr('width', label.text.length * effectiveFontSize * 0.6 + 16)
            .attr('height', effectiveFontSize + 12)
            .attr('fill', 'none')
            .attr('stroke', '#3b82f6')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,2')
            .attr('rx', 3);
        }
      });
    };
    
    // Initial draw (zoom k = 1 at initial load)
    drawDrawings(xScale, yScale, 1);
    
    // Store drawDrawings for zoom handler
    const drawDrawingsRef = drawDrawings;
    
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
    
    // Track zoom start for tap detection (selection only - drawing handled by overlay)
    let zoomStartTime = 0;
    let zoomStartX = 0;
    let zoomStartY = 0;
    let zoomStartK = 1;
    
    // Zoom behavior - DISABLED when drawing tool is active
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .translateExtent([[-100, 0], [width + 100, height]])
      .filter((event) => {
        // Disable d3 zoom when a drawing tool is active - overlay handles everything
        if (activeTool) return false;
        // Default d3 filter behavior
        return (!event.ctrlKey || event.type === 'wheel') && !event.button;
      })
      .on('start', (event) => {
        zoomStartTime = Date.now();
        const sourceEvent = event.sourceEvent;
        if (sourceEvent) {
          if (sourceEvent.touches && sourceEvent.touches[0]) {
            zoomStartX = sourceEvent.touches[0].clientX;
            zoomStartY = sourceEvent.touches[0].clientY;
          } else if (sourceEvent.clientX !== undefined) {
            zoomStartX = sourceEvent.clientX;
            zoomStartY = sourceEvent.clientY;
          }
        }
        zoomStartK = event.transform.k;
      })
      .on('end', (event) => {
        const elapsed = Date.now() - zoomStartTime;
        const sourceEvent = event.sourceEvent;
        let endX = zoomStartX;
        let endY = zoomStartY;
        if (sourceEvent) {
          if (sourceEvent.changedTouches && sourceEvent.changedTouches[0]) {
            endX = sourceEvent.changedTouches[0].clientX;
            endY = sourceEvent.changedTouches[0].clientY;
          } else if (sourceEvent.clientX !== undefined) {
            endX = sourceEvent.clientX;
            endY = sourceEvent.clientY;
          }
        }
        const dx = Math.abs(endX - zoomStartX);
        const dy = Math.abs(endY - zoomStartY);
        const scaleChanged = Math.abs(event.transform.k - zoomStartK) > 0.01;
        
        // Selection tap only (no tool active) - drawing taps handled by overlay
        if (elapsed < TAP_MAX_DURATION && dx < TOUCH_THRESHOLD && dy < TOUCH_THRESHOLD && !scaleChanged && !activeTool && !crosshairMode) {
          const svgElement = svgRef.current;
          if (svgElement && endX > 0 && endY > 0) {
            const rect = svgElement.getBoundingClientRect();
            const clickX = endX - rect.left;
            const clickY = endY - rect.top;
            if (clickX > 0 && clickY > 0 && clickX < rect.width && clickY < rect.height) {
              handleSvgTapSelection(clickX, clickY);
            }
          }
        }
      })
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
          const newPriceExtent = [
            d3.min(visibleCandles, d => d.low) as number * 0.999,
            d3.max(visibleCandles, d => d.high) as number * 1.001
          ];
          
          const newYScale = d3.scaleLinear()
            .domain(newPriceExtent)
            .range([innerHeight, 0])
            .nice();
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
            g.select('.current-price-line')
              .attr('y1', newYScale(lastCandle.close))
              .attr('y2', newYScale(lastCandle.close));
            g.select('.current-price-rect')
              .attr('y', newYScale(lastCandle.close) - 10);
            g.select('.current-price-text')
              .attr('y', newYScale(lastCandle.close) + 4);
          }
          
          // Redraw drawings with new scales and current zoom k (D3 native, no React re-render needed)
          drawDrawingsRef(newXScale, newYScale, transform.k);
        }
      });
    
    zoomRef.current = zoom;
    svg.call(zoom);
    
    // NOTE: Tap detection is handled in the zoom 'end' event handler above.
    // We removed duplicate touchstart.tap/touchend.tap handlers that were causing double-tap issues.
    
    // Restore saved zoom transform if it exists
    if (zoomTransformRef.current) {
      svg.call(zoom.transform, zoomTransformRef.current);
    }
    
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
    
  }, [candles, dimensions, margin.left, margin.right, margin.top, margin.bottom, interval, drawnTrendlines, drawnHorizontals, drawnChannels, drawnHChannels, drawnSChannels, drawnTextLabels, selectedTrendline, selectedHorizontal, selectedChannel, selectedHChannel, selectedSChannel, selectedTextLabel, moveMode, movingTrendline, movingWholeLine, handleDrawingClick, handleTextLabelSelect, handleEndpointClick]);
  
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
              style={{ display: 'block', cursor: activeTool ? 'crosshair' : 'grab', touchAction: 'none' }}
              className="chart-background"
              data-testid="sandbox-chart"
              onTouchStart={(e) => {
                console.log('👆 TouchStart:', { crosshairMode, activeTool, touches: e.touches.length });
                // Only track taps when not in crosshair mode (crosshair handles its own events)
                if (!crosshairMode && !activeTool && e.touches[0]) {
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  svgTapStartRef.current = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                    time: Date.now()
                  };
                  console.log('👆 Tap tracking started:', svgTapStartRef.current);
                }
              }}
              onTouchMove={(e) => {
                // If moved significantly, cancel the tap
                if (svgTapStartRef.current && e.touches[0]) {
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  const dx = (touch.clientX - rect.left) - svgTapStartRef.current.x;
                  const dy = (touch.clientY - rect.top) - svgTapStartRef.current.y;
                  if (Math.abs(dx) > TOUCH_THRESHOLD || Math.abs(dy) > TOUCH_THRESHOLD) {
                    console.log('👆 Tap cancelled - moved too much:', { dx, dy });
                    svgTapStartRef.current = null; // Cancel tap - this is a pan gesture
                  }
                }
              }}
              onTouchEnd={(e) => {
                console.log('👆 TouchEnd:', { hasStart: !!svgTapStartRef.current });
                // Check if this was a quick tap (not a drag)
                if (svgTapStartRef.current) {
                  const elapsed = Date.now() - svgTapStartRef.current.time;
                  console.log('👆 Tap elapsed:', elapsed, 'max:', TAP_MAX_DURATION);
                  if (elapsed < TAP_MAX_DURATION) {
                    // This was a tap - do hit testing
                    console.log('👆 Triggering tap selection at:', svgTapStartRef.current.x, svgTapStartRef.current.y);
                    const selected = handleSvgTapSelection(svgTapStartRef.current.x, svgTapStartRef.current.y);
                    if (selected) {
                      e.stopPropagation();
                    }
                  }
                  svgTapStartRef.current = null;
                }
              }}
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
              
              {/* Horizontal Channel */}
              <button
                onClick={() => {
                  if (activeTool === 'hchannel') {
                    setActiveTool(null);
                    setHChannelPoints([]);
                  } else {
                    setActiveTool('hchannel');
                  }
                }}
                className={`p-2 rounded transition-all ${
                  activeTool === 'hchannel' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Horizontal Channel (2-click)"
                data-testid="btn-hchannel"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="5" x2="18" y2="5" />
                  <line x1="2" y1="10" x2="18" y2="10" strokeDasharray="2,2" />
                  <line x1="2" y1="15" x2="18" y2="15" />
                </svg>
              </button>
              
              {/* Sloped Channel */}
              <button
                onClick={() => {
                  if (activeTool === 'schannel') {
                    setActiveTool(null);
                    setSChannelPoints([]);
                  } else {
                    setActiveTool('schannel');
                  }
                }}
                className={`p-2 rounded transition-all ${
                  activeTool === 'schannel' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Sloped Channel (3-click)"
                data-testid="btn-schannel"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="10" x2="18" y2="2" />
                  <line x1="2" y1="14" x2="18" y2="6" strokeDasharray="2,2" />
                  <line x1="2" y1="18" x2="18" y2="10" />
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
              onClick={(e) => {
                // Mouse click in crosshair mode - same logic as touch tap
                if (crosshairMode && crosshairPos && !activeTool) {
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
                    // Check for any drawing elements at click location
                    const selected = handleSvgTapSelection(crosshairPos.x, crosshairPos.y);
                    if (selected) {
                      e.stopPropagation();
                    } else {
                      // Click on empty space - close any open menu
                      closeSelectionPicker();
                      closeTrendlineMenu();
                    }
                  }
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
                    // Check for any drawing elements at click location
                    handleSvgTapSelection(crosshairPos.x, crosshairPos.y);
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
            
            {/* Trendline drawing overlay - handles all events when tool is active */}
            {activeTool === 'trendline' && trendlineMode && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ touchAction: 'none' }}
                data-drawing-overlay
                onClick={(e) => {
                  // Skip if touch was recently handled (prevents touch+click double-fire)
                  if (touchHandledRef.current) {
                    touchHandledRef.current = false;
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;
                  handleTrendlinePlacement(clickX, clickY);
                }}
                onTouchStart={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    const x = touch.clientX - rect.left;
                    const y = touch.clientY - rect.top;
                    touchStartRef.current = { 
                      x, y, 
                      time: Date.now(),
                      initX: x, 
                      initY: y 
                    };
                    touchMovedRef.current = false;
                  } else if (e.touches.length >= 2) {
                    // Pinch setup
                    const t1 = e.touches[0];
                    const t2 = e.touches[1];
                    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    if (!touchStartRef.current) {
                      touchStartRef.current = { x: 0, y: 0, time: Date.now() };
                    }
                    touchStartRef.current.pinchDist = dist;
                    touchStartRef.current.pinchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
                  }
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  
                  if (e.touches.length >= 2 && touchStartRef.current) {
                    // Pinch zoom
                    const t1 = e.touches[0];
                    const t2 = e.touches[1];
                    const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    const startDist = touchStartRef.current.pinchDist || newDist;
                    const scale = newDist / startDist;
                    
                    if (Math.abs(scale - 1) > 0.02 && xScaleRef.current && zoomRef.current && svgRef.current) {
                      touchMovedRef.current = true;
                      const midX = touchStartRef.current.pinchMidX || 0;
                      const currentTransform = d3.zoomTransform(svgRef.current);
                      const newK = Math.max(0.5, Math.min(20, currentTransform.k * scale));
                      const newX = midX - midX * (newK / currentTransform.k) + currentTransform.x * (newK / currentTransform.k);
                      const newTransform = d3.zoomIdentity.translate(newX, 0).scale(newK);
                      d3.select(svgRef.current).call(zoomRef.current.transform, newTransform);
                      touchStartRef.current.pinchDist = newDist;
                    }
                  } else if (e.touches.length === 1 && touchStartRef.current) {
                    // Single finger - track position, check for drag
                    const touch = e.touches[0];
                    const currentX = touch.clientX - rect.left;
                    const currentY = touch.clientY - rect.top;
                    
                    // Check total distance from initial touch point
                    const initX = touchStartRef.current.initX ?? touchStartRef.current.x;
                    const initY = touchStartRef.current.initY ?? touchStartRef.current.y;
                    const dist = Math.hypot(currentX - initX, currentY - initY);
                    
                    if (dist > TOUCH_THRESHOLD) {
                      // Significant movement - this is a pan, not a tap
                      if (!touchMovedRef.current) {
                        touchMovedRef.current = true;
                      }
                      // Pan the chart
                      if (xScaleRef.current && zoomRef.current && svgRef.current) {
                        const dx = currentX - touchStartRef.current.x;
                        const currentTransform = d3.zoomTransform(svgRef.current);
                        const newTransform = d3.zoomIdentity.translate(currentTransform.x + dx, 0).scale(currentTransform.k);
                        d3.select(svgRef.current).call(zoomRef.current.transform, newTransform);
                      }
                    }
                    // Always update current position (for lift placement)
                    touchStartRef.current.x = currentX;
                    touchStartRef.current.y = currentY;
                  }
                }}
                onTouchEnd={(e) => {
                  e.preventDefault(); // Prevent synthetic click event
                  if (touchStartRef.current && !touchMovedRef.current) {
                    // Quick tap without significant movement - place point at lift position
                    const tapDuration = Date.now() - touchStartRef.current.time;
                    if (tapDuration < TAP_TIME_LIMIT) {
                      touchHandledRef.current = true;
                      handleTrendlinePlacement(touchStartRef.current.x, touchStartRef.current.y);
                    }
                  }
                  touchStartRef.current = null;
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
            
            {/* Drawings are now rendered by D3 directly in the chart effect */}
            
            {/* Horizontal line drawing overlay - handles all events when tool is active */}
            {activeTool === 'horizontal' && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ touchAction: 'none' }}
                data-drawing-overlay
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  showClickPulse(e.clientX - rect.left, e.clientY - rect.top);
                  handleHorizontalClick(e.clientX - rect.left, e.clientY - rect.top);
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  touchStartRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
                  touchMovedRef.current = false;
                  if (e.touches.length >= 2) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    (touchStartRef.current as any).pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    (touchStartRef.current as any).pinchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
                  }
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.touches.length >= 2 && touchStartRef.current) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    const scale = newDist / ((touchStartRef.current as any).pinchDist || newDist);
                    if (Math.abs(scale - 1) > 0.02 && zoomRef.current && svgRef.current) {
                      touchMovedRef.current = true;
                      const midX = (touchStartRef.current as any).pinchMidX;
                      const ct = d3.zoomTransform(svgRef.current);
                      const newK = Math.max(0.5, Math.min(20, ct.k * scale));
                      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(midX - midX * (newK / ct.k) + ct.x * (newK / ct.k), 0).scale(newK));
                      (touchStartRef.current as any).pinchDist = newDist;
                    }
                  } else if (e.touches.length === 1 && touchStartRef.current) {
                    const dx = (e.touches[0].clientX - rect.left) - touchStartRef.current.x;
                    if (Math.abs(dx) > TOUCH_THRESHOLD && zoomRef.current && svgRef.current) {
                      touchMovedRef.current = true;
                      const ct = d3.zoomTransform(svgRef.current);
                      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(ct.x + dx, 0).scale(ct.k));
                      touchStartRef.current.x = e.touches[0].clientX - rect.left;
                    }
                  }
                }}
                onTouchEnd={() => {
                  if (!touchMovedRef.current && touchStartRef.current) {
                    showClickPulse(touchStartRef.current.x, touchStartRef.current.y);
                    handleHorizontalClick(touchStartRef.current.x, touchStartRef.current.y);
                  }
                  touchStartRef.current = null; touchMovedRef.current = false;
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
            
            {/* Channel drawing overlay - handles all events when tool is active */}
            {activeTool === 'channel' && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ touchAction: 'none' }}
                data-drawing-overlay
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  showClickPulse(e.clientX - rect.left, e.clientY - rect.top);
                  handleChannelClick(e.clientX - rect.left, e.clientY - rect.top);
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  touchStartRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
                  touchMovedRef.current = false;
                  if (e.touches.length >= 2) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    (touchStartRef.current as any).pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    (touchStartRef.current as any).pinchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
                  }
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.touches.length >= 2 && touchStartRef.current) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    const scale = newDist / ((touchStartRef.current as any).pinchDist || newDist);
                    if (Math.abs(scale - 1) > 0.02 && zoomRef.current && svgRef.current) {
                      touchMovedRef.current = true;
                      const midX = (touchStartRef.current as any).pinchMidX;
                      const ct = d3.zoomTransform(svgRef.current);
                      const newK = Math.max(0.5, Math.min(20, ct.k * scale));
                      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(midX - midX * (newK / ct.k) + ct.x * (newK / ct.k), 0).scale(newK));
                      (touchStartRef.current as any).pinchDist = newDist;
                    }
                  } else if (e.touches.length === 1 && touchStartRef.current) {
                    const dx = (e.touches[0].clientX - rect.left) - touchStartRef.current.x;
                    if (Math.abs(dx) > TOUCH_THRESHOLD && zoomRef.current && svgRef.current) {
                      touchMovedRef.current = true;
                      const ct = d3.zoomTransform(svgRef.current);
                      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(ct.x + dx, 0).scale(ct.k));
                      touchStartRef.current.x = e.touches[0].clientX - rect.left;
                    }
                  }
                }}
                onTouchEnd={() => {
                  if (!touchMovedRef.current && touchStartRef.current) {
                    showClickPulse(touchStartRef.current.x, touchStartRef.current.y);
                    handleChannelClick(touchStartRef.current.x, touchStartRef.current.y);
                  }
                  touchStartRef.current = null; touchMovedRef.current = false;
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
            
            {/* Horizontal Channel drawing overlay - handles all events when tool is active */}
            {activeTool === 'hchannel' && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ touchAction: 'none' }}
                data-drawing-overlay
                onClick={(e) => {
                  if (touchHandledRef.current) {
                    touchHandledRef.current = false;
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleHChannelPlacement(e.clientX - rect.left, e.clientY - rect.top);
                }}
                onTouchStart={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    const x = touch.clientX - rect.left;
                    const y = touch.clientY - rect.top;
                    touchStartRef.current = { x, y, time: Date.now(), initX: x, initY: y };
                    touchMovedRef.current = false;
                  } else if (e.touches.length >= 2) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    if (!touchStartRef.current) {
                      touchStartRef.current = { x: 0, y: 0, time: Date.now() };
                    }
                    touchStartRef.current.pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    touchStartRef.current.pinchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
                  }
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.touches.length >= 2 && touchStartRef.current) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    const scale = newDist / (touchStartRef.current.pinchDist || newDist);
                    if (Math.abs(scale - 1) > 0.02 && zoomRef.current && svgRef.current) {
                      touchMovedRef.current = true;
                      const midX = touchStartRef.current.pinchMidX || 0;
                      const ct = d3.zoomTransform(svgRef.current);
                      const newK = Math.max(0.5, Math.min(20, ct.k * scale));
                      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(midX - midX * (newK / ct.k) + ct.x * (newK / ct.k), 0).scale(newK));
                      touchStartRef.current.pinchDist = newDist;
                    }
                  } else if (e.touches.length === 1 && touchStartRef.current) {
                    const touch = e.touches[0];
                    const currentX = touch.clientX - rect.left;
                    const currentY = touch.clientY - rect.top;
                    const initX = touchStartRef.current.initX ?? touchStartRef.current.x;
                    const initY = touchStartRef.current.initY ?? touchStartRef.current.y;
                    const dist = Math.hypot(currentX - initX, currentY - initY);
                    if (dist > TOUCH_THRESHOLD) {
                      if (!touchMovedRef.current) touchMovedRef.current = true;
                      if (zoomRef.current && svgRef.current) {
                        const dx = currentX - touchStartRef.current.x;
                        const ct = d3.zoomTransform(svgRef.current);
                        d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(ct.x + dx, 0).scale(ct.k));
                      }
                    }
                    touchStartRef.current.x = currentX;
                    touchStartRef.current.y = currentY;
                  }
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  if (touchStartRef.current && !touchMovedRef.current) {
                    const tapDuration = Date.now() - touchStartRef.current.time;
                    if (tapDuration < TAP_TIME_LIMIT) {
                      touchHandledRef.current = true;
                      handleHChannelPlacement(touchStartRef.current.x, touchStartRef.current.y);
                    }
                  }
                  touchStartRef.current = null; touchMovedRef.current = false;
                }}
              >
                {magnetPulse && (
                  <div className="absolute pointer-events-none" style={{ left: magnetPulse.x - MAGNET_RADIUS, top: magnetPulse.y - MAGNET_RADIUS, width: MAGNET_RADIUS * 2, height: MAGNET_RADIUS * 2 }}>
                    <div className="w-full h-full rounded-full border-2 border-white animate-ping" style={{ animationDuration: '0.4s' }} />
                  </div>
                )}
                {hchannelPoints.length === 1 && (
                  <div className="absolute w-3 h-3 bg-cyan-400 rounded-full pointer-events-none" style={{ left: hchannelPoints[0].x - 6, top: hchannelPoints[0].y - 6 }} />
                )}
                {hchannelPoints.length === 1 && crosshairMode && crosshairPos && (
                  <svg className="absolute inset-0 pointer-events-none overflow-visible">
                    <line x1={0} y1={hchannelPoints[0].y} x2={dimensions.width} y2={hchannelPoints[0].y} stroke="#22d3ee" strokeWidth="1" strokeDasharray="5,5" />
                    <line x1={0} y1={crosshairPos.y} x2={dimensions.width} y2={crosshairPos.y} stroke="#22d3ee" strokeWidth="1" strokeDasharray="5,5" />
                  </svg>
                )}
                <div className="absolute top-14 left-14 bg-cyan-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                  {hchannelPoints.length === 0 ? 'Click for top line' : 'Click for bottom line'}
                </div>
              </div>
            )}
            
            {/* Sloped Channel drawing overlay - handles all events when tool is active */}
            {activeTool === 'schannel' && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ touchAction: 'none' }}
                data-drawing-overlay
                onClick={(e) => {
                  if (touchHandledRef.current) {
                    touchHandledRef.current = false;
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleSChannelPlacement(e.clientX - rect.left, e.clientY - rect.top);
                }}
                onTouchStart={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    const x = touch.clientX - rect.left;
                    const y = touch.clientY - rect.top;
                    touchStartRef.current = { x, y, time: Date.now(), initX: x, initY: y };
                    touchMovedRef.current = false;
                  } else if (e.touches.length >= 2) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    if (!touchStartRef.current) {
                      touchStartRef.current = { x: 0, y: 0, time: Date.now() };
                    }
                    touchStartRef.current.pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    touchStartRef.current.pinchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
                  }
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.touches.length >= 2 && touchStartRef.current) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    const scale = newDist / (touchStartRef.current.pinchDist || newDist);
                    if (Math.abs(scale - 1) > 0.02 && zoomRef.current && svgRef.current) {
                      touchMovedRef.current = true;
                      const midX = touchStartRef.current.pinchMidX || 0;
                      const ct = d3.zoomTransform(svgRef.current);
                      const newK = Math.max(0.5, Math.min(20, ct.k * scale));
                      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(midX - midX * (newK / ct.k) + ct.x * (newK / ct.k), 0).scale(newK));
                      touchStartRef.current.pinchDist = newDist;
                    }
                  } else if (e.touches.length === 1 && touchStartRef.current) {
                    const touch = e.touches[0];
                    const currentX = touch.clientX - rect.left;
                    const currentY = touch.clientY - rect.top;
                    const initX = touchStartRef.current.initX ?? touchStartRef.current.x;
                    const initY = touchStartRef.current.initY ?? touchStartRef.current.y;
                    const dist = Math.hypot(currentX - initX, currentY - initY);
                    if (dist > TOUCH_THRESHOLD) {
                      if (!touchMovedRef.current) touchMovedRef.current = true;
                      if (zoomRef.current && svgRef.current) {
                        const dx = currentX - touchStartRef.current.x;
                        const ct = d3.zoomTransform(svgRef.current);
                        d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(ct.x + dx, 0).scale(ct.k));
                      }
                    }
                    touchStartRef.current.x = currentX;
                    touchStartRef.current.y = currentY;
                  }
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  if (touchStartRef.current && !touchMovedRef.current) {
                    const tapDuration = Date.now() - touchStartRef.current.time;
                    if (tapDuration < TAP_TIME_LIMIT) {
                      touchHandledRef.current = true;
                      handleSChannelPlacement(touchStartRef.current.x, touchStartRef.current.y);
                    }
                  }
                  touchStartRef.current = null; touchMovedRef.current = false;
                }}
              >
                {magnetPulse && (
                  <div className="absolute pointer-events-none" style={{ left: magnetPulse.x - MAGNET_RADIUS, top: magnetPulse.y - MAGNET_RADIUS, width: MAGNET_RADIUS * 2, height: MAGNET_RADIUS * 2 }}>
                    <div className="w-full h-full rounded-full border-2 border-white animate-ping" style={{ animationDuration: '0.4s' }} />
                  </div>
                )}
                {schannelPoints.length >= 1 && (
                  <div className="absolute w-3 h-3 bg-amber-400 rounded-full pointer-events-none" style={{ left: schannelPoints[0].x - 6, top: schannelPoints[0].y - 6 }} />
                )}
                {schannelPoints.length >= 2 && (
                  <div className="absolute w-3 h-3 bg-amber-400 rounded-full pointer-events-none" style={{ left: schannelPoints[1].x - 6, top: schannelPoints[1].y - 6 }} />
                )}
                {schannelPoints.length >= 1 && crosshairMode && crosshairPos && (
                  <svg className="absolute inset-0 pointer-events-none overflow-visible">
                    {schannelPoints.length === 1 && (
                      <line x1={schannelPoints[0].x} y1={schannelPoints[0].y} x2={crosshairPos.x} y2={crosshairPos.y} stroke="#fbbf24" strokeWidth="2" strokeDasharray="5,5" />
                    )}
                    {schannelPoints.length === 2 && (() => {
                      // Calculate perpendicular offset from baseline to cursor
                      const baseP1 = schannelPoints[0];
                      const baseP2 = schannelPoints[1];
                      const dx = baseP2.x - baseP1.x;
                      const dy = baseP2.y - baseP1.y;
                      
                      // Find y offset from baseline at cursor x position (for vertical offset)
                      const slope = dy / dx;
                      const baselineYAtCursor = baseP1.y + slope * (crosshairPos.x - baseP1.x);
                      const yOffset = crosshairPos.y - baselineYAtCursor;
                      
                      return (
                        <>
                          {/* Solid baseline */}
                          <line x1={baseP1.x} y1={baseP1.y} x2={baseP2.x} y2={baseP2.y} stroke="#fbbf24" strokeWidth="2" />
                          {/* Dashed parallel line preview */}
                          <line x1={baseP1.x} y1={baseP1.y + yOffset} x2={baseP2.x} y2={baseP2.y + yOffset} stroke="#fbbf24" strokeWidth="2" strokeDasharray="5,5" />
                          {/* Fill preview */}
                          <polygon 
                            points={`${baseP1.x},${baseP1.y} ${baseP2.x},${baseP2.y} ${baseP2.x},${baseP2.y + yOffset} ${baseP1.x},${baseP1.y + yOffset}`}
                            fill="#fbbf24"
                            fillOpacity="0.1"
                          />
                        </>
                      );
                    })()}
                  </svg>
                )}
                <div className="absolute top-14 left-14 bg-amber-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                  {schannelPoints.length === 0 ? 'Click start of baseline' : schannelPoints.length === 1 ? 'Click end of baseline' : 'Click to set channel height'}
                </div>
              </div>
            )}
            
            {/* Text label drawing overlay - handles all events when tool is active */}
            {activeTool === 'label' && (
              <div 
                className="absolute inset-0 cursor-crosshair z-[25]"
                style={{ touchAction: 'none' }}
                data-drawing-overlay
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  showClickPulse(e.clientX - rect.left, e.clientY - rect.top);
                  handleTextLabelClick(e.clientX - rect.left, e.clientY - rect.top);
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  touchStartRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
                  touchMovedRef.current = false;
                  if (e.touches.length >= 2) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    (touchStartRef.current as any).pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    (touchStartRef.current as any).pinchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
                  }
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.touches.length >= 2 && touchStartRef.current) {
                    const t1 = e.touches[0]; const t2 = e.touches[1];
                    const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                    const scale = newDist / ((touchStartRef.current as any).pinchDist || newDist);
                    if (Math.abs(scale - 1) > 0.02 && zoomRef.current && svgRef.current) {
                      touchMovedRef.current = true;
                      const midX = (touchStartRef.current as any).pinchMidX;
                      const ct = d3.zoomTransform(svgRef.current);
                      const newK = Math.max(0.5, Math.min(20, ct.k * scale));
                      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(midX - midX * (newK / ct.k) + ct.x * (newK / ct.k), 0).scale(newK));
                      (touchStartRef.current as any).pinchDist = newDist;
                    }
                  } else if (e.touches.length === 1 && touchStartRef.current) {
                    const dx = (e.touches[0].clientX - rect.left) - touchStartRef.current.x;
                    if (Math.abs(dx) > TOUCH_THRESHOLD && zoomRef.current && svgRef.current) {
                      touchMovedRef.current = true;
                      const ct = d3.zoomTransform(svgRef.current);
                      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(ct.x + dx, 0).scale(ct.k));
                      touchStartRef.current.x = e.touches[0].clientX - rect.left;
                    }
                  }
                }}
                onTouchEnd={() => {
                  if (!touchMovedRef.current && touchStartRef.current) {
                    showClickPulse(touchStartRef.current.x, touchStartRef.current.y);
                    handleTextLabelClick(touchStartRef.current.x, touchStartRef.current.y);
                  }
                  touchStartRef.current = null; touchMovedRef.current = false;
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateTrendline(selectedTrendline, { extendLeft: !selectedLine?.extendLeft })}
                      className={`p-2 rounded transition-colors ${selectedLine?.extendLeft ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                      title="Extend Left"
                      data-testid="btn-trendline-extend-left"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 4L4 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => updateTrendline(selectedTrendline, { extendRight: !selectedLine?.extendRight })}
                      className={`p-2 rounded transition-colors ${selectedLine?.extendRight ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                      title="Extend Right"
                      data-testid="btn-trendline-extend-right"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 4L16 10L8 16" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
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
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { pos: 'top-left', icon: '↖' },
                      { pos: 'top-center', icon: '↑' },
                      { pos: 'top-right', icon: '↗' },
                      { pos: 'bottom-left', icon: '↙' },
                      { pos: 'bottom-center', icon: '↓' },
                      { pos: 'bottom-right', icon: '↘' }
                    ] as const).map(({ pos, icon }) => {
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
                          className={`px-2 py-2 text-base rounded ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        >
                          {icon}
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
                    onChange={e => {
                      const existingPositions = selectedLine?.label?.positions || 
                        ((selectedLine?.label as any)?.position ? [(selectedLine?.label as any).position] : ['right']);
                      updateHorizontal(selectedHorizontal, { label: { text: e.target.value, positions: existingPositions } });
                    }}
                    className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mb-3" />
                  <div className="text-xs text-gray-400 mb-1">Position (toggle multiple)</div>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { pos: 'top-left', icon: '↖' },
                      { pos: 'top-center', icon: '↑' },
                      { pos: 'top-right', icon: '↗' },
                      { pos: 'bottom-left', icon: '↙' },
                      { pos: 'bottom-center', icon: '↓' },
                      { pos: 'bottom-right', icon: '↘' }
                    ] as const).map(({ pos, icon }) => {
                      // Support both old formats and new 6-position format
                      const currentPositions = selectedLine?.label?.positions || 
                        ((selectedLine?.label as any)?.position ? [(selectedLine?.label as any).position] : []);
                      const isSelected = currentPositions.includes(pos);
                      return (
                        <button key={pos} onClick={() => {
                          const newPositions = isSelected 
                            ? currentPositions.filter(p => p !== pos)
                            : [...currentPositions, pos];
                          updateHorizontal(selectedHorizontal, { 
                            label: { 
                              text: selectedLine?.label?.text || '', 
                              positions: newPositions.length > 0 ? newPositions : ['top-right']
                            } 
                          });
                        }}
                          className={`px-2 py-2 text-base rounded ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}>
                          {icon}
                        </button>
                      );
                    })}
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
            
            {/* Tap feedback circle - visual indicator where user tapped */}
            {tapFeedback && (
              <div 
                className="absolute pointer-events-none z-40"
                style={{ 
                  left: tapFeedback.x - MAGNET_RADIUS, 
                  top: tapFeedback.y - MAGNET_RADIUS,
                  width: MAGNET_RADIUS * 2,
                  height: MAGNET_RADIUS * 2,
                }}
              >
                <div 
                  className="w-full h-full rounded-full border-2 border-cyan-400"
                  style={{ 
                    animation: 'tapPulse 0.4s ease-out forwards'
                  }}
                />
              </div>
            )}
            <style>{`
              @keyframes tapPulse {
                0% { transform: scale(0.5); opacity: 1; }
                100% { transform: scale(1.5); opacity: 0; }
              }
            `}</style>
            
            {/* Selection Picker - shows when multiple overlapping elements */}
            {selectionPickerPos && selectionCandidates.length > 1 && (
              <div 
                className="absolute bg-slate-800 border border-slate-500 rounded-lg shadow-lg z-50 p-2"
                style={{ left: selectionPickerPos.x, top: selectionPickerPos.y }}
                data-testid="selection-picker"
              >
                <div className="text-xs text-gray-400 mb-2 font-medium">Select element:</div>
                <div className="flex flex-col gap-1">
                  {selectionCandidates.map((candidate, idx) => {
                    // Icons for each type
                    const getIcon = () => {
                      switch (candidate.type) {
                        case 'trendline':
                          return (
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 20L20 4" />
                            </svg>
                          );
                        case 'horizontal':
                          return (
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 12h16" />
                            </svg>
                          );
                        case 'channel':
                          return (
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 8L20 4M4 16L20 12" />
                            </svg>
                          );
                        case 'hchannel':
                          return (
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 6h16M4 18h16" />
                              <rect x="4" y="6" width="16" height="12" fill="currentColor" fillOpacity="0.2" stroke="none" />
                            </svg>
                          );
                        case 'schannel':
                          return (
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 8L20 4M4 20L20 16" />
                              <path d="M4 8L4 20M20 4L20 16" strokeOpacity="0.3" />
                            </svg>
                          );
                        case 'label':
                          return (
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                              <text x="6" y="17" fontSize="14" fill="currentColor" stroke="none">T</text>
                            </svg>
                          );
                        default:
                          return null;
                      }
                    };
                    
                    const getLabel = () => {
                      switch (candidate.type) {
                        case 'trendline': return 'Trendline';
                        case 'horizontal': return 'Horizontal';
                        case 'channel': return 'Channel';
                        case 'hchannel': return 'H-Channel';
                        case 'schannel': return 'S-Channel';
                        case 'label': return 'Label';
                        default: return 'Element';
                      }
                    };
                    
                    return (
                      <button
                        key={`${candidate.type}-${candidate.id}-${idx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handlePickerSelect(candidate);
                        }}
                        onTouchEnd={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handlePickerSelect(candidate);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-white hover:bg-slate-700 rounded transition-colors text-sm"
                        data-testid={`picker-${candidate.type}-${idx}`}
                      >
                        {getIcon()}
                        <span>{getLabel()}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={closeSelectionPicker}
                  className="mt-2 w-full text-xs text-gray-500 hover:text-gray-300 py-1"
                  data-testid="picker-close"
                >
                  Cancel
                </button>
              </div>
            )}
            
            {/* Horizontal Channel action menu - compact redesign */}
            {hchannelMenuPos && selectedHChannel && (() => {
              const hchannel = drawnHChannels.find(c => c.id === selectedHChannel);
              const menuWidth = 48;
              const menuHeight = 200;
              const autoX = Math.min(Math.max(hchannelMenuPos.x, 10), dimensions.width - margin.right - menuWidth - 10);
              const autoY = Math.min(Math.max(hchannelMenuPos.y, 10), dimensions.height - menuHeight - 10);
              return (
                <div 
                  className="absolute flex flex-col gap-1 bg-slate-800 border border-slate-600 rounded-b rounded-t-sm z-50"
                  style={{ left: autoX, top: autoY }}
                  data-menu="hchannel"
                >
                  {/* Drag handle */}
                  <div 
                    className="h-2 bg-slate-600 rounded-t-sm cursor-grab active:cursor-grabbing flex items-center justify-center hover:bg-slate-500 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDraggingMenu(true);
                      menuDragOffset.current = { x: e.clientX - autoX, y: e.clientY - autoY };
                    }}
                  >
                    <div className="w-6 h-0.5 bg-slate-400 rounded" />
                  </div>
                  <div className="p-1 flex flex-col gap-1">
                    {/* Delete */}
                    <button onClick={deleteHChannel} className="p-2 hover:bg-slate-700 rounded text-red-400" title="Delete" data-testid="btn-hchannel-delete">
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 6h12M6 6v10a2 2 0 002 2h4a2 2 0 002-2V6M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                      </svg>
                    </button>
                    {/* Top Line Color - dot button */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'hch-top' ? null : 'hch-top')}
                      className={`p-2 hover:bg-slate-700 rounded ${activeSubmenu === 'hch-top' ? 'bg-slate-600' : ''}`}
                      title="Top Line"
                      data-testid="btn-hchannel-top"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5">
                        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                        <circle cx="10" cy="10" r="4" fill={hchannel?.topLineColor || '#22c55e'} stroke="none" />
                      </svg>
                    </button>
                    {/* Bottom Line Color - dot button */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'hch-bottom' ? null : 'hch-bottom')}
                      className={`p-2 hover:bg-slate-700 rounded ${activeSubmenu === 'hch-bottom' ? 'bg-slate-600' : ''}`}
                      title="Bottom Line"
                      data-testid="btn-hchannel-bottom"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5">
                        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                        <circle cx="10" cy="10" r="4" fill={hchannel?.bottomLineColor || '#ef4444'} stroke="none" />
                      </svg>
                    </button>
                    {/* Internal Lines - dot button */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'hch-internal' ? null : 'hch-internal')}
                      className={`p-2 hover:bg-slate-700 rounded ${activeSubmenu === 'hch-internal' ? 'bg-slate-600' : ''}`}
                      title="Internal Lines"
                      data-testid="btn-hchannel-internal"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5">
                        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3,2" />
                        <circle cx="10" cy="10" r="4" fill={hchannel?.internalLines?.[0]?.color || '#facc15'} stroke="none" />
                      </svg>
                    </button>
                    {/* Label */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'hch-label' ? null : 'hch-label')}
                      className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'hch-label' ? 'bg-slate-600' : ''}`}
                      title="Labels"
                      data-testid="btn-hchannel-label"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 5h14M3 10h10M3 15h6" />
                      </svg>
                    </button>
                    {/* Extend */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'hch-extend' ? null : 'hch-extend')}
                      className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'hch-extend' ? 'bg-slate-600' : ''}`}
                      title="Extend"
                      data-testid="btn-hchannel-extend"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 10h12M16 10l-4-4M16 10l-4 4" />
                      </svg>
                    </button>
                    {/* Favorite - Save as Default */}
                    <button 
                      onClick={() => {
                        if (hchannel) {
                          const defaults = {
                            topLineColor: hchannel.topLineColor,
                            topLineThickness: hchannel.topLineThickness,
                            topLineStyle: hchannel.topLineStyle,
                            bottomLineColor: hchannel.bottomLineColor,
                            bottomLineThickness: hchannel.bottomLineThickness,
                            bottomLineStyle: hchannel.bottomLineStyle,
                            fillColor: hchannel.fillColor,
                            fillOpacity: hchannel.fillOpacity,
                            internalLines: JSON.parse(JSON.stringify(hchannel.internalLines || [])),
                            showLabelLeft: hchannel.showLabelLeft,
                            showLabelCenter: hchannel.showLabelCenter,
                            showLabelRight: hchannel.showLabelRight,
                            extendLeft: hchannel.extendLeft,
                            extendRight: hchannel.extendRight,
                          };
                          localStorage.setItem('hchannelDefaults', JSON.stringify(defaults));
                          updateHChannel(selectedHChannel, { isFavorite: true });
                        }
                      }} 
                      className={`p-2 hover:bg-slate-700 rounded ${hchannel?.isFavorite ? 'text-yellow-400' : 'text-gray-400'}`} 
                      title="Save as Default"
                      data-testid="btn-hchannel-favorite"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                        <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })()}
            
            {/* HChannel Extend submenu */}
            {activeSubmenu === 'hch-extend' && hchannelMenuPos && selectedHChannel && (() => {
              const hchannel = drawnHChannels.find(c => c.id === selectedHChannel);
              const submenuX = hchannelMenuPos.x + 50 < dimensions.width - 100 ? hchannelMenuPos.x + 50 : hchannelMenuPos.x - 110;
              const submenuY = Math.min(hchannelMenuPos.y, dimensions.height - 80);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY }}>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateHChannel(selectedHChannel, { extendLeft: !hchannel?.extendLeft })}
                      className={`p-2 rounded transition-colors ${hchannel?.extendLeft ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                      title="Extend Left"
                      data-testid="btn-hchannel-extend-left"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 4L4 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => updateHChannel(selectedHChannel, { extendRight: !hchannel?.extendRight })}
                      className={`p-2 rounded transition-colors ${hchannel?.extendRight ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                      title="Extend Right"
                      data-testid="btn-hchannel-extend-right"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 4L16 10L8 16" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })()}
            
            {/* HChannel Top Line submenu - color grid + size/style */}
            {activeSubmenu === 'hch-top' && hchannelMenuPos && selectedHChannel && (() => {
              const hchannel = drawnHChannels.find(c => c.id === selectedHChannel);
              const submenuX = hchannelMenuPos.x + 50 < dimensions.width - 160 ? hchannelMenuPos.x + 50 : hchannelMenuPos.x - 170;
              const submenuY = Math.min(hchannelMenuPos.y, dimensions.height - 180);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY, minWidth: '140px' }}>
                  <div className="text-xs text-gray-400 mb-1">Top Line Color</div>
                  <div className="flex flex-wrap gap-1 mb-2 w-32">
                    {TRENDLINE_COLORS.map(color => (
                      <button key={color} onClick={() => updateHChannel(selectedHChannel, { topLineColor: color })}
                        className={`w-5 h-5 rounded border-2 ${hchannel?.topLineColor === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }} data-testid={`btn-hchannel-top-color-${color.replace('#', '')}`} />
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Thickness</div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4].map(size => (
                      <button key={size} onClick={() => updateHChannel(selectedHChannel, { topLineThickness: size })}
                        className={`px-2 py-1 text-xs rounded ${hchannel?.topLineThickness === size ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        data-testid={`btn-hchannel-top-thickness-${size}`}>{size}</button>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Style</div>
                  <div className="flex gap-1">
                    {(['solid', 'dashed', 'dotted'] as const).map(style => (
                      <button key={style} onClick={() => updateHChannel(selectedHChannel, { topLineStyle: style })}
                        className={`px-2 py-1 text-xs rounded ${hchannel?.topLineStyle === style ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        data-testid={`btn-hchannel-top-style-${style}`}>{style}</button>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* HChannel Bottom Line submenu - color grid + size/style */}
            {activeSubmenu === 'hch-bottom' && hchannelMenuPos && selectedHChannel && (() => {
              const hchannel = drawnHChannels.find(c => c.id === selectedHChannel);
              const submenuX = hchannelMenuPos.x + 50 < dimensions.width - 160 ? hchannelMenuPos.x + 50 : hchannelMenuPos.x - 170;
              const submenuY = Math.min(hchannelMenuPos.y, dimensions.height - 180);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY, minWidth: '140px' }}>
                  <div className="text-xs text-gray-400 mb-1">Bottom Line Color</div>
                  <div className="flex flex-wrap gap-1 mb-2 w-32">
                    {TRENDLINE_COLORS.map(color => (
                      <button key={color} onClick={() => updateHChannel(selectedHChannel, { bottomLineColor: color })}
                        className={`w-5 h-5 rounded border-2 ${hchannel?.bottomLineColor === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }} data-testid={`btn-hchannel-bottom-color-${color.replace('#', '')}`} />
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Thickness</div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4].map(size => (
                      <button key={size} onClick={() => updateHChannel(selectedHChannel, { bottomLineThickness: size })}
                        className={`px-2 py-1 text-xs rounded ${hchannel?.bottomLineThickness === size ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        data-testid={`btn-hchannel-bottom-thickness-${size}`}>{size}</button>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Style</div>
                  <div className="flex gap-1">
                    {(['solid', 'dashed', 'dotted'] as const).map(style => (
                      <button key={style} onClick={() => updateHChannel(selectedHChannel, { bottomLineStyle: style })}
                        className={`px-2 py-1 text-xs rounded ${hchannel?.bottomLineStyle === style ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        data-testid={`btn-hchannel-bottom-style-${style}`}>{style}</button>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* HChannel Internal Lines submenu */}
            {activeSubmenu === 'hch-internal' && hchannelMenuPos && selectedHChannel && (() => {
              const hchannel = drawnHChannels.find(c => c.id === selectedHChannel);
              const submenuX = hchannelMenuPos.x + 50 < dimensions.width - 200 ? hchannelMenuPos.x + 50 : hchannelMenuPos.x - 210;
              const submenuY = Math.min(hchannelMenuPos.y, dimensions.height - 250);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY, minWidth: '195px' }}>
                  <div className="text-xs text-gray-400 mb-1">Channel Fill</div>
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => updateHChannel(selectedHChannel, { fillOpacity: 0 })}
                      className={`w-5 h-5 rounded border border-gray-400 ${(hchannel?.fillOpacity ?? 0.1) === 0 ? 'ring-1 ring-blue-400' : ''}`}
                      style={{ backgroundImage: 'linear-gradient(45deg, #666 25%, transparent 25%), linear-gradient(-45deg, #666 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #666 75%), linear-gradient(-45deg, transparent 75%, #666 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px' }}
                      title="Off" data-testid="btn-hchannel-fill-off" />
                    {[{ color: '#ef4444', name: 'Red' }, { color: '#22c55e', name: 'Green' }, { color: '#ffffff', name: 'White' }].map(({ color, name }) => (
                      <button key={color} onClick={() => updateHChannel(selectedHChannel, { fillColor: color, fillOpacity: hchannel?.fillOpacity || 0.1 })}
                        className={`w-5 h-5 rounded ${hchannel?.fillColor === color && (hchannel?.fillOpacity ?? 0.1) > 0 ? 'ring-1 ring-blue-400' : ''} ${color === '#ffffff' ? 'border border-gray-400' : ''}`}
                        style={{ backgroundColor: color }} title={name} data-testid={`btn-hchannel-fill-${name.toLowerCase()}`} />
                    ))}
                    <input type="range" min="5" max="50" value={Math.round((hchannel?.fillOpacity ?? 0.1) * 100)}
                      className="w-16 h-3 accent-blue-500" title={`Opacity: ${Math.round((hchannel?.fillOpacity ?? 0.1) * 100)}%`}
                      onChange={e => updateHChannel(selectedHChannel, { fillOpacity: parseInt(e.target.value) / 100 })} />
                    <span className="text-gray-400 text-[9px]">{Math.round((hchannel?.fillOpacity ?? 0.1) * 100)}%</span>
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Internal Lines</div>
                  {hchannel?.internalLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2">
                      <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={line.visible} 
                        data-testid={`checkbox-hchannel-internal-${idx}`}
                        onChange={e => {
                          const newLines = [...(hchannel?.internalLines || [])];
                          newLines[idx] = { ...newLines[idx], visible: e.target.checked };
                          updateHChannel(selectedHChannel, { internalLines: newLines });
                        }} />
                      <span className="text-white text-xs w-8">{line.percent}%</span>
                      {['#ef4444', '#22c55e', '#ffffff'].map(color => (
                        <button key={color} onClick={() => {
                          const newLines = [...(hchannel?.internalLines || [])];
                          newLines[idx] = { ...newLines[idx], color };
                          updateHChannel(selectedHChannel, { internalLines: newLines });
                        }}
                          className={`w-5 h-5 rounded ${line.color === color ? 'ring-1 ring-blue-400' : ''} ${color === '#ffffff' ? 'border border-gray-400' : ''}`}
                          style={{ backgroundColor: color }} data-testid={`btn-hchannel-internal-${idx}-color-${color.replace('#', '')}`} />
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
            
            {/* HChannel Label submenu */}
            {activeSubmenu === 'hch-label' && hchannelMenuPos && selectedHChannel && (() => {
              const hchannel = drawnHChannels.find(c => c.id === selectedHChannel);
              const submenuX = hchannelMenuPos.x + 50 < dimensions.width - 180 ? hchannelMenuPos.x + 50 : hchannelMenuPos.x - 190;
              const submenuY = Math.min(hchannelMenuPos.y, dimensions.height - 220);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY, minWidth: '170px' }}>
                  <div className="text-xs text-gray-400 mb-1">Show Labels At</div>
                  <div className="flex gap-1 mb-3">
                    <button onClick={() => updateHChannel(selectedHChannel, { showLabelLeft: !hchannel?.showLabelLeft })}
                      className={`flex-1 p-1.5 rounded ${hchannel?.showLabelLeft ? 'bg-blue-600' : 'bg-slate-700'}`} title="Left" data-testid="btn-hchannel-label-left">
                      <svg viewBox="0 0 20 20" className="w-4 h-4 mx-auto" fill="none" stroke="white" strokeWidth="2">
                        <path d="M12 4L6 10L12 16" />
                      </svg>
                    </button>
                    <button onClick={() => updateHChannel(selectedHChannel, { showLabelCenter: !hchannel?.showLabelCenter })}
                      className={`flex-1 p-1.5 rounded ${hchannel?.showLabelCenter ? 'bg-blue-600' : 'bg-slate-700'}`} title="Center" data-testid="btn-hchannel-label-center">
                      <svg viewBox="0 0 20 20" className="w-4 h-4 mx-auto" fill="white" stroke="none">
                        <circle cx="10" cy="10" r="4" />
                      </svg>
                    </button>
                    <button onClick={() => updateHChannel(selectedHChannel, { showLabelRight: !hchannel?.showLabelRight })}
                      className={`flex-1 p-1.5 rounded ${hchannel?.showLabelRight ? 'bg-blue-600' : 'bg-slate-700'}`} title="Right" data-testid="btn-hchannel-label-right">
                      <svg viewBox="0 0 20 20" className="w-4 h-4 mx-auto" fill="none" stroke="white" strokeWidth="2">
                        <path d="M8 4L14 10L8 16" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 mb-2">Line Labels</div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: hchannel?.topLineColor || '#22c55e' }} />
                    <span className="text-xs text-gray-300 w-12">Top:</span>
                    <input type="text" value={hchannel?.topLabel || ''} placeholder="Label" maxLength={10}
                      className="flex-1 bg-slate-700 text-white px-1 py-0.5 text-xs rounded"
                      onChange={e => updateHChannel(selectedHChannel, { topLabel: e.target.value })}
                      data-testid="input-hchannel-top-label" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: hchannel?.bottomLineColor || '#ef4444' }} />
                    <span className="text-xs text-gray-300 w-12">Bottom:</span>
                    <input type="text" value={hchannel?.bottomLabel || ''} placeholder="Label" maxLength={10}
                      className="flex-1 bg-slate-700 text-white px-1 py-0.5 text-xs rounded"
                      onChange={e => updateHChannel(selectedHChannel, { bottomLabel: e.target.value })}
                      data-testid="input-hchannel-bottom-label" />
                  </div>
                  {hchannel?.internalLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: line.color }} />
                      <span className="text-xs text-gray-300 w-12">{line.percent}%:</span>
                      <input type="text" value={line.label || ''} placeholder="Label" maxLength={10}
                        className="flex-1 bg-slate-700 text-white px-1 py-0.5 text-xs rounded"
                        onChange={e => {
                          const newLines = [...(hchannel?.internalLines || [])];
                          newLines[idx] = { ...newLines[idx], label: e.target.value };
                          updateHChannel(selectedHChannel, { internalLines: newLines });
                        }}
                        data-testid={`input-hchannel-internal-${idx}-label`} />
                    </div>
                  ))}
                </div>
              );
            })()}
            
            {/* Sloped Channel action menu - compact redesign */}
            {schannelMenuPos && selectedSChannel && (() => {
              const schannel = drawnSChannels.find(c => c.id === selectedSChannel);
              const menuWidth = 48;
              const menuHeight = 200;
              const autoX = Math.min(Math.max(schannelMenuPos.x, 10), dimensions.width - margin.right - menuWidth - 10);
              const autoY = Math.min(Math.max(schannelMenuPos.y, 10), dimensions.height - menuHeight - 10);
              return (
                <div 
                  className="absolute flex flex-col gap-1 bg-slate-800 border border-slate-600 rounded-b rounded-t-sm z-50"
                  style={{ left: autoX, top: autoY }}
                  data-menu="schannel"
                >
                  {/* Drag handle */}
                  <div 
                    className="h-2 bg-slate-600 rounded-t-sm cursor-grab active:cursor-grabbing flex items-center justify-center hover:bg-slate-500 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDraggingMenu(true);
                      menuDragOffset.current = { x: e.clientX - autoX, y: e.clientY - autoY };
                    }}
                  >
                    <div className="w-6 h-0.5 bg-slate-400 rounded" />
                  </div>
                  <div className="p-1 flex flex-col gap-1">
                    {/* Delete */}
                    <button onClick={deleteSChannel} className="p-2 hover:bg-slate-700 rounded text-red-400" title="Delete" data-testid="btn-schannel-delete">
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 6h12M6 6v10a2 2 0 002 2h4a2 2 0 002-2V6M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                      </svg>
                    </button>
                    {/* Top Line Color - dot button */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'sch-top' ? null : 'sch-top')}
                      className={`p-2 hover:bg-slate-700 rounded ${activeSubmenu === 'sch-top' ? 'bg-slate-600' : ''}`}
                      title="Top Line"
                      data-testid="btn-schannel-top"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5">
                        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                        <circle cx="10" cy="10" r="4" fill={schannel?.topLineColor || '#22c55e'} stroke="none" />
                      </svg>
                    </button>
                    {/* Bottom Line Color - dot button */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'sch-bottom' ? null : 'sch-bottom')}
                      className={`p-2 hover:bg-slate-700 rounded ${activeSubmenu === 'sch-bottom' ? 'bg-slate-600' : ''}`}
                      title="Bottom Line"
                      data-testid="btn-schannel-bottom"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5">
                        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                        <circle cx="10" cy="10" r="4" fill={schannel?.bottomLineColor || '#ef4444'} stroke="none" />
                      </svg>
                    </button>
                    {/* Internal Lines - dot button */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'sch-internal' ? null : 'sch-internal')}
                      className={`p-2 hover:bg-slate-700 rounded ${activeSubmenu === 'sch-internal' ? 'bg-slate-600' : ''}`}
                      title="Internal Lines"
                      data-testid="btn-schannel-internal"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5">
                        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3,2" />
                        <circle cx="10" cy="10" r="4" fill={schannel?.internalLines?.[0]?.color || '#facc15'} stroke="none" />
                      </svg>
                    </button>
                    {/* Label */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'sch-label' ? null : 'sch-label')}
                      className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'sch-label' ? 'bg-slate-600' : ''}`}
                      title="Labels"
                      data-testid="btn-schannel-label"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 5h14M3 10h10M3 15h6" />
                      </svg>
                    </button>
                    {/* Extend */}
                    <button
                      onClick={() => setActiveSubmenu(activeSubmenu === 'sch-extend' ? null : 'sch-extend')}
                      className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'sch-extend' ? 'bg-slate-600' : ''}`}
                      title="Extend"
                      data-testid="btn-schannel-extend"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 10h12M16 10l-4-4M16 10l-4 4" />
                      </svg>
                    </button>
                    {/* Favorite - Save as Default */}
                    <button 
                      onClick={() => {
                        if (schannel) {
                          const defaults = {
                            topLineColor: schannel.topLineColor,
                            topLineThickness: schannel.topLineThickness,
                            topLineStyle: schannel.topLineStyle,
                            bottomLineColor: schannel.bottomLineColor,
                            bottomLineThickness: schannel.bottomLineThickness,
                            bottomLineStyle: schannel.bottomLineStyle,
                            fillColor: schannel.fillColor,
                            fillOpacity: schannel.fillOpacity,
                            internalLines: JSON.parse(JSON.stringify(schannel.internalLines || [])),
                            showLabelLeft: schannel.showLabelLeft,
                            showLabelCenter: schannel.showLabelCenter,
                            showLabelRight: schannel.showLabelRight,
                            extendLeft: schannel.extendLeft,
                            extendRight: schannel.extendRight,
                          };
                          localStorage.setItem('schannelDefaults', JSON.stringify(defaults));
                          updateSChannel(selectedSChannel, { isFavorite: true });
                        }
                      }} 
                      className={`p-2 hover:bg-slate-700 rounded ${schannel?.isFavorite ? 'text-yellow-400' : 'text-gray-400'}`} 
                      title="Save as Default"
                      data-testid="btn-schannel-favorite"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                        <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })()}
            
            {/* SChannel Extend submenu */}
            {activeSubmenu === 'sch-extend' && schannelMenuPos && selectedSChannel && (() => {
              const schannel = drawnSChannels.find(c => c.id === selectedSChannel);
              const submenuX = schannelMenuPos.x + 50 < dimensions.width - 100 ? schannelMenuPos.x + 50 : schannelMenuPos.x - 110;
              const submenuY = Math.min(schannelMenuPos.y, dimensions.height - 80);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY }}>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateSChannel(selectedSChannel, { extendLeft: !schannel?.extendLeft })}
                      className={`p-2 rounded transition-colors ${schannel?.extendLeft ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                      title="Extend Left"
                      data-testid="btn-schannel-extend-left"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 4L4 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => updateSChannel(selectedSChannel, { extendRight: !schannel?.extendRight })}
                      className={`p-2 rounded transition-colors ${schannel?.extendRight ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                      title="Extend Right"
                      data-testid="btn-schannel-extend-right"
                    >
                      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 4L16 10L8 16" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })()}
            
            {/* SChannel Top Line submenu - color grid + size/style */}
            {activeSubmenu === 'sch-top' && schannelMenuPos && selectedSChannel && (() => {
              const schannel = drawnSChannels.find(c => c.id === selectedSChannel);
              const submenuX = schannelMenuPos.x + 50 < dimensions.width - 160 ? schannelMenuPos.x + 50 : schannelMenuPos.x - 170;
              const submenuY = Math.min(schannelMenuPos.y, dimensions.height - 180);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY, minWidth: '140px' }}>
                  <div className="text-xs text-gray-400 mb-1">Top Line Color</div>
                  <div className="flex flex-wrap gap-1 mb-2 w-32">
                    {TRENDLINE_COLORS.map(color => (
                      <button key={color} onClick={() => updateSChannel(selectedSChannel, { topLineColor: color })}
                        className={`w-5 h-5 rounded border-2 ${schannel?.topLineColor === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }} data-testid={`btn-schannel-top-color-${color.replace('#', '')}`} />
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Thickness</div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4].map(size => (
                      <button key={size} onClick={() => updateSChannel(selectedSChannel, { topLineThickness: size })}
                        className={`px-2 py-1 text-xs rounded ${schannel?.topLineThickness === size ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        data-testid={`btn-schannel-top-thickness-${size}`}>{size}</button>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Style</div>
                  <div className="flex gap-1">
                    {(['solid', 'dashed', 'dotted'] as const).map(style => (
                      <button key={style} onClick={() => updateSChannel(selectedSChannel, { topLineStyle: style })}
                        className={`px-2 py-1 text-xs rounded ${schannel?.topLineStyle === style ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        data-testid={`btn-schannel-top-style-${style}`}>{style}</button>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* SChannel Bottom Line submenu - color grid + size/style */}
            {activeSubmenu === 'sch-bottom' && schannelMenuPos && selectedSChannel && (() => {
              const schannel = drawnSChannels.find(c => c.id === selectedSChannel);
              const submenuX = schannelMenuPos.x + 50 < dimensions.width - 160 ? schannelMenuPos.x + 50 : schannelMenuPos.x - 170;
              const submenuY = Math.min(schannelMenuPos.y, dimensions.height - 180);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY, minWidth: '140px' }}>
                  <div className="text-xs text-gray-400 mb-1">Bottom Line Color</div>
                  <div className="flex flex-wrap gap-1 mb-2 w-32">
                    {TRENDLINE_COLORS.map(color => (
                      <button key={color} onClick={() => updateSChannel(selectedSChannel, { bottomLineColor: color })}
                        className={`w-5 h-5 rounded border-2 ${schannel?.bottomLineColor === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }} data-testid={`btn-schannel-bottom-color-${color.replace('#', '')}`} />
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Thickness</div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4].map(size => (
                      <button key={size} onClick={() => updateSChannel(selectedSChannel, { bottomLineThickness: size })}
                        className={`px-2 py-1 text-xs rounded ${schannel?.bottomLineThickness === size ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        data-testid={`btn-schannel-bottom-thickness-${size}`}>{size}</button>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Style</div>
                  <div className="flex gap-1">
                    {(['solid', 'dashed', 'dotted'] as const).map(style => (
                      <button key={style} onClick={() => updateSChannel(selectedSChannel, { bottomLineStyle: style })}
                        className={`px-2 py-1 text-xs rounded ${schannel?.bottomLineStyle === style ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                        data-testid={`btn-schannel-bottom-style-${style}`}>{style}</button>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* SChannel Internal Lines submenu */}
            {activeSubmenu === 'sch-internal' && schannelMenuPos && selectedSChannel && (() => {
              const schannel = drawnSChannels.find(c => c.id === selectedSChannel);
              const submenuX = schannelMenuPos.x + 50 < dimensions.width - 200 ? schannelMenuPos.x + 50 : schannelMenuPos.x - 210;
              const submenuY = Math.min(schannelMenuPos.y, dimensions.height - 250);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY, minWidth: '195px' }}>
                  <div className="text-xs text-gray-400 mb-1">Channel Fill</div>
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => updateSChannel(selectedSChannel, { fillOpacity: 0 })}
                      className={`w-5 h-5 rounded border border-gray-400 ${(schannel?.fillOpacity ?? 0.1) === 0 ? 'ring-1 ring-blue-400' : ''}`}
                      style={{ backgroundImage: 'linear-gradient(45deg, #666 25%, transparent 25%), linear-gradient(-45deg, #666 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #666 75%), linear-gradient(-45deg, transparent 75%, #666 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px' }}
                      title="Off" data-testid="btn-schannel-fill-off" />
                    {[{ color: '#ef4444', name: 'Red' }, { color: '#22c55e', name: 'Green' }, { color: '#ffffff', name: 'White' }].map(({ color, name }) => (
                      <button key={color} onClick={() => updateSChannel(selectedSChannel, { fillColor: color, fillOpacity: schannel?.fillOpacity || 0.1 })}
                        className={`w-5 h-5 rounded ${schannel?.fillColor === color && (schannel?.fillOpacity ?? 0.1) > 0 ? 'ring-1 ring-blue-400' : ''} ${color === '#ffffff' ? 'border border-gray-400' : ''}`}
                        style={{ backgroundColor: color }} title={name} data-testid={`btn-schannel-fill-${name.toLowerCase()}`} />
                    ))}
                    <input type="range" min="5" max="50" value={Math.round((schannel?.fillOpacity ?? 0.1) * 100)}
                      className="w-16 h-3 accent-blue-500" title={`Opacity: ${Math.round((schannel?.fillOpacity ?? 0.1) * 100)}%`}
                      onChange={e => updateSChannel(selectedSChannel, { fillOpacity: parseInt(e.target.value) / 100 })} />
                    <span className="text-gray-400 text-[9px]">{Math.round((schannel?.fillOpacity ?? 0.1) * 100)}%</span>
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Internal Lines</div>
                  {schannel?.internalLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2">
                      <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={line.visible} 
                        data-testid={`checkbox-schannel-internal-${idx}`}
                        onChange={e => {
                          const newLines = [...(schannel?.internalLines || [])];
                          newLines[idx] = { ...newLines[idx], visible: e.target.checked };
                          updateSChannel(selectedSChannel, { internalLines: newLines });
                        }} />
                      <span className="text-white text-xs w-8">{line.percent}%</span>
                      {['#ef4444', '#22c55e', '#ffffff'].map(color => (
                        <button key={color} onClick={() => {
                          const newLines = [...(schannel?.internalLines || [])];
                          newLines[idx] = { ...newLines[idx], color };
                          updateSChannel(selectedSChannel, { internalLines: newLines });
                        }}
                          className={`w-5 h-5 rounded ${line.color === color ? 'ring-1 ring-blue-400' : ''} ${color === '#ffffff' ? 'border border-gray-400' : ''}`}
                          style={{ backgroundColor: color }} data-testid={`btn-schannel-internal-${idx}-color-${color.replace('#', '')}`} />
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
            
            {/* SChannel Label submenu */}
            {activeSubmenu === 'sch-label' && schannelMenuPos && selectedSChannel && (() => {
              const schannel = drawnSChannels.find(c => c.id === selectedSChannel);
              const submenuX = schannelMenuPos.x + 50 < dimensions.width - 180 ? schannelMenuPos.x + 50 : schannelMenuPos.x - 190;
              const submenuY = Math.min(schannelMenuPos.y, dimensions.height - 220);
              return (
                <div className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50" data-menu="submenu" style={{ left: submenuX, top: submenuY, minWidth: '170px' }}>
                  <div className="text-xs text-gray-400 mb-1">Show Labels At</div>
                  <div className="flex gap-1 mb-3">
                    <button onClick={() => updateSChannel(selectedSChannel, { showLabelLeft: !schannel?.showLabelLeft })}
                      className={`flex-1 p-1.5 rounded ${schannel?.showLabelLeft ? 'bg-blue-600' : 'bg-slate-700'}`} title="Left" data-testid="btn-schannel-label-left">
                      <svg viewBox="0 0 20 20" className="w-4 h-4 mx-auto" fill="none" stroke="white" strokeWidth="2">
                        <path d="M12 4L6 10L12 16" />
                      </svg>
                    </button>
                    <button onClick={() => updateSChannel(selectedSChannel, { showLabelCenter: !schannel?.showLabelCenter })}
                      className={`flex-1 p-1.5 rounded ${schannel?.showLabelCenter ? 'bg-blue-600' : 'bg-slate-700'}`} title="Center" data-testid="btn-schannel-label-center">
                      <svg viewBox="0 0 20 20" className="w-4 h-4 mx-auto" fill="white" stroke="none">
                        <circle cx="10" cy="10" r="4" />
                      </svg>
                    </button>
                    <button onClick={() => updateSChannel(selectedSChannel, { showLabelRight: !schannel?.showLabelRight })}
                      className={`flex-1 p-1.5 rounded ${schannel?.showLabelRight ? 'bg-blue-600' : 'bg-slate-700'}`} title="Right" data-testid="btn-schannel-label-right">
                      <svg viewBox="0 0 20 20" className="w-4 h-4 mx-auto" fill="none" stroke="white" strokeWidth="2">
                        <path d="M8 4L14 10L8 16" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 mb-2">Line Labels</div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: schannel?.topLineColor || '#22c55e' }} />
                    <span className="text-xs text-gray-300 w-12">Top:</span>
                    <input type="text" value={schannel?.topLabel || ''} placeholder="Label" maxLength={10}
                      className="flex-1 bg-slate-700 text-white px-1 py-0.5 text-xs rounded"
                      onChange={e => updateSChannel(selectedSChannel, { topLabel: e.target.value })}
                      data-testid="input-schannel-top-label" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: schannel?.bottomLineColor || '#ef4444' }} />
                    <span className="text-xs text-gray-300 w-12">Bottom:</span>
                    <input type="text" value={schannel?.bottomLabel || ''} placeholder="Label" maxLength={10}
                      className="flex-1 bg-slate-700 text-white px-1 py-0.5 text-xs rounded"
                      onChange={e => updateSChannel(selectedSChannel, { bottomLabel: e.target.value })}
                      data-testid="input-schannel-bottom-label" />
                  </div>
                  {schannel?.internalLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: line.color }} />
                      <span className="text-xs text-gray-300 w-12">{line.percent}%:</span>
                      <input type="text" value={line.label || ''} placeholder="Label" maxLength={10}
                        className="flex-1 bg-slate-700 text-white px-1 py-0.5 text-xs rounded"
                        onChange={e => {
                          const newLines = [...(schannel?.internalLines || [])];
                          newLines[idx] = { ...newLines[idx], label: e.target.value };
                          updateSChannel(selectedSChannel, { internalLines: newLines });
                        }}
                        data-testid={`input-schannel-internal-${idx}-label`} />
                    </div>
                  ))}
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
                data-drawing-overlay
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
                data-drawing-overlay
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
                data-drawing-overlay
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
                data-drawing-overlay
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
            
            {/* Click overlay for move mode - handles trendline endpoints and horizontal moves */}
            {moveMode && !movingPoint && !movingWholeLine && !movingHorizontal && (
              <div 
                className="absolute top-0 right-0 bottom-0 z-20 pointer-events-none"
                style={{ left: 40 }}
              >
                {/* Visual feedback handles - these could be made clickable if needed, 
                    but for now we let handleSvgTapSelection handle the clicks via the main SVG layer */}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

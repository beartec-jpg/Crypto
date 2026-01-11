import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { createChart, ColorType, CrosshairMode, IChartApi, CandlestickSeries, LineSeries, HistogramSeries, ISeriesApi, createSeriesMarkers, LineWidth, Time } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TrendingUp, TrendingDown, Activity, DollarSign, Loader2, Bell, ChevronDown, ChevronUp, Zap, Save, Settings, MessageSquare, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { useLocation } from 'wouter';
import { useChartGestures, type GesturePoint } from '@/hooks/useChartGestures';
import bearTecLogo from '@assets/1_20251120_023939_0000_1763606422703.png';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import grokLogo from '@assets/Grok_Full_Logomark_Light_1763287603908.png';
import aiAnalysisLogo from '@assets/20251119_202707_0000_1763584050669.png';
import bearVideo from '@assets/grok_video_2025-11-20-03-05-08_1763607929480.mp4';
import transitionVideo from '@assets/grok_video_2025-11-20-06-10-37_1763619824022.mp4';
import bullVideo from '@assets/grok_video_2025-11-20-06-16-11_1763619952816.mp4';
import aiButtonVideo from '@assets/grok_video_2025-11-20-02-22-16_1763605488674.mp4';
import { AlertSettingsDialog } from '@/components/AlertSettingsDialog';
import { incrementTickerClick } from '@/lib/tickerUtils';
import { TickerSelector } from '@/components/TickerSelector';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import {
  calculateSupertrend,
  calculateVWAPBands,
  calculateSessionVWAP,
  calculateOrderBlocks,
  calculatePremiumDiscount,
  calculateParabolicSAR,
  calculateStochasticRSI,
  calculateWilliamsR,
  calculateMFI,
  calculateCCI,
  calculateADX,
  calculateSMA,
  SupertrendValue,
  BandValue,
  IndicatorValue
} from '@/lib/indicators';
import {
  createDrawingPrimitive,
  DrawingPrimitive,
  TrendLinePrimitive,
  HorizontalLinePrimitive,
  RectanglePrimitive,
  FibRetracementPrimitive,
  ChannelPrimitive
} from '@/lib/chartPrimitives';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Utility to generate future whitespace bars for the chart
// This allows drawing on future dates by providing timestamps beyond the last candle
const generateFutureWhitespace = (lastCandleTime: number, interval: string, count: number = 50): { time: number }[] => {
  const intervalSeconds: Record<string, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '6h': 21600,
    '8h': 28800,
    '12h': 43200,
    '1d': 86400,
    '3d': 259200,
    '1w': 604800,
    '1M': 2592000,
  };
  
  const seconds = intervalSeconds[interval] || 3600;
  const futureBars: { time: number }[] = [];
  
  for (let i = 1; i <= count; i++) {
    futureBars.push({ time: lastCandleTime + (seconds * i) });
  }
  
  return futureBars;
};

// Get recommended future bar count based on timeframe
// User wants "half a chart worth at full zoom out" - approximately 300 bars for all timeframes
const getFutureBarCount = (interval: string): number => {
  // Use consistent large count for all timeframes to ensure half chart of future space
  return 300;
};

// Get table row limit based on timeframe - industry standard lookback periods
const getTableRowLimit = (interval: string): number => {
  const limits: Record<string, number> = {
    '1m': 60,   // 1 hour of data
    '3m': 40,   // 2 hours
    '5m': 36,   // 3 hours
    '15m': 32,  // 8 hours
    '30m': 24,  // 12 hours
    '1h': 24,   // 1 day
    '2h': 24,   // 2 days
    '4h': 18,   // 3 days
    '6h': 16,   // 4 days
    '8h': 15,   // 5 days
    '12h': 14,  // 1 week
    '1d': 21,   // 3 weeks
    '3d': 14,   // 6 weeks
    '1w': 12,   // 3 months
    '1M': 6,    // 6 months
  };
  return limits[interval] || 24;
};

interface VWAPData {
  time: number;
  value: number;
}

interface FVG {
  time: number;
  lower: number;
  upper: number;
  type: 'bullish' | 'bearish';
  volumeScore?: number;
  deltaScore?: number;
  isHighValue?: boolean;
}

interface FootprintData {
  time: number;
  bidVol: number[];
  askVol: number[];
  prices: number[];
  delta: number;
}

interface BOS {
  swingTime: number;
  swingPrice: number;
  breakTime: number;
  breakIndex: number;
  type: 'bullish' | 'bearish';
  isLiquidityGrab?: boolean;
  sweptLevel?: 'high' | 'low'; // Track which level was swept for reversals
}

interface CHoCH {
  swingTime: number;
  swingPrice: number;
  breakTime: number;
  breakIndex: number;
  type: 'bullish' | 'bearish';
  isLiquidityGrab?: boolean;
  sweptLevel?: 'high' | 'low'; // Track which level was swept for reversals
}

// Bot-specific TP/SL Configuration Types
type TPType = 'structure' | 'trailing' | 'atr' | 'fixed_rr' | 'vwap' | 'ema' | 'projection';
type SLType = 'structure' | 'fixed' | 'atr' | 'fixed_distance';

interface TradeSignal {
  id: string;
  time: number;
  type: 'LONG' | 'SHORT';
  strategy: 'liquidity_grab' | 'choch_fvg' | 'vwap_rejection' | 'structure_break' | 'rs_flip' | 'bos_trend' | 'ema_trading';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Type: TPType;
  tp2Type: TPType;
  tp3Type: TPType;
  tp1Config?: TPConfig; // Full TP1 configuration (for exit modes and EMA settings)
  tp2Config?: TPConfig; // Full TP2 configuration
  tp3Config?: TPConfig; // Full TP3 configuration
  riskReward1: number;
  riskReward2: number;
  riskReward3: number;
  quantity: number;
  reason: string;
  active: boolean;
  trailingActive?: boolean; // Track if trailing TP is activated
  entryEMAState?: 'fast_above_slow' | 'fast_below_slow'; // Track EMA relationship at entry for crossover detection
}

interface Position {
  type: 'long' | 'short';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  quantity: number;
  signalId: string;
}

interface MarketAlert {
  id: string;
  time: number;
  type: 'BOS' | 'CHoCH' | 'Liquidity Sweep' | 'FVG' | 'FVG Entry' | 'VWAP Bounce' | 'VWAP Cross' | 'Trendline Breakout' | 'Trendline Rejection' | 'CVD Spike' | 'Volume Spike' | 'Level 2 Spike' | 'Oscillator Divergence' | 'Oscillator Crossover' | 'OBV Divergence' | 'OBV Trend' | 'OBV Spike' | 'BB Upper Touch' | 'BB Lower Touch' | 'BB Breakout' | 'BB Middle Cross';
  direction: 'bullish' | 'bearish';
  price: number;
  description: string;
  level?: number; // For divergence levels 1-5
  indicators?: string[]; // For multi-indicator divergences
}

interface BacktestTrade {
  id: string;
  entryTime: number;
  exitTime: number;
  direction: 'long' | 'short';
  strategy: string;
  entry: number;
  exit: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  outcome: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'Breakeven' | 'EMA Exit' | 'VWAP Exit';
  rr: number;
  profitLoss: number;
  winner: boolean;
}

interface BacktestResults {
  trades: BacktestTrade[];
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  avgRR: number;
  totalPL: number;
  profitFactor: number;
  accountSize: number;
  riskPerTrade: number;
  avgPositionSize: number;
  finalBalance: number;
  returnPercent: number;
}

interface TPConfig {
  type: TPType;
  atrMultiplier?: number;        // For ATR-based
  fixedRR?: number;              // For fixed R:R
  vwapPeriod?: 'session' | 'daily' | 'weekly' | 'monthly' | 'rolling10' | 'rolling20' | 'rolling50'; // For VWAP exit
  vwapOffset?: number;           // % offset from VWAP
  vwapExitMode?: 'touch' | 'cross'; // VWAP exit mode: touch = price touches VWAP, cross = price crosses VWAP
  projectionMultiplier?: number; // For projection-based
  emaFast?: number;              // For EMA exit (fast period) - strategy-specific
  emaSlow?: number;              // For EMA exit (slow period) - strategy-specific
  emaExitMode?: 'touch' | 'crossover'; // EMA exit mode: touch = price touches EMA, crossover = EMAs cross each other
  swingLength?: number;          // For structure-based TP
  trailingSwingLength?: number;  // For trailing TP - which swing to trail
  positionPercent: number;       // % of position to close at this TP
}

interface SLConfig {
  type: SLType;
  atrMultiplier?: number;        // For ATR-based
  fixedDistance?: number;        // For fixed distance
  swingLength?: number;          // For structure-based SL swing length
  useNearestSwing?: boolean;     // For structure-based
}

interface BotTPSLConfig {
  numTPs: 1 | 2 | 3;
  tp1: TPConfig;
  tp2?: TPConfig;
  tp3?: TPConfig;
  sl: SLConfig;
}

interface AutoBacktestResult {
  config: BotTPSLConfig;
  results: BacktestResults;
  configDescription: string;
  swingLength: number;
  wickRatio: number;
  confirmCandles: number;
  useWickFilter: boolean;
  useConfirmCandles: boolean;
  trendFilter: 'ema' | 'structure' | 'both' | 'none';
  allowedDirections: 'both' | 'long' | 'short';
}

interface AutoBacktestTestParams {
  testTP1Types: TPType[];
  testTP2Types: TPType[];
  testTP3Types: TPType[];
  testSLTypes: SLType[];
  testATRMultipliers: number[];
  testRRRatios: number[];
  testProjectionMultipliers: number[];
}

// Dynamic Moving Average configuration
interface MAConfig {
  id: string;
  period: number;
  timeframe: string; // 'current' or specific timeframe like '1h', '4h', '1d'
  color: string;
}

const MA_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
const MA_TIMEFRAMES = [
  { value: 'current', label: 'Current' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

// Helper to format MA label with timeframe suffix
// Examples: 21 (current), 100D (daily), 21W (weekly), 100h4 (4-hour), 50h1 (hourly), 21m5 (5-min)
const formatMALabel = (period: number, timeframe: string): string => {
  if (timeframe === 'current') return `${period}`;
  if (timeframe === '1d') return `${period}D`;
  if (timeframe === '1w') return `${period}W`;
  if (timeframe === '1M') return `${period}M`;
  if (timeframe === '4h') return `${period}h4`;
  if (timeframe === '1h') return `${period}h1`;
  if (timeframe === '15m') return `${period}m15`;
  if (timeframe === '5m') return `${period}m5`;
  if (timeframe === '1m') return `${period}m1`;
  return `${period}${timeframe}`;
};

export default function CryptoIndicators() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const seriesMarkersRef = useRef<ReturnType<typeof createSeriesMarkers> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fetchGenerationRef = useRef(0); // Track latest fetch to prevent stale updates
  const abortControllerRef = useRef<AbortController | null>(null); // Cancel pending requests
  const { toast } = useToast();

  const { isAuthenticated, isLoading: authLoading, getToken, user } = useCryptoAuth();
  
  usePageViewTracking('crypto-indicators');
  const [, setLocation] = useLocation();
  
  // Stable user ID for storage keys - prevents re-loading on user object reference changes
  const userId = user?.id || 'anonymous';

  const { data: subscription } = useQuery<{tier: string, aiCreditsRemaining?: number}>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isAuthenticated && !authLoading
  });
  const tier = subscription?.tier || 'free';
  const isPaidTier = tier !== 'free';
  
  // Free tier oscillators: only RSI and MACD, max 1 active at a time
  const FREE_OSCILLATORS = ['RSI', 'MACD'];
  const MAX_FREE_OSCILLATORS = 1;

  const [symbol, setSymbol] = useState('XRPUSDT');
  const [interval, setTimeframeInterval] = useState(() => {
    // Load saved default timeframe for the initial symbol
    const savedTimeframe = localStorage.getItem('defaultTimeframe_XRPUSDT');
    return savedTimeframe || '15m';
  });
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [alertSettingsOpen, setAlertSettingsOpen] = useState(false);
  
  // Track previous symbol to clear HTF caches on symbol change
  const prevSymbolRef = useRef(symbol);
  
  // Video sequence state
  const [videoPhase, setVideoPhase] = useState<'initial_bear' | 'transition' | 'final'>('initial_bear');
  const [targetMarketState, setTargetMarketState] = useState<'bullish' | 'bearish'>('bearish');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const bearVideoRef = useRef<HTMLVideoElement>(null);
  const transitionVideoRef = useRef<HTMLVideoElement>(null);
  const bullVideoRef = useRef<HTMLVideoElement>(null);

  const aiReviewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/crypto/ai-market-review', {
        candles: candles,
        currentPrice: candles[candles.length - 1]?.close
      });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'AI Market Review',
        description: data.analysis,
        duration: 10000
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to get AI analysis. Please upgrade to Beginner tier.',
        variant: 'destructive'
      });
    }
  });

  const handleAIMarketReview = () => {
    aiReviewMutation.mutate();
  };

  const [loading, setLoading] = useState(true);
  const [chartReady, setChartReady] = useState(false);
  const [crosshairInfo, setCrosshairInfo] = useState<{time: number; x: number; y: number} | null>(null);
  const [visibleCandleCount, setVisibleCandleCount] = useState<number>(0);
  
  // Chart controls tab state - null means no tab selected (collapsed)
  const [chartControlsTab, setChartControlsTab] = useState<'smc' | 'trend' | 'vwap' | 'oscillators' | null>(null);
  const chartControlsRef = useRef<HTMLDivElement>(null);
  
  // Drawing tools state
  type DrawingTool = 'trendline' | 'horizontal' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel' | null;
  const [drawingMode, setDrawingMode] = useState<'off' | 'draw' | 'select'>('draw'); // Draw mode active by default
  const [isFullscreen, setIsFullscreen] = useState(false); // Fullscreen chart mode
  const [activeTool, setActiveTool] = useState<DrawingTool>(null);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [drawings, setDrawings] = useState<any[]>([]);
  const [drawingsVisible, setDrawingsVisible] = useState(true); // Toggle to hide/show all drawings
  const [tempDrawing, setTempDrawing] = useState<{points: {time: number; price: number; snapType?: 'high' | 'low' | 'none'}[]} | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  
  // Native primitives for high-performance drawing rendering
  const drawingPrimitivesRef = useRef<Map<string, DrawingPrimitive>>(new Map());
  const [showDrawingSettings, setShowDrawingSettings] = useState(false);
  const [editFibMode, setEditFibMode] = useState<'none' | 'values' | 'labels'>('none');
  const [crosshairModeActive, setCrosshairModeActive] = useState(false);
  const [autoSnapEnabled, setAutoSnapEnabled] = useState(true);
  const [autoColorEnabled, setAutoColorEnabled] = useState(true);
  
  // Point editing state - when a point is picked, it's visually removed and must be replaced
  const [activeEdit, setActiveEdit] = useState<{
    drawingId: string;
    pointIndex: number;
    originalDrawing: any;
  } | null>(null);
  const activeEditRef = useRef<typeof activeEdit>(null);
  const updateDrawingMutationRef = useRef<{ mutate: (data: { id: string; style?: any; coordinates?: any }) => void } | null>(null);
  const candlesRef = useRef<CandleData[]>([]);
  
  // Ref for tracking active tool in callbacks
  const activeToolRef = useRef(activeTool);
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);
  
  // Ref for tracking auto-color setting in callbacks
  const autoColorEnabledRef = useRef(autoColorEnabled);
  useEffect(() => {
    autoColorEnabledRef.current = autoColorEnabled;
  }, [autoColorEnabled]);
  
  // Keep activeEdit ref in sync
  useEffect(() => {
    activeEditRef.current = activeEdit;
  }, [activeEdit]);
  
  // Keep candles ref in sync for callbacks
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);
  
  // Cooldown ref to prevent immediate placement after pickup (1 second delay)
  const pointPickupTimeRef = useRef<number>(0);
  const EDIT_PLACEMENT_COOLDOWN_MS = 1000;
  
  // Handler to pick up a point (first click on green circle) - removes point visually
  const handlePointPick = useCallback((drawingId: string, pointIndex: number, e: React.MouseEvent | React.TouchEvent) => {
    console.log('🎯 Point picked up (will be removed until replaced):', { drawingId, pointIndex });
    e.preventDefault();
    e.stopPropagation();
    
    // Record pickup time for cooldown
    pointPickupTimeRef.current = Date.now();
    
    // Find the drawing
    const drawing = drawings.find(d => d.id === drawingId);
    if (!drawing) return;
    
    // Store the edit state with original drawing
    setActiveEdit({
      drawingId,
      pointIndex,
      originalDrawing: { ...drawing, points: [...drawing.points] }
    });
    
    // Keep the drawing selected
    setSelectedDrawingId(drawingId);
  }, [drawings]);
  
  // Ref for gesture controller's findSnapPoint function
  const findSnapPointRef = useRef<((clientX: number, clientY: number) => { time: any; price: number; snapType?: 'high' | 'low' | 'none' } | null) | null>(null);
  
  // Handler to place the edited point (next click on chart)
  const handleEditPointPlace = useCallback((clientX: number, clientY: number) => {
    console.log('🎯 Placing edited point:', { clientX, clientY, activeEdit: activeEditRef.current });
    const edit = activeEditRef.current;
    if (!edit) return;
    
    // Check cooldown - prevent placement within 1 second of pickup
    const timeSincePickup = Date.now() - pointPickupTimeRef.current;
    if (timeSincePickup < EDIT_PLACEMENT_COOLDOWN_MS) {
      console.log('🎯 Placement blocked - cooldown active:', { timeSincePickup, required: EDIT_PLACEMENT_COOLDOWN_MS });
      return;
    }
    
    if (!chartRef.current || !candleSeriesRef.current || !chartContainerRef.current) {
      setActiveEdit(null);
      return;
    }
    
    // Skip gesture controller snap during edit - use free placement instead
    // The gesture snap restricts to candle high/low, but during edit we want free Y placement
    
    // Fallback: manual coordinate conversion if no snap found
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const container = chartContainerRef.current;
    const rect = container.getBoundingClientRect();
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    const logicalX = chart.timeScale().coordinateToLogical(x);
    if (logicalX === null) {
      setActiveEdit(null);
      return;
    }
    
    const candleIndex = Math.round(logicalX);
    const allCandles = candlesRef.current;
    
    let price = candleSeries.coordinateToPrice(y);
    if (price === null) {
      setActiveEdit(null);
      return;
    }
    
    let finalTime: number;
    let snapType: 'high' | 'low' | 'none' = 'none';
    
    // During edit mode: snap time to candle, but keep free Y placement (no price snap)
    // This allows users to place points anywhere on the Y axis
    if (candleIndex >= allCandles.length) {
      const lastCandle = allCandles[allCandles.length - 1];
      const secondLastCandle = allCandles.length > 1 ? allCandles[allCandles.length - 2] : null;
      const timeInterval = secondLastCandle ? (lastCandle.time - secondLastCandle.time) : 3600;
      const barsAhead = candleIndex - (allCandles.length - 1);
      finalTime = (lastCandle.time as number) + (barsAhead * (timeInterval as number));
      // Free Y placement - no price snapping in edit mode
    } else if (candleIndex < 0) {
      const candle = allCandles[0];
      finalTime = candle.time as number;
      // Free Y placement - no price snapping in edit mode
    } else {
      const candle = allCandles[candleIndex];
      finalTime = candle.time as number;
      // Free Y placement - no price snapping in edit mode
    }
    
    // Create updated points array from original
    const newPoints = [...edit.originalDrawing.points];
    newPoints[edit.pointIndex] = { time: finalTime, price, snapType };
    
    // Optimistically update local state
    setDrawings(prev => prev.map(d => 
      d.id === edit.drawingId ? { ...d, points: newPoints } : d
    ));
    
    // Update via mutation
    if (updateDrawingMutationRef.current) {
      updateDrawingMutationRef.current.mutate({
        id: edit.drawingId,
        coordinates: { points: newPoints },
      });
    }
    
    setActiveEdit(null);
  }, [autoSnapEnabled]);
  
  // Ref for tracking crosshair info for UI display
  const lastCrosshairParamRef = useRef<{ time: number; price: number; logicalX?: number; pointX?: number } | null>(null);
  
  // Fetch saved drawings from database
  const { data: savedDrawings = [], refetch: refetchDrawings } = useQuery<any[]>({
    queryKey: ['/api/crypto/chart-drawings', symbol, interval],
    queryFn: async () => {
      const response = await authenticatedApiRequest('GET', `/api/crypto/chart-drawings?symbol=${symbol}&timeframe=${interval}`);
      return response.json();
    },
    enabled: isAuthenticated && !authLoading && !!symbol && !!interval,
  });
  
  // Load saved drawings into state when data changes
  useEffect(() => {
    // Always sync state with database, even for empty arrays
    if (savedDrawings) {
      setDrawings(savedDrawings.map(d => ({
        id: d.id,
        type: d.drawing_type || d.drawingType,
        points: d.coordinates?.points || [],
        style: d.style || { color: '#3b82f6', lineWidth: 2 },
      })).filter(d => d.points.length > 0)); // Only keep drawings with valid points
    }
  }, [savedDrawings]);
  
  // Attach/detach native primitives for high-performance rendering
  useEffect(() => {
    if (!chartReady || !candleSeriesRef.current) return;
    
    const candleSeries = candleSeriesRef.current;
    const currentPrimitives = drawingPrimitivesRef.current;
    const currentDrawingIds = new Set(drawings.map(d => d.id));
    
    // If drawings are hidden, detach all primitives
    if (!drawingsVisible) {
      currentPrimitives.forEach((primitive) => {
        try {
          candleSeries.detachPrimitive(primitive);
        } catch (e) {
          // Already detached
        }
      });
      currentPrimitives.clear();
      return;
    }
    
    // Remove primitives for deleted drawings OR drawings being edited
    currentPrimitives.forEach((primitive, id) => {
      const isBeingEdited = activeEdit && activeEdit.drawingId === id;
      if (!currentDrawingIds.has(id) || isBeingEdited) {
        try {
          candleSeries.detachPrimitive(primitive);
        } catch (e) {
          // Already detached
        }
        currentPrimitives.delete(id);
      }
    });
    
    // Add or update primitives for current drawings (skip if being edited)
    drawings.forEach(drawing => {
      const isBeingEdited = activeEdit && activeEdit.drawingId === drawing.id;
      if (isBeingEdited) return; // Don't render primitive while editing
      
      const existingPrimitive = currentPrimitives.get(drawing.id);
      
      if (existingPrimitive) {
        // Update existing primitive
        existingPrimitive.setSelected(selectedDrawingId === drawing.id);
        
        // Update points if they changed
        if ('updatePoints' in existingPrimitive) {
          (existingPrimitive as TrendLinePrimitive | RectanglePrimitive | FibRetracementPrimitive | ChannelPrimitive).updatePoints(drawing.points);
        } else if ('updatePoint' in existingPrimitive) {
          (existingPrimitive as HorizontalLinePrimitive).updatePoint(drawing.points[0]);
        }
        
        // Update style
        existingPrimitive.updateStyle(drawing.style);
      } else {
        // Create and attach new primitive
        const primitive = createDrawingPrimitive(
          drawing.id,
          drawing.type,
          drawing.points,
          drawing.style
        );
        
        if (primitive) {
          try {
            candleSeries.attachPrimitive(primitive);
            currentPrimitives.set(drawing.id, primitive);
          } catch (e) {
            console.error('Failed to attach primitive:', e);
          }
        }
      }
    });
    
    // Cleanup on unmount
    return () => {
      currentPrimitives.forEach((primitive) => {
        try {
          candleSeries.detachPrimitive(primitive);
        } catch (e) {
          // Already detached or chart disposed
        }
      });
      currentPrimitives.clear();
    };
  }, [chartReady, drawings, selectedDrawingId, activeEdit, drawingsVisible]);
  
  // Save drawing mutation
  const saveDrawingMutation = useMutation({
    mutationFn: async (drawing: any) => {
      const response = await authenticatedApiRequest('POST', '/api/crypto/chart-drawings', {
        symbol,
        timeframe: interval,
        drawingType: drawing.type,
        coordinates: { points: drawing.points },
        style: drawing.style,
      });
      return { ...(await response.json()), localId: drawing.id };
    },
    onSuccess: (serverDrawing) => {
      // Update local state with server ID before refetch
      setDrawings(prev => prev.map(d => 
        d.id === serverDrawing.localId 
          ? { ...d, id: serverDrawing.id }
          : d
      ));
      refetchDrawings();
    },
  });
  
  // Delete drawing mutation  
  const deleteDrawingMutation = useMutation({
    mutationFn: async (drawingId: string) => {
      // Immediately remove from local state for instant UI feedback
      setDrawings(prev => prev.filter(d => d.id !== drawingId));
      setSelectedDrawingId(null);
      
      const response = await authenticatedApiRequest('DELETE', `/api/crypto/chart-drawings/${drawingId}`);
      return response.json();
    },
    onSuccess: () => {
      refetchDrawings();
    },
    onError: () => {
      // If delete fails, refetch to restore the drawing
      refetchDrawings();
    },
  });
  
  // Clear all drawings mutation
  const clearDrawingsMutation = useMutation({
    mutationFn: async () => {
      const response = await authenticatedApiRequest('DELETE', `/api/crypto/chart-drawings?symbol=${symbol}&timeframe=${interval}`);
      return response.json();
    },
    onSuccess: () => {
      setDrawings([]);
      refetchDrawings();
    },
  });
  
  // Update drawing mutation (for settings changes)
  const updateDrawingMutation = useMutation({
    mutationFn: async ({ id, style, coordinates }: { id: string; style?: any; coordinates?: any }) => {
      const body: Record<string, any> = {};
      if (style) body.style = style;
      if (coordinates) body.coordinates = coordinates;
      const response = await authenticatedApiRequest('PATCH', `/api/crypto/chart-drawings/${id}`, body);
      return response.json();
    },
    onSuccess: () => {
      refetchDrawings();
    },
  });
  
  // Keep mutation ref in sync for point dragging
  useEffect(() => {
    updateDrawingMutationRef.current = updateDrawingMutation;
  }, [updateDrawingMutation]);
  
  // Determine color based on snap types for auto-color feature
  // For manual mode (magnet off), checks if line is above/below candles
  const getAutoColor = (points: {time: number; price: number; snapType?: 'high' | 'low' | 'none'}[]): string => {
    const snapTypes = points.map(p => p.snapType || 'none');
    const highCount = snapTypes.filter(t => t === 'high').length;
    const lowCount = snapTypes.filter(t => t === 'low').length;
    const noneCount = snapTypes.filter(t => t === 'none').length;
    
    // All highs = resistance = red
    if (highCount === points.length && highCount > 0) return '#ef4444'; // Red
    
    // All lows = support = green
    if (lowCount === points.length && lowCount > 0) return '#22c55e'; // Green
    
    // If all points are free placement (manual mode), check line position relative to candles
    if (noneCount === points.length && points.length >= 2) {
      // For a line, get the price at each point and check against candles in range
      const times = points.map(p => p.time as number).sort((a, b) => a - b);
      const startTime = times[0];
      const endTime = times[times.length - 1];
      
      // Get candles in range
      const candlesInRange = candles.filter(c => {
        const t = c.time as number;
        return t >= startTime && t <= endTime;
      });
      
      if (candlesInRange.length > 0) {
        // For simplicity, use average price of the line
        const avgPrice = points.reduce((sum, p) => sum + p.price, 0) / points.length;
        
        // Check if line is entirely below all lows (support)
        const allLows = candlesInRange.map(c => c.low);
        const minLow = Math.min(...allLows);
        if (avgPrice <= minLow) return '#22c55e'; // Green - support
        
        // Check if line is entirely above all highs (resistance)
        const allHighs = candlesInRange.map(c => c.high);
        const maxHigh = Math.max(...allHighs);
        if (avgPrice >= maxHigh) return '#ef4444'; // Red - resistance
      }
    }
    
    // Mixed highs and lows, or line crosses candles = blue
    return '#3b82f6'; // Blue
  };

  // Handle point commit from gesture controller
  const handlePointCommit = useCallback((point: GesturePoint) => {
    const currentTool = activeToolRef.current;
    if (drawingMode !== 'draw' || !currentTool) return;
    
    setTempDrawing(prev => {
      if (!prev) return { points: [{ time: point.time, price: point.price, snapType: point.snapType }] };
      
      const newPoints = [...prev.points, { time: point.time, price: point.price, snapType: point.snapType }];
      const requiredPoints = currentTool === 'horizontal' ? 1 : currentTool === 'trend_fib' ? 3 : 2;
      
      // If we have enough points, save the drawing
      if (newPoints.length >= requiredPoints) {
        // Determine color based on auto-color setting and snap types
        const color = autoColorEnabledRef.current ? getAutoColor(newPoints) : '#3b82f6';
        
        // Load saved defaults for fib and channel tools
        let savedDefaults: any = {};
        if (currentTool === 'fib_retracement' || currentTool === 'trend_fib' || currentTool === 'channel') {
          try {
            const defaultKey = currentTool === 'channel' ? 'channelDefaults' : `fibDefaults_${currentTool}`;
            const stored = localStorage.getItem(defaultKey);
            if (stored) savedDefaults = JSON.parse(stored);
          } catch (e) {}
        }
        
        // For channels, set autoColor based on global setting and default extendRight to true
        const channelStyle = currentTool === 'channel' 
          ? { autoColor: autoColorEnabledRef.current, labelPosition: 'right' as const, extendRight: true }
          : {};
        
        const newDrawing = {
          id: `drawing-${Date.now()}`,
          type: currentTool,
          points: newPoints,
          style: { color, lineWidth: 2, ...savedDefaults, ...channelStyle }
        };
        setDrawings(d => [...d, newDrawing]);
        
        // Save to database
        saveDrawingMutation.mutate(newDrawing);
        toast({ title: 'Drawing Saved', description: `${currentTool.replace('_', ' ')} added to chart` });
        
        // Reset for next drawing
        return { points: [] };
      }
      
      return { points: newPoints };
    });
  }, [drawingMode, saveDrawingMutation, toast]);
  
  // Gesture controller hook for touch/click handling
  const gestureController = useChartGestures({
    enabled: drawingMode === 'draw' && activeTool !== null,
    data: candles,
    onPointCommit: handlePointCommit,
    onCrosshairModeChange: setCrosshairModeActive,
    autoSnapEnabled,
  });
  
  // Cancel crosshair when draw mode is turned off or tool is deselected
  useEffect(() => {
    if (drawingMode !== 'draw' || activeTool === null) {
      gestureController.cancelCrosshairMode();
      setCrosshairModeActive(false);
    }
  }, [drawingMode, activeTool]);
  
  // Fullscreen mode: resize chart and handle Escape key
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        setTimeout(handleResize, 100);
      }
    };
    
    if (isFullscreen) {
      window.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleKeyDown);
      // Trigger resize immediately when entering fullscreen
      setTimeout(handleResize, 50);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);
  
  // Connect findSnapPoint function to the ref for edit mode
  useEffect(() => {
    findSnapPointRef.current = gestureController.findSnapPoint;
  }, [gestureController.findSnapPoint]);

  // VWAP toggles
  const [showVWAPSession, setShowVWAPSession] = useState(false);
  const [showVWAPDaily, setShowVWAPDaily] = useState(false);
  const [showVWAPWeekly, setShowVWAPWeekly] = useState(false);
  const [showVWAPMonthly, setShowVWAPMonthly] = useState(false);
  const [showVWAPRolling, setShowVWAPRolling] = useState(false);
  const [vwapRollingPeriod, setVwapRollingPeriod] = useState(20);
  const [vwapRollingPeriodInput, setVwapRollingPeriodInput] = useState('20');

  // Indicator toggles
  const [showFVG, setShowFVG] = useState(false);
  const [showBOS, setShowBOS] = useState(false);
  const [showCHoCH, setShowCHoCH] = useState(false);
  const [showSwingPivots, setShowSwingPivots] = useState(false);
  const [swingPivotLength, setSwingPivotLength] = useState(10);
  const [swingPivotLengthInput, setSwingPivotLengthInput] = useState('10');
  const [showHighValueOnly, setShowHighValueOnly] = useState(false);
  const [showChartLabels, setShowChartLabels] = useState(false);
  const [showAutoTrendlines, setShowAutoTrendlines] = useState(false);
  const [trendlineMinTouches, setTrendlineMinTouches] = useState(2);
  const [trendlineMinTouchesInput, setTrendlineMinTouchesInput] = useState('2');
  const [trendlineTolerance, setTrendlineTolerance] = useState(0.002); // 0.2% tolerance
  const [trendlineToleranceInput, setTrendlineToleranceInput] = useState('0.2');
  const [trendlinePivotLength, setTrendlinePivotLength] = useState(10);
  const [trendlinePivotLengthInput, setTrendlinePivotLengthInput] = useState('10');
  
  // EMA settings - dynamic list with multi-timeframe support
  const [showEMA, setShowEMA] = useState(false);
  const [emaConfigs, setEmaConfigs] = useState<MAConfig[]>([
    { id: 'ema1', period: 21, timeframe: 'current', color: '#3b82f6' }
  ]);
  const [emaInputs, setEmaInputs] = useState<Record<string, string>>({ ema1: '21' });
  const emaSeriesRefs = useRef<Record<string, ISeriesApi<'Line'> | null>>({});
  const emaHTFDataCache = useRef<Record<string, CandleData[]>>({});
  // Legacy state for backwards compatibility with trading strategies
  const emaFastPeriod = emaConfigs[0]?.period || 21;
  const emaSlowPeriod = emaConfigs[1]?.period || 50;
  const [emaFastInput, setEmaFastInput] = useState('10');
  const [emaSlowInput, setEmaSlowInput] = useState('40');
  const setEmaFastPeriod = (_: number) => {}; // Stub for legacy code
  const setEmaSlowPeriod = (_: number) => {}; // Stub for legacy code
  
  // Oscillator indicators
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const obvRef = useRef<HTMLDivElement>(null);
  // Store oscillator chart instances for time scale sync
  const oscillatorChartsRef = useRef<Map<string, IChartApi>>(new Map());
  const [showRSI, setShowRSI] = useState(false);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiPeriodInput, setRsiPeriodInput] = useState('14');
  const [showMACD, setShowMACD] = useState(false);
  const [macdFast, setMacdFast] = useState(12);
  const [macdFastInput, setMacdFastInput] = useState('12');
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSlowInput, setMacdSlowInput] = useState('26');
  const [macdSignal, setMacdSignal] = useState(9);
  const [macdSignalInput, setMacdSignalInput] = useState('9');
  const [showOBV, setShowOBV] = useState(false);
  const mfiRef = useRef<HTMLDivElement>(null);
  const [showMFI, setShowMFI] = useState(false);
  const [mfiPeriod, setMfiPeriod] = useState(14);
  const [mfiPeriodInput, setMfiPeriodInput] = useState('14');
  const [syncOscillatorScale, setSyncOscillatorScale] = useState(false);
  
  // Bollinger Bands settings
  const bbRef = useRef<HTMLDivElement>(null);
  const [showBB, setShowBB] = useState(false);
  const [bbPeriod, setBbPeriod] = useState(20);
  const [bbPeriodInput, setBbPeriodInput] = useState('20');
  const [bbStdDev, setBbStdDev] = useState(2);
  const [bbStdDevInput, setBbStdDevInput] = useState('2');
  
  // ========== NEW INDICATORS ==========
  // Series refs for chart rendering
  const supertrendSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapBandsUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapBandsLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sessionVWAPAsiaRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sessionVWAPLondonRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sessionVWAPNYRef = useRef<ISeriesApi<'Line'> | null>(null);
  
  // Batch 2 SMC indicator refs
  const orderBlocksRefs = useRef<Array<{ upper: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'>; fill: ISeriesApi<'Histogram'> }>>([]);
  const premiumDiscountRefs = useRef<{ equilibrium: ISeriesApi<'Line'> | null; premium: ISeriesApi<'Line'> | null; discount: ISeriesApi<'Line'> | null }>({ equilibrium: null, premium: null, discount: null });
  
  // Batch 3 Trend Tools & Oscillators refs
  const smaFastRef = useRef<ISeriesApi<'Line'> | null>(null);
  const smaSlowRef = useRef<ISeriesApi<'Line'> | null>(null);
  const parabolicSARRef = useRef<ISeriesApi<'Line'> | null>(null);
  
  // SMC Controls
  const [showOrderBlocks, setShowOrderBlocks] = useState(false);
  const [obSwingLength, setObSwingLength] = useState(10);
  const [obSwingLengthInput, setObSwingLengthInput] = useState('10');
  const [orderBlockLength, setOrderBlockLength] = useState(100);
  const [orderBlockLengthInput, setOrderBlockLengthInput] = useState('100');
  const [showPremiumDiscount, setShowPremiumDiscount] = useState(false);
  const [pdLookback, setPdLookback] = useState(50);
  const [pdLookbackInput, setPdLookbackInput] = useState('50');
  
  // Trend Tools - SMA with dynamic list and multi-timeframe support
  const [showSMA, setShowSMA] = useState(false);
  const [smaConfigs, setSmaConfigs] = useState<MAConfig[]>([
    { id: 'sma1', period: 50, timeframe: 'current', color: '#8b5cf6' }
  ]);
  const smaSeriesRefs = useRef<Record<string, ISeriesApi<'Line'> | null>>({});
  const smaHTFDataCache = useRef<Record<string, CandleData[]>>({});
  // Legacy state for backwards compatibility
  const smaFastPeriod = smaConfigs[0]?.period || 20;
  const smaSlowPeriod = smaConfigs[1]?.period || 50;
  const [smaFastInput, setSmaFastInput] = useState('20');
  const [smaSlowInput, setSmaSlowInput] = useState('50');
  const setSmaFastPeriod = (_: number) => {}; // Stub for legacy code
  const setSmaSlowPeriod = (_: number) => {}; // Stub for legacy code
  const [showSupertrend, setShowSupertrend] = useState(false);
  const [supertrendPeriod, setSupertrendPeriod] = useState(10);
  const [supertrendPeriodInput, setSupertrendPeriodInput] = useState('10');
  const [supertrendMultiplier, setSupertrendMultiplier] = useState(3);
  const [supertrendMultiplierInput, setSupertrendMultiplierInput] = useState('3');
  const [showParabolicSAR, setShowParabolicSAR] = useState(false);
  const [sarStep, setSarStep] = useState(0.02);
  const [sarStepInput, setSarStepInput] = useState('0.02');
  const [sarMax, setSarMax] = useState(0.2);
  const [sarMaxInput, setSarMaxInput] = useState('0.2');
  
  // VWAP Tools
  const [showVWAPBands, setShowVWAPBands] = useState(false);
  const [vwapBandsStdDev, setVwapBandsStdDev] = useState(2);
  const [vwapBandsStdDevInput, setVwapBandsStdDevInput] = useState('2');
  const [showSessionVWAP, setShowSessionVWAP] = useState(false);
  
  // Oscillators
  const stochRSIRef = useRef<HTMLDivElement>(null);
  const williamsRRef = useRef<HTMLDivElement>(null);
  const cciRef = useRef<HTMLDivElement>(null);
  const adxRef = useRef<HTMLDivElement>(null);
  const [showStochRSI, setShowStochRSI] = useState(false);
  const [stochRSIPeriod, setStochRSIPeriod] = useState(14);
  const [stochRSIPeriodInput, setStochRSIPeriodInput] = useState('14');
  const [showWilliamsR, setShowWilliamsR] = useState(false);
  const [williamsRPeriod, setWilliamsRPeriod] = useState(14);
  const [williamsRPeriodInput, setWilliamsRPeriodInput] = useState('14');
  const [showCCI, setShowCCI] = useState(false);
  const [cciPeriod, setCciPeriod] = useState(20);
  const [cciPeriodInput, setCciPeriodInput] = useState('20');
  const [showADX, setShowADX] = useState(false);
  const [adxPeriod, setAdxPeriod] = useState(14);
  const [adxPeriodInput, setAdxPeriodInput] = useState('14');
  
  // ========== OSCILLATOR TIER ACCESS CONTROL ==========
  // Count currently active oscillators for free tier limit
  const getActiveOscillatorCount = () => {
    return [showRSI, showMACD, showStochRSI, showOBV, showMFI, showWilliamsR, showCCI, showADX].filter(Boolean).length;
  };
  
  // ========== DIVERGENCE DETECTION ==========
  // Divergence state: -3 to +3 scale (-3 = strong bearish, +3 = strong bullish)
  const [divergenceStrength, setDivergenceStrength] = useState(0);
  const [divergenceType, setDivergenceType] = useState<'bullish' | 'bearish' | 'none'>('none');
  
  // Find local peaks/troughs in data series
  const findPeaksAndTroughs = (data: number[], lookback: number = 5): { peaks: number[]; troughs: number[] } => {
    const peaks: number[] = [];
    const troughs: number[] = [];
    
    for (let i = lookback; i < data.length - lookback; i++) {
      const slice = data.slice(i - lookback, i + lookback + 1);
      const maxVal = Math.max(...slice);
      const minVal = Math.min(...slice);
      
      if (data[i] === maxVal && slice.filter(v => v === maxVal).length === 1) {
        peaks.push(i);
      }
      if (data[i] === minVal && slice.filter(v => v === minVal).length === 1) {
        troughs.push(i);
      }
    }
    
    return { peaks, troughs };
  };
  
  // Detect divergence between price and indicator
  // Returns consecutive count: positive for bullish, negative for bearish
  const detectDivergence = useCallback((
    priceData: number[],
    indicatorData: number[],
    lookback: number = 5
  ): number => {
    if (priceData.length < 30 || indicatorData.length < 30) return 0;
    
    const pricePeaksTroughs = findPeaksAndTroughs(priceData, lookback);
    const indicatorPeaksTroughs = findPeaksAndTroughs(indicatorData, lookback);
    
    let bullishCount = 0;
    let bearishCount = 0;
    
    // Check for bullish divergence: price lower lows, indicator higher lows
    const recentPriceTroughs = pricePeaksTroughs.troughs.slice(-5);
    const recentIndicatorTroughs = indicatorPeaksTroughs.troughs.slice(-5);
    
    for (let i = 1; i < Math.min(recentPriceTroughs.length, recentIndicatorTroughs.length); i++) {
      const prevPriceTrough = recentPriceTroughs[i - 1];
      const currPriceTrough = recentPriceTroughs[i];
      const prevIndTrough = recentIndicatorTroughs[i - 1];
      const currIndTrough = recentIndicatorTroughs[i];
      
      if (prevPriceTrough < priceData.length && currPriceTrough < priceData.length &&
          prevIndTrough < indicatorData.length && currIndTrough < indicatorData.length) {
        // Price making lower low, indicator making higher low = bullish divergence
        if (priceData[currPriceTrough] < priceData[prevPriceTrough] &&
            indicatorData[currIndTrough] > indicatorData[prevIndTrough]) {
          bullishCount++;
        }
      }
    }
    
    // Check for bearish divergence: price higher highs, indicator lower highs
    const recentPricePeaks = pricePeaksTroughs.peaks.slice(-5);
    const recentIndicatorPeaks = indicatorPeaksTroughs.peaks.slice(-5);
    
    for (let i = 1; i < Math.min(recentPricePeaks.length, recentIndicatorPeaks.length); i++) {
      const prevPricePeak = recentPricePeaks[i - 1];
      const currPricePeak = recentPricePeaks[i];
      const prevIndPeak = recentIndicatorPeaks[i - 1];
      const currIndPeak = recentIndicatorPeaks[i];
      
      if (prevPricePeak < priceData.length && currPricePeak < priceData.length &&
          prevIndPeak < indicatorData.length && currIndPeak < indicatorData.length) {
        // Price making higher high, indicator making lower high = bearish divergence
        if (priceData[currPricePeak] > priceData[prevPricePeak] &&
            indicatorData[currIndPeak] < indicatorData[prevIndPeak]) {
          bearishCount++;
        }
      }
    }
    
    // Return net divergence: positive for bullish, negative for bearish
    // Capped at ±3 for strength scale
    if (bullishCount > bearishCount) {
      return Math.min(bullishCount, 3);
    } else if (bearishCount > bullishCount) {
      return -Math.min(bearishCount, 3);
    }
    return 0;
  }, []);
  
  // Handler for oscillator toggles with tier restrictions
  const handleOscillatorToggle = (
    oscillatorName: string,
    currentValue: boolean,
    setter: (value: boolean) => void
  ) => {
    // If turning off, always allow
    if (currentValue) {
      setter(false);
      return;
    }
    
    // Paid tier: allow all oscillators, no limit
    if (isPaidTier) {
      setter(true);
      return;
    }
    
    // Free tier restrictions
    const isFreeAllowed = FREE_OSCILLATORS.includes(oscillatorName);
    if (!isFreeAllowed) {
      toast({
        title: 'Upgrade Required',
        description: `${oscillatorName} is available for paid subscribers only. Upgrade to access all oscillators.`,
        variant: 'destructive'
      });
      return;
    }
    
    // Check max active limit for free tier
    const activeCount = getActiveOscillatorCount();
    if (activeCount >= MAX_FREE_OSCILLATORS) {
      toast({
        title: 'Free Tier Limit',
        description: 'Free users can only have 1 oscillator active at a time. Turn off the current one first, or upgrade for unlimited access.',
        variant: 'destructive'
      });
      return;
    }
    
    setter(true);
  };
  
  // Handler for trend tool toggles with tier restrictions
  // Free tier: only EMA and SMA allowed
  const FREE_TREND_TOOLS = ['EMA', 'SMA'];
  const handleTrendToolToggle = (
    toolName: string,
    currentValue: boolean,
    setter: (value: boolean) => void
  ) => {
    // If turning off, always allow
    if (currentValue) {
      setter(false);
      return;
    }
    
    // Paid tier: allow all trend tools
    if (isPaidTier) {
      setter(true);
      return;
    }
    
    // Free tier restrictions
    const isFreeAllowed = FREE_TREND_TOOLS.includes(toolName);
    if (!isFreeAllowed) {
      toast({
        title: 'Upgrade Required',
        description: `${toolName} is available for paid subscribers only. Upgrade to access all trend tools.`,
        variant: 'destructive'
      });
      return;
    }
    
    setter(true);
  };
  
  // Handler for SMC tool toggles - all require paid tier
  const handleSMCToolToggle = (
    toolName: string,
    currentValue: boolean,
    setter: (value: boolean) => void
  ) => {
    // If turning off, always allow
    if (currentValue) {
      setter(false);
      return;
    }
    
    // Paid tier: allow all SMC tools
    if (isPaidTier) {
      setter(true);
      return;
    }
    
    // Free tier: no SMC tools allowed
    toast({
      title: 'Upgrade Required',
      description: `${toolName} is a Smart Money Concept tool available for paid subscribers only.`,
      variant: 'destructive'
    });
  };
  
  // ========== CHART DISPLAY SETTINGS (independent from strategy settings) ==========
  // BOS swing length: 5 for tighter swing detection, CHoCH swing length: 20 for broader trend changes
  const [chartBosSwingLength, setChartBosSwingLength] = useState(5);
  const [chartBosSwingLengthInput, setChartBosSwingLengthInput] = useState('5');
  const [chartChochSwingLength, setChartChochSwingLength] = useState(20);
  const [chartChochSwingLengthInput, setChartChochSwingLengthInput] = useState('20');
  const [chartLiquiditySweepSwingLength, setChartLiquiditySweepSwingLength] = useState(20);
  const [chartLiquiditySweepSwingLengthInput, setChartLiquiditySweepSwingLengthInput] = useState('20');
  
  // Legacy SMC Settings (deprecated - use chart settings or strategy settings instead)
  const [swingLength, setSwingLength] = useState(15);
  const [liqGrabCandles, setLiqGrabCandles] = useState(2);
  const [wickToBodyRatio, setWickToBodyRatio] = useState(150); // Wick must be 150% of body (1.5x)
  const [swingLengthInput, setSwingLengthInput] = useState('15');
  const [liqGrabInput, setLiqGrabInput] = useState('2');
  const [wickRatioInput, setWickRatioInput] = useState('150');
  const [fvgVolumeThreshold, setFvgVolumeThreshold] = useState(1.5); // 1.5x average volume

  // Bot state
  const [botEnabled, setBotEnabled] = useState(false);
  const [bias, setBias] = useState<'bullish' | 'bearish' | null>(null);
  const [structureTrend, setStructureTrend] = useState<'uptrend' | 'downtrend' | 'ranging' | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [tradeSignals, setTradeSignals] = useState<TradeSignal[]>([]);
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);
  const [backtesting, setBacktesting] = useState(false);
  const [currentDelta, setCurrentDelta] = useState(0);
  const [cumDelta, setCumDelta] = useState(0);
  const [deltaHistory, setDeltaHistory] = useState<Array<{ time: string; timestamp: number; delta: number; cumDelta: number; isBull: boolean; volume: number; exchanges?: number; bullishExchanges?: number; bearishExchanges?: number; confidence?: number; divergence?: boolean; highValueDivergence?: boolean; volumeMultiple?: number }>>([]);
  const [cvdSpikeEnabled, setCvdSpikeEnabled] = useState(false); // Show CVD spike triangles on chart (default OFF)
  const [cvdBullishThreshold, setCvdBullishThreshold] = useState(200); // % of average bullish delta
  const [cvdBullishThresholdInput, setCvdBullishThresholdInput] = useState('200');
  const [cvdBearishThreshold, setCvdBearishThreshold] = useState(200); // % of average bearish delta
  const [cvdBearishThresholdInput, setCvdBearishThresholdInput] = useState('200');
  // CVD Spike Level Thresholds (percentage of average delta)
  const [cvdSpikeLevel1, setCvdSpikeLevel1] = useState(175); // Level 1: ▲ (default 175%)
  const [cvdSpikeLevel1Input, setCvdSpikeLevel1Input] = useState('175');
  const [cvdSpikeLevel2, setCvdSpikeLevel2] = useState(250); // Level 2: ▲² (default 250%)
  const [cvdSpikeLevel2Input, setCvdSpikeLevel2Input] = useState('250');
  const [cvdSpikeLevel3, setCvdSpikeLevel3] = useState(400); // Level 3: ▲³ (default 400%)
  const [cvdSpikeLevel3Input, setCvdSpikeLevel3Input] = useState('400');

  // AI Market Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiAnalysisTimestamp, setAiAnalysisTimestamp] = useState<number | null>(null);
  const [aiAnalysisCost, setAiAnalysisCost] = useState<number>(0);
  const [aiAnalysisExpanded, setAiAnalysisExpanded] = useState(false);
  const [lastAnalysisCheck, setLastAnalysisCheck] = useState<number>(0);
  const [footprintData, setFootprintData] = useState<FootprintData[]>([]);
  
  // Collapsible panel states - default to minimized
  const [marketSummaryMinimized, setMarketSummaryMinimized] = useState(true);
  const [cvdTableMinimized, setCvdTableMinimized] = useState(true);
  const [marketAlertsMinimized, setMarketAlertsMinimized] = useState(true);
  const [marketAlerts, setMarketAlerts] = useState<MarketAlert[]>([]);
  const [alertFilterMode, setAlertFilterMode] = useState<'all' | 'active'>('all');
  
  // Alert type to indicator mapping - defines which alerts belong to which indicators
  // CRITICAL: These strings MUST match the MarketAlert['type'] values exactly
  const alertTypeToIndicator: Record<string, string | string[]> = {
    // SMC Alerts
    'BOS': 'smc',
    'CHoCH': 'smc',
    'FVG': 'smc',
    'FVG Entry': 'smc',
    'Liquidity Sweep': 'smc',
    // VWAP Alerts
    'VWAP Bounce': 'vwap',
    'VWAP Cross': 'vwap',
    // Trendline Alerts
    'Trendline Breakout': 'trendlines',
    'Trendline Rejection': 'trendlines',
    // Oscillator Alerts (can come from RSI, MACD, or MFI)
    'Oscillator Divergence': ['rsi', 'macd', 'mfi'],
    'Oscillator Crossover': ['rsi', 'macd', 'mfi'],
    // CVD & Volume Alerts
    'CVD Spike': 'cvd',
    'Volume Spike': 'cvd',
    'Level 2 Spike': 'cvd',
    // OBV Alerts
    'OBV Divergence': 'obv',
    'OBV Trend': 'obv',
    'OBV Spike': 'obv',
    // Bollinger Bands Alerts
    'BB Upper Touch': 'bollinger',
    'BB Lower Touch': 'bollinger',
    'BB Breakout': 'bollinger',
    'BB Middle Cross': 'bollinger',
  };
  
  // Multi-exchange orderflow state (always enabled)
  const [useMultiExchange, setUseMultiExchange] = useState(true);
  const [multiExchangeData, setMultiExchangeData] = useState<any>(null);
  const [multiExchangeLoading, setMultiExchangeLoading] = useState(false);
  
  // Refs to ensure auto-refresh always uses current values
  const symbolRef = useRef(symbol);
  const intervalRef = useRef(interval);
  
  useEffect(() => {
    symbolRef.current = symbol;
    intervalRef.current = interval;
  }, [symbol, interval]);
  
  // Detect market status changes and trigger video sequences (only after initial bear completes)
  useEffect(() => {
    const isBullish = bias === 'bullish' && structureTrend === 'uptrend';
    const newState = isBullish ? 'bullish' : 'bearish';
    
    // Update target state but don't trigger transitions during initial_bear phase
    if (newState !== targetMarketState) {
      setTargetMarketState(newState);
      
      // Only trigger transitions if we're past initial_bear phase
      if (videoPhase !== 'initial_bear' && !isInitialLoad) {
        setVideoPhase('transition');
      }
      
      // Mark that we've detected the initial state
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    }
  }, [bias, structureTrend, targetMarketState, videoPhase, isInitialLoad]);
  
  // Control video playback based on phase changes
  useEffect(() => {
    const bear = bearVideoRef.current;
    const transition = transitionVideoRef.current;
    const bull = bullVideoRef.current;
    
    if (!bear || !transition || !bull) return;
    
    // Reset all videos first
    bear.pause();
    transition.pause();
    bull.pause();
    
    // Play the appropriate video based on phase with error handling
    if (videoPhase === 'initial_bear') {
      bear.currentTime = 0;
      bear.play().catch(err => console.log('Bear video play failed:', err));
    } else if (videoPhase === 'transition') {
      if (targetMarketState === 'bearish') {
        // Skip reverse playback - not supported in all browsers
        // Just go directly to final state
        setVideoPhase('final');
      } else {
        // Play transition forward
        try {
          transition.playbackRate = 1;
        } catch (e) {
          console.log('playbackRate not supported:', e);
        }
        transition.currentTime = 0;
        transition.play().catch(err => console.log('Transition video play failed:', err));
      }
    } else if (videoPhase === 'final') {
      if (targetMarketState === 'bullish') {
        bull.currentTime = 0;
        bull.play().catch(err => console.log('Bull video play failed:', err));
      } else {
        bear.currentTime = 0;
        bear.play().catch(err => console.log('Bear video play failed:', err));
      }
    }
  }, [videoPhase, targetMarketState]);
  
  // ========== LIQUIDITY GRAB STRATEGY SETTINGS ==========
  const [stratLiquidityGrab, setStratLiquidityGrab] = useState(false);
  const [liqGrabTrendFilter, setLiqGrabTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('structure');
  const [liqGrabDirectionFilter, setLiqGrabDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [liqGrabSwingLength, setLiqGrabSwingLength] = useState(15);
  const [liqGrabSwingLengthInput, setLiqGrabSwingLengthInput] = useState('15');
  const [liqGrabTPSwingLength, setLiqGrabTPSwingLength] = useState(15);
  const [liqGrabTPSwingLengthInput, setLiqGrabTPSwingLengthInput] = useState('15');
  const [liqGrabSLSwingLength, setLiqGrabSLSwingLength] = useState(5);
  const [liqGrabSLSwingLengthInput, setLiqGrabSLSwingLengthInput] = useState('5');

  // ========== BOS STRUCTURE STRATEGY SETTINGS ==========
  const [stratBOSTrend, setStratBOSTrend] = useState(false);
  const [bosTrendFilter, setBosTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('none');
  const [bosDirectionFilter, setBosDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [bosSwingLength, setBosSwingLength] = useState(5);
  const [bosSwingLengthInput, setBosSwingLengthInput] = useState('5');
  const [bosTPSwingLength, setBosTPSwingLength] = useState(15);
  const [bosTPSwingLengthInput, setBosTPSwingLengthInput] = useState('15');
  const [bosSLSwingLength, setBosSLSwingLength] = useState(5);
  const [bosSLSwingLengthInput, setBosSLSwingLengthInput] = useState('5');
  
  // ========== CHoCH + FVG STRATEGY SETTINGS ==========
  const [stratChochFVG, setStratChochFVG] = useState(false);
  const [chochStructureType, setChochStructureType] = useState<'bos' | 'choch' | 'both'>('bos');
  const [chochTrendFilter, setChochTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('none');
  const [chochDirectionFilter, setChochDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [chochSwingLength, setChochSwingLength] = useState(10);
  const [chochSwingLengthInput, setChochSwingLengthInput] = useState('10');
  const [chochFVGVolumeThreshold, setChochFVGVolumeThreshold] = useState(1.0);
  const [chochTPSwingLength, setChochTPSwingLength] = useState(10);
  const [chochTPSwingLengthInput, setChochTPSwingLengthInput] = useState('10');
  const [chochSLSwingLength, setChochSLSwingLength] = useState(5);
  const [chochSLSwingLengthInput, setChochSLSwingLengthInput] = useState('5');
  const [chochUseFVGSizeFilter, setChochUseFVGSizeFilter] = useState(false);
  const [chochFVGMinSizeATR, setChochFVGMinSizeATR] = useState(10); // Percentage of ATR (0-50)
  
  // ========== VWAP REJECTION STRATEGY SETTINGS ==========
  const [stratVWAPRejection, setStratVWAPRejection] = useState(false);
  const [vwapTrendFilter, setVwapTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('structure');
  const [vwapDirectionFilter, setVwapDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [vwapType, setVwapType] = useState<'session' | 'daily' | 'weekly' | 'monthly' | 'rolling10' | 'rolling20' | 'rolling50'>('weekly');
  const [vwapThreshold, setVwapThreshold] = useState(0.3);
  const [vwapThresholdInput, setVwapThresholdInput] = useState('0.3');
  const [vwapEntryCandles, setVwapEntryCandles] = useState<'single' | 'double'>('single');
  const [vwapTPSwingLength, setVwapTPSwingLength] = useState(15);
  const [vwapTPSwingLengthInput, setVwapTPSwingLengthInput] = useState('15');
  const [vwapSLSwingLength, setVwapSLSwingLength] = useState(5);
  const [vwapSLSwingLengthInput, setVwapSLSwingLengthInput] = useState('5');
  
  // ========== STRUCTURE BREAK STRATEGY SETTINGS ==========
  const [stratStructureBreak, setStratStructureBreak] = useState(false);
  const [structureTrendFilter, setStructureTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('structure');
  const [structureDirectionFilter, setStructureDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  
  // ========== R/S FLIP STRATEGY SETTINGS ==========
  const [stratRSFlip, setStratRSFlip] = useState(false);
  const [rsFlipTrendFilter, setRsFlipTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('none');
  const [rsFlipDirectionFilter, setRsFlipDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [rsFlipRetestCandles, setRsFlipRetestCandles] = useState(20);
  const [rsFlipRetestCandlesInput, setRsFlipRetestCandlesInput] = useState('20');
  const [rsFlipTPSwingLength, setRsFlipTPSwingLength] = useState(15);
  const [rsFlipTPSwingLengthInput, setRsFlipTPSwingLengthInput] = useState('15');
  const [rsFlipSLSwingLength, setRsFlipSLSwingLength] = useState(5);
  const [rsFlipSLSwingLengthInput, setRsFlipSLSwingLengthInput] = useState('5');
  
  // ========== EMA TRADING STRATEGY SETTINGS ==========
  const [stratEMATrading, setStratEMATrading] = useState(false);
  const [emaEntryMode, setEmaEntryMode] = useState<'bounce' | 'cross' | 'trend_trade'>('trend_trade');
  const [emaSinglePeriod, setEmaSinglePeriod] = useState(50);
  const [emaSinglePeriodInput, setEmaSinglePeriodInput] = useState('50');
  const [emaThreshold, setEmaThreshold] = useState(0.3);
  const [emaTradingTPSwingLength, setEmaTradingTPSwingLength] = useState(15);
  const [emaTradingTPSwingLengthInput, setEmaTradingTPSwingLengthInput] = useState('15');
  const [emaTradingSLSwingLength, setEmaTradingSLSwingLength] = useState(5);
  const [emaTradingSLSwingLengthInput, setEmaTradingSLSwingLengthInput] = useState('5');
  const [emaTradingTrendFilter, setEmaTradingTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('none');
  const [emaTradingDirectionFilter, setEmaTradingDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  
  // Legacy global settings (deprecated - keeping for backward compatibility)
  const [trendFilter, setTrendFilter] = useState<'ema' | 'structure' | 'both'>('structure');
  const [trendFilterType, setTrendFilterType] = useState<'ema' | 'structure' | 'both' | 'none'>('structure');
  const [directionFilter, setDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  
  // Risk management (global settings)
  const [accountSize, setAccountSize] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);
  
  // ========== BOT-SPECIFIC TP/SL CONFIGURATIONS ==========
  // Liquidity Grab Bot Configuration
  const [liqGrabTPSL, setLiqGrabTPSL] = useState<BotTPSLConfig>({
    numTPs: 1,
    tp1: { type: 'atr', atrMultiplier: 1.5, positionPercent: 100 },
    tp2: { type: 'structure', positionPercent: 30 },
    tp3: { type: 'atr', atrMultiplier: 2.5, positionPercent: 20 },
    sl: { type: 'atr', atrMultiplier: 1.5 }
  });

  // Auto-Backtest Mode for Liquidity Grab
  const [liqGrabAutoTestMode, setLiqGrabAutoTestMode] = useState(false);
  const [liqGrabAutoTestRunning, setLiqGrabAutoTestRunning] = useState(false);
  const [liqGrabAutoTestProgress, setLiqGrabAutoTestProgress] = useState(0);
  const [liqGrabAutoTestResults, setLiqGrabAutoTestResults] = useState<AutoBacktestResult[]>([]);
  const [liqGrabAutoTestDurations, setLiqGrabAutoTestDurations] = useState<{duration: number, combos: number}[]>([]);
  const [liqGrabAutoTestSortBy, setLiqGrabAutoTestSortBy] = useState<'profit' | 'winRate' | 'trades' | 'avgRR'>('profit');
  
  // Parameter checkboxes for auto-test (Liquidity Grab: Structure, Trailing, EMA, Fixed R:R)
  const [testTP1Structure, setTestTP1Structure] = useState(true);
  const [testTP1Trailing, setTestTP1Trailing] = useState(false);
  const [testTP1EMA, setTestTP1EMA] = useState(false);
  const [testTP1FixedRR, setTestTP1FixedRR] = useState(true);
  
  const [testTP2Structure, setTestTP2Structure] = useState(true);
  const [testTP2Trailing, setTestTP2Trailing] = useState(false);
  const [testTP2EMA, setTestTP2EMA] = useState(false);
  const [testTP2FixedRR, setTestTP2FixedRR] = useState(false);
  
  const [testTP3Structure, setTestTP3Structure] = useState(true);
  const [testTP3Trailing, setTestTP3Trailing] = useState(false);
  const [testTP3EMA, setTestTP3EMA] = useState(false);
  const [testTP3FixedRR, setTestTP3FixedRR] = useState(false);
  
  const [testSLATR, setTestSLATR] = useState(true);
  const [testSLStructure, setTestSLStructure] = useState(true);
  const [testSLFixedDistance, setTestSLFixedDistance] = useState(false);
  
  // Strategy parameter test options
  const [testTrendFilters, setTestTrendFilters] = useState<('ema' | 'structure' | 'both' | 'none')[]>(['structure', 'both']);
  const [testDirections, setTestDirections] = useState<('bull' | 'bear' | 'both')[]>(['both']);
  const [testUseWickFilter, setTestUseWickFilter] = useState<boolean>(true);
  const [testUseConfirmCandles, setTestUseConfirmCandles] = useState<boolean>(true);
  
  // Range inputs for numeric parameters (min, max, step)
  const [swingLengthRange, setSwingLengthRange] = useState({ min: 10, max: 20, step: 5 });
  const [wickRatioRange, setWickRatioRange] = useState({ min: 100, max: 200, step: 50 });
  const [confirmCandlesRange, setConfirmCandlesRange] = useState({ min: 1, max: 3, step: 1 });
  
  // TP/SL parameter ranges
  const [tp1RRRange, setTp1RRRange] = useState({ min: 1.5, max: 3.0, step: 0.5 });
  const [tp1SwingLengthRange, setTp1SwingLengthRange] = useState({ min: 10, max: 20, step: 5 });
  const [tp1TrailingSwingRange, setTp1TrailingSwingRange] = useState({ min: 3, max: 10, step: 2 });
  const [tp1EMAFastRange, setTp1EMAFastRange] = useState({ min: 10, max: 30, step: 10 });
  const [tp1EMASlowRange, setTp1EMASlowRange] = useState({ min: 50, max: 200, step: 50 });
  
  const [tp2RRRange, setTp2RRRange] = useState({ min: 2.0, max: 4.0, step: 0.5 });
  const [tp2SwingLengthRange, setTp2SwingLengthRange] = useState({ min: 15, max: 25, step: 5 });
  const [tp2TrailingSwingRange, setTp2TrailingSwingRange] = useState({ min: 5, max: 15, step: 5 });
  const [tp2EMAFastRange, setTp2EMAFastRange] = useState({ min: 10, max: 30, step: 10 });
  const [tp2EMASlowRange, setTp2EMASlowRange] = useState({ min: 50, max: 200, step: 50 });
  
  const [tp3RRRange, setTp3RRRange] = useState({ min: 3.0, max: 5.0, step: 1.0 });
  const [tp3SwingLengthRange, setTp3SwingLengthRange] = useState({ min: 20, max: 30, step: 5 });
  const [tp3TrailingSwingRange, setTp3TrailingSwingRange] = useState({ min: 10, max: 20, step: 5 });
  const [tp3EMAFastRange, setTp3EMAFastRange] = useState({ min: 10, max: 30, step: 10 });
  const [tp3EMASlowRange, setTp3EMASlowRange] = useState({ min: 50, max: 200, step: 50 });
  
  const [slATRRange, setSlATRRange] = useState({ min: 1.0, max: 2.0, step: 0.5 });
  const [slSwingLengthRange, setSlSwingLengthRange] = useState({ min: 3, max: 10, step: 2 });
  const [slFixedDistanceRange, setSlFixedDistanceRange] = useState({ min: 1.0, max: 3.0, step: 0.5 });
  
  // BOS Structure Bot Configuration
  const [bosTPSL, setBosTPSL] = useState<BotTPSLConfig>({
    numTPs: 1,
    tp1: { type: 'atr', atrMultiplier: 1.5, positionPercent: 100 },
    tp2: { type: 'structure', positionPercent: 30 },
    tp3: { type: 'atr', atrMultiplier: 2.5, positionPercent: 20 },
    sl: { type: 'atr', atrMultiplier: 1.5 }
  });
  
  // CHoCH + FVG Bot Configuration
  const [chochTPSL, setChochTPSL] = useState<BotTPSLConfig>({
    numTPs: 1,
    tp1: { type: 'structure', positionPercent: 100 },
    tp2: { type: 'vwap', vwapPeriod: 'weekly', vwapOffset: 0, positionPercent: 30 },
    tp3: { type: 'structure', positionPercent: 20 },
    sl: { type: 'structure' }
  });
  
  // VWAP Trading Bot Configuration
  const [vwapTPSL, setVwapTPSL] = useState<BotTPSLConfig>({
    numTPs: 1,
    tp1: { type: 'ema', emaFast: 10, emaSlow: 40, emaExitMode: 'crossover', positionPercent: 100 },
    tp2: { type: 'structure', positionPercent: 30 },
    tp3: { type: 'atr', atrMultiplier: 2.5, positionPercent: 20 },
    sl: { type: 'fixed_distance', fixedDistance: 2.0 }
  });
  
  // R/S Flip Bot Configuration
  const [rsFlipTPSL, setRsFlipTPSL] = useState<BotTPSLConfig>({
    numTPs: 1,
    tp1: { type: 'fixed_rr', fixedRR: 2.0, positionPercent: 100 },
    tp2: { type: 'structure', positionPercent: 30 },
    sl: { type: 'structure' } // Use broken trendline as SL by default
  });
  
  // EMA Trading Bot Configuration
  const [emaTradingTPSL, setEmaTradingTPSL] = useState<BotTPSLConfig>({
    numTPs: 1,
    tp1: { type: 'fixed_rr', fixedRR: 2.0, positionPercent: 100 },
    tp2: { type: 'structure', positionPercent: 30 },
    sl: { type: 'atr', atrMultiplier: 1.5 }
  });

  // ========== REPLAY MODE SETTINGS ==========
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(100); // Start with 100 candles visible
  const [replaySpeed, setReplaySpeed] = useState(1); // 1x, 2x, 5x, 10x
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [fullCandleData, setFullCandleData] = useState<CandleData[]>([]);
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // VWAP series refs
  const vwapSeriesRefs = useRef<{
    session?: ISeriesApi<'Line'>;
    daily?: ISeriesApi<'Line'>;
    weekly?: ISeriesApi<'Line'>;
    monthly?: ISeriesApi<'Line'>;
    rolling10?: ISeriesApi<'Line'>;
    rolling20?: ISeriesApi<'Line'>;
    rolling50?: ISeriesApi<'Line'>;
  }>({});

  // Bollinger Bands series refs
  const bbSeriesRefs = useRef<{
    upper?: ISeriesApi<'Line'>;
    middle?: ISeriesApi<'Line'>;
    lower?: ISeriesApi<'Line'>;
  }>({});

  // FVG series refs
  const fvgSeriesRefs = useRef<Array<{ upper: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'>; fill: ISeriesApi<'Histogram'>; fvg: FVG }>>([]);

  // BOS and CHoCH line series refs
  const bosSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);
  const chochSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);
  const swingPivotSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);
  const liquiditySweepSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);
  const trendlineSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);
  const tradeMarkerRefs = useRef<Array<any>>([]);
  const structureLabelsRef = useRef<HTMLDivElement | null>(null);

  // Order flow series
  const orderFlowSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const cumDeltaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Store real delta data from orderflow API
  const [realDeltaData, setRealDeltaData] = useState<Map<number, number>>(new Map());

  // Sync EMA Trading input values to numeric state
  useEffect(() => {
    const val = parseInt(emaSinglePeriodInput);
    if (!isNaN(val) && val >= 5 && val <= 500) {
      setEmaSinglePeriod(val);
    }
  }, [emaSinglePeriodInput]);
  
  // Sync VWAP threshold input to numeric state
  useEffect(() => {
    const val = parseFloat(vwapThresholdInput);
    if (!isNaN(val) && val >= 0.1 && val <= 5) {
      setVwapThreshold(val);
    }
  }, [vwapThresholdInput]);

  useEffect(() => {
    const val = parseInt(emaFastInput);
    if (!isNaN(val) && val >= 5 && val <= 200) {
      setEmaFastPeriod(val);
    }
  }, [emaFastInput]);

  useEffect(() => {
    const val = parseInt(emaSlowInput);
    if (!isNaN(val) && val >= 20 && val <= 500) {
      setEmaSlowPeriod(val);
    }
  }, [emaSlowInput]);

  useEffect(() => {
    const val = parseInt(bbPeriodInput);
    if (!isNaN(val) && val >= 5 && val <= 100) {
      setBbPeriod(val);
    }
  }, [bbPeriodInput]);

  useEffect(() => {
    const val = parseFloat(bbStdDevInput);
    if (!isNaN(val) && val >= 0.5 && val <= 4) {
      setBbStdDev(val);
    }
  }, [bbStdDevInput]);

  useEffect(() => {
    const val = parseInt(emaTradingTPSwingLengthInput);
    if (!isNaN(val) && val >= 5 && val <= 50) {
      setEmaTradingTPSwingLength(val);
    }
  }, [emaTradingTPSwingLengthInput]);

  useEffect(() => {
    const val = parseInt(emaTradingSLSwingLengthInput);
    if (!isNaN(val) && val >= 3 && val <= 30) {
      setEmaTradingSLSwingLength(val);
    }
  }, [emaTradingSLSwingLengthInput]);

  // Calculate total combinations for auto-backtest
  const totalCombinations = useMemo(() => {
    if (!liqGrabAutoTestMode) return 0;

    const getRangeCount = (min: number, max: number, step: number) => {
      if (step <= 0 || min > max) return 0;
      return Math.floor((max - min) / step) + 1;
    };

    let count = 1;

    // Strategy parameters
    count *= testTrendFilters.length || 1;
    count *= testDirections.length || 1;
    count *= getRangeCount(swingLengthRange.min, swingLengthRange.max, swingLengthRange.step);
    // Only test wick ratios when wick filter is enabled
    if (testUseWickFilter) {
      count *= getRangeCount(wickRatioRange.min, wickRatioRange.max, wickRatioRange.step);
    }
    // Only test confirm candles when confirm candles is enabled
    if (testUseConfirmCandles) {
      count *= getRangeCount(confirmCandlesRange.min, confirmCandlesRange.max, confirmCandlesRange.step);
    }

    // TP1 parameters (always active if numTPs >= 1)
    if (liqGrabTPSL.numTPs >= 1) {
      let tp1Count = 0;
      if (testTP1Structure) tp1Count += getRangeCount(tp1SwingLengthRange.min, tp1SwingLengthRange.max, tp1SwingLengthRange.step);
      if (testTP1Trailing) tp1Count += getRangeCount(tp1TrailingSwingRange.min, tp1TrailingSwingRange.max, tp1TrailingSwingRange.step);
      if (testTP1EMA) tp1Count += getRangeCount(tp1EMAFastRange.min, tp1EMAFastRange.max, tp1EMAFastRange.step) * getRangeCount(tp1EMASlowRange.min, tp1EMASlowRange.max, tp1EMASlowRange.step);
      if (testTP1FixedRR) tp1Count += getRangeCount(tp1RRRange.min, tp1RRRange.max, tp1RRRange.step);
      count *= tp1Count || 1;
    }

    // TP2 parameters (only if numTPs >= 2)
    if (liqGrabTPSL.numTPs >= 2) {
      let tp2Count = 0;
      if (testTP2Structure) tp2Count += getRangeCount(tp2SwingLengthRange.min, tp2SwingLengthRange.max, tp2SwingLengthRange.step);
      if (testTP2Trailing) tp2Count += getRangeCount(tp2TrailingSwingRange.min, tp2TrailingSwingRange.max, tp2TrailingSwingRange.step);
      if (testTP2EMA) tp2Count += getRangeCount(tp2EMAFastRange.min, tp2EMAFastRange.max, tp2EMAFastRange.step) * getRangeCount(tp2EMASlowRange.min, tp2EMASlowRange.max, tp2EMASlowRange.step);
      if (testTP2FixedRR) tp2Count += getRangeCount(tp2RRRange.min, tp2RRRange.max, tp2RRRange.step);
      count *= tp2Count || 1;
    }

    // TP3 parameters (only if numTPs >= 3)
    if (liqGrabTPSL.numTPs >= 3) {
      let tp3Count = 0;
      if (testTP3Structure) tp3Count += getRangeCount(tp3SwingLengthRange.min, tp3SwingLengthRange.max, tp3SwingLengthRange.step);
      if (testTP3Trailing) tp3Count += getRangeCount(tp3TrailingSwingRange.min, tp3TrailingSwingRange.max, tp3TrailingSwingRange.step);
      if (testTP3EMA) tp3Count += getRangeCount(tp3EMAFastRange.min, tp3EMAFastRange.max, tp3EMAFastRange.step) * getRangeCount(tp3EMASlowRange.min, tp3EMASlowRange.max, tp3EMASlowRange.step);
      if (testTP3FixedRR) tp3Count += getRangeCount(tp3RRRange.min, tp3RRRange.max, tp3RRRange.step);
      count *= tp3Count || 1;
    }

    // SL parameters
    let slCount = 0;
    if (testSLATR) slCount += getRangeCount(slATRRange.min, slATRRange.max, slATRRange.step);
    if (testSLStructure) slCount += getRangeCount(slSwingLengthRange.min, slSwingLengthRange.max, slSwingLengthRange.step);
    if (testSLFixedDistance) slCount += getRangeCount(slFixedDistanceRange.min, slFixedDistanceRange.max, slFixedDistanceRange.step);
    count *= slCount || 1;

    return count;
  }, [
    liqGrabAutoTestMode,
    testTrendFilters,
    testDirections,
    swingLengthRange,
    wickRatioRange,
    confirmCandlesRange,
    testUseWickFilter,
    testUseConfirmCandles,
    liqGrabTPSL.numTPs,
    testTP1Structure, testTP1Trailing, testTP1EMA, testTP1FixedRR,
    tp1SwingLengthRange, tp1TrailingSwingRange, tp1EMAFastRange, tp1EMASlowRange, tp1RRRange,
    testTP2Structure, testTP2Trailing, testTP2EMA, testTP2FixedRR,
    tp2SwingLengthRange, tp2TrailingSwingRange, tp2EMAFastRange, tp2EMASlowRange, tp2RRRange,
    testTP3Structure, testTP3Trailing, testTP3EMA, testTP3FixedRR,
    tp3SwingLengthRange, tp3TrailingSwingRange, tp3EMAFastRange, tp3EMASlowRange, tp3RRRange,
    testSLATR, testSLStructure, testSLFixedDistance,
    slATRRange, slSwingLengthRange, slFixedDistanceRange
  ]);

  // Calculate estimated completion time using actual performance data
  const estimatedTime = useMemo(() => {
    let msPerTest = 100; // Default fallback
    
    // If we have historical data, use average ms-per-test from last 5 runs
    if (liqGrabAutoTestDurations.length > 0) {
      const recentRuns = liqGrabAutoTestDurations.slice(-5);
      // Calculate ms-per-test for each run, then average
      const msPerTestValues = recentRuns.map(run => run.duration / run.combos);
      msPerTest = msPerTestValues.reduce((sum, v) => sum + v, 0) / msPerTestValues.length;
    }
    
    const seconds = Math.ceil((totalCombinations * msPerTest) / 1000);
    if (seconds < 60) return `~${seconds}s`;
    if (seconds < 3600) return `~${Math.ceil(seconds / 60)}min`;
    return `~${Math.ceil(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}min`;
  }, [totalCombinations, liqGrabAutoTestDurations]);

  // Fetch initial candle data from Binance via backend proxy
  // Fetches up to 3000 candles by making multiple requests
  const fetchInitialData = useCallback(async () => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // Increment generation to invalidate any pending responses
    fetchGenerationRef.current += 1;
    const currentGeneration = fetchGenerationRef.current;
    
    try {
      setLoading(true);
      
      // Fetch first batch (most recent 1000 candles)
      const url1 = `/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=1000`;
      const response1 = await fetch(url1, { signal: abortController.signal });
      
      if (!response1.ok) {
        throw new Error(`Failed to fetch candles: ${response1.statusText}`);
      }
      
      const klines1 = await response1.json();
      
      // Check if this response is still relevant
      if (currentGeneration !== fetchGenerationRef.current) {
        console.log('🚫 Ignoring stale response from generation', currentGeneration);
        return;
      }
      
      // Get the earliest timestamp from first batch to fetch older data
      let allKlines = [...klines1];
      
      if (klines1.length > 0) {
        const earliestTime = klines1[0][0]; // First candle's open time
        
        // Fetch second batch with cache-busting
        const endTime2 = earliestTime - 1;
        console.log('📊 Fetching extended history - batch 2 endTime:', endTime2);
        const url2 = `/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=1000&endTime=${endTime2}&_=${Date.now()}`;
        
        try {
          const response2 = await fetch(url2, { cache: 'no-store' });
          if (response2.ok) {
            const klines2 = await response2.json();
            console.log('📊 Batch 2 received:', klines2.length, 'candles, earliest:', klines2[0]?.[0]);
            if (klines2.length > 0 && klines2[0][0] < earliestTime) {
              allKlines = [...klines2, ...allKlines];
              
              // Fetch third batch
              const endTime3 = klines2[0][0] - 1;
              console.log('📊 Fetching extended history - batch 3 endTime:', endTime3);
              const url3 = `/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=1000&endTime=${endTime3}&_=${Date.now() + 1}`;
              
              try {
                const response3 = await fetch(url3, { cache: 'no-store' });
                if (response3.ok) {
                  const klines3 = await response3.json();
                  console.log('📊 Batch 3 received:', klines3.length, 'candles, earliest:', klines3[0]?.[0]);
                  if (klines3.length > 0 && klines3[0][0] < klines2[0][0]) {
                    allKlines = [...klines3, ...allKlines];
                  }
                }
              } catch (e) {
                console.log('📊 Batch 3 failed (optional):', e);
              }
            }
          }
        } catch (e) {
          console.log('📊 Batch 2 failed:', e);
        }
      }
      
      // Check again if this response is still relevant
      if (currentGeneration !== fetchGenerationRef.current) {
        console.log('🚫 Ignoring stale response from generation', currentGeneration);
        return;
      }
      
      // Sort by time ascending (required by lightweight-charts)
      allKlines.sort((a: any[], b: any[]) => a[0] - b[0]);
      
      // Remove duplicates (in case of overlapping data)
      const uniqueKlines = allKlines.filter((kline: any[], index: number, arr: any[][]) => 
        index === 0 || kline[0] !== arr[index - 1][0]
      );
      
      const candleData: CandleData[] = uniqueKlines.map((k: any[]) => ({
        time: k[0] / 1000,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      console.log('✅ Fetched candle data:', candleData.length, 'candles (extended history)');
      setCandles(candleData);
      
      // Fetch REAL delta data from Binance aggTrades via orderflow API
      // SKIP if using multi-exchange mode (multi-exchange provides its own table data)
      if (!useMultiExchange) {
        try {
          const yahooSymbol = symbol.replace('USDT', '-USD');
          const footprintUrl = `/api/crypto/orderflow?symbol=${yahooSymbol}&period=1mo&interval=${interval}`;
          const fpResponse = await fetch(footprintUrl, { signal: abortController.signal });
          
          if (fpResponse.ok) {
            const fpData = await fpResponse.json();
            
            // Check if this response is still relevant
            if (currentGeneration !== fetchGenerationRef.current) {
              console.log('🚫 Ignoring stale orderflow response');
              return;
            }
            
            // Store footprint data for FVG analysis
            if (fpData.footprint) {
              setFootprintData(fpData.footprint);
              
              // Create a map of timestamp -> real delta
              const deltaMap = new Map<number, number>();
              fpData.footprint.forEach((fp: any) => {
                deltaMap.set(fp.time, fp.delta);
              });
              setRealDeltaData(deltaMap);
              
              // Calculate delta history using REAL delta values
              let runningCVD = 0;
              const history = candleData.slice(-20).map(candle => {
                const delta = deltaMap.get(candle.time) || 0;
                runningCVD += delta;
                return {
                  time: new Date(candle.time * 1000).toLocaleTimeString(),
                  timestamp: candle.time, // Unix timestamp for chart matching
                  delta,
                  cumDelta: runningCVD,
                  isBull: candle.close >= candle.open,
                  volume: candle.volume
                };
              });
              
              setDeltaHistory(history);
              setCumDelta(runningCVD);
              
              console.log('✅ Loaded REAL delta data from Binance aggTrades:', fpData.footprint.length, 'candles');
              console.log('📊 Delta match rate:', (fpData.footprint.filter((fp: any) => candleData.some(c => c.time === fp.time)).length / candleData.length * 100).toFixed(1) + '%');
            }
          }
        } catch (fpError) {
          // Ignore abort errors (user changed timeframe)
          if (fpError instanceof Error && fpError.name === 'AbortError') {
            console.log('🚫 Orderflow fetch aborted');
            return;
          }
          console.warn('Could not fetch footprint data:', fpError);
        }
      }
    } catch (error) {
      // Ignore abort errors (user changed timeframe)
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('🚫 Main fetch aborted');
        return;
      }
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval, useMultiExchange]);

  // Fetch multi-exchange orderflow data
  // Fetch AI Market Analysis
  const fetchAIAnalysis = useCallback(async (force = false) => {
    if (aiAnalysisLoading || candles.length < 100) return;
    
    // Check 60-minute cooldown
    const now = Date.now();
    const cooldownMs = 60 * 60 * 1000; // 1 hour
    const timeSinceLastCheck = lastAnalysisCheck ? now - lastAnalysisCheck : cooldownMs + 1;
    
    if (timeSinceLastCheck < cooldownMs) {
      // User tried to refresh within the cooldown period
      if (force) {
        const remainingMs = cooldownMs - timeSinceLastCheck;
        const remainingMins = Math.ceil(remainingMs / 60000);
        toast({
          title: "Analysis is up to date",
          description: `This analysis was refreshed recently. Next refresh available in ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}.`,
          duration: 4000,
        });
      }
      return;
    }
    
    setAiAnalysisLoading(true);
    setLastAnalysisCheck(now);
    
    try {
      const token = await getToken();
      if (!token) {
        toast({
          title: "Authentication required",
          description: "Please sign in to use AI analysis.",
          duration: 5000,
        });
        setAiAnalysisLoading(false);
        return;
      }
      
      const response = await fetch('/api/crypto/market-analysis', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          candles: candles.slice(-200),
          symbol: symbol.replace('USDT', '/USD'),
          timeframe: interval
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Analysis failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      setAiAnalysis(data.analysis);
      setAiAnalysisTimestamp(now);
      setAiAnalysisCost(data.estimatedCost || 0);
      
      console.log('🤖 AI Analysis received', {
        cached: data.cached,
        cost: data.estimatedCost,
        tokens: data.tokens
      });
    } catch (error: any) {
      console.error('❌ Error fetching AI analysis:', error);
      setAiAnalysis(`Error: ${error.message}`);
    } finally {
      setAiAnalysisLoading(false);
    }
  }, [candles, symbol, interval, aiAnalysisLoading, lastAnalysisCheck, toast]);

  // Hourly AI Market Analysis auto-refresh
  useEffect(() => {
    if (candles.length < 100) return;
    
    // Fetch on mount when chart data is available
    if (!aiAnalysis) {
      fetchAIAnalysis(false);
    }
    
    // Set up hourly refresh
    const intervalId = setInterval(() => {
      console.log('⏰ Hourly AI analysis refresh triggered');
      fetchAIAnalysis(false);
    }, 60 * 60 * 1000); // Every hour
    
    return () => clearInterval(intervalId);
  }, [candles.length, aiAnalysis, fetchAIAnalysis]);

  const fetchMultiExchangeData = useCallback(async () => {
    if (!useMultiExchange) return;
    
    // Capture current generation to check if response is still relevant
    const currentGeneration = fetchGenerationRef.current;
    
    setMultiExchangeLoading(true);
    try {
      const binanceSymbol = symbol.replace('USDT', '');
      const multiUrl = `/api/crypto/multi-exchange-orderflow?symbol=${binanceSymbol}USDT&period=1mo&interval=${interval}`;
      
      console.log('🌐 Fetching multi-exchange orderflow data...');
      const response = await fetch(multiUrl, { 
        signal: abortControllerRef.current?.signal 
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if this response is still relevant
        if (currentGeneration !== fetchGenerationRef.current) {
          console.log('🚫 Ignoring stale multi-exchange response');
          setMultiExchangeLoading(false);
          return;
        }
        
        setMultiExchangeData(data);
        
        // Use orderflowTable directly - it's separate from the chart
        if (data.orderflowTable && data.orderflowTable.length > 0) {
          console.log('📊 Raw orderflowTable data:', data.orderflowTable);
          
          let runningCVD = 0;
          const history = data.orderflowTable.map((row: any) => {
            runningCVD += row.delta;
            // API returns timestamps in milliseconds, chart uses seconds
            const timestampSeconds = row.time > 9999999999 ? Math.floor(row.time / 1000) : row.time;
            const date = new Date(timestampSeconds * 1000);
            return {
              time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              date: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
              timestamp: timestampSeconds,
              delta: row.delta,
              cumDelta: runningCVD,
              isBull: row.delta >= 0,
              volume: row.volume,
              exchanges: row.exchanges,
              bullishExchanges: row.bullishExchanges || 0,
              bearishExchanges: row.bearishExchanges || 0,
              confidence: row.confidence,
              divergence: row.divergence || false,
              highValueDivergence: row.highValueDivergence || false,
              volumeMultiple: row.volumeMultiple || 0
            };
          });
          
          setDeltaHistory(history);
          setCumDelta(runningCVD);
          
          console.log('✅ Multi-exchange table loaded:', {
            rows: history.length,
            exchanges: data.metadata?.exchanges?.filter((e: any) => e.success).length || 0,
            successRate: `${(data.metadata?.success_rate * 100 || 0).toFixed(0)}%`,
            avgConfidence: `${(history.reduce((sum: number, h: any) => sum + h.confidence, 0) / history.length * 100).toFixed(0)}%`,
            sampleRow: history[0]
          });
        }
      } else {
        console.error('Failed to fetch multi-exchange data:', response.statusText);
      }
    } catch (error) {
      // Ignore abort errors (user changed timeframe)
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('🚫 Multi-exchange fetch aborted');
        return;
      }
      console.error('Error fetching multi-exchange data:', error);
    } finally {
      setMultiExchangeLoading(false);
    }
  }, [useMultiExchange, symbol, interval]);

  // Effect to fetch multi-exchange data when toggle changes
  useEffect(() => {
    if (useMultiExchange && candles.length > 0) {
      fetchMultiExchangeData();
    }
  }, [useMultiExchange, fetchMultiExchangeData, candles.length]);

  // Auto-refresh multi-exchange data every 60 seconds (matches minimum 1m candle timeframe)
  useEffect(() => {
    if (!useMultiExchange || candles.length === 0) return;

    console.log('🔄 Auto-refresh started for multi-exchange data (every 60s)');
    
    const refreshInterval = setInterval(() => {
      console.log('⏰ Auto-refresh tick - fetching multi-exchange data...');
      fetchMultiExchangeData();
    }, 60000);

    return () => {
      console.log('🛑 Auto-refresh stopped');
      clearInterval(refreshInterval);
    };
  }, [useMultiExchange, candles.length, fetchMultiExchangeData]);

  // Calculate rolling VWAP
  const calculateRollingVWAP = useCallback((data: CandleData[], count: number): VWAPData[] => {
    const result: VWAPData[] = [];
    for (let i = count - 1; i < data.length; i++) {
      const slice = data.slice(i - count + 1, i + 1);
      let sumPV = 0, sumV = 0;
      slice.forEach(bar => {
        const typical = (bar.high + bar.low + bar.close) / 3;
        sumPV += typical * bar.volume;
        sumV += bar.volume;
      });
      result.push({ time: data[i].time, value: sumPV / sumV });
    }
    return result;
  }, []);

  // Get period key for anchored VWAP
  const getPeriodKey = useCallback((time: number, period: string): string => {
    const date = new Date(time * 1000);
    if (period === 'daily') {
      return date.toISOString().slice(0, 10);
    } else if (period === 'weekly') {
      const startOfWeek = new Date(date);
      startOfWeek.setUTCDate(date.getUTCDate() - date.getUTCDay());
      return startOfWeek.toISOString().slice(0, 10);
    } else if (period === 'monthly') {
      return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
    }
    return '';
  }, []);

  // Calculate periodic (anchored) VWAP with currentOnly option
  const calculatePeriodicVWAP = useCallback((data: CandleData[], period: string, currentOnly: boolean): VWAPData[] => {
    if (data.length === 0) return [];
    const result: VWAPData[] = [];
    let sumPV = 0, sumV = 0;
    let lastPeriodKey = getPeriodKey(data[0].time, period);
    const currentPeriodKey = getPeriodKey(data[data.length - 1].time, period);
    
    data.forEach(bar => {
      const periodKey = getPeriodKey(bar.time, period);
      if (periodKey !== lastPeriodKey) {
        sumPV = 0;
        sumV = 0;
      }
      lastPeriodKey = periodKey;
      const typical = (bar.high + bar.low + bar.close) / 3;
      sumPV += typical * bar.volume;
      sumV += bar.volume;
      if (sumV > 0 && (!currentOnly || periodKey === currentPeriodKey)) {
        result.push({ time: bar.time, value: sumPV / sumV });
      }
    });
    return result;
  }, [getPeriodKey]);

  // Calculate ATR
  const calculateATR = useCallback((data: CandleData[], period: number = 14): number[] => {
    const tr: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const highLow = data[i].high - data[i].low;
      const highClose = Math.abs(data[i].high - data[i - 1].close);
      const lowClose = Math.abs(data[i].low - data[i - 1].close);
      tr.push(Math.max(highLow, highClose, lowClose));
    }
    const atr: number[] = [];
    let sum = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    atr.push(sum);
    for (let i = period; i < tr.length; i++) {
      sum = (atr[atr.length - 1] * (period - 1) + tr[i]) / period;
      atr.push(sum);
    }
    return atr;
  }, []);

  // Analyze FVG volume/delta scores
  const analyzeFVGValue = useCallback((fvg: FVG, candles: CandleData[], footprint: FootprintData[]): { volumeScore: number; deltaScore: number; isHighValue: boolean } => {
    // Find all candles that overlap with the FVG zone
    let totalVolume = 0;
    let totalDelta = 0;
    let count = 0;

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      // Check if this candle's price range overlaps with the FVG
      if (candle.low <= fvg.upper && candle.high >= fvg.lower) {
        totalVolume += candle.volume;
        
        // Get footprint data for this candle if available
        const fp = footprint.find(f => f.time === candle.time);
        if (fp) {
          totalDelta += Math.abs(fp.delta);
        }
        count++;
      }
    }

    // Calculate average volume across all candles for comparison
    const avgCandleVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
    
    // Volume score: total volume in FVG zone relative to average
    const volumeScore = count > 0 ? totalVolume / (avgCandleVolume * count) : 0;
    
    // Delta score: average delta imbalance in the zone
    const deltaScore = count > 0 ? totalDelta / count : 0;
    
    // High value if volume score exceeds threshold
    const isHighValue = volumeScore >= fvgVolumeThreshold;

    return { volumeScore, deltaScore, isHighValue };
  }, [fvgVolumeThreshold]);

  // Calculate FVGs with volume analysis
  const calculateFVGs = useCallback((data: CandleData[], useAtrFilter: boolean = true, atrFactor: number = 1): FVG[] => {
    const atr = calculateATR(data);
    const fvgs: FVG[] = [];
    for (let i = 2; i < data.length; i++) {
      let minGap = 0;
      if (useAtrFilter) minGap = atr[i - 2] * atrFactor;
      if (data[i].low > data[i - 2].high) {
        const lower = data[i - 2].high;
        const upper = data[i].low;
        if (upper - lower >= minGap) {
          const fvg: FVG = { time: data[i].time, lower, upper, type: 'bullish' };
          const analysis = analyzeFVGValue(fvg, data, footprintData);
          fvg.volumeScore = analysis.volumeScore;
          fvg.deltaScore = analysis.deltaScore;
          fvg.isHighValue = analysis.isHighValue;
          fvgs.push(fvg);
        }
      } else if (data[i].high < data[i - 2].low) {
        const lower = data[i].high;
        const upper = data[i - 2].low;
        if (upper - lower >= minGap) {
          const fvg: FVG = { time: data[i].time, lower, upper, type: 'bearish' };
          const analysis = analyzeFVGValue(fvg, data, footprintData);
          fvg.volumeScore = analysis.volumeScore;
          fvg.deltaScore = analysis.deltaScore;
          fvg.isHighValue = analysis.isHighValue;
          fvgs.push(fvg);
        }
      }
    }
    return fvgs;
  }, [calculateATR, analyzeFVGValue, footprintData]);

  // Check if FVG is still active (not filled)
  const isActiveFVG = useCallback((fvg: FVG, data: CandleData[]): boolean => {
    const startIdx = data.findIndex(d => d.time === fvg.time);
    
    // Check if FVG has been filled (price went through it completely)
    for (let i = startIdx + 1; i < data.length; i++) {
      // For bullish FVG, it's filled if price went below the lower boundary
      if (fvg.type === 'bullish' && data[i].low <= fvg.lower) {
        return false; // FVG is filled
      }
      // For bearish FVG, it's filled if price went above the upper boundary
      if (fvg.type === 'bearish' && data[i].high >= fvg.upper) {
        return false; // FVG is filled
      }
    }
    
    return true; // FVG is still unfilled
  }, []);

  // Get the time when FVG was filled (or null if still active)
  const getFVGFillTime = useCallback((fvg: FVG, data: CandleData[]): number | null => {
    const startIdx = data.findIndex(d => d.time === fvg.time);
    
    // Find the first candle that filled the FVG
    for (let i = startIdx + 1; i < data.length; i++) {
      // For bullish FVG, it's filled if price went below the lower boundary
      if (fvg.type === 'bullish' && data[i].low <= fvg.lower) {
        return data[i].time; // Return the time it was filled
      }
      // For bearish FVG, it's filled if price went above the upper boundary
      if (fvg.type === 'bearish' && data[i].high >= fvg.upper) {
        return data[i].time; // Return the time it was filled
      }
    }
    
    return null; // FVG is still unfilled
  }, []);

  // Calculate swing points (highs and lows)
  const calculateSwings = useCallback((data: CandleData[], swingLength: number = 5) => {
    const swings: Array<{ time: number; value: number; type: 'high' | 'low'; index: number }> = [];
    
    for (let i = swingLength; i < data.length - swingLength; i++) {
      const leftHighs = data.slice(i - swingLength, i).map(b => b.high);
      const rightHighs = data.slice(i + 1, i + swingLength + 1).map(b => b.high);
      if (data[i].high >= Math.max(...leftHighs) && data[i].high >= Math.max(...rightHighs)) {
        swings.push({ time: data[i].time, value: data[i].high, type: 'high', index: i });
      }
      
      const leftLows = data.slice(i - swingLength, i).map(b => b.low);
      const rightLows = data.slice(i + 1, i + swingLength + 1).map(b => b.low);
      if (data[i].low <= Math.min(...leftLows) && data[i].low <= Math.min(...rightLows)) {
        swings.push({ time: data[i].time, value: data[i].low, type: 'low', index: i });
      }
    }
    
    return swings.sort((a, b) => a.index - b.index);
  }, []);

  // Detect auto trendlines from swing points
  const detectTrendlines = useCallback((data: CandleData[], minTouches: number = 3, tolerance: number = 0.002, pivotLength: number = 10) => {
    interface Trendline {
      points: Array<{ time: number; price: number; index: number }>;
      slope: number;
      intercept: number;
      type: 'resistance' | 'support';
      strength: number;
      span: number;
    }
    
    const swings = calculateSwings(data, pivotLength);
    const swingHighs = swings.filter(s => s.type === 'high');
    const swingLows = swings.filter(s => s.type === 'low');
    
    // EXTREMITY-FIRST APPROACH: Always anchor from the absolute extremity
    const findTrendlineFromExtremity = (pivots: typeof swings, type: 'resistance' | 'support'): Trendline | null => {
      if (pivots.length < 2) return null;
      
      // Find TOP 3 absolute extremities (highest highs or lowest lows)
      const sortedByExtremity = type === 'resistance'
        ? [...pivots].sort((a, b) => b.value - a.value) // Highest first
        : [...pivots].sort((a, b) => a.value - b.value); // Lowest first
      
      // Use only the top 3 most extreme pivots as anchor points
      const extremeAnchors = sortedByExtremity.slice(0, 3);
      
      // Try building lines between extreme anchors
      const allCandidateLines: Array<Trendline & { violationRate: number }> = [];
      
      // Try connecting each extreme anchor to other extreme anchors or nearby pivots
      for (const starter of extremeAnchors) {
        // Find pivots after this starter, prioritize other extreme anchors
        const pivotsAfterStarter = pivots.filter(p => p.index > starter.index);
        if (pivotsAfterStarter.length === 0) continue;
        
        // Sort second points: prefer extreme values first (other extremities)
        const sortedSecondPoints = type === 'resistance'
          ? [...pivotsAfterStarter].sort((a, b) => b.value - a.value) // Highest first
          : [...pivotsAfterStarter].sort((a, b) => a.value - b.value); // Lowest first
        
        // Try connecting to the top 5 most extreme second points
        for (const secondPoint of sortedSecondPoints.slice(0, 5)) {
          const slope = (secondPoint.value - starter.value) / (secondPoint.index - starter.index);
          const intercept = starter.value - slope * starter.index;
          
          // Find all pivots that align with this line
          const alignedPoints: Array<{ time: number; price: number; index: number }> = [
            { time: starter.time, price: starter.value, index: starter.index },
            { time: secondPoint.time, price: secondPoint.value, index: secondPoint.index }
          ];
          
          for (const pivot of pivots) {
            if (pivot.index === starter.index || pivot.index === secondPoint.index) continue;
            
            const expectedPrice = slope * pivot.index + intercept;
            const priceDeviation = Math.abs(pivot.value - expectedPrice) / pivot.value;
            
            if (priceDeviation <= tolerance) {
              alignedPoints.push({ time: pivot.time, price: pivot.value, index: pivot.index });
            }
          }
          
          if (alignedPoints.length >= minTouches) {
            alignedPoints.sort((a, b) => a.index - b.index);
            
            // Calculate violation rate for this line
            const firstIdx = alignedPoints[0].index;
            const lastIdx = alignedPoints[alignedPoints.length - 1].index;
            let violations = 0;
            let totalCandles = 0;
            
            for (let i = firstIdx; i <= lastIdx; i++) {
              const candle = data[i];
              const expectedPrice = slope * i + intercept;
              
              if (type === 'resistance') {
                if (candle.close > expectedPrice * 1.01) violations++;
              } else {
                if (candle.close < expectedPrice * 0.99) violations++;
              }
              totalCandles++;
            }
            
            const violationRate = totalCandles > 0 ? violations / totalCandles : 1;
            
            allCandidateLines.push({
              points: alignedPoints,
              slope,
              intercept,
              type,
              strength: alignedPoints.length,
              span: alignedPoints[alignedPoints.length - 1].index - alignedPoints[0].index,
              violationRate
            });
          }
        }
      }
      
      if (allCandidateLines.length === 0) return null;
      
      // Calculate extremity score for each line (higher = touches more extreme points)
      const getExtremityScore = (line: typeof allCandidateLines[0]) => {
        const extremeIndices = new Set(extremeAnchors.map(e => e.index));
        return line.points.filter(p => extremeIndices.has(p.index)).length;
      };
      
      // Pick the BEST line: most extremity touches, then lowest violation rate, then most touches
      return allCandidateLines.reduce((best, current) => {
        const bestExtremity = getExtremityScore(best);
        const currentExtremity = getExtremityScore(current);
        
        // Strongly prefer lines touching more extreme points
        if (currentExtremity > bestExtremity) return current;
        if (bestExtremity > currentExtremity) return best;
        
        // Then prefer cleaner lines (lower violation rate)
        if (current.violationRate < best.violationRate - 0.02) return current;
        if (best.violationRate < current.violationRate - 0.02) return best;
        
        // Then prefer more touches
        if (current.strength > best.strength) return current;
        if (best.strength > current.strength) return best;
        
        // Finally prefer more recent last pivot
        const bestLastPivot = best.points[best.points.length - 1].index;
        const currentLastPivot = current.points[current.points.length - 1].index;
        return currentLastPivot > bestLastPivot ? current : best;
      });
    };
    
    // Validate trendlines - check price respects line through the trend
    const validateTrendline = (line: Trendline): boolean => {
      const firstIdx = line.points[0].index;
      const lastPivotIdx = line.points[line.points.length - 1].index;
      
      let violations = 0;
      let totalCandles = 0;
      
      // Check candles from first pivot to last pivot (not to current price)
      // This validates the trend was respected during its formation
      for (let i = firstIdx; i <= lastPivotIdx; i++) {
        const candle = data[i];
        const expectedPrice = line.slope * i + line.intercept;
        
        // For resistance: VIOLATION = closing significantly ABOVE the line
        // For support: VIOLATION = closing significantly BELOW the line
        // Price can break THROUGH the line later (that's a breakout, not a violation)
        if (line.type === 'resistance') {
          // Only count violations when price is ABOVE resistance
          if (candle.close > expectedPrice * 1.01) { // 1% tolerance
            violations++;
          }
        } else { // support
          // Only count violations when price is BELOW support
          if (candle.close < expectedPrice * 0.99) { // 1% tolerance
            violations++;
          }
        }
        totalCandles++;
      }
      
      // Reject if more than 15% of candles violate (very relaxed)
      const violationRate = violations / totalCandles;
      return violationRate <= 0.15;
    };
    
    // Find trendlines using new extremity-based approach
    const resistanceLine = findTrendlineFromExtremity(swingHighs, 'resistance');
    const supportLine = findTrendlineFromExtremity(swingLows, 'support');
    
    const result: Trendline[] = [];
    
    // Debug logging
    if (resistanceLine) {
      const isValid = validateTrendline(resistanceLine);
      const violationRate = (resistanceLine as any).violationRate || 0;
      console.log('✅ Resistance line:', {
        startPrice: resistanceLine.points[0].price.toFixed(4),
        endPrice: resistanceLine.points[resistanceLine.points.length - 1].price.toFixed(4),
        touches: resistanceLine.points.length,
        violationRate: (violationRate * 100).toFixed(1) + '%',
        valid: isValid
      });
      if (isValid) {
        result.push(resistanceLine);
      }
    } else {
      console.log('❌ No resistance line found');
    }
    
    // Validate and add support line
    if (supportLine) {
      const isValid = validateTrendline(supportLine);
      const violationRate = (supportLine as any).violationRate || 0;
      console.log('✅ Support line:', {
        startPrice: supportLine.points[0].price.toFixed(4),
        endPrice: supportLine.points[supportLine.points.length - 1].price.toFixed(4),
        touches: supportLine.points.length,
        violationRate: (violationRate * 100).toFixed(1) + '%',
        valid: isValid
      });
      if (isValid) {
        result.push(supportLine);
      }
    } else {
      console.log('❌ No support line found');
    }
    
    return result;
  }, [calculateSwings]);

  // Oscillator calculation functions
  const calculateRSI = useCallback((bars: CandleData[], period: number = 14) => {
    let gains = 0, losses = 0;
    return bars.map((bar, i) => {
      if (i === 0) return { time: bar.time, value: 50 };
      const diff = bar.close - bars[i-1].close;
      if (diff > 0) { 
        gains = (gains * (period-1) + diff) / period; 
        losses = (losses * (period-1)) / period; 
      } else { 
        losses = (losses * (period-1) - diff) / period; 
        gains = (gains * (period-1)) / period; 
      }
      const rs = losses === 0 ? 100 : gains / losses;
      return { time: bar.time, value: 100 - 100 / (1 + rs) };
    });
  }, []);

  const calculateMACD = useCallback((bars: CandleData[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) => {
    const ema = (data: number[], p: number) => data.reduce((acc, val, i) => 
      i === 0 ? [val] : [...acc, val * (2/(p+1)) + acc[i-1] * (1 - 2/(p+1))], [] as number[]);
    const close = bars.map(b => b.close);
    const emaFast = ema(close, fastPeriod);
    const emaSlow = ema(close, slowPeriod);
    const macdLine = close.map((_, i) => emaFast[i] - emaSlow[i]);
    const signal = ema(macdLine, signalPeriod);
    const histogram = macdLine.map((v, i) => v - signal[i]);
    return { 
      macd: macdLine.map((v, i) => ({ time: bars[i].time, value: v })),
      signal: signal.map((v, i) => ({ time: bars[i].time, value: v })),
      hist: histogram.map((v, i) => ({ time: bars[i].time, value: v, color: v > 0 ? '#00ff9d' : '#ff3b69' })) 
    };
  }, []);

  const calculateOBV = useCallback((bars: CandleData[]) => {
    let obv = 0;
    return bars.map((bar, i) => {
      if (i === 0) return { time: bar.time, value: 0 };
      if (bar.close > bars[i-1].close) obv += bar.volume;
      else if (bar.close < bars[i-1].close) obv -= bar.volume;
      return { time: bar.time, value: obv };
    });
  }, []);

  const calculateMFI = useCallback((candles: CandleData[], period: number = 14) => {
    if (candles.length < period + 1) return [];
    const result: { time: number; value: number }[] = [];
    
    for (let i = period; i < candles.length; i++) {
      let posFlow = 0;
      let negFlow = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        const typicalPrice = (candles[j].high + candles[j].low + candles[j].close) / 3;
        const rawMoneyFlow = typicalPrice * candles[j].volume;
        
        if (j > 0) {
          const prevTypicalPrice = (candles[j-1].high + candles[j-1].low + candles[j-1].close) / 3;
          if (typicalPrice > prevTypicalPrice) {
            posFlow += rawMoneyFlow;
          } else if (typicalPrice < prevTypicalPrice) {
            negFlow += rawMoneyFlow;
          }
        }
      }
      
      const mfi = negFlow === 0 ? 100 : (100 - (100 / (1 + (posFlow / negFlow))));
      result.push({ time: candles[i].time as number, value: mfi });
    }
    
    return result;
  }, []);

  const calculateBollingerBands = useCallback((candles: CandleData[], period: number = 20, stdDev: number = 2) => {
    if (candles.length < period) return { upper: [], middle: [], lower: [] };
    
    const result: { 
      upper: { time: number; value: number }[];
      middle: { time: number; value: number }[];
      lower: { time: number; value: number }[];
    } = { upper: [], middle: [], lower: [] };
    
    for (let i = period - 1; i < candles.length; i++) {
      // Calculate SMA (middle band)
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += candles[j].close;
      }
      const sma = sum / period;
      
      // Calculate standard deviation
      let variance = 0;
      for (let j = i - period + 1; j <= i; j++) {
        variance += Math.pow(candles[j].close - sma, 2);
      }
      const standardDeviation = Math.sqrt(variance / period);
      
      // Calculate upper and lower bands
      const upperBand = sma + (stdDev * standardDeviation);
      const lowerBand = sma - (stdDev * standardDeviation);
      
      result.middle.push({ time: candles[i].time as number, value: sma });
      result.upper.push({ time: candles[i].time as number, value: upperBand });
      result.lower.push({ time: candles[i].time as number, value: lowerBand });
    }
    
    return result;
  }, []);

  const detectDivergences = useCallback((candles: CandleData[]) => {
    if (candles.length < 20) return [];
    
    const rsiData = calculateRSI(candles, rsiPeriod);
    const macdData = calculateMACD(candles, macdFast, macdSlow, macdSignal).macd;
    const mfiData = calculateMFI(candles, mfiPeriod);
    const obvData = calculateOBV(candles);
    
    const divergences: Array<{
      type: string;
      direction: 'bullish' | 'bearish';
      time: number;
      description: string;
      indicators: string[];
      level: number;
    }> = [];
    
    // Look for divergences in the last 20 candles
    for (let i = candles.length - 20; i < candles.length - 1; i++) {
      const indicatorsDiverging: string[] = [];
      
      // Check for bullish divergence (price making lower lows, indicator making higher lows)
      if (i >= 10 && i < candles.length - 2) {
        const priceLL = candles[i].low < candles[i-5].low && candles[i].low < candles[i+2].low;
        
        if (priceLL) {
          // RSI bullish divergence
          const rsiIdx = rsiData.findIndex(r => r.time === candles[i].time);
          if (rsiIdx > 5 && rsiIdx < rsiData.length - 2) {
            if (rsiData[rsiIdx].value > rsiData[rsiIdx-5].value) {
              indicatorsDiverging.push('RSI');
            }
          }
          
          // MACD bullish divergence
          const macdIdx = macdData.findIndex(m => m.time === candles[i].time);
          if (macdIdx > 5 && macdIdx < macdData.length - 2) {
            if (macdData[macdIdx].value > macdData[macdIdx-5].value) {
              indicatorsDiverging.push('MACD');
            }
          }
          
          // MFI bullish divergence
          const mfiIdx = mfiData.findIndex(m => m.time === candles[i].time);
          if (mfiIdx > 5 && mfiIdx < mfiData.length - 2) {
            if (mfiData[mfiIdx].value > mfiData[mfiIdx-5].value) {
              indicatorsDiverging.push('MFI');
            }
          }
          
          // OBV bullish divergence
          const obvIdx = obvData.findIndex(o => o.time === candles[i].time);
          if (obvIdx > 5 && obvIdx < obvData.length - 2) {
            if (obvData[obvIdx].value > obvData[obvIdx-5].value) {
              indicatorsDiverging.push('OBV');
            }
          }
          
          if (indicatorsDiverging.length >= 1) {
            divergences.push({
              type: 'Bullish Divergence',
              direction: 'bullish',
              time: candles[i].time as number,
              description: `Level ${indicatorsDiverging.length} bullish divergence (${indicatorsDiverging.join(', ')})`,
              indicators: indicatorsDiverging,
              level: indicatorsDiverging.length
            });
          }
        }
        
        // Check for bearish divergence (price making higher highs, indicator making lower highs)
        const priceHH = candles[i].high > candles[i-5].high && candles[i].high > candles[i+2].high;
        const bearishIndicators: string[] = [];
        
        if (priceHH) {
          // RSI bearish divergence
          const rsiIdx = rsiData.findIndex(r => r.time === candles[i].time);
          if (rsiIdx > 5 && rsiIdx < rsiData.length - 2) {
            if (rsiData[rsiIdx].value < rsiData[rsiIdx-5].value) {
              bearishIndicators.push('RSI');
            }
          }
          
          // MACD bearish divergence
          const macdIdx = macdData.findIndex(m => m.time === candles[i].time);
          if (macdIdx > 5 && macdIdx < macdData.length - 2) {
            if (macdData[macdIdx].value < macdData[macdIdx-5].value) {
              bearishIndicators.push('MACD');
            }
          }
          
          // MFI bearish divergence
          const mfiIdx = mfiData.findIndex(m => m.time === candles[i].time);
          if (mfiIdx > 5 && mfiIdx < mfiData.length - 2) {
            if (mfiData[mfiIdx].value < mfiData[mfiIdx-5].value) {
              bearishIndicators.push('MFI');
            }
          }
          
          // OBV bearish divergence
          const obvIdx = obvData.findIndex(o => o.time === candles[i].time);
          if (obvIdx > 5 && obvIdx < obvData.length - 2) {
            if (obvData[obvIdx].value < obvData[obvIdx-5].value) {
              bearishIndicators.push('OBV');
            }
          }
          
          if (bearishIndicators.length >= 1) {
            divergences.push({
              type: 'Bearish Divergence',
              direction: 'bearish',
              time: candles[i].time as number,
              description: `Level ${bearishIndicators.length} bearish divergence (${bearishIndicators.join(', ')})`,
              indicators: bearishIndicators,
              level: bearishIndicators.length
            });
          }
        }
      }
    }
    
    return divergences;
  }, [calculateRSI, calculateMACD, calculateMFI, calculateOBV, rsiPeriod, macdFast, macdSlow, macdSignal, mfiPeriod]);

  // Calculate BOS and CHoCH - simplified: just break of swing high/low
  const calculateBOSandCHoCH = useCallback((
    data: CandleData[], 
    swingLength: number = 5
  ) => {
    const swings = calculateSwings(data, swingLength);
    const bosArray: BOS[] = [];
    const chochArray: CHoCH[] = [];
    
    if (swings.length < 3) return { bos: bosArray, choch: chochArray };
    
    // Store arrays of swing highs and lows as they form chronologically
    const swingHighs: typeof swings = [];
    const swingLows: typeof swings = [];
    
    // Track current trend: 'bullish', 'bearish', or null (no trend yet)
    let currentTrend: 'bullish' | 'bearish' | null = null;
    
    // Process swings chronologically and detect breaks
    for (let i = 0; i < swings.length; i++) {
      const swing = swings[i];
      
      if (swing.type === 'high') {
        swingHighs.push(swing);
        
        // Check if this high breaks previous swing HIGH
        if (swingHighs.length >= 2) {
          const previousHigh = swingHighs[swingHighs.length - 2];
          
          if (swing.value > previousHigh.value) {
            // This is a higher high - could be BOS or CHoCH
            const breakIdx = data.findIndex((c, idx) => 
              idx > previousHigh.index && idx <= swing.index && c.high > previousHigh.value
            );
            
            if (breakIdx !== -1) {
              const breakCandle = data[breakIdx];
              
              // Check for liquidity grab: price breaks high but then closes back below it
              // Look at candles after the break to see if price reversed
              let isLiqGrab = false;
              for (let j = breakIdx + 1; j < Math.min(breakIdx + 5, data.length); j++) {
                if (data[j].close < previousHigh.value) {
                  isLiqGrab = true;
                  break;
                }
              }
              
              // If we were in a bearish trend, this is CHoCH (reversal to bullish)
              // Otherwise it's BOS (continuation)
              if (currentTrend === 'bearish') {
                chochArray.push({
                  swingTime: previousHigh.time,
                  swingPrice: previousHigh.value,
                  breakTime: breakCandle.time,
                  breakIndex: breakIdx,
                  type: 'bullish',
                  sweptLevel: 'high',
                  isLiquidityGrab: isLiqGrab
                });
                currentTrend = 'bullish'; // Trend reversed
              } else {
                bosArray.push({
                  swingTime: previousHigh.time,
                  swingPrice: previousHigh.value,
                  breakTime: breakCandle.time,
                  breakIndex: breakIdx,
                  type: 'bullish',
                  sweptLevel: 'high',
                  isLiquidityGrab: isLiqGrab
                });
                currentTrend = 'bullish'; // Trend continuing or starting
              }
            }
          }
        }
        
      } else {
        // Swing low
        swingLows.push(swing);
        
        // Check if this low breaks previous swing LOW
        if (swingLows.length >= 2) {
          const previousLow = swingLows[swingLows.length - 2];
          
          if (swing.value < previousLow.value) {
            // This is a lower low - could be BOS or CHoCH
            const breakIdx = data.findIndex((c, idx) => 
              idx > previousLow.index && idx <= swing.index && c.low < previousLow.value
            );
            
            if (breakIdx !== -1) {
              const breakCandle = data[breakIdx];
              
              // Check for liquidity grab: price breaks low but then closes back above it
              // Look at candles after the break to see if price reversed
              let isLiqGrab = false;
              for (let j = breakIdx + 1; j < Math.min(breakIdx + 5, data.length); j++) {
                if (data[j].close > previousLow.value) {
                  isLiqGrab = true;
                  break;
                }
              }
              
              // If we were in a bullish trend, this is CHoCH (reversal to bearish)
              // Otherwise it's BOS (continuation)
              if (currentTrend === 'bullish') {
                chochArray.push({
                  swingTime: previousLow.time,
                  swingPrice: previousLow.value,
                  breakTime: breakCandle.time,
                  breakIndex: breakIdx,
                  type: 'bearish',
                  sweptLevel: 'low',
                  isLiquidityGrab: isLiqGrab
                });
                currentTrend = 'bearish'; // Trend reversed
              } else {
                bosArray.push({
                  swingTime: previousLow.time,
                  swingPrice: previousLow.value,
                  breakTime: breakCandle.time,
                  breakIndex: breakIdx,
                  type: 'bearish',
                  sweptLevel: 'low',
                  isLiquidityGrab: isLiqGrab
                });
                currentTrend = 'bearish'; // Trend continuing or starting
              }
            }
          }
        }
      }
    }
    
    console.log(`📊 BOS/CHoCH Detection: ${bosArray.length} BOS, ${chochArray.length} CHoCH from ${swings.length} swings`);
    
    return { bos: bosArray, choch: chochArray };
  }, [calculateSwings]);

  // Calculate EMA
  const calculateEMA = useCallback((data: number[], period: number): number[] => {
    const ema: number[] = [];
    const k = 2 / (period + 1);
    ema[0] = data[0];
    for (let i = 1; i < data.length; i++) {
      ema[i] = data[i] * k + ema[i - 1] * (1 - k);
    }
    return ema;
  }, []);

  // Determine market bias (EMA-based) using configurable periods
  const determineBias = useCallback((data: CandleData[]) => {
    const closes = data.map(c => c.close);
    const emaFast = calculateEMA(closes, emaFastPeriod);
    const emaSlow = calculateEMA(closes, emaSlowPeriod);
    const newBias = emaFast[emaFast.length - 1] > emaSlow[emaSlow.length - 1] ? 'bullish' : 'bearish';
    setBias(newBias);
  }, [calculateEMA, emaFastPeriod, emaSlowPeriod]);

  // Determine structure-based trend (HH/HL vs LH/LL)
  const determineStructureTrend = useCallback((data: CandleData[]) => {
    const swings = calculateSwings(data, chartBosSwingLength);
    if (swings.length < 4) {
      setStructureTrend('ranging');
      return 'ranging';
    }

    const highs = swings.filter(s => s.type === 'high');
    const lows = swings.filter(s => s.type === 'low');

    if (highs.length < 2 || lows.length < 2) {
      setStructureTrend('ranging');
      return 'ranging';
    }

    // Check last 3 highs and lows for trend
    const recentHighs = highs.slice(-3);
    const recentLows = lows.slice(-3);

    const higherHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].value > recentHighs[recentHighs.length - 2].value;
    const higherLows = recentLows.length >= 2 && recentLows[recentLows.length - 1].value > recentLows[recentLows.length - 2].value;
    const lowerHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].value < recentHighs[recentHighs.length - 2].value;
    const lowerLows = recentLows.length >= 2 && recentLows[recentLows.length - 1].value < recentLows[recentLows.length - 2].value;

    if (higherHighs && higherLows) {
      setStructureTrend('uptrend');
      return 'uptrend';
    } else if (lowerHighs && lowerLows) {
      setStructureTrend('downtrend');
      return 'downtrend';
    } else {
      setStructureTrend('ranging');
      return 'ranging';
    }
  }, [calculateSwings, chartBosSwingLength]);

  // Get current ATR value for stop loss placement
  const getCurrentATR = useCallback((data: CandleData[], period: number = 14): number => {
    if (data.length < period) return 0;
    
    const trueRanges: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }
    
    const atr = trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
    return atr;
  }, []);

  // Find stop loss level based on swing structure
  const findStopLossLevel = useCallback((data: CandleData[], entry: number, direction: 'long' | 'short', customSwingLength?: number): number => {
    const swingLengthToUse = customSwingLength ?? swingLength;
    const swings = calculateSwings(data, swingLengthToUse);
    
    if (direction === 'long') {
      // For LONG: Find swing low BELOW entry (for stop loss protection)
      const lows = swings.filter(s => s.type === 'low' && s.value < entry).sort((a, b) => b.value - a.value);
      return lows.length > 0 ? lows[0].value : entry * 0.99;
    } else {
      // For SHORT: Find swing high ABOVE entry (for stop loss protection)
      const highs = swings.filter(s => s.type === 'high' && s.value > entry).sort((a, b) => a.value - b.value);
      return highs.length > 0 ? highs[0].value : entry * 1.01;
    }
  }, [calculateSwings, swingLength]);

  // Find next swing high/low for TP targets (FUTURE PIVOTS - for strategies waiting for new pivots to form)
  const findNextSwingLevels = useCallback((data: CandleData[], currentPrice: number, direction: 'long' | 'short', customSwingLength?: number) => {
    const swingLengthToUse = customSwingLength ?? swingLength;
    const swings = calculateSwings(data, swingLengthToUse);
    
    if (direction === 'long') {
      // Find next swing high above current price
      const highs = swings.filter(s => s.type === 'high' && s.value > currentPrice).sort((a, b) => a.value - b.value);
      return {
        tp2: highs.length > 0 ? highs[0].value : currentPrice * 1.02,
        tp3: highs.length > 1 ? highs[1].value : currentPrice * 1.03,
      };
    } else {
      // Find next swing low below current price
      const lows = swings.filter(s => s.type === 'low' && s.value < currentPrice).sort((a, b) => b.value - a.value);
      return {
        tp2: lows.length > 0 ? lows[0].value : currentPrice * 0.98,
        tp3: lows.length > 1 ? lows[1].value : currentPrice * 0.97,
      };
    }
  }, [calculateSwings, swingLength]);

  // Find PREVIOUS swing high/low for TP targets (PAST PIVOTS - for quick scalps back to last resistance/support)
  const findPreviousSwingLevels = useCallback((data: CandleData[], currentPrice: number, direction: 'long' | 'short', customSwingLength?: number, endIndex?: number) => {
    const swingLengthToUse = customSwingLength ?? swingLength;
    
    // DEBUG: Log exactly what swing length we're using
    console.log('🔍 findPreviousSwingLevels CALLED:', {
      receivedSwingLength: customSwingLength,
      defaultSwingLength: swingLength,
      actuallyUsing: swingLengthToUse,
      direction: direction.toUpperCase(),
      backtestMode: endIndex !== undefined ? `YES (candle ${endIndex + 1}/${data.length})` : 'NO (live)',
    });
    
    // If endIndex provided, only use data up to that point (for backtest accuracy)
    const dataToUse = endIndex !== undefined ? data.slice(0, endIndex + 1) : data;
    const swings = calculateSwings(dataToUse, swingLengthToUse);
    
    console.log('🔍 Calculated Swings:', {
      totalSwings: swings.length,
      swingLength: swingLengthToUse,
      highs: swings.filter(s => s.type === 'high').length,
      lows: swings.filter(s => s.type === 'low').length,
    });
    
    if (direction === 'long') {
      // Find previous swing highs ABOVE current price (scalp back UP to last resistance)
      const highs = swings
        .filter(s => s.type === 'high' && s.value > currentPrice)
        .sort((a, b) => a.value - b.value); // Ascending: closest above us first
      
      console.log('📊 Previous Swing Levels (LONG):', {
        entry: currentPrice.toFixed(4),
        candlesUsed: endIndex !== undefined ? `${endIndex + 1}/${data.length}` : `${data.length} (live)`,
        swingsAbove: highs.length,
        tp1: highs.length > 0 ? highs[0].value.toFixed(4) : 'NO SWING FOUND',
        tp2: highs.length > 1 ? highs[1].value.toFixed(4) : 'NO SWING FOUND',
        tp3: highs.length > 2 ? highs[2].value.toFixed(4) : 'NO SWING FOUND',
        allSwingHighs: highs.map(h => h.value.toFixed(4)).join(', '),
      });
      
      return {
        tp1: highs.length > 0 ? highs[0].value : currentPrice,
        tp2: highs.length > 1 ? highs[1].value : currentPrice,
        tp3: highs.length > 2 ? highs[2].value : currentPrice,
      };
    } else {
      // Find previous swing lows BELOW current price (scalp back DOWN to last support)
      const lows = swings
        .filter(s => s.type === 'low' && s.value < currentPrice)
        .sort((a, b) => b.value - a.value); // Descending: closest below us first
      
      console.log('📊 Previous Swing Levels (SHORT):', {
        entry: currentPrice.toFixed(4),
        candlesUsed: endIndex !== undefined ? `${endIndex + 1}/${data.length}` : `${data.length} (live)`,
        swingsBelow: lows.length,
        tp1: lows.length > 0 ? lows[0].value.toFixed(4) : 'NO SWING FOUND',
        tp2: lows.length > 1 ? lows[1].value.toFixed(4) : 'NO SWING FOUND',
        tp3: lows.length > 2 ? lows[2].value.toFixed(4) : 'NO SWING FOUND',
        allSwingLows: lows.map(l => l.value.toFixed(4)).join(', '),
      });
      
      return {
        tp1: lows.length > 0 ? lows[0].value : currentPrice,
        tp2: lows.length > 1 ? lows[1].value : currentPrice,
        tp3: lows.length > 2 ? lows[2].value : currentPrice,
      };
    }
  }, [calculateSwings, swingLength]);

  // Get closest VWAP value
  const getClosestVWAP = useCallback((currentPrice: number): number | null => {
    if (!chartRef.current) return null;
    
    // Check which VWAPs are enabled and get their current values
    const vwaps: number[] = [];
    
    if (showVWAPDaily) {
      const dailyVWAP = calculatePeriodicVWAP(candles, 'daily', true);
      if (dailyVWAP.length > 0) vwaps.push(dailyVWAP[dailyVWAP.length - 1].value);
    }
    
    if (showVWAPWeekly) {
      const weeklyVWAP = calculatePeriodicVWAP(candles, 'weekly', true);
      if (weeklyVWAP.length > 0) vwaps.push(weeklyVWAP[weeklyVWAP.length - 1].value);
    }
    
    if (showVWAPRolling) {
      const rolling = calculateRollingVWAP(candles, vwapRollingPeriod);
      if (rolling.length > 0) vwaps.push(rolling[rolling.length - 1].value);
    }
    
    if (vwaps.length === 0) return null;
    
    // Find closest VWAP to current price
    return vwaps.reduce((closest, vwap) => {
      return Math.abs(vwap - currentPrice) < Math.abs(closest - currentPrice) ? vwap : closest;
    });
  }, [candles, showVWAPDaily, showVWAPWeekly, showVWAPRolling, vwapRollingPeriod, calculatePeriodicVWAP, calculateRollingVWAP]);

  // Calculate position size based on account percentage
  // Position size = (accountSize * percent) / entry price
  // Risk is then determined by how far the SL is from entry
  const calculatePositionSize = useCallback((entry: number, stopLoss: number): number => {
    const positionValue = accountSize * (riskPercent / 100);
    if (entry === 0) return 0;
    return positionValue / entry;
  }, [accountSize, riskPercent]);

  // Check if trend filter passes
  const checkTrendFilter = useCallback((): boolean => {
    if (trendFilter === 'ema') {
      return bias !== null;
    } else if (trendFilter === 'structure') {
      return structureTrend !== null && structureTrend !== 'ranging';
    } else { // both
      const emaBullish = bias === 'bullish';
      const structureBullish = structureTrend === 'uptrend';
      const emaBearish = bias === 'bearish';
      const structureBearish = structureTrend === 'downtrend';
      return (emaBullish && structureBullish) || (emaBearish && structureBearish);
    }
  }, [bias, structureTrend, trendFilter]);

  // Check if direction filter passes
  const checkDirectionFilter = useCallback((signalType: 'LONG' | 'SHORT'): boolean => {
    if (directionFilter === 'both') return true;
    if (directionFilter === 'bull') return signalType === 'LONG';
    if (directionFilter === 'bear') return signalType === 'SHORT';
    return false;
  }, [directionFilter]);

  // Generate liquidity grab signal
  const generateLiquidityGrabSignal = useCallback((
    data: CandleData[], 
    bypassToggle = false,
    overrideSettings?: {
      swingLength?: number;
      wickRatio?: number;
      confirmCandles?: number;
      useWickFilter?: boolean;
      useConfirmCandles?: boolean;
      trendFilter?: 'none' | 'ema' | 'structure' | 'both';
      directionFilter?: 'both' | 'bull' | 'bear';
      tpslConfig?: typeof liqGrabTPSL;
    }
  ): TradeSignal | null => {
    if ((!stratLiquidityGrab && !bypassToggle) || data.length < 50) return null;
    
    // Use override settings if provided, otherwise use state
    const swingLength = overrideSettings?.swingLength ?? liqGrabSwingLength;
    const trendFilter = overrideSettings?.trendFilter ?? liqGrabTrendFilter;
    const directionFilter = overrideSettings?.directionFilter ?? liqGrabDirectionFilter;
    const tpslConfig = overrideSettings?.tpslConfig ?? liqGrabTPSL;
    
    // Use strategy-specific settings with optional filters
    const { bos, choch } = calculateBOSandCHoCH(data, swingLength);
    const allEvents = [...bos, ...choch].filter(e => e.isLiquidityGrab);
    
    if (allEvents.length === 0) return null;
    
    // Get the most recent sweep (for backtesting, we want the last one in the data)
    const lastEvent = allEvents[allEvents.length - 1];
    const currentCandle = data[data.length - 1];
    const currentPrice = currentCandle.close;
    const atr = getCurrentATR(data);
    
    // Liquidity grab REVERSAL logic (independent of BOS/CHoCH structure):
    // Sweep LOW → price reverses UP → LONG
    // Sweep HIGH → price reverses DOWN → SHORT
    const isLong = lastEvent.sweptLevel === 'low';
    
    // Check strategy-specific direction filter
    if (directionFilter !== 'both') {
      if (directionFilter === 'bull' && !isLong) return null;
      if (directionFilter === 'bear' && isLong) return null;
    }
    
    // Check strategy-specific trend filter
    if (trendFilter !== 'none') {
      if (trendFilter === 'ema' && bias === null) return null;
      if (trendFilter === 'structure' && (structureTrend === null || structureTrend === 'ranging')) return null;
      if (trendFilter === 'both') {
        const emaBullish = bias === 'bullish';
        const structureBullish = structureTrend === 'uptrend';
        const emaBearish = bias === 'bearish';
        const structureBearish = structureTrend === 'downtrend';
        if (!((emaBullish && structureBullish) || (emaBearish && structureBearish))) return null;
      }
    }
    
    // Entry at the close price of the sweep candle (reversal entry)
    // Find the candle where the sweep occurred
    const sweepCandleIdx = data.findIndex(c => c.time === lastEvent.breakTime);
    const sweepCandle = sweepCandleIdx >= 0 ? data[sweepCandleIdx] : data[data.length - 1];
    const entry = sweepCandle.close;
    
    // Use bot-specific SL configuration
    const slConfig = tpslConfig.sl;
    let stopLoss: number;
    if (slConfig.type === 'atr') {
      // Place SL at ATR distance from entry
      stopLoss = isLong ? entry - (atr * (slConfig.atrMultiplier || 1.5)) : entry + (atr * (slConfig.atrMultiplier || 1.5));
    } else if (slConfig.type === 'structure') {
      // For structure SL, if swing length is provided, calculate proper swing level
      // Otherwise fall back to swept swing level (legacy behavior)
      if (slConfig.swingLength) {
        stopLoss = findStopLossLevel(data, entry, isLong ? 'long' : 'short', slConfig.swingLength);
      } else {
        // Place SL at the swept swing level (small buffer for slippage)
        const slBuffer = 0.0005; // 0.05% buffer
        stopLoss = isLong 
          ? lastEvent.swingPrice * (1 - slBuffer)  // SL below swept low
          : lastEvent.swingPrice * (1 + slBuffer); // SL above swept high
      }
    } else {
      // Fixed distance in percentage
      const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
      stopLoss = isLong ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
    }
    
    const riskAmount = Math.abs(entry - stopLoss);
    
    // Calculate TPs based on bot-specific configuration
    const { tp1: tp1Config, tp2: tp2Config, tp3: tp3Config } = tpslConfig;
    
    // For structure-based calculations, use TP1 swing length if configured, otherwise use default
    const structureSwingLength = tp1Config.type === 'structure' && tp1Config.swingLength 
      ? tp1Config.swingLength 
      : liqGrabTPSwingLength;
    
    const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, isLong ? 'long' : 'short', structureSwingLength);
    
    let tp1: number, tp2: number, tp3: number;
    let tp1Type: TPType;
    let tp2Type: TPType;
    let tp3Type: TPType;
    
    // TP1 calculation
    tp1Type = tp1Config.type;
    if (tp1Config.type === 'ema') {
      // EMA exits have no price target - only exit on signal
      tp1 = isLong ? Infinity : -Infinity;
    } else if (tp1Config.type === 'atr') {
      tp1 = isLong ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
    } else if (tp1Config.type === 'structure') {
      tp1 = structureTP2;
    } else if (tp1Config.type === 'fixed_rr') {
      tp1 = isLong ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
    } else if (tp1Config.type === 'vwap') {
      tp1 = getClosestVWAP(entry) || structureTP2;
    } else if (tp1Config.type === 'trailing') {
      // Trailing TP: Set far away initially, will activate once profitable + swing forms
      tp1 = isLong ? entry * 100 : entry * 0.01;
    } else {
      tp1 = isLong ? entry + (structureTP2 - entry) * (tp1Config.projectionMultiplier || 2.0) : entry - (entry - structureTP2) * (tp1Config.projectionMultiplier || 2.0);
    }
    
    // TP2 calculation
    tp2Type = tp2Config?.type || 'structure';
    if (tp2Config?.type === 'atr') {
      tp2 = isLong ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
    } else if (tp2Config?.type === 'fixed_rr') {
      tp2 = isLong ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
    } else if (tp2Config?.type === 'trailing') {
      // Trailing TP: Set far away initially, will activate once profitable + swing forms
      tp2 = isLong ? entry * 100 : entry * 0.01;
    } else {
      tp2 = structureTP3;
    }
    
    // TP3 calculation
    tp3Type = tp3Config?.type || 'projection';
    if (tp3Config?.type === 'projection') {
      tp3 = isLong ? entry + (structureTP2 - entry) * (tp3Config.projectionMultiplier || 3.0) : entry - (entry - structureTP2) * (tp3Config.projectionMultiplier || 3.0);
    } else if (tp3Config?.type === 'trailing') {
      // Trailing TP: Set far away initially, will activate once profitable + swing forms
      tp3 = isLong ? entry * 100 : entry * 0.01;
    } else {
      tp3 = isLong ? entry + (riskAmount * 5.0) : entry - (riskAmount * 5.0);
    }
    
    console.log(`🎯 Liquidity Grab TP calculation:`, {
      type: isLong ? 'LONG' : 'SHORT',
      entry: entry?.toFixed(4) || 'N/A',
      stopLoss: stopLoss?.toFixed(4) || 'N/A',
      tp1: tp1?.toFixed(4) || 'N/A',
      tp1Type,
      rr1: (entry && tp1 && riskAmount) ? (Math.abs(tp1 - entry) / riskAmount).toFixed(2) : 'N/A',
      numTPs: tpslConfig.numTPs
    });
    
    // Use stable ID based on the actual market event time, not current time
    // Set signal time to the sweep candle time for proper alignment on chart
    return {
      id: `liq_grab_${lastEvent.breakTime}`,
      time: lastEvent.breakTime, // Use sweep candle time, not current time
      type: isLong ? 'LONG' : 'SHORT',
      strategy: 'liquidity_grab',
      entry,
      stopLoss,
      tp1,
      tp2,
      tp3,
      tp1Type,
      tp2Type,
      tp3Type,
      riskReward1: Math.abs(tp1 - entry) / riskAmount,
      riskReward2: Math.abs(tp2 - entry) / riskAmount,
      riskReward3: Math.abs(tp3 - entry) / riskAmount,
      quantity: calculatePositionSize(entry, stopLoss),
      reason: `Liquidity sweep at ${lastEvent.swingPrice?.toFixed(4) || 'unknown'}`,
      active: true,
      trailingActive: tp1Config.type === 'trailing' ? false : undefined, // Start inactive for trailing TP
    };
  }, [stratLiquidityGrab, calculateBOSandCHoCH, liqGrabSwingLength, liqGrabDirectionFilter, liqGrabTrendFilter, bias, structureTrend, findStopLossLevel, findNextSwingLevels, calculatePositionSize, liqGrabTPSL, getCurrentATR, getClosestVWAP, liqGrabTPSwingLength]);

  // Generate BOS Trend Follow signal
  const generateBOSTrendSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    if (!stratBOSTrend || data.length < 50) return null;
    
    const { bos } = calculateBOSandCHoCH(data, bosSwingLength);
    
    // Filter out liquidity grabs (same as chart display)
    const trendBOS = bos.filter(b => !b.isLiquidityGrab);
    if (trendBOS.length === 0) return null;
    
    // Get the most recent BOS event and enter the trade
    const lastBOS = trendBOS[trendBOS.length - 1];
    const currentCandle = data[data.length - 1];
    const isLong = lastBOS.type === 'bullish';
    
    // Check direction filter
    if (bosDirectionFilter !== 'both') {
      if (bosDirectionFilter === 'bull' && !isLong) return null;
      if (bosDirectionFilter === 'bear' && isLong) return null;
    }
    
    // Check trend filter
    if (bosTrendFilter !== 'none') {
      if (bosTrendFilter === 'ema' && bias === null) return null;
      if (bosTrendFilter === 'structure' && (structureTrend === null || structureTrend === 'ranging')) return null;
      if (bosTrendFilter === 'both') {
        const emaBullish = bias === 'bullish';
        const structureBullish = structureTrend === 'uptrend';
        const emaBearish = bias === 'bearish';
        const structureBearish = structureTrend === 'downtrend';
        if (!((emaBullish && structureBullish) || (emaBearish && structureBearish))) return null;
      }
    }
    
    const entry = currentCandle.close;
    const atr = getCurrentATR(data);
    
    // Use bot-specific SL configuration
    const slConfig = bosTPSL.sl;
    let stopLoss: number;
    if (slConfig.type === 'atr') {
      stopLoss = isLong ? entry - (atr * (slConfig.atrMultiplier || 1.5)) : entry + (atr * (slConfig.atrMultiplier || 1.5));
    } else if (slConfig.type === 'structure') {
      const swings = calculateSwings(data, bosSLSwingLength);
      if (isLong) {
        const lows = swings.filter(s => s.type === 'low' && s.value < entry).sort((a, b) => b.value - a.value);
        stopLoss = lows.length > 0 ? lows[0].value : entry * 0.99;
      } else {
        const highs = swings.filter(s => s.type === 'high' && s.value > entry).sort((a, b) => a.value - b.value);
        stopLoss = highs.length > 0 ? highs[0].value : entry * 1.01;
      }
    } else {
      // Fixed distance in percentage
      const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
      stopLoss = isLong ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
    }
    
    const riskAmount = Math.abs(entry - stopLoss);
    
    // Calculate TPs based on bot-specific configuration
    const { tp1: tp1Config, tp2: tp2Config, tp3: tp3Config } = bosTPSL;
    const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, isLong ? 'long' : 'short', bosTPSwingLength);
    
    let tp1: number, tp2: number, tp3: number;
    let tp1Type: TPType;
    let tp2Type: TPType;
    let tp3Type: TPType;
    
    // TP1 calculation
    tp1Type = tp1Config.type;
    if (tp1Config.type === 'atr') {
      tp1 = isLong ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
    } else if (tp1Config.type === 'structure') {
      tp1 = structureTP2;
    } else if (tp1Config.type === 'fixed_rr') {
      tp1 = isLong ? entry + (riskAmount * (tp1Config.fixedRR || 1.5)) : entry - (riskAmount * (tp1Config.fixedRR || 1.5));
    } else if (tp1Config.type === 'vwap') {
      tp1 = getClosestVWAP(entry) || structureTP2;
    } else {
      tp1 = isLong ? entry + (structureTP2 - entry) * (tp1Config.projectionMultiplier || 2.0) : entry - (entry - structureTP2) * (tp1Config.projectionMultiplier || 2.0);
    }
    
    // TP2 calculation
    tp2Type = tp2Config?.type || 'structure';
    if (tp2Config?.type === 'atr') {
      tp2 = isLong ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
    } else if (tp2Config?.type === 'fixed_rr') {
      tp2 = isLong ? entry + (riskAmount * (tp2Config.fixedRR || 2.5)) : entry - (riskAmount * (tp2Config.fixedRR || 2.5));
    } else {
      tp2 = structureTP3;
    }
    
    // TP3 calculation
    tp3Type = tp3Config?.type || 'projection';
    if (tp3Config?.type === 'projection') {
      tp3 = isLong ? entry + (structureTP2 - entry) * (tp3Config.projectionMultiplier || 3.0) : entry - (entry - structureTP2) * (tp3Config.projectionMultiplier || 3.0);
    } else {
      tp3 = isLong ? entry + (riskAmount * 4.0) : entry - (riskAmount * 4.0);
    }
    
    console.log(`🎯 BOS Trend TP calculation:`, {
      type: isLong ? 'LONG' : 'SHORT',
      entry: entry.toFixed(4),
      stopLoss: stopLoss.toFixed(4),
      tp1: tp1.toFixed(4),
      tp1Type,
      rr1: (Math.abs(tp1 - entry) / riskAmount).toFixed(2),
      numTPs: bosTPSL.numTPs,
      swingLength: bosSwingLength
    });
    
    return {
      id: `bos_trend_${lastBOS.breakTime}`,
      time: lastBOS.breakTime,
      type: isLong ? 'LONG' : 'SHORT',
      strategy: 'bos_trend',
      entry,
      stopLoss,
      tp1,
      tp2,
      tp3,
      tp1Type,
      tp2Type,
      tp3Type,
      riskReward1: Math.abs(tp1 - entry) / riskAmount,
      riskReward2: Math.abs(tp2 - entry) / riskAmount,
      riskReward3: Math.abs(tp3 - entry) / riskAmount,
      quantity: calculatePositionSize(entry, stopLoss),
      reason: `BOS ${isLong ? 'Bullish' : 'Bearish'} at ${lastBOS.swingPrice.toFixed(4)}`,
      active: true,
    };
  }, [stratBOSTrend, calculateBOSandCHoCH, bosSwingLength, bosDirectionFilter, bosTrendFilter, bias, structureTrend, calculatePositionSize, bosTPSL, getCurrentATR, getClosestVWAP, findNextSwingLevels, calculateSwings, bosTPSwingLength, bosSLSwingLength]);

  // Generate SIMPLIFIED FVG retest signal (NO CHoCH requirements)
  const generateChochFVGSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    if (!stratChochFVG || data.length < 50) return null;
    
    // Calculate FVGs
    const fvgs = calculateFVGs(data, true);
    const currentCandle = data[data.length - 1];
    const currentPrice = currentCandle.close;
    
    // Simple FVG retest detection:
    // LONG: Price enters bullish FVG from above (retracement down into support)
    // SHORT: Price enters bearish FVG from below (retracement up into resistance)
    const relevantFVGs = fvgs.filter(fvg => {
      const inZone = currentPrice >= fvg.lower && currentPrice <= fvg.upper;
      const validVolume = (fvg.volumeScore || 0) >= chochFVGVolumeThreshold;
      
      // OPTIONAL: Ensure FVG has minimum height (filter out tiny gaps)
      let significantSize = true;
      if (chochUseFVGSizeFilter) {
        const fvgHeight = fvg.upper - fvg.lower;
        const minHeight = getCurrentATR(data) * (chochFVGMinSizeATR / 100);
        significantSize = fvgHeight >= minHeight;
      }
      
      // Entry direction check - price must enter from correct side
      const fvgIndex = data.findIndex(c => c.time === fvg.time);
      if (fvgIndex < 0 || fvgIndex >= data.length - 1) return false;
      
      // Check if current candle is entering FVG from the right direction
      const prevCandle = data[data.length - 2];
      const enteringFromAbove = prevCandle.close > fvg.upper && currentPrice >= fvg.lower && currentPrice <= fvg.upper;
      const enteringFromBelow = prevCandle.close < fvg.lower && currentPrice >= fvg.lower && currentPrice <= fvg.upper;
      
      const correctEntry = (fvg.type === 'bullish' && enteringFromAbove) || (fvg.type === 'bearish' && enteringFromBelow);
      
      return inZone && validVolume && significantSize && correctEntry;
    });
    
    if (relevantFVGs.length === 0) return null;
    
    const fvg = relevantFVGs[0];
    const isLong = fvg.type === 'bullish';
    const entry = isLong ? fvg.upper : fvg.lower;
    const atr = getCurrentATR(data);
    
    console.log('✅ FVG Retest Entry:', {
      type: fvg.type.toUpperCase(),
      direction: isLong ? 'LONG' : 'SHORT',
      fvgZone: `${fvg.lower.toFixed(4)} - ${fvg.upper.toFixed(4)}`,
      entry: entry.toFixed(4),
      currentPrice: currentPrice.toFixed(4),
    });
    
    // Stop Loss: Fixed % from FVG boundary OR nearest pivot beyond FVG
    const slConfig = chochTPSL.sl;
    let stopLoss: number;
    
    if (slConfig.type === 'structure') {
      // Find nearest pivot BEYOND the FVG (opposite side from entry)
      const swings = calculateSwings(data, chochSLSwingLength);
      const fvgBoundary = isLong ? fvg.lower : fvg.upper;
      
      let nearestPivot: number | null = null;
      for (let i = swings.length - 1; i >= 0; i--) {
        const swing = swings[i];
        if (isLong && swing.type === 'low' && swing.value < fvgBoundary) {
          nearestPivot = swing.value;
          break;
        } else if (!isLong && swing.type === 'high' && swing.value > fvgBoundary) {
          nearestPivot = swing.value;
          break;
        }
      }
      
      // If no pivot found, use fixed % from FVG
      stopLoss = nearestPivot !== null ? nearestPivot : (isLong ? fvg.lower * 0.99 : fvg.upper * 1.01);
    } else {
      // Fixed % from FVG boundary
      const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
      const fvgBoundary = isLong ? fvg.lower : fvg.upper;
      stopLoss = isLong ? fvgBoundary * (1 - distancePercent) : fvgBoundary * (1 + distancePercent);
    }
    
    const riskAmount = Math.abs(entry - stopLoss);
    
    // TP Mode: Structure (last swing high/low) OR Trailing (starts at SL, moves to new pivots)
    const { tp1: tp1Config } = chochTPSL;
    let tp1: number;
    let tp1Type: TPType = 'structure';
    
    if (tp1Config.type === 'structure') {
      // Target last swing high (longs) or low (shorts)
      const swings = calculateSwings(data, chochTPSwingLength);
      const targetPivots = isLong 
        ? swings.filter(s => s.type === 'high' && s.value > entry).sort((a, b) => a.value - b.value)
        : swings.filter(s => s.type === 'low' && s.value < entry).sort((a, b) => b.value - a.value);
      
      tp1 = targetPivots.length > 0 ? targetPivots[0].value : stopLoss;
      
      console.log('📊 Structure TP:', {
        direction: isLong ? 'LONG' : 'SHORT',
        entry: entry.toFixed(4),
        targetPivot: tp1.toFixed(4),
        pivotsFound: targetPivots.length,
      });
    } else {
      // Trailing TP: Set far away initially, will activate once profitable + swing forms
      tp1 = isLong ? entry * 100 : entry * 0.01; // Far away price to prevent premature exit
      tp1Type = 'trailing';
      
      console.log('📊 Trailing TP Initialized:', {
        direction: isLong ? 'LONG' : 'SHORT',
        entry: entry.toFixed(4),
        sl: stopLoss.toFixed(4),
        initialTP: 'Disabled (far away)',
        note: 'Will activate when profitable + swing forms',
      });
    }
    
    const signal: TradeSignal = {
      id: `fvg_${fvg.time}_${entry.toFixed(4)}`,
      time: data[data.length - 1].time,
      type: isLong ? 'LONG' : 'SHORT',
      strategy: 'choch_fvg',
      entry,
      stopLoss,
      tp1,
      tp2: tp1, // Single TP approach
      tp3: tp1,
      tp1Type,
      tp2Type: tp1Type,
      tp3Type: tp1Type,
      riskReward1: Math.abs(tp1 - entry) / riskAmount,
      riskReward2: Math.abs(tp1 - entry) / riskAmount,
      riskReward3: Math.abs(tp1 - entry) / riskAmount,
      quantity: calculatePositionSize(entry, stopLoss),
      reason: `FVG Retest (${fvg.type})`,
      active: true,
      trailingActive: tp1Config.type === 'trailing' ? false : undefined, // Start inactive for trailing
    };
    
    return signal;
  }, [stratChochFVG, calculateFVGs, getCurrentATR, chochFVGVolumeThreshold, chochUseFVGSizeFilter, chochFVGMinSizeATR, chochTPSL, chochSLSwingLength, calculateSwings, chochTPSwingLength, calculatePositionSize]);

  // Generate VWAP Trading signal (Bounce and Cross patterns)
  const generateVWAPTradingSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    if (!stratVWAPRejection || data.length < 50) return null;
    
    // Calculate VWAP independently based on vwapType setting
    let vwapData: VWAPData[];
    if (vwapType === 'daily') {
      vwapData = calculatePeriodicVWAP(data, 'daily', true);
    } else if (vwapType === 'weekly') {
      vwapData = calculatePeriodicVWAP(data, 'weekly', true);
    } else if (vwapType === 'monthly') {
      vwapData = calculatePeriodicVWAP(data, 'monthly', true);
    } else if (vwapType === 'rolling10') {
      vwapData = calculateRollingVWAP(data, 10);
    } else if (vwapType === 'rolling20') {
      vwapData = calculateRollingVWAP(data, 20);
    } else if (vwapType === 'rolling50') {
      vwapData = calculateRollingVWAP(data, 50);
    } else {
      vwapData = calculatePeriodicVWAP(data, 'weekly', true); // default
    }
    
    if (vwapData.length < 2) return null;
    const vwapLevel = vwapData[vwapData.length - 1].value;
    
    // Get last 2 candles - simple approach
    if (data.length < 2) return null;
    const prevCandle = data[data.length - 2];
    const currentCandle = data[data.length - 1];
    
    const tolerance = vwapLevel * (vwapThreshold / 100);
    const upperZone = vwapLevel + tolerance;
    const lowerZone = vwapLevel - tolerance;
    
    // Helper: Check if candle touches threshold zone (wick or body)
    const touchesZone = (c: CandleData) => c.high >= lowerZone && c.low <= upperZone;
    
    let signal: { type: 'LONG' | 'SHORT', pattern: 'Bounce' | 'Cross' } | null = null;
    
    if (vwapEntryCandles === 'single') {
      // SINGLE CANDLE MODE: Current candle does everything (instant entry)
      if (touchesZone(currentCandle)) {
        // BULLISH BOUNCE: touches zone + closes above VWAP line
        if (currentCandle.close > vwapLevel) {
          signal = { type: 'LONG', pattern: 'Bounce' };
        }
        // BEARISH BOUNCE: touches zone + closes below VWAP line
        else if (currentCandle.close < vwapLevel) {
          signal = { type: 'SHORT', pattern: 'Bounce' };
        }
      }
      
      // CROSS PATTERN: touches zone + closes OUTSIDE threshold opposite side
      if (!signal && touchesZone(currentCandle)) {
        // BULLISH CROSS: closes above upper zone
        if (currentCandle.close > upperZone) {
          signal = { type: 'LONG', pattern: 'Cross' };
        }
        // BEARISH CROSS: closes below lower zone
        else if (currentCandle.close < lowerZone) {
          signal = { type: 'SHORT', pattern: 'Cross' };
        }
      }
    } else {
      // DOUBLE CANDLE MODE: Previous candle touches, current candle confirms
      if (touchesZone(prevCandle)) {
        // BULLISH BOUNCE: prev touched zone, current confirms by closing above VWAP
        if (currentCandle.close > vwapLevel) {
          signal = { type: 'LONG', pattern: 'Bounce' };
        }
        // BEARISH BOUNCE: prev touched zone, current confirms by closing below VWAP
        else if (currentCandle.close < vwapLevel) {
          signal = { type: 'SHORT', pattern: 'Bounce' };
        }
      }
      
      // CROSS PATTERN: prev touched zone, current confirms by closing OUTSIDE zone
      if (!signal && touchesZone(prevCandle)) {
        // BULLISH CROSS: confirms by closing above upper zone
        if (currentCandle.close > upperZone) {
          signal = { type: 'LONG', pattern: 'Cross' };
        }
        // BEARISH CROSS: confirms by closing below lower zone
        else if (currentCandle.close < lowerZone) {
          signal = { type: 'SHORT', pattern: 'Cross' };
        }
      }
    }
    
    if (!signal) return null;
    
    const isLong = signal.type === 'LONG';
    if (!checkDirectionFilter(signal.type)) return null;
    
    const entry = currentCandle.close;
    const atr = getCurrentATR(data);
    
    // Calculate stop loss
    const slConfig = vwapTPSL.sl;
    let stopLoss: number;
    if (slConfig.type === 'atr') {
      stopLoss = isLong ? vwapLevel - (atr * (slConfig.atrMultiplier || 1.5)) : vwapLevel + (atr * (slConfig.atrMultiplier || 1.5));
    } else if (slConfig.type === 'structure') {
      stopLoss = isLong ? vwapLevel - atr : vwapLevel + atr;
    } else {
      const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
      stopLoss = isLong ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
    }
    
    const riskAmount = Math.abs(entry - stopLoss);
    const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, isLong ? 'long' : 'short', vwapTPSwingLength);
    
    // Calculate TPs
    const { tp1: tp1Config, tp2: tp2Config } = vwapTPSL;
    
    let tp1: number, tp2: number, tp3: number;
    let tp1Type: TPType = tp1Config.type;
    let tp2Type: TPType = tp2Config?.type || 'structure';
    let tp3Type: TPType = 'projection';
    
    // TP1
    if (tp1Config.type === 'ema' || tp1Config.type === 'vwap') {
      // EMA/VWAP exits have no price target - only exit on signal
      tp1 = isLong ? Infinity : -Infinity;
    } else if (tp1Config.type === 'atr') {
      tp1 = isLong ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
    } else if (tp1Config.type === 'structure') {
      tp1 = structureTP2;
    } else if (tp1Config.type === 'fixed_rr') {
      tp1 = isLong ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
    } else {
      tp1 = structureTP2;
    }
    
    // TP2
    if (tp2Config?.type === 'ema' || tp2Config?.type === 'vwap') {
      // EMA/VWAP exits have no price target - only exit on signal
      tp2 = isLong ? Infinity : -Infinity;
    } else if (tp2Config?.type === 'atr') {
      tp2 = isLong ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
    } else if (tp2Config?.type === 'fixed_rr') {
      tp2 = isLong ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
    } else {
      tp2 = structureTP3;
    }
    
    // TP3
    if (vwapTPSL.tp3?.type === 'ema' || vwapTPSL.tp3?.type === 'vwap') {
      tp3 = isLong ? Infinity : -Infinity;
    } else {
      tp3 = isLong ? entry + (structureTP2 - entry) * 1.5 : entry - (entry - structureTP2) * 1.5;
    }
    
    // Capture EMA state at entry for crossover exit detection
    let entryEMAState: 'fast_above_slow' | 'fast_below_slow' | undefined;
    const hasEMAExit = vwapTPSL.tp1.type === 'ema' || vwapTPSL.tp2?.type === 'ema' || vwapTPSL.tp3?.type === 'ema';
    if (hasEMAExit) {
      const tp1EMA = vwapTPSL.tp1.type === 'ema' ? vwapTPSL.tp1 : (vwapTPSL.tp2?.type === 'ema' ? vwapTPSL.tp2 : vwapTPSL.tp3);
      // Use configured EMA periods or defaults (match backtest defaults)
      const fastPeriod = (tp1EMA as any)?.fastEMA || 10;
      const slowPeriod = (tp1EMA as any)?.slowEMA || 40;
      
      const closes = data.map(c => c.close);
      const fastEMAValues = calculateEMA(closes, fastPeriod);
      const slowEMAValues = calculateEMA(closes, slowPeriod);
      if (fastEMAValues.length > 0 && slowEMAValues.length > 0) {
        const currentFast = fastEMAValues[fastEMAValues.length - 1];
        const currentSlow = slowEMAValues[slowEMAValues.length - 1];
        entryEMAState = currentFast >= currentSlow ? 'fast_above_slow' : 'fast_below_slow';
      }
    }
    
    return {
      id: `vwap_${signal.pattern.toLowerCase()}_${currentCandle.time}_${isLong ? 'long' : 'short'}`,
      time: currentCandle.time,
      type: signal.type,
      strategy: 'vwap_rejection',
      entry,
      stopLoss,
      tp1,
      tp2,
      tp3,
      tp1Type,
      tp2Type,
      tp3Type,
      tp1Config: vwapTPSL.tp1,
      tp2Config: vwapTPSL.tp2,
      tp3Config: vwapTPSL.tp3,
      riskReward1: Math.abs(tp1 - entry) / riskAmount,
      riskReward2: Math.abs(tp2 - entry) / riskAmount,
      riskReward3: Math.abs(tp3 - entry) / riskAmount,
      quantity: calculatePositionSize(entry, stopLoss),
      reason: `VWAP ${signal.pattern} at ${vwapLevel.toFixed(4)}`,
      active: true,
      entryEMAState,
    };
  }, [stratVWAPRejection, vwapType, calculatePeriodicVWAP, calculateRollingVWAP, getCurrentATR, vwapTPSL, findNextSwingLevels, calculatePositionSize, checkDirectionFilter, vwapThreshold, vwapTPSwingLength, calculateEMA, vwapEntryCandles]);

  // Generate EMA Trading signal (Bounce, Cross, and Trend Trade patterns)
  const generateEMATradingSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    if (!stratEMATrading || data.length < 50) return null;
    
    // Calculate EMA based on entry mode
    let emaLevel: number | null = null;
    let fastEMA: number | null = null;
    let slowEMA: number | null = null;
    
    if (emaEntryMode === 'bounce' || emaEntryMode === 'cross') {
      const emaValues = calculateEMA(data.map(c => c.close), emaSinglePeriod);
      if (emaValues.length < 3) return null;
      emaLevel = emaValues[emaValues.length - 1];
    } else {
      const fastEMAValues = calculateEMA(data.map(c => c.close), emaFastPeriod);
      const slowEMAValues = calculateEMA(data.map(c => c.close), emaSlowPeriod);
      if (fastEMAValues.length < 3 || slowEMAValues.length < 3) return null;
      fastEMA = fastEMAValues[fastEMAValues.length - 1];
      slowEMA = slowEMAValues[slowEMAValues.length - 1];
      const prevFastEMA = fastEMAValues[fastEMAValues.length - 2];
      const prevSlowEMA = slowEMAValues[slowEMAValues.length - 2];
      
      // Trend Trade: Fast EMA crosses Slow EMA
      const bullishCross = prevFastEMA <= prevSlowEMA && fastEMA > slowEMA;
      const bearishCross = prevFastEMA >= prevSlowEMA && fastEMA < slowEMA;
      
      if (!bullishCross && !bearishCross) return null;
      
      const signal: 'LONG' | 'SHORT' = bullishCross ? 'LONG' : 'SHORT';
      if (!checkDirectionFilter(signal)) return null;
      
      const currentCandle = data[data.length - 1];
      const entry = currentCandle.close;
      const atr = getCurrentATR(data);
      
      // Calculate stop loss
      const slConfig = emaTradingTPSL.sl;
      let stopLoss: number;
      if (slConfig.type === 'atr') {
        stopLoss = signal === 'LONG' ? entry - (atr * (slConfig.atrMultiplier || 1.5)) : entry + (atr * (slConfig.atrMultiplier || 1.5));
      } else if (slConfig.type === 'structure') {
        const swings = calculateSwings(data, emaTradingSLSwingLength);
        const recentSwings = swings.slice(-10);
        const swingLevels = signal === 'LONG' ? recentSwings.filter(s => s.type === 'low').map(s => s.value) : recentSwings.filter(s => s.type === 'high').map(s => s.value);
        stopLoss = signal === 'LONG' ? (swingLevels.length > 0 ? Math.max(...swingLevels) : entry - atr) : (swingLevels.length > 0 ? Math.min(...swingLevels) : entry + atr);
      } else {
        const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
        stopLoss = signal === 'LONG' ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
      }
      
      const riskAmount = Math.abs(entry - stopLoss);
      const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, signal === 'LONG' ? 'long' : 'short', emaTradingTPSwingLength);
      
      // Calculate TPs
      const { tp1: tp1Config, tp2: tp2Config } = emaTradingTPSL;
      
      let tp1: number, tp2: number, tp3: number;
      let tp1Type: TPType = tp1Config.type;
      let tp2Type: TPType = tp2Config?.type || 'structure';
      
      if (tp1Config.type === 'ema' || tp1Config.type === 'vwap') {
        // EMA/VWAP exits have no price target - only exit on signal
        tp1 = signal === 'LONG' ? Infinity : -Infinity;
      } else if (tp1Config.type === 'atr') {
        tp1 = signal === 'LONG' ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
      } else if (tp1Config.type === 'structure') {
        tp1 = structureTP2;
      } else if (tp1Config.type === 'fixed_rr') {
        tp1 = signal === 'LONG' ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
      } else {
        tp1 = structureTP2;
      }
      
      if (tp2Config?.type === 'ema' || tp2Config?.type === 'vwap') {
        tp2 = signal === 'LONG' ? Infinity : -Infinity;
      } else if (tp2Config?.type === 'atr') {
        tp2 = signal === 'LONG' ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
      } else if (tp2Config?.type === 'fixed_rr') {
        tp2 = signal === 'LONG' ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
      } else {
        tp2 = structureTP3;
      }
      
      if (emaTradingTPSL.tp3?.type === 'ema' || emaTradingTPSL.tp3?.type === 'vwap') {
        tp3 = signal === 'LONG' ? Infinity : -Infinity;
      } else {
        tp3 = signal === 'LONG' ? entry + (structureTP2 - entry) * 1.5 : entry - (entry - structureTP2) * 1.5;
      }
      
      // Capture EMA state at entry for crossover exit detection
      let entryEMAState: 'fast_above_slow' | 'fast_below_slow' | undefined;
      const hasEMAExit = tp1Type === 'ema' || tp2Type === 'ema' || emaTradingTPSL.tp3?.type === 'ema';
      if (hasEMAExit && fastEMA !== null && slowEMA !== null) {
        entryEMAState = fastEMA >= slowEMA ? 'fast_above_slow' : 'fast_below_slow';
      }
      
      return {
        id: `ema_trend_${currentCandle.time}_${signal.toLowerCase()}`,
        time: currentCandle.time,
        type: signal,
        strategy: 'ema_trading',
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        tp1Type,
        tp2Type,
        tp3Type: 'projection',
        riskReward1: Math.abs(tp1 - entry) / riskAmount,
        riskReward2: Math.abs(tp2 - entry) / riskAmount,
        riskReward3: Math.abs(tp3 - entry) / riskAmount,
        quantity: calculatePositionSize(entry, stopLoss),
        reason: `EMA Crossover (${emaFastPeriod}/${emaSlowPeriod})`,
        active: true,
        entryEMAState,
      };
    }
    
    // For Bounce and Cross modes
    if (data.length < 3 || !emaLevel) return null;
    
    const prevCandle = data[data.length - 3];
    const entryCandle = data[data.length - 2];
    const confirmCandle = data[data.length - 1];
    
    const tolerance = emaLevel * (emaThreshold / 100);
    const upperZone = emaLevel + tolerance;
    const lowerZone = emaLevel - tolerance;
    
    const inZone = (c: CandleData) => c.high >= lowerZone && c.low <= upperZone;
    const aboveZone = (c: CandleData) => c.low > upperZone;
    const belowZone = (c: CandleData) => c.high < lowerZone;
    
    let signal: { type: 'LONG' | 'SHORT', pattern: 'Bounce' | 'Cross' } | null = null;
    
    if (emaEntryMode === 'bounce' && inZone(entryCandle)) {
      if (belowZone(prevCandle) && confirmCandle.close > emaLevel) {
        signal = { type: 'LONG', pattern: 'Bounce' };
      } else if (aboveZone(prevCandle) && confirmCandle.close < emaLevel) {
        signal = { type: 'SHORT', pattern: 'Bounce' };
      }
    }
    
    if (emaEntryMode === 'cross' && !signal && inZone(entryCandle)) {
      if (belowZone(prevCandle) && confirmCandle.close > upperZone) {
        signal = { type: 'LONG', pattern: 'Cross' };
      } else if (aboveZone(prevCandle) && confirmCandle.close < lowerZone) {
        signal = { type: 'SHORT', pattern: 'Cross' };
      }
    }
    
    if (!signal) return null;
    if (!checkDirectionFilter(signal.type)) return null;
    
    const entry = confirmCandle.close;
    const atr = getCurrentATR(data);
    
    // Calculate stop loss
    const slConfig = emaTradingTPSL.sl;
    let stopLoss: number;
    if (slConfig.type === 'atr') {
      stopLoss = signal.type === 'LONG' ? emaLevel - (atr * (slConfig.atrMultiplier || 1.5)) : emaLevel + (atr * (slConfig.atrMultiplier || 1.5));
    } else if (slConfig.type === 'structure') {
      stopLoss = signal.type === 'LONG' ? emaLevel - atr : emaLevel + atr;
    } else {
      const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
      stopLoss = signal.type === 'LONG' ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
    }
    
    const riskAmount = Math.abs(entry - stopLoss);
    const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, signal.type === 'LONG' ? 'long' : 'short', emaTradingTPSwingLength);
    
    // Calculate TPs
    const { tp1: tp1Config, tp2: tp2Config } = emaTradingTPSL;
    
    let tp1: number, tp2: number, tp3: number;
    let tp1Type: TPType = tp1Config.type;
    let tp2Type: TPType = tp2Config?.type || 'structure';
    
    if (tp1Config.type === 'ema' || tp1Config.type === 'vwap') {
      // EMA/VWAP exits have no price target - only exit on signal
      tp1 = signal.type === 'LONG' ? Infinity : -Infinity;
    } else if (tp1Config.type === 'atr') {
      tp1 = signal.type === 'LONG' ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
    } else if (tp1Config.type === 'structure') {
      tp1 = structureTP2;
    } else if (tp1Config.type === 'fixed_rr') {
      tp1 = signal.type === 'LONG' ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
    } else {
      tp1 = structureTP2;
    }
    
    if (tp2Config?.type === 'ema' || tp2Config?.type === 'vwap') {
      tp2 = signal.type === 'LONG' ? Infinity : -Infinity;
    } else if (tp2Config?.type === 'atr') {
      tp2 = signal.type === 'LONG' ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
    } else if (tp2Config?.type === 'fixed_rr') {
      tp2 = signal.type === 'LONG' ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
    } else {
      tp2 = structureTP3;
    }
    
    if (emaTradingTPSL.tp3?.type === 'ema' || emaTradingTPSL.tp3?.type === 'vwap') {
      tp3 = signal.type === 'LONG' ? Infinity : -Infinity;
    } else {
      tp3 = signal.type === 'LONG' ? entry + (structureTP2 - entry) * 1.5 : entry - (entry - structureTP2) * 1.5;
    }
    
    // Capture EMA state at entry for crossover exit detection (if EMA exit configured)
    let entryEMAState: 'fast_above_slow' | 'fast_below_slow' | undefined;
    const hasEMAExit = tp1Type === 'ema' || tp2Type === 'ema' || emaTradingTPSL.tp3?.type === 'ema';
    if (hasEMAExit) {
      const tp1EMA = tp1Config.type === 'ema' ? tp1Config : (tp2Config?.type === 'ema' ? tp2Config : emaTradingTPSL.tp3);
      // Use configured EMA periods or defaults (match backtest defaults)
      const fastPeriod = (tp1EMA as any)?.fastEMA || 10;
      const slowPeriod = (tp1EMA as any)?.slowEMA || 40;
      
      const closes = data.map(c => c.close);
      const fastEMAValues = calculateEMA(closes, fastPeriod);
      const slowEMAValues = calculateEMA(closes, slowPeriod);
      if (fastEMAValues.length > 0 && slowEMAValues.length > 0) {
        const currentFast = fastEMAValues[fastEMAValues.length - 1];
        const currentSlow = slowEMAValues[slowEMAValues.length - 1];
        entryEMAState = currentFast >= currentSlow ? 'fast_above_slow' : 'fast_below_slow';
      }
    }
    
    return {
      id: `ema_${signal.pattern.toLowerCase()}_${entryCandle.time}_${signal.type.toLowerCase()}`,
      time: confirmCandle.time,
      type: signal.type,
      strategy: 'ema_trading',
      entry,
      stopLoss,
      tp1,
      tp2,
      tp3,
      tp1Type,
      tp2Type,
      tp3Type: 'projection',
      riskReward1: Math.abs(tp1 - entry) / riskAmount,
      riskReward2: Math.abs(tp2 - entry) / riskAmount,
      riskReward3: Math.abs(tp3 - entry) / riskAmount,
      quantity: calculatePositionSize(entry, stopLoss),
      reason: `EMA ${signal.pattern} at ${emaLevel.toFixed(4)} (${emaSinglePeriod}MA)`,
      active: true,
      entryEMAState,
    };
  }, [stratEMATrading, emaEntryMode, calculateEMA, emaSinglePeriod, emaFastPeriod, emaSlowPeriod, emaThreshold, getCurrentATR, emaTradingTPSL, calculateSwings, emaTradingSLSwingLength, findNextSwingLevels, emaTradingTPSwingLength, calculatePositionSize, checkDirectionFilter]);

  // Generate R/S Flip signal (Resistance/Support Flip - retest after breakout)
  const generateRSFlipSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    if (!stratRSFlip || data.length < 100) return null;
    
    // Detect trendlines
    const trendlines = detectTrendlines(data, trendlineMinTouches, trendlineTolerance, trendlinePivotLength);
    if (trendlines.length === 0) return null;
    
    const currentCandle = data[data.length - 1];
    const currentPrice = currentCandle.close;
    
    // Look for recent breakouts (within last rsFlipRetestCandles)
    for (const line of trendlines) {
      const currentLinePrice = line.slope * (data.length - 1) + line.intercept;
      
      // Check if we're near the broken trendline (within 0.5%)
      const tolerance = currentLinePrice * 0.005;
      const nearLine = Math.abs(currentPrice - currentLinePrice) < tolerance;
      
      if (!nearLine) continue;
      
      // Look back to find the breakout candle
      let breakoutIdx = -1;
      for (let i = data.length - 2; i >= Math.max(0, data.length - rsFlipRetestCandles - 1); i--) {
        const prevCandle = data[i - 1];
        const candle = data[i];
        const linePrice = line.slope * i + line.intercept;
        const prevLinePrice = line.slope * (i - 1) + line.intercept;
        
        if (line.type === 'resistance') {
          // Bullish breakout: was below, closed above
          if (prevCandle.close < prevLinePrice && candle.close > linePrice) {
            breakoutIdx = i;
            break;
          }
        } else {
          // Bearish breakout: was above, closed below
          if (prevCandle.close > prevLinePrice && candle.close < linePrice) {
            breakoutIdx = i;
            break;
          }
        }
      }
      
      if (breakoutIdx === -1) continue; // No recent breakout found
      
      // Check if this is a retest (price came back to the line)
      const candlesSinceBreakout = data.length - 1 - breakoutIdx;
      if (candlesSinceBreakout < 2 || candlesSinceBreakout > rsFlipRetestCandles) continue;
      
      // Confirm rejection/bounce at the retested level
      const isLong = line.type === 'resistance'; // Broken resistance becomes support
      
      // Look for rejection pattern on current or recent candles
      let hasRejection = false;
      for (let i = Math.max(0, data.length - 3); i < data.length; i++) {
        const c = data[i];
        const linePrice = line.slope * i + line.intercept;
        
        if (isLong) {
          // For support (former resistance): wick below, close above
          const wickedBelow = c.low < linePrice && c.close > linePrice;
          if (wickedBelow) hasRejection = true;
        } else {
          // For resistance (former support): wick above, close below
          const wickedAbove = c.high > linePrice && c.close < linePrice;
          if (wickedAbove) hasRejection = true;
        }
      }
      
      if (!hasRejection) continue;
      
      // Check direction filter
      if (rsFlipDirectionFilter !== 'both') {
        if (rsFlipDirectionFilter === 'bull' && !isLong) continue;
        if (rsFlipDirectionFilter === 'bear' && isLong) continue;
      }
      
      // Check trend filter (if enabled)
      if (rsFlipTrendFilter !== 'none') {
        if (rsFlipTrendFilter === 'ema' && bias === null) continue;
        if (rsFlipTrendFilter === 'structure' && (structureTrend === null || structureTrend === 'ranging')) continue;
        if (rsFlipTrendFilter === 'both') {
          const emaBullish = bias === 'bullish';
          const structureBullish = structureTrend === 'uptrend';
          const emaBearish = bias === 'bearish';
          const structureBearish = structureTrend === 'downtrend';
          if (!((emaBullish && structureBullish) || (emaBearish && structureBearish))) continue;
        }
      }
      
      // Generate signal
      const entry = currentPrice;
      const atr = getCurrentATR(data);
      
      // Use bot-specific SL configuration
      const slConfig = rsFlipTPSL.sl;
      let stopLoss: number;
      if (slConfig.type === 'structure') {
        // Place SL just beyond the broken trendline
        const buffer = currentLinePrice * 0.003; // 0.3% buffer
        stopLoss = isLong ? currentLinePrice - buffer : currentLinePrice + buffer;
      } else if (slConfig.type === 'atr') {
        stopLoss = isLong ? entry - (atr * (slConfig.atrMultiplier || 1.5)) : entry + (atr * (slConfig.atrMultiplier || 1.5));
      } else {
        const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
        stopLoss = isLong ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
      }
      
      const riskAmount = Math.abs(entry - stopLoss);
      const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, isLong ? 'long' : 'short', rsFlipTPSwingLength);
      
      // Calculate TPs based on bot-specific config
      const { tp1: tp1Config, tp2: tp2Config } = rsFlipTPSL;
      
      let tp1: number, tp2: number, tp3: number;
      let tp1Type: TPType = tp1Config.type;
      let tp2Type: TPType = tp2Config?.type || 'structure';
      let tp3Type: TPType = 'projection';
      
      // TP1 calculation
      if (tp1Config.type === 'atr') {
        tp1 = isLong ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
      } else if (tp1Config.type === 'structure') {
        tp1 = structureTP2;
      } else if (tp1Config.type === 'fixed_rr') {
        tp1 = isLong ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
      } else {
        tp1 = structureTP2;
      }
      
      // TP2 calculation
      if (tp2Config?.type === 'atr') {
        tp2 = isLong ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
      } else if (tp2Config?.type === 'fixed_rr') {
        tp2 = isLong ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
      } else {
        tp2 = structureTP3;
      }
      
      // TP3 (default projection)
      tp3 = isLong ? entry + (structureTP2 - entry) * 1.5 : entry - (entry - structureTP2) * 1.5;
      
      // Found a valid R/S Flip signal
      return {
        id: `rs_flip_${line.type}_${breakoutIdx}`,
        time: currentCandle.time,
        type: isLong ? 'LONG' : 'SHORT',
        strategy: 'rs_flip',
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        tp1Type,
        tp2Type,
        tp3Type,
        riskReward1: Math.abs(tp1 - entry) / riskAmount,
        riskReward2: Math.abs(tp2 - entry) / riskAmount,
        riskReward3: Math.abs(tp3 - entry) / riskAmount,
        quantity: calculatePositionSize(entry, stopLoss),
        reason: `${line.type === 'resistance' ? 'Resistance' : 'Support'} flip retest at ${currentLinePrice.toFixed(4)}`,
        active: true,
      };
    }
    
    return null; // No valid R/S flip found
  }, [stratRSFlip, detectTrendlines, trendlineMinTouches, trendlineTolerance, trendlinePivotLength, rsFlipRetestCandles, rsFlipDirectionFilter, rsFlipTrendFilter, bias, structureTrend, getCurrentATR, rsFlipTPSL, findNextSwingLevels, calculatePositionSize, rsFlipTPSwingLength]);

  // Master signal generator - checks all enabled strategies
  const generateSignals = useCallback(() => {
    if (!botEnabled || candles.length < 50 || !checkTrendFilter()) return;
    
    const newSignals: TradeSignal[] = [];
    
    // NOTE: Liquidity Grab is now visual-only (removed signal generation)
    // Only show cyan markers on chart, no trade signals
    
    const chochFVGSignal = generateChochFVGSignal(candles);
    if (chochFVGSignal) newSignals.push(chochFVGSignal);
    
    const vwapSignal = generateVWAPTradingSignal(candles);
    if (vwapSignal) newSignals.push(vwapSignal);
    
    const bosTrendSignal = generateBOSTrendSignal(candles);
    if (bosTrendSignal) newSignals.push(bosTrendSignal);
    
    if (newSignals.length > 0) {
      setTradeSignals(prev => {
        // Remove duplicate signals for same strategy
        const filtered = prev.filter(s => 
          !newSignals.some(ns => ns.strategy === s.strategy && s.active)
        );
        return [...filtered, ...newSignals];
      });
    }
  }, [botEnabled, candles, checkTrendFilter, generateChochFVGSignal, generateVWAPTradingSignal, generateBOSTrendSignal]);

  // Detect market structure events and populate alerts
  const detectMarketAlerts = useCallback(() => {
    if (candles.length < 50) return;
    
    const { bos, choch } = calculateBOSandCHoCH(candles, liqGrabSwingLength);
    
    const newAlerts: MarketAlert[] = [];
    
    // Add BOS alerts
    bos.forEach(bosEvent => {
      const alertType = bosEvent.isLiquidityGrab ? 'Liquidity Sweep' : 'BOS';
      const description = bosEvent.isLiquidityGrab 
        ? `${bosEvent.type === 'bullish' ? 'Bullish' : 'Bearish'} liquidity sweep at ${bosEvent.swingPrice.toFixed(4)}`
        : `${bosEvent.type === 'bullish' ? 'Bullish' : 'Bearish'} BOS at ${bosEvent.swingPrice.toFixed(4)}`;
      
      newAlerts.push({
        id: `alert_${bosEvent.breakTime}_${alertType}`,
        time: bosEvent.breakTime,
        type: alertType,
        direction: bosEvent.type,
        price: bosEvent.swingPrice,
        description,
      });
    });
    
    // Add CHoCH alerts
    choch.forEach(chochEvent => {
      const alertType = chochEvent.isLiquidityGrab ? 'Liquidity Sweep' : 'CHoCH';
      const description = chochEvent.isLiquidityGrab
        ? `${chochEvent.type === 'bullish' ? 'Bullish' : 'Bearish'} liquidity sweep at ${chochEvent.swingPrice.toFixed(4)}`
        : `${chochEvent.type === 'bullish' ? 'Bullish' : 'Bearish'} CHoCH at ${chochEvent.swingPrice.toFixed(4)}`;
      
      newAlerts.push({
        id: `alert_${chochEvent.breakTime}_${alertType}`,
        time: chochEvent.breakTime,
        type: alertType,
        direction: chochEvent.type,
        price: chochEvent.swingPrice,
        description,
      });
    });
    
    // Add high-value FVG alerts
    const fvgs = calculateFVGs(candles, true);
    fvgs.forEach(fvg => {
      if (fvg.isHighValue && isActiveFVG(fvg, candles)) {
        newAlerts.push({
          id: `alert_${fvg.time}_FVG`,
          time: fvg.time,
          type: 'FVG',
          direction: fvg.type,
          price: (fvg.upper + fvg.lower) / 2,
          description: `${fvg.type === 'bullish' ? 'Bullish' : 'Bearish'} high-value FVG at ${((fvg.upper + fvg.lower) / 2).toFixed(4)}`,
        });
      }
    });
    
    // Add FVG Entry alerts (price entering FVG zones)
    // Calculate 1-week lookback limit (7 days in seconds)
    const oneWeekSeconds = 7 * 24 * 60 * 60;
    const currentTime = candles[candles.length - 1].time;
    const cutoffTime = currentTime - oneWeekSeconds;
    
    // For each active FVG, check if price entered it
    fvgs.forEach(fvg => {
      if (!isActiveFVG(fvg, candles)) return; // Skip filled FVGs
      
      const fvgIdx = candles.findIndex(c => c.time === fvg.time);
      if (fvgIdx === -1) return;
      
      // Check candles after FVG was created
      for (let i = fvgIdx + 1; i < candles.length; i++) {
        const candle = candles[i];
        const prevCandle = candles[i - 1];
        
        // Only alert on recent entries (within 1 week)
        if (candle.time < cutoffTime) continue;
        
        // Check if price entered the FVG zone on this candle
        // Bullish FVG entry: price moves DOWN into bullish FVG
        if (fvg.type === 'bullish') {
          const wasAboveFVG = prevCandle.low > fvg.upper;
          const enteredFVG = candle.low <= fvg.upper && candle.low >= fvg.lower;
          
          if (wasAboveFVG && enteredFVG) {
            newAlerts.push({
              id: `alert_${candle.time}_FVG_ENTRY_BULL_${fvg.time}`,
              time: candle.time,
              type: 'FVG Entry',
              direction: 'bullish',
              price: candle.low,
              description: `Bullish FVG entry at ${candle.low.toFixed(4)} (zone: ${fvg.lower.toFixed(4)}-${fvg.upper.toFixed(4)})`,
            });
            break; // Only alert once per FVG
          }
        }
        
        // Bearish FVG entry: price moves UP into bearish FVG
        if (fvg.type === 'bearish') {
          const wasBelowFVG = prevCandle.high < fvg.lower;
          const enteredFVG = candle.high >= fvg.lower && candle.high <= fvg.upper;
          
          if (wasBelowFVG && enteredFVG) {
            newAlerts.push({
              id: `alert_${candle.time}_FVG_ENTRY_BEAR_${fvg.time}`,
              time: candle.time,
              type: 'FVG Entry',
              direction: 'bearish',
              price: candle.high,
              description: `Bearish FVG entry at ${candle.high.toFixed(4)} (zone: ${fvg.lower.toFixed(4)}-${fvg.upper.toFixed(4)})`,
            });
            break; // Only alert once per FVG
          }
        }
      }
    });
    
    // Add VWAP rejection and cross alerts using HISTORICAL weekly VWAP values with 1-week lookback
    const weeklyVWAP = calculatePeriodicVWAP(candles, 'weekly', true);
    if (weeklyVWAP.length > 0 && candles.length > 1) {
      // Calculate 1-week lookback limit (7 days in seconds)
      const oneWeekSeconds = 7 * 24 * 60 * 60;
      const currentTime = candles[candles.length - 1].time;
      const cutoffTime = currentTime - oneWeekSeconds;
      
      console.log(`📊 VWAP Alert Detection - Using historical VWAP values, 1-week lookback from ${new Date(cutoffTime * 1000).toLocaleString()}`);
      
      // Create a map for fast VWAP value lookup by timestamp
      const vwapMap = new Map<number, number>();
      weeklyVWAP.forEach(v => vwapMap.set(v.time, v.value));
      
      // Check candles within 1-week lookback window
      for (let i = 1; i < candles.length; i++) {
        const candle = candles[i];
        const prevCandle = candles[i - 1];
        
        // Skip candles older than 1 week
        if (candle.time < cutoffTime) continue;
        
        // Get historical VWAP value for this candle's timestamp
        const vwapValue = vwapMap.get(candle.time);
        const prevVwapValue = vwapMap.get(prevCandle.time);
        
        // Skip if we don't have VWAP data for this candle
        if (vwapValue === undefined || prevVwapValue === undefined) continue;
        
        // Check for VWAP Crosses first (takes priority over rejections)
        // Bullish cross: previous close below VWAP, current close above VWAP
        const isBullishCross = prevCandle.close < prevVwapValue && candle.close > vwapValue;
        // Bearish cross: previous close above VWAP, current close below VWAP
        const isBearishCross = prevCandle.close > prevVwapValue && candle.close < vwapValue;
        
        if (isBullishCross) {
          console.log(`🟢 VWAP Bullish Cross at ${new Date(candle.time * 1000).toLocaleString()}, VWAP: ${vwapValue.toFixed(4)}`);
          newAlerts.push({
            id: `alert_${candle.time}_VWAP_CROSS_BULL`,
            time: candle.time,
            type: 'VWAP Cross',
            direction: 'bullish',
            price: vwapValue,
            description: `Bullish VWAP cross at ${vwapValue.toFixed(4)}`,
          });
        } else if (isBearishCross) {
          console.log(`🔴 VWAP Bearish Cross at ${new Date(candle.time * 1000).toLocaleString()}, VWAP: ${vwapValue.toFixed(4)}`);
          newAlerts.push({
            id: `alert_${candle.time}_VWAP_CROSS_BEAR`,
            time: candle.time,
            type: 'VWAP Cross',
            direction: 'bearish',
            price: vwapValue,
            description: `Bearish VWAP cross at ${vwapValue.toFixed(4)}`,
          });
        } else {
          // Only check for bounces if it's NOT a cross
          // VWAP Bounces: enters VWAP zone, close stays on same side (AND previous close was same side)
          const vwapZone = vwapValue * (vwapThreshold / 100);
          
          // Bullish bounce: wick enters VWAP zone from below, close above zone, previous close above zone
          const enteredZoneFromBelow = candle.low <= vwapValue + vwapZone && candle.low >= vwapValue - vwapZone;
          const closedAboveZone = candle.close > vwapValue + vwapZone;
          const prevClosedAboveZone = prevCandle.close > prevVwapValue + (prevVwapValue * (vwapThreshold / 100));
          
          if (enteredZoneFromBelow && closedAboveZone && prevClosedAboveZone) {
            console.log(`🟢 VWAP Bullish Bounce at ${new Date(candle.time * 1000).toLocaleString()}, VWAP: ${vwapValue.toFixed(4)}, Zone: ±${vwapThreshold}%`);
            newAlerts.push({
              id: `alert_${candle.time}_VWAP_BOUNCE_BULL`,
              time: candle.time,
              type: 'VWAP Bounce',
              direction: 'bullish',
              price: vwapValue,
              description: `Bullish VWAP bounce at ${vwapValue.toFixed(4)}`,
            });
          }
          
          // Bearish bounce: wick enters VWAP zone from above, close below zone, previous close below zone
          const enteredZoneFromAbove = candle.high >= vwapValue - vwapZone && candle.high <= vwapValue + vwapZone;
          const closedBelowZone = candle.close < vwapValue - vwapZone;
          const prevClosedBelowZone = prevCandle.close < prevVwapValue - (prevVwapValue * (vwapThreshold / 100));
          
          if (enteredZoneFromAbove && closedBelowZone && prevClosedBelowZone) {
            console.log(`🔴 VWAP Bearish Bounce at ${new Date(candle.time * 1000).toLocaleString()}, VWAP: ${vwapValue.toFixed(4)}, Zone: ±${vwapThreshold}%`);
            newAlerts.push({
              id: `alert_${candle.time}_VWAP_BOUNCE_BEAR`,
              time: candle.time,
              type: 'VWAP Bounce',
              direction: 'bearish',
              price: vwapValue,
              description: `Bearish VWAP bounce at ${vwapValue.toFixed(4)}`,
            });
          }
        }
      }
    }
    
    // Add Trendline Breakout and Rejection alerts with 1-week lookback
    if (candles.length > 100) {
      // Get effective pivot length (adaptive or user-set)
      const adaptivePivotLength = candles.length > 1000 ? 20 : candles.length > 500 ? 15 : 10;
      const effectivePivotLength = trendlinePivotLength || adaptivePivotLength;
      
      // Detect current trendlines
      const trendlines = detectTrendlines(candles, trendlineMinTouches, trendlineTolerance, effectivePivotLength);
      
      if (trendlines.length > 0) {
        // 1-week lookback
        const oneWeekSeconds = 7 * 24 * 60 * 60;
        const currentTime = candles[candles.length - 1].time;
        const cutoffTime = currentTime - oneWeekSeconds;
        
        trendlines.forEach(line => {
          // Check candles within 1-week window
          for (let i = 1; i < candles.length; i++) {
            const candle = candles[i];
            const prevCandle = candles[i - 1];
            
            // Skip old candles
            if (candle.time < cutoffTime) continue;
            
            // Calculate trendline price at this candle index
            const linePrice = line.slope * i + line.intercept;
            const prevLinePrice = line.slope * (i - 1) + line.intercept;
            const tolerance = linePrice * 0.003; // 0.3% tolerance zone
            
            if (line.type === 'resistance') {
              // BULLISH BREAKOUT: previous close below line, current close above line
              const wasBelowLine = prevCandle.close < prevLinePrice;
              const closedAboveLine = candle.close > linePrice;
              
              if (wasBelowLine && closedAboveLine) {
                newAlerts.push({
                  id: `alert_${candle.time}_TRENDLINE_BREAK_BULL`,
                  time: candle.time,
                  type: 'Trendline Breakout',
                  direction: 'bullish',
                  price: linePrice,
                  description: `Bullish breakout through resistance at ${linePrice.toFixed(4)}`,
                });
              }
              
              // BEARISH REJECTION: wick touches/penetrates line from below, but close stays below
              const wickTouchedLine = candle.high >= linePrice - tolerance && candle.high <= linePrice + tolerance;
              const closedBelowLine = candle.close < linePrice - tolerance;
              const prevClosedBelowLine = prevCandle.close < prevLinePrice - tolerance;
              
              if (wickTouchedLine && closedBelowLine && prevClosedBelowLine) {
                newAlerts.push({
                  id: `alert_${candle.time}_TRENDLINE_REJ_BEAR`,
                  time: candle.time,
                  type: 'Trendline Rejection',
                  direction: 'bearish',
                  price: linePrice,
                  description: `Bearish rejection at resistance ${linePrice.toFixed(4)}`,
                });
              }
            } else {
              // Support line
              // BEARISH BREAKOUT: previous close above line, current close below line
              const wasAboveLine = prevCandle.close > prevLinePrice;
              const closedBelowLine = candle.close < linePrice;
              
              if (wasAboveLine && closedBelowLine) {
                newAlerts.push({
                  id: `alert_${candle.time}_TRENDLINE_BREAK_BEAR`,
                  time: candle.time,
                  type: 'Trendline Breakout',
                  direction: 'bearish',
                  price: linePrice,
                  description: `Bearish breakdown through support at ${linePrice.toFixed(4)}`,
                });
              }
              
              // BULLISH REJECTION: wick touches/penetrates line from above, but close stays above
              const wickTouchedLine = candle.low <= linePrice + tolerance && candle.low >= linePrice - tolerance;
              const closedAboveLine = candle.close > linePrice + tolerance;
              const prevClosedAboveLine = prevCandle.close > prevLinePrice + tolerance;
              
              if (wickTouchedLine && closedAboveLine && prevClosedAboveLine) {
                newAlerts.push({
                  id: `alert_${candle.time}_TRENDLINE_REJ_BULL`,
                  time: candle.time,
                  type: 'Trendline Rejection',
                  direction: 'bullish',
                  price: linePrice,
                  description: `Bullish rejection at support ${linePrice.toFixed(4)}`,
                });
              }
            }
          }
        });
      }
    }
    
    // Add divergence alerts (skip - replaced with enhanced multi-indicator divergence detection below)
    
    // Add CVD/Delta Spike alerts with exchange consensus color grading
    if (cvdSpikeEnabled && deltaHistory.length >= 10) {
      // Calculate separate averages for bullish and bearish deltas
      const bullishDeltas = deltaHistory.filter(h => h.delta > 0);
      const bearishDeltas = deltaHistory.filter(h => h.delta < 0);
      
      const avgBullishDelta = bullishDeltas.length > 0 
        ? bullishDeltas.reduce((sum, h) => sum + h.delta, 0) / bullishDeltas.length 
        : 0;
      const avgBearishDelta = bearishDeltas.length > 0 
        ? bearishDeltas.reduce((sum, h) => sum + Math.abs(h.delta), 0) / bearishDeltas.length 
        : 0;
      
      // Check last 5 bars for spikes
      const recentBars = deltaHistory.slice(-5);
      
      recentBars.forEach((bar, idx) => {
        // Find corresponding candle for timestamp
        const candle = candles.find(c => new Date(c.time * 1000).toLocaleTimeString() === bar.time);
        if (!candle) return;
        
        // Get exchange consensus for color coding
        const bullishExchanges = bar.bullishExchanges || 0;
        const bearishExchanges = bar.bearishExchanges || 0;
        
        // Bullish spike detection with configurable thresholds
        const level1Mult = cvdSpikeLevel1 / 100;
        const level2Mult = cvdSpikeLevel2 / 100;
        const level3Mult = cvdSpikeLevel3 / 100;
        
        if (bar.delta > 0 && avgBullishDelta > 0) {
          const multiple = bar.delta / avgBullishDelta;
          if (multiple >= level1Mult) {
            // Determine grade symbol based on multiple and exchange consensus
            // Color code: 5-6 exchanges = 🟢, 3-4 = 🔵, 1-2 = ⚪
            let consensusEmoji = '🟢'; // 5-6 exchanges (strong)
            if (bullishExchanges <= 2) {
              consensusEmoji = '⚪'; // 1-2 exchanges (weak)
            } else if (bullishExchanges <= 4) {
              consensusEmoji = '🔵'; // 3-4 exchanges (moderate)
            }
            
            let gradeLabel = `${cvdSpikeLevel1}%`;
            let gradeEmoji = '▲';
            if (multiple >= level3Mult) {
              gradeLabel = `${cvdSpikeLevel3}%`;
              gradeEmoji = '▲³';
            } else if (multiple >= level2Mult) {
              gradeLabel = `${cvdSpikeLevel2}%`;
              gradeEmoji = '▲²';
            }
            
            newAlerts.push({
              id: `alert_${candle.time}_CVD_SPIKE_BULL`,
              time: candle.time,
              type: 'CVD Spike',
              direction: 'bullish',
              price: candle.close,
              description: `${consensusEmoji} ${gradeEmoji} ${gradeLabel} Bullish (${bullishExchanges}/6 exchanges)`,
            });
          }
        }
        
        // Bearish spike detection with configurable thresholds
        if (bar.delta < 0 && avgBearishDelta > 0) {
          const multiple = Math.abs(bar.delta) / avgBearishDelta;
          if (multiple >= level1Mult) {
            // Determine grade symbol based on multiple and exchange consensus
            // Color code: 5-6 exchanges = 🔴, 3-4 = 🟡, 1-2 = ⚪
            let consensusEmoji = '🔴'; // 5-6 exchanges (strong)
            if (bearishExchanges <= 2) {
              consensusEmoji = '⚪'; // 1-2 exchanges (weak)
            } else if (bearishExchanges <= 4) {
              consensusEmoji = '🟡'; // 3-4 exchanges (moderate)
            }
            
            let gradeLabel = `${cvdSpikeLevel1}%`;
            let gradeEmoji = '▼';
            if (multiple >= level3Mult) {
              gradeLabel = `${cvdSpikeLevel3}%`;
              gradeEmoji = '▼³';
            } else if (multiple >= level2Mult) {
              gradeLabel = `${cvdSpikeLevel2}%`;
              gradeEmoji = '▼²';
            }
            
            newAlerts.push({
              id: `alert_${candle.time}_CVD_SPIKE_BEAR`,
              time: candle.time,
              type: 'CVD Spike',
              direction: 'bearish',
              price: candle.close,
              description: `${consensusEmoji} ${gradeEmoji} ${gradeLabel} Bearish (${bearishExchanges}/6 exchanges)`,
            });
          }
        }
      });
    }
    
    // Volume Spike alerts from footprint/orderflow data
    if (footprintData && footprintData.length > 10) {
      const volumes = footprintData.map(f => f.bidVol.reduce((sum, v) => sum + v, 0) + f.askVol.reduce((sum, v) => sum + v, 0));
      const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
      const volumeThreshold = 150; // 150% of average
      
      footprintData.slice(-5).forEach(bar => {
        const candle = candles.find(c => c.time === bar.time);
        if (!candle) return;
        
        const totalVolume = bar.bidVol.reduce((sum, v) => sum + v, 0) + bar.askVol.reduce((sum, v) => sum + v, 0);
        const percentOfAvg = (totalVolume / avgVolume) * 100;
        
        if (percentOfAvg >= volumeThreshold) {
          newAlerts.push({
            id: `alert_${bar.time}_VOL_SPIKE`,
            time: bar.time,
            type: 'Volume Spike',
            direction: bar.delta > 0 ? 'bullish' : 'bearish',
            price: candle.close,
            description: `Volume spike: ${totalVolume.toFixed(0)} (${percentOfAvg.toFixed(0)}% of avg)`,
          });
        }
      });
    }
    
    // Level 2 Spike: Volume spike with absorption (delta/CVD divergence)
    if (deltaHistory.length >= 10) {
      const recentBars = deltaHistory.slice(-5);
      let cumulativeDelta = 0;
      
      recentBars.forEach((bar, idx) => {
        const candle = candles.find(c => new Date(c.time * 1000).toLocaleTimeString() === bar.time);
        if (!candle) return;
        
        cumulativeDelta += bar.delta;
        
        // Check for divergence: delta direction vs CVD direction
        const deltaDirection = bar.delta > 0 ? 'bullish' : 'bearish';
        const cvdDirection = cumulativeDelta > 0 ? 'bullish' : 'bearish';
        
        // If high volume AND divergence between delta and CVD
        if (Math.abs(bar.delta) > 10000 && deltaDirection !== cvdDirection) {
          const absorptionType = deltaDirection === 'bullish' ? 'sell-side absorption' : 'buy-side absorption';
          newAlerts.push({
            id: `alert_${candle.time}_LEVEL2_SPIKE`,
            time: candle.time,
            type: 'Level 2 Spike',
            direction: cvdDirection,
            price: candle.close,
            description: `Level 2: Volume spike with ${absorptionType} (Delta: ${bar.delta.toFixed(0)}, CVD trend: ${cvdDirection})`,
            level: 2,
          });
        }
      });
    }
    
    // Multi-timeframe oscillator divergence detection (5m, 15m, 1h, 4h)
    // For now, using single timeframe with enhanced multi-indicator detection
    const rsiData = calculateRSI(candles, rsiPeriod);
    const macdData = calculateMACD(candles, macdFast, macdSlow, macdSignal).macd;
    const mfiData = calculateMFI(candles, mfiPeriod);
    const obvData = calculateOBV(candles);
    
    // Look for divergences in recent candles
    for (let i = candles.length - 20; i < candles.length - 1; i++) {
      if (i < 10) continue;
      
      const indicatorsDiverging: string[] = [];
      
      // Check for bullish divergence (price lower low, indicators higher low)
      const priceLowerLow = candles[i].low < candles[i-5].low && candles[i].low < candles[i-10].low;
      
      if (priceLowerLow) {
        // RSI bullish divergence
        const rsiIdx = rsiData.findIndex(r => r.time === candles[i].time);
        if (rsiIdx > 10 && rsiData[rsiIdx].value > rsiData[rsiIdx-5].value) {
          indicatorsDiverging.push('RSI');
        }
        
        // MACD bullish divergence
        const macdIdx = macdData.findIndex(m => m.time === candles[i].time);
        if (macdIdx > 10 && macdData[macdIdx].value > macdData[macdIdx-5].value) {
          indicatorsDiverging.push('MACD');
        }
        
        // MFI bullish divergence
        const mfiIdx = mfiData.findIndex(m => m.time === candles[i].time);
        if (mfiIdx > 10 && mfiData[mfiIdx].value > mfiData[mfiIdx-5].value) {
          indicatorsDiverging.push('MFI');
        }
        
        // OBV bullish divergence
        const obvIdx = obvData.findIndex(o => o.time === candles[i].time);
        if (obvIdx > 10 && obvData[obvIdx].value > obvData[obvIdx-5].value) {
          indicatorsDiverging.push('OBV');
        }
        
        if (indicatorsDiverging.length > 0) {
          newAlerts.push({
            id: `alert_${candles[i].time}_OSC_DIV_BULL`,
            time: candles[i].time,
            type: 'Oscillator Divergence',
            direction: 'bullish',
            price: candles[i].close,
            description: `Level ${indicatorsDiverging.length} bullish divergence (${indicatorsDiverging.join(', ')})`,
            level: indicatorsDiverging.length,
            indicators: indicatorsDiverging,
          });
        }
      }
      
      // Check for bearish divergence (price higher high, indicators lower high)
      const priceHigherHigh = candles[i].high > candles[i-5].high && candles[i].high > candles[i-10].high;
      
      if (priceHigherHigh) {
        indicatorsDiverging.length = 0;
        
        // RSI bearish divergence
        const rsiIdx = rsiData.findIndex(r => r.time === candles[i].time);
        if (rsiIdx > 10 && rsiData[rsiIdx].value < rsiData[rsiIdx-5].value) {
          indicatorsDiverging.push('RSI');
        }
        
        // MACD bearish divergence
        const macdIdx = macdData.findIndex(m => m.time === candles[i].time);
        if (macdIdx > 10 && macdData[macdIdx].value < macdData[macdIdx-5].value) {
          indicatorsDiverging.push('MACD');
        }
        
        // MFI bearish divergence
        const mfiIdx = mfiData.findIndex(m => m.time === candles[i].time);
        if (mfiIdx > 10 && mfiData[mfiIdx].value < mfiData[mfiIdx-5].value) {
          indicatorsDiverging.push('MFI');
        }
        
        // OBV bearish divergence
        const obvIdx = obvData.findIndex(o => o.time === candles[i].time);
        if (obvIdx > 10 && obvData[obvIdx].value < obvData[obvIdx-5].value) {
          indicatorsDiverging.push('OBV');
        }
        
        if (indicatorsDiverging.length > 0) {
          newAlerts.push({
            id: `alert_${candles[i].time}_OSC_DIV_BEAR`,
            time: candles[i].time,
            type: 'Oscillator Divergence',
            direction: 'bearish',
            price: candles[i].close,
            description: `Level ${indicatorsDiverging.length} bearish divergence (${indicatorsDiverging.join(', ')})`,
            level: indicatorsDiverging.length,
            indicators: indicatorsDiverging,
          });
        }
      }
    }
    
    // Oscillator Crossover Alerts
    const macdFull = calculateMACD(candles, macdFast, macdSlow, macdSignal);
    
    // MACD crossovers
    if (macdFull.macd.length > 1) {
      const latest = macdFull.macd[macdFull.macd.length - 1];
      const prev = macdFull.macd[macdFull.macd.length - 2];
      const latestSignal = macdFull.signal[macdFull.signal.length - 1];
      const prevSignal = macdFull.signal[macdFull.signal.length - 2];
      
      if (prev.value < prevSignal.value && latest.value > latestSignal.value) {
        newAlerts.push({
          id: `alert_${latest.time}_MACD_CROSS_BULL`,
          time: latest.time,
          type: 'Oscillator Crossover',
          direction: 'bullish',
          price: candles[candles.length - 1].close,
          description: 'Bullish MACD crossover',
          indicators: ['MACD'],
        });
      } else if (prev.value > prevSignal.value && latest.value < latestSignal.value) {
        newAlerts.push({
          id: `alert_${latest.time}_MACD_CROSS_BEAR`,
          time: latest.time,
          type: 'Oscillator Crossover',
          direction: 'bearish',
          price: candles[candles.length - 1].close,
          description: 'Bearish MACD crossover',
          indicators: ['MACD'],
        });
      }
    }
    
    // RSI level crossovers
    if (rsiData.length > 1) {
      const latest = rsiData[rsiData.length - 1];
      const prev = rsiData[rsiData.length - 2];
      
      if (prev.value < 30 && latest.value > 30) {
        newAlerts.push({
          id: `alert_${latest.time}_RSI_CROSS_BULL`,
          time: latest.time,
          type: 'Oscillator Crossover',
          direction: 'bullish',
          price: candles[candles.length - 1].close,
          description: 'RSI crossed above 30 (oversold exit)',
          indicators: ['RSI'],
        });
      } else if (prev.value > 70 && latest.value < 70) {
        newAlerts.push({
          id: `alert_${latest.time}_RSI_CROSS_BEAR`,
          time: latest.time,
          type: 'Oscillator Crossover',
          direction: 'bearish',
          price: candles[candles.length - 1].close,
          description: 'RSI crossed below 70 (overbought exit)',
          indicators: ['RSI'],
        });
      }
    }
    
    // MFI level crossovers
    if (mfiData.length > 1) {
      const latest = mfiData[mfiData.length - 1];
      const prev = mfiData[mfiData.length - 2];
      
      if (prev.value < 20 && latest.value > 20) {
        newAlerts.push({
          id: `alert_${latest.time}_MFI_CROSS_BULL`,
          time: latest.time,
          type: 'Oscillator Crossover',
          direction: 'bullish',
          price: candles[candles.length - 1].close,
          description: 'MFI crossed above 20 (oversold exit)',
          indicators: ['MFI'],
        });
      } else if (prev.value > 80 && latest.value < 80) {
        newAlerts.push({
          id: `alert_${latest.time}_MFI_CROSS_BEAR`,
          time: latest.time,
          type: 'Oscillator Crossover',
          direction: 'bearish',
          price: candles[candles.length - 1].close,
          description: 'MFI crossed below 80 (overbought exit)',
          indicators: ['MFI'],
        });
      }
    }
    
    // OBV-specific alerts
    if (obvData.length > 20) {
      // OBV Breakout Divergence
      for (let i = obvData.length - 20; i < obvData.length - 1; i++) {
        if (i < 10) continue;
        
        const priceNewHigh = candles[i].high > Math.max(...candles.slice(Math.max(0, i-20), i).map(c => c.high));
        const obvNotConfirming = obvData[i].value < Math.max(...obvData.slice(Math.max(0, i-20), i).map(o => o.value));
        
        if (priceNewHigh && obvNotConfirming) {
          newAlerts.push({
            id: `alert_${candles[i].time}_OBV_DIV_BEAR`,
            time: candles[i].time,
            type: 'OBV Divergence',
            direction: 'bearish',
            price: candles[i].high,
            description: 'Bearish OBV divergence: Price new high but OBV declining (distribution)',
          });
        }
        
        const priceNewLow = candles[i].low < Math.min(...candles.slice(Math.max(0, i-20), i).map(c => c.low));
        const obvRising = obvData[i].value > Math.min(...obvData.slice(Math.max(0, i-20), i).map(o => o.value));
        
        if (priceNewLow && obvRising) {
          newAlerts.push({
            id: `alert_${candles[i].time}_OBV_DIV_BULL`,
            time: candles[i].time,
            type: 'OBV Divergence',
            direction: 'bullish',
            price: candles[i].low,
            description: 'Bullish OBV divergence: Price new low but OBV rising (accumulation)',
          });
        }
      }
      
      // OBV Momentum Spike (steep slope change)
      for (let i = 5; i < obvData.length; i++) {
        const obvChange = obvData[i].value - obvData[i-5].value;
        const avgChange = Math.abs(obvData.slice(Math.max(0, i-20), i).reduce((sum, o, idx, arr) => {
          if (idx === 0) return 0;
          return sum + Math.abs(o.value - arr[idx-1].value);
        }, 0) / 20);
        
        if (Math.abs(obvChange) > avgChange * 3) {
          newAlerts.push({
            id: `alert_${obvData[i].time}_OBV_SPIKE`,
            time: obvData[i].time,
            type: 'OBV Spike',
            direction: obvChange > 0 ? 'bullish' : 'bearish',
            price: candles.find(c => c.time === obvData[i].time)?.close || 0,
            description: `OBV momentum spike: ${obvChange > 0 ? 'Strong buying' : 'Strong selling'} pressure`,
          });
        }
      }
    }
    
    // Add Bollinger Bands alerts (if enabled)
    if (showBB && candles.length > bbPeriod) {
      const bbData = calculateBollingerBands(candles, bbPeriod, bbStdDev);
      
      // 1-week lookback
      const oneWeekSeconds = 7 * 24 * 60 * 60;
      const currentTime = candles[candles.length - 1].time;
      const cutoffTime = currentTime - oneWeekSeconds;
      
      // Check recent candles for BB touches and breakouts
      for (let i = bbPeriod; i < candles.length; i++) {
        const candle = candles[i];
        
        // Skip old candles
        if (candle.time < cutoffTime) continue;
        
        const bbIdx = i - bbPeriod + 1;
        if (bbIdx < 0 || bbIdx >= bbData.upper.length) continue;
        
        const upperBand = bbData.upper[bbIdx].value;
        const middleBand = bbData.middle[bbIdx].value;
        const lowerBand = bbData.lower[bbIdx].value;
        
        // Upper Band Touch (wick touches but closes below)
        if (candle.high >= upperBand * 0.998 && candle.close < upperBand) {
          newAlerts.push({
            id: `alert_${candle.time}_BB_UPPER_TOUCH`,
            time: candle.time,
            type: 'BB Upper Touch',
            direction: 'bearish',
            price: upperBand,
            description: `Price touched upper Bollinger Band at ${upperBand.toFixed(4)} (potential reversal)`,
          });
        }
        
        // Lower Band Touch (wick touches but closes above)
        if (candle.low <= lowerBand * 1.002 && candle.close > lowerBand) {
          newAlerts.push({
            id: `alert_${candle.time}_BB_LOWER_TOUCH`,
            time: candle.time,
            type: 'BB Lower Touch',
            direction: 'bullish',
            price: lowerBand,
            description: `Price touched lower Bollinger Band at ${lowerBand.toFixed(4)} (potential reversal)`,
          });
        }
        
        // Upper Band Breakout (close above upper band)
        if (candle.close > upperBand) {
          newAlerts.push({
            id: `alert_${candle.time}_BB_UPPER_BREAKOUT`,
            time: candle.time,
            type: 'BB Breakout',
            direction: 'bullish',
            price: candle.close,
            description: `Price broke above upper Bollinger Band (strong momentum)`,
          });
        }
        
        // Lower Band Breakout (close below lower band)
        if (candle.close < lowerBand) {
          newAlerts.push({
            id: `alert_${candle.time}_BB_LOWER_BREAKOUT`,
            time: candle.time,
            type: 'BB Breakout',
            direction: 'bearish',
            price: candle.close,
            description: `Price broke below lower Bollinger Band (strong selling)`,
          });
        }
        
        // Middle Band Cross (price crosses SMA)
        if (i > 0) {
          const prevCandle = candles[i - 1];
          const prevBbIdx = i - bbPeriod;
          if (prevBbIdx >= 0 && prevBbIdx < bbData.middle.length) {
            const prevMiddleBand = bbData.middle[prevBbIdx].value;
            
            // Bullish cross (price crosses above middle band)
            if (prevCandle.close < prevMiddleBand && candle.close > middleBand) {
              newAlerts.push({
                id: `alert_${candle.time}_BB_MIDDLE_CROSS_BULL`,
                time: candle.time,
                type: 'BB Middle Cross',
                direction: 'bullish',
                price: middleBand,
                description: `Price crossed above BB middle band (SMA${bbPeriod})`,
              });
            }
            
            // Bearish cross (price crosses below middle band)
            if (prevCandle.close > prevMiddleBand && candle.close < middleBand) {
              newAlerts.push({
                id: `alert_${candle.time}_BB_MIDDLE_CROSS_BEAR`,
                time: candle.time,
                type: 'BB Middle Cross',
                direction: 'bearish',
                price: middleBand,
                description: `Price crossed below BB middle band (SMA${bbPeriod})`,
              });
            }
          }
        }
      }
    }
    
    // Sort by time descending (most recent first) and keep last 20
    const sortedAlerts = newAlerts.sort((a, b) => b.time - a.time).slice(0, 20);
    setMarketAlerts(sortedAlerts);
  }, [candles, liqGrabSwingLength, calculateBOSandCHoCH, calculateFVGs, isActiveFVG, calculatePeriodicVWAP, vwapThreshold, detectTrendlines, trendlineMinTouches, trendlineTolerance, trendlinePivotLength, detectDivergences, cvdSpikeEnabled, cvdBullishThreshold, cvdBearishThreshold, deltaHistory, showBB, bbPeriod, bbStdDev, calculateBollingerBands]);

  // Calculate weighted R:R for partial exits based on which TPs were hit
  const calculateWeightedRR = useCallback((strategy: string, outcome: string, rr1: number, rr2: number, rr3: number): number => {
    // Get bot-specific config
    let config: BotTPSLConfig;
    if (strategy === 'liquidity_grab') config = liqGrabTPSL;
    else if (strategy === 'bos_trend') config = bosTPSL;
    else if (strategy === 'choch_fvg') config = chochTPSL;
    else if (strategy === 'vwap_rejection') config = vwapTPSL;
    else return outcome === 'SL' ? -1 : rr1; // Fallback
    
    const tp1Pct = config.tp1.positionPercent / 100;
    const tp2Pct = (config.tp2?.positionPercent || 0) / 100;
    const tp3Pct = (config.tp3?.positionPercent || 0) / 100;
    
    // Calculate weighted R based on outcome
    if (outcome === 'SL') return -1;
    if (outcome === 'Breakeven') return 0;
    
    if (outcome === 'TP1') {
      // Only TP1 hit - exit full position there
      return rr1;
    } else if (outcome === 'TP2') {
      // TP1 and TP2 hit - partial exit at TP1, rest at TP2
      if (config.numTPs === 1) return rr2; // Full position
      return (tp1Pct * rr1) + ((tp2Pct + tp3Pct) * rr2);
    } else if (outcome === 'TP3') {
      // All TPs hit - partial exits at each level
      if (config.numTPs === 1) return rr3; // Full position
      if (config.numTPs === 2) return (tp1Pct * rr1) + (tp2Pct * rr3);
      return (tp1Pct * rr1) + (tp2Pct * rr2) + (tp3Pct * rr3);
    }
    
    return rr1; // Default
  }, [liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL]);

  // Simulate a single trade forward to find outcome
  // NEW: When TP1 hits, move SL to entry (breakeven) and continue
  const simulateTrade = useCallback((signal: TradeSignal, startIdx: number, data: CandleData[]): BacktestTrade | null => {
    const isLong = signal.type === 'LONG';
    
    // Trading costs (realistic Binance.US fees + slippage)
    const commissionRate = 0.001; // 0.1% per side = 0.2% round trip
    const slippageBps = 0.0005; // 0.05% slippage per trade
    
    let currentStopLoss = signal.stopLoss;
    let tp1Hit = false;
    
    // Check if any TP is set to EMA exit or VWAP exit
    const hasEMAExit = signal.tp1Type === 'ema' || signal.tp2Type === 'ema' || signal.tp3Type === 'ema';
    const hasVWAPExit = signal.tp1Type === 'vwap' || signal.tp2Type === 'vwap' || signal.tp3Type === 'vwap';
    
    // Calculate EMAs if needed for EMA exit - use TP config settings
    let emaFast: number[] = [];
    let emaSlow: number[] = [];
    let emaExitMode: 'touch' | 'crossover' = 'crossover'; // Default
    if (hasEMAExit) {
      const closes = data.map(c => c.close);
      // Get EMA settings from the first TP that has EMA exit configured
      let emaFastPeriodToUse = 10; // Default
      let emaSlowPeriodToUse = 40; // Default
      
      if (signal.tp1Type === 'ema' && signal.tp1Config) {
        emaFastPeriodToUse = signal.tp1Config.emaFast || 10;
        emaSlowPeriodToUse = signal.tp1Config.emaSlow || 40;
        emaExitMode = signal.tp1Config.emaExitMode || 'crossover';
      } else if (signal.tp2Type === 'ema' && signal.tp2Config) {
        emaFastPeriodToUse = signal.tp2Config.emaFast || 10;
        emaSlowPeriodToUse = signal.tp2Config.emaSlow || 40;
        emaExitMode = signal.tp2Config.emaExitMode || 'crossover';
      } else if (signal.tp3Type === 'ema' && signal.tp3Config) {
        emaFastPeriodToUse = signal.tp3Config.emaFast || 10;
        emaSlowPeriodToUse = signal.tp3Config.emaSlow || 40;
        emaExitMode = signal.tp3Config.emaExitMode || 'crossover';
      }
      
      emaFast = calculateEMA(closes, emaFastPeriodToUse);
      emaSlow = calculateEMA(closes, emaSlowPeriodToUse);
    }
    
    // Calculate VWAP if needed for VWAP exit
    let vwapValues: VWAPData[] = [];
    if (hasVWAPExit) {
      // Use the strategy's VWAP type setting
      if (signal.strategy === 'vwap_rejection') {
        if (vwapType === 'daily') vwapValues = calculatePeriodicVWAP(data, 'daily', true);
        else if (vwapType === 'weekly') vwapValues = calculatePeriodicVWAP(data, 'weekly', true);
        else if (vwapType === 'monthly') vwapValues = calculatePeriodicVWAP(data, 'monthly', true);
        else if (vwapType === 'rolling10') vwapValues = calculateRollingVWAP(data, 10);
        else if (vwapType === 'rolling20') vwapValues = calculateRollingVWAP(data, 20);
        else if (vwapType === 'rolling50') vwapValues = calculateRollingVWAP(data, 50);
        else vwapValues = calculatePeriodicVWAP(data, 'weekly', true); // default
      } else {
        // For other strategies, default to weekly VWAP
        vwapValues = calculatePeriodicVWAP(data, 'weekly', true);
      }
    }
    
    // Search forward from the signal to find which level hits first
    for (let i = startIdx + 1; i < data.length; i++) {
      const candle = data[i];
      
      if (isLong) {
        // Check SL first (more conservative)
        if (candle.low <= currentStopLoss) {
          const rawPL = (currentStopLoss - signal.entry) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(currentStopLoss * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(currentStopLoss * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'long',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: currentStopLoss,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: tp1Hit ? 'Breakeven' : 'SL',
            rr: tp1Hit ? 0 : -1,
            profitLoss: netPL,
            winner: tp1Hit ? (netPL >= 0) : false,
          };
        }
        
        // Check for EMA Exit - supports both Touch and Crossover modes
        if (hasEMAExit && i > 0 && emaFast.length > i && emaSlow.length > i) {
          let shouldExit = false;
          
          if (emaExitMode === 'crossover') {
            // CROSSOVER MODE: Directional exit - LONG only exits on bearish crossover
            const prevFast = emaFast[i - 1];
            const prevSlow = emaSlow[i - 1];
            const currFast = emaFast[i];
            const currSlow = emaSlow[i];
            
            const prevState = prevFast >= prevSlow ? 'fast_above_slow' : 'fast_below_slow';
            const currState = currFast >= currSlow ? 'fast_above_slow' : 'fast_below_slow';
            
            // LONG: Only exit on bearish crossover (fast crosses below slow)
            if (signal.entryEMAState) {
              const crossedOver = (prevState === signal.entryEMAState) && (currState !== signal.entryEMAState);
              const isBearishCross = currState === 'fast_below_slow';
              shouldExit = crossedOver && isBearishCross;
            }
          } else {
            // TOUCH MODE: LONG exits when price touches or crosses below slow EMA
            const slowEMA = emaSlow[i];
            const prevClose = data[i - 1].close;
            
            // Was above, now at or below slow EMA
            shouldExit = prevClose > slowEMA && candle.close <= slowEMA;
          }
          
          if (shouldExit) {
            const exitPrice = candle.close;
            const rawPL = (exitPrice - signal.entry) * signal.quantity;
            const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(exitPrice * commissionRate)) * signal.quantity;
            const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(exitPrice * slippageBps)) * signal.quantity;
            const netPL = rawPL - commission - slippage;
            
            return {
              id: signal.id,
              entryTime: signal.time,
              exitTime: candle.time,
              direction: 'long',
              strategy: signal.strategy,
              entry: signal.entry,
              exit: exitPrice,
              stopLoss: signal.stopLoss,
              tp1: signal.tp1,
              tp2: signal.tp2,
              tp3: signal.tp3,
              outcome: 'EMA Exit',
              rr: (exitPrice - signal.entry) / (signal.entry - signal.stopLoss),
              profitLoss: netPL,
              winner: netPL > 0,
            };
          }
        }
        
        // Check for VWAP Exit - LONG exits when price crosses below VWAP
        if (hasVWAPExit && i > 0 && vwapValues.length > i) {
          const prevVWAP = vwapValues[i - 1]?.value;
          const currVWAP = vwapValues[i]?.value;
          const prevClose = data[i - 1].close;
          const currClose = candle.close;
          
          if (prevVWAP && currVWAP) {
            // LONG exit: price crosses below VWAP (was above, now below)
            const wasAboveVWAP = prevClose > prevVWAP;
            const nowBelowVWAP = currClose < currVWAP;
            
            if (wasAboveVWAP && nowBelowVWAP) {
              const exitPrice = candle.close;
              const rawPL = (exitPrice - signal.entry) * signal.quantity;
              const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(exitPrice * commissionRate)) * signal.quantity;
              const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(exitPrice * slippageBps)) * signal.quantity;
              const netPL = rawPL - commission - slippage;
              
              return {
                id: signal.id,
                entryTime: signal.time,
                exitTime: candle.time,
                direction: 'long',
                strategy: signal.strategy,
                entry: signal.entry,
                exit: exitPrice,
                stopLoss: signal.stopLoss,
                tp1: signal.tp1,
                tp2: signal.tp2,
                tp3: signal.tp3,
                outcome: 'VWAP Exit',
                rr: (exitPrice - signal.entry) / (signal.entry - signal.stopLoss),
                profitLoss: netPL,
                winner: netPL > 0,
              };
            }
          }
        }
        
        // Get bot config to check numTPs
        let numTPs = 3;
        if (signal.strategy === 'liquidity_grab') numTPs = liqGrabTPSL.numTPs;
        else if (signal.strategy === 'bos_trend') numTPs = bosTPSL.numTPs;
        else if (signal.strategy === 'choch_fvg') numTPs = chochTPSL.numTPs;
        else if (signal.strategy === 'vwap_rejection') numTPs = vwapTPSL.numTPs;
        
        // TRAILING TP LOGIC FOR LONGS
        if (signal.tp1Type === 'trailing' && signal.strategy === 'choch_fvg') {
          const isInProfit = candle.close > signal.entry;
          const dataUpToNow = data.slice(0, i + 1);
          
          if (signal.trailingActive === false) {
            // Trailing not activated yet - check if we should activate it
            if (isInProfit) {
              const swings = calculateSwings(dataUpToNow, chochTPSwingLength);
              // Find pivot lows below current price (potential exit points)
              const pivotLows = swings.filter(s => 
                s.type === 'low' && 
                s.value < candle.close &&
                s.value > signal.entry && // Must be in profit zone
                s.index < i // Must have formed before current candle
              ).sort((a, b) => b.value - a.value); // Highest pivot first
              
              if (pivotLows.length > 0) {
                // Activate trailing at the nearest pivot low
                signal.tp1 = pivotLows[0].value;
                signal.tp2 = signal.tp1;
                signal.tp3 = signal.tp1;
                signal.trailingActive = true;
                
                console.log('✅ LONG Trailing TP Activated:', {
                  entry: signal.entry.toFixed(4),
                  currentPrice: candle.close.toFixed(4),
                  trailingTP: signal.tp1.toFixed(4),
                  pivotTime: new Date(pivotLows[0].time * 1000).toLocaleString(),
                });
              }
            }
          } else {
            // Trailing already active - update to new pivots if they form
            const swings = calculateSwings(dataUpToNow, chochTPSwingLength);
            const pivotLows = swings.filter(s => 
              s.type === 'low' && 
              s.value > signal.tp1 && // Must be higher than current TP
              s.value < candle.close && // Must be below current price
              s.index < i // Must have formed before current candle
            ).sort((a, b) => b.value - a.value); // Highest pivot first
            
            if (pivotLows.length > 0) {
              signal.tp1 = pivotLows[0].value;
              signal.tp2 = signal.tp1;
              signal.tp3 = signal.tp1;
              
              console.log('📈 LONG Trailing TP Updated:', {
                newTP: signal.tp1.toFixed(4),
                currentPrice: candle.close.toFixed(4),
                pivotTime: new Date(pivotLows[0].time * 1000).toLocaleString(),
              });
            }
          }
        }
        
        // TRAILING TP LOGIC FOR LIQUIDITY GRAB LONGS
        if (signal.tp1Type === 'trailing' && signal.strategy === 'liquidity_grab') {
          const isInProfit = candle.close > signal.entry;
          const dataUpToNow = data.slice(0, i + 1);
          
          if (signal.trailingActive === false) {
            // Trailing not activated yet - check if we should activate it
            if (isInProfit) {
              const swings = calculateSwings(dataUpToNow, liqGrabTPSwingLength);
              // Find pivot lows below current price (potential exit points)
              const pivotLows = swings.filter(s => 
                s.type === 'low' && 
                s.value < candle.close &&
                s.value > signal.entry && // Must be in profit zone
                s.index < i // Must have formed before current candle
              ).sort((a, b) => b.value - a.value); // Highest pivot first
              
              if (pivotLows.length > 0) {
                // Activate trailing at the nearest pivot low
                signal.tp1 = pivotLows[0].value;
                signal.tp2 = signal.tp1;
                signal.tp3 = signal.tp1;
                signal.trailingActive = true;
                
                console.log('✅ LIQUIDITY GRAB LONG Trailing TP Activated:', {
                  entry: signal.entry.toFixed(4),
                  currentPrice: candle.close.toFixed(4),
                  trailingTP: signal.tp1.toFixed(4),
                  pivotTime: new Date(pivotLows[0].time * 1000).toLocaleString(),
                });
              }
            }
          } else {
            // Trailing already active - update to new pivots if they form
            const swings = calculateSwings(dataUpToNow, liqGrabTPSwingLength);
            const pivotLows = swings.filter(s => 
              s.type === 'low' && 
              s.value > signal.tp1 && // Must be higher than current TP
              s.value < candle.close && // Must be below current price
              s.index < i // Must have formed before current candle
            ).sort((a, b) => b.value - a.value); // Highest pivot first
            
            if (pivotLows.length > 0) {
              signal.tp1 = pivotLows[0].value;
              signal.tp2 = signal.tp1;
              signal.tp3 = signal.tp1;
              
              console.log('📈 LIQUIDITY GRAB LONG Trailing TP Updated:', {
                newTP: signal.tp1.toFixed(4),
                currentPrice: candle.close.toFixed(4),
                pivotTime: new Date(pivotLows[0].time * 1000).toLocaleString(),
              });
            }
          }
        }
        
        // Check TPs in order: TP1, then TP2, then TP3
        // Exit at first configured TP hit
        if (!tp1Hit && candle.high >= signal.tp1) {
          if (numTPs === 1) {
            // Only 1 TP configured - exit full position at TP1
            const rawPL = (signal.tp1 - signal.entry) * signal.quantity;
            const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp1 * commissionRate)) * signal.quantity;
            const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp1 * slippageBps)) * signal.quantity;
            const netPL = rawPL - commission - slippage;
            const weightedRR = calculateWeightedRR(signal.strategy, 'TP1', signal.riskReward1, signal.riskReward2, signal.riskReward3);
            
            console.log('💰 LONG TP1 Hit:', {
              strategy: signal.strategy,
              entry: signal.entry,
              exit: signal.tp1,
              quantity: signal.quantity,
              rawPL,
              commission,
              slippage,
              netPL,
              calculation: `(${signal.tp1} - ${signal.entry}) * ${signal.quantity} = ${rawPL}`
            });
            
            return {
              id: signal.id,
              entryTime: signal.time,
              exitTime: candle.time,
              direction: 'long',
              strategy: signal.strategy,
              entry: signal.entry,
              exit: signal.tp1,
              stopLoss: signal.stopLoss,
              tp1: signal.tp1,
              tp2: signal.tp2,
              tp3: signal.tp3,
              outcome: 'TP1',
              rr: weightedRR,
              profitLoss: netPL,
              winner: true,
            };
          } else {
            // Multiple TPs - move SL to entry and continue
            tp1Hit = true;
            currentStopLoss = signal.entry;
            continue;
          }
        }
        
        if (tp1Hit && numTPs >= 2 && candle.high >= signal.tp2) {
          if (numTPs === 2) {
            // Only 2 TPs configured - exit remaining position at TP2
            const rawPL = (signal.tp2 - signal.entry) * signal.quantity;
            const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp2 * commissionRate)) * signal.quantity;
            const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp2 * slippageBps)) * signal.quantity;
            const netPL = rawPL - commission - slippage;
            const weightedRR = calculateWeightedRR(signal.strategy, 'TP2', signal.riskReward1, signal.riskReward2, signal.riskReward3);
            
            return {
              id: signal.id,
              entryTime: signal.time,
              exitTime: candle.time,
              direction: 'long',
              strategy: signal.strategy,
              entry: signal.entry,
              exit: signal.tp2,
              stopLoss: signal.stopLoss,
              tp1: signal.tp1,
              tp2: signal.tp2,
              tp3: signal.tp3,
              outcome: 'TP2',
              rr: weightedRR,
              profitLoss: netPL,
              winner: true,
            };
          }
        }
        
        if (tp1Hit && numTPs >= 3 && candle.high >= signal.tp3) {
          const rawPL = (signal.tp3 - signal.entry) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp3 * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp3 * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          const weightedRR = calculateWeightedRR(signal.strategy, 'TP3', signal.riskReward1, signal.riskReward2, signal.riskReward3);
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'long',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: signal.tp3,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: 'TP3',
            rr: weightedRR,
            profitLoss: netPL,
            winner: true,
          };
        }
      } else {
        // SHORT trade
        if (candle.high >= currentStopLoss) {
          const rawPL = (signal.entry - currentStopLoss) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(currentStopLoss * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(currentStopLoss * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'short',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: currentStopLoss,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: tp1Hit ? 'Breakeven' : 'SL',
            rr: tp1Hit ? 0 : -1,
            profitLoss: netPL,
            winner: tp1Hit ? (netPL >= 0) : false,
          };
        }
        
        // Check for EMA Exit - supports both Touch and Crossover modes
        if (hasEMAExit && i > 0 && emaFast.length > i && emaSlow.length > i) {
          let shouldExit = false;
          
          if (emaExitMode === 'crossover') {
            // CROSSOVER MODE: Directional exit - SHORT only exits on bullish crossover
            const prevFast = emaFast[i - 1];
            const prevSlow = emaSlow[i - 1];
            const currFast = emaFast[i];
            const currSlow = emaSlow[i];
            
            const prevState = prevFast >= prevSlow ? 'fast_above_slow' : 'fast_below_slow';
            const currState = currFast >= currSlow ? 'fast_above_slow' : 'fast_below_slow';
            
            // SHORT: Only exit on bullish crossover (fast crosses above slow)
            if (signal.entryEMAState) {
              const crossedOver = (prevState === signal.entryEMAState) && (currState !== signal.entryEMAState);
              const isBullishCross = currState === 'fast_above_slow';
              shouldExit = crossedOver && isBullishCross;
            }
          } else {
            // TOUCH MODE: SHORT exits when price touches or crosses above slow EMA
            const slowEMA = emaSlow[i];
            const prevClose = data[i - 1].close;
            
            // Was below, now at or above slow EMA
            shouldExit = prevClose < slowEMA && candle.close >= slowEMA;
          }
          
          if (shouldExit) {
            const exitPrice = candle.close;
            const rawPL = (signal.entry - exitPrice) * signal.quantity;
            const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(exitPrice * commissionRate)) * signal.quantity;
            const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(exitPrice * slippageBps)) * signal.quantity;
            const netPL = rawPL - commission - slippage;
            
            return {
              id: signal.id,
              entryTime: signal.time,
              exitTime: candle.time,
              direction: 'short',
              strategy: signal.strategy,
              entry: signal.entry,
              exit: exitPrice,
              stopLoss: signal.stopLoss,
              tp1: signal.tp1,
              tp2: signal.tp2,
              tp3: signal.tp3,
              outcome: 'EMA Exit',
              rr: (signal.entry - exitPrice) / (signal.stopLoss - signal.entry),
              profitLoss: netPL,
              winner: netPL > 0,
            };
          }
        }
        
        // Check for VWAP Exit - SHORT exits when price crosses above VWAP
        if (hasVWAPExit && i > 0 && vwapValues.length > i) {
          const prevVWAP = vwapValues[i - 1]?.value;
          const currVWAP = vwapValues[i]?.value;
          const prevClose = data[i - 1].close;
          const currClose = candle.close;
          
          if (prevVWAP && currVWAP) {
            // SHORT exit: price crosses above VWAP (was below, now above)
            const wasBelowVWAP = prevClose < prevVWAP;
            const nowAboveVWAP = currClose > currVWAP;
            
            if (wasBelowVWAP && nowAboveVWAP) {
              const exitPrice = candle.close;
              const rawPL = (signal.entry - exitPrice) * signal.quantity;
              const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(exitPrice * commissionRate)) * signal.quantity;
              const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(exitPrice * slippageBps)) * signal.quantity;
              const netPL = rawPL - commission - slippage;
              
              return {
                id: signal.id,
                entryTime: signal.time,
                exitTime: candle.time,
                direction: 'short',
                strategy: signal.strategy,
                entry: signal.entry,
                exit: exitPrice,
                stopLoss: signal.stopLoss,
                tp1: signal.tp1,
                tp2: signal.tp2,
                tp3: signal.tp3,
                outcome: 'VWAP Exit',
                rr: (signal.entry - exitPrice) / (signal.stopLoss - signal.entry),
                profitLoss: netPL,
                winner: netPL > 0,
              };
            }
          }
        }
        
        // Get bot config to check numTPs (same as LONG side)
        let numTPs = 3;
        if (signal.strategy === 'liquidity_grab') numTPs = liqGrabTPSL.numTPs;
        else if (signal.strategy === 'bos_trend') numTPs = bosTPSL.numTPs;
        else if (signal.strategy === 'choch_fvg') numTPs = chochTPSL.numTPs;
        else if (signal.strategy === 'vwap_rejection') numTPs = vwapTPSL.numTPs;
        
        // TRAILING TP LOGIC FOR SHORTS
        if (signal.tp1Type === 'trailing' && signal.strategy === 'choch_fvg') {
          const isInProfit = candle.close < signal.entry;
          const dataUpToNow = data.slice(0, i + 1);
          
          if (signal.trailingActive === false) {
            // Trailing not activated yet - check if we should activate it
            if (isInProfit) {
              const swings = calculateSwings(dataUpToNow, chochTPSwingLength);
              // Find pivot highs above current price (potential exit points)
              const pivotHighs = swings.filter(s => 
                s.type === 'high' && 
                s.value > candle.close &&
                s.value < signal.entry && // Must be in profit zone
                s.index < i // Must have formed before current candle
              ).sort((a, b) => a.value - b.value); // Lowest pivot first
              
              if (pivotHighs.length > 0) {
                // Activate trailing at the nearest pivot high
                signal.tp1 = pivotHighs[0].value;
                signal.tp2 = signal.tp1;
                signal.tp3 = signal.tp1;
                signal.trailingActive = true;
                
                console.log('✅ SHORT Trailing TP Activated:', {
                  entry: signal.entry.toFixed(4),
                  currentPrice: candle.close.toFixed(4),
                  trailingTP: signal.tp1.toFixed(4),
                  pivotTime: new Date(pivotHighs[0].time * 1000).toLocaleString(),
                });
              }
            }
          } else {
            // Trailing already active - update to new pivots if they form
            const swings = calculateSwings(dataUpToNow, chochTPSwingLength);
            const pivotHighs = swings.filter(s => 
              s.type === 'high' && 
              s.value < signal.tp1 && // Must be lower than current TP
              s.value > candle.close && // Must be above current price
              s.index < i // Must have formed before current candle
            ).sort((a, b) => a.value - b.value); // Lowest pivot first
            
            if (pivotHighs.length > 0) {
              signal.tp1 = pivotHighs[0].value;
              signal.tp2 = signal.tp1;
              signal.tp3 = signal.tp1;
              
              console.log('📉 SHORT Trailing TP Updated:', {
                newTP: signal.tp1.toFixed(4),
                currentPrice: candle.close.toFixed(4),
                pivotTime: new Date(pivotHighs[0].time * 1000).toLocaleString(),
              });
            }
          }
        }
        
        // TRAILING TP LOGIC FOR LIQUIDITY GRAB SHORTS
        if (signal.tp1Type === 'trailing' && signal.strategy === 'liquidity_grab') {
          const isInProfit = candle.close < signal.entry;
          const dataUpToNow = data.slice(0, i + 1);
          
          if (signal.trailingActive === false) {
            // Trailing not activated yet - check if we should activate it
            if (isInProfit) {
              const swings = calculateSwings(dataUpToNow, liqGrabTPSwingLength);
              // Find pivot highs above current price (potential exit points)
              const pivotHighs = swings.filter(s => 
                s.type === 'high' && 
                s.value > candle.close &&
                s.value < signal.entry && // Must be in profit zone
                s.index < i // Must have formed before current candle
              ).sort((a, b) => a.value - b.value); // Lowest pivot first
              
              if (pivotHighs.length > 0) {
                // Activate trailing at the nearest pivot high
                signal.tp1 = pivotHighs[0].value;
                signal.tp2 = signal.tp1;
                signal.tp3 = signal.tp1;
                signal.trailingActive = true;
                
                console.log('✅ LIQUIDITY GRAB SHORT Trailing TP Activated:', {
                  entry: signal.entry.toFixed(4),
                  currentPrice: candle.close.toFixed(4),
                  trailingTP: signal.tp1.toFixed(4),
                  pivotTime: new Date(pivotHighs[0].time * 1000).toLocaleString(),
                });
              }
            }
          } else {
            // Trailing already active - update to new pivots if they form
            const swings = calculateSwings(dataUpToNow, liqGrabTPSwingLength);
            const pivotHighs = swings.filter(s => 
              s.type === 'high' && 
              s.value < signal.tp1 && // Must be lower than current TP
              s.value > candle.close && // Must be above current price
              s.index < i // Must have formed before current candle
            ).sort((a, b) => a.value - b.value); // Lowest pivot first
            
            if (pivotHighs.length > 0) {
              signal.tp1 = pivotHighs[0].value;
              signal.tp2 = signal.tp1;
              signal.tp3 = signal.tp1;
              
              console.log('📉 LIQUIDITY GRAB SHORT Trailing TP Updated:', {
                newTP: signal.tp1.toFixed(4),
                currentPrice: candle.close.toFixed(4),
                pivotTime: new Date(pivotHighs[0].time * 1000).toLocaleString(),
              });
            }
          }
        }
        
        // Check TPs in order: TP1, then TP2, then TP3
        // Exit at first configured TP hit
        if (!tp1Hit && candle.low <= signal.tp1) {
          if (numTPs === 1) {
            // Only 1 TP configured - exit full position at TP1
            const rawPL = (signal.entry - signal.tp1) * signal.quantity;
            const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp1 * commissionRate)) * signal.quantity;
            const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp1 * slippageBps)) * signal.quantity;
            const netPL = rawPL - commission - slippage;
            const weightedRR = calculateWeightedRR(signal.strategy, 'TP1', signal.riskReward1, signal.riskReward2, signal.riskReward3);
            
            return {
              id: signal.id,
              entryTime: signal.time,
              exitTime: candle.time,
              direction: 'short',
              strategy: signal.strategy,
              entry: signal.entry,
              exit: signal.tp1,
              stopLoss: signal.stopLoss,
              tp1: signal.tp1,
              tp2: signal.tp2,
              tp3: signal.tp3,
              outcome: 'TP1',
              rr: weightedRR,
              profitLoss: netPL,
              winner: true,
            };
          } else {
            // Multiple TPs - move SL to entry and continue
            tp1Hit = true;
            currentStopLoss = signal.entry;
            continue;
          }
        }
        
        if (tp1Hit && numTPs >= 2 && candle.low <= signal.tp2) {
          if (numTPs === 2) {
            // Only 2 TPs configured - exit remaining position at TP2
            const rawPL = (signal.entry - signal.tp2) * signal.quantity;
            const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp2 * commissionRate)) * signal.quantity;
            const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp2 * slippageBps)) * signal.quantity;
            const netPL = rawPL - commission - slippage;
            const weightedRR = calculateWeightedRR(signal.strategy, 'TP2', signal.riskReward1, signal.riskReward2, signal.riskReward3);
            
            return {
              id: signal.id,
              entryTime: signal.time,
              exitTime: candle.time,
              direction: 'short',
              strategy: signal.strategy,
              entry: signal.entry,
              exit: signal.tp2,
              stopLoss: signal.stopLoss,
              tp1: signal.tp1,
              tp2: signal.tp2,
              tp3: signal.tp3,
              outcome: 'TP2',
              rr: weightedRR,
              profitLoss: netPL,
              winner: true,
            };
          }
        }
        
        if (tp1Hit && numTPs >= 3 && candle.low <= signal.tp3) {
          const rawPL = (signal.entry - signal.tp3) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp3 * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp3 * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          const weightedRR = calculateWeightedRR(signal.strategy, 'TP3', signal.riskReward1, signal.riskReward2, signal.riskReward3);
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'short',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: signal.tp3,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: 'TP3',
            rr: weightedRR,
            profitLoss: netPL,
            winner: true,
          };
        }
      }
    }
    
    return null; // Trade didn't close within available data
  }, [calculateWeightedRR, liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, rsFlipTPSL, calculateEMA, emaFastPeriod, emaSlowPeriod]);

  // Generate all combinations of bot configurations for auto-backtest
  // Helper to generate range values
  const generateRangeValues = (min: number, max: number, step: number): number[] => {
    const values: number[] = [];
    for (let v = min; v <= max; v += step) {
      values.push(Number(v.toFixed(2)));
    }
    return values;
  };

  const generateAutoBacktestCombinations = useCallback((): any[] => {
    const combinations: any[] = [];
    
    // Generate arrays from ranges for strategy parameters
    const swingLengthValues = generateRangeValues(swingLengthRange.min, swingLengthRange.max, swingLengthRange.step);
    const wickRatioValues = generateRangeValues(wickRatioRange.min, wickRatioRange.max, wickRatioRange.step);
    const confirmCandlesValues = generateRangeValues(confirmCandlesRange.min, confirmCandlesRange.max, confirmCandlesRange.step);
    
    // TP1 parameter arrays - Liquidity Grab uses: Structure, Trailing, EMA, Fixed R:R
    const tp1StructureSwingValues = testTP1Structure ? generateRangeValues(tp1SwingLengthRange.min, tp1SwingLengthRange.max, tp1SwingLengthRange.step) : [];
    const tp1TrailingSwingValues = testTP1Trailing ? generateRangeValues(tp1TrailingSwingRange.min, tp1TrailingSwingRange.max, tp1TrailingSwingRange.step) : [];
    const tp1EMAFastValues = testTP1EMA ? generateRangeValues(tp1EMAFastRange.min, tp1EMAFastRange.max, tp1EMAFastRange.step) : [];
    const tp1EMASlowValues = testTP1EMA ? generateRangeValues(tp1EMASlowRange.min, tp1EMASlowRange.max, tp1EMASlowRange.step) : [];
    const tp1RRValues = testTP1FixedRR ? generateRangeValues(tp1RRRange.min, tp1RRRange.max, tp1RRRange.step) : [];
    
    // TP2 parameter arrays
    const tp2StructureSwingValues = testTP2Structure ? generateRangeValues(tp2SwingLengthRange.min, tp2SwingLengthRange.max, tp2SwingLengthRange.step) : [];
    const tp2TrailingSwingValues = testTP2Trailing ? generateRangeValues(tp2TrailingSwingRange.min, tp2TrailingSwingRange.max, tp2TrailingSwingRange.step) : [];
    const tp2EMAFastValues = testTP2EMA ? generateRangeValues(tp2EMAFastRange.min, tp2EMAFastRange.max, tp2EMAFastRange.step) : [];
    const tp2EMASlowValues = testTP2EMA ? generateRangeValues(tp2EMASlowRange.min, tp2EMASlowRange.max, tp2EMASlowRange.step) : [];
    const tp2RRValues = testTP2FixedRR ? generateRangeValues(tp2RRRange.min, tp2RRRange.max, tp2RRRange.step) : [];
    
    // TP3 parameter arrays
    const tp3StructureSwingValues = testTP3Structure ? generateRangeValues(tp3SwingLengthRange.min, tp3SwingLengthRange.max, tp3SwingLengthRange.step) : [];
    const tp3TrailingSwingValues = testTP3Trailing ? generateRangeValues(tp3TrailingSwingRange.min, tp3TrailingSwingRange.max, tp3TrailingSwingRange.step) : [];
    const tp3EMAFastValues = testTP3EMA ? generateRangeValues(tp3EMAFastRange.min, tp3EMAFastRange.max, tp3EMAFastRange.step) : [];
    const tp3EMASlowValues = testTP3EMA ? generateRangeValues(tp3EMASlowRange.min, tp3EMASlowRange.max, tp3EMASlowRange.step) : [];
    const tp3RRValues = testTP3FixedRR ? generateRangeValues(tp3RRRange.min, tp3RRRange.max, tp3RRRange.step) : [];
    
    // SL parameter arrays
    const slATRValues = testSLATR ? generateRangeValues(slATRRange.min, slATRRange.max, slATRRange.step) : [];
    const slStructureSwingValues = testSLStructure ? generateRangeValues(slSwingLengthRange.min, slSwingLengthRange.max, slSwingLengthRange.step) : [];
    const slFixedDistanceValues = testSLFixedDistance ? generateRangeValues(slFixedDistanceRange.min, slFixedDistanceRange.max, slFixedDistanceRange.step) : [];
    
    // Combine all TP1 types (include positionPercent from current config)
    const tp1Configs: any[] = [];
    tp1StructureSwingValues.forEach(v => tp1Configs.push({ type: 'structure', swingLength: v, positionPercent: liqGrabTPSL.tp1.positionPercent }));
    tp1TrailingSwingValues.forEach(v => tp1Configs.push({ type: 'trailing', trailingSwingLength: v, positionPercent: liqGrabTPSL.tp1.positionPercent }));
    // For EMA, create combinations of fast and slow
    tp1EMAFastValues.forEach(fast => {
      tp1EMASlowValues.forEach(slow => {
        if (slow > fast) { // Ensure slow > fast
          tp1Configs.push({ type: 'ema', emaFast: fast, emaSlow: slow, positionPercent: liqGrabTPSL.tp1.positionPercent });
        }
      });
    });
    tp1RRValues.forEach(v => tp1Configs.push({ type: 'fixed_rr', fixedRR: v, positionPercent: liqGrabTPSL.tp1.positionPercent }));
    
    // Combine all TP2 types (include positionPercent from current config)
    const tp2Configs: any[] = [];
    const tp2PositionPercent = liqGrabTPSL.tp2?.positionPercent || 30;
    tp2StructureSwingValues.forEach(v => tp2Configs.push({ type: 'structure', swingLength: v, positionPercent: tp2PositionPercent }));
    tp2TrailingSwingValues.forEach(v => tp2Configs.push({ type: 'trailing', trailingSwingLength: v, positionPercent: tp2PositionPercent }));
    tp2EMAFastValues.forEach(fast => {
      tp2EMASlowValues.forEach(slow => {
        if (slow > fast) {
          tp2Configs.push({ type: 'ema', emaFast: fast, emaSlow: slow, positionPercent: tp2PositionPercent });
        }
      });
    });
    tp2RRValues.forEach(v => tp2Configs.push({ type: 'fixed_rr', fixedRR: v, positionPercent: tp2PositionPercent }));
    
    // Combine all TP3 types (include positionPercent from current config)
    const tp3Configs: any[] = [];
    const tp3PositionPercent = liqGrabTPSL.tp3?.positionPercent || 20;
    tp3StructureSwingValues.forEach(v => tp3Configs.push({ type: 'structure', swingLength: v, positionPercent: tp3PositionPercent }));
    tp3TrailingSwingValues.forEach(v => tp3Configs.push({ type: 'trailing', trailingSwingLength: v, positionPercent: tp3PositionPercent }));
    tp3EMAFastValues.forEach(fast => {
      tp3EMASlowValues.forEach(slow => {
        if (slow > fast) {
          tp3Configs.push({ type: 'ema', emaFast: fast, emaSlow: slow, positionPercent: tp3PositionPercent });
        }
      });
    });
    tp3RRValues.forEach(v => tp3Configs.push({ type: 'fixed_rr', fixedRR: v, positionPercent: tp3PositionPercent }));
    
    // Combine all SL types
    const slConfigs: any[] = [];
    slATRValues.forEach(v => slConfigs.push({ type: 'atr', atrMultiplier: v }));
    slStructureSwingValues.forEach(v => slConfigs.push({ type: 'structure', swingLength: v }));
    slFixedDistanceValues.forEach(v => slConfigs.push({ type: 'fixed_distance', distancePercent: v }));
    
    // Boolean filter combinations - only test when checkbox is enabled
    const wickFilterOptions = testUseWickFilter ? [true] : [false];
    const confirmCandlesOptions = testUseConfirmCandles ? [true] : [false];
    
    // Generate all combinations
    for (const trendFilter of testTrendFilters) {
      for (const direction of testDirections) {
        for (const useWickFilter of wickFilterOptions) {
          for (const useConfirmCandles of confirmCandlesOptions) {
            for (const swingLength of swingLengthValues) {
              // Only test different wick ratios when wick filter is enabled
              const wickRatiosToTest = useWickFilter ? wickRatioValues : [100];
              for (const wickRatio of wickRatiosToTest) {
                // Only test different confirm candles when confirm candles is enabled
                const confirmCandlesToTest = useConfirmCandles ? confirmCandlesValues : [0];
                for (const confirmCandles of confirmCandlesToTest) {
                  for (const tp1 of tp1Configs.length > 0 ? tp1Configs : [null]) {
                    for (const tp2 of liqGrabTPSL.numTPs >= 2 && tp2Configs.length > 0 ? tp2Configs : [null]) {
                      for (const tp3 of liqGrabTPSL.numTPs >= 3 && tp3Configs.length > 0 ? tp3Configs : [null]) {
                        for (const sl of slConfigs) {
                          combinations.push({
                            numTPs: liqGrabTPSL.numTPs,
                            trendFilter,
                            direction,
                            swingLength,
                            wickRatio,
                            confirmCandles,
                            useWickFilter,
                            useConfirmCandles,
                            tp1,
                            tp2,
                            tp3,
                            sl
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`🧪 Generated ${combinations.length} test combinations`);
    return combinations;
  }, [
    testTrendFilters, testDirections,
    swingLengthRange, wickRatioRange, confirmCandlesRange,
    testUseWickFilter, testUseConfirmCandles,
    liqGrabTPSL.numTPs, liqGrabTPSL.tp1.positionPercent, liqGrabTPSL.tp2, liqGrabTPSL.tp3,
    testTP1Structure, testTP1Trailing, testTP1EMA, testTP1FixedRR,
    tp1SwingLengthRange, tp1TrailingSwingRange, tp1EMAFastRange, tp1EMASlowRange, tp1RRRange,
    testTP2Structure, testTP2Trailing, testTP2EMA, testTP2FixedRR,
    tp2SwingLengthRange, tp2TrailingSwingRange, tp2EMAFastRange, tp2EMASlowRange, tp2RRRange,
    testTP3Structure, testTP3Trailing, testTP3EMA, testTP3FixedRR,
    tp3SwingLengthRange, tp3TrailingSwingRange, tp3EMAFastRange, tp3EMASlowRange, tp3RRRange,
    testSLATR, testSLStructure, testSLFixedDistance,
    slATRRange, slSwingLengthRange, slFixedDistanceRange
  ]);

  // Run auto-backtest with all combinations
  const runAutoBacktest = useCallback(async () => {
    if (candles.length < 100) {
      alert('Need at least 100 candles for backtest');
      return;
    }
    
    const startTime = performance.now();
    
    setLiqGrabAutoTestRunning(true);
    setLiqGrabAutoTestResults([]);
    setLiqGrabAutoTestProgress(0);
    
    const combinations = generateAutoBacktestCombinations();
    const results: AutoBacktestResult[] = [];
    
    console.log(`🚀 Starting auto-backtest with ${combinations.length} configurations...`);
    
    // Test each combination (simplified backtest)
    for (let i = 0; i < combinations.length; i++) {
      const config = combinations[i];
      
      // Update progress
      setLiqGrabAutoTestProgress(Math.round((i / combinations.length) * 100));
      
      // Run a simplified backtest for this config (config passed directly to signal generator)
      const allSignals: TradeSignal[] = [];
      const completedTrades: BacktestTrade[] = [];
      let lastTradeExitTime = 0;
      
      for (let j = 50; j < candles.length - 10; j++) {
        const currentTime = candles[j].time;
        if (currentTime < lastTradeExitTime) continue;
        
        const dataSlice = candles.slice(0, j + 1);
        const liqSignal = generateLiquidityGrabSignal(dataSlice, true, {
          swingLength: config.swingLength,
          wickRatio: config.wickRatio,
          confirmCandles: config.confirmCandles,
          useWickFilter: config.useWickFilter,
          useConfirmCandles: config.useConfirmCandles,
          trendFilter: config.trendFilter,
          directionFilter: config.direction,
          tpslConfig: config
        });
        
        if (liqSignal && !allSignals.some(s => s.id === liqSignal.id)) {
          allSignals.push(liqSignal);
          const trade = simulateTrade(liqSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
          }
        }
      }
      
      // Calculate results
      const winners = completedTrades.filter(t => t.winner).length;
      const losers = completedTrades.filter(t => !t.winner).length;
      const totalPL = completedTrades.reduce((sum, t) => sum + t.profitLoss, 0);
      const avgRR = completedTrades.length > 0 ? completedTrades.reduce((sum, t) => sum + t.rr, 0) / completedTrades.length : 0;
      const winRate = completedTrades.length > 0 ? (winners / completedTrades.length) * 100 : 0;
      
      const grossProfit = completedTrades.filter(t => t.winner).reduce((sum, t) => sum + t.profitLoss, 0);
      const grossLoss = Math.abs(completedTrades.filter(t => !t.winner).reduce((sum, t) => sum + t.profitLoss, 0));
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
      
      const finalBalance = accountSize + totalPL;
      const returnPercent = ((finalBalance - accountSize) / accountSize) * 100;
      
      const backtestResults: BacktestResults = {
        trades: completedTrades,
        totalTrades: completedTrades.length,
        winners,
        losers,
        winRate,
        avgRR,
        totalPL,
        profitFactor,
        accountSize,
        riskPerTrade: riskPercent,
        avgPositionSize: 0,
        finalBalance,
        returnPercent
      };
      
      // Create description - only show configured TPs
      let desc = `Swing:${config.swingLength}`;
      if (config.useWickFilter) desc += ` | Wick:${config.wickRatio}%`;
      if (config.useConfirmCandles) desc += ` | Confirm:${config.confirmCandles}`;
      desc += ` | Trend:${config.trendFilter} | Dir:${config.direction}`;
      desc += ` | TP1:${config.tp1.type}`;
      if (config.tp1.type === 'atr') desc += `(${config.tp1.atrMultiplier}x)`;
      if (config.tp1.type === 'fixed_rr') desc += `(${config.tp1.fixedRR}:1)`;
      if (config.tp1.type === 'structure') desc += `(sw${config.tp1.swingLength})`;
      
      if (config.numTPs >= 2 && config.tp2) {
        desc += ` | TP2:${config.tp2.type}`;
        if (config.tp2.type === 'atr') desc += `(${config.tp2.atrMultiplier}x)`;
        if (config.tp2.type === 'fixed_rr') desc += `(${config.tp2.fixedRR}:1)`;
        if (config.tp2.type === 'structure') desc += `(sw${config.tp2.swingLength})`;
      }
      
      if (config.numTPs === 3 && config.tp3) {
        desc += ` | TP3:${config.tp3.type}`;
        if (config.tp3.type === 'atr') desc += `(${config.tp3.atrMultiplier}x)`;
        if (config.tp3.type === 'structure') desc += `(sw${config.tp3.swingLength})`;
      }
      
      desc += ` | SL:${config.sl.type}`;
      if (config.sl.type === 'atr') desc += `(${config.sl.atrMultiplier}x)`;
      if (config.sl.type === 'structure') desc += `(sw${config.sl.swingLength})`;
      if (config.sl.type === 'fixed_distance') desc += `(${config.sl.distancePercent}%)`;
      
      results.push({
        config,
        results: backtestResults,
        configDescription: desc,
        swingLength: config.swingLength,
        wickRatio: config.wickRatio || 100,
        confirmCandles: config.confirmCandles || 0,
        useWickFilter: config.useWickFilter || false,
        useConfirmCandles: config.useConfirmCandles || false,
        trendFilter: config.trendFilter,
        allowedDirections: config.direction
      });
      
      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Sort by total profit (default)
    results.sort((a, b) => b.results.totalPL - a.results.totalPL);
    
    // Track duration and combo count for future time estimates
    const duration = performance.now() - startTime;
    setLiqGrabAutoTestDurations(prev => {
      const updated = [...prev, { duration, combos: combinations.length }];
      return updated.slice(-5); // Keep only last 5
    });
    
    setLiqGrabAutoTestResults(results);
    setLiqGrabAutoTestProgress(100);
    setLiqGrabAutoTestRunning(false);
    
    console.log('✅ Auto-backtest complete!', {
      totalConfigs: results.length,
      bestProfit: results[0]?.results.totalPL.toFixed(2),
      bestConfig: results[0]?.configDescription,
      duration: `${(duration / 1000).toFixed(1)}s`
    });
  }, [candles, generateAutoBacktestCombinations, generateLiquidityGrabSignal, simulateTrade, liqGrabTPSL, accountSize, riskPercent]);

  // Apply all settings from an auto-backtest result
  const applyAutoBacktestConfig = useCallback((result: AutoBacktestResult) => {
    // Apply TP/SL configuration
    setLiqGrabTPSL(result.config);
    
    // Apply strategy parameters
    setLiqGrabSwingLength(result.swingLength);
    setLiqGrabSwingLengthInput(result.swingLength.toString());
    setLiqGrabTrendFilter(result.trendFilter);
    // Convert 'long'/'short' to 'bull'/'bear'
    const directionFilter = result.allowedDirections === 'long' ? 'bull' : result.allowedDirections === 'short' ? 'bear' : 'both';
    setLiqGrabDirectionFilter(directionFilter);
    
    // Apply TP/SL swing lengths from config if they're structure type
    if (result.config.tp1.type === 'structure' && result.config.tp1.swingLength) {
      setLiqGrabTPSwingLength(result.config.tp1.swingLength);
      setLiqGrabTPSwingLengthInput(result.config.tp1.swingLength.toString());
    }
    if (result.config.sl.type === 'structure' && result.config.sl.swingLength) {
      setLiqGrabSLSwingLength(result.config.sl.swingLength);
      setLiqGrabSLSwingLengthInput(result.config.sl.swingLength.toString());
    }
    
    // Show success notification
    toast({
      title: "✅ Settings Applied",
      description: `Configuration applied: ${result.configDescription}`,
      duration: 3000,
    });
    
    console.log('✅ Applied auto-backtest configuration:', {
      swingLength: result.swingLength,
      trendFilter: result.trendFilter,
      allowedDirections: result.allowedDirections,
      tpsl: result.config
    });
  }, [toast]);

  // Save current Liquidity Grab settings as default
  const saveAsDefault = useCallback(() => {
    const defaultSettings = {
      swingLength: liqGrabSwingLength,
      trendFilter: liqGrabTrendFilter,
      directionFilter: liqGrabDirectionFilter,
      tpSwingLength: liqGrabTPSwingLength,
      slSwingLength: liqGrabSLSwingLength,
      tpslConfig: liqGrabTPSL
    };
    
    localStorage.setItem('liqGrabDefaultSettings', JSON.stringify(defaultSettings));
    
    toast({
      title: "💾 Saved as Default",
      description: "Current settings saved as default configuration",
      duration: 3000,
    });
    
    console.log('💾 Saved default settings:', defaultSettings);
  }, [liqGrabSwingLength, liqGrabTrendFilter, liqGrabDirectionFilter, liqGrabTPSwingLength, liqGrabSLSwingLength, liqGrabTPSL, toast]);

  // Load default settings from localStorage
  const loadDefaultSettings = useCallback(() => {
    try {
      const saved = localStorage.getItem('liqGrabDefaultSettings');
      if (saved) {
        const defaultSettings = JSON.parse(saved);
        
        if (defaultSettings.swingLength !== undefined) {
          setLiqGrabSwingLength(defaultSettings.swingLength);
          setLiqGrabSwingLengthInput(defaultSettings.swingLength.toString());
        }
        if (defaultSettings.trendFilter !== undefined) {
          setLiqGrabTrendFilter(defaultSettings.trendFilter);
        }
        if (defaultSettings.directionFilter !== undefined) {
          setLiqGrabDirectionFilter(defaultSettings.directionFilter);
        }
        if (defaultSettings.tpSwingLength !== undefined) {
          setLiqGrabTPSwingLength(defaultSettings.tpSwingLength);
          setLiqGrabTPSwingLengthInput(defaultSettings.tpSwingLength.toString());
        }
        if (defaultSettings.slSwingLength !== undefined) {
          setLiqGrabSLSwingLength(defaultSettings.slSwingLength);
          setLiqGrabSLSwingLengthInput(defaultSettings.slSwingLength.toString());
        }
        if (defaultSettings.tpslConfig !== undefined) {
          setLiqGrabTPSL(defaultSettings.tpslConfig);
          console.log('✅ TP/SL configuration loaded:', defaultSettings.tpslConfig);
          
          // Sync SL swing length from tpslConfig (this takes priority over the separate slSwingLength field)
          if (defaultSettings.tpslConfig.sl?.swingLength !== undefined) {
            setLiqGrabSLSwingLength(defaultSettings.tpslConfig.sl.swingLength);
            setLiqGrabSLSwingLengthInput(defaultSettings.tpslConfig.sl.swingLength.toString());
            console.log('✅ Synced SL swing length from tpslConfig:', defaultSettings.tpslConfig.sl.swingLength);
          }
          // Sync TP trailing swing length from tpslConfig if it exists
          if (defaultSettings.tpslConfig.tp1?.trailingSwingLength !== undefined) {
            setLiqGrabTPSwingLength(defaultSettings.tpslConfig.tp1.trailingSwingLength);
            setLiqGrabTPSwingLengthInput(defaultSettings.tpslConfig.tp1.trailingSwingLength.toString());
            console.log('✅ Synced TP trailing swing length from tpslConfig:', defaultSettings.tpslConfig.tp1.trailingSwingLength);
          }
        }
        
        console.log('📂 Loaded default settings from localStorage');
        return true;
      }
    } catch (error) {
      console.error('Failed to load default settings:', error);
    }
    return false;
  }, []);

  // Load default settings on mount
  useEffect(() => {
    loadDefaultSettings();
  }, [loadDefaultSettings]);

  // Save indicator defaults to localStorage (for current timeframe only)
  const saveToTimeframe = useCallback(() => {
    const indicatorDefaults = {
      // EMAs
      showEMA,
      emaFastPeriod,
      emaSlowPeriod,
      emaConfigs,
      // SMAs
      showSMA,
      smaConfigs,
      // Oscillators
      showRSI,
      rsiPeriod,
      showMACD,
      macdFast,
      macdSlow,
      macdSignal,
      showOBV,
      showMFI,
      mfiPeriod,
      showStochRSI,
      stochRSIPeriod,
      showWilliamsR,
      williamsRPeriod,
      showCCI,
      cciPeriod,
      showADX,
      adxPeriod,
      // Bollinger Bands
      showBB,
      bbPeriod,
      bbStdDev,
      // VWAPs
      showVWAPSession,
      showVWAPDaily,
      showVWAPWeekly,
      showVWAPMonthly,
      showVWAPRolling,
      vwapRollingPeriod,
      showVWAPBands,
      showSessionVWAP,
      // SMC Indicators
      showFVG,
      showBOS,
      showCHoCH,
      showSwingPivots,
      showOrderBlocks,
      obSwingLength,
      orderBlockLength,
      showPremiumDiscount,
      // Trend Indicators
      showSupertrend,
      supertrendPeriod,
      supertrendMultiplier,
      showParabolicSAR,
      sarStep,
      sarMax,
      showAutoTrendlines,
      // Display options
      showHighValueOnly,
      showChartLabels,
      alertFilterMode,
      // CVD Spike settings
      cvdSpikeEnabled,
      cvdSpikeLevel1,
      cvdSpikeLevel2,
      cvdSpikeLevel3,
    };
    
    const storageKey = `indicatorDefaults_${userId}_${symbol}_${interval}`;
    localStorage.setItem(storageKey, JSON.stringify(indicatorDefaults));
    
    toast({
      title: "💾 Saved to Timeframe",
      description: `Indicator settings saved for ${symbol} on ${interval}`,
      duration: 3000,
    });
    
    console.log(`💾 Saved indicator defaults for ${userId}_${symbol}_${interval}:`, indicatorDefaults);
  }, [userId, symbol, interval, showEMA, emaFastPeriod, emaSlowPeriod, emaConfigs, showSMA, smaConfigs, showRSI, rsiPeriod, showMACD, macdFast, macdSlow, macdSignal, showOBV, showMFI, mfiPeriod, showStochRSI, stochRSIPeriod, showWilliamsR, williamsRPeriod, showCCI, cciPeriod, showADX, adxPeriod, showBB, bbPeriod, bbStdDev, showVWAPSession, showVWAPDaily, showVWAPWeekly, showVWAPMonthly, showVWAPRolling, vwapRollingPeriod, showVWAPBands, showSessionVWAP, showFVG, showBOS, showCHoCH, showSwingPivots, showOrderBlocks, obSwingLength, orderBlockLength, showPremiumDiscount, showSupertrend, supertrendPeriod, supertrendMultiplier, showParabolicSAR, sarStep, sarMax, showAutoTrendlines, showHighValueOnly, showChartLabels, alertFilterMode, cvdSpikeEnabled, cvdSpikeLevel1, cvdSpikeLevel2, cvdSpikeLevel3, toast]);

  // Set current timeframe as the default for this symbol on page load
  const makeTimeframeDefault = useCallback(() => {
    const timeframeKey = `defaultTimeframe_${symbol}`;
    localStorage.setItem(timeframeKey, interval);
    
    toast({
      title: "⭐ Default Timeframe Set",
      description: `${interval} will load by default for ${symbol}`,
      duration: 3000,
    });
    
    console.log(`⭐ Set default timeframe for ${symbol}: ${interval}`);
  }, [symbol, interval, toast]);

  // Legacy function for backward compatibility - saves both
  const saveIndicatorDefaults = useCallback(() => {
    saveToTimeframe();
    makeTimeframeDefault();
  }, [saveToTimeframe, makeTimeframeDefault]);

  // Reset all indicators to OFF (used when no saved config exists for timeframe)
  const resetAllIndicators = useCallback(() => {
    // EMAs
    setShowEMA(false);
    setEmaConfigs([]);
    setEmaInputs({});
    // SMAs
    setShowSMA(false);
    setSmaConfigs([]);
    // Oscillators
    setShowRSI(false);
    setShowMACD(false);
    setShowOBV(false);
    setShowMFI(false);
    setShowStochRSI(false);
    setShowWilliamsR(false);
    setShowCCI(false);
    setShowADX(false);
    // Bollinger Bands
    setShowBB(false);
    // VWAPs
    setShowVWAPSession(false);
    setShowVWAPDaily(false);
    setShowVWAPWeekly(false);
    setShowVWAPMonthly(false);
    setShowVWAPRolling(false);
    setShowVWAPBands(false);
    setShowSessionVWAP(false);
    // SMC Indicators
    setShowFVG(false);
    setShowBOS(false);
    setShowCHoCH(false);
    setShowSwingPivots(false);
    setShowOrderBlocks(false);
    setShowPremiumDiscount(false);
    // Trend Indicators
    setShowSupertrend(false);
    setShowParabolicSAR(false);
    setShowAutoTrendlines(false);
    // Display options
    setShowHighValueOnly(false);
    setShowChartLabels(false);
    // CVD Spike settings - reset to defaults (disabled by default)
    setCvdSpikeEnabled(false);
    setCvdSpikeLevel1(175);
    setCvdSpikeLevel1Input('175');
    setCvdSpikeLevel2(250);
    setCvdSpikeLevel2Input('250');
    setCvdSpikeLevel3(400);
    setCvdSpikeLevel3Input('400');
    
    console.log(`🔄 Reset all indicators to OFF for ${symbol}_${interval} (no saved config)`);
  }, [symbol, interval]);

  // Load indicator defaults from localStorage
  const loadIndicatorDefaults = useCallback(() => {
    try {
      const storageKey = `indicatorDefaults_${userId}_${symbol}_${interval}`;
      const saved = localStorage.getItem(storageKey);
      
      if (!saved) {
        // No saved config for this timeframe - reset all indicators to OFF
        resetAllIndicators();
        return false;
      }
      
      const defaults = JSON.parse(saved);
      
      // EMAs
      if (defaults.showEMA !== undefined) setShowEMA(defaults.showEMA);
      if (defaults.emaFastPeriod !== undefined) {
        setEmaFastPeriod(defaults.emaFastPeriod);
        setEmaFastInput(defaults.emaFastPeriod.toString());
      }
      if (defaults.emaSlowPeriod !== undefined) {
        setEmaSlowPeriod(defaults.emaSlowPeriod);
        setEmaSlowInput(defaults.emaSlowPeriod.toString());
      }
      if (defaults.emaConfigs && Array.isArray(defaults.emaConfigs)) {
        setEmaConfigs(defaults.emaConfigs);
        const inputs: Record<string, string> = {};
        defaults.emaConfigs.forEach((c: any) => {
          inputs[c.id] = String(c.period);
        });
        setEmaInputs(inputs);
      }
      
      // SMAs
      if (defaults.showSMA !== undefined) setShowSMA(defaults.showSMA);
      if (defaults.smaConfigs && Array.isArray(defaults.smaConfigs)) {
        setSmaConfigs(defaults.smaConfigs);
      }
      
      // Oscillators
      if (defaults.showRSI !== undefined) setShowRSI(defaults.showRSI);
      if (defaults.rsiPeriod !== undefined) {
        setRsiPeriod(defaults.rsiPeriod);
        setRsiPeriodInput(defaults.rsiPeriod.toString());
      }
      if (defaults.showMACD !== undefined) setShowMACD(defaults.showMACD);
      if (defaults.macdFast !== undefined) {
        setMacdFast(defaults.macdFast);
        setMacdFastInput(defaults.macdFast.toString());
      }
      if (defaults.macdSlow !== undefined) {
        setMacdSlow(defaults.macdSlow);
        setMacdSlowInput(defaults.macdSlow.toString());
      }
      if (defaults.macdSignal !== undefined) {
        setMacdSignal(defaults.macdSignal);
        setMacdSignalInput(defaults.macdSignal.toString());
      }
      if (defaults.showOBV !== undefined) setShowOBV(defaults.showOBV);
      if (defaults.showMFI !== undefined) setShowMFI(defaults.showMFI);
      if (defaults.mfiPeriod !== undefined) {
        setMfiPeriod(defaults.mfiPeriod);
        setMfiPeriodInput(defaults.mfiPeriod.toString());
      }
      if (defaults.showStochRSI !== undefined) setShowStochRSI(defaults.showStochRSI);
      if (defaults.stochRSIPeriod !== undefined) {
        setStochRSIPeriod(defaults.stochRSIPeriod);
        setStochRSIPeriodInput(defaults.stochRSIPeriod.toString());
      }
      if (defaults.showWilliamsR !== undefined) setShowWilliamsR(defaults.showWilliamsR);
      if (defaults.williamsRPeriod !== undefined) {
        setWilliamsRPeriod(defaults.williamsRPeriod);
        setWilliamsRPeriodInput(defaults.williamsRPeriod.toString());
      }
      if (defaults.showCCI !== undefined) setShowCCI(defaults.showCCI);
      if (defaults.cciPeriod !== undefined) {
        setCciPeriod(defaults.cciPeriod);
        setCciPeriodInput(defaults.cciPeriod.toString());
      }
      if (defaults.showADX !== undefined) setShowADX(defaults.showADX);
      if (defaults.adxPeriod !== undefined) {
        setAdxPeriod(defaults.adxPeriod);
        setAdxPeriodInput(defaults.adxPeriod.toString());
      }
      
      // Bollinger Bands
      if (defaults.showBB !== undefined) setShowBB(defaults.showBB);
      if (defaults.bbPeriod !== undefined) {
        setBbPeriod(defaults.bbPeriod);
        setBbPeriodInput(defaults.bbPeriod.toString());
      }
      if (defaults.bbStdDev !== undefined) {
        setBbStdDev(defaults.bbStdDev);
        setBbStdDevInput(defaults.bbStdDev.toString());
      }
      
      // VWAPs
      if (defaults.showVWAPSession !== undefined) setShowVWAPSession(defaults.showVWAPSession);
      if (defaults.showVWAPDaily !== undefined) setShowVWAPDaily(defaults.showVWAPDaily);
      if (defaults.showVWAPWeekly !== undefined) setShowVWAPWeekly(defaults.showVWAPWeekly);
      if (defaults.showVWAPMonthly !== undefined) setShowVWAPMonthly(defaults.showVWAPMonthly);
      if (defaults.showVWAPRolling !== undefined) setShowVWAPRolling(defaults.showVWAPRolling);
      if (defaults.vwapRollingPeriod !== undefined) {
        setVwapRollingPeriod(defaults.vwapRollingPeriod);
        setVwapRollingPeriodInput(defaults.vwapRollingPeriod.toString());
      }
      if (defaults.showVWAPBands !== undefined) setShowVWAPBands(defaults.showVWAPBands);
      if (defaults.showSessionVWAP !== undefined) setShowSessionVWAP(defaults.showSessionVWAP);
      
      // SMC Indicators
      if (defaults.showFVG !== undefined) setShowFVG(defaults.showFVG);
      if (defaults.showBOS !== undefined) setShowBOS(defaults.showBOS);
      if (defaults.showCHoCH !== undefined) setShowCHoCH(defaults.showCHoCH);
      if (defaults.showSwingPivots !== undefined) setShowSwingPivots(defaults.showSwingPivots);
      if (defaults.showOrderBlocks !== undefined) setShowOrderBlocks(defaults.showOrderBlocks);
      if (defaults.obSwingLength !== undefined) {
        setObSwingLength(defaults.obSwingLength);
        setObSwingLengthInput(defaults.obSwingLength.toString());
      }
      if (defaults.orderBlockLength !== undefined) {
        setOrderBlockLength(defaults.orderBlockLength);
        setOrderBlockLengthInput(defaults.orderBlockLength.toString());
      }
      if (defaults.showPremiumDiscount !== undefined) setShowPremiumDiscount(defaults.showPremiumDiscount);
      
      // Trend Indicators
      if (defaults.showSupertrend !== undefined) setShowSupertrend(defaults.showSupertrend);
      if (defaults.supertrendPeriod !== undefined) {
        setSupertrendPeriod(defaults.supertrendPeriod);
        setSupertrendPeriodInput(defaults.supertrendPeriod.toString());
      }
      if (defaults.supertrendMultiplier !== undefined) {
        setSupertrendMultiplier(defaults.supertrendMultiplier);
        setSupertrendMultiplierInput(defaults.supertrendMultiplier.toString());
      }
      if (defaults.showParabolicSAR !== undefined) setShowParabolicSAR(defaults.showParabolicSAR);
      if (defaults.sarStep !== undefined) {
        setSarStep(defaults.sarStep);
        setSarStepInput(defaults.sarStep.toString());
      }
      if (defaults.sarMax !== undefined) {
        setSarMax(defaults.sarMax);
        setSarMaxInput(defaults.sarMax.toString());
      }
      if (defaults.showAutoTrendlines !== undefined) setShowAutoTrendlines(defaults.showAutoTrendlines);
      
      // Display options
      if (defaults.showHighValueOnly !== undefined) setShowHighValueOnly(defaults.showHighValueOnly);
      if (defaults.showChartLabels !== undefined) setShowChartLabels(defaults.showChartLabels);
      if (defaults.alertFilterMode !== undefined) setAlertFilterMode(defaults.alertFilterMode);
      
      // CVD Spike settings
      if (defaults.cvdSpikeEnabled !== undefined) setCvdSpikeEnabled(defaults.cvdSpikeEnabled);
      if (defaults.cvdSpikeLevel1 !== undefined) {
        setCvdSpikeLevel1(defaults.cvdSpikeLevel1);
        setCvdSpikeLevel1Input(defaults.cvdSpikeLevel1.toString());
      }
      if (defaults.cvdSpikeLevel2 !== undefined) {
        setCvdSpikeLevel2(defaults.cvdSpikeLevel2);
        setCvdSpikeLevel2Input(defaults.cvdSpikeLevel2.toString());
      }
      if (defaults.cvdSpikeLevel3 !== undefined) {
        setCvdSpikeLevel3(defaults.cvdSpikeLevel3);
        setCvdSpikeLevel3Input(defaults.cvdSpikeLevel3.toString());
      }
      
      toast({
        title: "📂 Indicators Loaded",
        description: `Settings restored for ${symbol} on ${interval}`,
        duration: 2000,
      });
      
      console.log(`📂 Loaded indicator defaults for ${symbol}_${interval}`);
      return true;
    } catch (error) {
      console.error('Failed to load indicator defaults:', error);
      resetAllIndicators();
    }
    return false;
  }, [userId, symbol, interval, toast, resetAllIndicators]);

  // Load indicator defaults when symbol or interval changes
  useEffect(() => {
    loadIndicatorDefaults();
  }, [symbol, interval, loadIndicatorDefaults]);

  // Click outside to deselect tab and collapse controls
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chartControlsRef.current && !chartControlsRef.current.contains(event.target as Node)) {
        setChartControlsTab(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Sort auto-backtest results based on selected column
  const sortedAutoBacktestResults = useMemo(() => {
    const sorted = [...liqGrabAutoTestResults];
    switch (liqGrabAutoTestSortBy) {
      case 'profit':
        return sorted.sort((a, b) => b.results.totalPL - a.results.totalPL);
      case 'winRate':
        return sorted.sort((a, b) => b.results.winRate - a.results.winRate);
      case 'trades':
        return sorted.sort((a, b) => b.results.totalTrades - a.results.totalTrades);
      case 'avgRR':
        return sorted.sort((a, b) => b.results.avgRR - a.results.avgRR);
      default:
        return sorted;
    }
  }, [liqGrabAutoTestResults, liqGrabAutoTestSortBy]);

  // Determine which indicators are currently active
  const activeIndicators = useMemo(() => {
    const active = new Set<string>();
    
    // SMC indicators
    if (showBOS || showCHoCH || showFVG || stratLiquidityGrab || showSwingPivots) {
      active.add('smc');
    }
    
    // VWAP indicators
    if (showVWAPDaily || showVWAPWeekly || showVWAPMonthly || showVWAPRolling) {
      active.add('vwap');
    }
    
    // Trendlines
    if (showAutoTrendlines) {
      active.add('trendlines');
    }
    
    // Oscillators
    if (showRSI) active.add('rsi');
    if (showMACD) active.add('macd');
    if (showMFI) active.add('mfi');
    if (showOBV) active.add('obv');
    
    // Bollinger Bands
    if (showBB) active.add('bollinger');
    
    // CVD is always active for orderflow
    if (cvdSpikeEnabled) active.add('cvd');
    
    return active;
  }, [showBOS, showCHoCH, showFVG, stratLiquidityGrab, showSwingPivots, showVWAPDaily, showVWAPWeekly, showVWAPMonthly, showVWAPRolling, showAutoTrendlines, showRSI, showMACD, showMFI, showOBV, showBB, cvdSpikeEnabled]);

  // Filter market alerts based on alertFilterMode and active indicators
  const filteredMarketAlerts = useMemo(() => {
    if (alertFilterMode === 'all') {
      return marketAlerts;
    }
    
    // Filter to only show alerts from active indicators
    return marketAlerts.filter(alert => {
      const indicatorKey = alertTypeToIndicator[alert.type];
      
      // Safety fallback: If alert type not in mapping, show it by default and log warning
      if (!indicatorKey) {
        console.warn(`⚠️ Unmapped alert type in filter: "${alert.type}". Showing alert by default. Please add to alertTypeToIndicator mapping.`);
        return true;
      }
      
      // If alert can come from multiple indicators (array), show if ANY are active
      if (Array.isArray(indicatorKey)) {
        return indicatorKey.some(key => activeIndicators.has(key));
      }
      
      // Single indicator - check if it's active
      return activeIndicators.has(indicatorKey);
    });
  }, [marketAlerts, alertFilterMode, activeIndicators, alertTypeToIndicator]);

  // Run backtest on historical data
  // NEW: Only allow 1 trade at a time - no overlapping trades
  const runBacktest = useCallback(async () => {
    if (candles.length < 100) {
      alert('Need at least 100 candles for backtest');
      return;
    }
    
    setBacktesting(true);
    
    // Process candles sequentially and generate signals
    const allSignals: TradeSignal[] = [];
    const completedTrades: BacktestTrade[] = [];
    let lastTradeExitTime = 0; // Track when last trade closed
    
    // Process in chunks to avoid freezing the UI
    const chunkSize = 50;
    const totalCandles = candles.length - 10;
    
    // Use first 50 candles for initialization, then start generating signals
    for (let i = 50; i < totalCandles; i += chunkSize) {
      // Process chunk
      const chunkEnd = Math.min(i + chunkSize, totalCandles);
      
      for (let j = i; j < chunkEnd; j++) {
        const currentTime = candles[j].time;
        
        // Skip if we have an open trade (current time is before last trade exit)
        if (currentTime < lastTradeExitTime) {
          continue;
        }
        
        const dataSlice = candles.slice(0, j + 1);
        
        // Try to generate signals at this point in time (only if no trade is open)
        // Pass current state values as override to ensure manual backtest matches auto-backtest behavior
        const liqSignal = generateLiquidityGrabSignal(dataSlice, true, {
          swingLength: liqGrabSwingLength,
          trendFilter: liqGrabTrendFilter,
          directionFilter: liqGrabDirectionFilter,
          tpslConfig: liqGrabTPSL
        });
        if (liqSignal && !allSignals.some(s => s.id === liqSignal.id)) {
          console.log('💰 Liquidity Grab trade signal at', new Date(candles[j].time * 1000).toLocaleString(), {
            type: liqSignal.type,
            entry: liqSignal.entry?.toFixed(4) || 'N/A',
            stopLoss: liqSignal.stopLoss?.toFixed(4) || 'N/A',
            reason: liqSignal.reason
          });
          allSignals.push(liqSignal);
          const trade = simulateTrade(liqSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const chochSignal = generateChochFVGSignal(dataSlice);
        if (chochSignal && !allSignals.some(s => s.id === chochSignal.id)) {
          allSignals.push(chochSignal);
          const trade = simulateTrade(chochSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const vwapSignal = generateVWAPTradingSignal(dataSlice);
        if (vwapSignal && !allSignals.some(s => s.id === vwapSignal.id)) {
          allSignals.push(vwapSignal);
          const trade = simulateTrade(vwapSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const emaSignal = generateEMATradingSignal(dataSlice);
        if (emaSignal && !allSignals.some(s => s.id === emaSignal.id)) {
          allSignals.push(emaSignal);
          const trade = simulateTrade(emaSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const rsFlipSignal = generateRSFlipSignal(dataSlice);
        if (rsFlipSignal && !allSignals.some(s => s.id === rsFlipSignal.id)) {
          allSignals.push(rsFlipSignal);
          const trade = simulateTrade(rsFlipSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const bosTrendSignal = generateBOSTrendSignal(dataSlice);
        if (bosTrendSignal && !allSignals.some(s => s.id === bosTrendSignal.id)) {
          allSignals.push(bosTrendSignal);
          const trade = simulateTrade(bosTrendSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            // No continue needed - this is the last strategy
          }
        }
      }
      
      // Yield to browser to prevent freezing
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // Calculate statistics
    const winners = completedTrades.filter(t => t.winner);
    const losers = completedTrades.filter(t => !t.winner);
    const totalPL = completedTrades.reduce((sum, t) => sum + t.profitLoss, 0);
    const grossWins = winners.reduce((sum, t) => sum + Math.abs(t.profitLoss), 0);
    const grossLosses = Math.abs(losers.reduce((sum, t) => sum + t.profitLoss, 0));
    const avgRR = completedTrades.length > 0 
      ? completedTrades.reduce((sum, t) => sum + t.rr, 0) / completedTrades.length 
      : 0;
    
    // Calculate position sizing metrics
    const avgPositionSize = completedTrades.length > 0
      ? allSignals.reduce((sum, s) => sum + s.quantity, 0) / allSignals.length
      : 0;
    const finalBalance = accountSize + totalPL;
    const returnPercent = (totalPL / accountSize) * 100;
    
    const results: BacktestResults = {
      trades: completedTrades,
      totalTrades: completedTrades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: completedTrades.length > 0 ? (winners.length / completedTrades.length) * 100 : 0,
      avgRR,
      totalPL,
      profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0,
      accountSize,
      riskPerTrade: riskPercent,
      avgPositionSize,
      finalBalance,
      returnPercent,
    };
    
    // Analyze sweep detection vs trade execution (only for Liquidity Grab strategy)
    if (stratLiquidityGrab) {
      const { bos, choch } = calculateBOSandCHoCH(candles, liqGrabSwingLength);
      const allSweeps = [...bos, ...choch].filter(e => e.isLiquidityGrab);
      const liqGrabTrades = completedTrades.filter(t => t.strategy === 'liquidity_grab');
      
      console.log('📊 LIQUIDITY GRAB BACKTEST SUMMARY:', {
        totalSweepsDetected: allSweeps.length,
        tradesTaken: liqGrabTrades.length,
        sweepsNotTraded: allSweeps.length - liqGrabTrades.length,
        settings: {
          swingLength: liqGrabSwingLength,
          trendFilter: liqGrabTrendFilter,
          directionFilter: liqGrabDirectionFilter,
          numTPs: liqGrabTPSL.numTPs
        }
      });
      
      // Log why sweeps were not traded
      const tradedSweepTimes = new Set(liqGrabTrades.map(t => t.entryTime));
      const untradedSweeps = allSweeps.filter(sweep => !tradedSweepTimes.has(sweep.breakTime));
      
      if (untradedSweeps.length > 0) {
        console.log(`⏭️ ${untradedSweeps.length} sweeps were NOT traded:`, 
          untradedSweeps.map(s => ({
            time: new Date(s.breakTime * 1000).toLocaleString(),
            price: s.swingPrice.toFixed(4),
            type: s.sweptLevel === 'low' ? 'LONG (swept low)' : 'SHORT (swept high)',
            reason: 'Likely filtered by trend/direction or overlapping trade'
          }))
        );
      }
    }
    
    console.log('🎯 Backtest complete:', {
      totalTrades: completedTrades.length,
      signals: allSignals.length,
      winners: winners.length,
      losers: losers.length,
      totalPL: totalPL.toFixed(2)
    });
    
    setBacktestResults(results);
    setBacktesting(false);
  }, [candles, generateLiquidityGrabSignal, generateChochFVGSignal, generateVWAPTradingSignal, generateEMATradingSignal, generateRSFlipSignal, generateBOSTrendSignal, simulateTrade, accountSize, riskPercent, liqGrabSwingLength, liqGrabTrendFilter, liqGrabDirectionFilter, stratLiquidityGrab, calculateBOSandCHoCH, liqGrabTPSL]);

  // Fix chart when navigating back to page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && chartRef.current && chartContainerRef.current) {
        setTimeout(() => {
          if (chartRef.current && chartContainerRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
              height: 600,
            });
            chartRef.current.timeScale().fitContent();
          }
        }, 100);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Initialize chart
  useEffect(() => {
    if (candles.length === 0 || loading) {
      console.log('Chart init skipped - candles:', candles.length, 'loading:', loading);
      return;
    }
    
    // Prevent recreation if chart already exists
    if (chartRef.current) {
      console.log('Chart already exists, skipping recreation');
      return;
    }
    
    // Use setTimeout to ensure DOM is fully rendered
    const timer = setTimeout(() => {
      if (!chartContainerRef.current) {
        console.log('Chart container ref not available');
        return;
      }
      
      // Double check chart doesn't exist
      if (chartRef.current) {
        console.log('Chart created during timeout, skipping');
        return;
      }
      
      const container = chartContainerRef.current;
      const containerWidth = container.clientWidth > 0 ? container.clientWidth : 800;
      
      console.log('Creating chart - width:', containerWidth, 'candles:', candles.length);
      
      const chart = createChart(container, {
        width: containerWidth,
        height: 600,
        layout: {
          background: { type: ColorType.Solid, color: '#0f172a' },
          textColor: '#d1d5db',
        },
        grid: {
          vertLines: { color: '#1e293b' },
          horzLines: { color: '#1e293b' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderVisible: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
          autoScale: true,
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderVisible: true,
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        priceFormat: {
          type: 'price',
          precision: 6,
          minMove: 0.000001,
        },
      });

      // Append future whitespace bars to allow drawing on future dates
      const lastCandle = candles[candles.length - 1];
      const futureCount = getFutureBarCount(interval);
      const futureBars = lastCandle ? generateFutureWhitespace(lastCandle.time, interval, futureCount) : [];
      const chartData = [...candles, ...futureBars];
      
      candleSeries.setData(chartData as any);
      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

      // Fit content then add right-side bar spacing for future drawing area
      chart.timeScale().fitContent();
      // Add significant whitespace on the right to show future area (half chart at zoom out)
      chart.timeScale().applyOptions({
        rightOffset: 150, // Show ~half the chart as future whitespace
      });
      console.log('Chart created successfully with', futureCount, 'future bars');
      setChartReady(true);
      
      // Subscribe to visible range changes to update candle count
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) {
          const count = Math.round(range.to - range.from) + 1;
          setVisibleCandleCount(count);
        }
      });
      
      // Set initial visible candle count
      const initialRange = chart.timeScale().getVisibleLogicalRange();
      if (initialRange) {
        setVisibleCandleCount(Math.round(initialRange.to - initialRange.from) + 1);
      }

      // Add crosshair move handler to track time in future whitespace area (for UI display)
      chart.subscribeCrosshairMove((param) => {
        if (param.time && param.point) {
          const time = param.time as number;
          const price = candleSeries.coordinateToPrice(param.point.y);
          
          setCrosshairInfo({
            time,
            x: param.point.x,
            y: param.point.y
          });
          
          // Store crosshair position for UI display
          lastCrosshairParamRef.current = {
            time,
            price: price !== null ? price : 0,
            pointX: param.point.x,
            logicalX: undefined
          };
        } else {
          setCrosshairInfo(null);
        }
      });
    }, 100);

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      
      if (chartRef.current) {
        setChartReady(false);
        // Clear all series refs before removing chart
        vwapSeriesRefs.current = {};
        fvgSeriesRefs.current = [];
        bosSeriesRefs.current = [];
        chochSeriesRefs.current = [];
        tradeMarkerRefs.current = [];
        emaSeriesRefs.current = {};
        smaSeriesRefs.current = {};
        bbSeriesRefs.current = { upper: undefined, middle: undefined, lower: undefined };
        supertrendSeriesRef.current = null;
        parabolicSARRef.current = null;
        orderBlocksRefs.current = [];
        swingPivotSeriesRefs.current = [];
        liquiditySweepSeriesRefs.current = [];
        trendlineSeriesRefs.current = [];
        sessionVWAPAsiaRef.current = null;
        sessionVWAPLondonRef.current = null;
        sessionVWAPNYRef.current = null;
        vwapBandsUpperRef.current = null;
        vwapBandsLowerRef.current = null;
        orderFlowSeriesRef.current = null;
        cumDeltaSeriesRef.current = null;
        premiumDiscountRefs.current = { equilibrium: null, premium: null, discount: null };
        seriesMarkersRef.current = null;
        
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
      }
    };
  }, [candles.length, loading, symbol, interval]);
  
  // Attach gesture controller to chart when ready
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const container = chartContainerRef.current;
    
    console.log('[GestureAttach] Effect running:', { chart: !!chart, candleSeries: !!candleSeries, container: !!container, chartReady });
    
    if (!chart || !candleSeries || !container || !chartReady) return;
    
    console.log('[GestureAttach] Calling attachToChart...');
    // Attach the gesture controller to handle touch/click for drawing tools
    gestureController.attachToChart(chart, candleSeries, container);
    console.log('[GestureAttach] attachToChart complete');
    
    return () => {
      console.log('[GestureAttach] Cleanup: detaching');
      gestureController.detachFromChart();
    };
  }, [chartReady, gestureController]);
  
  // Render drawings on chart using price lines
  const drawingLinesRef = useRef<any[]>([]);
  
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries || !chartReady) return;
    
    // Clear existing drawing lines
    drawingLinesRef.current.forEach(line => {
      try { candleSeries.removePriceLine(line); } catch (e) { /* ignore */ }
    });
    drawingLinesRef.current = [];
    
    // Render each drawing
    drawings.forEach(drawing => {
      if (drawing.type === 'horizontal' && drawing.points.length >= 1) {
        // Skip rendering price line if this drawing's point is being edited
        if (activeEdit && activeEdit.drawingId === drawing.id) {
          return; // Don't create price line while editing
        }
        // Use custom label if set, otherwise default to "H-Line"
        const customLabel = drawing.style?.label || 'H-Line';
        // Add alarm icon if alert is active
        const alertPrefix = drawing.style?.alertActive ? '🔔 ' : '';
        const triggeredPrefix = drawing.style?.alertTriggered ? '✅ ' : '';
        const editPrefix = drawing.id === selectedDrawingId ? '✎ ' : '';
        // Only show label if showLabel is not explicitly false
        const showLabel = drawing.style?.showLabel !== false;
        const displayLabel = showLabel ? `${alertPrefix}${triggeredPrefix}${editPrefix}${customLabel}` : '';
        const line = candleSeries.createPriceLine({
          price: drawing.points[0].price,
          color: drawing.style?.color || '#3b82f6',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: displayLabel,
        });
        if (line) drawingLinesRef.current.push(line);
      }
      // For trendlines and other drawings, we'll use the overlay canvas later
    });
  }, [drawings, chartReady, selectedDrawingId, activeEdit]);

  // Update VWAPs
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;

    const chart = chartRef.current;
    
    // Extra safety check - ensure chart hasn't been disposed
    try {
      chart.timeScale();
    } catch (e) {
      return; // Chart is disposed, skip this update
    }
    
    const refs = vwapSeriesRefs.current;

    // Helper to manage VWAP series
    const manageVWAP = (
      key: keyof typeof refs,
      show: boolean,
      data: VWAPData[],
      color: string,
      title: string
    ) => {
      if (show && data.length > 0) {
        if (!refs[key]) {
          try {
            refs[key] = chart.addSeries(LineSeries, {
              color,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              title,
            });
          } catch (e) {
            // Chart might be disposed
            return;
          }
        }
        try {
          refs[key]!.setData(data as any);
          // Update title in case period changed
          refs[key]!.applyOptions({ title });
        } catch (e) {
          // Series might be disposed
        }
      } else if (!show && refs[key]) {
        try {
          chart.removeSeries(refs[key]!);
        } catch (e) {
          // Series might already be disposed
        }
        delete refs[key];
      }
    };

    manageVWAP('session', showVWAPSession, calculatePeriodicVWAP(candles, 'daily', true), '#a78bfa', 'Session VWAP');
    manageVWAP('daily', showVWAPDaily, calculatePeriodicVWAP(candles, 'daily', true), '#fb923c', 'Daily VWAP');
    manageVWAP('weekly', showVWAPWeekly, calculatePeriodicVWAP(candles, 'weekly', true), '#10b981', 'Weekly VWAP');
    manageVWAP('monthly', showVWAPMonthly, calculatePeriodicVWAP(candles, 'monthly', true), '#3b82f6', 'Monthly VWAP');
    const rollingKey = vwapRollingPeriod === 10 ? 'rolling10' : vwapRollingPeriod === 50 ? 'rolling50' : 'rolling20';
    manageVWAP(rollingKey, showVWAPRolling, calculateRollingVWAP(candles, vwapRollingPeriod), '#ec4899', `rVWAP(${vwapRollingPeriod})`);
  }, [chartReady, candles, showVWAPSession, showVWAPDaily, showVWAPWeekly, showVWAPMonthly, showVWAPRolling, vwapRollingPeriod, calculatePeriodicVWAP, calculateRollingVWAP]);

  // Update FVGs with shaded rectangles
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) {
      return;
    }

    const chart = chartRef.current;
    
    // Extra safety check - ensure chart hasn't been disposed
    try {
      chart.timeScale();
    } catch (e) {
      return; // Chart is disposed, skip this update
    }
    
    const refs = fvgSeriesRefs.current;

    // Remove old FVG series
    if (Array.isArray(refs) && refs.length > 0) {
      refs.forEach(fl => {
        try {
          if (chart && fl.upper) chart.removeSeries(fl.upper);
        } catch (e) {
          // Series might already be removed
        }
        try {
          if (chart && fl.lower) chart.removeSeries(fl.lower);
        } catch (e) {
          // Series might already be removed
        }
        try {
          if (chart && fl.fill) chart.removeSeries(fl.fill);
        } catch (e) {
          // Series might already be removed
        }
      });
    }
    fvgSeriesRefs.current = [];
    
    if (!showFVG) return;

    // Extract FVG times from active CHoCH+FVG trade signals AND backtest trades
    const activeTradeFVGTimes = new Set<number>();
    
    // Add FVG times from live trade signals
    tradeSignals
      .filter(signal => signal.strategy === 'choch_fvg' && signal.active)
      .forEach(signal => {
        // Signal ID format: choch_fvg_${chochTime}_${fvgTime}
        const parts = signal.id.split('_');
        if (parts.length >= 4) {
          const fvgTime = parseInt(parts[3]);
          if (!isNaN(fvgTime)) {
            activeTradeFVGTimes.add(fvgTime);
          }
        }
      });
    
    // Add FVG times from backtest trades (for replay mode visibility)
    if (backtestResults && backtestResults.trades.length > 0) {
      backtestResults.trades
        .filter(trade => trade.strategy === 'choch_fvg')
        .forEach(trade => {
          // Trade ID format: choch_fvg_${chochTime}_${fvgTime}
          const parts = trade.id.split('_');
          if (parts.length >= 4) {
            const fvgTime = parseInt(parts[3]);
            if (!isNaN(fvgTime)) {
              activeTradeFVGTimes.add(fvgTime);
            }
          }
        });
    }

    const fvgs = calculateFVGs(candles, true);
    const lastTime = candles[candles.length - 1].time;

    fvgs.forEach(fvg => {
      const hasActiveTrade = activeTradeFVGTimes.has(fvg.time);
      
      // Only show FVG if it has an active trade OR if it's still valid (not filled)
      const shouldShow = hasActiveTrade || isActiveFVG(fvg, candles);
      
      if (shouldShow) {
        // Skip non-high-value FVGs if filter is enabled (but always show traded FVGs)
        if (!hasActiveTrade && showHighValueOnly && !fvg.isHighValue) {
          return;
        }

        // Use YELLOW for FVGs with active trades, normal colors otherwise
        let color: string;
        let borderColor: string;
        
        if (hasActiveTrade) {
          // Yellow for active trade FVGs
          color = 'rgba(234, 179, 8, 0.3)'; // Yellow with transparency
          borderColor = '#eab308'; // Solid yellow
        } else {
          // Normal colors based on type and value
          const isHighValue = fvg.isHighValue;
          color = fvg.type === 'bullish' 
            ? (isHighValue ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.12)')
            : (isHighValue ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.12)');
          borderColor = fvg.type === 'bullish' 
            ? (isHighValue ? '#10b981' : '#10b98180')
            : (isHighValue ? '#ef4444' : '#ef444480');
        }
        
        // Find all candles from FVG time to fill time (or current time if not filled)
        const fvgIdx = candles.findIndex(c => c.time === fvg.time);
        const fillTime = getFVGFillTime(fvg, candles);
        const endTime = fillTime || lastTime;
        const endIdx = candles.findIndex(c => c.time === endTime);
        const candlesInRange = candles.slice(fvgIdx, endIdx + 1);
        
        // Create histogram series to fill the gap area
        const fillSeries = chart.addSeries(HistogramSeries, {
          color,
          priceFormat: {
            type: 'price',
          },
          priceLineVisible: false,
          lastValueVisible: false,
          base: fvg.lower,
        });
        
        // Create border lines
        const lowerBorder = chart.addSeries(LineSeries, {
          color: borderColor,
          lineWidth: 2, // Thicker borders for better visibility
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        const upperBorder = chart.addSeries(LineSeries, {
          color: borderColor,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        // Fill the gap with histogram bars for each time point
        const gapHeight = fvg.upper - fvg.lower;
        const histogramData = candlesInRange.map(c => ({
          time: c.time as any,
          value: fvg.upper, // Draw from base (fvg.lower) to fvg.upper
          color
        }));
        
        try {
          fillSeries.setData(histogramData);
          
          // Add border lines (stop at fill time if filled)
          lowerBorder.setData([
            { time: fvg.time as any, value: fvg.lower },
            { time: endTime as any, value: fvg.lower },
          ]);
          upperBorder.setData([
            { time: fvg.time as any, value: fvg.upper },
            { time: endTime as any, value: fvg.upper },
          ]);
          
          fvgSeriesRefs.current.push({ upper: upperBorder, lower: lowerBorder, fill: fillSeries, fvg });
        } catch (e) {
          // Series might be disposed
        }
      }
    });
  }, [chartReady, candles, showFVG, showHighValueOnly, calculateFVGs, isActiveFVG, getFVGFillTime, tradeSignals, backtestResults]);

  // Clear HTF caches and load saved timeframe when symbol changes
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      emaHTFDataCache.current = {};
      smaHTFDataCache.current = {};
      prevSymbolRef.current = symbol;
      
      // Load saved default timeframe for the new symbol
      const savedTimeframe = localStorage.getItem(`defaultTimeframe_${symbol}`);
      if (savedTimeframe) {
        setTimeframeInterval(savedTimeframe);
        console.log(`📂 Loaded saved timeframe for ${symbol}: ${savedTimeframe}`);
      }
    }
  }, [symbol]);

  // Fetch higher timeframe data for EMA calculations
  useEffect(() => {
    const fetchHTFData = async () => {
      const htfTimeframes = emaConfigs
        .filter(c => c.timeframe !== 'current' && c.timeframe !== interval)
        .map(c => c.timeframe);
      
      const uniqueTimeframes = [...new Set(htfTimeframes)];
      
      for (const tf of uniqueTimeframes) {
        const cacheKey = `${symbol}_${tf}`;
        if (emaHTFDataCache.current[cacheKey]) continue; // Already cached
        
        try {
          const response = await fetch(`/api/binance/klines?symbol=${symbol}&interval=${tf}&limit=500`);
          if (response.ok) {
            const data = await response.json();
            emaHTFDataCache.current[cacheKey] = data.map((k: any) => ({
              time: Math.floor(k[0] / 1000),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5])
            }));
          }
        } catch (e) {
          console.error(`Failed to fetch ${tf} data for EMA:`, e);
        }
      }
    };
    
    if (showEMA && symbol) {
      fetchHTFData();
    }
  }, [showEMA, emaConfigs, symbol, interval]);

  // Update EMAs on chart
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;

    const chart = chartRef.current;
    const refs = emaSeriesRefs.current;

    // Remove old EMA series that are no longer in configs
    const currentIds = new Set(emaConfigs.map(c => c.id));
    Object.keys(refs).forEach(key => {
      if (!currentIds.has(key) && refs[key]) {
        try { chart.removeSeries(refs[key]!); } catch (e) {}
        delete refs[key];
      }
    });

    if (!showEMA) {
      // Remove all EMA series when disabled
      Object.keys(refs).forEach(key => {
        if (refs[key]) {
          try { chart.removeSeries(refs[key]!); } catch (e) {}
          delete refs[key];
        }
      });
      return;
    }

    // Render each EMA config
    for (const config of emaConfigs) {
      let emaData: { time: any; value: number }[] = [];
      
      // Determine which data source to use
      const isCurrentTimeframe = config.timeframe === 'current' || config.timeframe === interval;
      
      if (isCurrentTimeframe) {
        // Use current chart candles
        const closes = candles.map(c => c.close);
        const emaValues = calculateEMA(closes, config.period);
        emaData = candles.map((c, i) => ({
          time: c.time as any,
          value: emaValues[i]
        })).filter(d => d.value !== undefined);
      } else {
        // Use higher timeframe data and map to current chart
        const cacheKey = `${symbol}_${config.timeframe}`;
        const htfCandles = emaHTFDataCache.current[cacheKey];
        
        if (htfCandles && htfCandles.length > 0) {
          const htfCloses = htfCandles.map(c => c.close);
          const htfEmaValues = calculateEMA(htfCloses, config.period);
          
          // Map higher TF EMA values to current chart timeframe
          // Each HTF candle's EMA value applies to all current TF candles within its time range
          const htfEmaMap: { time: number; value: number }[] = htfCandles.map((c, i) => ({
            time: c.time,
            value: htfEmaValues[i]
          })).filter(d => d.value !== undefined);
          
          // For each current candle, find the corresponding HTF EMA value
          emaData = candles.map(c => {
            // Find the most recent HTF EMA value that's <= current candle time
            let htfValue: number | undefined;
            for (let i = htfEmaMap.length - 1; i >= 0; i--) {
              if (htfEmaMap[i].time <= c.time) {
                htfValue = htfEmaMap[i].value;
                break;
              }
            }
            return {
              time: c.time as any,
              value: htfValue!
            };
          }).filter(d => d.value !== undefined);
        }
      }

      // Format label: 21, 100D, 21W, 100h4, etc.
      const label = formatMALabel(config.period, config.timeframe);

      if (!refs[config.id]) {
        try {
          refs[config.id] = chart.addSeries(LineSeries, {
            color: config.color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: label,
          });
        } catch (e) { continue; }
      } else {
        // Update title if config changed
        try {
          refs[config.id]!.applyOptions({ title: label });
        } catch (e) {}
      }
      
      if (emaData.length > 0) {
        try {
          refs[config.id]!.setData(emaData);
        } catch (e) {}
      }
    }
  }, [chartReady, candles, showEMA, emaConfigs, calculateEMA, symbol, interval]);

  // Manage Bollinger Bands on main chart
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;

    const chart = chartRef.current;
    const refs = bbSeriesRefs.current;

    // Helper to manage BB lines
    const manageBBLine = (
      key: 'upper' | 'middle' | 'lower',
      show: boolean,
      data: { time: number; value: number }[],
      color: string,
      lineStyle: number = 0,
      lineWidth: LineWidth = 2 as LineWidth
    ) => {
      if (show) {
        if (!refs[key]) {
          try {
            refs[key] = chart.addSeries(LineSeries, {
              color,
              lineWidth,
              lineStyle,
              priceLineVisible: false,
              lastValueVisible: false,
            });
          } catch (e) {
            return;
          }
        }
        try {
          refs[key]!.setData(data as any);
        } catch (e) {
          // Series might be disposed
        }
      } else if (!show && refs[key]) {
        try {
          chart.removeSeries(refs[key]!);
        } catch (e) {
          // Series might already be disposed
        }
        refs[key] = undefined;
      }
    };

    const bbData = calculateBollingerBands(candles, bbPeriod, bbStdDev);
    manageBBLine('upper', showBB, bbData.upper, '#9333ea', 0, 1 as LineWidth);
    manageBBLine('middle', showBB, bbData.middle, '#9333ea', 2, 1 as LineWidth);
    manageBBLine('lower', showBB, bbData.lower, '#9333ea', 0, 1 as LineWidth);
  }, [chartReady, candles, showBB, bbPeriod, bbStdDev, calculateBollingerBands]);

  // ========== BATCH 1 INDICATORS ==========
  
  // Supertrend Indicator
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    
    if (showSupertrend) {
      const supertrendData = calculateSupertrend(candles, supertrendPeriod, supertrendMultiplier);
      
      if (supertrendData.length > 0) {
        if (!supertrendSeriesRef.current) {
          try {
            supertrendSeriesRef.current = chart.addSeries(LineSeries, {
              lineWidth: 3,
              priceLineVisible: false,
              lastValueVisible: true,
              title: 'Supertrend',
            });
          } catch (e) {
            return;
          }
        }
        
        const chartData = supertrendData.map(st => ({
          time: st.time as any,
          value: st.supertrend,
          color: st.direction === 'bullish' ? '#10b981' : '#ef4444'
        }));
        
        try {
          supertrendSeriesRef.current.setData(chartData);
        } catch (e) {}
      }
    } else if (!showSupertrend && supertrendSeriesRef.current) {
      try {
        chart.removeSeries(supertrendSeriesRef.current);
      } catch (e) {}
      supertrendSeriesRef.current = null;
    }
  }, [chartReady, candles, showSupertrend, supertrendPeriod, supertrendMultiplier]);
  
  // VWAP Bands
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    
    if (showVWAPBands) {
      const bandsData = calculateVWAPBands(candles, vwapBandsStdDev);
      
      if (bandsData.length > 0) {
        if (!vwapBandsUpperRef.current) {
          try {
            vwapBandsUpperRef.current = chart.addSeries(LineSeries, {
              color: '#3b82f6',
              lineWidth: 1,
              lineStyle: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              title: 'VWAP Upper',
            });
          } catch (e) {
            return;
          }
        }
        
        if (!vwapBandsLowerRef.current) {
          try {
            vwapBandsLowerRef.current = chart.addSeries(LineSeries, {
              color: '#3b82f6',
              lineWidth: 1,
              lineStyle: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              title: 'VWAP Lower',
            });
          } catch (e) {
            return;
          }
        }
        
        const upperData = bandsData.map(b => ({ time: b.time as any, value: b.upper }));
        const lowerData = bandsData.map(b => ({ time: b.time as any, value: b.lower }));
        
        try {
          vwapBandsUpperRef.current.setData(upperData);
          vwapBandsLowerRef.current.setData(lowerData);
        } catch (e) {}
      }
    } else if (!showVWAPBands) {
      if (vwapBandsUpperRef.current) {
        try {
          chart.removeSeries(vwapBandsUpperRef.current);
        } catch (e) {}
        vwapBandsUpperRef.current = null;
      }
      if (vwapBandsLowerRef.current) {
        try {
          chart.removeSeries(vwapBandsLowerRef.current);
        } catch (e) {}
        vwapBandsLowerRef.current = null;
      }
    }
  }, [chartReady, candles, showVWAPBands, vwapBandsStdDev]);
  
  // Session VWAP
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    
    if (showSessionVWAP) {
      const sessionData = calculateSessionVWAP(candles);
      
      if (sessionData.asia.length > 0 && !sessionVWAPAsiaRef.current) {
        try {
          sessionVWAPAsiaRef.current = chart.addSeries(LineSeries, {
            color: '#f59e0b',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'Asia VWAP',
          });
          const data = sessionData.asia.map(d => ({ time: d.time as any, value: d.value }));
          sessionVWAPAsiaRef.current.setData(data);
        } catch (e) {}
      }
      
      if (sessionData.london.length > 0 && !sessionVWAPLondonRef.current) {
        try {
          sessionVWAPLondonRef.current = chart.addSeries(LineSeries, {
            color: '#3b82f6',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'London VWAP',
          });
          const data = sessionData.london.map(d => ({ time: d.time as any, value: d.value }));
          sessionVWAPLondonRef.current.setData(data);
        } catch (e) {}
      }
      
      if (sessionData.ny.length > 0 && !sessionVWAPNYRef.current) {
        try {
          sessionVWAPNYRef.current = chart.addSeries(LineSeries, {
            color: '#10b981',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'NY VWAP',
          });
          const data = sessionData.ny.map(d => ({ time: d.time as any, value: d.value }));
          sessionVWAPNYRef.current.setData(data);
        } catch (e) {}
      }
    } else if (!showSessionVWAP) {
      [sessionVWAPAsiaRef, sessionVWAPLondonRef, sessionVWAPNYRef].forEach(ref => {
        if (ref.current) {
          try {
            chart.removeSeries(ref.current);
          } catch (e) {}
          ref.current = null;
        }
      });
    }
  }, [chartReady, candles, showSessionVWAP]);
  
  // Order Blocks (SMC) - Rendered as boxes like FVG
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    
    // Clear previous order blocks
    orderBlocksRefs.current.forEach(ob => {
      try {
        if (ob.upper) chart.removeSeries(ob.upper);
        if (ob.lower) chart.removeSeries(ob.lower);
        if (ob.fill) chart.removeSeries(ob.fill);
      } catch (e) {}
    });
    orderBlocksRefs.current = [];
    
    if (showOrderBlocks) {
      const orderBlocks = calculateOrderBlocks(candles, obSwingLength, orderBlockLength);
      const lastTime = candles[candles.length - 1].time;
      
      // Render each order block as a shaded box like FVG
      // Show fresh blocks with full opacity, mitigated with reduced opacity
      for (const ob of orderBlocks.slice(-20)) { // Show last 20 blocks
        try {
          // Fresh blocks have higher opacity, mitigated blocks have lower
          const opacity = ob.mitigated ? 0.1 : 0.25;
          const borderOpacity = ob.mitigated ? 0.4 : 1;
          const color = ob.type === 'bullish' 
            ? `rgba(16, 185, 129, ${opacity})` 
            : `rgba(239, 68, 68, ${opacity})`;
          const borderColor = ob.type === 'bullish' 
            ? `rgba(16, 185, 129, ${borderOpacity})` 
            : `rgba(239, 68, 68, ${borderOpacity})`;
          
          // Find candles from OB time to current time
          const obIdx = candles.findIndex(c => c.time === ob.time);
          const candlesInRange = candles.slice(obIdx);
          
          // Create histogram series to fill the block area
          const fillSeries = chart.addSeries(HistogramSeries, {
            color,
            priceFormat: {
              type: 'price',
            },
            priceLineVisible: false,
            lastValueVisible: false,
            base: ob.low,
          });
          
          // Create border lines
          const lowerBorder = chart.addSeries(LineSeries, {
            color: borderColor,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          
          const upperBorder = chart.addSeries(LineSeries, {
            color: borderColor,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          
          // Fill the block with histogram bars
          const histogramData = candlesInRange.map(c => ({
            time: c.time as any,
            value: ob.high,
            color
          }));
          
          // Create border data extending to current time
          const borderData = [
            { time: ob.time as any, value: 0 },
            { time: lastTime as any, value: 0 },
          ];
          
          const lowerData = borderData.map(d => ({ ...d, value: ob.low }));
          const upperData = borderData.map(d => ({ ...d, value: ob.high }));
          
          fillSeries.setData(histogramData);
          lowerBorder.setData(lowerData);
          upperBorder.setData(upperData);
          
          orderBlocksRefs.current.push({ upper: upperBorder, lower: lowerBorder, fill: fillSeries });
        } catch (e) {}
      }
    }
  }, [chartReady, candles, showOrderBlocks, obSwingLength, orderBlockLength]);
  
  // Premium/Discount Zones (SMC)
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    const refs = premiumDiscountRefs.current;
    
    if (showPremiumDiscount) {
      const pdData = calculatePremiumDiscount(candles, pdLookback);
      
      if (pdData.length > 0) {
        // Equilibrium line
        if (!refs.equilibrium) {
          try {
            refs.equilibrium = chart.addSeries(LineSeries, {
              color: '#a855f7',
              lineWidth: 2,
              lineStyle: 0,
              priceLineVisible: false,
              lastValueVisible: true,
              title: 'Equilibrium',
            });
          } catch (e) {
            return;
          }
        }
        
        // Premium line
        if (!refs.premium) {
          try {
            refs.premium = chart.addSeries(LineSeries, {
              color: '#ef4444',
              lineWidth: 1,
              lineStyle: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              title: 'Premium',
            });
          } catch (e) {
            return;
          }
        }
        
        // Discount line
        if (!refs.discount) {
          try {
            refs.discount = chart.addSeries(LineSeries, {
              color: '#10b981',
              lineWidth: 1,
              lineStyle: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              title: 'Discount',
            });
          } catch (e) {
            return;
          }
        }
        
        // Set data
        const equilibriumData = pdData.map(d => ({ time: d.time as any, value: d.equilibrium }));
        const premiumData = pdData.map(d => ({ time: d.time as any, value: d.premium }));
        const discountData = pdData.map(d => ({ time: d.time as any, value: d.discount }));
        
        try {
          refs.equilibrium.setData(equilibriumData);
          refs.premium.setData(premiumData);
          refs.discount.setData(discountData);
        } catch (e) {}
      }
    } else {
      // Remove all lines
      if (refs.equilibrium) {
        try {
          chart.removeSeries(refs.equilibrium);
        } catch (e) {}
        refs.equilibrium = null;
      }
      if (refs.premium) {
        try {
          chart.removeSeries(refs.premium);
        } catch (e) {}
        refs.premium = null;
      }
      if (refs.discount) {
        try {
          chart.removeSeries(refs.discount);
        } catch (e) {}
        refs.discount = null;
      }
    }
  }, [chartReady, candles, showPremiumDiscount, pdLookback]);
  
  // ========== BATCH 3 INDICATORS ==========
  
  // Fetch higher timeframe data for SMA calculations
  useEffect(() => {
    const fetchHTFData = async () => {
      const htfTimeframes = smaConfigs
        .filter(c => c.timeframe !== 'current' && c.timeframe !== interval)
        .map(c => c.timeframe);
      
      const uniqueTimeframes = [...new Set(htfTimeframes)];
      
      for (const tf of uniqueTimeframes) {
        const cacheKey = `${symbol}_${tf}`;
        if (smaHTFDataCache.current[cacheKey]) continue;
        
        try {
          const response = await fetch(`/api/binance/klines?symbol=${symbol}&interval=${tf}&limit=500`);
          if (response.ok) {
            const data = await response.json();
            smaHTFDataCache.current[cacheKey] = data.map((k: any) => ({
              time: Math.floor(k[0] / 1000),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5])
            }));
          }
        } catch (e) {
          console.error(`Failed to fetch ${tf} data for SMA:`, e);
        }
      }
    };
    
    if (showSMA && symbol) {
      fetchHTFData();
    }
  }, [showSMA, smaConfigs, symbol, interval]);

  // SMA (Simple Moving Average) - Dynamic config list
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    const refs = smaSeriesRefs.current;

    // Remove old SMA series that are no longer in configs
    const currentIds = new Set(smaConfigs.map(c => c.id));
    Object.keys(refs).forEach(key => {
      if (!currentIds.has(key) && refs[key]) {
        try { chart.removeSeries(refs[key]!); } catch (e) {}
        delete refs[key];
      }
    });

    if (!showSMA) {
      // Remove all SMA series when disabled
      Object.keys(refs).forEach(key => {
        if (refs[key]) {
          try { chart.removeSeries(refs[key]!); } catch (e) {}
          delete refs[key];
        }
      });
      return;
    }

    // Render each SMA config
    for (const config of smaConfigs) {
      let smaData: { time: any; value: number }[] = [];
      
      const isCurrentTimeframe = config.timeframe === 'current' || config.timeframe === interval;
      
      if (isCurrentTimeframe) {
        const closes = candles.map(c => c.close);
        const smaValues = calculateSMA(closes, config.period);
        if (smaValues.length === 0) continue;
        
        smaData = smaValues.map((value, i) => ({
          time: candles[i + config.period - 1].time as any,
          value
        }));
      } else {
        // Use higher timeframe data
        const cacheKey = `${symbol}_${config.timeframe}`;
        const htfCandles = smaHTFDataCache.current[cacheKey];
        
        if (htfCandles && htfCandles.length > 0) {
          const htfCloses = htfCandles.map(c => c.close);
          const htfSmaValues = calculateSMA(htfCloses, config.period);
          
          // Map higher TF SMA values to current chart
          const htfSmaMap: { time: number; value: number }[] = htfSmaValues.map((value, i) => ({
            time: htfCandles[i + config.period - 1].time,
            value
          }));
          
          // For each current candle, find the corresponding HTF SMA value
          smaData = candles.map(c => {
            let htfValue: number | undefined;
            for (let i = htfSmaMap.length - 1; i >= 0; i--) {
              if (htfSmaMap[i].time <= c.time) {
                htfValue = htfSmaMap[i].value;
                break;
              }
            }
            return {
              time: c.time as any,
              value: htfValue!
            };
          }).filter(d => d.value !== undefined);
        }
      }

      if (smaData.length === 0) continue;

      // Format label: 21, 100D, 21W, 100h4, etc.
      const label = formatMALabel(config.period, config.timeframe);

      if (!refs[config.id]) {
        try {
          refs[config.id] = chart.addSeries(LineSeries, {
            color: config.color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: label,
          });
        } catch (e) { continue; }
      } else {
        try {
          refs[config.id]!.applyOptions({ title: label });
        } catch (e) {}
      }
      
      try {
        refs[config.id]!.setData(smaData);
      } catch (e) {}
    }
  }, [chartReady, candles, showSMA, smaConfigs, symbol, interval]);
  
  // Parabolic SAR
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    
    if (showParabolicSAR) {
      const sarData = calculateParabolicSAR(candles, sarStep, sarMax);
      
      if (sarData.length > 0 && !parabolicSARRef.current) {
        try {
          parabolicSARRef.current = chart.addSeries(LineSeries, {
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'Parabolic SAR',
          });
          
          const chartData = sarData.map(s => ({
            time: s.time as any,
            value: s.sar,
            color: s.isLong ? '#10b981' : '#ef4444'
          }));
          
          parabolicSARRef.current.setData(chartData);
        } catch (e) {}
      }
    } else if (!showParabolicSAR && parabolicSARRef.current) {
      try {
        chart.removeSeries(parabolicSARRef.current);
      } catch (e) {}
      parabolicSARRef.current = null;
    }
  }, [chartReady, candles, showParabolicSAR, sarStep, sarMax]);

  // Update BOS markers with horizontal lines
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) {
      return;
    }

    const chart = chartRef.current;
    
    // Extra safety check - ensure chart hasn't been disposed
    try {
      chart.timeScale();
    } catch (e) {
      return; // Chart is disposed, skip this update
    }

    // Remove old BOS lines with better error handling
    if (bosSeriesRefs.current.length > 0) {
      bosSeriesRefs.current.forEach(series => {
        try {
          if (series && chart) {
            chart.removeSeries(series);
          }
        } catch (e) {
          // Series already disposed, ignore
        }
      });
      bosSeriesRefs.current = [];
    }
    
    if (!showBOS) return;

    try {
      // Calculate both BOS and CHoCH to detect conflicts
      const { bos } = calculateBOSandCHoCH(candles, chartBosSwingLength);
      const { choch } = calculateBOSandCHoCH(candles, chartChochSwingLength);
      
      // Create a Set of CHoCH pivot points (CHoCH takes precedence)
      const chochPivots = new Set(
        choch.map(c => `${c.swingTime}_${c.swingPrice.toFixed(4)}`)
      );
      
      // Filter out BOS that conflict with CHoCH at the same pivot point
      const filteredBos = bos.filter(b => {
        const pivotKey = `${b.swingTime}_${b.swingPrice.toFixed(4)}`;
        return !chochPivots.has(pivotKey);
      });
      
      console.log(`🎯 Drawing ${filteredBos.length} BOS markers on chart (${bos.length - filteredBos.length} filtered due to CHoCH conflict)`);
      
      // Add horizontal line series for each BOS point
      filteredBos.forEach((bosPoint, idx) => {
        try {
          const color = bosPoint.type === 'bullish' ? '#10b981' : '#ef4444';
          
          // All BOS use solid lines
          const bosSeries = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            lineStyle: 0, // Solid lines for all BOS
            priceLineVisible: false,
            lastValueVisible: false,
          });
          
          // Draw horizontal line from swing to break
          const lineData = [
            { time: bosPoint.swingTime as any, value: bosPoint.swingPrice },
            { time: bosPoint.breakTime as any, value: bosPoint.swingPrice },
          ];
          
          if (idx === 0) {
            const swingDate = new Date(bosPoint.swingTime * 1000);
            const breakDate = new Date(bosPoint.breakTime * 1000);
            const candlesBetween = (bosPoint.breakTime - bosPoint.swingTime) / 900; // 900 seconds = 15 min
            console.log('🔍 First BOS line:', {
              swingTime: swingDate.toLocaleString(),
              breakTime: breakDate.toLocaleString(),
              candlesBetween,
              price: bosPoint.swingPrice,
              type: bosPoint.type
            });
          }
          
          bosSeries.setData(lineData);
          
          bosSeriesRefs.current.push(bosSeries);
        } catch (lineErr) {
          console.error(`❌ Failed to draw BOS line ${idx}:`, lineErr, bosPoint);
        }
      });
    } catch (e) {
      console.error('Error updating BOS markers:', e);
    }
  }, [chartReady, candles, showBOS, chartBosSwingLength, calculateBOSandCHoCH]);

  // Update CHoCH markers with horizontal lines
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) {
      return;
    }

    const chart = chartRef.current;
    
    // Extra safety check - ensure chart hasn't been disposed
    try {
      chart.timeScale();
    } catch (e) {
      return; // Chart is disposed, skip this update
    }

    // Remove old CHoCH lines with better error handling
    if (chochSeriesRefs.current.length > 0) {
      chochSeriesRefs.current.forEach(series => {
        try {
          if (series && chart) {
            chart.removeSeries(series);
          }
        } catch (e) {
          // Series already disposed, ignore
        }
      });
      chochSeriesRefs.current = [];
    }
    
    if (!showCHoCH) return;

    try {
      // Use chart-only settings for CHoCH display (independent from strategy settings)
      const { choch } = calculateBOSandCHoCH(candles, chartChochSwingLength);
      
      // Add horizontal line series for each CHoCH point
      choch.forEach(chochPoint => {
        const color = chochPoint.type === 'bullish' ? '#eab308' : '#ec4899'; // Yellow for bullish, Pink for bearish
        
        // CHoCH always uses dashed lines
        const chochSeries = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          lineStyle: 2, // Dashed for CHoCH
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        // Draw horizontal line from swing to break
        chochSeries.setData([
          { time: chochPoint.swingTime as any, value: chochPoint.swingPrice },
          { time: chochPoint.breakTime as any, value: chochPoint.swingPrice },
        ]);
        
        chochSeriesRefs.current.push(chochSeries);
      });
    } catch (e) {
      console.error('Error updating CHoCH markers:', e);
    }
  }, [chartReady, candles, showCHoCH, chartChochSwingLength, calculateBOSandCHoCH]);

  // Draw white lines for swing pivots (visual-only indicator)
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) {
      return;
    }

    const chart = chartRef.current;
    
    // Extra safety check - ensure chart hasn't been disposed
    try {
      chart.timeScale();
    } catch (e) {
      return; // Chart is disposed, skip this update
    }

    // Remove old swing pivot lines
    if (swingPivotSeriesRefs.current.length > 0) {
      swingPivotSeriesRefs.current.forEach(series => {
        try {
          if (series && chart) {
            chart.removeSeries(series);
          }
        } catch (e) {
          // Series already disposed, ignore
        }
      });
      swingPivotSeriesRefs.current = [];
    }
    
    if (!showSwingPivots) return;

    try {
      // Calculate swings at the user-specified swing length
      const swings = calculateSwings(candles, swingPivotLength);
      
      console.log(`🎯 Drawing ${swings.length} swing pivot markers (length: ${swingPivotLength})`);
      
      // Draw a white line for each swing pivot spanning 3 candles
      swings.forEach((swing) => {
        try {
          const pivotSeries = chart.addSeries(LineSeries, {
            color: '#FFFFFF', // White
            lineWidth: 2,
            lineStyle: 0, // Solid
            priceLineVisible: false,
            lastValueVisible: false,
          });
          
          // Find the candle index for this swing
          const swingIndex = candles.findIndex(c => c.time === swing.time);
          if (swingIndex === -1) return;
          
          // Calculate 3-candle span: 1 candle before, the pivot, 1 candle after
          const startIndex = Math.max(0, swingIndex - 1);
          const endIndex = Math.min(candles.length - 1, swingIndex + 1);
          
          const startTime = candles[startIndex].time;
          const endTime = candles[endIndex].time;
          
          // Draw horizontal line at swing price spanning 3 candles
          const lineData = [
            { time: startTime as any, value: swing.value },
            { time: endTime as any, value: swing.value },
          ];
          
          pivotSeries.setData(lineData);
          swingPivotSeriesRefs.current.push(pivotSeries);
        } catch (lineErr) {
          console.error(`❌ Failed to draw swing pivot line:`, lineErr, swing);
        }
      });
    } catch (e) {
      console.error('Error updating swing pivot markers:', e);
    }
  }, [chartReady, candles, showSwingPivots, swingPivotLength, calculateSwings]);

  // Draw cyan lines for liquidity sweeps (visual-only indicator)
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) {
      return;
    }

    const chart = chartRef.current;
    
    // Extra safety check - ensure chart hasn't been disposed
    try {
      chart.timeScale();
    } catch (e) {
      return; // Chart is disposed, skip this update
    }

    // Remove old liquidity sweep lines with better error handling
    if (liquiditySweepSeriesRefs.current.length > 0) {
      liquiditySweepSeriesRefs.current.forEach(series => {
        try {
          if (series && chart) {
            chart.removeSeries(series);
          }
        } catch (e) {
          // Series already disposed, ignore
        }
      });
      liquiditySweepSeriesRefs.current = [];
    }
    
    // Show liquidity sweeps on chart when the indicator is toggled (independent of bot strategy)
    if (!stratLiquidityGrab) return;

    try {
      const { bos, choch} = calculateBOSandCHoCH(candles, chartLiquiditySweepSwingLength);
      
      const allSweeps = [...bos, ...choch].filter(e => e.isLiquidityGrab);
      
      console.log(`📊 Chart Display: Found ${allSweeps.length} liquidity sweeps out of ${bos.length + choch.length} total BOS/CHoCH`, {
        swingLength: chartLiquiditySweepSwingLength
      });
      
      allSweeps.forEach(sweep => {
        const sweepSeries = chart.addSeries(LineSeries, {
          color: '#22d3ee', // Cyan for liquidity sweeps
          lineWidth: 2,
          lineStyle: 0, // Solid line
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        try {
          sweepSeries.setData([
            { time: sweep.swingTime as any, value: sweep.swingPrice },
            { time: sweep.breakTime as any, value: sweep.swingPrice },
          ]);
          
          liquiditySweepSeriesRefs.current.push(sweepSeries);
        } catch (e) {
          // Series might be disposed
        }
      });
    } catch (e) {
      console.error('Error drawing liquidity sweep lines:', e);
    }
  }, [chartReady, candles, stratLiquidityGrab, chartLiquiditySweepSwingLength, calculateBOSandCHoCH]);

  // Draw auto trendlines on chart
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length < 50) {
      return;
    }

    const chart = chartRef.current;
    
    // Clean up old trendline series
    if (trendlineSeriesRefs.current.length > 0) {
      trendlineSeriesRefs.current.forEach(series => {
        try {
          if (series && chart) {
            chart.removeSeries(series);
          }
        } catch (e) {
          // Series might already be removed
        }
      });
      trendlineSeriesRefs.current = [];
    }
    
    if (!showAutoTrendlines) return;

    try {
      // Adaptive pivot length based on number of visible candles
      const adaptivePivotLength = (() => {
        const candleCount = candles.length;
        if (candleCount < 100) return 2;      // Very sensitive for short timeframes
        if (candleCount < 300) return 5;      // Balanced for medium timeframes
        if (candleCount < 500) return 8;      // Medium sensitivity
        return 10;                              // Major swings only for long timeframes
      })();
      
      // Use user-set pivot length if available, otherwise use adaptive
      const effectivePivotLength = trendlinePivotLength || adaptivePivotLength;
      
      const trendlines = detectTrendlines(candles, trendlineMinTouches, trendlineTolerance, effectivePivotLength);
      
      trendlines.forEach(trendline => {
        const color = trendline.type === 'support' ? '#10b981' : '#ef4444'; // Green for support, red for resistance
        const lineWidth = trendline.strength >= 4 ? 2 : 1; // Thicker for stronger trendlines
        
        // Get first and last point
        const firstPoint = trendline.points[0];
        const lastPoint = trendline.points[trendline.points.length - 1];
        
        // Extend the line to the current price mark (latest candle)
        const currentIndex = candles.length - 1;
        const currentPrice = trendline.slope * currentIndex + trendline.intercept;
        const currentTime = candles[currentIndex].time;
        
        // Create line series
        const trendlineSeries = chart.addSeries(LineSeries, {
          color,
          lineWidth,
          lineStyle: 2, // Dashed line
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        try {
          // Set data from first touch to current price mark
          trendlineSeries.setData([
            { time: firstPoint.time as any, value: firstPoint.price },
            { time: currentTime as any, value: currentPrice },
          ]);
          
          trendlineSeriesRefs.current.push(trendlineSeries);
        } catch (e) {
          // Series might be disposed
        }
      });
    } catch (e) {
      console.error('Error drawing auto trendlines:', e);
    }
  }, [chartReady, candles, showAutoTrendlines, trendlineMinTouches, trendlineTolerance, trendlinePivotLength, detectTrendlines]);

  // Add text labels overlay for BOS and CHoCH with zoom/pan support
  useEffect(() => {
    if (!chartReady || !chartRef.current || !chartContainerRef.current || candles.length === 0) {
      return;
    }

    const chart = chartRef.current;
    const container = chartContainerRef.current;

    // Clean up old labels
    if (structureLabelsRef.current) {
      structureLabelsRef.current.remove();
      structureLabelsRef.current = null;
    }

    // If labels are disabled, don't create container
    if (!showChartLabels) return;

    // Create container for labels
    const labelsContainer = document.createElement('div');
    labelsContainer.style.position = 'absolute';
    labelsContainer.style.top = '0';
    labelsContainer.style.left = '0';
    labelsContainer.style.width = '100%';
    labelsContainer.style.height = '100%';
    labelsContainer.style.pointerEvents = 'none';
    labelsContainer.style.zIndex = '10';
    container.style.position = 'relative';
    container.appendChild(labelsContainer);
    structureLabelsRef.current = labelsContainer;

    // Store label data for repositioning
    interface LabelData {
      text: string;
      price: number;
      time: number;
      color: string;
      element: HTMLDivElement;
    }
    const labelDataArray: LabelData[] = [];

    const createLabel = (text: string, price: number, time: number, color: string): HTMLDivElement => {
      const label = document.createElement('div');
      label.textContent = text;
      label.style.position = 'absolute';
      label.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      label.style.color = color;
      label.style.padding = '2px 6px';
      label.style.borderRadius = '3px';
      label.style.fontSize = '10px';
      label.style.fontWeight = '600';
      label.style.whiteSpace = 'nowrap';
      label.style.border = `1px solid ${color}`;
      labelsContainer.appendChild(label);
      return label;
    };

    const updateLabelPositions = () => {
      const containerRect = labelsContainer.getBoundingClientRect();
      const chartWidth = containerRect.width;
      const chartHeight = containerRect.height;
      
      labelDataArray.forEach(({ price, time, element }) => {
        try {
          const yCoord = candleSeriesRef.current?.priceToCoordinate(price);
          const xCoord = chart.timeScale().timeToCoordinate(time as any);
          
          if (yCoord === null || yCoord === undefined || xCoord === null) {
            element.style.display = 'none';
            return;
          }
          
          // Get label dimensions
          const labelWidth = element.offsetWidth || 50;
          const labelHeight = element.offsetHeight || 20;
          
          // Hide labels that are outside the visible viewport
          // Left side: hide if the label would be mostly off-screen
          if (xCoord < -labelWidth / 2) {
            element.style.display = 'none';
            return;
          }
          // Right side: hide if x coordinate is beyond chart width
          if (xCoord > chartWidth) {
            element.style.display = 'none';
            return;
          }
          // Top/bottom: hide if outside visible price range
          if (yCoord < -labelHeight || yCoord > chartHeight + labelHeight) {
            element.style.display = 'none';
            return;
          }

          element.style.display = 'block';
          
          // Calculate position with offset
          let leftPos = xCoord + 5;
          let topPos = yCoord - 10;
          
          // Only constrain labels that are partially visible
          // Right boundary: ensure label doesn't extend beyond chart width
          if (leftPos + labelWidth > chartWidth) {
            leftPos = chartWidth - labelWidth - 5;
          }
          // Bottom boundary
          if (topPos + labelHeight > chartHeight) {
            topPos = chartHeight - labelHeight - 5;
          }
          // Top boundary
          if (topPos < 0) {
            topPos = 5;
          }
          
          element.style.left = `${leftPos}px`;
          element.style.top = `${topPos}px`;
        } catch (e) {
          element.style.display = 'none';
        }
      });
    };

    // Collect all label data
    // Calculate both BOS and CHoCH first to handle conflicts (CHoCH takes precedence)
    let bosData: any[] = [];
    let chochData: any[] = [];
    
    if (showBOS) {
      try {
        const { bos } = calculateBOSandCHoCH(candles, chartBosSwingLength);
        bosData = bos.filter(b => !b.isLiquidityGrab);
      } catch (e) {
        console.error('Error calculating BOS labels:', e);
      }
    }

    if (showCHoCH) {
      try {
        const { choch } = calculateBOSandCHoCH(candles, chartChochSwingLength);
        chochData = choch.filter(c => !c.isLiquidityGrab);
      } catch (e) {
        console.error('Error calculating CHoCH labels:', e);
      }
    }
    
    // Create Set of CHoCH pivot points to filter BOS conflicts
    const chochPivots = new Set(
      chochData.map(c => `${c.swingTime}_${c.swingPrice.toFixed(4)}`)
    );
    
    // Add BOS labels (filtered to exclude CHoCH conflicts)
    if (showBOS) {
      try {
        bosData.forEach(bosPoint => {
          const pivotKey = `${bosPoint.swingTime}_${bosPoint.swingPrice.toFixed(4)}`;
          
          // Skip if CHoCH exists at same pivot (CHoCH takes precedence)
          if (chochPivots.has(pivotKey)) return;
          
          const text = bosPoint.type === 'bullish' ? 'BOS↑' : 'BOS↓';
          const color = bosPoint.type === 'bullish' ? '#10b981' : '#ef4444';
          const element = createLabel(text, bosPoint.swingPrice, bosPoint.swingTime, color);
          labelDataArray.push({
            text,
            price: bosPoint.swingPrice,
            time: bosPoint.swingTime,
            color,
            element,
          });
        });
      } catch (e) {
        console.error('Error creating BOS labels:', e);
      }
    }

    // Add CHoCH labels
    if (showCHoCH) {
      try {
        chochData.forEach(chochPoint => {
          const text = chochPoint.type === 'bullish' ? 'CHoCH↑' : 'CHoCH↓';
          const color = chochPoint.type === 'bullish' ? '#eab308' : '#ec4899'; // Yellow for bullish, Pink for bearish
          const element = createLabel(text, chochPoint.swingPrice, chochPoint.swingTime, color);
          labelDataArray.push({
            text,
            price: chochPoint.swingPrice,
            time: chochPoint.swingTime,
            color,
            element,
          });
        });
      } catch (e) {
        console.error('Error creating CHoCH labels:', e);
      }
    }
    
    // Add liquidity sweep labels from STRATEGY (cyan)
    if (stratLiquidityGrab) {
      try {
        const { bos, choch } = calculateBOSandCHoCH(
          candles,
          liqGrabSwingLength
        );
        const allSweeps = [...bos, ...choch].filter(e => e.isLiquidityGrab);
        
        allSweeps.forEach(sweep => {
          const text = sweep.type === 'bullish' ? '↓↑' : '↑↓';
          const color = '#22d3ee'; // Cyan for liquidity grab strategy
          const element = createLabel(text, sweep.swingPrice, sweep.swingTime, color);
          labelDataArray.push({
            text,
            price: sweep.swingPrice,
            time: sweep.swingTime,
            color,
            element,
          });
        });
      } catch (e) {
        console.error('Error creating liquidity sweep labels:', e);
      }
    }

    // Initial positioning
    updateLabelPositions();

    // Subscribe to time range changes (zoom/pan) with requestAnimationFrame throttling
    let rafId: number | null = null;
    const handleVisibleTimeRangeChange = () => {
      // Cancel any pending frame to avoid queueing updates
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      // Schedule update on next animation frame for smooth performance
      rafId = requestAnimationFrame(() => {
        updateLabelPositions();
        rafId = null;
      });
    };
    
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);

    // Cleanup function
    return () => {
      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      try {
        chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
      } catch (e) {
        // Chart already disposed
      }
      if (structureLabelsRef.current) {
        structureLabelsRef.current.remove();
        structureLabelsRef.current = null;
      }
    };
  }, [chartReady, candles, showBOS, showCHoCH, showChartLabels, chartBosSwingLength, chartChochSwingLength, stratLiquidityGrab, liqGrabSwingLength, calculateBOSandCHoCH]);

  // Update backtest trade markers with price level lines and shaded zones
  useEffect(() => {
    // Only return early if chart isn't ready at all
    if (!chartReady || !chartRef.current) {
      return;
    }

    const chart = chartRef.current;
    
    // Extra safety check
    try {
      chart.timeScale();
    } catch (e) {
      return;
    }

    // Clean up old trade markers
    if (tradeMarkerRefs.current.length > 0) {
      tradeMarkerRefs.current.forEach(series => {
        try {
          if (series && chart) {
            chart.removeSeries(series);
          }
        } catch (e) {
          // Already disposed
        }
      });
      tradeMarkerRefs.current = [];
    }

    // Collect all markers
    const allMarkers: any[] = [];
    
    // Filter trades for replay mode - only show trades that have opened by current replay time
    const hasBacktestTrades = backtestResults && backtestResults.trades && backtestResults.trades.length > 0;
    const currentReplayTime = isReplayMode && candles.length > 0 ? candles[candles.length - 1].time : Infinity;
    const visibleTrades = hasBacktestTrades 
      ? backtestResults.trades.filter(trade => !isReplayMode || trade.entryTime <= currentReplayTime)
      : [];

    // Add shaded zones and horizontal lines for each visible trade
    visibleTrades.forEach(trade => {
      const { entryTime, exitTime, entry, exit, stopLoss, tp1, tp2, tp3, direction, strategy, outcome } = trade;
      
      // Determine numTPs based on strategy
      let numTPs = 1; // Default to 1 TP to be safe
      if (strategy === 'liquidity_grab') {
        numTPs = liqGrabTPSL.numTPs;
      } else if (strategy === 'bos_trend') {
        numTPs = bosTPSL.numTPs;
      } else if (strategy === 'choch_fvg') {
        numTPs = chochTPSL.numTPs;
      } else if (strategy === 'vwap_rejection') {
        numTPs = vwapTPSL.numTPs;
      } else if (strategy === 'rs_flip') {
        numTPs = rsFlipTPSL.numTPs;
      } else if (strategy === 'structure_break') {
        numTPs = 2; // Structure break default
      }
      
      const isLong = direction === 'long';
      
      // ========== SHADED ZONES ==========
      // FIXED ISSUE 4: Risk zone (LOSS) should ALWAYS be RED, Profit zone (GAIN) should ALWAYS be GREEN
      // For LONG: Red zone (Entry to SL - LOSS), Green zone (Entry to TPs - PROFIT)
      // For SHORT: Red zone (Entry to SL - LOSS), Green zone (Entry to TPs - PROFIT)
      
      // Strategy: Draw semi-transparent rectangular zones using multiple close horizontal lines
      // This creates a "filled" visual effect between price levels
      
      const riskColor = 'rgba(239, 68, 68, 0.15)';  // Always RED for risk/loss
      const profitColor = 'rgba(16, 185, 129, 0.15)';  // Always GREEN for profit/gain
      
      // Determine highest TP based on numTPs OR use exit price for signal-based exits
      let highestTP = tp1;
      
      // For signal-based exits (EMA Exit, VWAP Exit), use actual exit price if profitable
      if (outcome === 'EMA Exit' || outcome === 'VWAP Exit') {
        // Check if the trade was profitable
        const isProfit = isLong ? exit > entry : exit < entry;
        if (isProfit) {
          highestTP = exit; // Use exit price for green zone
        } else {
          highestTP = entry; // No profit zone if exit was at a loss
        }
      } else {
        // Regular TP-based exit: use configured TPs
        if (numTPs >= 2 && tp2 !== undefined) highestTP = tp2;
        if (numTPs >= 3 && tp3 !== undefined) highestTP = tp3;
      }
      
      // Create filled zones by drawing many closely-spaced horizontal lines
      // Risk zone (Entry to SL)
      const riskLines = 20; // Number of lines to create filled effect
      const riskStep = Math.abs(stopLoss - entry) / riskLines;
      const riskStart = Math.min(entry, stopLoss);
      
      for (let i = 0; i <= riskLines; i++) {
        const price = riskStart + (riskStep * i);
        const riskLine = chart.addSeries(LineSeries, {
          color: riskColor,
          lineWidth: Math.max(1, Math.ceil(riskStep / (Math.abs(stopLoss - entry) / 100))) as any, // Dynamic width
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        try {
          riskLine.setData([
            { time: entryTime as any, value: price },
            { time: exitTime as any, value: price },
          ]);
          tradeMarkerRefs.current.push(riskLine);
        } catch (e) {
          // Series might be disposed
        }
      }
      
      // Profit zone (Entry to highest TP)
      const profitLines = 20;
      const profitStep = Math.abs(highestTP - entry) / profitLines;
      const profitStart = Math.min(entry, highestTP);
      
      for (let i = 0; i <= profitLines; i++) {
        const price = profitStart + (profitStep * i);
        const profitLine = chart.addSeries(LineSeries, {
          color: profitColor,
          lineWidth: Math.max(1, Math.ceil(profitStep / (Math.abs(highestTP - entry) / 100))) as any,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        try {
          profitLine.setData([
            { time: entryTime as any, value: price },
            { time: exitTime as any, value: price },
          ]);
          tradeMarkerRefs.current.push(profitLine);
        } catch (e) {
          // Series might be disposed
        }
      }
      
      // ========== HORIZONTAL LINES WITHOUT LABELS ==========
      
      // STOP LOSS LINE (Red, thick)
      const slLine = chart.addSeries(LineSeries, {
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: 0, // Solid
        priceLineVisible: false,
        lastValueVisible: false,
      });
      try {
        slLine.setData([
          { time: entryTime as any, value: stopLoss },
          { time: exitTime as any, value: stopLoss },
        ]);
        slLine.applyOptions({
          priceFormat: {
            type: 'price',
            precision: 6,
            minMove: 0.000001,
          },
        });
        tradeMarkerRefs.current.push(slLine);
      } catch (e) {
        // Series might be disposed
      }
      
      // ENTRY LINE (White, dashed)
      const entryLine = chart.addSeries(LineSeries, {
        color: '#ffffff',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        priceLineVisible: false,
        lastValueVisible: false,
      });
      try {
        entryLine.setData([
          { time: entryTime as any, value: entry },
          { time: exitTime as any, value: entry },
        ]);
        entryLine.applyOptions({
          priceFormat: {
            type: 'price',
            precision: 6,
            minMove: 0.000001,
          },
        });
        tradeMarkerRefs.current.push(entryLine);
      } catch (e) {
        // Series might be disposed
      }
      
      // TP1 LINE (Green, solid) - Always draw if numTPs >= 1
      if (numTPs >= 1) {
        const tp1Line = chart.addSeries(LineSeries, {
          color: '#22c55e',
          lineWidth: 2,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        try {
          tp1Line.setData([
            { time: entryTime as any, value: tp1 },
            { time: exitTime as any, value: tp1 },
          ]);
          tp1Line.applyOptions({
            priceFormat: {
              type: 'price',
              precision: 6,
              minMove: 0.000001,
            },
          });
          tradeMarkerRefs.current.push(tp1Line);
        } catch (e) {
          // Series might be disposed
        }
      }
      
      // TP2 LINE (Green, dashed) - Only draw if numTPs >= 2
      if (numTPs >= 2 && tp2 !== undefined) {
        const tp2Line = chart.addSeries(LineSeries, {
          color: '#22c55e',
          lineWidth: 2,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        try {
          tp2Line.setData([
            { time: entryTime as any, value: tp2 },
            { time: exitTime as any, value: tp2 },
          ]);
          tp2Line.applyOptions({
            priceFormat: {
              type: 'price',
              precision: 6,
              minMove: 0.000001,
            },
          });
          tradeMarkerRefs.current.push(tp2Line);
        } catch (e) {
          // Series might be disposed
        }
      }
      
      // TP3 LINE (Green, dotted) - Only draw if numTPs >= 3
      if (numTPs >= 3 && tp3 !== undefined) {
        const tp3Line = chart.addSeries(LineSeries, {
          color: '#22c55e',
          lineWidth: 2,
          lineStyle: 3,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        try {
          tp3Line.setData([
            { time: entryTime as any, value: tp3 },
            { time: exitTime as any, value: tp3 },
          ]);
          tp3Line.applyOptions({
            priceFormat: {
              type: 'price',
              precision: 6,
              minMove: 0.000001,
            },
          });
          tradeMarkerRefs.current.push(tp3Line);
        } catch (e) {
          // Series might be disposed
        }
      }
      
      // ========== CHART-ANCHORED MARKERS (LABELS) ==========
      // Add text markers at entry time for each price level
      
      // Entry marker (white)
      allMarkers.push({
        time: entryTime as Time,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: '#ffffff',
        shape: 'square',
        text: `Entry ${typeof entry === 'number' ? entry.toFixed(6) : entry}`
      });
      
      // Stop Loss marker (red) - only show if we have a numeric stop loss
      if (stopLoss !== undefined && stopLoss !== null && stopLoss !== 'N/A' && typeof stopLoss === 'number') {
        allMarkers.push({
          time: entryTime as Time,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: '#ef4444',
          shape: 'square',
          text: `SL ${stopLoss.toFixed(6)}`
        });
      }
      
      // TP markers (green)
      if (numTPs >= 1 && tp1 !== undefined && tp1 !== null && typeof tp1 === 'number') {
        allMarkers.push({
          time: entryTime as Time,
          position: isLong ? 'aboveBar' : 'belowBar',
          color: '#22c55e',
          shape: 'square',
          text: `TP1 ${tp1.toFixed(6)}`
        });
      }
      
      if (numTPs >= 2 && tp2 !== undefined && tp2 !== null && typeof tp2 === 'number') {
        allMarkers.push({
          time: entryTime as Time,
          position: isLong ? 'aboveBar' : 'belowBar',
          color: '#22c55e',
          shape: 'square',
          text: `TP2 ${tp2.toFixed(6)}`
        });
      }
      
      if (numTPs >= 3 && tp3 !== undefined && tp3 !== null && typeof tp3 === 'number') {
        allMarkers.push({
          time: entryTime as Time,
          position: isLong ? 'aboveBar' : 'belowBar',
          color: '#22c55e',
          shape: 'square',
          text: `TP3 ${tp3.toFixed(6)}`
        });
      }
    });
    
    // Add CVD spike markers if enabled
    console.log('📊 CVD Spike Check:', { cvdSpikeEnabled, deltaHistoryLen: deltaHistory.length, candlesLen: candles.length });
    if (cvdSpikeEnabled && deltaHistory.length >= 10 && candles.length > 0) {
      // Calculate average delta for bullish and bearish separately
      const bullishDeltas = deltaHistory.filter(d => d.delta > 0).map(d => d.delta);
      const bearishDeltas = deltaHistory.filter(d => d.delta < 0).map(d => Math.abs(d.delta));
      
      const avgBullishDelta = bullishDeltas.length > 0 
        ? bullishDeltas.reduce((a, b) => a + b, 0) / bullishDeltas.length 
        : 0;
      const avgBearishDelta = bearishDeltas.length > 0 
        ? bearishDeltas.reduce((a, b) => a + b, 0) / bearishDeltas.length 
        : 0;
      
      let matchedCount = 0;
      let spikeCount = 0;
      
      // Check each delta bar for spikes - use timestamp for matching
      deltaHistory.forEach((bar) => {
        // Match by Unix timestamp directly, with fallback to time string
        const barTimestamp = bar.timestamp;
        let candle;
        if (barTimestamp) {
          candle = candles.find(c => c.time === barTimestamp);
        } else {
          // Fallback: match by time string
          candle = candles.find(c => new Date(c.time * 1000).toLocaleTimeString() === bar.time);
        }
        if (!candle) return;
        matchedCount++;
        
        // Get exchange consensus count for direction-specific coloring
        const bullishExchanges = bar.bullishExchanges || 0;
        const bearishExchanges = bar.bearishExchanges || 0;
        
        // Bullish spike detection with configurable thresholds
        const level1Mult = cvdSpikeLevel1 / 100; // e.g., 175% = 1.75x
        const level2Mult = cvdSpikeLevel2 / 100; // e.g., 250% = 2.5x
        const level3Mult = cvdSpikeLevel3 / 100; // e.g., 400% = 4.0x
        
        if (bar.delta > 0 && avgBullishDelta > 0) {
          const multiple = bar.delta / avgBullishDelta;
          if (multiple >= level1Mult) {
            // Triangle count based on configurable levels
            let triangleCount = 1;
            if (multiple >= level3Mult) triangleCount = 3;
            else if (multiple >= level2Mult) triangleCount = 2;
            
            // Color based on exchange consensus: 5-6=green, 3-4=blue, 1-2=grey
            let color = '#22c55e'; // green (5-6 exchanges)
            if (bullishExchanges <= 2) {
              color = '#9ca3af'; // grey (1-2 exchanges - weak signal)
            } else if (bullishExchanges <= 4) {
              color = '#3b82f6'; // blue (3-4 exchanges - moderate)
            }
            
            // Use number indicator for intensity: ▲ (1.5x), ▲² (2x), ▲³ (3x+)
            const superscript = triangleCount === 1 ? '' : triangleCount === 2 ? '²' : '³';
            spikeCount++;
            allMarkers.push({
              time: candle.time as Time,
              position: 'belowBar',
              color,
              shape: 'circle',
              size: 0,
              text: `▲${superscript}`
            });
          }
        }
        
        // Bearish spike detection with configurable thresholds
        if (bar.delta < 0 && avgBearishDelta > 0) {
          const multiple = Math.abs(bar.delta) / avgBearishDelta;
          if (multiple >= level1Mult) {
            // Triangle count based on configurable levels
            let triangleCount = 1;
            if (multiple >= level3Mult) triangleCount = 3;
            else if (multiple >= level2Mult) triangleCount = 2;
            
            // Color based on exchange consensus: 5-6=red, 3-4=yellow, 1-2=grey
            let color = '#ef4444'; // red (5-6 exchanges)
            if (bearishExchanges <= 2) {
              color = '#9ca3af'; // grey (1-2 exchanges - weak signal)
            } else if (bearishExchanges <= 4) {
              color = '#eab308'; // yellow (3-4 exchanges - moderate)
            }
            
            // Use number indicator for intensity: ▼ (1.5x), ▼² (2x), ▼³ (3x+)
            const superscript = triangleCount === 1 ? '' : triangleCount === 2 ? '²' : '³';
            spikeCount++;
            allMarkers.push({
              time: candle.time as Time,
              position: 'aboveBar',
              color,
              shape: 'circle',
              size: 0,
              text: `▼${superscript}`
            });
          }
        }
      });
      
      console.log('📊 CVD Spike Detection:', {
        deltaHistoryLen: deltaHistory.length,
        candlesLen: candles.length,
        matchedCount,
        spikeCount,
        avgBullish: avgBullishDelta.toFixed(0),
        avgBearish: avgBearishDelta.toFixed(0),
        sampleTimestamps: deltaHistory.slice(0, 3).map(d => d.timestamp),
        sampleCandleTimes: candles.slice(0, 3).map(c => c.time)
      });
    }
    
    // Sort markers by time (required by lightweight-charts)
    allMarkers.sort((a, b) => (a.time as number) - (b.time as number));
    
    // Log marker count
    console.log('📍 Setting chart markers:', {
      totalMarkers: allMarkers.length,
      cvdMarkers: allMarkers.filter(m => m.text && (m.text.includes('▲') || m.text.includes('▼'))).length,
      hasCandleSeries: !!candleSeriesRef.current,
      sampleMarkers: allMarkers.slice(-3).map(m => ({ time: m.time, text: m.text, color: m.color }))
    });
    
    // Set all markers at once on the candlestick series using v5 API
    if (candleSeriesRef.current) {
      try {
        // Use v5 createSeriesMarkers API
        if (seriesMarkersRef.current) {
          // Update existing markers primitive
          seriesMarkersRef.current.setMarkers(allMarkers);
          console.log('✅ Markers updated on chart:', allMarkers.length);
        } else if (allMarkers.length > 0) {
          // Create new markers primitive
          seriesMarkersRef.current = createSeriesMarkers(candleSeriesRef.current, allMarkers);
          console.log('✅ Markers primitive created with', allMarkers.length, 'markers');
        }
      } catch (e) {
        console.error('Failed to set markers on candlestick series:', e);
      }
    } else {
      console.warn('⚠️ candleSeriesRef.current is null');
    }
  }, [chartReady, backtestResults, candles, liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, isReplayMode, cvdSpikeEnabled, cvdSpikeLevel1, cvdSpikeLevel2, cvdSpikeLevel3, deltaHistory]);

  // ========== DEBOUNCE EFFECTS FOR STRATEGY SETTINGS ==========
  
  // Liquidity Grab Strategy
  useEffect(() => {
    const timer = setTimeout(() => {
      const num = parseInt(liqGrabSwingLengthInput);
      if (!isNaN(num) && num >= 5 && num <= 20) {
        setLiqGrabSwingLength(num);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [liqGrabSwingLengthInput]);

  // BOS Structure Strategy
  useEffect(() => {
    const timer = setTimeout(() => {
      const num = parseInt(bosSwingLengthInput);
      if (!isNaN(num) && num >= 5 && num <= 20) {
        setBosSwingLength(num);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [bosSwingLengthInput]);

  // CHoCH + FVG Strategy
  useEffect(() => {
    const timer = setTimeout(() => {
      const num = parseInt(chochSwingLengthInput);
      if (!isNaN(num) && num >= 5 && num <= 20) {
        setChochSwingLength(num);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [chochSwingLengthInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const num = parseInt(chochTPSwingLengthInput);
      if (!isNaN(num) && num >= 5 && num <= 50) {
        setChochTPSwingLength(num);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [chochTPSwingLengthInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const num = parseInt(chochSLSwingLengthInput);
      if (!isNaN(num) && num >= 3 && num <= 30) {
        setChochSLSwingLength(num);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [chochSLSwingLengthInput]);

  // Chart Liquidity Sweep Settings (separate from bot strategy)
  useEffect(() => {
    const timer = setTimeout(() => {
      const num = parseInt(chartLiquiditySweepSwingLengthInput);
      if (!isNaN(num) && num >= 5 && num <= 50) {
        setChartLiquiditySweepSwingLength(num);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [chartLiquiditySweepSwingLengthInput]);

  // Legacy debounce effects (deprecated - keeping for backward compatibility)
  useEffect(() => {
    const timer = setTimeout(() => {
      const num = parseInt(swingLengthInput);
      if (!isNaN(num) && num >= 5 && num <= 20) {
        setSwingLength(num);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [swingLengthInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const num = parseInt(liqGrabInput);
      if (!isNaN(num) && num >= 1 && num <= 5) {
        setLiqGrabCandles(num);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [liqGrabInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const num = parseInt(wickRatioInput);
      if (!isNaN(num) && num >= 50 && num <= 500) {
        setWickToBodyRatio(num);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [wickRatioInput]);

  // Determine bias when candles change
  useEffect(() => {
    if (candles.length > 0) {
      determineBias(candles);
      determineStructureTrend(candles);
    }
  }, [candles, determineBias, determineStructureTrend]);

  // Generate signals when candles update or bot settings change
  useEffect(() => {
    if (botEnabled && candles.length > 0) {
      generateSignals();
    }
  }, [candles, botEnabled, generateSignals]);

  // Detect market alerts when candles update
  useEffect(() => {
    if (candles.length > 0) {
      detectMarketAlerts();
    }
  }, [candles, detectMarketAlerts]);

  // Fetch initial data on mount
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // WebSocket connection for real-time updates (like TradingView live candles)
  useEffect(() => {
    if (!symbol || !interval || candles.length === 0) return;

    // Use global Binance endpoint (works worldwide, not just USA)
    const ws = new WebSocket('wss://stream.binance.com:9443/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('📡 WebSocket connected for real-time updates');
      ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: [
          `${symbol.toLowerCase()}@kline_${interval}`,
          `${symbol.toLowerCase()}@trade`,
        ],
        id: 1,
      }));
    };

    ws.onerror = (error) => {
      console.error('📡 WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('📡 WebSocket closed');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.e === 'kline') {
        const k = msg.k;
        const bar: CandleData = {
          time: k.t / 1000,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        // Update chart only if bar time is >= last bar time (prevents "Cannot update oldest data" error)
        if (candleSeriesRef.current) {
          try {
            const lastData = candleSeriesRef.current.data();
            if (lastData.length === 0 || bar.time >= (lastData[lastData.length - 1] as any).time) {
              candleSeriesRef.current.update(bar as any);
            }
          } catch (err) {
            // Silently ignore update errors for out-of-order data
          }
        }

        setCandles(prev => {
          const newCandles = [...prev];
          if (k.x) { // Candle closed
            if (bar.time > newCandles[newCandles.length - 1].time) {
              newCandles.push(bar);
              // Save delta for this closed candle (use real delta if available)
              setDeltaHistory(prevHist => {
                const delta = realDeltaData.get(bar.time) || currentDelta;
                // API returns timestamps in milliseconds, chart uses seconds
                const timestampSeconds = bar.time > 9999999999 ? Math.floor(bar.time / 1000) : bar.time;
                const newHist = [...prevHist, {
                  time: new Date(timestampSeconds * 1000).toLocaleTimeString(),
                  timestamp: timestampSeconds, // Unix timestamp in seconds for chart matching
                  delta,
                  cumDelta: cumDelta,
                  isBull: bar.close >= bar.open,
                  volume: bar.volume
                }];
                return newHist.slice(-20); // Keep last 20
              });
              setCurrentDelta(0);
            } else {
              newCandles[newCandles.length - 1] = bar;
            }
          } else {
            // Update last candle in real-time (live candle movement)
            if (bar.time === newCandles[newCandles.length - 1].time) {
              newCandles[newCandles.length - 1] = bar;
            } else {
              newCandles.push(bar);
            }
          }
          return newCandles;
        });
      } else if (msg.e === 'trade') {
        const qty = parseFloat(msg.q);
        const isBuy = !msg.m; // Buyer is maker = sell, not maker = buy
        const delta = isBuy ? qty : -qty;
        setCurrentDelta(prev => prev + delta);
        setCumDelta(prev => prev + delta);
      }
    };

    return () => {
      ws.close();
    };
  }, [symbol, interval, candles.length]);

  // Replay mode auto-play effect
  useEffect(() => {
    if (isReplayPlaying && isReplayMode && fullCandleData.length > 0) {
      const baseInterval = 1000; // 1 second base
      const intervalDuration = baseInterval / replaySpeed;
      
      const timer: any = setInterval(() => {
        setReplayIndex(prev => {
          if (prev >= fullCandleData.length) {
            setIsReplayPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalDuration);
      
      replayIntervalRef.current = timer as NodeJS.Timeout;

      return () => {
        if (replayIntervalRef.current) {
          clearInterval(replayIntervalRef.current);
          replayIntervalRef.current = null;
        }
      };
    } else {
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
        replayIntervalRef.current = null;
      }
    }
  }, [isReplayPlaying, isReplayMode, replaySpeed, fullCandleData.length]);

  // Update candles when in replay mode
  useEffect(() => {
    if (isReplayMode && fullCandleData.length > 0) {
      // Store current visible range before updating candles
      let savedRange: any = null;
      if (chartRef.current) {
        try {
          savedRange = chartRef.current.timeScale().getVisibleRange();
        } catch (e) {
          // Chart might not be ready
        }
      }
      
      const replayCandles = fullCandleData.slice(0, replayIndex);
      setCandles(replayCandles);
      
      // Restore visible range after candles update (in next tick)
      if (savedRange) {
        setTimeout(() => {
          if (chartRef.current) {
            try {
              chartRef.current.timeScale().setVisibleRange(savedRange);
            } catch (e) {
              // Chart might be updating
            }
          }
        }, 50);
      }
    }
  }, [isReplayMode, replayIndex, fullCandleData]);

  // Store full candle data when new data is fetched (not in replay mode)
  useEffect(() => {
    if (!isReplayMode && candles.length > 0) {
      // Always update fullCandleData with latest candles when not in replay mode
      setFullCandleData([...candles]);
    }
  }, [candles.length, isReplayMode]);

  // Create RSI chart
  useEffect(() => {
    if (!showRSI || !rsiRef.current || candles.length === 0) return;
    
    const chart = createChart(rsiRef.current, { 
      width: rsiRef.current.clientWidth, 
      height: 200, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    oscillatorChartsRef.current.set('RSI', chart);
    
    // Sync with main chart if sync is enabled
    if (syncOscillatorScale && chartRef.current) {
      try {
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange) chart.timeScale().setVisibleRange(visibleRange);
      } catch (e) { /* ignore */ }
    }
    
    const line = chart.addSeries(LineSeries, { color: '#ffa726', lineWidth: 2 });
    line.setData(calculateRSI(candles, rsiPeriod).map(d => ({ time: d.time as Time, value: d.value })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 70 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 30 })));
    
    return () => {
      oscillatorChartsRef.current.delete('RSI');
      chart.remove();
    };
  }, [showRSI, candles, rsiPeriod, calculateRSI]);

  // Create MACD chart
  useEffect(() => {
    if (!showMACD || !macdRef.current || candles.length === 0) return;
    
    const chart = createChart(macdRef.current, { 
      width: macdRef.current.clientWidth, 
      height: 200, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    oscillatorChartsRef.current.set('MACD', chart);
    
    // Sync with main chart if sync is enabled
    if (syncOscillatorScale && chartRef.current) {
      try {
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange) chart.timeScale().setVisibleRange(visibleRange);
      } catch (e) { /* ignore */ }
    }
    
    const { macd, signal, hist } = calculateMACD(candles, macdFast, macdSlow, macdSignal);
    chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2 }).setData(macd.map(d => ({ time: d.time as Time, value: d.value })));
    chart.addSeries(LineSeries, { color: '#ef5350', lineWidth: 2 }).setData(signal.map(d => ({ time: d.time as Time, value: d.value })));
    chart.addSeries(HistogramSeries, { color: '#26a69a' }).setData(hist.map(d => ({ time: d.time as Time, value: d.value, color: d.color })));
    
    return () => {
      oscillatorChartsRef.current.delete('MACD');
      chart.remove();
    };
  }, [showMACD, candles, macdFast, macdSlow, macdSignal, calculateMACD]);

  // Create OBV chart
  useEffect(() => {
    if (!showOBV || !obvRef.current || candles.length === 0) return;
    
    const chart = createChart(obvRef.current, { 
      width: obvRef.current.clientWidth, 
      height: 200, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    oscillatorChartsRef.current.set('OBV', chart);
    
    // Sync with main chart if sync is enabled
    if (syncOscillatorScale && chartRef.current) {
      try {
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange) chart.timeScale().setVisibleRange(visibleRange);
      } catch (e) { /* ignore */ }
    }
    
    chart.addSeries(LineSeries, { color: '#9580ff', lineWidth: 2 }).setData(calculateOBV(candles));
    
    return () => {
      oscillatorChartsRef.current.delete('OBV');
      chart.remove();
    };
  }, [showOBV, candles, calculateOBV]);

  // Create Stochastic RSI chart
  useEffect(() => {
    if (!showStochRSI || !stochRSIRef.current || candles.length === 0) return;
    
    const chart = createChart(stochRSIRef.current, { 
      width: stochRSIRef.current.clientWidth, 
      height: 200, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    oscillatorChartsRef.current.set('StochRSI', chart);
    
    // Sync with main chart if sync is enabled
    if (syncOscillatorScale && chartRef.current) {
      try {
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange) chart.timeScale().setVisibleRange(visibleRange);
      } catch (e) { /* ignore */ }
    }
    
    const stochData = calculateStochasticRSI(candles, stochRSIPeriod);
    const kLine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, title: '%K' });
    const dLine = chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 2, title: '%D' });
    
    kLine.setData(stochData.map(d => ({ time: d.time as Time, value: d.k })));
    dLine.setData(stochData.map(d => ({ time: d.time as Time, value: d.d })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (80/20 for Stoch RSI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 80 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 20 })));
    
    return () => {
      oscillatorChartsRef.current.delete('StochRSI');
      chart.remove();
    };
  }, [showStochRSI, candles, stochRSIPeriod, calculateStochasticRSI]);

  // Create Williams %R chart
  useEffect(() => {
    if (!showWilliamsR || !williamsRRef.current || candles.length === 0) return;
    
    const chart = createChart(williamsRRef.current, { 
      width: williamsRRef.current.clientWidth, 
      height: 200, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    oscillatorChartsRef.current.set('WilliamsR', chart);
    
    // Sync with main chart if sync is enabled
    if (syncOscillatorScale && chartRef.current) {
      try {
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange) chart.timeScale().setVisibleRange(visibleRange);
      } catch (e) { /* ignore */ }
    }
    
    const line = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2 });
    line.setData(calculateWilliamsR(candles, williamsRPeriod).map(d => ({ time: d.time as Time, value: d.value })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (-20/-80 for Williams %R)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: -20 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: -80 })));
    
    return () => {
      oscillatorChartsRef.current.delete('WilliamsR');
      chart.remove();
    };
  }, [showWilliamsR, candles, williamsRPeriod, calculateWilliamsR]);

  // Create MFI chart
  useEffect(() => {
    if (!showMFI || !mfiRef.current || candles.length === 0) return;
    
    const chart = createChart(mfiRef.current, { 
      width: mfiRef.current.clientWidth, 
      height: 200, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    oscillatorChartsRef.current.set('MFI', chart);
    
    // Sync with main chart if sync is enabled
    if (syncOscillatorScale && chartRef.current) {
      try {
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange) chart.timeScale().setVisibleRange(visibleRange);
      } catch (e) { /* ignore */ }
    }
    
    const line = chart.addSeries(LineSeries, { color: '#00bcd4', lineWidth: 2 });
    line.setData(calculateMFI(candles, mfiPeriod).map(d => ({ time: d.time as Time, value: d.value })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (80/20 for MFI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 80 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 20 })));
    
    return () => {
      oscillatorChartsRef.current.delete('MFI');
      chart.remove();
    };
  }, [showMFI, candles, mfiPeriod, calculateMFI]);

  // Create CCI chart
  useEffect(() => {
    if (!showCCI || !cciRef.current || candles.length === 0) return;
    
    const chart = createChart(cciRef.current, { 
      width: cciRef.current.clientWidth, 
      height: 200, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    oscillatorChartsRef.current.set('CCI', chart);
    
    // Sync with main chart if sync is enabled
    if (syncOscillatorScale && chartRef.current) {
      try {
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange) chart.timeScale().setVisibleRange(visibleRange);
      } catch (e) { /* ignore */ }
    }
    
    const line = chart.addSeries(LineSeries, { color: '#ec4899', lineWidth: 2 });
    line.setData(calculateCCI(candles, cciPeriod).map(d => ({ time: d.time as Time, value: d.value })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (+100/-100 for CCI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 100 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: -100 })));
    chart.addSeries(LineSeries, { color: '#444', lineStyle: 2, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 0 })));
    
    return () => {
      oscillatorChartsRef.current.delete('CCI');
      chart.remove();
    };
  }, [showCCI, candles, cciPeriod]);

  // Create ADX chart
  useEffect(() => {
    if (!showADX || !adxRef.current || candles.length === 0) return;
    
    const chart = createChart(adxRef.current, { 
      width: adxRef.current.clientWidth, 
      height: 200, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
      },
    });
    
    oscillatorChartsRef.current.set('ADX', chart);
    
    // Sync with main chart if sync is enabled
    if (syncOscillatorScale && chartRef.current) {
      try {
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange) chart.timeScale().setVisibleRange(visibleRange);
      } catch (e) { /* ignore */ }
    }
    
    const adxData = calculateADX(candles, adxPeriod);
    const adxLine = chart.addSeries(LineSeries, { color: '#22c55e', lineWidth: 2, title: 'ADX' });
    const plusDILine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: '+DI' });
    const minusDILine = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 1, title: '-DI' });
    
    adxLine.setData(adxData.map(d => ({ time: d.time as Time, value: d.adx })));
    plusDILine.setData(adxData.map(d => ({ time: d.time as Time, value: d.plusDI })));
    minusDILine.setData(adxData.map(d => ({ time: d.time as Time, value: d.minusDI })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add strength level line (25 is typically considered strong trend)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 25 })));
    
    return () => {
      oscillatorChartsRef.current.delete('ADX');
      chart.remove();
    };
  }, [showADX, candles, adxPeriod]);

  // ========== OSCILLATOR TIME SCALE SYNC ==========
  // Sync oscillator chart time scales with main chart when enabled
  useEffect(() => {
    if (!syncOscillatorScale || !chartRef.current) return;
    
    const mainChart = chartRef.current;
    const timeScale = mainChart.timeScale();
    
    // Use requestAnimationFrame for smooth sync without lag
    let rafId: number | null = null;
    const syncVisibleRange = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        try {
          const visibleRange = timeScale.getVisibleRange();
          if (!visibleRange) return;
          
          oscillatorChartsRef.current.forEach((oscChart) => {
            try {
              oscChart.timeScale().setVisibleRange(visibleRange);
            } catch (e) {
              // Chart might not have data in this range
            }
          });
        } catch (e) {
          // Main chart might not be ready
        }
        rafId = null;
      });
    };
    
    // Subscribe to time scale changes
    timeScale.subscribeVisibleTimeRangeChange(syncVisibleRange);
    
    // Initial sync
    syncVisibleRange();
    
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      timeScale.unsubscribeVisibleTimeRangeChange(syncVisibleRange);
    };
  }, [syncOscillatorScale]);

  // ========== DIVERGENCE CALCULATION ==========
  // Calculate divergence from active oscillators
  useEffect(() => {
    if (candles.length < 50) {
      setDivergenceStrength(0);
      setDivergenceType('none');
      return;
    }
    
    const priceData = candles.map(c => c.close);
    let totalDivergence = 0;
    let oscillatorCount = 0;
    
    // Check RSI divergence
    if (showRSI) {
      const rsiData = calculateRSI(candles, rsiPeriod);
      const rsiValues = rsiData.map(d => d.value);
      if (rsiValues.length > 0) {
        totalDivergence += detectDivergence(priceData.slice(-rsiValues.length), rsiValues);
        oscillatorCount++;
      }
    }
    
    // Check MACD divergence (using histogram)
    if (showMACD) {
      const { hist } = calculateMACD(candles, macdFast, macdSlow, macdSignal);
      const histValues = hist.map(d => d.value);
      if (histValues.length > 0) {
        totalDivergence += detectDivergence(priceData.slice(-histValues.length), histValues);
        oscillatorCount++;
      }
    }
    
    // Check OBV divergence
    if (showOBV) {
      const obvData = calculateOBV(candles);
      const obvValues = obvData.map(d => d.value);
      if (obvValues.length > 0) {
        totalDivergence += detectDivergence(priceData.slice(-obvValues.length), obvValues);
        oscillatorCount++;
      }
    }
    
    // Check Stoch RSI divergence
    if (showStochRSI) {
      const stochData = calculateStochasticRSI(candles, stochRSIPeriod);
      const kValues = stochData.map(d => d.k);
      if (kValues.length > 0) {
        totalDivergence += detectDivergence(priceData.slice(-kValues.length), kValues);
        oscillatorCount++;
      }
    }
    
    // Average divergence across active oscillators - clamp to [-3, 3]
    const avgDivergence = oscillatorCount > 0 ? Math.round(totalDivergence / oscillatorCount) : 0;
    const clampedStrength = Math.max(-3, Math.min(3, avgDivergence));
    setDivergenceStrength(clampedStrength);
    setDivergenceType(clampedStrength > 0 ? 'bullish' : clampedStrength < 0 ? 'bearish' : 'none');
    
  }, [candles, showRSI, showMACD, showOBV, showStochRSI, rsiPeriod, macdFast, macdSlow, macdSignal, stochRSIPeriod, calculateRSI, calculateMACD, calculateOBV, calculateStochasticRSI, detectDivergence]);

  // ========== INDICATOR REPORTS (Paid only) ==========
  // Generate brief contextual reports for active oscillators
  const getIndicatorReport = useCallback((
    indicator: string
  ): { text: string; color: string } => {
    if (candles.length < 20) return { text: '', color: '' };
    
    switch (indicator) {
      case 'RSI': {
        const rsiData = calculateRSI(candles, rsiPeriod);
        const lastRSI = rsiData[rsiData.length - 1]?.value;
        if (!lastRSI) return { text: '', color: '' };
        if (lastRSI >= 70) return { text: `Overbought (${lastRSI.toFixed(0)})`, color: 'text-red-400' };
        if (lastRSI <= 30) return { text: `Oversold (${lastRSI.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastRSI.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'MACD': {
        const { macd, signal } = calculateMACD(candles, macdFast, macdSlow, macdSignal);
        const lastMACD = macd[macd.length - 1]?.value;
        const lastSignal = signal[signal.length - 1]?.value;
        const prevMACD = macd[macd.length - 2]?.value;
        const prevSignal = signal[signal.length - 2]?.value;
        if (!lastMACD || !lastSignal) return { text: '', color: '' };
        if (prevMACD < prevSignal && lastMACD > lastSignal) return { text: 'Bullish Cross', color: 'text-green-400' };
        if (prevMACD > prevSignal && lastMACD < lastSignal) return { text: 'Bearish Cross', color: 'text-red-400' };
        if (lastMACD > lastSignal) return { text: 'Bullish', color: 'text-green-400' };
        return { text: 'Bearish', color: 'text-red-400' };
      }
      case 'OBV': {
        const obvData = calculateOBV(candles);
        if (obvData.length < 10) return { text: '', color: '' };
        const recent = obvData.slice(-5).map(d => d.value);
        const trend = recent[recent.length - 1] - recent[0];
        if (trend > 0) return { text: 'Rising', color: 'text-green-400' };
        if (trend < 0) return { text: 'Falling', color: 'text-red-400' };
        return { text: 'Flat', color: 'text-gray-400' };
      }
      case 'ADX': {
        const adxData = calculateADX(candles, adxPeriod);
        const lastADX = adxData[adxData.length - 1];
        if (!lastADX) return { text: '', color: '' };
        if (lastADX.adx >= 40) return { text: `Strong Trend (${lastADX.adx.toFixed(0)})`, color: 'text-blue-400' };
        if (lastADX.adx >= 25) return { text: `Trending (${lastADX.adx.toFixed(0)})`, color: 'text-cyan-400' };
        return { text: `Weak Trend (${lastADX.adx.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'StochRSI': {
        const stochData = calculateStochasticRSI(candles, stochRSIPeriod);
        const lastK = stochData[stochData.length - 1]?.k;
        if (!lastK) return { text: '', color: '' };
        if (lastK >= 80) return { text: `Overbought (${lastK.toFixed(0)})`, color: 'text-red-400' };
        if (lastK <= 20) return { text: `Oversold (${lastK.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastK.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'MFI': {
        const mfiData = calculateMFI(candles, mfiPeriod);
        const lastMFI = mfiData[mfiData.length - 1]?.value;
        if (!lastMFI) return { text: '', color: '' };
        if (lastMFI >= 80) return { text: `Overbought (${lastMFI.toFixed(0)})`, color: 'text-red-400' };
        if (lastMFI <= 20) return { text: `Oversold (${lastMFI.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastMFI.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'WilliamsR': {
        const wrData = calculateWilliamsR(candles, williamsRPeriod);
        const lastWR = wrData[wrData.length - 1]?.value;
        if (!lastWR) return { text: '', color: '' };
        if (lastWR >= -20) return { text: `Overbought (${lastWR.toFixed(0)})`, color: 'text-red-400' };
        if (lastWR <= -80) return { text: `Oversold (${lastWR.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastWR.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'CCI': {
        const cciData = calculateCCI(candles, cciPeriod);
        const lastCCI = cciData[cciData.length - 1]?.value;
        if (!lastCCI) return { text: '', color: '' };
        if (lastCCI >= 100) return { text: `Overbought (${lastCCI.toFixed(0)})`, color: 'text-red-400' };
        if (lastCCI <= -100) return { text: `Oversold (${lastCCI.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastCCI.toFixed(0)})`, color: 'text-gray-400' };
      }
      default:
        return { text: '', color: '' };
    }
  }, [candles, rsiPeriod, macdFast, macdSlow, macdSignal, adxPeriod, stochRSIPeriod, mfiPeriod, williamsRPeriod, cciPeriod, calculateRSI, calculateMACD, calculateOBV, calculateADX, calculateStochasticRSI, calculateMFI, calculateWilliamsR, calculateCCI]);

  // Get per-oscillator divergence
  const getOscillatorDivergence = useCallback((indicator: string): { strength: number; type: 'bullish' | 'bearish' | 'none' } => {
    if (candles.length < 50) return { strength: 0, type: 'none' };
    
    const priceData = candles.map(c => c.close);
    let divergence = 0;
    
    switch (indicator) {
      case 'RSI': {
        const rsiData = calculateRSI(candles, rsiPeriod);
        const rsiValues = rsiData.map(d => d.value);
        if (rsiValues.length > 0) divergence = detectDivergence(priceData.slice(-rsiValues.length), rsiValues);
        break;
      }
      case 'MACD': {
        const { hist } = calculateMACD(candles, macdFast, macdSlow, macdSignal);
        const histValues = hist.map(d => d.value);
        if (histValues.length > 0) divergence = detectDivergence(priceData.slice(-histValues.length), histValues);
        break;
      }
      case 'OBV': {
        const obvData = calculateOBV(candles);
        const obvValues = obvData.map(d => d.value);
        if (obvValues.length > 0) divergence = detectDivergence(priceData.slice(-obvValues.length), obvValues);
        break;
      }
      case 'StochRSI': {
        const stochData = calculateStochasticRSI(candles, stochRSIPeriod);
        const kValues = stochData.map(d => d.k);
        if (kValues.length > 0) divergence = detectDivergence(priceData.slice(-kValues.length), kValues);
        break;
      }
      case 'MFI': {
        const mfiData = calculateMFI(candles, mfiPeriod);
        const mfiValues = mfiData.map(d => d.value);
        if (mfiValues.length > 0) divergence = detectDivergence(priceData.slice(-mfiValues.length), mfiValues);
        break;
      }
      case 'WilliamsR': {
        const wrData = calculateWilliamsR(candles, williamsRPeriod);
        const wrValues = wrData.map(d => d.value);
        if (wrValues.length > 0) divergence = detectDivergence(priceData.slice(-wrValues.length), wrValues);
        break;
      }
      case 'CCI': {
        const cciData = calculateCCI(candles, cciPeriod);
        const cciValues = cciData.map(d => d.value);
        if (cciValues.length > 0) divergence = detectDivergence(priceData.slice(-cciValues.length), cciValues);
        break;
      }
      case 'ADX': {
        const adxData = calculateADX(candles, adxPeriod);
        const adxValues = adxData.map(d => d.adx);
        if (adxValues.length > 0) divergence = detectDivergence(priceData.slice(-adxValues.length), adxValues);
        break;
      }
    }
    
    const clamped = Math.max(-3, Math.min(3, divergence));
    return { strength: clamped, type: clamped > 0 ? 'bullish' : clamped < 0 ? 'bearish' : 'none' };
  }, [candles, rsiPeriod, macdFast, macdSlow, macdSignal, stochRSIPeriod, mfiPeriod, williamsRPeriod, cciPeriod, adxPeriod, calculateRSI, calculateMACD, calculateOBV, calculateStochasticRSI, calculateMFI, calculateWilliamsR, calculateCCI, calculateADX, detectDivergence]);

  // Mini divergence meter component for each oscillator
  const DivergenceMeter = ({ indicator }: { indicator: string }) => {
    const { strength, type } = getOscillatorDivergence(indicator);
    return (
      <div className="mt-2 pt-2 border-t border-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-sm">🐻‍❄️</span>
          <div className="flex-1 h-2 bg-slate-700 rounded-full relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-px h-full bg-slate-500" />
            </div>
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white shadow transition-all duration-500"
              style={{
                left: `calc(50% + ${(strength / 3) * 45}% - 6px)`,
                background: strength === 0 
                  ? '#3b82f6' 
                  : strength > 0 
                    ? `linear-gradient(to right, #3b82f6, ${strength === 1 ? '#86efac' : strength === 2 ? '#4ade80' : '#22c55e'})`
                    : `linear-gradient(to left, #3b82f6, ${strength === -1 ? '#fca5a5' : strength === -2 ? '#f87171' : '#ef4444'})`,
              }}
            />
          </div>
          <span className="text-sm">🐂</span>
          {type !== 'none' && (
            <span className={`text-xs font-medium ${type === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
              {type === 'bullish' ? '▲' : '▼'}{Math.abs(strength)}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ADX Trend Strength Meter - uses +DI/-DI for direction and ADX value for strength
  const TrendStrengthMeter = () => {
    const adxData = calculateADX(candles, adxPeriod);
    const lastADX = adxData[adxData.length - 1];
    
    if (!lastADX) {
      return (
        <div className="mt-2 pt-2 border-t border-slate-600">
          <div className="flex items-center gap-2 text-gray-500 text-xs">No data</div>
        </div>
      );
    }
    
    // Direction from +DI vs -DI
    const isBullish = lastADX.plusDI > lastADX.minusDI;
    const direction = isBullish ? 'bullish' : 'bearish';
    
    // Strength from ADX value (0-100 scale -> 0-3 scale)
    // < 20 = weak (1), 20-40 = moderate (2), > 40 = strong (3)
    let strengthValue = 0;
    if (lastADX.adx >= 40) strengthValue = 3;
    else if (lastADX.adx >= 25) strengthValue = 2;
    else if (lastADX.adx >= 15) strengthValue = 1;
    
    // Apply direction to strength
    const signedStrength = isBullish ? strengthValue : -strengthValue;
    
    return (
      <div className="mt-2 pt-2 border-t border-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-sm">🐻‍❄️</span>
          <div className="flex-1 h-2 bg-slate-700 rounded-full relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-px h-full bg-slate-500" />
            </div>
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white shadow transition-all duration-500"
              style={{
                left: `calc(50% + ${(signedStrength / 3) * 45}% - 6px)`,
                background: signedStrength === 0 
                  ? '#3b82f6' 
                  : signedStrength > 0 
                    ? `linear-gradient(to right, #3b82f6, ${strengthValue === 1 ? '#86efac' : strengthValue === 2 ? '#4ade80' : '#22c55e'})`
                    : `linear-gradient(to left, #3b82f6, ${strengthValue === 1 ? '#fca5a5' : strengthValue === 2 ? '#f87171' : '#ef4444'})`,
              }}
            />
          </div>
          <span className="text-sm">🐂</span>
          {strengthValue > 0 && (
            <span className={`text-xs font-medium ${direction === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
              {direction === 'bullish' ? '▲' : '▼'}{strengthValue}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Allow page to render for all users - unauthenticated get free tier
  // Sign in button in header handles authentication

  return (
    <>
      <Helmet>
        <title>Crypto Trading Indicators - Professional SMC Analysis | BearTec</title>
        <meta name="description" content="Professional cryptocurrency trading platform with Smart Money Concepts (SMC), order flow analysis, CVD, Fair Value Gaps, and institutional-grade indicators. Real-time BTC, ETH, XRP analysis." />
        <meta property="og:title" content="Crypto Trading Indicators - Professional SMC Analysis" />
        <meta property="og:description" content="Professional crypto trading with Smart Money Concepts, order flow, CVD, and institutional indicators." />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="min-h-screen bg-[#0e0e0e] p-4 pb-20">
        <div className="max-w-[1800px] mx-auto space-y-4">
          {/* Header */}
        <div className="relative flex flex-col items-center mb-4 pt-4">
          {/* BearTec Logo - Centered on mobile, left on desktop */}
          <div className="mb-4 md:absolute md:left-0 md:top-[80px] md:mb-0">
            <img 
              src={bearTecLogoNew} 
              alt="BearTec Logo" 
              className="h-[100px] md:h-[140px] w-auto object-contain"
            />
          </div>
          
          {/* Dynamic Market Status Animation - Top Center */}
          <div className="w-full flex justify-center relative">
            {/* Bear Video */}
            <video 
              ref={bearVideoRef}
              src={bearVideo}
              muted
              autoPlay
              playsInline
              preload="auto"
              className="h-[240px] max-w-full object-contain absolute"
              style={{
                opacity: videoPhase === 'initial_bear' || (videoPhase === 'final' && targetMarketState === 'bearish') ? 1 : 0,
                pointerEvents: videoPhase === 'initial_bear' || (videoPhase === 'final' && targetMarketState === 'bearish') ? 'auto' : 'none'
              }}
              onEnded={() => {
                if (videoPhase === 'initial_bear') {
                  if (targetMarketState === 'bullish') {
                    setVideoPhase('transition');
                  } else {
                    setVideoPhase('final');
                  }
                }
              }}
              onMouseEnter={() => {
                if (videoPhase === 'final' && targetMarketState === 'bearish' && bearVideoRef.current) {
                  bearVideoRef.current.currentTime = 0;
                  bearVideoRef.current.play().catch(err => console.log('Bear hover replay failed:', err));
                }
              }}
            />
            
            {/* Transition Video */}
            <video 
              ref={transitionVideoRef}
              src={transitionVideo}
              muted
              playsInline
              preload="auto"
              className="h-[240px] max-w-full object-contain absolute"
              style={{
                opacity: videoPhase === 'transition' ? 1 : 0,
                pointerEvents: videoPhase === 'transition' ? 'auto' : 'none'
              }}
              onEnded={() => {
                if (videoPhase === 'transition') {
                  setVideoPhase('final');
                }
              }}
            />
            
            {/* Bull Video */}
            <video 
              ref={bullVideoRef}
              src={bullVideo}
              muted
              playsInline
              preload="auto"
              className="h-[240px] max-w-full object-contain absolute"
              style={{
                opacity: videoPhase === 'final' && targetMarketState === 'bullish' ? 1 : 0,
                pointerEvents: videoPhase === 'final' && targetMarketState === 'bullish' ? 'auto' : 'none'
              }}
              onMouseEnter={() => {
                if (videoPhase === 'final' && targetMarketState === 'bullish' && bullVideoRef.current) {
                  bullVideoRef.current.currentTime = 0;
                  bullVideoRef.current.play().catch(err => console.log('Bull hover replay failed:', err));
                }
              }}
            />
          </div>
        </div>

        {/* Spacer to prevent content overlap with animation */}
        <div className="h-[260px]"></div>

        {/* Ticker and Timeframe Selectors */}
        <div className="flex flex-col items-center gap-4">
          {/* Ticker and Timeframe Selectors */}
          <div className="flex items-center gap-2 md:gap-4">
            <TickerSelector 
              value={symbol} 
              onChange={(val) => { incrementTickerClick(val); setSymbol(val); }}
              showSearch={true}
            />
            <Select value={interval} onValueChange={setTimeframeInterval}>
              <SelectTrigger className="w-20 md:w-32 bg-slate-800 border-slate-600">
                <SelectValue className="text-white font-bold" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">1m</SelectItem>
                <SelectItem value="5m">5m</SelectItem>
                <SelectItem value="15m">15m</SelectItem>
                <SelectItem value="1h">1h</SelectItem>
                <SelectItem value="4h">4h</SelectItem>
                <SelectItem value="1d">1D</SelectItem>
                <SelectItem value="1w">1W</SelectItem>
                <SelectItem value="1M">1M</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => setAlertSettingsOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 md:px-4"
              data-testid="button-open-alert-settings"
            >
              <Bell className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Alert Settings</span>
            </Button>
            <a href="/crypto/feedback">
              <Button
                variant="outline"
                className="border-[#00c4b4] text-[#00c4b4] hover:bg-[#00c4b4]/10 px-3 md:px-4"
                data-testid="link-feedback"
              >
                <MessageSquare className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Feedback</span>
              </Button>
            </a>
          </div>
        </div>

        {/* Market Status */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Market Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300">EMA Bias</Label>
              <div className="flex items-center gap-2">
                {bias === 'bullish' ? (
                  <><TrendingUp className="h-4 w-4 text-green-500" /><span className="text-green-500 font-semibold">Bullish</span></>
                ) : bias === 'bearish' ? (
                  <><TrendingDown className="h-4 w-4 text-red-500" /><span className="text-red-500 font-semibold">Bearish</span></>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-700">
              <Label className="text-gray-300">Structure</Label>
              <div className="flex items-center gap-2">
                {structureTrend === 'uptrend' ? (
                  <><TrendingUp className="h-4 w-4 text-green-500" /><span className="text-green-500 font-semibold">Uptrend</span></>
                ) : structureTrend === 'downtrend' ? (
                  <><TrendingDown className="h-4 w-4 text-red-500" /><span className="text-red-500 font-semibold">Downtrend</span></>
                ) : (
                  <span className="text-gray-500">Ranging</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Replay Mode Controls */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3">
            <div className="space-y-2">
              {/* Row 1: Toggle, Reset, and Playback Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded">
                  <Label className="text-white font-semibold text-sm">Replay Mode</Label>
                  <Switch 
                    checked={isReplayMode} 
                    onCheckedChange={(checked) => {
                      setIsReplayMode(checked);
                      if (checked) {
                        // Entering replay mode
                        const currentCandles = [...candles];
                        setFullCandleData(currentCandles);
                        setReplayIndex(100);
                        setIsReplayPlaying(false);
                        if (replayIntervalRef.current) {
                          clearInterval(replayIntervalRef.current);
                          replayIntervalRef.current = null;
                        }
                      } else {
                        // Exiting replay mode - restore all candles
                        if (replayIntervalRef.current) {
                          clearInterval(replayIntervalRef.current);
                          replayIntervalRef.current = null;
                        }
                        setIsReplayPlaying(false);
                        // Restore full candles
                        if (fullCandleData.length > 0) {
                          setCandles([...fullCandleData]);
                        }
                      }
                    }}
                  />
                </div>

                {isReplayMode && (
                  <>
                    <button
                      onClick={() => setReplayIndex(100)}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-semibold transition-colors"
                      data-testid="button-replay-reset"
                    >
                      🔄 Reset
                    </button>
                    
                    <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1.5 rounded">
                      <button
                        onClick={() => setReplayIndex(Math.max(100, replayIndex - 10))}
                        disabled={replayIndex <= 100}
                        className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
                        data-testid="button-replay-backward-10"
                      >
                        ⏪ -10
                      </button>
                      <button
                        onClick={() => setReplayIndex(Math.max(100, replayIndex - 1))}
                        disabled={replayIndex <= 100}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
                        data-testid="button-replay-backward-1"
                      >
                        ◀ -1
                      </button>
                      <button
                        onClick={() => {
                          if (isReplayPlaying) {
                            setIsReplayPlaying(false);
                            if (replayIntervalRef.current) {
                              clearInterval(replayIntervalRef.current);
                              replayIntervalRef.current = null;
                            }
                          } else {
                            setIsReplayPlaying(true);
                          }
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors"
                        data-testid="button-replay-play"
                      >
                        {isReplayPlaying ? '⏸ Pause' : '▶ Play'}
                      </button>
                      <button
                        onClick={() => setReplayIndex(Math.min(fullCandleData.length, replayIndex + 1))}
                        disabled={replayIndex >= fullCandleData.length}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
                        data-testid="button-replay-forward-1"
                      >
                        +1 ▶
                      </button>
                      <button
                        onClick={() => setReplayIndex(Math.min(fullCandleData.length, replayIndex + 10))}
                        disabled={replayIndex >= fullCandleData.length}
                        className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
                        data-testid="button-replay-forward-10"
                      >
                        +10 ⏩
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Row 2: Speed & Progress Bar */}
              {isReplayMode && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-gray-400 text-xs">Speed:</Label>
                    <Select value={replaySpeed.toString()} onValueChange={(v) => setReplaySpeed(parseInt(v))}>
                      <SelectTrigger className="w-20 h-7 bg-slate-900 text-white border-slate-600 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1x</SelectItem>
                        <SelectItem value="2">2x</SelectItem>
                        <SelectItem value="5">5x</SelectItem>
                        <SelectItem value="10">10x</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-gray-400 text-xs whitespace-nowrap">
                      {replayIndex} / {fullCandleData.length} candles
                    </span>
                    <div className="flex-1 bg-slate-900 rounded h-2 overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full transition-all duration-200"
                        style={{ width: `${(replayIndex / fullCandleData.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Chart */}
        <Card 
          className={`bg-slate-800 border-slate-700 transition-all duration-300 ${
            isFullscreen 
              ? 'fixed inset-0 z-50 rounded-none border-0' 
              : ''
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && isFullscreen) {
              setIsFullscreen(false);
              setTimeout(() => {
                if (chartRef.current && chartContainerRef.current) {
                  chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                  });
                }
              }, 100);
            }
          }}
          tabIndex={isFullscreen ? 0 : -1}
        >
          <CardContent className={`p-4 bg-slate-800 ${isFullscreen ? 'h-full' : ''}`}>
            {loading ? (
              <div className={`${isFullscreen ? 'h-full' : 'h-[600px]'} flex items-center justify-center bg-slate-800`}>
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <div className={`relative ${isFullscreen ? 'h-full' : ''}`}>
                <div 
                  ref={chartContainerRef} 
                  className={`w-full relative bg-[#0f172a] overflow-hidden ${isFullscreen ? 'h-full' : 'h-[600px]'}`}
                  style={{ minHeight: isFullscreen ? '100%' : '600px', background: '#0f172a' }}
                />
                
                {/* Custom Crosshair Time Tooltip for Future Whitespace Area */}
                {crosshairInfo && crosshairInfo.time > 0 && (
                  <div 
                    className="absolute pointer-events-none z-20 bg-slate-900/90 text-white text-xs px-2 py-1 rounded border border-slate-600"
                    style={{ 
                      left: Math.min(crosshairInfo.x, (chartContainerRef.current?.clientWidth || 800) - 120), 
                      bottom: 10
                    }}
                  >
                    {new Date(crosshairInfo.time * 1000).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                )}
                
                {/* SVG Overlay for Selection Hit Areas & Edit Mode */}
                {/* Primitives handle visible rendering, SVG provides invisible hit areas for selection */}
                <svg 
                  className={`absolute top-0 left-0 ${(drawingMode === 'select' || activeEdit) ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
                  style={{ width: '100%', height: isFullscreen ? '100%' : '600px', zIndex: 10 }}
                  data-testid="drawing-overlay"
                  onClick={(e) => {
                    // If editing a point, place it here
                    if (activeEdit) {
                      handleEditPointPlace(e.clientX, e.clientY);
                      e.stopPropagation();
                      return;
                    }
                    if (drawingMode === 'select') {
                      // If clicking on empty space, deselect
                      if ((e.target as Element).tagName === 'svg') {
                        setSelectedDrawingId(null);
                      }
                    }
                  }}
                >
                  {/* Render all drawings - invisible hit areas when not editing, visible when editing */}
                  {drawings.map(drawing => {
                    const isBeingEdited = activeEdit && activeEdit.drawingId === drawing.id;
                    const renderVisible = isBeingEdited; // Only show SVG graphics when editing this drawing
                    if (!chartRef.current || !chartReady) return null;
                    
                    const chart = chartRef.current;
                    const timeScale = chart.timeScale();
                    const priceScale = candleSeriesRef.current?.priceScale();
                    
                    // Check if this drawing has a point being edited (should be hidden)
                    const isPointBeingEdited = (pointIndex: number) => {
                      return activeEdit && 
                             activeEdit.drawingId === drawing.id && 
                             activeEdit.pointIndex === pointIndex;
                    };
                    
                    // Convert time/price to pixel coordinates
                    const toPixel = (point: { time: number; price: number }, pointIndex?: number) => {
                      const x = timeScale.timeToCoordinate(point.time as any);
                      const y = candleSeriesRef.current?.priceToCoordinate(point.price);
                      return { x: x ?? 0, y: y ?? 0 };
                    };
                    
                    const color = drawing.style?.color || '#3b82f6';
                    const isSelected = drawing.id === selectedDrawingId;
                    
                    const handleClick = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (drawingMode === 'select') {
                        setSelectedDrawingId(drawing.id === selectedDrawingId ? null : drawing.id);
                      }
                    };
                    
                    if (drawing.type === 'trendline' && drawing.points.length >= 2) {
                      // If either point is being edited, hide the entire trendline until replaced
                      if (isPointBeingEdited(0) || isPointBeingEdited(1)) {
                        // Show only the remaining point as a marker
                        const remainingIndex = isPointBeingEdited(0) ? 1 : 0;
                        const remainingPoint = toPixel(drawing.points[remainingIndex], remainingIndex);
                        return (
                          <g key={drawing.id}>
                            <circle cx={remainingPoint.x} cy={remainingPoint.y} r={6} fill={color} stroke="#fff" strokeWidth={2} />
                            <text x={remainingPoint.x + 10} y={remainingPoint.y - 10} fill="#fff" fontSize="12">Click to place point</text>
                          </g>
                        );
                      }
                      const p1 = toPixel(drawing.points[0], 0);
                      const p2 = toPixel(drawing.points[1], 1);
                      if (p1.x === null || p2.x === null) return null;
                      const label = drawing.style?.label || '';
                      const labelRight = drawing.style?.labelPosition === 'right';
                      const extendLeft = drawing.style?.extendLeft || false;
                      const extendRight = drawing.style?.extendRight || false;
                      
                      const chartContainer = chartContainerRef.current;
                      const chartWidth = chartContainer?.clientWidth || 800;
                      const chartHeight = chartContainer?.clientHeight || 400;
                      
                      // Normalize points so pLeft is always the leftmost point
                      const pLeft = p1.x <= p2.x ? p1 : p2;
                      const pRight = p1.x <= p2.x ? p2 : p1;
                      
                      let lineX1 = pLeft.x;
                      let lineY1 = pLeft.y;
                      let lineX2 = pRight.x;
                      let lineY2 = pRight.y;
                      
                      if (extendLeft || extendRight) {
                        const dx = pRight.x - pLeft.x;
                        const dy = pRight.y - pLeft.y;
                        
                        const isVertical = Math.abs(dx) < 0.001;
                        const isHorizontal = Math.abs(dy) < 0.001;
                        
                        if (isVertical) {
                          // Vertical line: extend in Y direction only
                          const avgX = (pLeft.x + pRight.x) / 2;
                          lineX1 = avgX;
                          lineX2 = avgX;
                          if (extendLeft) lineY1 = 0;
                          if (extendRight) lineY2 = chartHeight;
                        } else if (isHorizontal) {
                          // Horizontal line: extend in X direction only
                          const avgY = (pLeft.y + pRight.y) / 2;
                          lineY1 = avgY;
                          lineY2 = avgY;
                          if (extendLeft) lineX1 = 0;
                          if (extendRight) lineX2 = chartWidth;
                        } else {
                          const slope = dy / dx;
                          const intercept = pLeft.y - slope * pLeft.x;
                          
                          const getYAtX = (x: number) => slope * x + intercept;
                          const getXAtY = (y: number) => (y - intercept) / slope;
                          
                          // Find intersection with left edge (toward smaller X)
                          if (extendLeft) {
                            // Extend beyond pLeft toward x=0
                            const yAtLeft = getYAtX(0);
                            if (yAtLeft >= 0 && yAtLeft <= chartHeight) {
                              lineX1 = 0;
                              lineY1 = yAtLeft;
                            } else if (yAtLeft < 0) {
                              // Line exits through top edge
                              const xAtTop = getXAtY(0);
                              lineX1 = Math.max(0, xAtTop);
                              lineY1 = 0;
                            } else {
                              // Line exits through bottom edge
                              const xAtBottom = getXAtY(chartHeight);
                              lineX1 = Math.max(0, xAtBottom);
                              lineY1 = chartHeight;
                            }
                          }
                          
                          // Find intersection with right edge (toward larger X)
                          if (extendRight) {
                            const yAtRight = getYAtX(chartWidth);
                            if (yAtRight >= 0 && yAtRight <= chartHeight) {
                              lineX2 = chartWidth;
                              lineY2 = yAtRight;
                            } else if (yAtRight < 0) {
                              // Line exits through top edge
                              const xAtTop = getXAtY(0);
                              lineX2 = Math.min(chartWidth, xAtTop);
                              lineY2 = 0;
                            } else {
                              // Line exits through bottom edge  
                              const xAtBottom = getXAtY(chartHeight);
                              lineX2 = Math.min(chartWidth, xAtBottom);
                              lineY2 = chartHeight;
                            }
                          }
                        }
                      }
                      
                      // Label position: use extended endpoints, clamp within viewport
                      const labelPadding = 10;
                      let labelX = labelRight ? lineX2 + 5 : lineX1 - 5;
                      let labelY = labelRight ? lineY2 : lineY1;
                      
                      // Clamp label X within chart bounds
                      labelX = Math.max(labelPadding, Math.min(chartWidth - labelPadding, labelX));
                      // Clamp label Y within chart bounds  
                      labelY = Math.max(15, Math.min(chartHeight - 5, labelY));
                      
                      // Dynamic text anchor: use 'start' near left edge, 'end' near right edge
                      // This prevents labels from extending off-screen
                      const effectiveAnchor = labelX < 60 ? 'start' : (labelX > chartWidth - 60 ? 'end' : (labelRight ? 'start' : 'end'));
                      
                      return (
                        <g key={drawing.id} onClick={handleClick} style={{ cursor: drawingMode === 'select' ? 'pointer' : 'default' }}>
                          {/* Invisible hit area for selection - always present */}
                          <line 
                            x1={lineX1} y1={lineY1} x2={lineX2} y2={lineY2}
                            stroke="transparent"
                            strokeWidth={12}
                          />
                          {/* Visible line - only when editing (primitives render normally) */}
                          {renderVisible && (
                            <line 
                              x1={lineX1} y1={lineY1} x2={lineX2} y2={lineY2}
                              stroke={isSelected ? '#22c55e' : color}
                              strokeWidth={isSelected ? 3 : 2}
                            />
                          )}
                          {renderVisible && label && (
                            <text 
                              x={labelX}
                              y={labelY}
                              fill={isSelected ? '#22c55e' : color}
                              fontSize="11"
                              fontWeight="500"
                              textAnchor={effectiveAnchor}
                            >
                              {label}
                            </text>
                          )}
                          {/* Selection handles - show when selected */}
                          {isSelected && (
                            <>
                              <circle 
                                cx={p1.x} cy={p1.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 0, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 0, e)}
                              />
                              <circle 
                                cx={p2.x} cy={p2.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 1, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 1, e)}
                              />
                            </>
                          )}
                        </g>
                      );
                    }
                    
                    if (drawing.type === 'rectangle' && drawing.points.length >= 2) {
                      // If either point is being edited, hide the entire rectangle until replaced
                      if (isPointBeingEdited(0) || isPointBeingEdited(1)) {
                        const remainingIndex = isPointBeingEdited(0) ? 1 : 0;
                        const remainingPoint = toPixel(drawing.points[remainingIndex], remainingIndex);
                        return (
                          <g key={drawing.id}>
                            <circle cx={remainingPoint.x} cy={remainingPoint.y} r={6} fill={color} stroke="#fff" strokeWidth={2} />
                            <text x={remainingPoint.x + 10} y={remainingPoint.y - 10} fill="#fff" fontSize="12">Click to place point</text>
                          </g>
                        );
                      }
                      const p1 = toPixel(drawing.points[0], 0);
                      const p2 = toPixel(drawing.points[1], 1);
                      if (p1.x === null || p2.x === null) return null;
                      
                      const chartWidth = chartContainerRef.current?.clientWidth || 800;
                      const extendLeft = drawing.style?.extendLeft || false;
                      const extendRight = drawing.style?.extendRight || false;
                      
                      let x = Math.min(p1.x, p2.x);
                      let rectWidth = Math.abs(p2.x - p1.x);
                      const y = Math.min(p1.y, p2.y);
                      const h = Math.abs(p2.y - p1.y);
                      
                      if (extendLeft) {
                        rectWidth += x;
                        x = 0;
                      }
                      if (extendRight) {
                        rectWidth = chartWidth - x;
                      }
                      
                      const label = drawing.style?.label || '';
                      const labelRight = drawing.style?.labelPosition === 'right';
                      const labelX = labelRight ? Math.min(p1.x, p2.x) + Math.abs(p2.x - p1.x) - 5 : Math.min(p1.x, p2.x) + 5;
                      
                      return (
                        <g key={drawing.id} onClick={handleClick} style={{ cursor: drawingMode === 'select' ? 'pointer' : 'default' }}>
                          {/* Invisible hit area for selection */}
                          <rect 
                            x={x} y={y} width={rectWidth} height={h}
                            fill="transparent"
                            stroke="transparent"
                            strokeWidth={8}
                          />
                          {/* Visible graphics only when editing */}
                          {renderVisible && (
                            <rect 
                              x={x} y={y} width={rectWidth} height={h}
                              fill={`${color}20`}
                              stroke={isSelected ? '#22c55e' : color}
                              strokeWidth={isSelected ? 3 : 2}
                            />
                          )}
                          {renderVisible && label && (
                            <text 
                              x={labelX}
                              y={y + 14}
                              fill={isSelected ? '#22c55e' : color}
                              fontSize="11"
                              fontWeight="500"
                              textAnchor={labelRight ? 'end' : 'start'}
                            >
                              {label}
                            </text>
                          )}
                          {isSelected && (
                            <>
                              <circle 
                                cx={p1.x} cy={p1.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 0, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 0, e)}
                              />
                              <circle 
                                cx={p2.x} cy={p2.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 1, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 1, e)}
                              />
                            </>
                          )}
                        </g>
                      );
                    }
                    
                    if (drawing.type === 'channel' && drawing.points.length >= 2) {
                      const p1 = toPixel(drawing.points[0], 0);
                      const p2 = toPixel(drawing.points[1], 1);
                      if (p1.x === null || p2.x === null) return null;
                      const chartWidth = chartContainerRef.current?.clientWidth || 800;
                      
                      const extendLeft = drawing.style?.extendLeft;
                      const extendRight = drawing.style?.extendRight !== false; // Default true
                      const baseStartX = Math.min(p1.x, p2.x);
                      const baseEndX = Math.max(p1.x, p2.x) + 100;
                      const lineStartX = extendLeft ? 0 : baseStartX;
                      const lineEndX = extendRight ? chartWidth : baseEndX;
                      
                      return (
                        <g key={drawing.id} onClick={handleClick} style={{ cursor: drawingMode === 'select' ? 'pointer' : 'default' }}>
                          {/* Click target area for channel */}
                          <rect x={lineStartX} y={Math.min(p1.y, p2.y)} width={lineEndX - lineStartX} height={Math.abs(p2.y - p1.y)} fill="transparent" />
                          {/* Edit mode point handles */}
                          {renderVisible && (
                            <>
                              <circle 
                                cx={p1.x} cy={p1.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 0, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 0, e)}
                              />
                              <circle 
                                cx={p2.x} cy={p2.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 1, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 1, e)}
                              />
                            </>
                          )}
                        </g>
                      );
                    }
                    
                    if (drawing.type === 'fib_retracement' && drawing.points.length >= 2) {
                      const p1 = toPixel(drawing.points[0], 0);
                      const p2 = toPixel(drawing.points[1], 1);
                      if (p1.x === null || p2.x === null) return null;
                      const chartWidth = chartContainerRef.current?.clientWidth || 800;
                      
                      const extendLeft = drawing.style?.extendLeft;
                      const extendRight = drawing.style?.extendRight;
                      const baseStartX = Math.min(p1.x, p2.x);
                      const baseEndX = Math.max(p1.x, p2.x) + 100;
                      const lineStartX = extendLeft ? 0 : baseStartX;
                      const lineEndX = extendRight ? chartWidth : baseEndX;
                      
                      return (
                        <g key={drawing.id} onClick={handleClick} style={{ cursor: drawingMode === 'select' ? 'pointer' : 'default' }}>
                          {/* Click target area - always present (fib lines/labels drawn by primitive) */}
                          <rect x={lineStartX} y={p1.y < p2.y ? p1.y : p2.y} width={lineEndX - lineStartX} height={Math.abs(p2.y - p1.y)} fill="transparent" />
                          {/* Edit mode point handles */}
                          {renderVisible && (
                            <>
                              <circle 
                                cx={p1.x} cy={p1.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 0, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 0, e)}
                              />
                              <circle 
                                cx={p2.x} cy={p2.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 1, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 1, e)}
                              />
                            </>
                          )}
                        </g>
                      );
                    }
                    
                    if (drawing.type === 'trend_fib' && drawing.points.length >= 3) {
                      const p1 = toPixel(drawing.points[0], 0);
                      const p2 = toPixel(drawing.points[1], 1);
                      const p3 = toPixel(drawing.points[2], 2);
                      if (p1.x === null || p2.x === null || p3.x === null) return null;
                      
                      const waveDiff = drawing.points[1].price - drawing.points[0].price;
                      const allFibLevels = [0.618, 1.0, 1.272, 1.618, 2.0, 2.618];
                      const chartWidth = chartContainerRef.current?.clientWidth || 800;
                      
                      const extendLeft = drawing.style?.extendLeft;
                      const extendRight = drawing.style?.extendRight;
                      const baseStartX = p3.x;
                      const baseEndX = p3.x + 200;
                      const lineStartX = extendLeft ? 0 : baseStartX;
                      const lineEndX = extendRight ? chartWidth : baseEndX;
                      
                      // Calculate hit area bounds
                      const minY = Math.min(...allFibLevels.map(level => {
                        const levelPrice = drawing.points[2].price + waveDiff * level;
                        return candleSeriesRef.current?.priceToCoordinate(levelPrice) ?? 0;
                      }));
                      const maxY = Math.max(...allFibLevels.map(level => {
                        const levelPrice = drawing.points[2].price + waveDiff * level;
                        return candleSeriesRef.current?.priceToCoordinate(levelPrice) ?? 0;
                      }));
                      
                      return (
                        <g key={drawing.id} onClick={handleClick} style={{ cursor: drawingMode === 'select' ? 'pointer' : 'default' }}>
                          {/* Click target area (trend_fib lines/labels drawn by primitive) */}
                          <rect x={lineStartX} y={minY} width={lineEndX - lineStartX} height={maxY - minY} fill="transparent" />
                          {/* Wave measurement line - always visible for context */}
                          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? '#22c55e' : '#888'} strokeWidth={isSelected ? 2 : 1} strokeDasharray="4,2" />
                          {/* Edit mode point handles */}
                          {renderVisible && (
                            <>
                              <circle 
                                cx={p1.x} cy={p1.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 0, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 0, e)}
                              />
                              <circle 
                                cx={p2.x} cy={p2.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 1, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 1, e)}
                              />
                              <circle 
                                cx={p3.x} cy={p3.y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 2, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 2, e)}
                              />
                            </>
                          )}
                        </g>
                      );
                    }
                    
                    // Horizontal line - render SVG clickable overlay (label is shown on price axis via createPriceLine)
                    if (drawing.type === 'horizontal' && drawing.points.length >= 1) {
                      // If point is being edited, hide until replaced
                      if (isPointBeingEdited(0)) {
                        return (
                          <g key={drawing.id}>
                            <text x={50} y={300} fill="#fff" fontSize="12">Click to place horizontal line</text>
                          </g>
                        );
                      }
                      const y = candleSeriesRef.current?.priceToCoordinate(drawing.points[0].price) ?? 0;
                      const chartWidth = chartContainerRef.current?.clientWidth || 800;
                      
                      return (
                        <g key={drawing.id} onClick={handleClick} style={{ cursor: drawingMode === 'select' ? 'pointer' : 'default' }}>
                          {/* Invisible thicker line for easier clicking */}
                          <line 
                            x1={0} y1={y} x2={chartWidth} y2={y}
                            stroke="transparent"
                            strokeWidth={12}
                          />
                          {/* Selection highlight overlay */}
                          {isSelected && (
                            <>
                              <line 
                                x1={0} y1={y} x2={chartWidth} y2={y}
                                stroke="#22c55e"
                                strokeWidth={3}
                                strokeDasharray="0"
                              />
                              {/* Drag handle for horizontal line */}
                              <circle 
                                cx={50} cy={y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 0, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 0, e)}
                              />
                              <circle 
                                cx={chartWidth - 50} cy={y} r={8} 
                                fill="#22c55e" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                onMouseDown={(e) => handlePointPick(drawing.id, 0, e)}
                                onTouchStart={(e) => handlePointPick(drawing.id, 0, e)}
                              />
                            </>
                          )}
                        </g>
                      );
                    }
                    
                    return null;
                  })}
                  
                  {/* Temp drawing preview */}
                  {tempDrawing && tempDrawing.points.length > 0 && chartReady && (
                    (() => {
                      const toPixel = (point: { time: number; price: number }) => {
                        const x = chartRef.current?.timeScale().timeToCoordinate(point.time as any);
                        const y = candleSeriesRef.current?.priceToCoordinate(point.price);
                        return { x: x ?? 0, y: y ?? 0 };
                      };
                      
                      return tempDrawing.points.map((point, i) => {
                        const p = toPixel(point);
                        return (
                          <circle 
                            key={i} 
                            cx={p.x} 
                            cy={p.y} 
                            r={6} 
                            fill="#3b82f6" 
                            stroke="#fff" 
                            strokeWidth={2}
                          />
                        );
                      });
                    })()
                  )}
                </svg>
                
                {/* Drawing Tools Overlay */}
                <div className="absolute top-2 left-2 z-20 flex gap-1">
                  {/* Pencil/Draw Button */}
                  <button
                    onClick={() => setShowToolPicker(prev => !prev)}
                    className={`p-2 rounded-lg transition-all ${
                      drawingMode === 'draw' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
                    }`}
                    title="Drawing Tools"
                    data-testid="btn-drawing-tools"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  
                  {/* Select/Cursor Button */}
                  <button
                    onClick={() => {
                      setDrawingMode(prev => prev === 'select' ? 'off' : 'select');
                      setActiveTool(null);
                      setShowToolPicker(false);
                    }}
                    className={`p-2 rounded-lg transition-all ${
                      drawingMode === 'select' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
                    }`}
                    title="Select/Edit Drawings"
                    data-testid="btn-select-drawings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                  </button>
                  
                  {/* Deselect/Cancel Button */}
                  <button
                    onClick={() => {
                      setDrawingMode('off');
                      setActiveTool(null);
                      setShowToolPicker(false);
                      setSelectedDrawingId(null);
                      setTempDrawing(null);
                    }}
                    className="p-2 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-slate-700 transition-all"
                    title="Exit Drawing Mode"
                    data-testid="btn-deselect-drawing"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  
                  {/* Settings Button - only show when a drawing is selected */}
                  {selectedDrawingId && (
                    <button
                      onClick={() => setShowDrawingSettings(!showDrawingSettings)}
                      className={`p-2 rounded-lg transition-all ${showDrawingSettings ? 'bg-blue-500 text-white' : 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'}`}
                      title="Drawing Settings"
                      data-testid="btn-drawing-settings"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  )}
                  
                  {/* Delete Selected Button - only show when a drawing is selected */}
                  {selectedDrawingId && (
                    <button
                      onClick={() => {
                        deleteDrawingMutation.mutate(selectedDrawingId);
                        setSelectedDrawingId(null);
                        setShowDrawingSettings(false);
                        toast({ title: 'Drawing Deleted', description: 'Selected drawing removed from chart' });
                      }}
                      className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all animate-pulse"
                      title="Delete Selected Drawing"
                      data-testid="btn-delete-selected"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                  
                  {/* Auto-Snap Toggle Button (Magnet Icon) */}
                  <button
                    onClick={() => {
                      setAutoSnapEnabled(prev => !prev);
                      toast({ 
                        title: autoSnapEnabled ? 'Auto-Snap Disabled' : 'Auto-Snap Enabled',
                        description: autoSnapEnabled ? 'Points will be placed exactly where you tap' : 'Points will snap to nearest high/low'
                      });
                    }}
                    className={`p-2 rounded-lg transition-all ${
                      autoSnapEnabled 
                        ? 'bg-yellow-500 text-white' 
                        : 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
                    }`}
                    title={autoSnapEnabled ? 'Auto-Snap: ON (click to disable)' : 'Auto-Snap: OFF (click to enable)'}
                    data-testid="btn-auto-snap"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M6 15V9a6 6 0 1 1 12 0v6" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M6 15a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M18 15a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M6 15v4" strokeLinecap="round"/>
                      <path d="M18 15v4" strokeLinecap="round"/>
                    </svg>
                  </button>
                  
                  {/* Fullscreen Toggle Button */}
                  <button
                    onClick={() => {
                      setIsFullscreen(prev => !prev);
                      // Resize chart after a short delay to allow DOM to update
                      setTimeout(() => {
                        if (chartRef.current && chartContainerRef.current) {
                          chartRef.current.applyOptions({
                            width: chartContainerRef.current.clientWidth,
                            height: chartContainerRef.current.clientHeight
                          });
                        }
                      }, 100);
                    }}
                    className={`p-2 rounded-lg transition-all ${
                      isFullscreen 
                        ? 'bg-purple-500 text-white' 
                        : 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
                    }`}
                    title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen Mode'}
                    data-testid="btn-fullscreen"
                  >
                    {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                  </button>
                  
                  {/* Hide/Show Drawings Toggle Button */}
                  <button
                    onClick={() => {
                      setDrawingsVisible(prev => !prev);
                      toast({ 
                        title: drawingsVisible ? 'Drawings Hidden' : 'Drawings Visible',
                        description: drawingsVisible ? 'All drawings are now hidden' : 'All drawings are now visible'
                      });
                    }}
                    className={`p-2 rounded-lg transition-all ${
                      drawingsVisible 
                        ? 'bg-slate-800/90 text-gray-300 hover:bg-slate-700' 
                        : 'bg-orange-500 text-white'
                    }`}
                    title={drawingsVisible ? 'Hide Drawings' : 'Show Drawings'}
                    data-testid="btn-toggle-drawings"
                  >
                    {drawingsVisible ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    )}
                  </button>
                  
                  {/* Auto-Color Toggle Button (Palette Icon) */}
                  <button
                    onClick={() => {
                      setAutoColorEnabled(prev => !prev);
                      toast({ 
                        title: autoColorEnabled ? 'Auto-Color Disabled' : 'Auto-Color Enabled',
                        description: autoColorEnabled ? 'All drawings will be blue' : 'Green=support, Red=resistance, Blue=mixed'
                      });
                    }}
                    className={`p-2 rounded-lg transition-all ${
                      autoColorEnabled 
                        ? 'bg-gradient-to-r from-green-500 via-blue-500 to-red-500 text-white' 
                        : 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
                    }`}
                    title={autoColorEnabled ? 'Auto-Color: ON (click to disable)' : 'Auto-Color: OFF (click to enable)'}
                    data-testid="btn-auto-color"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="7.5" cy="11.5" r="1.5" fill="currentColor"/>
                      <circle cx="12" cy="7.5" r="1.5" fill="currentColor"/>
                      <circle cx="16.5" cy="11.5" r="1.5" fill="currentColor"/>
                    </svg>
                  </button>
                  
                  {/* Clear All Button */}
                  <button
                    onClick={() => {
                      if (drawings.length > 0 && confirm('Clear all drawings?')) {
                        clearDrawingsMutation.mutate();
                        setSelectedDrawingId(null);
                        toast({ title: 'Drawings Cleared', description: 'All drawings removed from chart' });
                      }
                    }}
                    className="p-2 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-red-600 hover:text-white transition-all"
                    title="Clear All Drawings"
                    data-testid="btn-clear-drawings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                
                {/* Tool Picker Popup */}
                {showToolPicker && (
                  <div className="absolute top-14 left-2 z-30 bg-slate-900 border border-slate-600 rounded-lg p-2 shadow-xl min-w-[180px]">
                    <div className="text-xs text-gray-400 mb-2 px-2">Select Drawing Tool</div>
                    {[
                      { id: 'trendline', name: 'Trend Line', icon: '📈' },
                      { id: 'horizontal', name: 'Horizontal Line', icon: '➖' },
                      { id: 'rectangle', name: 'Rectangle', icon: '⬜' },
                      { id: 'fib_retracement', name: 'Fib Retracement', icon: '📊' },
                      { id: 'trend_fib', name: 'Trend-Based Fib', icon: '📉' },
                      { id: 'channel', name: 'Channel', icon: '🐻‍❄️' },
                    ].map(tool => (
                      <button
                        key={tool.id}
                        onClick={() => {
                          setActiveTool(tool.id as DrawingTool);
                          setDrawingMode('draw');
                          setShowToolPicker(false);
                          setTempDrawing({ points: [] });
                          toast({ title: `${tool.name} Selected`, description: 'Click on chart to place points' });
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-700 transition-all text-left ${
                          activeTool === tool.id ? 'bg-blue-500/30 text-blue-300' : 'text-gray-300'
                        }`}
                        data-testid={`tool-${tool.id}`}
                      >
                        <span>{tool.icon}</span>
                        <span className="text-sm">{tool.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Drawing Settings Panel */}
                {showDrawingSettings && selectedDrawingId && (() => {
                  const selectedDrawing = drawings.find(d => d.id === selectedDrawingId);
                  if (!selectedDrawing) return null;
                  
                  const isFibTool = selectedDrawing.type === 'fib_retracement' || selectedDrawing.type === 'trend_fib';
                  const isChannelTool = selectedDrawing.type === 'channel';
                  const fibLevels = selectedDrawing.type === 'fib_retracement' 
                    ? [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618]
                    : [0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.0, 2.618, 3.618, 4.236];
                  const channelLevels = [0.25, 0.5, 0.75];
                  
                  // Helper for float comparison when checking hidden levels - use rounding for consistency
                  const roundLevel = (n: number) => Math.round(n * 10000) / 10000;
                  const isLevelHidden = (level: number, hiddenArr: number[]) => 
                    hiddenArr.some((h: number) => roundLevel(h) === roundLevel(level));
                  
                  const updateDrawingSettings = (newStyle: any) => {
                    const mergedStyle = { ...selectedDrawing.style, ...newStyle };
                    setDrawings(prev => prev.map(d => 
                      d.id === selectedDrawingId 
                        ? { ...d, style: mergedStyle }
                        : d
                    ));
                    // Update the primitive's style for immediate visual feedback
                    const primitive = drawingPrimitivesRef.current.get(selectedDrawingId);
                    if (primitive && typeof primitive.updateStyle === 'function') {
                      primitive.updateStyle(mergedStyle);
                    }
                    // Save to database
                    updateDrawingMutation.mutate({ id: selectedDrawingId, style: mergedStyle });
                  };
                  
                  return (
                    <div className="absolute top-14 left-2 z-30 bg-slate-900 border border-slate-600 rounded-lg p-3 shadow-xl min-w-[220px] max-h-[400px] overflow-y-auto">
                      <div className="text-xs text-gray-400 mb-3 flex justify-between items-center">
                        <span>Drawing Settings</span>
                        <button onClick={() => setShowDrawingSettings(false)} className="text-gray-500 hover:text-white">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      {isChannelTool ? (
                        <>
                          {/* Channel Settings Panel */}
                          
                          {/* Channel Level Toggles */}
                          <div className="mb-3">
                            <div className="text-xs text-gray-300 mb-2">Internal Markers</div>
                            <div className="space-y-1">
                              {channelLevels.map(level => {
                                const hiddenLevels = selectedDrawing.style?.hiddenLevels || [];
                                const customLabels = selectedDrawing.style?.customLabels || {};
                                const isVisible = !isLevelHidden(level, hiddenLevels);
                                const customLabel = customLabels[level] || '';
                                return (
                                  <div key={level} className="flex items-center gap-2 text-xs">
                                    <input 
                                      type="checkbox" 
                                      checked={isVisible}
                                      onChange={() => {
                                        const newHidden = isVisible 
                                          ? [...hiddenLevels, level]
                                          : hiddenLevels.filter((l: number) => roundLevel(l) !== roundLevel(level));
                                        updateDrawingSettings({ hiddenLevels: newHidden });
                                      }}
                                      className="rounded border-slate-600 w-4 h-4"
                                    />
                                    <span className="text-gray-400 w-10">{(level * 100).toFixed(0)}%</span>
                                    <input
                                      type="text"
                                      value={customLabel}
                                      onChange={(e) => {
                                        const newLabels = { ...customLabels, [level]: e.target.value };
                                        updateDrawingSettings({ customLabels: newLabels });
                                      }}
                                      placeholder="Custom label..."
                                      className="flex-1 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-xs text-white placeholder-gray-500"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          
                          {/* Top/Bottom Custom Labels */}
                          <div className="mb-3">
                            <div className="text-xs text-gray-300 mb-2">Boundary Labels</div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-red-400 w-14">Top:</span>
                                <input
                                  type="text"
                                  value={selectedDrawing.style?.customLabels?.['top'] || ''}
                                  onChange={(e) => {
                                    const customLabels = selectedDrawing.style?.customLabels || {};
                                    updateDrawingSettings({ customLabels: { ...customLabels, top: e.target.value } });
                                  }}
                                  placeholder="Top label..."
                                  className="flex-1 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-xs text-white placeholder-gray-500"
                                />
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-green-400 w-14">Bottom:</span>
                                <input
                                  type="text"
                                  value={selectedDrawing.style?.customLabels?.['bottom'] || ''}
                                  onChange={(e) => {
                                    const customLabels = selectedDrawing.style?.customLabels || {};
                                    updateDrawingSettings({ customLabels: { ...customLabels, bottom: e.target.value } });
                                  }}
                                  placeholder="Bottom label..."
                                  className="flex-1 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-xs text-white placeholder-gray-500"
                                />
                              </div>
                            </div>
                          </div>
                          
                          {/* Label Position */}
                          <div className="mb-3">
                            <div className="text-xs text-gray-300 mb-2">Label Position</div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateDrawingSettings({ labelPosition: 'left' })}
                                className={`flex-1 px-3 py-1 rounded text-xs ${selectedDrawing.style?.labelPosition !== 'right' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'}`}
                              >
                                Left
                              </button>
                              <button
                                onClick={() => updateDrawingSettings({ labelPosition: 'right' })}
                                className={`flex-1 px-3 py-1 rounded text-xs ${selectedDrawing.style?.labelPosition === 'right' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'}`}
                              >
                                Right
                              </button>
                            </div>
                          </div>
                          
                          {/* Extend Lines */}
                          <div className="mb-3">
                            <div className="text-xs text-gray-300 mb-2">Extend Lines</div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateDrawingSettings({ extendLeft: !selectedDrawing.style?.extendLeft })}
                                className={`flex-1 px-3 py-1 rounded text-xs flex items-center justify-center gap-1 ${
                                  selectedDrawing.style?.extendLeft 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-slate-700 text-gray-300'
                                }`}
                                data-testid="btn-extend-channel-left"
                              >
                                ← Left
                              </button>
                              <button
                                onClick={() => updateDrawingSettings({ extendRight: !selectedDrawing.style?.extendRight })}
                                className={`flex-1 px-3 py-1 rounded text-xs flex items-center justify-center gap-1 ${
                                  selectedDrawing.style?.extendRight 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-slate-700 text-gray-300'
                                }`}
                                data-testid="btn-extend-channel-right"
                              >
                                Right →
                              </button>
                            </div>
                          </div>
                          
                          {/* Hide Labels Toggle */}
                          <div className="mb-3">
                            <button
                              onClick={() => updateDrawingSettings({ hideLabels: !selectedDrawing.style?.hideLabels })}
                              className={`w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-2 ${
                                selectedDrawing.style?.hideLabels 
                                  ? 'bg-orange-600 text-white' 
                                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                              }`}
                              data-testid="btn-hide-channel-labels"
                            >
                              {selectedDrawing.style?.hideLabels ? '👁️‍🗨️ Labels Hidden' : '👁️ Hide Labels'}
                            </button>
                          </div>
                          
                          {/* Save as Default Button */}
                          <div className="mt-3 pt-3 border-t border-slate-600">
                            <button
                              onClick={() => {
                                const defaults = {
                                  hiddenLevels: selectedDrawing.style?.hiddenLevels || [],
                                  labelPosition: selectedDrawing.style?.labelPosition || 'right',
                                  extendLeft: selectedDrawing.style?.extendLeft || false,
                                  extendRight: selectedDrawing.style?.extendRight !== false,
                                  customLabels: selectedDrawing.style?.customLabels || {},
                                  hideLabels: selectedDrawing.style?.hideLabels || false,
                                };
                                localStorage.setItem('channelDefaults', JSON.stringify(defaults));
                                toast({ title: 'Defaults Saved', description: 'These settings will apply to new channel drawings' });
                              }}
                              className="w-full px-3 py-2 rounded text-xs bg-green-600 hover:bg-green-500 text-white flex items-center justify-center gap-2"
                              data-testid="btn-save-channel-defaults"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Save as Default
                            </button>
                          </div>
                        </>
                      ) : isFibTool ? (
                        <>
                          {/* Edit Mode Toggles - Two Buttons */}
                          <div className="mb-3 flex gap-1">
                            <button
                              onClick={() => setEditFibMode(editFibMode === 'values' ? 'none' : 'values')}
                              className={`flex-1 px-2 py-1.5 rounded text-xs flex items-center justify-center gap-1 ${
                                editFibMode === 'values' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                              }`}
                              data-testid="btn-edit-fib-values"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              Edit Values
                            </button>
                            <button
                              onClick={() => setEditFibMode(editFibMode === 'labels' ? 'none' : 'labels')}
                              className={`flex-1 px-2 py-1.5 rounded text-xs flex items-center justify-center gap-1 ${
                                editFibMode === 'labels' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                              }`}
                              data-testid="btn-edit-fib-labels"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit Labels
                            </button>
                          </div>
                          
                          {/* Fib Level Toggles / Edit Mode */}
                          <div className="mb-3">
                            <div className="text-xs text-gray-300 mb-2">
                              {editFibMode === 'values' ? 'Custom Values (moves lines)' : editFibMode === 'labels' ? 'Custom Labels' : 'Visible Levels'}
                            </div>
                            {editFibMode === 'values' ? (
                              <div className="space-y-1 max-h-[150px] overflow-y-auto">
                                {fibLevels.map((level, idx) => {
                                  const hiddenLevels = selectedDrawing.style?.hiddenLevels || [];
                                  const customValues = selectedDrawing.style?.customValues || {};
                                  const isVisible = !isLevelHidden(level, hiddenLevels);
                                  const currentValue = customValues[level] !== undefined ? customValues[level] : level;
                                  return (
                                    <div key={level} className="flex items-center gap-1 text-xs">
                                      <input 
                                        type="checkbox" 
                                        checked={isVisible}
                                        onChange={() => {
                                          const newHidden = isVisible 
                                            ? [...hiddenLevels, level]
                                            : hiddenLevels.filter((l: number) => roundLevel(l) !== roundLevel(level));
                                          updateDrawingSettings({ hiddenLevels: newHidden });
                                        }}
                                        className="rounded border-slate-600 w-4 h-4"
                                      />
                                      <span className="text-gray-500 w-12 text-[10px]">{(level * 100).toFixed(1)}%</span>
                                      <input
                                        type="number"
                                        step="0.001"
                                        value={currentValue}
                                        onChange={(e) => {
                                          const newVal = parseFloat(e.target.value);
                                          if (!isNaN(newVal)) {
                                            const newValues = { ...customValues, [level]: newVal };
                                            updateDrawingSettings({ customValues: newValues });
                                          }
                                        }}
                                        className="flex-1 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-xs text-white"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            ) : editFibMode === 'labels' ? (
                              <div className="space-y-1 max-h-[150px] overflow-y-auto">
                                {fibLevels.map(level => {
                                  const hiddenLevels = selectedDrawing.style?.hiddenLevels || [];
                                  const customLabels = selectedDrawing.style?.customLabels || {};
                                  const isVisible = !isLevelHidden(level, hiddenLevels);
                                  const customLabel = customLabels[level] || '';
                                  return (
                                    <div key={level} className="flex items-center gap-1 text-xs">
                                      <input 
                                        type="checkbox" 
                                        checked={isVisible}
                                        onChange={() => {
                                          const newHidden = isVisible 
                                            ? [...hiddenLevels, level]
                                            : hiddenLevels.filter((l: number) => roundLevel(l) !== roundLevel(level));
                                          updateDrawingSettings({ hiddenLevels: newHidden });
                                        }}
                                        className="rounded border-slate-600 w-4 h-4"
                                      />
                                      <span className="text-gray-400 w-12">{(level * 100).toFixed(1)}%</span>
                                      <input
                                        type="text"
                                        value={customLabel}
                                        onChange={(e) => {
                                          const newLabels = { ...customLabels, [level]: e.target.value };
                                          updateDrawingSettings({ customLabels: newLabels });
                                        }}
                                        placeholder="Custom label..."
                                        className="flex-1 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-xs text-white placeholder-gray-500"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-1">
                                {fibLevels.map(level => {
                                  const hiddenLevels = selectedDrawing.style?.hiddenLevels || [];
                                  const isVisible = !isLevelHidden(level, hiddenLevels);
                                  const customLabels = selectedDrawing.style?.customLabels || {};
                                  const customValues = selectedDrawing.style?.customValues || {};
                                  const displayValue = customValues[level] !== undefined ? customValues[level] : level;
                                  const displayLabel = customLabels[level] || `${(displayValue * 100).toFixed(1)}%`;
                                  return (
                                    <label key={level} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:bg-slate-800 p-1 rounded">
                                      <input 
                                        type="checkbox" 
                                        checked={isVisible}
                                        onChange={() => {
                                          const newHidden = isVisible 
                                            ? [...hiddenLevels, level]
                                            : hiddenLevels.filter((l: number) => roundLevel(l) !== roundLevel(level));
                                          updateDrawingSettings({ hiddenLevels: newHidden });
                                        }}
                                        className="rounded border-slate-600"
                                      />
                                      {displayLabel}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          
                          {/* Label Position */}
                          <div className="mb-3">
                            <div className="text-xs text-gray-300 mb-2">Label Position</div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateDrawingSettings({ labelPosition: 'left' })}
                                className={`flex-1 px-3 py-1 rounded text-xs ${selectedDrawing.style?.labelPosition !== 'right' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'}`}
                              >
                                Left
                              </button>
                              <button
                                onClick={() => updateDrawingSettings({ labelPosition: 'right' })}
                                className={`flex-1 px-3 py-1 rounded text-xs ${selectedDrawing.style?.labelPosition === 'right' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'}`}
                              >
                                Right
                              </button>
                            </div>
                          </div>
                          
                          {/* Extend Lines - For Fib Tools */}
                          <div className="mb-3">
                            <div className="text-xs text-gray-300 mb-2">Extend Lines</div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateDrawingSettings({ extendLeft: !selectedDrawing.style?.extendLeft })}
                                className={`flex-1 px-3 py-1 rounded text-xs flex items-center justify-center gap-1 ${
                                  selectedDrawing.style?.extendLeft 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-slate-700 text-gray-300'
                                }`}
                                data-testid="btn-extend-fib-left"
                              >
                                ← Left
                              </button>
                              <button
                                onClick={() => updateDrawingSettings({ extendRight: !selectedDrawing.style?.extendRight })}
                                className={`flex-1 px-3 py-1 rounded text-xs flex items-center justify-center gap-1 ${
                                  selectedDrawing.style?.extendRight 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-slate-700 text-gray-300'
                                }`}
                                data-testid="btn-extend-fib-right"
                              >
                                Right →
                              </button>
                            </div>
                          </div>
                          
                          {/* Hide Labels Toggle */}
                          <div className="mb-3">
                            <button
                              onClick={() => updateDrawingSettings({ hideLabels: !selectedDrawing.style?.hideLabels })}
                              className={`w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-2 ${
                                selectedDrawing.style?.hideLabels 
                                  ? 'bg-orange-600 text-white' 
                                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                              }`}
                              data-testid="btn-hide-fib-labels"
                            >
                              {selectedDrawing.style?.hideLabels ? '👁️‍🗨️ Labels Hidden' : '👁️ Hide Labels'}
                            </button>
                          </div>
                          
                          {/* Save as Default Button */}
                          <div className="mt-3 pt-3 border-t border-slate-600">
                            <button
                              onClick={() => {
                                const defaultKey = `fibDefaults_${selectedDrawing.type}`;
                                const defaults = {
                                  hiddenLevels: selectedDrawing.style?.hiddenLevels || [],
                                  labelPosition: selectedDrawing.style?.labelPosition || 'left',
                                  extendLeft: selectedDrawing.style?.extendLeft || false,
                                  extendRight: selectedDrawing.style?.extendRight || false,
                                  customLabels: selectedDrawing.style?.customLabels || {},
                                  customValues: selectedDrawing.style?.customValues || {},
                                  hideLabels: selectedDrawing.style?.hideLabels || false,
                                };
                                localStorage.setItem(defaultKey, JSON.stringify(defaults));
                                toast({ title: 'Defaults Saved', description: 'These settings will apply to new drawings' });
                              }}
                              className="w-full px-3 py-2 rounded text-xs bg-green-600 hover:bg-green-500 text-white flex items-center justify-center gap-2"
                              data-testid="btn-save-fib-defaults"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Save as Default
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Label Text */}
                          <div className="mb-3">
                            <div className="text-xs text-gray-300 mb-2">Label (optional)</div>
                            <input 
                              type="text"
                              value={selectedDrawing.style?.label || ''}
                              onChange={(e) => updateDrawingSettings({ label: e.target.value })}
                              placeholder="Enter label..."
                              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500"
                              data-testid="input-drawing-label"
                            />
                          </div>
                          
                          {/* Show Label Toggle */}
                          <div className="mb-3">
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-gray-300">Show Label</div>
                              <button
                                onClick={() => updateDrawingSettings({ showLabel: !(selectedDrawing.style?.showLabel !== false) })}
                                className={`relative w-10 h-5 rounded-full transition-colors ${
                                  selectedDrawing.style?.showLabel !== false ? 'bg-blue-500' : 'bg-slate-600'
                                }`}
                                data-testid="toggle-show-label"
                              >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                  selectedDrawing.style?.showLabel !== false ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                              </button>
                            </div>
                          </div>
                          
                          {/* Label Position - only show if showLabel is enabled and there's a label */}
                          {selectedDrawing.style?.showLabel !== false && selectedDrawing.style?.label && (
                            <div className="mb-3">
                              <div className="text-xs text-gray-300 mb-2">Label Position</div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => updateDrawingSettings({ labelPosition: 'left' })}
                                  className={`flex-1 px-3 py-1 rounded text-xs ${selectedDrawing.style?.labelPosition !== 'right' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'}`}
                                >
                                  Left
                                </button>
                                <button
                                  onClick={() => updateDrawingSettings({ labelPosition: 'right' })}
                                  className={`flex-1 px-3 py-1 rounded text-xs ${selectedDrawing.style?.labelPosition === 'right' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'}`}
                                >
                                  Right
                                </button>
                              </div>
                            </div>
                          )}
                          
                          {/* Extend Options - For trendlines and rectangles */}
                          {(selectedDrawing.type === 'trendline' || selectedDrawing.type === 'rectangle') && (
                            <div className="mb-3">
                              <div className="text-xs text-gray-300 mb-2">Extend Line</div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => updateDrawingSettings({ extendLeft: !selectedDrawing.style?.extendLeft })}
                                  className={`flex-1 px-3 py-1 rounded text-xs flex items-center justify-center gap-1 ${
                                    selectedDrawing.style?.extendLeft 
                                      ? 'bg-blue-500 text-white' 
                                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                                  }`}
                                  data-testid="btn-extend-left"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                  </svg>
                                  Left
                                </button>
                                <button
                                  onClick={() => updateDrawingSettings({ extendRight: !selectedDrawing.style?.extendRight })}
                                  className={`flex-1 px-3 py-1 rounded text-xs flex items-center justify-center gap-1 ${
                                    selectedDrawing.style?.extendRight 
                                      ? 'bg-blue-500 text-white' 
                                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                                  }`}
                                  data-testid="btn-extend-right"
                                >
                                  Right
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )}
                          
                          {/* Color Picker */}
                          <div className="mb-3">
                            <div className="text-xs text-gray-300 mb-2">Color</div>
                            <div className="flex flex-wrap gap-2">
                              {['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ffffff'].map(color => (
                                <button
                                  key={color}
                                  onClick={() => updateDrawingSettings({ color })}
                                  className={`w-6 h-6 rounded-full border-2 ${selectedDrawing.style?.color === color ? 'border-white' : 'border-transparent'}`}
                                  style={{ backgroundColor: color }}
                                  data-testid={`color-${color.replace('#', '')}`}
                                />
                              ))}
                            </div>
                          </div>
                          
                          {/* Horizontal Line Alert Button */}
                          {selectedDrawing.type === 'horizontal' && (
                            <div className="mt-3 pt-3 border-t border-slate-600">
                              <button
                                onClick={() => {
                                  const isActive = !selectedDrawing.style?.alertActive;
                                  updateDrawingSettings({ 
                                    alertActive: isActive,
                                    alertTriggered: isActive ? false : selectedDrawing.style?.alertTriggered 
                                  });
                                  toast({
                                    title: isActive ? '🔔 Alert Activated' : '🔕 Alert Deactivated',
                                    description: isActive 
                                      ? `You'll be notified when price crosses ${selectedDrawing.style?.label || 'this level'}`
                                      : 'Price crossing alert disabled',
                                  });
                                }}
                                className={`w-full px-3 py-2 rounded text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                  selectedDrawing.style?.alertActive 
                                    ? 'bg-amber-500 text-white hover:bg-amber-600' 
                                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                                }`}
                                data-testid="btn-toggle-hline-alert"
                              >
                                {selectedDrawing.style?.alertActive ? (
                                  <>
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
                                    </svg>
                                    Alert Active
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12-.1.03-.2.07-.3.11h-.01c-.01 0-.01 0-.02.01-.23.09-.46.2-.68.31 0 0-.01 0-.01.01L18 14.68z"/>
                                    </svg>
                                    Activate Alert
                                  </>
                                )}
                              </button>
                              {selectedDrawing.style?.alertTriggered && (
                                <div className="mt-2 text-xs text-amber-400 text-center">
                                  ✓ Alert was triggered
                                </div>
                              )}
                              {/* Test Push Button */}
                              <button
                                onClick={async () => {
                                  try {
                                    const response = await authenticatedApiRequest('POST', '/api/crypto/test-push');
                                    const data = await response.json();
                                    if (data.success) {
                                      toast({
                                        title: '✅ Test Push Sent',
                                        description: data.message,
                                      });
                                    } else {
                                      toast({
                                        title: '❌ Push Failed',
                                        description: data.message || data.error,
                                        variant: 'destructive',
                                      });
                                    }
                                  } catch (error: any) {
                                    toast({
                                      title: '❌ Error',
                                      description: error.message || 'Failed to send test push',
                                      variant: 'destructive',
                                    });
                                  }
                                }}
                                className="w-full mt-2 px-3 py-2 rounded text-sm font-medium bg-slate-600 text-gray-200 hover:bg-slate-500 transition-all flex items-center justify-center gap-2"
                                data-testid="btn-test-push"
                              >
                                📲 Test Push Notification
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
                
                {/* Active Tool Indicator */}
                {activeTool && drawingMode === 'draw' && (
                  <div className="absolute top-2 left-44 z-20 bg-blue-500/90 text-white px-3 py-1 rounded-lg text-xs font-medium">
                    Drawing: {activeTool.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    {tempDrawing && ` (${tempDrawing.points.length}/${activeTool === 'horizontal' ? 1 : 2} points)`}
                  </div>
                )}
              </div>
            )}
            
            {/* Chart Controls - Tabbed Interface */}
            {!loading && (
              <div ref={chartControlsRef} className="mt-4 border-t border-slate-700 pt-4">
                {/* Tab Buttons */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <button
                    onClick={() => setChartControlsTab('smc')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      chartControlsTab === 'smc'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
                    }`}
                    data-testid="tab-smc-controls"
                  >
                    SMC Controls
                  </button>
                  <button
                    onClick={() => setChartControlsTab('trend')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      chartControlsTab === 'trend'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
                    }`}
                    data-testid="tab-trend-tools"
                  >
                    Trend Tools
                  </button>
                  <button
                    onClick={() => setChartControlsTab('vwap')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      chartControlsTab === 'vwap'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
                    }`}
                    data-testid="tab-vwap"
                  >
                    VWAP
                  </button>
                  <button
                    onClick={() => setChartControlsTab('oscillators')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      chartControlsTab === 'oscillators'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
                    }`}
                    data-testid="tab-oscillators"
                  >
                    OSC
                  </button>
                </div>

                {/* Tab Content - Only show when a tab is selected */}
                {chartControlsTab && (
                  <div className="bg-slate-900 rounded-lg p-4 min-h-[120px]">
                  {/* SMC Controls Tab */}
                  {chartControlsTab === 'smc' && (
                    <div className="space-y-3">
                      {/* Tier restriction notice */}
                      {!isPaidTier && (
                        <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg px-3 py-2 text-xs text-amber-200">
                          SMC tools require a paid subscription. <a href="/plans" className="underline text-amber-400">Upgrade for all SMC tools</a>
                        </div>
                      )}
                      {/* Main toggles */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showFVG} onCheckedChange={() => handleSMCToolToggle('FVG', showFVG, setShowFVG)} id="show-fvg" data-testid="switch-fvg" disabled={!isPaidTier && !showFVG} />
                          <Label htmlFor="show-fvg" className="text-sm text-white cursor-pointer">FVG {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showBOS} onCheckedChange={() => handleSMCToolToggle('BOS', showBOS, setShowBOS)} id="show-bos" data-testid="switch-bos" disabled={!isPaidTier && !showBOS} />
                          <Label htmlFor="show-bos" className="text-sm text-white cursor-pointer">BOS {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showCHoCH} onCheckedChange={() => handleSMCToolToggle('CHoCH', showCHoCH, setShowCHoCH)} id="show-choch" data-testid="switch-choch" disabled={!isPaidTier && !showCHoCH} />
                          <Label htmlFor="show-choch" className="text-sm text-white cursor-pointer">CHoCH {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showSwingPivots} onCheckedChange={() => handleSMCToolToggle('Swing Pivots', showSwingPivots, setShowSwingPivots)} id="show-pivots" data-testid="switch-pivots" disabled={!isPaidTier && !showSwingPivots} />
                          <Label htmlFor="show-pivots" className="text-sm text-white cursor-pointer">Swing Pivots {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={stratLiquidityGrab} onCheckedChange={() => handleSMCToolToggle('Liquidity Sweeps', stratLiquidityGrab, setStratLiquidityGrab)} id="show-liquidity" data-testid="switch-liquidity" disabled={!isPaidTier && !stratLiquidityGrab} />
                          <Label htmlFor="show-liquidity" className="text-sm text-white cursor-pointer">Liquidity Sweeps {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showOrderBlocks} onCheckedChange={() => handleSMCToolToggle('Order Blocks', showOrderBlocks, setShowOrderBlocks)} id="show-order-blocks" data-testid="switch-order-blocks" disabled={!isPaidTier && !showOrderBlocks} />
                          <Label htmlFor="show-order-blocks" className="text-sm text-white cursor-pointer">Order Blocks {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showPremiumDiscount} onCheckedChange={() => handleSMCToolToggle('Premium/Discount', showPremiumDiscount, setShowPremiumDiscount)} id="show-premium-discount" data-testid="switch-premium-discount" disabled={!isPaidTier && !showPremiumDiscount} />
                          <Label htmlFor="show-premium-discount" className="text-sm text-white cursor-pointer">Premium/Discount {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showChartLabels} onCheckedChange={() => handleSMCToolToggle('Chart Labels', showChartLabels, setShowChartLabels)} id="show-labels" data-testid="switch-labels" disabled={!isPaidTier && !showChartLabels} />
                          <Label htmlFor="show-labels" className="text-sm text-white cursor-pointer">Chart Labels {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={cvdSpikeEnabled} onCheckedChange={() => handleSMCToolToggle('CVD Spikes', cvdSpikeEnabled, setCvdSpikeEnabled)} id="cvd-spike" data-testid="switch-cvd-spike" disabled={!isPaidTier && !cvdSpikeEnabled} />
                          <Label htmlFor="cvd-spike" className="text-sm text-white cursor-pointer">CVD Spikes {!isPaidTier && '🔒'}</Label>
                        </div>
                      </div>
                      
                      {/* CVD Spike Level Settings */}
                      {cvdSpikeEnabled && (
                        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                          <div className="text-xs font-semibold text-blue-400 mb-2">CVD Spike Levels (% of avg delta)</div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="flex flex-col items-center gap-1">
                              <Label className="text-xs text-gray-300">Lvl 1 ▲</Label>
                              <input
                                type="number"
                                min="100"
                                max="500"
                                value={cvdSpikeLevel1Input}
                                onChange={(e) => {
                                  setCvdSpikeLevel1Input(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 100) setCvdSpikeLevel1(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 text-center"
                                data-testid="input-cvd-spike-level1"
                              />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <Label className="text-xs text-gray-300">Lvl 2 ▲²</Label>
                              <input
                                type="number"
                                min="100"
                                max="1000"
                                value={cvdSpikeLevel2Input}
                                onChange={(e) => {
                                  setCvdSpikeLevel2Input(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 100) setCvdSpikeLevel2(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 text-center"
                                data-testid="input-cvd-spike-level2"
                              />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <Label className="text-xs text-gray-300">Lvl 3 ▲³</Label>
                              <input
                                type="number"
                                min="100"
                                max="2000"
                                value={cvdSpikeLevel3Input}
                                onChange={(e) => {
                                  setCvdSpikeLevel3Input(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 100) setCvdSpikeLevel3(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 text-center"
                                data-testid="input-cvd-spike-level3"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* FVG Settings */}
                      {showFVG && (
                        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                          <div className="text-xs font-semibold text-blue-400 mb-2">FVG Settings</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">High Value Only</Label>
                              <Switch checked={showHighValueOnly} onCheckedChange={setShowHighValueOnly} />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Volume Threshold</Label>
                              <input
                                type="number"
                                min="1"
                                max="3"
                                step="0.1"
                                value={fvgVolumeThreshold}
                                onChange={(e) => setFvgVolumeThreshold(parseFloat(e.target.value))}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* BOS Settings */}
                      {showBOS && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">BOS Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Swing Length</Label>
                            <input
                              type="number"
                              min="5"
                              max="30"
                              value={chartBosSwingLengthInput}
                              onChange={(e) => {
                                setChartBosSwingLengthInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setChartBosSwingLength(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-bos-swing-length"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* CHoCH Settings */}
                      {showCHoCH && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">CHoCH Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Swing Length</Label>
                            <input
                              type="number"
                              min="5"
                              max="30"
                              value={chartChochSwingLengthInput}
                              onChange={(e) => {
                                setChartChochSwingLengthInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setChartChochSwingLength(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Swing Pivots Settings */}
                      {showSwingPivots && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Swing Pivot Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Swing Length</Label>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={swingPivotLengthInput}
                              onChange={(e) => {
                                setSwingPivotLengthInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 1) setSwingPivotLength(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Liquidity Sweeps Settings */}
                      {stratLiquidityGrab && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Liquidity Sweep Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Swing Length</Label>
                            <input
                              type="number"
                              min="5"
                              max="50"
                              value={chartLiquiditySweepSwingLengthInput}
                              onChange={(e) => {
                                setChartLiquiditySweepSwingLengthInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setChartLiquiditySweepSwingLength(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Order Blocks Settings */}
                      {showOrderBlocks && (
                        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Order Blocks Settings</div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs text-gray-300">Swing Length</Label>
                              <input
                                type="number"
                                min="5"
                                max="50"
                                value={obSwingLengthInput}
                                onChange={(e) => {
                                  setObSwingLengthInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setObSwingLength(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-ob-swing-length"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs text-gray-300">Lookback</Label>
                              <input
                                type="number"
                                min="20"
                                max="200"
                                step="10"
                                value={orderBlockLengthInput}
                                onChange={(e) => {
                                  setOrderBlockLengthInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 20) setOrderBlockLength(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-ob-lookback"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">Swing length for block detection | Lookback limits how far to search</p>
                        </div>
                      )}
                      
                      {/* Premium/Discount Settings */}
                      {showPremiumDiscount && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Premium/Discount Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Lookback Period</Label>
                            <input
                              type="number"
                              min="20"
                              max="200"
                              value={pdLookbackInput}
                              onChange={(e) => {
                                setPdLookbackInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 20) setPdLookback(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-pd-lookback"
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Candles to look back for range calculation (larger = wider zones)</p>
                        </div>
                      )}
                      
                      <div className="text-xs text-gray-400 bg-slate-800/50 rounded-lg p-2">
                        <p><strong>Order Blocks:</strong> Institutional support/resistance zones</p>
                        <p><strong>Premium/Discount:</strong> Shows if price is in upper or lower half of range</p>
                      </div>
                      
                      {/* Save Buttons */}
                      <div className="pt-2 border-t border-slate-700 flex gap-2">
                        <Button
                          onClick={saveToTimeframe}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
                          data-testid="button-save-smc-to-timeframe"
                        >
                          <Save className="w-3 h-3 mr-1" />
                          Save to {interval}
                        </Button>
                        <Button
                          onClick={makeTimeframeDefault}
                          variant="outline"
                          className="bg-slate-700 hover:bg-slate-600 text-white text-xs h-8 px-2"
                          data-testid="button-make-smc-default"
                        >
                          ⭐
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Trend Tools Tab */}
                  {chartControlsTab === 'trend' && (
                    <div className="space-y-3">
                      {/* Tier restriction notice */}
                      {!isPaidTier && (
                        <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg px-3 py-2 text-xs text-blue-200">
                          Free tier: EMA & SMA only. <a href="/plans" className="underline text-blue-400">Upgrade for all trend tools</a>
                        </div>
                      )}
                      {/* Main toggles */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2">
                          <Switch checked={showEMA} onCheckedChange={() => handleTrendToolToggle('EMA', showEMA, setShowEMA)} id="show-ema" data-testid="switch-ema" />
                          <Label htmlFor="show-ema" className="text-sm text-white cursor-pointer">EMA</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showSMA} onCheckedChange={() => handleTrendToolToggle('SMA', showSMA, setShowSMA)} id="show-sma" data-testid="switch-sma" />
                          <Label htmlFor="show-sma" className="text-sm text-white cursor-pointer">SMA</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showBB} onCheckedChange={() => handleTrendToolToggle('Bollinger Bands', showBB, setShowBB)} id="show-bb" data-testid="switch-bollinger-bands" disabled={!isPaidTier && !showBB} />
                          <Label htmlFor="show-bb" className="text-sm text-white cursor-pointer">Bollinger Bands {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showSupertrend} onCheckedChange={() => handleTrendToolToggle('Supertrend', showSupertrend, setShowSupertrend)} id="show-supertrend" data-testid="switch-supertrend" disabled={!isPaidTier && !showSupertrend} />
                          <Label htmlFor="show-supertrend" className="text-sm text-white cursor-pointer">Supertrend {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showParabolicSAR} onCheckedChange={() => handleTrendToolToggle('Parabolic SAR', showParabolicSAR, setShowParabolicSAR)} id="show-sar" data-testid="switch-sar" disabled={!isPaidTier && !showParabolicSAR} />
                          <Label htmlFor="show-sar" className="text-sm text-white cursor-pointer">Parabolic SAR {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showAutoTrendlines} onCheckedChange={() => handleTrendToolToggle('Auto Trendlines', showAutoTrendlines, setShowAutoTrendlines)} id="show-trendlines" data-testid="switch-trendlines" disabled={!isPaidTier && !showAutoTrendlines} />
                          <Label htmlFor="show-trendlines" className="text-sm text-white cursor-pointer">Auto Trendlines {!isPaidTier && '🔒'}</Label>
                        </div>
                      </div>
                      
                      {/* EMA Settings - Dynamic List */}
                      {showEMA && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <div className="text-xs font-semibold text-blue-400">EMA Lines</div>
                            {emaConfigs.length < 6 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs text-green-400 hover:text-green-300"
                                onClick={() => {
                                  const newId = `ema${Date.now()}`;
                                  const colorIdx = emaConfigs.length % MA_COLORS.length;
                                  setEmaConfigs([...emaConfigs, { id: newId, period: 50, timeframe: 'current', color: MA_COLORS[colorIdx] }]);
                                  setEmaInputs(prev => ({ ...prev, [newId]: '50' }));
                                }}
                              >
                                + Add EMA
                              </Button>
                            )}
                          </div>
                          <div className="space-y-2">
                            {emaConfigs.map((config, idx) => (
                              <div key={config.id} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={emaInputs[config.id] ?? String(config.period)}
                                  onChange={(e) => {
                                    const inputVal = e.target.value;
                                    setEmaInputs(prev => ({ ...prev, [config.id]: inputVal }));
                                    const val = parseInt(inputVal);
                                    if (!isNaN(val) && val >= 5 && val <= 500) {
                                      setEmaConfigs(emaConfigs.map(c => c.id === config.id ? { ...c, period: val } : c));
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (isNaN(val) || val < 5) {
                                      setEmaInputs(prev => ({ ...prev, [config.id]: String(config.period) }));
                                    }
                                  }}
                                  className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                />
                                <select
                                  value={config.timeframe}
                                  onChange={(e) => setEmaConfigs(emaConfigs.map(c => c.id === config.id ? { ...c, timeframe: e.target.value } : c))}
                                  className="bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                >
                                  {MA_TIMEFRAMES.map(tf => (
                                    <option key={tf.value} value={tf.value}>{tf.label}</option>
                                  ))}
                                </select>
                                {emaConfigs.length > 1 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                    onClick={() => setEmaConfigs(emaConfigs.filter(c => c.id !== config.id))}
                                  >
                                    ×
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Bollinger Bands Settings */}
                      {showBB && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Bollinger Bands Settings</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Period</Label>
                              <input
                                type="number"
                                min="5"
                                max="100"
                                value={bbPeriodInput}
                                onChange={(e) => {
                                  setBbPeriodInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setBbPeriod(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-bb-period"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Std Dev</Label>
                              <input
                                type="number"
                                min="0.5"
                                max="4"
                                step="0.1"
                                value={bbStdDevInput}
                                onChange={(e) => {
                                  setBbStdDevInput(e.target.value);
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val >= 0.5) setBbStdDev(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-bb-stddev"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Auto Trendlines Settings */}
                      {showAutoTrendlines && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Auto Trendline Settings</div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Min Touches</Label>
                              <input
                                type="number"
                                min="3"
                                max="5"
                                value={trendlineMinTouchesInput}
                                onChange={(e) => {
                                  setTrendlineMinTouchesInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 3) setTrendlineMinTouches(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Tolerance %</Label>
                              <input
                                type="number"
                                min="0.1"
                                max="1.0"
                                step="0.1"
                                value={trendlineToleranceInput}
                                onChange={(e) => {
                                  setTrendlineToleranceInput(e.target.value);
                                  const val = parseFloat(e.target.value) / 100;
                                  if (!isNaN(val) && val >= 0.001) setTrendlineTolerance(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Pivot Length</Label>
                              <input
                                type="number"
                                min="5"
                                max="20"
                                value={trendlinePivotLengthInput}
                                onChange={(e) => {
                                  setTrendlinePivotLengthInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setTrendlinePivotLength(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* SMA Settings - Dynamic List */}
                      {showSMA && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <div className="text-xs font-semibold text-amber-400">SMA Lines</div>
                            {smaConfigs.length < 6 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs text-green-400 hover:text-green-300"
                                onClick={() => {
                                  const newId = `sma${Date.now()}`;
                                  const colorIdx = smaConfigs.length % MA_COLORS.length;
                                  setSmaConfigs([...smaConfigs, { id: newId, period: 50, timeframe: 'current', color: MA_COLORS[colorIdx] }]);
                                }}
                              >
                                + Add SMA
                              </Button>
                            )}
                          </div>
                          <div className="space-y-2">
                            {smaConfigs.map((config, idx) => (
                              <div key={config.id} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
                                <input
                                  type="number"
                                  min="5"
                                  max="500"
                                  value={config.period}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val) && val >= 5) {
                                      setSmaConfigs(smaConfigs.map(c => c.id === config.id ? { ...c, period: val } : c));
                                    }
                                  }}
                                  className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                />
                                <select
                                  value={config.timeframe}
                                  onChange={(e) => setSmaConfigs(smaConfigs.map(c => c.id === config.id ? { ...c, timeframe: e.target.value } : c))}
                                  className="bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                >
                                  {MA_TIMEFRAMES.map(tf => (
                                    <option key={tf.value} value={tf.value}>{tf.label}</option>
                                  ))}
                                </select>
                                {smaConfigs.length > 1 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                    onClick={() => setSmaConfigs(smaConfigs.filter(c => c.id !== config.id))}
                                  >
                                    ×
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Supertrend Settings */}
                      {showSupertrend && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Supertrend Settings</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">ATR Period</Label>
                              <input
                                type="number"
                                min="5"
                                max="50"
                                value={supertrendPeriodInput}
                                onChange={(e) => {
                                  setSupertrendPeriodInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setSupertrendPeriod(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-supertrend-period"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Multiplier</Label>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                step="0.5"
                                value={supertrendMultiplierInput}
                                onChange={(e) => {
                                  setSupertrendMultiplierInput(e.target.value);
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val >= 1) setSupertrendMultiplier(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-supertrend-multiplier"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Clear buy/sell signals based on ATR</p>
                        </div>
                      )}
                      
                      {/* Parabolic SAR Settings */}
                      {showParabolicSAR && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Parabolic SAR Settings</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Step</Label>
                              <input
                                type="number"
                                min="0.01"
                                max="0.1"
                                step="0.01"
                                value={sarStepInput}
                                onChange={(e) => {
                                  setSarStepInput(e.target.value);
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val >= 0.01) setSarStep(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-sar-step"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Max</Label>
                              <input
                                type="number"
                                min="0.1"
                                max="0.5"
                                step="0.05"
                                value={sarMaxInput}
                                onChange={(e) => {
                                  setSarMaxInput(e.target.value);
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val >= 0.1) setSarMax(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-sar-max"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Trailing stop indicator</p>
                        </div>
                      )}
                      
                      <div className="text-xs text-gray-400 bg-slate-800/50 rounded-lg p-2">
                        <p><strong>SMA:</strong> Simple Moving Average - smooth trend indicator</p>
                        <p><strong>Supertrend:</strong> Buy/sell signals based on ATR volatility</p>
                        <p><strong>Ichimoku:</strong> Comprehensive trend system with support/resistance cloud</p>
                        <p><strong>Parabolic SAR:</strong> Trailing stop and reversal indicator</p>
                      </div>
                      
                      {/* Save Buttons */}
                      <div className="pt-2 border-t border-slate-700 flex gap-2">
                        <Button
                          onClick={saveToTimeframe}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
                          data-testid="button-save-trend-to-timeframe"
                        >
                          <Save className="w-3 h-3 mr-1" />
                          Save to {interval}
                        </Button>
                        <Button
                          onClick={makeTimeframeDefault}
                          variant="outline"
                          className="bg-slate-700 hover:bg-slate-600 text-white text-xs h-8 px-2"
                          data-testid="button-make-trend-default"
                        >
                          ⭐
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* VWAP Tab */}
                  {chartControlsTab === 'vwap' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="flex items-center gap-2">
                          <Switch checked={showVWAPDaily} onCheckedChange={setShowVWAPDaily} id="show-vwap-daily" data-testid="switch-vwap-daily" />
                          <Label htmlFor="show-vwap-daily" className="text-sm text-white cursor-pointer">Daily</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showVWAPWeekly} onCheckedChange={setShowVWAPWeekly} id="show-vwap-weekly" data-testid="switch-vwap-weekly" />
                          <Label htmlFor="show-vwap-weekly" className="text-sm text-white cursor-pointer">Weekly</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showVWAPMonthly} onCheckedChange={setShowVWAPMonthly} id="show-vwap-monthly" data-testid="switch-vwap-monthly" />
                          <Label htmlFor="show-vwap-monthly" className="text-sm text-white cursor-pointer">Monthly</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showVWAPRolling} onCheckedChange={setShowVWAPRolling} id="show-vwap-rolling" data-testid="switch-vwap-rolling" />
                          <Label htmlFor="show-vwap-rolling" className="text-sm text-white cursor-pointer">Rolling VWAP</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showVWAPBands} onCheckedChange={setShowVWAPBands} id="show-vwap-bands" data-testid="switch-vwap-bands" />
                          <Label htmlFor="show-vwap-bands" className="text-sm text-white cursor-pointer">VWAP Bands</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showSessionVWAP} onCheckedChange={setShowSessionVWAP} id="show-session-vwap" data-testid="switch-session-vwap" />
                          <Label htmlFor="show-session-vwap" className="text-sm text-white cursor-pointer">Session VWAP</Label>
                        </div>
                      </div>
                      
                      {/* Rolling VWAP Settings */}
                      {showVWAPRolling && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Rolling VWAP Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Rolling Period (bars)</Label>
                            <input
                              type="number"
                              min="5"
                              max="200"
                              value={vwapRollingPeriodInput}
                              onChange={(e) => {
                                setVwapRollingPeriodInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setVwapRollingPeriod(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-vwap-rolling-period"
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">VWAP calculated over the last N candles</p>
                        </div>
                      )}
                      
                      {/* VWAP Bands Settings */}
                      {showVWAPBands && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">VWAP Bands Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Std Dev</Label>
                            <input
                              type="number"
                              min="0.5"
                              max="4"
                              step="0.5"
                              value={vwapBandsStdDevInput}
                              onChange={(e) => {
                                setVwapBandsStdDevInput(e.target.value);
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0.5) setVwapBandsStdDev(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-vwap-bands-stddev"
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Standard deviation bands around VWAP</p>
                        </div>
                      )}
                      
                      <div className="text-xs text-gray-400 bg-slate-800/50 rounded-lg p-2">
                        <p><strong>VWAP:</strong> Volume Weighted Average Price - Institutional trading benchmark</p>
                        <p><strong>VWAP Bands:</strong> Standard deviation bands around VWAP (like Bollinger for VWAP)</p>
                        <p><strong>Session VWAP:</strong> Separate VWAPs for Asia/London/NY trading sessions</p>
                      </div>
                      
                      {/* Save Buttons */}
                      <div className="pt-2 border-t border-slate-700 flex gap-2">
                        <Button
                          onClick={saveToTimeframe}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
                          data-testid="button-save-vwap-to-timeframe"
                        >
                          <Save className="w-3 h-3 mr-1" />
                          Save to {interval}
                        </Button>
                        <Button
                          onClick={makeTimeframeDefault}
                          variant="outline"
                          className="bg-slate-700 hover:bg-slate-600 text-white text-xs h-8 px-2"
                          data-testid="button-make-vwap-default"
                        >
                          ⭐
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Oscillators Tab */}
                  {chartControlsTab === 'oscillators' && (
                    <div className="space-y-3">
                      {/* Free tier notice */}
                      {!isPaidTier && (
                        <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-2 text-xs text-amber-200">
                          Free tier: RSI & MACD only, 1 active at a time. <span className="text-amber-400 cursor-pointer hover:underline" onClick={() => setLocation('/crypto/subscribe')}>Upgrade for all oscillators</span>
                        </div>
                      )}
                      
                      {/* Sync Scale Toggle */}
                      <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2">
                        <div className="flex items-center gap-2">
                          <Switch 
                            checked={syncOscillatorScale} 
                            onCheckedChange={setSyncOscillatorScale}
                            id="sync-oscillator-scale" 
                            data-testid="switch-sync-oscillator-scale" 
                          />
                          <Label htmlFor="sync-oscillator-scale" className="text-xs text-white cursor-pointer">
                            Sync Time Scale with Main Chart
                          </Label>
                        </div>
                        <span className="text-xs text-gray-500">Match visible range</span>
                      </div>
                      
                      {/* Main toggles */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2">
                          <Switch checked={showRSI} onCheckedChange={() => handleOscillatorToggle('RSI', showRSI, setShowRSI)} id="show-rsi" data-testid="switch-rsi" />
                          <Label htmlFor="show-rsi" className="text-sm text-white cursor-pointer">RSI</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showStochRSI} onCheckedChange={() => handleOscillatorToggle('Stochastic RSI', showStochRSI, setShowStochRSI)} id="show-stoch-rsi" data-testid="switch-stoch-rsi" disabled={!isPaidTier && !showStochRSI} />
                          <Label htmlFor="show-stoch-rsi" className="text-sm text-white cursor-pointer">Stochastic RSI {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showMACD} onCheckedChange={() => handleOscillatorToggle('MACD', showMACD, setShowMACD)} id="show-macd" data-testid="switch-macd" />
                          <Label htmlFor="show-macd" className="text-sm text-white cursor-pointer">MACD</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showOBV} onCheckedChange={() => handleOscillatorToggle('OBV', showOBV, setShowOBV)} id="show-obv" data-testid="switch-obv" disabled={!isPaidTier && !showOBV} />
                          <Label htmlFor="show-obv" className="text-sm text-white cursor-pointer">OBV {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showMFI} onCheckedChange={() => handleOscillatorToggle('MFI', showMFI, setShowMFI)} id="show-mfi" data-testid="switch-mfi" disabled={!isPaidTier && !showMFI} />
                          <Label htmlFor="show-mfi" className="text-sm text-white cursor-pointer">MFI {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showWilliamsR} onCheckedChange={() => handleOscillatorToggle('Williams %R', showWilliamsR, setShowWilliamsR)} id="show-williams-r" data-testid="switch-williams-r" disabled={!isPaidTier && !showWilliamsR} />
                          <Label htmlFor="show-williams-r" className="text-sm text-white cursor-pointer">Williams %R {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showCCI} onCheckedChange={() => handleOscillatorToggle('CCI', showCCI, setShowCCI)} id="show-cci" data-testid="switch-cci" disabled={!isPaidTier && !showCCI} />
                          <Label htmlFor="show-cci" className="text-sm text-white cursor-pointer">CCI {!isPaidTier && '🔒'}</Label>
                        </div>
                        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
                          <Switch checked={showADX} onCheckedChange={() => handleOscillatorToggle('ADX', showADX, setShowADX)} id="show-adx" data-testid="switch-adx" disabled={!isPaidTier && !showADX} />
                          <Label htmlFor="show-adx" className="text-sm text-white cursor-pointer">ADX {!isPaidTier && '🔒'}</Label>
                        </div>
                      </div>
                      
                      {/* RSI Settings */}
                      {showRSI && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">RSI Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Period</Label>
                            <input
                              type="number"
                              min="5"
                              max="50"
                              value={rsiPeriodInput}
                              onChange={(e) => {
                                setRsiPeriodInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setRsiPeriod(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-rsi-period"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* MACD Settings */}
                      {showMACD && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">MACD Settings</div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Fast Period</Label>
                              <input
                                type="number"
                                min="5"
                                max="50"
                                value={macdFastInput}
                                onChange={(e) => {
                                  setMacdFastInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setMacdFast(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-macd-fast"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Slow Period</Label>
                              <input
                                type="number"
                                min="10"
                                max="100"
                                value={macdSlowInput}
                                onChange={(e) => {
                                  setMacdSlowInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 10) setMacdSlow(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-macd-slow"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Signal Period</Label>
                              <input
                                type="number"
                                min="5"
                                max="50"
                                value={macdSignalInput}
                                onChange={(e) => {
                                  setMacdSignalInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setMacdSignal(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-macd-signal"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* MFI Settings */}
                      {showMFI && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">MFI Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Period</Label>
                            <input
                              type="number"
                              min="5"
                              max="50"
                              value={mfiPeriodInput}
                              onChange={(e) => {
                                setMfiPeriodInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setMfiPeriod(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-mfi-period"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Stochastic RSI Settings */}
                      {showStochRSI && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Stochastic RSI Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Period</Label>
                            <input
                              type="number"
                              min="5"
                              max="50"
                              value={stochRSIPeriodInput}
                              onChange={(e) => {
                                setStochRSIPeriodInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setStochRSIPeriod(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-stoch-rsi-period"
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">More sensitive version of RSI</p>
                        </div>
                      )}
                      
                      {/* Williams %R Settings */}
                      {showWilliamsR && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">Williams %R Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Period</Label>
                            <input
                              type="number"
                              min="5"
                              max="50"
                              value={williamsRPeriodInput}
                              onChange={(e) => {
                                setWilliamsRPeriodInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setWilliamsRPeriod(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-williams-r-period"
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Momentum oscillator (-100 to 0)</p>
                        </div>
                      )}
                      
                      {/* CCI Settings */}
                      {showCCI && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">CCI Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Period</Label>
                            <input
                              type="number"
                              min="5"
                              max="50"
                              value={cciPeriodInput}
                              onChange={(e) => {
                                setCciPeriodInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setCciPeriod(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-cci-period"
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Overbought/oversold with ±100 levels</p>
                        </div>
                      )}
                      
                      {/* ADX Settings */}
                      {showADX && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">ADX Settings</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-gray-300">Period</Label>
                            <input
                              type="number"
                              min="5"
                              max="50"
                              value={adxPeriodInput}
                              onChange={(e) => {
                                setAdxPeriodInput(e.target.value);
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 5) setAdxPeriod(val);
                              }}
                              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              data-testid="input-adx-period"
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Trend strength indicator (not direction)</p>
                        </div>
                      )}
                      
                      {/* Save Buttons */}
                      <div className="pt-2 border-t border-slate-700 flex gap-2">
                        <Button
                          onClick={saveToTimeframe}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
                          data-testid="button-save-oscillator-to-timeframe"
                        >
                          <Save className="w-3 h-3 mr-1" />
                          Save to {interval}
                        </Button>
                        <Button
                          onClick={makeTimeframeDefault}
                          variant="outline"
                          className="bg-slate-700 hover:bg-slate-600 text-white text-xs h-8 px-2"
                          data-testid="button-make-oscillator-default"
                        >
                          ⭐
                        </Button>
                      </div>
                    </div>
                  )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Oscillator Charts - Full Width */}
        {(showRSI || showStochRSI || showMACD || showOBV || showWilliamsR || showMFI || showCCI || showADX) && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {showRSI && (() => {
                const report = isPaidTier ? getIndicatorReport('RSI') : null;
                return (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">RSI ({rsiPeriod})</CardTitle>
                        {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div ref={rsiRef} className="w-full" data-testid="chart-rsi" />
                      <DivergenceMeter indicator="RSI" />
                    </CardContent>
                  </Card>
                );
              })()}
              {showStochRSI && (() => {
                const report = isPaidTier ? getIndicatorReport('StochRSI') : null;
                return (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">Stochastic RSI ({stochRSIPeriod})</CardTitle>
                        {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div ref={stochRSIRef} className="w-full" data-testid="chart-stoch-rsi" />
                      <DivergenceMeter indicator="StochRSI" />
                    </CardContent>
                  </Card>
                );
              })()}
              {showMACD && (() => {
                const report = isPaidTier ? getIndicatorReport('MACD') : null;
                return (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">MACD ({macdFast}, {macdSlow}, {macdSignal})</CardTitle>
                        {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div ref={macdRef} className="w-full" data-testid="chart-macd" />
                      <DivergenceMeter indicator="MACD" />
                    </CardContent>
                  </Card>
                );
              })()}
              {showOBV && (() => {
                const report = isPaidTier ? getIndicatorReport('OBV') : null;
                return (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">On-Balance Volume</CardTitle>
                        {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div ref={obvRef} className="w-full" data-testid="chart-obv" />
                      <DivergenceMeter indicator="OBV" />
                    </CardContent>
                  </Card>
                );
              })()}
              {showWilliamsR && (() => {
                const report = isPaidTier ? getIndicatorReport('WilliamsR') : null;
                return (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">Williams %R ({williamsRPeriod})</CardTitle>
                        {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div ref={williamsRRef} className="w-full" data-testid="chart-williams-r" />
                      <DivergenceMeter indicator="WilliamsR" />
                    </CardContent>
                  </Card>
                );
              })()}
              {showMFI && (() => {
                const report = isPaidTier ? getIndicatorReport('MFI') : null;
                return (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">Money Flow Index ({mfiPeriod})</CardTitle>
                        {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div ref={mfiRef} className="w-full" data-testid="chart-mfi" />
                      <DivergenceMeter indicator="MFI" />
                    </CardContent>
                  </Card>
                );
              })()}
              {showCCI && (() => {
                const report = isPaidTier ? getIndicatorReport('CCI') : null;
                return (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">CCI ({cciPeriod})</CardTitle>
                        {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div ref={cciRef} className="w-full" data-testid="chart-cci" />
                      <DivergenceMeter indicator="CCI" />
                    </CardContent>
                  </Card>
                );
              })()}
              {showADX && (() => {
                const report = isPaidTier ? getIndicatorReport('ADX') : null;
                return (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">ADX ({adxPeriod})</CardTitle>
                        {report && <span className={`text-xs font-medium ${report.color}`}>{report.text}</span>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div ref={adxRef} className="w-full" data-testid="chart-adx" />
                      <TrendStrengthMeter />
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
        )}

        {/* 2x2 Grid on Desktop: Grok Summary, Alerts, Footprint, Indicators */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Market Summary */}
        {tier !== 'free' ? (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setMarketSummaryMinimized(!marketSummaryMinimized)}>
              <div className="flex items-center gap-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <span className={`transition-transform duration-200 ${marketSummaryMinimized ? '' : 'rotate-90'}`}>▶</span>
                  <span className="text-lg">🤖</span>
                  Market Summary
                </CardTitle>
                <img src={grokLogo} alt="Grok" className="h-4 brightness-110" />
              </div>
            </CardHeader>
            {!marketSummaryMinimized && (
            <CardContent className="space-y-2">
              {aiAnalysisLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="ml-2 text-sm text-gray-400">Analyzing market...</span>
                </div>
              ) : aiAnalysis ? (
                <>
                  <div className="text-xs text-gray-300 whitespace-pre-wrap bg-slate-900 p-3 rounded border border-slate-700">
                    {aiAnalysis}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-slate-700">
                    <span className="italic">
                      Written with Grok
                    </span>
                    <span>
                      {aiAnalysisTimestamp ? new Date(aiAnalysisTimestamp).toLocaleTimeString() : '-'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 px-2 py-1 bg-slate-900/50 rounded border border-slate-700/50">
                    <span className="opacity-75">Note: This analysis uses Grok API. We are not affiliated with or endorsed by xAI.</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); fetchAIAnalysis(true); }}
                    className="w-full h-7 text-xs"
                    disabled={aiAnalysisLoading}
                  >
                    Refresh Analysis
                  </Button>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-400 mb-2">
                    {candles.length < 100 ? 'Loading chart data...' : 'Click to analyze market conditions'}
                  </p>
                  <Button
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); fetchAIAnalysis(true); }}
                    className="h-7 text-xs"
                    disabled={candles.length < 100}
                  >
                    Generate Analysis
                  </Button>
                </div>
              )}
            </CardContent>
            )}
          </Card>
        ) : (
          <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  AI Market Summary
                </CardTitle>
                <img src={grokLogo} alt="Grok" className="h-4 brightness-110" />
                <span className="ml-auto px-2 py-0.5 bg-purple-600/30 text-purple-300 text-[10px] font-semibold rounded border border-purple-500/50">
                  INTERMEDIATE+
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-gray-300 bg-slate-900/50 p-3 rounded border border-slate-700/50 blur-sm select-none">
                1. **Current Trend and Momentum:** XRP/USD is currently in a bearish trend...
                <br /><br />
                2. **Key Support/Resistance Levels:** Immediate support is at $2.0838...
              </div>
              <div className="text-center py-2">
                <p className="text-sm text-gray-300 mb-3">
                  Unlock AI-powered market analysis with Grok
                </p>
                <Button
                  onClick={() => window.location.href = '/cryptosubscribe'}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm"
                  data-testid="button-upgrade-market-summary"
                >
                  Upgrade to Intermediate - $15/month
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footprint Delta Table */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setCvdTableMinimized(!cvdTableMinimized)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <span className={`transition-transform duration-200 ${cvdTableMinimized ? '' : 'rotate-90'}`}>▶</span>
                <span className="text-lg">📊</span>
                Delta Vs CVD
              </CardTitle>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {multiExchangeLoading && (
                  <span className="text-xs text-yellow-400">Loading...</span>
                )}
                    {multiExchangeData?.metadata?.exchanges && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-400">
                          🌐 Multi-Exchange
                        </span>
                        <details className="relative group">
                          <summary className="cursor-pointer text-xs text-cyan-400 hover:text-cyan-300 list-none">
                            {(multiExchangeData.metadata.exchanges || []).filter((e: any) => e.success).length}/{(multiExchangeData.metadata.exchanges || []).length} ℹ️
                          </summary>
                          <div className="absolute right-0 top-6 z-50 bg-slate-900 border border-slate-700 rounded-md shadow-xl p-3 min-w-[280px]">
                            <div className="text-xs font-semibold text-white mb-2 border-b border-slate-700 pb-2">
                              Exchange Status
                            </div>
                            <div className="space-y-1.5">
                              {(multiExchangeData.metadata.exchanges || []).map((ex: any) => (
                                <div key={ex.exchange_id} className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    {ex.success ? (
                                      <span className="text-green-400">✓</span>
                                    ) : (
                                      <span className="text-red-400">✗</span>
                                    )}
                                    <span className={ex.success ? 'text-gray-300' : 'text-gray-500'}>
                                      {ex.exchange}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {ex.success && (
                                      <>
                                        <span className="text-gray-400">{ex.trades_count} trades</span>
                                        <span className="text-gray-500">{ex.response_time_ms}ms</span>
                                        {ex.retries > 0 && (
                                          <span className="text-yellow-400 text-[10px]">↻{ex.retries}</span>
                                        )}
                                      </>
                                    )}
                                    {!ex.success && ex.error && (
                                      <span className="text-red-400 text-[10px] max-w-[120px] truncate" title={ex.error}>
                                        {ex.error}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-gray-400">
                              Avg response: {Math.round(multiExchangeData.metadata.avg_response_time_ms)}ms | 
                              Success: {(multiExchangeData.metadata.success_rate * 100).toFixed(0)}%
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
                {useMultiExchange && multiExchangeData?.divergences && multiExchangeData.divergences.length > 0 && (
                  <div className="mt-2 text-xs text-yellow-400 bg-yellow-900/20 p-2 rounded border border-yellow-700/50">
                    ⚠️ {multiExchangeData.divergences.length} divergence alert{multiExchangeData.divergences.length > 1 ? 's' : ''} detected
                  </div>
                )}
              </CardHeader>
              {!cvdTableMinimized && (
              <CardContent>
                <div className="overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800">
                      <tr className="border-b border-slate-600">
                        <th className="text-left text-gray-400 py-1 px-1">
                          <Popover>
                            <PopoverTrigger className="cursor-help underline decoration-dotted">Time</PopoverTrigger>
                            <PopoverContent className="w-48 text-xs p-2">
                              <p>Candle timestamp showing when each bar opened</p>
                            </PopoverContent>
                          </Popover>
                        </th>
                        <th className="text-right text-gray-400 py-1 px-1">
                          <Popover>
                            <PopoverTrigger className="cursor-help underline decoration-dotted">Delta</PopoverTrigger>
                            <PopoverContent className="w-56 text-xs p-2">
                              <p>Net difference between buying and selling volume for this candle. Positive = more buyers, Negative = more sellers</p>
                            </PopoverContent>
                          </Popover>
                        </th>
                        <th className="text-right text-gray-400 py-1 px-1">
                          <Popover>
                            <PopoverTrigger className="cursor-help underline decoration-dotted">CVD</PopoverTrigger>
                            <PopoverContent className="w-56 text-xs p-2">
                              <p>Cumulative Volume Delta - running total of all deltas. Shows overall buying/selling pressure over time</p>
                            </PopoverContent>
                          </Popover>
                        </th>
                        {useMultiExchange && (
                          <>
                            <th className="text-center text-gray-400 py-1 px-1">
                              <Popover>
                                <PopoverTrigger className="cursor-help underline decoration-dotted">Ex</PopoverTrigger>
                                <PopoverContent className="w-52 text-xs p-2">
                                  <p>Number of exchanges reporting data (out of 6: Binance, Coinbase, Kraken, KuCoin, OKX, Gate.io)</p>
                                </PopoverContent>
                              </Popover>
                            </th>
                            <th className="text-center text-gray-400 py-1 px-1">
                              <Popover>
                                <PopoverTrigger className="cursor-help underline decoration-dotted">B/S</PopoverTrigger>
                                <PopoverContent className="w-56 text-xs p-2">
                                  <p>Bullish/Bearish split - how many exchanges show positive delta vs negative. Higher agreement = stronger signal</p>
                                </PopoverContent>
                              </Popover>
                            </th>
                            <th className="text-center text-gray-400 py-1 px-1">
                              <Popover>
                                <PopoverTrigger className="cursor-help underline decoration-dotted">Conf</PopoverTrigger>
                                <PopoverContent className="w-56 text-xs p-2">
                                  <p>Confidence level based on exchange agreement. 80%+ (green) = strong, 60%+ (yellow) = moderate, below (red) = weak</p>
                                </PopoverContent>
                              </Popover>
                            </th>
                          </>
                        )}
                        <th className="text-center text-gray-400 py-1 px-1">
                          <Popover>
                            <PopoverTrigger className="cursor-help underline decoration-dotted">Vol</PopoverTrigger>
                            <PopoverContent className="w-60 text-xs p-2">
                              <p>CVD spike indicator showing unusual volume. Colors: Green/Red (5-6 exchanges), Blue/Yellow (3-4), Grey (1-2). Superscript shows intensity level</p>
                            </PopoverContent>
                          </Popover>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {deltaHistory.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center text-gray-500 py-2">No data yet</td>
                        </tr>
                      ) : (
                        <>
                          {/* LIVE Current Bar */}
                          {(() => {
                            const currentBar = deltaHistory[deltaHistory.length - 1];
                            if (!currentBar) return null;
                            
                            // Calculate separate averages for bullish and bearish bars
                            const bullishBars = deltaHistory.filter(h => h.delta > 0);
                            const bearishBars = deltaHistory.filter(h => h.delta < 0);
                            const avgBullishDelta = bullishBars.length > 0 
                              ? bullishBars.reduce((sum, h) => sum + h.delta, 0) / bullishBars.length 
                              : 0;
                            const avgBearishDelta = bearishBars.length > 0 
                              ? bearishBars.reduce((sum, h) => sum + h.delta, 0) / bearishBars.length 
                              : 0;
                            
                            const level1Mult = cvdSpikeLevel1 / 100;
                            const level2Mult = cvdSpikeLevel2 / 100;
                            const level3Mult = cvdSpikeLevel3 / 100;
                            const isBullishSpike = currentBar.delta > 0 && currentBar.delta >= avgBullishDelta * level1Mult;
                            const isBearishSpike = currentBar.delta < 0 && currentBar.delta <= avgBearishDelta * level1Mult;
                            const hasDivergence = useMultiExchange && currentBar.divergence;
                            
                            return (
                              <tr className="bg-blue-900/30 border-b-2 border-blue-500 animate-pulse">
                                <td className="text-blue-300 py-1 px-1 font-mono text-[10px] font-bold">
                                  🔴 LIVE
                                </td>
                                <td className={`text-right py-1 px-1 font-mono font-bold ${currentBar.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {currentBar.delta > 0 ? '+' : ''}{(currentBar.delta / 1000).toFixed(1)}k
                                </td>
                                <td className={`text-right py-1 px-1 font-mono font-bold ${currentBar.cumDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {(currentBar.cumDelta / 1000).toFixed(1)}k
                                </td>
                                {useMultiExchange && (
                                  <>
                                    <td className="text-center py-1 px-1 text-gray-300 font-semibold">
                                      {currentBar.exchanges || 0}
                                    </td>
                                    <td className="text-center py-1 px-1 font-mono text-[10px]">
                                      <span className="text-green-400">{currentBar.bullishExchanges || 0}</span>
                                      <span className="text-gray-500">/</span>
                                      <span className="text-red-400">{currentBar.bearishExchanges || 0}</span>
                                    </td>
                                    <td className="text-center py-1 px-1">
                                      <span className={`text-[10px] font-bold ${
                                        (currentBar.confidence || 0) >= 0.8 ? 'text-green-400' :
                                        (currentBar.confidence || 0) >= 0.6 ? 'text-yellow-400' :
                                        'text-red-400'
                                      }`}>
                                        {((currentBar.confidence || 0) * 100).toFixed(0)}%
                                      </span>
                                    </td>
                                  </>
                                )}
                                <td className="text-center py-1 px-1">
                                  {(() => {
                                    const bullishExchanges = currentBar.bullishExchanges || 0;
                                    const bearishExchanges = currentBar.bearishExchanges || 0;
                                    
                                    if (isBullishSpike) {
                                      const multiple = avgBullishDelta > 0 ? currentBar.delta / avgBullishDelta : 0;
                                      const triangleCount = multiple >= level3Mult ? 3 : multiple >= level2Mult ? 2 : 1;
                                      const colorClass = bullishExchanges >= 5 ? 'text-green-400' : 
                                                         bullishExchanges >= 3 ? 'text-blue-400' : 'text-gray-400';
                                      return (
                                        <span className={`${colorClass} text-xs font-bold`} 
                                          title={`${multiple.toFixed(1)}x avg | ${bullishExchanges}/6 exchanges bullish`}>
                                          {'▲'.repeat(triangleCount)}
                                        </span>
                                      );
                                    }
                                    
                                    if (isBearishSpike) {
                                      const multiple = avgBearishDelta !== 0 ? Math.abs(currentBar.delta / avgBearishDelta) : 0;
                                      const triangleCount = multiple >= level3Mult ? 3 : multiple >= level2Mult ? 2 : 1;
                                      const colorClass = bearishExchanges >= 5 ? 'text-red-400' : 
                                                         bearishExchanges >= 3 ? 'text-yellow-400' : 'text-gray-400';
                                      return (
                                        <span className={`${colorClass} text-xs font-bold`} 
                                          title={`${multiple.toFixed(1)}x avg | ${bearishExchanges}/6 exchanges bearish`}>
                                          {'▼'.repeat(triangleCount)}
                                        </span>
                                      );
                                    }
                                    
                                    if (currentBar.highValueDivergence) {
                                      return <span className="text-orange-400 text-xs" title={`High-value divergence (${currentBar.volumeMultiple?.toFixed(1)}x volume)`}>🔥</span>;
                                    }
                                    if (hasDivergence) {
                                      return <span className="text-yellow-400 text-xs" title="CVD/Delta divergence">⚠️</span>;
                                    }
                                    return null;
                                  })()}
                                </td>
                              </tr>
                            );
                          })()}
                          
                          {/* Historical Bars */}
                          {(() => {
                            const tableLimit = getTableRowLimit(interval);
                            const limitedHistory = deltaHistory.slice(0, -1).reverse().slice(0, tableLimit - 1);
                            const bullishBars = deltaHistory.filter(h => h.delta > 0);
                            const bearishBars = deltaHistory.filter(h => h.delta < 0);
                            const avgBullishDelta = bullishBars.length > 0 
                              ? bullishBars.reduce((sum, h) => sum + h.delta, 0) / bullishBars.length 
                              : 0;
                            const avgBearishDelta = bearishBars.length > 0 
                              ? bearishBars.reduce((sum, h) => sum + h.delta, 0) / bearishBars.length 
                              : 0;
                            
                            const level1Mult = cvdSpikeLevel1 / 100;
                            const level2Mult = cvdSpikeLevel2 / 100;
                            const level3Mult = cvdSpikeLevel3 / 100;
                            
                            let lastDate = '';
                            return limitedHistory.map((item, idx) => {
                              const isBullishSpike = item.delta > 0 && item.delta >= avgBullishDelta * level1Mult;
                              const isBearishSpike = item.delta < 0 && item.delta <= avgBearishDelta * level1Mult;
                              const hasDivergence = useMultiExchange && item.divergence;
                              const cellBg = hasDivergence 
                                ? 'bg-yellow-900/20' 
                                : item.isBull ? 'bg-green-900/20' : 'bg-red-900/20';
                              
                              const showDate = item.time !== lastDate;
                              lastDate = item.time || '';
                              
                              return (
                                <tr key={idx} className={`border-b border-slate-700/50 ${cellBg}`}>
                                <td className="text-gray-300 py-1 px-1 font-mono text-[10px]">
                                  {showDate && <span className="text-gray-500 mr-1">{item.time}</span>}
                                  {item.time}
                                </td>
                              <td className={`text-right py-1 px-1 font-mono font-semibold ${item.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {item.delta > 0 ? '+' : ''}{(item.delta / 1000).toFixed(1)}k
                              </td>
                              <td className={`text-right py-1 px-1 font-mono font-semibold ${item.cumDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {(item.cumDelta / 1000).toFixed(1)}k
                              </td>
                              {useMultiExchange && (
                                <>
                                  <td className="text-center py-1 px-1 text-gray-300">
                                    {item.exchanges || 0}
                                  </td>
                                  <td className="text-center py-1 px-1 font-mono text-[10px]">
                                    <span className="text-green-400">{item.bullishExchanges || 0}</span>
                                    <span className="text-gray-500">/</span>
                                    <span className="text-red-400">{item.bearishExchanges || 0}</span>
                                  </td>
                                  <td className="text-center py-1 px-1">
                                    <span className={`text-[10px] font-semibold ${
                                      (item.confidence || 0) >= 0.8 ? 'text-green-400' :
                                      (item.confidence || 0) >= 0.6 ? 'text-yellow-400' :
                                      'text-red-400'
                                    }`} title={`${((item.confidence || 0) * 100).toFixed(0)}% confidence`}>
                                      {((item.confidence || 0) * 100).toFixed(0)}%
                                    </span>
                                  </td>
                                </>
                              )}
                              <td className="text-center py-1 px-1">
                                {(() => {
                                  // Calculate spike intensity and triangles
                                  const bullishExchanges = item.bullishExchanges || 0;
                                  const bearishExchanges = item.bearishExchanges || 0;
                                  
                                  if (isBullishSpike) {
                                    const multiple = avgBullishDelta > 0 ? item.delta / avgBullishDelta : 0;
                                    const triangleCount = multiple >= level3Mult ? 3 : multiple >= level2Mult ? 2 : 1;
                                    // Color: green (5-6), blue (3-4), grey (1-2)
                                    const colorClass = bullishExchanges >= 5 ? 'text-green-400' : 
                                                       bullishExchanges >= 3 ? 'text-blue-400' : 'text-gray-400';
                                    return (
                                      <span className={`${colorClass} text-xs font-bold`} 
                                        title={`${multiple.toFixed(1)}x avg | ${bullishExchanges}/6 exchanges bullish`}>
                                        {'▲'.repeat(triangleCount)}
                                      </span>
                                    );
                                  }
                                  
                                  if (isBearishSpike) {
                                    const multiple = avgBearishDelta !== 0 ? Math.abs(item.delta / avgBearishDelta) : 0;
                                    const triangleCount = multiple >= level3Mult ? 3 : multiple >= level2Mult ? 2 : 1;
                                    // Color: red (5-6), yellow (3-4), grey (1-2)
                                    const colorClass = bearishExchanges >= 5 ? 'text-red-400' : 
                                                       bearishExchanges >= 3 ? 'text-yellow-400' : 'text-gray-400';
                                    return (
                                      <span className={`${colorClass} text-xs font-bold`} 
                                        title={`${multiple.toFixed(1)}x avg | ${bearishExchanges}/6 exchanges bearish`}>
                                        {'▼'.repeat(triangleCount)}
                                      </span>
                                    );
                                  }
                                  
                                  // Show divergence indicators if no spike
                                  if (item.highValueDivergence) {
                                    return <span className="text-orange-400 text-xs" title={`High-value divergence (${item.volumeMultiple?.toFixed(1)}x volume)`}>🔥</span>;
                                  }
                                  if (hasDivergence) {
                                    return <span className="text-yellow-400 text-xs" title="CVD/Delta divergence">⚠️</span>;
                                  }
                                  return null;
                                })()}
                              </td>
                              </tr>
                              );
                            });
                          })()}
                        </>
                      )}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-slate-800 border-t border-slate-600">
                      <tr>
                        <td className="text-gray-400 py-1 px-1 text-[10px]">Avg</td>
                        <td className="text-right py-1 px-1 font-mono">
                          <div className="flex flex-col text-[10px]">
                            <span className="text-green-400">
                              {deltaHistory.filter(h => h.isBull).length > 0
                                ? (deltaHistory.filter(h => h.isBull).reduce((sum, h) => sum + h.delta, 0) / deltaHistory.filter(h => h.isBull).length / 1000).toFixed(1) + 'k'
                                : '-'}
                            </span>
                            <span className="text-red-400">
                              {deltaHistory.filter(h => !h.isBull).length > 0
                                ? (deltaHistory.filter(h => !h.isBull).reduce((sum, h) => sum + h.delta, 0) / deltaHistory.filter(h => !h.isBull).length / 1000).toFixed(1) + 'k'
                                : '-'}
                            </span>
                          </div>
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
              )}
        </Card>

        {/* Market Alerts */}
        {tier !== 'free' && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader 
              className="pb-2 cursor-pointer"
              onClick={() => setMarketAlertsMinimized(!marketAlertsMinimized)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <span className={`transition-transform duration-200 ${marketAlertsMinimized ? '' : 'rotate-90'}`}>▶</span>
                    <span className="text-lg">🔔</span>
                    Market Alerts
                    {marketAlertsMinimized && filteredMarketAlerts.length > 0 && (
                      <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">{filteredMarketAlerts.length}</span>
                    )}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setAlertSettingsOpen(true); }}
                    className="text-gray-400 hover:text-white h-8 px-2"
                    data-testid="button-market-alerts-settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-1 bg-slate-700 rounded-md p-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setAlertFilterMode('all')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      alertFilterMode === 'all' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                    data-testid="button-alert-filter-all"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setAlertFilterMode('active')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      alertFilterMode === 'active' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                    data-testid="button-alert-filter-active"
                  >
                    Active Only
                  </button>
                </div>
              </div>
            </CardHeader>
            {!marketAlertsMinimized && (
            <CardContent className="space-y-2">
              {filteredMarketAlerts.length === 0 ? (
                <div className="text-gray-400 text-sm text-center py-4">
                  {alertFilterMode === 'active' && marketAlerts.length > 0 ? (
                    <>
                      <p className="font-semibold">No alerts from active indicators</p>
                      <p className="text-xs mt-1">Enable more indicators or switch to "All" to see all alerts</p>
                    </>
                  ) : (
                    'No alerts yet'
                  )}
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto">
                  {filteredMarketAlerts.slice(0, 10).map((alert) => (
                    <div 
                      key={alert.id}
                      className="bg-slate-900 p-2 rounded border border-slate-700"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {alert.type === 'Liquidity Sweep' && (
                            <span className="text-yellow-400 text-xs font-semibold">💧 SWEEP</span>
                          )}
                          {alert.type === 'BOS' && (
                            <span className="text-green-400 text-xs font-semibold">📈 BOS</span>
                          )}
                          {alert.type === 'CHoCH' && (
                            <span className="text-orange-400 text-xs font-semibold">🔄 CHoCH</span>
                          )}
                          {alert.type === 'FVG' && (
                            <span className="text-purple-400 text-xs font-semibold">⬜ FVG</span>
                          )}
                          {alert.type === 'VWAP Bounce' && (
                            <span className="text-cyan-400 text-xs font-semibold">📊 VWAP BOUNCE</span>
                          )}
                          {alert.type === 'VWAP Cross' && (
                            <span className="text-blue-400 text-xs font-semibold">↗️ VWAP X</span>
                          )}
                          {alert.direction === 'bullish' ? (
                            <TrendingUp className="h-3 w-3 text-green-500" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-red-500" />
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(alert.time * 1000).toLocaleString('en-GB', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric',
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>
                      <div className="text-xs text-gray-300 mt-1">
                        {alert.description}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            )}
          </Card>
        )}

        </div>
        {/* End of 2x2 Grid */}

        {/* Unlock AI Analysis CTA */}
        <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30 p-4 text-center">
          <div className="max-w-2xl mx-auto space-y-2">
            <h2 className="text-xl font-bold text-white">Unlock AI-Powered Trade Analysis</h2>
            <p className="text-gray-300 text-sm">
              Upgrade to Intermediate for instant trade alerts powered by Grok AI. Get real-time confluence analysis, 
              push notifications, and custom alert preferences.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span>AI Trade Alerts</span>
              </div>
              <div className="flex items-center gap-1">
                <Bell className="w-4 h-4 text-blue-400" />
                <span>Push Notifications</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="w-4 h-4 text-green-400" />
                <span>Custom Filters</span>
              </div>
            </div>
            <Button
              onClick={() => window.location.href = '/cryptoai'}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-3 text-base font-semibold"
              data-testid="button-unlock-ai"
            >
              Unlock AI Analysis - $10/month
            </Button>
          </div>
        </Card>

        {/* AI Analysis Navigation Button */}
        <div className="flex items-center justify-center gap-4 pb-8">
          <button
            onClick={() => setLocation('/cryptoai')}
            className="group relative flex flex-col items-center justify-center transition-transform hover:scale-105"
            data-testid="button-navigate-ai-page"
          >
            <div className="w-32 h-32 rounded-full overflow-hidden shadow-2xl border-4 border-white/20 hover:border-white/40 transition-all">
              <video 
                src={aiButtonVideo}
                autoPlay 
                loop 
                muted 
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
          </button>
        </div>

        {/* Disclaimer Section */}
        <div className="max-w-4xl mx-auto px-4 pb-6 text-center">
          <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-3">
              <strong className="text-gray-400">Disclaimer:</strong> This platform is for educational and informational purposes only. 
              We do not provide financial, investment, or trading advice. All trading involves risk, and you should conduct your own 
              research before making any investment decisions. Past performance does not guarantee future results.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
              <a 
                href="/privacy" 
                className="hover:text-blue-400 transition-colors"
                data-testid="link-privacy-policy"
              >
                Privacy Policy
              </a>
              <span className="text-gray-700">•</span>
              <a 
                href="/terms" 
                className="hover:text-blue-400 transition-colors"
                data-testid="link-terms-of-service"
              >
                Terms of Service
              </a>
              <span className="text-gray-700">•</span>
              <a 
                href="mailto:support@beartec.io" 
                className="hover:text-blue-400 transition-colors"
                data-testid="link-contact"
              >
                Contact Us
              </a>
            </div>
          </div>
        </div>

        {/* Alert Settings Dialog */}
        <AlertSettingsDialog 
          open={alertSettingsOpen} 
          onOpenChange={setAlertSettingsOpen} 
        />

      </div>
      
      {/* Bottom Navigation */}
      <CryptoNavigation />
      
      {/* Spacer for fixed navigation */}
      <div className="h-20"></div>
    </div>
    </>
  );
}

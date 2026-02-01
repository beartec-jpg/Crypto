import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { createChart, ColorType, CrosshairMode, IChartApi, CandlestickSeries, LineSeries, HistogramSeries, ISeriesApi, createSeriesMarkers, ISeriesMarkersPluginApi, LineWidth, Time } from 'lightweight-charts';
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
import { useChartData } from '@/hooks/useChartData';
import { useWebSocketConnection } from '@/hooks/useWebSocketConnection';
import { useWatchlistState } from '@/hooks/useWatchlistState';
import { useIndicatorState } from '@/hooks/useIndicatorState';
import { useDrawingState } from '@/hooks/useDrawingState';
import { useFullscreen } from '@/hooks/useFullscreen';
import bearTecLogo from '@assets/1_20251120_023939_0000_1763606422703.png';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import grokLogo from '@assets/Grok_Full_Logomark_Light_1763287603908.png';
import bearVideo from '@assets/grok_video_2025-11-20-03-05-08_1763607929480.mp4';
import transitionVideo from '@assets/grok_video_2025-11-20-06-10-37_1763619824022.mp4';
import bullVideo from '@assets/grok_video_2025-11-20-06-16-11_1763619952816.mp4';
import aiButtonVideo from '@assets/grok_video_2025-11-20-02-22-16_1763605488674.mp4';
import { AlertSettingsDialog } from '@/components/AlertSettingsDialog';
import { incrementTickerClick } from '@/lib/tickerUtils';
import { TickerSearch } from '@/components/TickerSearch';
import { TickerTable } from '@/components/TickerTable';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { DrawingSettingsPanel } from '@/components/drawing-settings';
import { FullscreenOscillatorPanel } from '@/components/FullscreenOscillatorPanel';
import { OscillatorContainer } from '@/components/indicators/OscillatorContainer';

// Chart Components
import { 
  ChartContainer, 
  MovingAverages, 
  ChartControls, 
  ChartVisibleRange, 
  ChartTimeTooltip,
  ChartControlBar
} from '@/components/chart';

// SMC Components
import { 
  FVGOverlay, 
  OrderBlockOverlay, 
  BOSCHoCHMarkers, 
  SMCControls 
} from '@/components/smc';

// Drawing Components
import { 
  DrawingToolbar, 
  DrawingManager, 
  DrawingRenderer 
} from '@/components/drawings';

// Trend Indicator Overlays
import { 
  SupertrendOverlay, 
  BollingerBandsOverlay, 
  VWAPOverlay, 
  SessionVWAPOverlay, 
  ParabolicSAROverlay 
} from '@/components/indicators/trend';

// Trading Components
import {
  TradingPanel,
  BacktestPanel,
  BacktestResults as BacktestResultsComponent,
  BotConfiguration,
  AlertsPanel,
  StrategyGeneratorPanel,
  BacktestResultsPanel
} from '@/components/trading';

// AI Components
import {
  GrokPanel,
  GrokInsights,
  MarketReviewButton,
  MarketSummaryCard
} from '@/components/ai';

// Watchlist Components
import { WatchlistPanel } from '@/components/watchlist';

// Settings Components
import { SettingsPanel, SettingsDialog } from '@/components/settings';
import { ConfirmationDialog } from '@/components/modals';
import { useModalManager } from '@/hooks/useModalManager';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useTradingState } from '@/hooks/useTradingState';
import { useModalState } from '@/hooks/useModalState';

// Volume Components
import { CVDTable } from '@/components/indicators/volume';
import { CVDDetailsPanel } from '@/components/volume';

// Alert Components
import { MarketAlertsPanel } from '@/components/alerts';

// Common Components
import { LoadingOverlay, ErrorDisplay } from '@/components/common';

// Data utilities
import { binanceToCandleData, removeUSDTSuffix, formatMultiExchangeSymbol } from '@/lib/data/candleTransforms';

import {
  calculateSupertrend,
  calculateVWAPBands,
  calculateSessionVWAP,
  calculateOrderBlocks,
  calculatePremiumDiscount,
  calculateParabolicSAR,
  calculateStochasticRSI,
  calculateWilliamsR,
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
import { touchesZone, inZone, aboveZone, belowZone, priceInZone } from '@/utils/zoneHelpers';

// Indicator calculation utilities
import { calculateRSI, calculateMACD, calculateEMA } from '@/lib/indicators/momentum';
import { calculateOBV, calculateMFI } from '@/lib/indicators/volume';
import { calculateBollingerBands } from '@/lib/indicators/volatility';
import { calculateATR } from '@/lib/indicators/trend';

// SMC utilities
import { isActiveFVG } from '@/lib/smc/fvg';
import { calculateSwings } from '@/lib/smc/pivots';
import { detectTrendlines, Trendline } from '@/lib/smc/trendlineDetector';

// Trading utilities
import { calculatePositionSize } from '@/lib/trading/positionCalculator';
import { calculateWeightedRR } from '@/lib/trading/riskCalculator';
import { simulateTrade } from '@/lib/backtest/tradeSimulator';

// Strategy utilities
import {
  calculateBOSandCHoCH,
  getCurrentATR,
  findStopLossLevel,
  findNextSwingLevels,
  getClosestVWAP as getClosestVWAPHelper,
  generateLiquidityGrabSignal as generateLiquidityGrabSignalCore,
  generateBOSTrendSignal as generateBOSTrendSignalCore,
  generateChochFVGSignal as generateChochFVGSignalCore,
  generateVWAPTradingSignal as generateVWAPTradingSignalCore,
  generateEMATradingSignal as generateEMATradingSignalCore,
  generateRSFlipSignal as generateRSFlipSignalCore,
} from '@/lib/strategies';

// Chart utilities  
import { formatPrice, formatVolume, formatPercentChange } from '@/lib/chart/priceUtils';
import { getBullBearColor, getIndicatorColor, getZoneColor } from '@/lib/chart/styleUtils';

// Type imports
import type { 
  CandleData, 
  VWAPData, 
  MAConfig 
} from '@/types/chart.types';

import type { 
  FVG, 
  BOS, 
  CHoCH,
  FootprintData
} from '@/types/smc.types';

import type { 
  DrawingTool 
} from '@/types/drawings.types';

import type { 
  TradeSignal, 
  Position, 
  MarketAlert,
  BacktestTrade,
  BacktestResults,
  TPConfig,
  SLConfig,
  BotTPSLConfig,
  AutoBacktestResult,
  AutoBacktestTestParams,
  TPType,
  SLType
} from '@/types/trading.types';

// Utility imports
import { 
  generateFutureWhitespace, 
  getFutureBarCount,
  getTableRowLimit,
  generateRangeValues,
  FUTURE_BAR_COUNT,
  formatTimestamp,
  formatTimeOnly,
  formatDateOnly
} from '@/lib/chart/timeUtils';

import { 
  formatMALabel,
  formatTickerDisplay
} from '@/lib/chart/priceUtils';

import { 
  getAutoColor 
} from '@/lib/chart/colorUtils';

import { 
  findPeaksAndTroughs 
} from '@/lib/smc/pivots';

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

export default function CryptoIndicators() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const seriesMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
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
  // TODO: Period state for ChartControlBar - implement period-based data fetching
  // This will control how much historical data to display (24h, 7d, 30d, 90d)
  const [period, setPeriod] = useState('30d');
  
  // Consolidated modal state management
  const modals = useModalState();
  
  const [apiKeys, setApiKeys] = useState({
    binance: localStorage.getItem('binance_api_key') || '',
    coinbase: localStorage.getItem('coinbase_api_key') || '',
    xai: localStorage.getItem('xai_api_key') || ''
  });
  
  // Multi-exchange orderflow state (needed by chart data hook)
  const [useMultiExchange, setUseMultiExchange] = useState(true);
  
  // Chart data hook - manages candle data and orderflow
  const {
    candles,
    setCandles,
    loading,
    setLoading,
    footprintData,
    setFootprintData,
    realDeltaData,
    setRealDeltaData,
    deltaHistory,
    setDeltaHistory,
    cumDelta,
    setCumDelta,
    fetchInitialData
  } = useChartData({ symbol, interval, useMultiExchange });
  
  // Watchlist hook - manages watchlist state and persistence
  const {
    watchlistTickers,
    setWatchlistTickers,
    handleAddTicker: handleAddTickerBase,
    handleRemoveTicker: handleRemoveTickerBase,
    refetchWatchlist
  } = useWatchlistState();
  
  // Wrap handlers to include symbol change logic
  const handleAddTicker = useCallback((ticker: string) => {
    handleAddTickerBase(ticker, setSymbol);
  }, [handleAddTickerBase]);
  
  const handleRemoveTicker = useCallback((ticker: string) => {
    handleRemoveTickerBase(ticker, symbol, setSymbol);
  }, [handleRemoveTickerBase, symbol]);
  
  // Indicator hook - manages all indicator state
  const indicators = useIndicatorState();
  
  // Local state for WebSocket delta tracking (not persisted)
  const [currentDelta, setCurrentDelta] = useState(0);
  
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

  const [chartReady, setChartReady] = useState(false);
  const [crosshairInfo, setCrosshairInfo] = useState<{time: number; x: number; y: number} | null>(null);
  const [visibleCandleCount, setVisibleCandleCount] = useState<number>(0);
  
  // Chart controls tab state - null means no tab selected (collapsed)
  const [chartControlsTab, setChartControlsTab] = useState<'smc' | 'trend' | 'vwap' | 'oscillators' | null>(null);
  const chartControlsRef = useRef<HTMLDivElement>(null);
  
  // Drawing tools state
  type DrawingTool = 'trendline' | 'horizontal' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel' | null;
  const [drawingMode, setDrawingMode] = useState<'off' | 'draw' | 'select'>('draw'); // Draw mode active by default
  const { isFullscreen, setIsFullscreen } = useFullscreen(); // Fullscreen chart mode with keyboard support
  const [activeTool, setActiveTool] = useState<DrawingTool>(null);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [drawings, setDrawings] = useState<any[]>([]);
  const [drawingsVisible, setDrawingsVisible] = useState(true); // Toggle to hide/show all drawings
  const [tempDrawing, setTempDrawing] = useState<{points: {time: number; price: number; snapType?: 'high' | 'low' | 'none'}[]} | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  
  // ChartControlBar state
  const [period, setPeriod] = useState('24h');
  const [autoScroll, setAutoScroll] = useState(false);

  // Oscillator panel state for fullscreen mode
const [showOscillatorPanel, setShowOscillatorPanel] = useState(false);

const [tableTimeframe, setTableTimeframe] = useState('1h');
  
  // Native primitives for high-performance drawing rendering
  const drawingPrimitivesRef = useRef<Map<string, DrawingPrimitive>>(new Map());
  
  // Modal manager for confirmation dialogs
  const modalManager = useModalManager();
  
  // Keyboard shortcuts
  useKeyboardShortcuts({
    onToggleDrawingMode: () => setDrawingMode(prev => prev === 'draw' ? 'off' : 'draw'),
    onSelectTool: (tool) => {
      setActiveTool(tool as any);
      setDrawingMode('draw');
    },
    onToggleFullscreen: () => setIsFullscreen(prev => !prev),
    onOpenSettings: () => modals.openModal('settings-dialog'),
    onDeleteSelected: () => {
      if (selectedDrawingId) {
        modalManager.openModal('delete-drawing', { id: selectedDrawingId });
      }
    },
    onDeselectAll: () => setSelectedDrawingId(null)
  });
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

  // Resize chart when oscillator panel visibility changes in fullscreen
useEffect(() => {
  if (isFullscreen && chartRef.current && chartContainerRef.current) {
    const resizeTimeout = setTimeout(() => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
        chartRef.current.timeScale().fitContent();
      }
    }, 100);
    
    return () => clearTimeout(resizeTimeout);
  }
}, [showOscillatorPanel, isFullscreen]);

    // Resize chart when oscillator panel visibility changes in fullscreen
  useEffect(() => {
    if (isFullscreen && chartRef.current && chartContainerRef.current) {
      const resizeTimeout = setTimeout(() => {
        if (chartRef.current && chartContainerRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight
          });
          chartRef.current.timeScale().fitContent();
        }
      }, 100);
      
      return () => clearTimeout(resizeTimeout);
    }
  }, [showOscillatorPanel, isFullscreen]);

  // Force resize when entering/exiting fullscreen
  useEffect(() => {
    if (chartRef.current && chartContainerRef.current) {
      const resizeTimeout = setTimeout(() => {
        if (chartRef.current && chartContainerRef.current) {
          const rect = chartContainerRef.current.getBoundingClientRect();
          chartRef.current.applyOptions({
            width: rect.width,
            height: rect.height,
          });
          chartRef.current.timeScale().fitContent();
        }
      }, 200);
      
      return () => clearTimeout(resizeTimeout);
    }
  }, [isFullscreen]);
    
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
  
  const handleSelectTicker = useCallback((ticker: string) => {
    incrementTickerClick(ticker);
    setSymbol(ticker);
  }, []);
  
  // Handle point commit from gesture controller
  const handlePointCommit = useCallback((point: GesturePoint) => {
    const currentTool = activeToolRef.current;
    if (drawingMode !== 'draw' || !currentTool) return;
    
    setTempDrawing(prev => {
      if (!prev) return { points: [{ time: point.time as number, price: point.price, snapType: point.snapType }] };
      
      const newPoints = [...prev.points, { time: point.time as number, price: point.price, snapType: point.snapType }];
      const requiredPoints = currentTool === 'horizontal' ? 1 : currentTool === 'trend_fib' ? 3 : 2;
      
      // If we have enough points, save the drawing
      if (newPoints.length >= requiredPoints) {
        // Determine color based on auto-color setting and snap types
        const color = autoColorEnabledRef.current ? getAutoColor(newPoints, candles) : '#3b82f6';
        
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
    data: candles as unknown as { time: Time; open: number; high: number; low: number; close: number }[],
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
  
  // Fullscreen mode: resize chart
  useEffect(() => {
   const handleResize = () => {
  if (chartContainerRef.current && chartRef.current) {
    const rect = chartContainerRef.current.getBoundingClientRect();
    chartRef.current.applyOptions({
      width: rect.width,
      height: rect.height,
    });
    chartRef.current.timeScale().fitContent();
  }
};
    
    if (isFullscreen) {
      window.addEventListener('resize', handleResize);
      // Trigger resize immediately when entering fullscreen
      setTimeout(handleResize, 50);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isFullscreen]);
  
  // Connect findSnapPoint function to the ref for edit mode
  useEffect(() => {
    findSnapPointRef.current = gestureController.findSnapPoint;
  }, [gestureController.findSnapPoint]);

  // Series refs for chart rendering (not part of state hook)
  const bbRef = useRef<HTMLDivElement>(null);
  const oscillatorChartsRef = useRef<Map<string, IChartApi>>(new Map());
  const emaSeriesRefs = useRef<Record<string, ISeriesApi<'Line'> | null>>({});
  const emaHTFDataCache = useRef<Record<string, CandleData[]>>({});
  const smaSeriesRefs = useRef<Record<string, ISeriesApi<'Line'> | null>>({});
  const smaHTFDataCache = useRef<Record<string, CandleData[]>>({});
  const supertrendSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapBandsUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapBandsLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sessionVWAPAsiaRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sessionVWAPLondonRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sessionVWAPNYRef = useRef<ISeriesApi<'Line'> | null>(null);
  // NOTE: orderBlocksRefs removed - now managed by OrderBlockOverlay component
  const premiumDiscountRefs = useRef<{ equilibrium: ISeriesApi<'Line'> | null; premium: ISeriesApi<'Line'> | null; discount: ISeriesApi<'Line'> | null }>({ equilibrium: null, premium: null, discount: null });
  const smaFastRef = useRef<ISeriesApi<'Line'> | null>(null);
  const smaSlowRef = useRef<ISeriesApi<'Line'> | null>(null);
  const parabolicSARRef = useRef<ISeriesApi<'Line'> | null>(null);
  
  // ========== OSCILLATOR TIER ACCESS CONTROL ==========
  // Count currently active oscillators for free tier limit
  const getActiveOscillatorCount = () => {
    return [indicators.rsi.show, indicators.macd.show, indicators.stochRSI.show, indicators.obv.show, indicators.mfi.show, indicators.williamsR.show, indicators.cci.show, indicators.adx.show].filter(Boolean).length;
  };
  
  // ========== DIVERGENCE DETECTION ==========
  // Divergence state: -3 to +3 scale (-3 = strong bearish, +3 = strong bullish)
  const [divergenceStrength, setDivergenceStrength] = useState(0);
  const [divergenceType, setDivergenceType] = useState<'bullish' | 'bearish' | 'none'>('none');
  
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
  
  // Chart callbacks for ChartContainer component
  const handleVisibleRangeChange = useCallback((count: number) => {
    setVisibleCandleCount(count);
  }, []);

  const handleCrosshairMove = useCallback((param: any) => {
    if (param.time && param.point && candleSeriesRef.current) {
      const time = param.time as number;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      
      setCrosshairInfo({
        time,
        x: param.point.x,
        y: param.point.y
      });
      
      lastCrosshairParamRef.current = {
        time,
        price: price !== null ? price : 0,
        pointX: param.point.x,
        logicalX: undefined
      };
    } else {
      setCrosshairInfo(null);
    }
  }, []);

  const handleChartReady = useCallback((chart: any, candleSeries: any) => {
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    setChartReady(true);
  }, []);

  const futureWhitespaceConfig = useMemo(() => ({
    enabled: true,
    getFutureBarCount,
    generateFutureWhitespace
  }), [getFutureBarCount, generateFutureWhitespace]);
  
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
  // Trading state management - consolidated via useTradingState hook
  const tradingState = useTradingState();
  
  // Strategy Generator handler
  const handleGenerateStrategy = useCallback((type: 'scalping' | 'day-trading' | 'swing-trading') => {
    toast({ 
      title: `${type} strategy generated`, 
      description: 'Strategy ready for backtesting' 
    });
    // Future: actual strategy generation logic
  }, [toast]);
  
  // Backtest handler
  const handleRunBacktest = useCallback(() => {
    if (!candles || candles.length === 0) {
      toast({ 
        title: 'Error', 
        description: 'No candle data available', 
        variant: 'destructive' 
      });
      return;
    }
    tradingState.startBacktest();
    // Simulate backtest completion after 2 seconds
    setTimeout(() => {
      // Mock results for now
      const mockResults = {
        totalTrades: 10,
        winRate: 60,
        profitFactor: 1.5,
        totalPnL: 150.50,
        avgWin: 25.50,
        avgLoss: -15.30,
        maxDrawdown: 8.5,
        trades: []
      };
      tradingState.completeBacktest(mockResults);
    }, 2000);
  }, [candles, toast, tradingState]);
  
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
  
  // Collapsible panel states - default to minimized
  const [marketSummaryMinimized, setMarketSummaryMinimized] = useState(true);
  const [cvdTableMinimized, setCvdTableMinimized] = useState(true);
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
  
  // Multi-exchange orderflow additional state
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

  // NOTE: fvgSeriesRefs removed - now managed by FVGOverlay component
  // NOTE: bosSeriesRefs and chochSeriesRefs removed - now managed by BOSCHoCHMarkers component
  // NOTE: structureLabelsRef removed - label rendering removed in Phase 4G-3
  const swingPivotSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);
  const liquiditySweepSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);
  const trendlineSeriesRefs = useRef<Array<ISeriesApi<'Line'>>>([]);
  const tradeMarkerRefs = useRef<Array<any>>([]);

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
    const val = parseInt(indicators.bb.periodInput);
    if (!isNaN(val) && val >= 5 && val <= 100) {
      indicators.bb.setPeriod(val);
    }
  }, [indicators.bb.periodInput]);

  useEffect(() => {
    const val = parseFloat(indicators.bb.stdDevInput);
    if (!isNaN(val) && val >= 0.5 && val <= 4) {
      indicators.bb.setStdDev(val);
    }
  }, [indicators.bb.stdDevInput]);

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
      const binanceSymbol = removeUSDTSuffix(symbol);
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
            return {
              time: formatTimeOnly(timestampSeconds),
              date: formatDateOnly(timestampSeconds),
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
  }, [analyzeFVGValue, footprintData]);

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

  // Oscillator calculation functions



  const calculateStochRSI = useCallback((bars: CandleData[], period: number = 14) => {
    // Use the existing calculateStochasticRSI from indicators lib and return %K line
    const stochData = calculateStochasticRSI(bars, period, period);
    return stochData.map(d => ({ time: d.time, value: d.k }));
  }, [calculateStochasticRSI]);







  const detectDivergences = useCallback((candles: CandleData[]) => {
    if (candles.length < 20) return [];
    
    const rsiData = calculateRSI(candles, indicators.rsi.period);
    const macdData = calculateMACD(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal).macd;
    const mfiData = calculateMFI(candles, indicators.mfi.period);
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
  }, [calculateRSI, calculateMACD, calculateMFI, calculateOBV, indicators.rsi.period, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal, indicators.mfi.period]);

  // Determine market bias (EMA-based) using configurable periods
  const determineBias = useCallback((data: CandleData[]) => {
    const closes = data.map(c => c.close);
    const emaFast = calculateEMA(closes, indicators.ema.fastPeriod);
    const emaSlow = calculateEMA(closes, indicators.ema.slowPeriod);
    const newBias = emaFast[emaFast.length - 1] > emaSlow[emaSlow.length - 1] ? 'bullish' : 'bearish';
    setBias(newBias);
  }, [indicators.ema.fastPeriod, indicators.ema.slowPeriod]);

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

  // *** Helper functions removed - using imported versions from @/lib/strategies ***

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
    
    if (indicators.vwap.showDaily) {
      const dailyVWAP = calculatePeriodicVWAP(candles, 'daily', true);
      if (dailyVWAP.length > 0) vwaps.push(dailyVWAP[dailyVWAP.length - 1].value);
    }
    
    if (indicators.vwap.showWeekly) {
      const weeklyVWAP = calculatePeriodicVWAP(candles, 'weekly', true);
      if (weeklyVWAP.length > 0) vwaps.push(weeklyVWAP[weeklyVWAP.length - 1].value);
    }
    
    if (indicators.vwap.showRolling) {
      const rolling = calculateRollingVWAP(candles, indicators.vwap.rollingPeriod);
      if (rolling.length > 0) vwaps.push(rolling[rolling.length - 1].value);
    }
    
    if (vwaps.length === 0) return null;
    
    // Find closest VWAP to current price
    return vwaps.reduce((closest, vwap) => {
      return Math.abs(vwap - currentPrice) < Math.abs(closest - currentPrice) ? vwap : closest;
    });
  }, [candles, indicators.vwap.showDaily, indicators.vwap.showWeekly, indicators.vwap.showRolling, indicators.vwap.rollingPeriod, calculatePeriodicVWAP, calculateRollingVWAP]);

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
  // ==================== STRATEGY SIGNAL GENERATORS (Wrappers for extracted modules) ====================
  
  // Generate liquidity grab signal - wrapper for extracted core function
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
    // Get VWAP values if needed
    const vwapValues: number[] = [];
    if (indicators.vwap.showDaily) {
      const dailyVWAP = calculatePeriodicVWAP(candles, 'daily', true);
      if (dailyVWAP.length > 0) vwapValues.push(dailyVWAP[dailyVWAP.length - 1].value);
    }
    if (indicators.vwap.showWeekly) {
      const weeklyVWAP = calculatePeriodicVWAP(candles, 'weekly', true);
      if (weeklyVWAP.length > 0) vwapValues.push(weeklyVWAP[weeklyVWAP.length - 1].value);
    }
    if (indicators.vwap.showRolling) {
      const rolling = calculateRollingVWAP(candles, indicators.vwap.rollingPeriod);
      if (rolling.length > 0) vwapValues.push(rolling[rolling.length - 1].value);
    }

    return generateLiquidityGrabSignalCore(data, {
      enabled: bypassToggle || stratLiquidityGrab,
      swingLength: overrideSettings?.swingLength ?? liqGrabSwingLength,
      trendFilter: overrideSettings?.trendFilter ?? liqGrabTrendFilter,
      directionFilter: overrideSettings?.directionFilter ?? liqGrabDirectionFilter,
      tpslConfig: overrideSettings?.tpslConfig ?? liqGrabTPSL,
      tpSwingLength: liqGrabTPSwingLength,
      accountSize,
      riskPercent,
      bias,
      structureTrend,
      vwapValues
    }, bypassToggle);
  }, [stratLiquidityGrab, liqGrabSwingLength, liqGrabDirectionFilter, liqGrabTrendFilter, bias, structureTrend, liqGrabTPSL, liqGrabTPSwingLength, accountSize, riskPercent, candles, indicators.vwap, calculatePeriodicVWAP, calculateRollingVWAP]);

  // Generate BOS Trend Follow signal - wrapper for extracted core function
  const generateBOSTrendSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    const vwapValues: number[] = [];
    if (indicators.vwap.showDaily) {
      const dailyVWAP = calculatePeriodicVWAP(candles, 'daily', true);
      if (dailyVWAP.length > 0) vwapValues.push(dailyVWAP[dailyVWAP.length - 1].value);
    }
    if (indicators.vwap.showWeekly) {
      const weeklyVWAP = calculatePeriodicVWAP(candles, 'weekly', true);
      if (weeklyVWAP.length > 0) vwapValues.push(weeklyVWAP[weeklyVWAP.length - 1].value);
    }
    if (indicators.vwap.showRolling) {
      const rolling = calculateRollingVWAP(candles, indicators.vwap.rollingPeriod);
      if (rolling.length > 0) vwapValues.push(rolling[rolling.length - 1].value);
    }

    return generateBOSTrendSignalCore(data, {
      enabled: stratBOSTrend,
      swingLength: bosSwingLength,
      directionFilter: bosDirectionFilter,
      trendFilter: bosTrendFilter,
      tpslConfig: bosTPSL,
      slSwingLength: bosSLSwingLength,
      tpSwingLength: bosTPSwingLength,
      accountSize,
      riskPercent,
      bias,
      structureTrend,
      vwapValues
    });
  }, [stratBOSTrend, bosSwingLength, bosDirectionFilter, bosTrendFilter, bias, structureTrend, bosTPSL, bosSLSwingLength, bosTPSwingLength, accountSize, riskPercent, candles, indicators.vwap, calculatePeriodicVWAP, calculateRollingVWAP]);

  // Generate CHoCH + FVG signal - wrapper for extracted core function
  const generateChochFVGSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    return generateChochFVGSignalCore(data, {
      enabled: stratChochFVG,
      volumeThreshold: chochFVGVolumeThreshold,
      useFVGSizeFilter: chochUseFVGSizeFilter,
      fvgMinSizeATR: chochFVGMinSizeATR,
      tpslConfig: chochTPSL,
      slSwingLength: chochSLSwingLength,
      tpSwingLength: chochTPSwingLength,
      accountSize,
      riskPercent,
      footprintData: [],
      fvgVolumeThreshold: chochFVGVolumeThreshold
    });
  }, [stratChochFVG, chochFVGVolumeThreshold, chochUseFVGSizeFilter, chochFVGMinSizeATR, chochTPSL, chochSLSwingLength, chochTPSwingLength, accountSize, riskPercent]);

  // Generate VWAP Trading signal - wrapper for extracted core function
  const generateVWAPTradingSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    // Skip if vwapType is 'session' as it's not supported by core function
    if (vwapType === 'session') return null;
    
    return generateVWAPTradingSignalCore(data, {
      enabled: stratVWAPRejection,
      vwapType: vwapType as 'daily' | 'weekly' | 'monthly' | 'rolling10' | 'rolling20' | 'rolling50',
      threshold: vwapThreshold,
      entryCandles: vwapEntryCandles,
      tpslConfig: vwapTPSL,
      tpSwingLength: vwapTPSwingLength,
      accountSize,
      riskPercent,
      directionFilter: (type: 'LONG' | 'SHORT') => checkDirectionFilter(type)
    });
  }, [stratVWAPRejection, vwapType, vwapThreshold, vwapEntryCandles, vwapTPSL, vwapTPSwingLength, accountSize, riskPercent, checkDirectionFilter]);

  // Generate EMA Trading signal - wrapper for extracted core function
  const generateEMATradingSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    // Map emaEntryMode to the format expected by core function
    const mappedEntryMode: 'bounce' | 'cross' | 'trend' = 
      emaEntryMode === 'trend_trade' ? 'trend' : emaEntryMode;
    
    return generateEMATradingSignalCore(data, {
      enabled: stratEMATrading,
      entryMode: mappedEntryMode,
      singlePeriod: emaSinglePeriod,
      fastPeriod: indicators.ema.fastPeriod,
      slowPeriod: indicators.ema.slowPeriod,
      threshold: emaThreshold,
      tpslConfig: emaTradingTPSL,
      slSwingLength: emaTradingSLSwingLength,
      tpSwingLength: emaTradingTPSwingLength,
      accountSize,
      riskPercent,
      directionFilter: (type: 'LONG' | 'SHORT') => checkDirectionFilter(type)
    });
  }, [stratEMATrading, emaEntryMode, emaSinglePeriod, indicators.ema.fastPeriod, indicators.ema.slowPeriod, emaThreshold, emaTradingTPSL, emaTradingSLSwingLength, emaTradingTPSwingLength, accountSize, riskPercent, checkDirectionFilter]);

  // Generate R/S Flip signal - wrapper for extracted core function
  const generateRSFlipSignal = useCallback((data: CandleData[]): TradeSignal | null => {
    return generateRSFlipSignalCore(data, {
      enabled: stratRSFlip,
      retestCandles: rsFlipRetestCandles,
      directionFilter: rsFlipDirectionFilter,
      trendFilter: rsFlipTrendFilter,
      trendlineMinTouches: indicators.smc.trendlineMinTouches,
      trendlineTolerance: indicators.smc.trendlineTolerance,
      trendlinePivotLength: indicators.smc.trendlinePivotLength,
      tpslConfig: rsFlipTPSL,
      tpSwingLength: rsFlipTPSwingLength,
      accountSize,
      riskPercent,
      bias,
      structureTrend
    });
  }, [stratRSFlip, rsFlipRetestCandles, rsFlipDirectionFilter, rsFlipTrendFilter, indicators.smc.trendlineMinTouches, indicators.smc.trendlineTolerance, indicators.smc.trendlinePivotLength, rsFlipTPSL, rsFlipTPSwingLength, accountSize, riskPercent, bias, structureTrend]);


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
      tradingState.setTradeSignals(prev => {
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
      const effectivePivotLength = indicators.smc.trendlinePivotLength || adaptivePivotLength;
      
      // Detect current trendlines
      const trendlines = detectTrendlines(candles, indicators.smc.trendlineMinTouches, indicators.smc.trendlineTolerance, effectivePivotLength);
      
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
    const rsiData = calculateRSI(candles, indicators.rsi.period);
    const macdData = calculateMACD(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal).macd;
    const mfiData = calculateMFI(candles, indicators.mfi.period);
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
    const macdFull = calculateMACD(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal);
    
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
    if (indicators.bb.show && candles.length > indicators.bb.period) {
      const bbData = calculateBollingerBands(candles, indicators.bb.period, indicators.bb.stdDev);
      
      // 1-week lookback
      const oneWeekSeconds = 7 * 24 * 60 * 60;
      const currentTime = candles[candles.length - 1].time;
      const cutoffTime = currentTime - oneWeekSeconds;
      
      // Check recent candles for BB touches and breakouts
      for (let i = indicators.bb.period; i < candles.length; i++) {
        const candle = candles[i];
        
        // Skip old candles
        if (candle.time < cutoffTime) continue;
        
        const bbIdx = i - indicators.bb.period + 1;
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
          const prevBbIdx = i - indicators.bb.period;
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
                description: `Price crossed above BB middle band (SMA${indicators.bb.period})`,
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
                description: `Price crossed below BB middle band (SMA${indicators.bb.period})`,
              });
            }
          }
        }
      }
    }
    
    // Sort by time descending (most recent first) and keep last 20
    const sortedAlerts = newAlerts.sort((a, b) => b.time - a.time).slice(0, 20);
    setMarketAlerts(sortedAlerts);
  }, [candles, liqGrabSwingLength, calculateBOSandCHoCH, calculateFVGs, isActiveFVG, calculatePeriodicVWAP, vwapThreshold, detectTrendlines, indicators.smc.trendlineMinTouches, indicators.smc.trendlineTolerance, indicators.smc.trendlinePivotLength, detectDivergences, cvdSpikeEnabled, cvdBullishThreshold, cvdBearishThreshold, deltaHistory, indicators.bb.show, indicators.bb.period, indicators.bb.stdDev]);

  // Wrapper for simulateTrade to pass all necessary dependencies
  const simulateTradeWrapper = useCallback((signal: TradeSignal, startIdx: number, data: CandleData[]): BacktestTrade | null => {
    return simulateTrade(signal, startIdx, data, {
      vwapType,
      commissionRate: 0.001,
      slippageBps: 0.0005,
      liqGrabTPSL,
      bosTPSL,
      chochTPSL,
      vwapTPSL,
      rsFlipTPSL,
      emaTradingTPSL,
      chochTPSwingLength,
      liqGrabTPSwingLength,
    });
  }, [vwapType, liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, rsFlipTPSL, emaTradingTPSL, chochTPSwingLength, liqGrabTPSwingLength]);
  // Generate all combinations of bot configurations for auto-backtest
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
          const trade = simulateTradeWrapper(liqSignal, j, candles);
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
  }, [candles, generateAutoBacktestCombinations, generateLiquidityGrabSignal, simulateTradeWrapper, liqGrabTPSL, accountSize, riskPercent]);

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
      indicators: {
        ema: {
          show: indicators.ema.show,
          fastPeriod: indicators.ema.fastPeriod,
          slowPeriod: indicators.ema.slowPeriod,
          configs: indicators.ema.configs,
        },
        sma: {
          show: indicators.sma.show,
          configs: indicators.sma.configs,
        },
        rsi: {
          show: indicators.rsi.show,
          period: indicators.rsi.period,
        },
        macd: {
          show: indicators.macd.show,
          fast: indicators.macd.fast,
          slow: indicators.macd.slow,
          signal: indicators.macd.signal,
        },
        obv: {
          show: indicators.obv.show,
        },
        mfi: {
          show: indicators.mfi.show,
          period: indicators.mfi.period,
        },
        stochRSI: {
          show: indicators.stochRSI.show,
          period: indicators.stochRSI.period,
        },
        williamsR: {
          show: indicators.williamsR.show,
          period: indicators.williamsR.period,
        },
        cci: {
          show: indicators.cci.show,
          period: indicators.cci.period,
        },
        adx: {
          show: indicators.adx.show,
          period: indicators.adx.period,
        },
        bb: {
          show: indicators.bb.show,
          period: indicators.bb.period,
          stdDev: indicators.bb.stdDev,
        },
        vwap: {
          showSession: indicators.vwap.showSession,
          showDaily: indicators.vwap.showDaily,
          showWeekly: indicators.vwap.showWeekly,
          showMonthly: indicators.vwap.showMonthly,
          showRolling: indicators.vwap.showRolling,
          rollingPeriod: indicators.vwap.rollingPeriod,
        },
        vwapTools: {
          showBands: indicators.vwapTools.showBands,
          showSession: indicators.vwapTools.showSession,
        },
        smc: {
          showFVG: indicators.smc.showFVG,
          showBOS: indicators.smc.showBOS,
          showCHoCH: indicators.smc.showCHoCH,
          showSwingPivots: indicators.smc.showSwingPivots,
          showOrderBlocks: indicators.smc.showOrderBlocks,
          obSwingLength: indicators.smc.obSwingLength,
          orderBlockLength: indicators.smc.orderBlockLength,
          showPremiumDiscount: indicators.smc.showPremiumDiscount,
          showAutoTrendlines: indicators.smc.showAutoTrendlines,
          showHighValueOnly: indicators.smc.showHighValueOnly,
          showChartLabels: indicators.smc.showChartLabels,
        },
        supertrend: {
          show: indicators.supertrend.show,
          period: indicators.supertrend.period,
          multiplier: indicators.supertrend.multiplier,
        },
        parabolicSAR: {
          show: indicators.parabolicSAR.show,
          step: indicators.parabolicSAR.step,
          max: indicators.parabolicSAR.max,
        },
      },
      alertFilterMode,
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
  }, [userId, symbol, interval, indicators.ema.show, indicators.ema.fastPeriod, indicators.ema.slowPeriod, indicators.ema.configs, indicators.sma.show, indicators.sma.configs, indicators.rsi.show, indicators.rsi.period, indicators.macd.show, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal, indicators.obv.show, indicators.mfi.show, indicators.mfi.period, indicators.stochRSI.show, indicators.stochRSI.period, indicators.williamsR.show, indicators.williamsR.period, indicators.cci.show, indicators.cci.period, indicators.adx.show, indicators.adx.period, indicators.bb.show, indicators.bb.period, indicators.bb.stdDev, indicators.vwap.showSession, indicators.vwap.showDaily, indicators.vwap.showWeekly, indicators.vwap.showMonthly, indicators.vwap.showRolling, indicators.vwap.rollingPeriod, indicators.vwapTools.showBands, indicators.vwapTools.showSession, indicators.smc.showFVG, indicators.smc.showBOS, indicators.smc.showCHoCH, indicators.smc.showSwingPivots, indicators.smc.showOrderBlocks, indicators.smc.obSwingLength, indicators.smc.orderBlockLength, indicators.smc.showPremiumDiscount, indicators.supertrend.show, indicators.supertrend.period, indicators.supertrend.multiplier, indicators.parabolicSAR.show, indicators.parabolicSAR.step, indicators.parabolicSAR.max, indicators.smc.showAutoTrendlines, indicators.smc.showHighValueOnly, indicators.smc.showChartLabels, alertFilterMode, cvdSpikeEnabled, cvdSpikeLevel1, cvdSpikeLevel2, cvdSpikeLevel3, toast]);

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
    indicators.ema.setShow(false);
    indicators.ema.setConfigs([]);
    indicators.ema.setInputs({});
    // SMAs
    indicators.sma.setShow(false);
    indicators.sma.setConfigs([]);
    // Oscillators
    indicators.rsi.setShow(false);
    indicators.macd.setShow(false);
    indicators.obv.setShow(false);
    indicators.mfi.setShow(false);
    indicators.stochRSI.setShow(false);
    indicators.williamsR.setShow(false);
    indicators.cci.setShow(false);
    indicators.adx.setShow(false);
    // Bollinger Bands
    indicators.bb.setShow(false);
    // VWAPs
    indicators.vwap.setShowSession(false);
    indicators.vwap.setShowDaily(false);
    indicators.vwap.setShowWeekly(false);
    indicators.vwap.setShowMonthly(false);
    indicators.vwap.setShowRolling(false);
    indicators.vwapTools.setShowBands(false);
    indicators.vwapTools.setShowSession(false);
    // SMC Indicators
    indicators.smc.setShowFVG(false);
    indicators.smc.setShowBOS(false);
    indicators.smc.setShowCHoCH(false);
    indicators.smc.setShowSwingPivots(false);
    indicators.smc.setShowOrderBlocks(false);
    indicators.smc.setShowPremiumDiscount(false);
    // Trend Indicators
    indicators.supertrend.setShow(false);
    indicators.parabolicSAR.setShow(false);
    indicators.smc.setShowAutoTrendlines(false);
    // Display options
    indicators.smc.setShowHighValueOnly(false);
    indicators.smc.setShowChartLabels(false);
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
      if (defaults.indicators.ema.show !== undefined) indicators.ema.setShow(defaults.indicators.ema.show);
      if (defaults.indicators.ema.fastPeriod !== undefined) {
        indicators.ema.setFastInput(defaults.indicators.ema.fastPeriod.toString());
      }
      if (defaults.indicators.ema.slowPeriod !== undefined) {
        indicators.ema.setSlowInput(defaults.indicators.ema.slowPeriod.toString());
      }
      if (defaults.indicators.ema.configs && Array.isArray(defaults.indicators.ema.configs)) {
        indicators.ema.setConfigs(defaults.indicators.ema.configs);
        const inputs: Record<string, string> = {};
        defaults.indicators.ema.configs.forEach((c: any) => {
          inputs[c.id] = String(c.period);
        });
        indicators.ema.setInputs(inputs);
      }
      
      // SMAs
      if (defaults.indicators.sma.show !== undefined) indicators.sma.setShow(defaults.indicators.sma.show);
      if (defaults.indicators.sma.configs && Array.isArray(defaults.indicators.sma.configs)) {
        indicators.sma.setConfigs(defaults.indicators.sma.configs);
      }
      
      // Oscillators
      if (defaults.indicators.rsi.show !== undefined) indicators.rsi.setShow(defaults.indicators.rsi.show);
      if (defaults.indicators.rsi.period !== undefined) {
        indicators.rsi.setPeriod(defaults.indicators.rsi.period);
        indicators.rsi.setPeriodInput(defaults.indicators.rsi.period.toString());
      }
      if (defaults.indicators.macd.show !== undefined) indicators.macd.setShow(defaults.indicators.macd.show);
      if (defaults.indicators.macd.fast !== undefined) {
        indicators.macd.setFast(defaults.indicators.macd.fast);
        indicators.macd.setFastInput(defaults.indicators.macd.fast.toString());
      }
      if (defaults.indicators.macd.slow !== undefined) {
        indicators.macd.setSlow(defaults.indicators.macd.slow);
        indicators.macd.setSlowInput(defaults.indicators.macd.slow.toString());
      }
      if (defaults.indicators.macd.signal !== undefined) {
        indicators.macd.setSignal(defaults.indicators.macd.signal);
        indicators.macd.setSignalInput(defaults.indicators.macd.signal.toString());
      }
      if (defaults.indicators.obv.show !== undefined) indicators.obv.setShow(defaults.indicators.obv.show);
      if (defaults.indicators.mfi.show !== undefined) indicators.mfi.setShow(defaults.indicators.mfi.show);
      if (defaults.indicators.mfi.period !== undefined) {
        indicators.mfi.setPeriod(defaults.indicators.mfi.period);
        indicators.mfi.setPeriodInput(defaults.indicators.mfi.period.toString());
      }
      if (defaults.indicators.stochRSI.show !== undefined) indicators.stochRSI.setShow(defaults.indicators.stochRSI.show);
      if (defaults.indicators.stochRSI.period !== undefined) {
        indicators.stochRSI.setPeriod(defaults.indicators.stochRSI.period);
        indicators.stochRSI.setPeriodInput(defaults.indicators.stochRSI.period.toString());
      }
      if (defaults.indicators.williamsR.show !== undefined) indicators.williamsR.setShow(defaults.indicators.williamsR.show);
      if (defaults.indicators.williamsR.period !== undefined) {
        indicators.williamsR.setPeriod(defaults.indicators.williamsR.period);
        indicators.williamsR.setPeriodInput(defaults.indicators.williamsR.period.toString());
      }
      if (defaults.indicators.cci.show !== undefined) indicators.cci.setShow(defaults.indicators.cci.show);
      if (defaults.indicators.cci.period !== undefined) {
        indicators.cci.setPeriod(defaults.indicators.cci.period);
        indicators.cci.setPeriodInput(defaults.indicators.cci.period.toString());
      }
      if (defaults.indicators.adx.show !== undefined) indicators.adx.setShow(defaults.indicators.adx.show);
      if (defaults.indicators.adx.period !== undefined) {
        indicators.adx.setPeriod(defaults.indicators.adx.period);
        indicators.adx.setPeriodInput(defaults.indicators.adx.period.toString());
      }
      
      // Bollinger Bands
      if (defaults.indicators.bb.show !== undefined) indicators.bb.setShow(defaults.indicators.bb.show);
      if (defaults.indicators.bb.period !== undefined) {
        indicators.bb.setPeriod(defaults.indicators.bb.period);
        indicators.bb.setPeriodInput(defaults.indicators.bb.period.toString());
      }
      if (defaults.indicators.bb.stdDev !== undefined) {
        indicators.bb.setStdDev(defaults.indicators.bb.stdDev);
        indicators.bb.setStdDevInput(defaults.indicators.bb.stdDev.toString());
      }
      
      // VWAPs
      if (defaults.indicators.vwap.showSession !== undefined) indicators.vwap.setShowSession(defaults.indicators.vwap.showSession);
      if (defaults.indicators.vwap.showDaily !== undefined) indicators.vwap.setShowDaily(defaults.indicators.vwap.showDaily);
      if (defaults.indicators.vwap.showWeekly !== undefined) indicators.vwap.setShowWeekly(defaults.indicators.vwap.showWeekly);
      if (defaults.indicators.vwap.showMonthly !== undefined) indicators.vwap.setShowMonthly(defaults.indicators.vwap.showMonthly);
      if (defaults.indicators.vwap.showRolling !== undefined) indicators.vwap.setShowRolling(defaults.indicators.vwap.showRolling);
      if (defaults.indicators.vwap.rollingPeriod !== undefined) {
        indicators.vwap.setRollingPeriod(defaults.indicators.vwap.rollingPeriod);
        indicators.vwap.setRollingPeriodInput(defaults.indicators.vwap.rollingPeriod.toString());
      }
      if (defaults.indicators.vwapTools.showBands !== undefined) indicators.vwapTools.setShowBands(defaults.indicators.vwapTools.showBands);
      if (defaults.indicators.vwapTools.showSession !== undefined) indicators.vwapTools.setShowSession(defaults.indicators.vwapTools.showSession);
      
      // SMC Indicators
      if (defaults.indicators.smc.showFVG !== undefined) indicators.smc.setShowFVG(defaults.indicators.smc.showFVG);
      if (defaults.indicators.smc.showBOS !== undefined) indicators.smc.setShowBOS(defaults.indicators.smc.showBOS);
      if (defaults.indicators.smc.showCHoCH !== undefined) indicators.smc.setShowCHoCH(defaults.indicators.smc.showCHoCH);
      if (defaults.indicators.smc.showSwingPivots !== undefined) indicators.smc.setShowSwingPivots(defaults.indicators.smc.showSwingPivots);
      if (defaults.indicators.smc.showOrderBlocks !== undefined) indicators.smc.setShowOrderBlocks(defaults.indicators.smc.showOrderBlocks);
      if (defaults.indicators.smc.obSwingLength !== undefined) {
        indicators.smc.setObSwingLength(defaults.indicators.smc.obSwingLength);
        indicators.smc.setObSwingLengthInput(defaults.indicators.smc.obSwingLength.toString());
      }
      if (defaults.indicators.smc.orderBlockLength !== undefined) {
        indicators.smc.setOrderBlockLength(defaults.indicators.smc.orderBlockLength);
        indicators.smc.setOrderBlockLengthInput(defaults.indicators.smc.orderBlockLength.toString());
      }
      if (defaults.indicators.smc.showPremiumDiscount !== undefined) indicators.smc.setShowPremiumDiscount(defaults.indicators.smc.showPremiumDiscount);
      
      // Trend Indicators
      if (defaults.indicators.supertrend.show !== undefined) indicators.supertrend.setShow(defaults.indicators.supertrend.show);
      if (defaults.indicators.supertrend.period !== undefined) {
        indicators.supertrend.setPeriod(defaults.indicators.supertrend.period);
        indicators.supertrend.setPeriodInput(defaults.indicators.supertrend.period.toString());
      }
      if (defaults.indicators.supertrend.multiplier !== undefined) {
        indicators.supertrend.setMultiplier(defaults.indicators.supertrend.multiplier);
        indicators.supertrend.setMultiplierInput(defaults.indicators.supertrend.multiplier.toString());
      }
      if (defaults.indicators.parabolicSAR.show !== undefined) indicators.parabolicSAR.setShow(defaults.indicators.parabolicSAR.show);
      if (defaults.indicators.parabolicSAR.step !== undefined) {
        indicators.parabolicSAR.setStep(defaults.indicators.parabolicSAR.step);
        indicators.parabolicSAR.setStepInput(defaults.indicators.parabolicSAR.step.toString());
      }
      if (defaults.indicators.parabolicSAR.max !== undefined) {
        indicators.parabolicSAR.setMax(defaults.indicators.parabolicSAR.max);
        indicators.parabolicSAR.setMaxInput(defaults.indicators.parabolicSAR.max.toString());
      }
      if (defaults.indicators.smc.showAutoTrendlines !== undefined) indicators.smc.setShowAutoTrendlines(defaults.indicators.smc.showAutoTrendlines);
      
      // Display options
      if (defaults.indicators.smc.showHighValueOnly !== undefined) indicators.smc.setShowHighValueOnly(defaults.indicators.smc.showHighValueOnly);
      if (defaults.indicators.smc.showChartLabels !== undefined) indicators.smc.setShowChartLabels(defaults.indicators.smc.showChartLabels);
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
    if (indicators.smc.showBOS || indicators.smc.showCHoCH || indicators.smc.showFVG || stratLiquidityGrab || indicators.smc.showSwingPivots) {
      active.add('smc');
    }
    
    // VWAP indicators
    if (indicators.vwap.showDaily || indicators.vwap.showWeekly || indicators.vwap.showMonthly || indicators.vwap.showRolling) {
      active.add('vwap');
    }
    
    // Trendlines
    if (indicators.smc.showAutoTrendlines) {
      active.add('trendlines');
    }
    
    // Oscillators
    if (indicators.rsi.show) active.add('rsi');
    if (indicators.macd.show) active.add('macd');
    if (indicators.mfi.show) active.add('mfi');
    if (indicators.obv.show) active.add('obv');
    
    // Bollinger Bands
    if (indicators.bb.show) active.add('bollinger');
    
    // CVD is always active for orderflow
    if (cvdSpikeEnabled) active.add('cvd');
    
    return active;
  }, [indicators.smc.showBOS, indicators.smc.showCHoCH, indicators.smc.showFVG, stratLiquidityGrab, indicators.smc.showSwingPivots, indicators.vwap.showDaily, indicators.vwap.showWeekly, indicators.vwap.showMonthly, indicators.vwap.showRolling, indicators.smc.showAutoTrendlines, indicators.rsi.show, indicators.macd.show, indicators.mfi.show, indicators.obv.show, indicators.bb.show, cvdSpikeEnabled]);

  // Run backtest on historical data
  // NEW: Only allow 1 trade at a time - no overlapping trades
  const runBacktest = useCallback(async () => {
    if (candles.length < 100) {
      alert('Need at least 100 candles for backtest');
      return;
    }
    
    tradingState.setBacktesting(true);
    
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
          const trade = simulateTradeWrapper(liqSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const chochSignal = generateChochFVGSignal(dataSlice);
        if (chochSignal && !allSignals.some(s => s.id === chochSignal.id)) {
          allSignals.push(chochSignal);
          const trade = simulateTradeWrapper(chochSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const vwapSignal = generateVWAPTradingSignal(dataSlice);
        if (vwapSignal && !allSignals.some(s => s.id === vwapSignal.id)) {
          allSignals.push(vwapSignal);
          const trade = simulateTradeWrapper(vwapSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const emaSignal = generateEMATradingSignal(dataSlice);
        if (emaSignal && !allSignals.some(s => s.id === emaSignal.id)) {
          allSignals.push(emaSignal);
          const trade = simulateTradeWrapper(emaSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const rsFlipSignal = generateRSFlipSignal(dataSlice);
        if (rsFlipSignal && !allSignals.some(s => s.id === rsFlipSignal.id)) {
          allSignals.push(rsFlipSignal);
          const trade = simulateTradeWrapper(rsFlipSignal, j, candles);
          if (trade) {
            completedTrades.push(trade);
            lastTradeExitTime = trade.exitTime;
            continue; // Skip other signals this candle - we took a trade
          }
        }
        
        const bosTrendSignal = generateBOSTrendSignal(dataSlice);
        if (bosTrendSignal && !allSignals.some(s => s.id === bosTrendSignal.id)) {
          allSignals.push(bosTrendSignal);
          const trade = simulateTradeWrapper(bosTrendSignal, j, candles);
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
    
    tradingState.setBacktestResults(results);
    tradingState.setBacktesting(false);
  }, [candles, generateLiquidityGrabSignal, generateChochFVGSignal, generateVWAPTradingSignal, generateEMATradingSignal, generateRSFlipSignal, generateBOSTrendSignal, simulateTradeWrapper, accountSize, riskPercent, liqGrabSwingLength, liqGrabTrendFilter, liqGrabDirectionFilter, stratLiquidityGrab, calculateBOSandCHoCH, liqGrabTPSL]);

  // Handle strategy generation
  const handleGenerateStrategy = useCallback((type: 'scalping' | 'day-trading' | 'swing-trading') => {
    // TODO: Integrate with existing strategy generation logic
    // This is a placeholder that will be expanded to:
    // - scalping: Quick entries/exits, tight stops (1-5min timeframes)
    // - day-trading: Intraday patterns (15m-1h timeframes)
    // - swing-trading: Multi-day holds (4h-1d timeframes)
    
    console.log('Generating strategy of type:', type);
    
    // Future: Set up appropriate indicators and parameters for the strategy type
    // Could trigger different signal generators based on type
  }, []);

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

// Chart initialization is now handled by ChartContainer component
  
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

    manageVWAP('session', indicators.vwap.showSession, calculatePeriodicVWAP(candles, 'daily', true), '#a78bfa', 'Session VWAP');
    manageVWAP('daily', indicators.vwap.showDaily, calculatePeriodicVWAP(candles, 'daily', true), '#fb923c', 'Daily VWAP');
    manageVWAP('weekly', indicators.vwap.showWeekly, calculatePeriodicVWAP(candles, 'weekly', true), '#10b981', 'Weekly VWAP');
    manageVWAP('monthly', indicators.vwap.showMonthly, calculatePeriodicVWAP(candles, 'monthly', true), '#3b82f6', 'Monthly VWAP');
    const rollingKey = indicators.vwap.rollingPeriod === 10 ? 'rolling10' : indicators.vwap.rollingPeriod === 50 ? 'rolling50' : 'rolling20';
    manageVWAP(rollingKey, indicators.vwap.showRolling, calculateRollingVWAP(candles, indicators.vwap.rollingPeriod), '#ec4899', `rVWAP(${indicators.vwap.rollingPeriod})`);
  }, [chartReady, candles, indicators.vwap.showSession, indicators.vwap.showDaily, indicators.vwap.showWeekly, indicators.vwap.showMonthly, indicators.vwap.showRolling, indicators.vwap.rollingPeriod, calculatePeriodicVWAP, calculateRollingVWAP]);


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
      const htfTimeframes = indicators.ema.configs
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
            emaHTFDataCache.current[cacheKey] = binanceToCandleData(data);
          }
        } catch (e) {
          console.error(`Failed to fetch ${tf} data for EMA:`, e);
        }
      }
    };
    
    if (indicators.ema.show && symbol) {
      fetchHTFData();
    }
  }, [indicators.ema.show, indicators.ema.configs, symbol, interval]);


  // Manage Bollinger Bands on main chart

  // ========== BATCH 1 INDICATORS ==========
  
  // Supertrend Indicator
  
  // VWAP Bands
  
  // Session VWAP
  
  
  // Premium/Discount Zones (SMC)
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    const refs = premiumDiscountRefs.current;
    
    if (indicators.smc.showPremiumDiscount) {
      const pdData = calculatePremiumDiscount(candles, indicators.smc.pdLookback);
      
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
  }, [chartReady, candles, indicators.smc.showPremiumDiscount, indicators.smc.pdLookback]);
  
  // ========== BATCH 3 INDICATORS ==========
  
  // Fetch higher timeframe data for SMA calculations
  useEffect(() => {
    const fetchHTFData = async () => {
      const htfTimeframes = indicators.sma.configs
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
            smaHTFDataCache.current[cacheKey] = binanceToCandleData(data);
          }
        } catch (e) {
          console.error(`Failed to fetch ${tf} data for SMA:`, e);
        }
      }
    };
    
    if (indicators.sma.show && symbol) {
      fetchHTFData();
    }
  }, [indicators.sma.show, indicators.sma.configs, symbol, interval]);

  // SMA (Simple Moving Average) - Dynamic config list
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    const refs = smaSeriesRefs.current;

    // Remove old SMA series that are no longer in configs
    const currentIds = new Set(indicators.sma.configs.map(c => c.id));
    Object.keys(refs).forEach(key => {
      if (!currentIds.has(key) && refs[key]) {
        try { chart.removeSeries(refs[key]!); } catch (e) {}
        delete refs[key];
      }
    });

    if (!indicators.sma.show) {
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
    for (const config of indicators.sma.configs) {
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
  }, [chartReady, candles, indicators.sma.show, indicators.sma.configs, symbol, interval]);
  
  // Parabolic SAR


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
    
    if (!indicators.smc.showSwingPivots) return;

    try {
      // Calculate swings at the user-specified swing length
      const swings = calculateSwings(candles, indicators.smc.swingPivotLength);
      
      console.log(`🎯 Drawing ${swings.length} swing pivot markers (length: ${indicators.smc.swingPivotLength})`);
      
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
  }, [chartReady, candles, indicators.smc.showSwingPivots, indicators.smc.swingPivotLength, calculateSwings]);

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
    
    if (!indicators.smc.showAutoTrendlines) return;

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
      const effectivePivotLength = indicators.smc.trendlinePivotLength || adaptivePivotLength;
      
      const trendlines = detectTrendlines(candles, indicators.smc.trendlineMinTouches, indicators.smc.trendlineTolerance, effectivePivotLength);
      
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
  }, [chartReady, candles, indicators.smc.showAutoTrendlines, indicators.smc.trendlineMinTouches, indicators.smc.trendlineTolerance, indicators.smc.trendlinePivotLength, detectTrendlines]);

  // NOTE: BOS/CHoCH text labels have been removed in Phase 4G-3
  // The BOSCHoCHMarkers component currently handles only horizontal lines
  // The "Chart Labels" toggle (indicators.smc.showChartLabels) is now non-functional
  // Future enhancement: Add label support to BOSCHoCHMarkers component or create separate LabelOverlay component

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
    const hasBacktestTrades = tradingState.backtestResults && tradingState.backtestResults.trades && tradingState.backtestResults.trades.length > 0;
    const currentReplayTime = isReplayMode && candles.length > 0 ? candles[candles.length - 1].time : Infinity;
    const visibleTrades = hasBacktestTrades 
      ? tradingState.backtestResults.trades.filter(trade => !isReplayMode || trade.entryTime <= currentReplayTime)
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
        time: entryTime,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: '#ffffff',
        shape: 'square',
        text: `Entry ${typeof entry === 'number' ? entry.toFixed(6) : entry}`
      });
      
      // Stop Loss marker (red) - only show if we have a numeric stop loss
      if (stopLoss !== undefined && stopLoss !== null && typeof stopLoss === 'number') {
        allMarkers.push({
          time: entryTime,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: '#ef4444',
          shape: 'square',
          text: `SL ${stopLoss.toFixed(6)}`
        });
      }
      
      // TP markers (green)
      if (numTPs >= 1 && tp1 !== undefined && tp1 !== null && typeof tp1 === 'number') {
        allMarkers.push({
          time: entryTime,
          position: isLong ? 'aboveBar' : 'belowBar',
          color: '#22c55e',
          shape: 'square',
          text: `TP1 ${tp1.toFixed(6)}`
        });
      }
      
      if (numTPs >= 2 && tp2 !== undefined && tp2 !== null && typeof tp2 === 'number') {
        allMarkers.push({
          time: entryTime,
          position: isLong ? 'aboveBar' : 'belowBar',
          color: '#22c55e',
          shape: 'square',
          text: `TP2 ${tp2.toFixed(6)}`
        });
      }
      
      if (numTPs >= 3 && tp3 !== undefined && tp3 !== null && typeof tp3 === 'number') {
        allMarkers.push({
          time: entryTime,
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
              time: candle.time,
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
              time: candle.time,
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
  }, [chartReady, tradingState.backtestResults, candles, liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, isReplayMode, cvdSpikeEnabled, cvdSpikeLevel1, cvdSpikeLevel2, cvdSpikeLevel3, deltaHistory]);

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

  // WebSocket hook - manages real-time updates
  useWebSocketConnection({
    symbol,
    interval,
    enabled: true,
    candlesLength: candles.length,
    onKlineUpdate: useCallback((bar: CandleData, isClosed: boolean) => {
      // Update chart only if bar time is >= last bar time
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
        if (isClosed) { // Candle closed
          if (bar.time > newCandles[newCandles.length - 1].time) {
            newCandles.push(bar);
            // Save delta for this closed candle
            setDeltaHistory(prevHist => {
              const delta = realDeltaData.get(bar.time) || currentDelta;
              const timestampSeconds = bar.time > 9999999999 ? Math.floor(bar.time / 1000) : bar.time;
              const newHist = [...prevHist, {
                time: new Date(timestampSeconds * 1000).toLocaleTimeString(),
                timestamp: timestampSeconds,
                delta,
                cumDelta: cumDelta,
                isBull: bar.close >= bar.open,
                volume: bar.volume
              }];
              return newHist.slice(-20);
            });
            setCurrentDelta(0);
          } else {
            newCandles[newCandles.length - 1] = bar;
          }
        } else {
          // Update last candle in real-time
          if (bar.time === newCandles[newCandles.length - 1].time) {
            newCandles[newCandles.length - 1] = bar;
          } else {
            newCandles.push(bar);
          }
        }
        return newCandles;
      });
    }, [realDeltaData, currentDelta, cumDelta]),
    onTradeUpdate: useCallback((delta: number) => {
      setCurrentDelta(prev => prev + delta);
      setCumDelta(prev => prev + delta);
    }, [])
  });

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

  // Helper callback for oscillator panels to register their charts
  const handleOscillatorChartCreated = useCallback((name: string, chart: IChartApi) => {
    oscillatorChartsRef.current.set(name, chart);
  }, []);

  // Get main chart visible range for oscillator sync
  const getMainChartVisibleRange = useCallback(() => {
    if (indicators.syncOscillatorScale && chartRef.current) {
      try {
        return chartRef.current.timeScale().getVisibleRange();
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [indicators.syncOscillatorScale]);

  // ========== OSCILLATOR TIME SCALE SYNC ==========
  // Sync oscillator chart time scales with main chart when enabled
  useEffect(() => {
    if (!indicators.syncOscillatorScale || !chartRef.current) return;
    
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
  }, [indicators.syncOscillatorScale]);

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
    if (indicators.rsi.show) {
      const rsiData = calculateRSI(candles, indicators.rsi.period);
      const rsiValues = rsiData.map(d => d.value);
      if (rsiValues.length > 0) {
        totalDivergence += detectDivergence(priceData.slice(-rsiValues.length), rsiValues);
        oscillatorCount++;
      }
    }
    
    // Check MACD divergence (using histogram)
    if (indicators.macd.show) {
      const { hist } = calculateMACD(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal);
      const histValues = hist.map(d => d.value);
      if (histValues.length > 0) {
        totalDivergence += detectDivergence(priceData.slice(-histValues.length), histValues);
        oscillatorCount++;
      }
    }
    
    // Check OBV divergence
    if (indicators.obv.show) {
      const obvData = calculateOBV(candles);
      const obvValues = obvData.map(d => d.value);
      if (obvValues.length > 0) {
        totalDivergence += detectDivergence(priceData.slice(-obvValues.length), obvValues);
        oscillatorCount++;
      }
    }
    
    // Check Stoch RSI divergence
    if (indicators.stochRSI.show) {
      const stochData = calculateStochasticRSI(candles, indicators.stochRSI.period);
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
    
  }, [candles, indicators.rsi.show, indicators.macd.show, indicators.obv.show, indicators.stochRSI.show, indicators.rsi.period, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal, indicators.stochRSI.period, calculateRSI, calculateMACD, calculateOBV, calculateStochasticRSI, detectDivergence]);

  // ========== INDICATOR REPORTS (Paid only) ==========
  // Generate brief contextual reports for active oscillators
  const getIndicatorReport = useCallback((
    indicator: string
  ): { text: string; color: string } => {
    if (candles.length < 20) return { text: '', color: '' };
    
    switch (indicator) {
      case 'RSI': {
        const rsiData = calculateRSI(candles, indicators.rsi.period);
        const lastRSI = rsiData[rsiData.length - 1]?.value;
        if (!lastRSI) return { text: '', color: '' };
        if (lastRSI >= 70) return { text: `Overbought (${lastRSI.toFixed(0)})`, color: 'text-red-400' };
        if (lastRSI <= 30) return { text: `Oversold (${lastRSI.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastRSI.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'MACD': {
        const { macd, signal } = calculateMACD(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal);
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
        const adxData = calculateADX(candles, indicators.adx.period);
        const lastADX = adxData[adxData.length - 1];
        if (!lastADX) return { text: '', color: '' };
        if (lastADX.adx >= 40) return { text: `Strong Trend (${lastADX.adx.toFixed(0)})`, color: 'text-blue-400' };
        if (lastADX.adx >= 25) return { text: `Trending (${lastADX.adx.toFixed(0)})`, color: 'text-cyan-400' };
        return { text: `Weak Trend (${lastADX.adx.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'StochRSI': {
        const stochData = calculateStochasticRSI(candles, indicators.stochRSI.period);
        const lastK = stochData[stochData.length - 1]?.k;
        if (!lastK) return { text: '', color: '' };
        if (lastK >= 80) return { text: `Overbought (${lastK.toFixed(0)})`, color: 'text-red-400' };
        if (lastK <= 20) return { text: `Oversold (${lastK.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastK.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'MFI': {
        const mfiData = calculateMFI(candles, indicators.mfi.period);
        const lastMFI = mfiData[mfiData.length - 1]?.value;
        if (!lastMFI) return { text: '', color: '' };
        if (lastMFI >= 80) return { text: `Overbought (${lastMFI.toFixed(0)})`, color: 'text-red-400' };
        if (lastMFI <= 20) return { text: `Oversold (${lastMFI.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastMFI.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'WilliamsR': {
        const wrData = calculateWilliamsR(candles, indicators.williamsR.period);
        const lastWR = wrData[wrData.length - 1]?.value;
        if (!lastWR) return { text: '', color: '' };
        if (lastWR >= -20) return { text: `Overbought (${lastWR.toFixed(0)})`, color: 'text-red-400' };
        if (lastWR <= -80) return { text: `Oversold (${lastWR.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastWR.toFixed(0)})`, color: 'text-gray-400' };
      }
      case 'CCI': {
        const cciData = calculateCCI(candles, indicators.cci.period);
        const lastCCI = cciData[cciData.length - 1]?.value;
        if (!lastCCI) return { text: '', color: '' };
        if (lastCCI >= 100) return { text: `Overbought (${lastCCI.toFixed(0)})`, color: 'text-red-400' };
        if (lastCCI <= -100) return { text: `Oversold (${lastCCI.toFixed(0)})`, color: 'text-green-400' };
        return { text: `Neutral (${lastCCI.toFixed(0)})`, color: 'text-gray-400' };
      }
      default:
        return { text: '', color: '' };
    }
  }, [candles, indicators.rsi.period, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal, indicators.adx.period, indicators.stochRSI.period, indicators.mfi.period, indicators.williamsR.period, indicators.cci.period, calculateRSI, calculateMACD, calculateOBV, calculateADX, calculateStochasticRSI, calculateMFI, calculateWilliamsR, calculateCCI]);

  // Get per-oscillator divergence
  const getOscillatorDivergence = useCallback((indicator: string): { strength: number; type: 'bullish' | 'bearish' | 'none' } => {
    if (candles.length < 50) return { strength: 0, type: 'none' };
    
    const priceData = candles.map(c => c.close);
    let divergence = 0;
    
    switch (indicator) {
      case 'RSI': {
        const rsiData = calculateRSI(candles, indicators.rsi.period);
        const rsiValues = rsiData.map(d => d.value);
        if (rsiValues.length > 0) divergence = detectDivergence(priceData.slice(-rsiValues.length), rsiValues);
        break;
      }
      case 'MACD': {
        const { hist } = calculateMACD(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal);
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
        const stochData = calculateStochasticRSI(candles, indicators.stochRSI.period);
        const kValues = stochData.map(d => d.k);
        if (kValues.length > 0) divergence = detectDivergence(priceData.slice(-kValues.length), kValues);
        break;
      }
      case 'MFI': {
        const mfiData = calculateMFI(candles, indicators.mfi.period);
        const mfiValues = mfiData.map(d => d.value);
        if (mfiValues.length > 0) divergence = detectDivergence(priceData.slice(-mfiValues.length), mfiValues);
        break;
      }
      case 'WilliamsR': {
        const wrData = calculateWilliamsR(candles, indicators.williamsR.period);
        const wrValues = wrData.map(d => d.value);
        if (wrValues.length > 0) divergence = detectDivergence(priceData.slice(-wrValues.length), wrValues);
        break;
      }
      case 'CCI': {
        const cciData = calculateCCI(candles, indicators.cci.period);
        const cciValues = cciData.map(d => d.value);
        if (cciValues.length > 0) divergence = detectDivergence(priceData.slice(-cciValues.length), cciValues);
        break;
      }
      case 'ADX': {
        const adxData = calculateADX(candles, indicators.adx.period);
        const adxValues = adxData.map(d => d.adx);
        if (adxValues.length > 0) divergence = detectDivergence(priceData.slice(-adxValues.length), adxValues);
        break;
      }
    }
    
    const clamped = Math.max(-3, Math.min(3, divergence));
    return { strength: clamped, type: clamped > 0 ? 'bullish' : clamped < 0 ? 'bearish' : 'none' };
  }, [candles, indicators.rsi.period, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal, indicators.stochRSI.period, indicators.mfi.period, indicators.williamsR.period, indicators.cci.period, indicators.adx.period, calculateRSI, calculateMACD, calculateOBV, calculateStochasticRSI, calculateMFI, calculateWilliamsR, calculateCCI, calculateADX, detectDivergence]);

  // Mini divergence meter component for each oscillator

  // Compute active trade FVG times for overlay highlighting
  const activeTradeFVGTimes = useMemo(() => {
    const times = new Set<number>();
    
    // Add FVG times from live trade signals
    tradingState.tradeSignals
      .filter(signal => signal.strategy === 'choch_fvg' && signal.active)
      .forEach(signal => {
        const parts = signal.id.split('_');
        if (parts.length >= 4) {
          const fvgTime = parseInt(parts[3]);
          if (!isNaN(fvgTime)) times.add(fvgTime);
        }
      });
    
    // Add FVG times from backtest trades
    if (tradingState.backtestResults && tradingState.backtestResults.trades.length > 0) {
      tradingState.backtestResults.trades
        .filter(trade => trade.strategy === 'choch_fvg')
        .forEach(trade => {
          const parts = trade.id.split('_');
          if (parts.length >= 4) {
            const fvgTime = parseInt(parts[3]);
            if (!isNaN(fvgTime)) times.add(fvgTime);
          }
        });
    }
    
    return times;
  }, [tradingState.tradeSignals, tradingState.backtestResults]);

  // Compute overlay data for components
  const fvgsData = useMemo(() => calculateFVGs(candles, true), [candles, calculateFVGs]);
  const orderBlocksData = useMemo(() => 
    calculateOrderBlocks(candles, indicators.smc.obSwingLength, indicators.smc.orderBlockLength),
    [candles, indicators.smc.obSwingLength, indicators.smc.orderBlockLength]
  );
  const bosChochData = useMemo(() => 
    calculateBOSandCHoCH(candles, bosSwingLength),
    [candles, bosSwingLength, calculateBOSandCHoCH]
  );
  const supertrendData = useMemo(() => 
    calculateSupertrend(candles, indicators.supertrend.period, indicators.supertrend.multiplier),
    [candles, indicators.supertrend.period, indicators.supertrend.multiplier]
  );
  const vwapData = useMemo(() => calculateVWAPBands(candles), [candles]);
  const sessionVWAPData = useMemo(() => calculateSessionVWAP(candles), [candles]);
  const psarData = useMemo(() => calculateParabolicSAR(candles), [candles]);
  const bbData = useMemo(() => {
    const result = calculateBollingerBands(candles, indicators.bb.period, indicators.bb.stdDev);
    // Convert BollingerBandsResult to BandValue[]
    return result.upper.map((_, i) => ({
      time: result.upper[i].time,
      upper: result.upper[i].value,
      middle: result.middle[i].value,
      lower: result.lower[i].value,
    }));
  }, [candles, indicators.bb.period, indicators.bb.stdDev]);

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

        {/* NEW: Search Bar for adding tickers */}
        <div className="flex justify-center mb-6">
          <TickerSearch onAddTicker={handleAddTicker} existingTickers={watchlistTickers} />
        </div>

        {/* NEW: Watchlist Table */}
        <div className="mb-6">
          <TickerTable
            tickers={watchlistTickers}
            onRemoveTicker={handleRemoveTicker}
            onSelectTicker={handleSelectTicker}
            selectedTicker={symbol}
            timeframe={tableTimeframe}
            onTimeframeChange={setTableTimeframe}
          />
        </div>

        {/* Chart Control Bar */}
        <ChartControlBar
          symbol={symbol}
          interval={interval}
          period={period}
          onSymbolChange={setSymbol}
          onIntervalChange={setTimeframeInterval}
          onPeriodChange={setPeriod}
          onRefresh={() => fetchInitialData()}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          autoScroll={autoScroll}
          onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
        />
        
        {/* Additional Action Buttons */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 md:gap-4">
            <Button
              onClick={() => modals.openModal('settings-dialog')}
              className="bg-slate-700 hover:bg-slate-600 text-white px-3 md:px-4"
              data-testid="button-open-settings"
              title="Settings (Ctrl+,)"
            >
              <Settings className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Settings</span>
            </Button>
            <Button
              onClick={() => modals.openModal('alert-settings')}
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

        {/* Chart Control Bar */}
        <ChartControlBar
          symbol={symbol}
          interval={interval}
          period={period}
          onSymbolChange={setSymbol}
          onIntervalChange={setTimeframeInterval}
          onPeriodChange={setPeriod}
          onRefresh={fetchInitialData}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        />

        {/* Main Chart */}
<Card 
  className={`bg-slate-800 border-slate-700 transition-all duration-300 ${
    isFullscreen 
      ? 'fixed inset-0 z-50 rounded-none border-0' 
      : ''
  }`}
  tabIndex={isFullscreen ? 0 : -1}
>
  <CardContent className={`p-4 bg-slate-800 ${isFullscreen ? 'h-full' : ''}`}>
    {loading ? (
      <div className={`${isFullscreen ? 'h-full' : 'h-[600px]'} flex items-center justify-center bg-slate-800`}>
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    ) : (
      <div className={`relative ${isFullscreen ? 'h-full' : ''}`}>
        {/* Chart container with layered overlay structure */} 
 <div 
  className={`relative w-full bg-[#0f172a] overflow-hidden ${
    isFullscreen 
      ? 'h-screen' 
      : 'h-[600px] group'
  }`}
  style={{ 
    minHeight: isFullscreen ? '100vh' : '600px', 
    background: '#0f172a' 
  }}
>
  {/* Chart canvas rendered by ChartContainer component */}
  <ChartContainer
    ref={chartContainerRef}
    data={candles}
    height={isFullscreen ? window.innerHeight : 600}
    isFullscreen={isFullscreen}
    loading={loading}
    interval={interval}
    onVisibleRangeChange={handleVisibleRangeChange}
    onCrosshairMove={handleCrosshairMove}
    onChartReady={handleChartReady}
    futureWhitespace={futureWhitespaceConfig}
  />
          
          {/* Clickable overlay - positioned ABOVE the canvas */}
          {!isFullscreen && (
            <div
              onClick={() => {
                setIsFullscreen(true);
                setTimeout(() => {
                  if (chartRef.current && chartContainerRef.current) {
                    chartRef.current.applyOptions({
                      width: chartContainerRef.current.clientWidth,
                      height: chartContainerRef.current.clientHeight
                    });
                  }
                }, 100);
              }}
              className="absolute inset-0 z-10 cursor-pointer hover:ring-2 hover:ring-cyan-500/50 transition-all"
              title="Click to expand fullscreen"
            />
          )}
          
          {/* Hover hint overlay - shows expand message on hover */}
          {!isFullscreen && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/95 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              <div className="text-center space-y-2">
                <svg className="h-8 w-8 mx-auto text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <p className="text-sm text-cyan-400 font-medium">Click to expand fullscreen</p>
              </div>
            </div>
          )}
        </div>

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
                
                {/* Drawing Tools Overlay - Only show in fullscreen */}
                {isFullscreen && (
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
                      onClick={() => modals.toggleModal('drawing-settings')}
                      className={`p-2 rounded-lg transition-all ${modals.isOpen('drawing-settings') ? 'bg-blue-500 text-white' : 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'}`}
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
                        modals.closeModal('drawing-settings');
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
                     {/* Oscillator Panel Toggle */}
<button
  onClick={() => {
    console.log('Oscillator button clicked, current state:', showOscillatorPanel);
    setShowOscillatorPanel(!showOscillatorPanel);
  }}
  className={`p-2 rounded-lg transition-all ${
    showOscillatorPanel 
      ? 'bg-purple-500 text-white' 
      : 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
  }`}
  title="Oscillator Panel"
  data-testid="btn-oscillator-panel"
>
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
  </svg>
</button>

                </div>
              )}

                {/* Fullscreen Header Bar - Ticker and Timeframe */}
              {isFullscreen && (
                <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
                  {/* Ticker Dropdown */}
                  <select
                    value={symbol}
                    onChange={(e) => {
                      const newSymbol = e.target.value;
                      if (newSymbol && newSymbol !== symbol) {
                        window.location.href = `/chart/${newSymbol}`;
                      }
                    }}
                    className="px-3 py-2 bg-slate-800/90 text-white rounded-lg border border-slate-600 hover:bg-slate-700 transition-all text-sm font-medium"
                  >
                    {watchlistTickers.map(ticker => (
                      <option key={ticker} value={ticker}>
                        {ticker.replace('USDT', '/USDT')}
                      </option>
                    ))}
                  </select>
                  
                  {/* Timeframe Dropdown */}
                  <select
                    value={interval}
                    onChange={(e) => setInterval(e.target.value)}
                    className="px-3 py-2 bg-slate-800/90 text-white rounded-lg border border-slate-600 hover:bg-slate-700 transition-all text-sm font-medium"
                  >
                    <option value="1m">1m</option>
                    <option value="3m">3m</option>
                    <option value="5m">5m</option>
                    <option value="15m">15m</option>
                    <option value="30m">30m</option>
                    <option value="1h">1h</option>
                    <option value="2h">2h</option>
                    <option value="4h">4h</option>
                    <option value="6h">6h</option>
                    <option value="8h">8h</option>
                    <option value="12h">12h</option>
                    <option value="1d">1D</option>
                    <option value="3d">3D</option>
                    <option value="1w">1W</option>
                    <option value="1M">1M</option>
                  </select>
                </div>
              )}
                
                {/* Tool Picker Popup */}
                {isFullscreen && showToolPicker && (
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
                
                {/* Drawing Settings Panel (if any comes next) */}
                {modals.isOpen('drawing-settings') && selectedDrawingId && (
                <DrawingSettingsPanel
                  drawing={drawings.find(d => d.id === selectedDrawingId) || null}
                  onUpdate={(updates) => {
                    const selectedDrawing = drawings.find(d => d.id === selectedDrawingId);
                    if (!selectedDrawing) return;
                    
                    const mergedStyle = { ...selectedDrawing.style, ...updates };
                    // Update local state
                    setDrawings(prev => prev.map(d =>
                      d.id === selectedDrawingId
                      ? { ...d, style: mergedStyle }
                      : d
                    ));
                    // Update primitive for immediate visual feedback
                    const primitive = drawingPrimitivesRef.current.get(selectedDrawingId);
                    if (primitive && typeof primitive.updateStyle === 'function') {
                      primitive.updateStyle(mergedStyle);
                    }

                    // Save to database
                    updateDrawingMutation.mutate({ id: selectedDrawingId, style: mergedStyle });
                  }}
                  onClose={() => {
                    modals.closeModal('drawing-settings');
                    setSelectedDrawingId(null);
                  }}
               />
            )}
                                   
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
              <div ref={chartControlsRef}>
                <SettingsPanel
                  isPaidTier={isPaidTier}
                  indicators={indicators}
                  handleSMCToolToggle={handleSMCToolToggle}
                  handleTrendToolToggle={handleTrendToolToggle}
                  handleOscillatorToggle={handleOscillatorToggle}
                  cvdSpikeEnabled={cvdSpikeEnabled}
                  setCvdSpikeEnabled={setCvdSpikeEnabled}
                  cvdSpikeLevel1Input={cvdSpikeLevel1Input}
                  setCvdSpikeLevel1Input={setCvdSpikeLevel1Input}
                  cvdSpikeLevel1={cvdSpikeLevel1}
                  setCvdSpikeLevel1={setCvdSpikeLevel1}
                  cvdSpikeLevel2Input={cvdSpikeLevel2Input}
                  setCvdSpikeLevel2Input={setCvdSpikeLevel2Input}
                  cvdSpikeLevel2={cvdSpikeLevel2}
                  setCvdSpikeLevel2={setCvdSpikeLevel2}
                  cvdSpikeLevel3Input={cvdSpikeLevel3Input}
                  setCvdSpikeLevel3Input={setCvdSpikeLevel3Input}
                  cvdSpikeLevel3={cvdSpikeLevel3}
                  setCvdSpikeLevel3={setCvdSpikeLevel3}
                  fvgVolumeThreshold={fvgVolumeThreshold}
                  setFvgVolumeThreshold={setFvgVolumeThreshold}
                  chartBosSwingLengthInput={chartBosSwingLengthInput}
                  setChartBosSwingLengthInput={setChartBosSwingLengthInput}
                  chartBosSwingLength={chartBosSwingLength}
                  setChartBosSwingLength={setChartBosSwingLength}
                  chartChochSwingLengthInput={chartChochSwingLengthInput}
                  setChartChochSwingLengthInput={setChartChochSwingLengthInput}
                  chartChochSwingLength={chartChochSwingLength}
                  setChartChochSwingLength={setChartChochSwingLength}
                  stratLiquidityGrab={stratLiquidityGrab}
                  setStratLiquidityGrab={setStratLiquidityGrab}
                  chartLiquiditySweepSwingLengthInput={chartLiquiditySweepSwingLengthInput}
                  setChartLiquiditySweepSwingLengthInput={setChartLiquiditySweepSwingLengthInput}
                  chartLiquiditySweepSwingLength={chartLiquiditySweepSwingLength}
                  setChartLiquiditySweepSwingLength={setChartLiquiditySweepSwingLength}
                  setLocation={setLocation}
                  interval={interval}
                  saveToTimeframe={saveToTimeframe}
                  makeTimeframeDefault={makeTimeframeDefault}
                  loading={loading}
                  chartControlsTab={chartControlsTab || 'smc'}
                  setChartControlsTab={(tab: string) => setChartControlsTab(tab as 'smc' | 'trend' | 'vwap' | 'oscillators')}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Strategy Generator Panel */}
        <StrategyGeneratorPanel
          onGenerateStrategy={handleGenerateStrategy}
          candles={candles}
          indicators={indicators}
        />

        {/* Backtest Results Panel */}
        <BacktestResultsPanel
          results={tradingState.backtestResults}
          isRunning={tradingState.backtesting}
          onRun={handleRunBacktest}
          onClear={() => tradingState.clearBacktest()}
        />

{/* Oscillator Charts - Conditionally rendered based on mode */}
{!isFullscreen && (indicators.rsi.show || indicators.stochRSI.show || indicators.macd.show || indicators.obv.show || indicators.williamsR.show || indicators.mfi.show || indicators.cci.show || indicators.adx.show) && (
  <OscillatorContainer
    indicators={indicators}
    candles={candles}
    onOscillatorChartCreated={handleOscillatorChartCreated}
    getMainChartVisibleRange={getMainChartVisibleRange}
    isPaidTier={isPaidTier}
    getIndicatorReport={getIndicatorReport}
    getOscillatorDivergence={getOscillatorDivergence}
  />
)}
                {/* Fullscreen Oscillator Panel Component */}
      <FullscreenOscillatorPanel
        isVisible={isFullscreen && showOscillatorPanel}
        onClose={() => setShowOscillatorPanel(false)}
        candles={candles}
        mainChartRef={chartRef}
        rsiPeriod={indicators.rsi.period}
        macdFast={indicators.macd.fast}
        macdSlow={indicators.macd.slow}
        macdSignal={indicators.macd.signal}
        stochRSIPeriod={indicators.stochRSI.period}
        cciPeriod={indicators.cci.period}
        williamsRPeriod={indicators.williamsR.period}
        calculateRSI={calculateRSI}
        calculateMACD={calculateMACD}
        calculateStochRSI={calculateStochRSI}
        calculateCCI={calculateCCI}
        calculateWilliamsR={calculateWilliamsR}
      />

        {/* 2x2 Grid on Desktop: Grok Summary, Alerts, Footprint, Indicators */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Market Summary */}
        <MarketSummaryCard
          tier={tier as 'free' | 'intermediate' | 'professional'}
          grokLogo={grokLogo}
          minimized={marketSummaryMinimized}
          onToggleMinimize={() => setMarketSummaryMinimized(!marketSummaryMinimized)}
          analysis={aiAnalysis}
          loading={aiAnalysisLoading}
          timestamp={aiAnalysisTimestamp}
          candlesLength={candles.length}
          onRefresh={() => fetchAIAnalysis(true)}
          onUpgrade={() => window.location.href = '/cryptosubscribe'}
        />

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
                <CVDTable
                  data={deltaHistory}
                  useMultiExchange={useMultiExchange}
                  cvdSpikeLevel1={cvdSpikeLevel1}
                  cvdSpikeLevel2={cvdSpikeLevel2}
                  cvdSpikeLevel3={cvdSpikeLevel3}
                  tableLimit={getTableRowLimit(interval)}
                />
              </CardContent>
              )}
        </Card>

        {/* Market Alerts */}
        {tier !== 'free' && (
          <MarketAlertsPanel
            alerts={marketAlerts}
            filterMode={alertFilterMode}
            onFilterModeChange={setAlertFilterMode}
            onSettingsClick={() => modals.openModal('alert-settings')}
            activeIndicators={activeIndicators}
            alertTypeToIndicator={alertTypeToIndicator}
          />
        )}

        </div>
        {/* End of 2x2 Grid */}

        {/* Strategy & Backtest Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <StrategyGeneratorPanel
            onGenerateStrategy={handleGenerateStrategy}
            candles={candles}
            indicators={indicators}
          />
          
          <BacktestResultsPanel
            results={tradingState.backtestResults}
            isRunning={tradingState.backtesting}
            onRun={runBacktest}
            onClear={() => tradingState.setBacktestResults(null)}
          />
        </div>

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
          open={modals.isOpen('alert-settings')}
          onOpenChange={(open) => open ? modals.openModal('alert-settings') : modals.closeModal('alert-settings')}
        />

        {/* Settings Dialog - Simplified for Phase 4G-7 */}
        <SettingsDialog
          isOpen={modals.isOpen('settings-dialog')}
          onClose={() => modals.closeModal('settings-dialog')}
          indicators={{
            rsi: { show: indicators.rsi.show, period: indicators.rsi.period },
            macd: { show: indicators.macd.show, fast: indicators.macd.fast, slow: indicators.macd.slow, signal: indicators.macd.signal },
            stochastic: { show: indicators.stochRSI.show, period: indicators.stochRSI.period },
            obv: { show: indicators.obv.show },
            mfi: { show: indicators.mfi.show, period: indicators.mfi.period },
            williamsR: { show: indicators.williamsR.show },
            cci: { show: indicators.cci.show },
            adx: { show: indicators.adx.show },
            bollingerBands: { show: indicators.bb.show, period: indicators.bb.period },
            atr: { show: false, period: 14 },
            fvg: { show: indicators.showFVG, showHighValueOnly: indicators.showHighValueOnly },
            bos: { show: indicators.showBOS },
            choch: { show: indicators.showCHoCH },
            orderBlocks: { show: indicators.showOrderBlocks },
            ema: { show: indicators.ema.show, fastPeriod: indicators.ema.fastPeriod, slowPeriod: indicators.ema.slowPeriod },
            sma: { show: indicators.sma.show, period: indicators.sma.fastPeriod },
          }}
          onUpdateIndicator={(indicator, updates) => {
            // Simplified handler - logs for now, full implementation would map to setters
            console.log('Update indicator:', indicator, updates);
          }}
          chartTheme="dark"
          apiKeys={apiKeys}
          onUpdateApiKey={(provider, key) => {
            setApiKeys(prev => ({ ...prev, [provider]: key }));
            localStorage.setItem(`${provider}_api_key`, key);
          }}
        />

        {/* Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={modalManager.isModalOpen('delete-drawing')}
          onClose={modalManager.closeModal}
          onConfirm={() => {
            const drawingId = modalManager.modalData?.id;
            if (drawingId) {
              setDrawings(prev => prev.filter(d => d.id !== drawingId));
              setSelectedDrawingId(null);
              toast({
                title: 'Drawing deleted',
                description: 'The drawing has been removed from the chart.'
              });
            }
            modalManager.closeModal();
          }}
          title="Delete Drawing"
          description="Are you sure you want to delete this drawing? This action cannot be undone."
          variant="destructive"
        />

      </div>
      
      {/* Chart Overlay Components - Render indicators and overlays */}
      <MovingAverages
        chart={chartRef.current}
        maConfigs={indicators.ema.configs}
        show={indicators.ema.show}
        candles={candles}
        calculateEMA={calculateEMA}
        emaHTFDataCache={emaHTFDataCache}
        symbol={symbol}
        interval={interval}
      />
      
      <FVGOverlay
        chart={chartRef.current}
        fvgs={fvgsData}
        show={indicators.smc.showFVG}
        candles={candles}
        activeTradeFVGTimes={activeTradeFVGTimes}
        isActiveFVG={isActiveFVG}
        getFVGFillTime={getFVGFillTime}
        showHighValueOnly={indicators.smc.showHighValueOnly}
      />
      
      <OrderBlockOverlay
        chart={chartRef.current}
        orderBlocks={orderBlocksData}
        show={indicators.smc.showOrderBlocks}
        candles={candles}
      />
      
      <BOSCHoCHMarkers
        chart={chartRef.current}
        bosEvents={bosChochData.bos}
        chochEvents={bosChochData.choch}
        showBOS={indicators.smc.showBOS}
        showCHoCH={indicators.smc.showCHoCH}
        candles={candles}
      />
      
      <SupertrendOverlay
        chart={chartRef.current}
        supertrendData={supertrendData}
        show={indicators.supertrend.show}
      />
      
      <VWAPOverlay
        chart={chartRef.current}
        vwapData={vwapData}
        show={indicators.vwapTools.showBands}
      />
      
      <SessionVWAPOverlay
        chart={chartRef.current}
        asiaVWAP={sessionVWAPData.asia}
        londonVWAP={sessionVWAPData.london}
        nyVWAP={sessionVWAPData.ny}
        show={indicators.vwapTools.showSession}
      />
      
      <ParabolicSAROverlay
        chart={chartRef.current}
        psarData={psarData}
        show={indicators.parabolicSAR.show}
      />
      
      <BollingerBandsOverlay
        chart={chartRef.current}
        bbData={bbData}
        show={indicators.bb.show}
      />
      
      {/* Bottom Navigation */}
      <CryptoNavigation />
      
      {/* Spacer for fixed navigation */}
      <div className="h-20"></div>
    </div>
    </>
  );
}

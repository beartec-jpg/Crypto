import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { createChart, ColorType, CrosshairMode, IChartApi, CandlestickSeries, LineSeries, HistogramSeries, ISeriesApi } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Activity, DollarSign, Loader2, Bell, ChevronDown, ChevronUp, Zap, Save, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useLocation } from 'wouter';
import bearTecLogo from '@assets/1_20251120_023939_0000_1763606422703.png';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import grokLogo from '@assets/Grok_Full_Logomark_Light_1763287603908.png';
import aiAnalysisLogo from '@assets/20251119_202707_0000_1763584050669.png';
import bearVideo from '@assets/grok_video_2025-11-20-03-05-08_1763607929480.mp4';
import transitionVideo from '@assets/grok_video_2025-11-20-06-10-37_1763619824022.mp4';
import bullVideo from '@assets/grok_video_2025-11-20-06-16-11_1763619952816.mp4';
import aiButtonVideo from '@assets/grok_video_2025-11-20-02-22-16_1763605488674.mp4';
import { AlertSettingsDialog } from '@/components/AlertSettingsDialog';
import { CryptoNavigation } from '@/components/CryptoNavigation';
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

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
type TPType = 'structure' | 'trailing' | 'atr' | 'fixed_rr' | 'vwap' | 'ema';
type SLType = 'structure' | 'fixed' | 'atr';

interface TradeSignal {
  id: string;
  time: number;
  type: 'LONG' | 'SHORT';
  strategy: 'liquidity_grab' | 'choch_fvg' | 'vwap_rejection' | 'structure_break' | 'rs_flip' | 'bos_trend';
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
  outcome: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'Breakeven' | 'EMA Exit';
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

export default function CryptoIndicators() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fetchGenerationRef = useRef(0); // Track latest fetch to prevent stale updates
  const abortControllerRef = useRef<AbortController | null>(null); // Cancel pending requests
  const { toast } = useToast();

  const { isAuthenticated, isLoading: authLoading } = useCryptoAuth();
  const [, setLocation] = useLocation();

  const { data: subscription } = useQuery<{tier: string, aiCreditsRemaining?: number}>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isAuthenticated && !authLoading
  });
  const tier = subscription?.tier || 'free';

  const [symbol, setSymbol] = useState('XRPUSDT');
  const [interval, setTimeframeInterval] = useState('15m');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [alertSettingsOpen, setAlertSettingsOpen] = useState(false);
  
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
  
  // Chart controls tab state - null means no tab selected (collapsed)
  const [chartControlsTab, setChartControlsTab] = useState<'smc' | 'trend' | 'vwap' | 'oscillators' | null>('smc');
  const chartControlsRef = useRef<HTMLDivElement>(null);

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
  
  // EMA settings
  const [showEMA, setShowEMA] = useState(false);
  const [emaFastPeriod, setEmaFastPeriod] = useState(10);
  const [emaSlowPeriod, setEmaSlowPeriod] = useState(40);
  const [emaFastInput, setEmaFastInput] = useState('10');
  const [emaSlowInput, setEmaSlowInput] = useState('40');
  
  // Oscillator indicators
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const obvRef = useRef<HTMLDivElement>(null);
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
  
  // Bollinger Bands settings
  const bbRef = useRef<HTMLDivElement>(null);
  const [showBB, setShowBB] = useState(false);
  const [bbPeriod, setBbPeriod] = useState(20);
  const [bbPeriodInput, setBbPeriodInput] = useState('20');
  const [bbStdDev, setBbStdDev] = useState(2);
  const [bbStdDevInput, setBbStdDevInput] = useState('2');
  
  // ========== NEW INDICATORS ==========
  // Series refs for chart rendering
  const supertrendSeriesRef = useRef<LineSeries | null>(null);
  const vwapBandsUpperRef = useRef<LineSeries | null>(null);
  const vwapBandsLowerRef = useRef<LineSeries | null>(null);
  const sessionVWAPAsiaRef = useRef<LineSeries | null>(null);
  const sessionVWAPLondonRef = useRef<LineSeries | null>(null);
  const sessionVWAPNYRef = useRef<LineSeries | null>(null);
  
  // Batch 2 SMC indicator refs
  const orderBlocksRefs = useRef<Array<{ upper: LineSeries; lower: LineSeries; fill: HistogramSeries }>>([]);
  const premiumDiscountRefs = useRef<{ equilibrium: LineSeries | null; premium: LineSeries | null; discount: LineSeries | null }>({ equilibrium: null, premium: null, discount: null });
  
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
  
  // Trend Tools
  const [showSMA, setShowSMA] = useState(false);
  const [smaFastPeriod, setSmaFastPeriod] = useState(20);
  const [smaFastInput, setSmaFastInput] = useState('20');
  const [smaSlowPeriod, setSmaSlowPeriod] = useState(50);
  const [smaSlowInput, setSmaSlowInput] = useState('50');
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
  const [deltaHistory, setDeltaHistory] = useState<Array<{ time: string; delta: number; cumDelta: number; isBull: boolean; volume: number; exchanges?: number; confidence?: number; divergence?: boolean }>>([]);
  const [cvdSpikeEnabled, setCvdSpikeEnabled] = useState(true);
  const [cvdBullishThreshold, setCvdBullishThreshold] = useState(200); // % of average bullish delta
  const [cvdBullishThresholdInput, setCvdBullishThresholdInput] = useState('200');
  const [cvdBearishThreshold, setCvdBearishThreshold] = useState(200); // % of average bearish delta
  const [cvdBearishThresholdInput, setCvdBearishThresholdInput] = useState('200');

  // AI Market Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiAnalysisTimestamp, setAiAnalysisTimestamp] = useState<number | null>(null);
  const [aiAnalysisCost, setAiAnalysisCost] = useState<number>(0);
  const [aiAnalysisExpanded, setAiAnalysisExpanded] = useState(false);
  const [lastAnalysisCheck, setLastAnalysisCheck] = useState<number>(0);
  const [footprintData, setFootprintData] = useState<FootprintData[]>([]);
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
        // Play transition in reverse
        transition.playbackRate = -1;
        transition.currentTime = transition.duration;
        transition.play().catch(err => console.log('Transition video play failed:', err));
      } else {
        // Play transition forward
        transition.playbackRate = 1;
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
    sl: { type: 'fixed_distance', distancePercent: 2.0 }
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

  // EMA series refs
  const emaSeriesRefs = useRef<{
    fast?: ISeriesApi<'Line'>;
    slow?: ISeriesApi<'Line'>;
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
    
    // Skip if we've checked in the last 60 minutes (unless forced)
    const now = Date.now();
    if (!force && lastAnalysisCheck && (now - lastAnalysisCheck) < 60 * 60 * 1000) {
      return;
    }
    
    setAiAnalysisLoading(true);
    setLastAnalysisCheck(now);
    
    try {
      // For AI analysis, we'll just send basic candle data and let the backend handle structure detection
      // This avoids circular dependency issues with calculateBOSandCHoCH
      const response = await fetch('/api/crypto/market-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candles: candles.slice(-200), // Send last 200 candles
          symbol: symbol.replace('USDT', '/USD'),
          timeframe: interval
        })
      });
      
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
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
  }, [candles, symbol, interval, aiAnalysisLoading, lastAnalysisCheck]);

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
            return {
              time: new Date(row.time * 1000).toLocaleTimeString(),
              delta: row.delta,
              cumDelta: runningCVD,
              isBull: row.delta >= 0,
              volume: row.volume,
              exchanges: row.exchanges,
              confidence: row.confidence,
              divergence: false // Will be set from divergences array if needed
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

  // Auto-refresh multi-exchange data every 5 seconds
  useEffect(() => {
    if (!useMultiExchange || candles.length === 0) return;

    console.log('🔄 Auto-refresh started for multi-exchange data (every 5s)');
    
    const refreshInterval = setInterval(() => {
      console.log('⏰ Auto-refresh tick - fetching multi-exchange data...');
      fetchMultiExchangeData();
    }, 5000);

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
    
    // SMART APPROACH: Try multiple starting pivots near extremity, pick cleanest line
    const findTrendlineFromExtremity = (pivots: typeof swings, type: 'resistance' | 'support'): Trendline | null => {
      if (pivots.length < 2) return null;
      
      // Find absolute extremity
      const absoluteExtremity = type === 'resistance' 
        ? pivots.reduce((max, p) => p.value > max.value ? p : max)
        : pivots.reduce((min, p) => p.value < min.value ? p : min);
      
      // Find top candidate starting pivots near the extremity (within 3% price range)
      const candidateStarters = type === 'resistance'
        ? pivots
            .filter(p => p.value >= absoluteExtremity.value * 0.97) // Top 3% for resistance
            .sort((a, b) => b.value - a.value) // Highest first
            .slice(0, 5) // Top 5 candidates
        : pivots
            .filter(p => p.value <= absoluteExtremity.value * 1.03) // Bottom 3% for support
            .sort((a, b) => a.value - b.value) // Lowest first
            .slice(0, 5); // Top 5 candidates
      
      // Try building lines from each candidate starter
      const allCandidateLines: Array<Trendline & { violationRate: number }> = [];
      
      for (const starter of candidateStarters) {
        // Find pivots after this starter
        const pivotsAfterStarter = pivots.filter(p => p.index > starter.index);
        if (pivotsAfterStarter.length === 0) continue;
        
        // Try connecting to each subsequent pivot
        for (const secondPoint of pivotsAfterStarter) {
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
      
      // Pick the BEST line: lowest violation rate, then most touches, then most recent
      return allCandidateLines.reduce((best, current) => {
        // Strongly prefer cleaner lines (lower violation rate)
        if (current.violationRate < best.violationRate - 0.03) return current;
        if (best.violationRate < current.violationRate - 0.03) return best;
        
        // If similar cleanliness, prefer more touches
        if (current.strength > best.strength + 1) return current;
        if (best.strength > current.strength + 1) return best;
        
        // If similar strength, prefer more recent last pivot
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
                  isLiquidityGrab: false
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
                  isLiquidityGrab: false
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
                  isLiquidityGrab: false
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
                  isLiquidityGrab: false
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
      const emaValues = calculateEMA(data, emaSinglePeriod);
      if (emaValues.length < 3) return null;
      emaLevel = emaValues[emaValues.length - 1];
    } else {
      const fastEMAValues = calculateEMA(data, emaFastPeriod);
      const slowEMAValues = calculateEMA(data, emaSlowPeriod);
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
        const swingLevels = signal === 'LONG' ? recentSwings.filter(s => s.type === 'low').map(s => s.price) : recentSwings.filter(s => s.type === 'high').map(s => s.price);
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
    
    // Add CVD/Delta Spike alerts
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
        
        // Bullish spike detection (positive delta exceeds threshold % of average)
        if (bar.delta > 0 && avgBullishDelta > 0) {
          const percentageOfAvg = (bar.delta / avgBullishDelta) * 100;
          if (percentageOfAvg >= cvdBullishThreshold) {
            newAlerts.push({
              id: `alert_${candle.time}_CVD_SPIKE_BULL`,
              time: candle.time,
              type: 'CVD Spike',
              direction: 'bullish',
              price: candle.close,
              description: `Bullish delta spike: ${bar.delta.toFixed(0)} (${percentageOfAvg.toFixed(0)}% of avg)`,
            });
          }
        }
        
        // Bearish spike detection (negative delta exceeds threshold % of average)
        if (bar.delta < 0 && avgBearishDelta > 0) {
          const percentageOfAvg = (Math.abs(bar.delta) / avgBearishDelta) * 100;
          if (percentageOfAvg >= cvdBearishThreshold) {
            newAlerts.push({
              id: `alert_${candle.time}_CVD_SPIKE_BEAR`,
              time: candle.time,
              type: 'CVD Spike',
              direction: 'bearish',
              price: candle.close,
              description: `Bearish delta spike: ${bar.delta.toFixed(0)} (${percentageOfAvg.toFixed(0)}% of avg)`,
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
    setLiqGrabDirectionFilter(result.allowedDirections);
    
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

  // Save indicator defaults to localStorage
  const saveIndicatorDefaults = useCallback(() => {
    const indicatorDefaults = {
      showEMA,
      emaFastPeriod,
      emaSlowPeriod,
      showRSI,
      rsiPeriod,
      showMACD,
      macdFast,
      macdSlow,
      macdSignal,
      showOBV,
      showMFI,
      mfiPeriod,
      showBB,
      bbPeriod,
      bbStdDev,
      showVWAPDaily,
      showVWAPWeekly,
      showVWAPMonthly,
      showVWAPRolling,
      vwapRollingPeriod,
      alertFilterMode
    };
    
    localStorage.setItem('indicatorDefaults', JSON.stringify(indicatorDefaults));
    
    toast({
      title: "💾 Indicator Defaults Saved",
      description: "Current indicator settings saved successfully",
      duration: 3000,
    });
    
    console.log('💾 Saved indicator defaults:', indicatorDefaults);
  }, [showEMA, emaFastPeriod, emaSlowPeriod, showRSI, rsiPeriod, showMACD, macdFast, macdSlow, macdSignal, showOBV, showMFI, mfiPeriod, showBB, bbPeriod, bbStdDev, showVWAPDaily, showVWAPWeekly, showVWAPMonthly, showVWAPRolling, vwapRollingPeriod, alertFilterMode, toast]);

  // Load indicator defaults from localStorage
  const loadIndicatorDefaults = useCallback(() => {
    try {
      const saved = localStorage.getItem('indicatorDefaults');
      if (saved) {
        const defaults = JSON.parse(saved);
        
        if (defaults.showEMA !== undefined) setShowEMA(defaults.showEMA);
        if (defaults.emaFastPeriod !== undefined) {
          setEmaFastPeriod(defaults.emaFastPeriod);
          setEmaFastInput(defaults.emaFastPeriod.toString());
        }
        if (defaults.emaSlowPeriod !== undefined) {
          setEmaSlowPeriod(defaults.emaSlowPeriod);
          setEmaSlowInput(defaults.emaSlowPeriod.toString());
        }
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
        if (defaults.showBB !== undefined) setShowBB(defaults.showBB);
        if (defaults.bbPeriod !== undefined) {
          setBbPeriod(defaults.bbPeriod);
          setBbPeriodInput(defaults.bbPeriod.toString());
        }
        if (defaults.bbStdDev !== undefined) {
          setBbStdDev(defaults.bbStdDev);
          setBbStdDevInput(defaults.bbStdDev.toString());
        }
        if (defaults.showVWAPDaily !== undefined) setShowVWAPDaily(defaults.showVWAPDaily);
        if (defaults.showVWAPWeekly !== undefined) setShowVWAPWeekly(defaults.showVWAPWeekly);
        if (defaults.showVWAPMonthly !== undefined) setShowVWAPMonthly(defaults.showVWAPMonthly);
        if (defaults.showVWAPRolling !== undefined) setShowVWAPRolling(defaults.showVWAPRolling);
        if (defaults.vwapRollingPeriod !== undefined) {
          setVwapRollingPeriod(defaults.vwapRollingPeriod);
          setVwapRollingPeriodInput(defaults.vwapRollingPeriod.toString());
        }
        if (defaults.alertFilterMode !== undefined) setAlertFilterMode(defaults.alertFilterMode);
        
        toast({
          title: "📂 Indicator Defaults Loaded",
          description: "Previous indicator settings restored",
          duration: 3000,
        });
        
        console.log('📂 Loaded indicator defaults from localStorage');
        return true;
      }
    } catch (error) {
      console.error('Failed to load indicator defaults:', error);
    }
    return false;
  }, [toast]);

  // Load indicator defaults on mount
  useEffect(() => {
    loadIndicatorDefaults();
  }, [loadIndicatorDefaults]);

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
      });

      candleSeries.setData(candles as any);
      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

      chart.timeScale().fitContent();
      console.log('Chart created successfully!');
      setChartReady(true);
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
        
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
      }
    };
  }, [candles.length, loading, symbol, interval]);

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
    manageVWAP('rolling', showVWAPRolling, calculateRollingVWAP(candles, vwapRollingPeriod), '#ec4899', `rVWAP(${vwapRollingPeriod})`);
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

  // Update EMAs on chart
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;

    const chart = chartRef.current;
    const refs = emaSeriesRefs.current;

    // Helper to manage EMA series
    const manageEMA = (
      key: 'fast' | 'slow',
      show: boolean,
      period: number,
      color: string,
      title: string
    ) => {
      if (show) {
        const closes = candles.map(c => c.close);
        const emaValues = calculateEMA(closes, period);
        const emaData = candles.map((c, i) => ({
          time: c.time as any,
          value: emaValues[i]
        }));

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
          refs[key]!.setData(emaData);
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

    manageEMA('fast', showEMA, emaFastPeriod, '#3b82f6', `EMA ${emaFastPeriod}`);
    manageEMA('slow', showEMA, emaSlowPeriod, '#f59e0b', `EMA ${emaSlowPeriod}`);
  }, [chartReady, candles, showEMA, emaFastPeriod, emaSlowPeriod, calculateEMA]);

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
      lineWidth: number = 2
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
    manageBBLine('upper', showBB, bbData.upper, '#9333ea', 0, 1.5);
    manageBBLine('middle', showBB, bbData.middle, '#9333ea', 2, 1);
    manageBBLine('lower', showBB, bbData.lower, '#9333ea', 0, 1.5);
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
      const orderBlocks = calculateOrderBlocks(candles, 1.5, orderBlockLength);
      const lastTime = candles[candles.length - 1].time;
      
      // Render each order block as a shaded box like FVG
      for (const ob of orderBlocks.slice(-15)) { // Show last 15 blocks
        try {
          const color = ob.type === 'bullish' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
          const borderColor = ob.type === 'bullish' ? '#10b981' : '#ef4444';
          
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
  
  // SMA (Simple Moving Average)
  useEffect(() => {
    if (!chartReady || !chartRef.current || candles.length === 0) return;
    
    const chart = chartRef.current;
    
    if (showSMA) {
      const closes = candles.map(c => c.close);
      
      // Fast SMA
      const fastSMA = calculateSMA(closes, smaFastPeriod);
      if (fastSMA.length > 0 && !smaFastRef.current) {
        try {
          smaFastRef.current = chart.addSeries(LineSeries, {
            color: '#3b82f6',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: `SMA ${smaFastPeriod}`,
          });
          const data = fastSMA.map((value, i) => ({ 
            time: candles[i + smaFastPeriod - 1].time as any, 
            value 
          }));
          smaFastRef.current.setData(data);
        } catch (e) {}
      }
      
      // Slow SMA
      const slowSMA = calculateSMA(closes, smaSlowPeriod);
      if (slowSMA.length > 0 && !smaSlowRef.current) {
        try {
          smaSlowRef.current = chart.addSeries(LineSeries, {
            color: '#f59e0b',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: `SMA ${smaSlowPeriod}`,
          });
          const data = slowSMA.map((value, i) => ({ 
            time: candles[i + smaSlowPeriod - 1].time as any, 
            value 
          }));
          smaSlowRef.current.setData(data);
        } catch (e) {}
      }
    } else {
      // Remove series when disabled
      if (smaFastRef.current) {
        try {
          chart.removeSeries(smaFastRef.current);
        } catch (e) {}
        smaFastRef.current = null;
      }
      if (smaSlowRef.current) {
        try {
          chart.removeSeries(smaSlowRef.current);
        } catch (e) {}
        smaSlowRef.current = null;
      }
    }
  }, [chartReady, candles, showSMA, smaFastPeriod, smaSlowPeriod]);
  
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

          element.style.display = 'block';
          
          // Get label dimensions
          const labelWidth = element.offsetWidth || 50;
          const labelHeight = element.offsetHeight || 20;
          
          // Calculate position with offset
          let leftPos = xCoord + 5;
          let topPos = yCoord - 10;
          
          // Constrain within chart boundaries
          // Right boundary: ensure label doesn't extend beyond chart width
          if (leftPos + labelWidth > chartWidth) {
            leftPos = Math.max(0, chartWidth - labelWidth - 5);
          }
          // Left boundary
          if (leftPos < 0) {
            leftPos = 5;
          }
          // Bottom boundary
          if (topPos + labelHeight > chartHeight) {
            topPos = Math.max(0, chartHeight - labelHeight - 5);
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

    // Subscribe to time range changes (zoom/pan)
    const handleVisibleTimeRangeChange = () => {
      updateLabelPositions();
    };
    
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);

    // Cleanup function
    return () => {
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
    if (!chartReady || !chartRef.current || !backtestResults || backtestResults.trades.length === 0) {
      // Clean up old trade markers
      if (tradeMarkerRefs.current.length > 0) {
        tradeMarkerRefs.current.forEach(series => {
          try {
            if (series && chartRef.current) {
              chartRef.current.removeSeries(series);
            }
          } catch (e) {
            // Already disposed
          }
        });
        tradeMarkerRefs.current = [];
      }
      return;
    }

    const chart = chartRef.current;
    
    // Extra safety check
    try {
      chart.timeScale();
    } catch (e) {
      return;
    }

    // Remove old trade markers
    tradeMarkerRefs.current.forEach(series => {
      try {
        chart.removeSeries(series);
      } catch (e) {
        // Already disposed
      }
    });
    tradeMarkerRefs.current = [];

    // Filter trades for replay mode - only show trades that have opened by current replay time
    const currentReplayTime = isReplayMode && candles.length > 0 ? candles[candles.length - 1].time : Infinity;
    const visibleTrades = backtestResults.trades.filter(trade => 
      !isReplayMode || trade.entryTime <= currentReplayTime
    );

    // Collect all markers for visible trades
    const allMarkers: any[] = [];

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
      if (stopLoss !== undefined && stopLoss !== null && stopLoss !== 'N/A' && typeof stopLoss === 'number') {
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
    
    // Set all markers at once on the candlestick series
    if (candleSeriesRef.current && allMarkers.length > 0) {
      try {
        const series = candleSeriesRef.current as any;
        if (series && typeof series.setMarkers === 'function') {
          series.setMarkers(allMarkers);
        }
      } catch (e) {
        console.error('Failed to set markers on candlestick series:', e);
      }
    }
  }, [chartReady, backtestResults, candles, liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, isReplayMode]);

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

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!symbol || !interval || candles.length === 0) return;

    const ws = new WebSocket('wss://stream.binance.us:9443/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: [
          `${symbol.toLowerCase()}@kline_${interval}`,
          `${symbol.toLowerCase()}@trade`,
        ],
        id: 1,
      }));
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

        setCandles(prev => {
          const newCandles = [...prev];
          if (k.x) { // Candle closed
            if (bar.time > newCandles[newCandles.length - 1].time) {
              newCandles.push(bar);
              // Save delta for this closed candle (use real delta if available)
              setDeltaHistory(prevHist => {
                const delta = realDeltaData.get(bar.time) || currentDelta;
                const newHist = [...prevHist, {
                  time: new Date(bar.time * 1000).toLocaleTimeString(),
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
            // Update last candle
            if (bar.time === newCandles[newCandles.length - 1].time) {
              newCandles[newCandles.length - 1] = bar;
            } else {
              newCandles.push(bar);
            }
          }
          return newCandles;
        });

        if (candleSeriesRef.current) {
          candleSeriesRef.current.update(bar as any);
        }
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
    
    const line = chart.addSeries(LineSeries, { color: '#ffa726', lineWidth: 2 });
    line.setData(calculateRSI(candles, rsiPeriod));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: 70 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: 30 })));
    
    return () => chart.remove();
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
    
    const { macd, signal, hist } = calculateMACD(candles, macdFast, macdSlow, macdSignal);
    chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2 }).setData(macd);
    chart.addSeries(LineSeries, { color: '#ef5350', lineWidth: 2 }).setData(signal);
    chart.addSeries(HistogramSeries, { color: '#26a69a' }).setData(hist);
    
    return () => chart.remove();
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
    
    chart.addSeries(LineSeries, { color: '#9580ff', lineWidth: 2 }).setData(calculateOBV(candles));
    
    return () => chart.remove();
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
    
    const stochData = calculateStochasticRSI(candles, stochRSIPeriod);
    const kLine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, title: '%K' });
    const dLine = chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 2, title: '%D' });
    
    kLine.setData(stochData.map(d => ({ time: d.time, value: d.k })));
    dLine.setData(stochData.map(d => ({ time: d.time, value: d.d })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (80/20 for Stoch RSI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: 80 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: 20 })));
    
    return () => chart.remove();
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
    
    const line = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2 });
    line.setData(calculateWilliamsR(candles, williamsRPeriod));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (-20/-80 for Williams %R)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: -20 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: -80 })));
    
    return () => chart.remove();
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
    
    const line = chart.addSeries(LineSeries, { color: '#00bcd4', lineWidth: 2 });
    line.setData(calculateMFI(candles, mfiPeriod));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (80/20 for MFI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: 80 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: 20 })));
    
    return () => chart.remove();
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
    
    const line = chart.addSeries(LineSeries, { color: '#ec4899', lineWidth: 2 });
    line.setData(calculateCCI(candles, cciPeriod));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (+100/-100 for CCI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: 100 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: -100 })));
    chart.addSeries(LineSeries, { color: '#444', lineStyle: 2, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: 0 })));
    
    return () => chart.remove();
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
    
    const adxData = calculateADX(candles, adxPeriod);
    const adxLine = chart.addSeries(LineSeries, { color: '#22c55e', lineWidth: 2, title: 'ADX' });
    const plusDILine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: '+DI' });
    const minusDILine = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 1, title: '-DI' });
    
    adxLine.setData(adxData.map(d => ({ time: d.time, value: d.adx })));
    plusDILine.setData(adxData.map(d => ({ time: d.time, value: d.plusDI })));
    minusDILine.setData(adxData.map(d => ({ time: d.time, value: d.minusDI })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add strength level line (25 is typically considered strong trend)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time, value: 25 })));
    
    return () => chart.remove();
  }, [showADX, candles, adxPeriod]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/cryptologin');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00c4b4]" />
      </div>
    );
  }

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
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-28 md:w-40 bg-slate-800 border-slate-600">
                <SelectValue className="text-white font-bold" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="XRPUSDT">XRP/USDT</SelectItem>
                <SelectItem value="BTCUSDT">BTC/USDT</SelectItem>
                <SelectItem value="ETHUSDT">ETH/USDT</SelectItem>
                <SelectItem value="ADAUSDT">ADA/USDT</SelectItem>
                <SelectItem value="SOLUSDT">SOL/USDT</SelectItem>
              </SelectContent>
            </Select>
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
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 bg-slate-800">
            {loading ? (
              <div className="h-[600px] flex items-center justify-center bg-slate-800">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <div 
                ref={chartContainerRef} 
                className="w-full h-[600px] relative bg-[#0f172a] overflow-hidden" 
                style={{ minHeight: '600px', background: '#0f172a' }}
              />
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
                      {/* Main toggles */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2">
                          <Switch checked={showFVG} onCheckedChange={setShowFVG} id="show-fvg" data-testid="switch-fvg" />
                          <Label htmlFor="show-fvg" className="text-sm text-white cursor-pointer">FVG</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showBOS} onCheckedChange={setShowBOS} id="show-bos" data-testid="switch-bos" />
                          <Label htmlFor="show-bos" className="text-sm text-white cursor-pointer">BOS</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showCHoCH} onCheckedChange={setShowCHoCH} id="show-choch" data-testid="switch-choch" />
                          <Label htmlFor="show-choch" className="text-sm text-white cursor-pointer">CHoCH</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showSwingPivots} onCheckedChange={setShowSwingPivots} id="show-pivots" data-testid="switch-pivots" />
                          <Label htmlFor="show-pivots" className="text-sm text-white cursor-pointer">Swing Pivots</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={stratLiquidityGrab} onCheckedChange={setStratLiquidityGrab} id="show-liquidity" data-testid="switch-liquidity" />
                          <Label htmlFor="show-liquidity" className="text-sm text-white cursor-pointer">Liquidity Sweeps</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showOrderBlocks} onCheckedChange={setShowOrderBlocks} id="show-order-blocks" data-testid="switch-order-blocks" />
                          <Label htmlFor="show-order-blocks" className="text-sm text-white cursor-pointer">Order Blocks</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showPremiumDiscount} onCheckedChange={setShowPremiumDiscount} id="show-premium-discount" data-testid="switch-premium-discount" />
                          <Label htmlFor="show-premium-discount" className="text-sm text-white cursor-pointer">Premium/Discount</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showChartLabels} onCheckedChange={setShowChartLabels} id="show-labels" data-testid="switch-labels" />
                          <Label htmlFor="show-labels" className="text-sm text-white cursor-pointer">Chart Labels</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={cvdSpikeEnabled} onCheckedChange={setCvdSpikeEnabled} id="cvd-spike" data-testid="switch-cvd-spike" />
                          <Label htmlFor="cvd-spike" className="text-sm text-white cursor-pointer">CVD Spike Alerts</Label>
                        </div>
                      </div>
                      
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
                      
                      {/* CVD Spike Settings */}
                      {cvdSpikeEnabled && (
                        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                          <div className="text-xs font-semibold text-blue-400 mb-2">CVD Spike Alert Settings</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Bullish Threshold %</Label>
                              <input
                                type="number"
                                min="100"
                                max="500"
                                step="50"
                                value={cvdBullishThresholdInput}
                                onChange={(e) => {
                                  setCvdBullishThresholdInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 100) setCvdBullishThreshold(val);
                                }}
                                className="w-20 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Bearish Threshold %</Label>
                              <input
                                type="number"
                                min="100"
                                max="500"
                                step="50"
                                value={cvdBearishThresholdInput}
                                onChange={(e) => {
                                  setCvdBearishThresholdInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 100) setCvdBearishThreshold(val);
                                }}
                                className="w-20 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">Alert when delta exceeds this % of average</p>
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
                      
                      {/* Save Defaults Button */}
                      <div className="pt-2 border-t border-slate-700">
                        <Button
                          onClick={saveIndicatorDefaults}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
                          data-testid="button-save-smc-defaults"
                        >
                          <Save className="w-3 h-3 mr-2" />
                          Save Defaults
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Trend Tools Tab */}
                  {chartControlsTab === 'trend' && (
                    <div className="space-y-3">
                      {/* Main toggles */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2">
                          <Switch checked={showEMA} onCheckedChange={setShowEMA} id="show-ema" data-testid="switch-ema" />
                          <Label htmlFor="show-ema" className="text-sm text-white cursor-pointer">EMA</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showSMA} onCheckedChange={setShowSMA} id="show-sma" data-testid="switch-sma" />
                          <Label htmlFor="show-sma" className="text-sm text-white cursor-pointer">SMA</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showBB} onCheckedChange={setShowBB} id="show-bb" data-testid="switch-bollinger-bands" />
                          <Label htmlFor="show-bb" className="text-sm text-white cursor-pointer">Bollinger Bands</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showSupertrend} onCheckedChange={setShowSupertrend} id="show-supertrend" data-testid="switch-supertrend" />
                          <Label htmlFor="show-supertrend" className="text-sm text-white cursor-pointer">Supertrend</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showParabolicSAR} onCheckedChange={setShowParabolicSAR} id="show-sar" data-testid="switch-sar" />
                          <Label htmlFor="show-sar" className="text-sm text-white cursor-pointer">Parabolic SAR</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showAutoTrendlines} onCheckedChange={setShowAutoTrendlines} id="show-trendlines" data-testid="switch-trendlines" />
                          <Label htmlFor="show-trendlines" className="text-sm text-white cursor-pointer">Auto Trendlines</Label>
                        </div>
                      </div>
                      
                      {/* EMA Settings */}
                      {showEMA && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">EMA Settings</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Fast Period</Label>
                              <input
                                type="number"
                                min="5"
                                max="100"
                                value={emaFastInput}
                                onChange={(e) => {
                                  setEmaFastInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setEmaFastPeriod(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-ema-fast"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Slow Period</Label>
                              <input
                                type="number"
                                min="5"
                                max="200"
                                value={emaSlowInput}
                                onChange={(e) => {
                                  setEmaSlowInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setEmaSlowPeriod(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-ema-slow"
                              />
                            </div>
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
                      
                      {/* SMA Settings */}
                      {showSMA && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs font-semibold text-blue-400 mb-2">SMA Settings</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Fast Period</Label>
                              <input
                                type="number"
                                min="5"
                                max="100"
                                value={smaFastInput}
                                onChange={(e) => {
                                  setSmaFastInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setSmaFastPeriod(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-sma-fast"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-300">Slow Period</Label>
                              <input
                                type="number"
                                min="5"
                                max="200"
                                value={smaSlowInput}
                                onChange={(e) => {
                                  setSmaSlowInput(e.target.value);
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val >= 5) setSmaSlowPeriod(val);
                                }}
                                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                                data-testid="input-sma-slow"
                              />
                            </div>
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
                      
                      {/* Save Defaults Button */}
                      <div className="pt-2 border-t border-slate-700">
                        <Button
                          onClick={saveIndicatorDefaults}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
                          data-testid="button-save-trend-defaults"
                        >
                          <Save className="w-3 h-3 mr-2" />
                          Save Defaults
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
                      
                      {/* Save Defaults Button */}
                      <div className="pt-2 border-t border-slate-700">
                        <Button
                          onClick={saveIndicatorDefaults}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
                          data-testid="button-save-vwap-defaults"
                        >
                          <Save className="w-3 h-3 mr-2" />
                          Save Defaults
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Oscillators Tab */}
                  {chartControlsTab === 'oscillators' && (
                    <div className="space-y-3">
                      {/* Main toggles */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2">
                          <Switch checked={showRSI} onCheckedChange={setShowRSI} id="show-rsi" data-testid="switch-rsi" />
                          <Label htmlFor="show-rsi" className="text-sm text-white cursor-pointer">RSI</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showStochRSI} onCheckedChange={setShowStochRSI} id="show-stoch-rsi" data-testid="switch-stoch-rsi" />
                          <Label htmlFor="show-stoch-rsi" className="text-sm text-white cursor-pointer">Stochastic RSI</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showMACD} onCheckedChange={setShowMACD} id="show-macd" data-testid="switch-macd" />
                          <Label htmlFor="show-macd" className="text-sm text-white cursor-pointer">MACD</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showOBV} onCheckedChange={setShowOBV} id="show-obv" data-testid="switch-obv" />
                          <Label htmlFor="show-obv" className="text-sm text-white cursor-pointer">OBV</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showMFI} onCheckedChange={setShowMFI} id="show-mfi" data-testid="switch-mfi" />
                          <Label htmlFor="show-mfi" className="text-sm text-white cursor-pointer">MFI</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showWilliamsR} onCheckedChange={setShowWilliamsR} id="show-williams-r" data-testid="switch-williams-r" />
                          <Label htmlFor="show-williams-r" className="text-sm text-white cursor-pointer">Williams %R</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showCCI} onCheckedChange={setShowCCI} id="show-cci" data-testid="switch-cci" />
                          <Label htmlFor="show-cci" className="text-sm text-white cursor-pointer">CCI</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={showADX} onCheckedChange={setShowADX} id="show-adx" data-testid="switch-adx" />
                          <Label htmlFor="show-adx" className="text-sm text-white cursor-pointer">ADX</Label>
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
                      
                      {/* Save Defaults Button */}
                      <div className="pt-2 border-t border-slate-700">
                        <Button
                          onClick={saveIndicatorDefaults}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
                          data-testid="button-save-indicator-defaults"
                        >
                          <Save className="w-3 h-3 mr-2" />
                          Save Defaults
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
        {(showRSI || showStochRSI || showMACD || showOBV || showWilliamsR || showMFI) && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {showRSI && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">RSI ({rsiPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={rsiRef} className="w-full" />
                </CardContent>
              </Card>
            )}
            {showStochRSI && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Stochastic RSI ({stochRSIPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={stochRSIRef} className="w-full" />
                </CardContent>
              </Card>
            )}
            {showMACD && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">MACD ({macdFast}, {macdSlow}, {macdSignal})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={macdRef} className="w-full" />
                </CardContent>
              </Card>
            )}
            {showOBV && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">On-Balance Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={obvRef} className="w-full" />
                </CardContent>
              </Card>
            )}
            {showWilliamsR && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Williams %R ({williamsRPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={williamsRRef} className="w-full" />
                </CardContent>
              </Card>
            )}
            {showMFI && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Money Flow Index ({mfiPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={mfiRef} className="w-full" />
                </CardContent>
              </Card>
            )}
            {showCCI && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">CCI ({cciPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={cciRef} className="w-full" />
                </CardContent>
              </Card>
            )}
            {showADX && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">ADX ({adxPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={adxRef} className="w-full" />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* 2x2 Grid on Desktop: Grok Summary, Alerts, Footprint, Indicators */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Market Summary */}
        {tier !== 'free' ? (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  Market Summary
                </CardTitle>
                <img src={grokLogo} alt="Grok" className="h-4 brightness-110" />
              </div>
            </CardHeader>
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
                    onClick={() => fetchAIAnalysis(true)}
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
                    onClick={() => fetchAIAnalysis(true)}
                    className="h-7 text-xs"
                    disabled={candles.length < 100}
                  >
                    Generate Analysis
                  </Button>
                </div>
              )}
            </CardContent>
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
                  BEGINNER+
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
                  Upgrade to Beginner - $10/month
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footprint Delta Table */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-sm">Footprint Delta vs CVD</CardTitle>
              <div className="flex items-center gap-2">
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
              <CardContent>
                <div className="overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800">
                      <tr className="border-b border-slate-600">
                        <th className="text-left text-gray-400 py-1 px-1">Time</th>
                        <th className="text-right text-gray-400 py-1 px-1">Delta</th>
                        <th className="text-right text-gray-400 py-1 px-1">CVD</th>
                        {useMultiExchange && (
                          <>
                            <th className="text-center text-gray-400 py-1 px-1" title="Number of exchanges">Ex</th>
                            <th className="text-center text-gray-400 py-1 px-1" title="Confidence level">Conf</th>
                          </>
                        )}
                        <th className="text-center text-gray-400 py-1 px-1">Vol</th>
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
                            
                            const isBullishSpike = currentBar.delta > 0 && currentBar.delta >= avgBullishDelta * 2;
                            const isBearishSpike = currentBar.delta < 0 && currentBar.delta <= avgBearishDelta * 2;
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
                                  {hasDivergence && <span className="text-yellow-400 text-xs" title="Exchange divergence">⚠️</span>}
                                  {isBullishSpike && !hasDivergence && <span className="text-green-400 text-xs" title="Bullish delta spike (2x avg)">🔥</span>}
                                  {isBearishSpike && !hasDivergence && !isBullishSpike && <span className="text-red-400 text-xs" title="Bearish delta spike (2x avg)">🔥</span>}
                                </td>
                              </tr>
                            );
                          })()}
                          
                          {/* Historical Bars */}
                          {deltaHistory.slice(0, -1).reverse().map((item, idx) => {
                            // Calculate separate averages for bullish and bearish bars
                            const bullishBars = deltaHistory.filter(h => h.delta > 0);
                            const bearishBars = deltaHistory.filter(h => h.delta < 0);
                            const avgBullishDelta = bullishBars.length > 0 
                              ? bullishBars.reduce((sum, h) => sum + h.delta, 0) / bullishBars.length 
                              : 0;
                            const avgBearishDelta = bearishBars.length > 0 
                              ? bearishBars.reduce((sum, h) => sum + h.delta, 0) / bearishBars.length 
                              : 0;
                            
                            const isBullishSpike = item.delta > 0 && item.delta >= avgBullishDelta * 2;
                            const isBearishSpike = item.delta < 0 && item.delta <= avgBearishDelta * 2;
                            const hasDivergence = useMultiExchange && item.divergence;
                            const cellBg = hasDivergence 
                              ? 'bg-yellow-900/20' 
                              : item.isBull ? 'bg-green-900/20' : 'bg-red-900/20';
                            
                            return (
                              <tr key={idx} className={`border-b border-slate-700/50 ${cellBg}`}>
                              <td className="text-gray-300 py-1 px-1 font-mono text-[10px]">{item.time}</td>
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
                                {hasDivergence && <span className="text-yellow-400 text-xs" title="Exchange divergence">⚠️</span>}
                                {isBullishSpike && !hasDivergence && <span className="text-green-400 text-xs" title="Bullish delta spike (2x avg)">🔥</span>}
                                {isBearishSpike && !hasDivergence && !isBullishSpike && <span className="text-red-400 text-xs" title="Bearish delta spike (2x avg)">🔥</span>}
                              </td>
                            </tr>
                          );
                        })}
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
        </Card>

        {/* Market Alerts */}
        {tier !== 'free' && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Market Alerts
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAlertSettings(true)}
                    className="text-gray-400 hover:text-white h-8 px-2"
                    data-testid="button-market-alerts-settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-1 bg-slate-700 rounded-md p-1">
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
          </Card>
        )}

        </div>
        {/* End of 2x2 Grid */}

        {/* Unlock AI Analysis CTA */}
        <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30 p-4 text-center">
          <div className="max-w-2xl mx-auto space-y-2">
            <h2 className="text-xl font-bold text-white">Unlock AI-Powered Trade Analysis</h2>
            <p className="text-gray-300 text-sm">
              Upgrade to Tier 2 for instant trade alerts powered by Grok AI. Get real-time confluence analysis, 
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

// Build v2.0
import { useEffect, useRef, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { createChart, IChartApi, ISeriesApi, ColorType, CandlestickData, HistogramData, LineData, Time, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, TrendingUp, Zap, Loader2, ArrowLeft, Settings, Activity, Info, AlertCircle, Target, ChevronDown, ChevronUp, X, Layers } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useQuery } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Link, useLocation } from 'wouter';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useToast } from '@/hooks/use-toast';
import { LiquidationHeatmapChart } from '@/components/LiquidationHeatmapChart';
import { ProfessionalOrderflowTable } from '@/components/ProfessionalOrderflowTable';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { calculateCCI, calculateADX, ADXValue } from '@/lib/indicators';
import grokLogo from '@assets/Grok_Full_Logomark_Light_1763287603908.png';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface VolumeProfileBin {
  price: number;
  volume: number;
  buyVol: number;
  sellVol: number;
}

interface OrderBlock {
  time: number;
  price: number;
  type: 'bullish' | 'bearish';
}

interface TradeAlert {
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E';
  direction: 'LONG' | 'SHORT';
  entry: string;
  stopLoss: string;
  targets: string[];
  confluenceSignals: string[];
  reasoning: string;
  confluenceCount: number;
}

interface FVG {
  time: number;
  low: number;
  high: number;
  mitigated: boolean;
}

interface Imbalance {
  price: number;
  type: 'buy' | 'sell';
}

interface Absorption {
  time: number;
  price: number;
  type: 'bullAbsorb' | 'bearAbsorb';
}

import { incrementTickerClick, getFavorites } from '@/lib/tickerUtils';
import { FavoritesOnlySelector } from '@/components/TickerSelector';
const INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1d', value: '1d' },
  { label: '1w', value: '1w' },
  { label: '1M', value: '1M' },
];

export default function CryptoAI() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const prevSymbolRef = useRef<string | null>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const obvRef = useRef<HTMLDivElement>(null);
  const mfiRef = useRef<HTMLDivElement>(null);
  const cciRef = useRef<HTMLDivElement>(null);
  const adxRef = useRef<HTMLDivElement>(null);
  const volumeChartRef = useRef<HTMLDivElement>(null);
  const cvdChartRef = useRef<HTMLDivElement>(null);
  const analyzeTradesRef = useRef<() => void>(() => {});

  const { isAuthenticated, isLoading: authLoading, tier: rawTier, getToken, isAdmin } = useCryptoAuth();
  
  usePageViewTracking('crypto-ai');
  const tier = isAdmin ? 'elite' : rawTier; // Admin gets unrestricted elite access
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [data, setData] = useState<Bar[]>([]);
  const [symbol, setSymbol] = useState('XRPUSDT');
  const [interval, setInterval] = useState('15m');

  const { data: subscription, refetch: refetchSubscription } = useQuery<{
    tier: string;
    monthlyUsage?: { aiCredits: number; aiLimit: number; elliottCredits: number; elliottLimit: number };
  }>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isAuthenticated && !authLoading,
    staleTime: 0, // Force fresh data
    refetchOnMount: true
  });

  const { data: trackedTradesData, refetch: refetchTrackedTrades } = useQuery<any[]>({
    queryKey: ['/api/crypto/tracked-trades'],
    enabled: isAuthenticated && !authLoading,
    refetchInterval: 10000, // Refetch every 10 seconds to check for status updates
  });
  
  // Current prices for tracked trades symbols
  const [trackedTradesPrices, setTrackedTradesPrices] = useState<Record<string, number>>({});
  
  // Fetch current prices for tracked trades
  useEffect(() => {
    const fetchPrices = async () => {
      if (!trackedTradesData || trackedTradesData.length === 0) return;
      
      // Get unique symbols from tracked trades that are "entry_hit" status
      const inTradeSymbols = trackedTradesData
        .filter((t: any) => t.status === 'entry_hit')
        .map((t: any) => t.symbol);
      
      if (inTradeSymbols.length === 0) return;
      
      try {
        const token = await getToken();
        const response = await fetch('/api/crypto/current-prices', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ symbols: inTradeSymbols })
        });
        
        if (response.ok) {
          const data = await response.json();
          setTrackedTradesPrices(data.prices || {});
        }
      } catch (err) {
        console.error('Error fetching tracked trade prices:', err);
      }
    };
    
    fetchPrices();
  }, [trackedTradesData, getToken]);
  
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingMultiTF, setAnalyzingMultiTF] = useState(false);
  const [multiTFInsights, setMultiTFInsights] = useState<any | null>(null);
  const [tradeAlerts, setTradeAlerts] = useState<TradeAlert[]>([]);
  
  const [marketInsights, setMarketInsights] = useState<{ noTradesReason?: string; summary?: string; bias?: string; keyLevels?: string[] } | null>(null);
  const [indicatorData, setIndicatorData] = useState<any | null>(null); // All indicators from backend
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>(['A+', 'A', 'B', 'C']);
  const [alertTimeframe, setAlertTimeframe] = useState('15m');
  const [savingPreferences, setSavingPreferences] = useState(false);
  
  // Sync alertTimeframe with chart interval when interval changes
  useEffect(() => {
    setAlertTimeframe(interval);
  }, [interval]);
  const [trackedTrades, setTrackedTrades] = useState<string[]>([]); // IDs of tracked trades
  const [trackingTradeId, setTrackingTradeId] = useState<string | null>(null); // Currently tracking
  const [selectedTrackedTradeId, setSelectedTrackedTradeId] = useState<number | null>(null); // Selected trade for chart display
  const [activeTab, setActiveTab] = useState('chart'); // Track active tab for chart resize
  
  
  const [stats, setStats] = useState({
    cvd: 0,
    poc: 0,
    vah: 0,
    val: 0,
    bullishOB: 0,
    bearishOB: 0,
    bullFVG: 0,
    bearFVG: 0,
    buyImbalances: 0,
    sellImbalances: 0,
    absorptionEvents: 0,
    hiddenDivergences: 0,
    liquidityGrabs: 0,
  });
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [macdFast, setMacdFast] = useState(12);
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSignal, setMacdSignal] = useState(9);
  
  // Collapsible state for oscillator sections - all minimized by default
  const [dataBoxesOpen, setDataBoxesOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [cvdOpen, setCvdOpen] = useState(false);
  const [rsiOpen, setRsiOpen] = useState(false);
  const [macdOpen, setMacdOpen] = useState(false);
  const [obvOpen, setObvOpen] = useState(false);
  const [mfiOpen, setMfiOpen] = useState(false);
  const [cciOpen, setCciOpen] = useState(false);
  const [adxOpen, setAdxOpen] = useState(false);
  
  // Collapsible state for AI report sections - all minimized by default
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [indicatorDataOpen, setIndicatorDataOpen] = useState(false);
  const [tradeIdeasOpen, setTradeIdeasOpen] = useState(false);
  const [liquidationInfoOpen, setLiquidationInfoOpen] = useState(false);
  const [oiInfoOpen, setOiInfoOpen] = useState(false);
  const [indicatorStatusOpen, setIndicatorStatusOpen] = useState(false);
  const [mfiPeriod, setMfiPeriod] = useState(14);
  const [cciPeriod, setCciPeriod] = useState(20);
  const [adxPeriod, setAdxPeriod] = useState(14);
  const [showGrokIndicators, setShowGrokIndicators] = useState(true); // Toggle for Grok's indicators overlay
  const [stochOpen, setStochOpen] = useState(false); // Stochastic sub-chart
  const [cmfOpen, setCmfOpen] = useState(false); // CMF sub-chart
  const stochRef = useRef<HTMLDivElement>(null);
  const cmfRef = useRef<HTMLDivElement>(null);

  // Cached AI analysis query - allows viewing previous analysis without credits
  const { data: cachedAnalysis, refetch: refetchCachedAnalysis } = useQuery<{
    cached: { alerts: any[]; marketInsights: any; indicatorData: any; updatedAt: string } | null;
  }>({
    queryKey: ['/api/crypto/ai-analysis/cached', symbol, alertTimeframe],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { cached: null };
      const res = await fetch(`/api/crypto/ai-analysis/cached?symbol=${symbol}&interval=${alertTimeframe}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return { cached: null };
      return res.json();
    },
    enabled: isAuthenticated && !authLoading && (tier === 'intermediate' || tier === 'pro' || tier === 'elite'),
    staleTime: 60000, // Cache for 1 minute
  });

  // Cached Multi-TF analysis query - allows viewing previous multi-TF analysis without credits
  const { data: cachedMultiTF, refetch: refetchCachedMultiTF } = useQuery<{
    cached: { multiTFInsights: any; tradeAlerts: any[]; confluence: string; updatedAt: string } | null;
  }>({
    queryKey: ['/api/crypto/ai-analysis/cached-multi-tf', symbol],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { cached: null };
      const res = await fetch(`/api/crypto/ai-analysis/cached-multi-tf?symbol=${symbol}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return { cached: null };
      return res.json();
    },
    enabled: isAuthenticated && !authLoading && (tier === 'intermediate' || tier === 'pro' || tier === 'elite'),
    staleTime: 60000,
  });

  // === Helper: Calculate ATR (Average True Range) - Returns Array ===
  const calculateATR = useCallback((bars: Bar[], period = 14): number[] => {
    const tr: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const highLow = bars[i].high - bars[i].low;
      const highClose = Math.abs(bars[i].high - bars[i - 1].close);
      const lowClose = Math.abs(bars[i].low - bars[i - 1].close);
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

  // === Helper: Average Volume ===
  const averageVolume = useCallback((bars: Bar[]): number => {
    if (bars.length === 0) return 0;
    return bars.reduce((sum, bar) => sum + bar.volume, 0) / bars.length;
  }, []);

  // === Helper: Average Delta ===
  const averageDelta = useCallback((bars: Bar[]): number => {
    if (bars.length === 0) return 0;
    const deltas = bars.map(bar => {
      const buyVol = bar.close >= bar.open ? bar.volume : 0;
      const sellVol = bar.close < bar.open ? bar.volume : 0;
      return Math.abs(buyVol - sellVol);
    });
    return deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
  }, []);

  // === Calculate CVD (Cumulative Volume Delta) ===
  const calculateCVD = useCallback((bars: Bar[]) => {
    let cumulative = 0;
    return bars.map(bar => {
      // Buy volume = volume when close >= open, Sell volume = volume when close < open
      const buyVol = bar.close >= bar.open ? bar.volume : 0;
      const sellVol = bar.close < bar.open ? bar.volume : 0;
      const delta = buyVol - sellVol;
      cumulative += delta;
      return { time: bar.time as Time, value: cumulative, delta };
    });
  }, []);

  // === Volume Profile Calculation ===
  const calculateVolumeProfile = useCallback((bars: Bar[], bins = 50) => {
    const prices = bars.flatMap(b => [b.high, b.low]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const binSize = (max - min) / bins;
    const profile: VolumeProfileBin[] = [];

    for (let i = 0; i < bins; i++) {
      profile.push({ price: min + i * binSize, volume: 0, buyVol: 0, sellVol: 0 });
    }

    bars.forEach(bar => {
      const buyVol = bar.close >= bar.open ? bar.volume : 0;
      const sellVol = bar.close < bar.open ? bar.volume : 0;
      const range = bar.high - bar.low;
      if (range === 0) return;

      // Distribute volume across price bins proportionally
      for (let p = bar.low; p <= bar.high; p += binSize / 10) {
        const index = Math.floor((p - min) / binSize);
        if (index >= 0 && index < bins) {
          const weight = Math.min(p - bar.low, bar.high - p) + binSize / 20;
          profile[index].volume += (bar.volume * weight) / range;
          profile[index].buyVol += (buyVol * weight) / range;
          profile[index].sellVol += (sellVol * weight) / range;
        }
      }
    });

    // POC = Point of Control (highest volume price)
    const poc = profile.reduce((a, b) => a.volume > b.volume ? a : b);
    
    // Calculate cumulative volume for VAH/VAL
    const totalVolume = profile.reduce((sum, bin) => sum + bin.volume, 0);
    const sortedByVolume = [...profile].sort((a, b) => b.volume - a.volume);
    
    let cumVol = 0;
    const valueArea: VolumeProfileBin[] = [];
    for (const bin of sortedByVolume) {
      cumVol += bin.volume;
      valueArea.push(bin);
      if (cumVol >= totalVolume * 0.70) break; // 70% value area
    }
    
    const vah = Math.max(...valueArea.map(b => b.price));
    const val = Math.min(...valueArea.map(b => b.price));

    return { profile, poc: poc.price, vah, val };
  }, []);

  // === Order Blocks Detection (SMC Style with Quality Filters) ===
  const detectOrderBlocks = useCallback((bars: Bar[]): { bullishOB: OrderBlock[], bearishOB: OrderBlock[] } => {
    const bullishOB: OrderBlock[] = [];
    const bearishOB: OrderBlock[] = [];

    if (bars.length < 20) return { bullishOB, bearishOB };

    // Calculate filters
    const atrArray = calculateATR(bars);
    const atr = atrArray[atrArray.length - 1]; // Use latest ATR
    const minBody = atr * 1.5;
    const avgVol = averageVolume(bars.slice(-20));
    const avgDelta = averageDelta(bars.slice(-20));

    for (let i = 5; i < bars.length - 5; i++) {
      const prev = bars[i - 1];
      const curr = bars[i];

      const prevBody = Math.abs(prev.close - prev.open);
      const currBody = Math.abs(curr.close - curr.open);
      
      // Calculate deltas
      const prevBuyVol = prev.close >= prev.open ? prev.volume : 0;
      const prevSellVol = prev.close < prev.open ? prev.volume : 0;
      const prevDelta = Math.abs(prevBuyVol - prevSellVol);

      // Bullish OB: strong bearish candle followed by bullish move
      if (prev.close < prev.open && 
          curr.close > curr.open && 
          curr.close > prev.high &&
          prevBody > minBody &&
          prev.volume > avgVol * 1.5 &&
          prevDelta > avgDelta * 2) {
        bullishOB.push({ time: bars[i].time, price: prev.low, type: 'bullish' });
      }

      // Bearish OB: strong bullish candle followed by bearish move
      if (prev.close > prev.open && 
          curr.close < curr.open && 
          curr.close < prev.low &&
          prevBody > minBody &&
          prev.volume > avgVol * 1.5 &&
          prevDelta > avgDelta * 2) {
        bearishOB.push({ time: bars[i].time, price: prev.high, type: 'bearish' });
      }
    }
    return { bullishOB, bearishOB };
  }, [calculateATR, averageVolume, averageDelta]);

  // === Fair Value Gap (FVG) Detection (High Value Only) ===
  const detectFVG = useCallback((bars: Bar[]): { bullFVG: FVG[], bearFVG: FVG[] } => {
    const bullFVG: FVG[] = [];
    const bearFVG: FVG[] = [];

    if (bars.length < 20) return { bullFVG, bearFVG };

    // Calculate ATR and average volume for filtering
    const atrArray = calculateATR(bars, 14);
    const avgVolume = bars.reduce((sum, b) => sum + b.volume, 0) / bars.length;
    const FVG_VOLUME_THRESHOLD = 1.5; // Must be 1.5x average volume to be "high value"

    for (let i = 2; i < bars.length; i++) {
      // Use ATR at the time of FVG formation (i-2)
      const atrIndex = Math.min(i - 2, atrArray.length - 1);
      const atr = atrArray[atrIndex];

      // Bullish FVG: bars[i].low > bars[i-2].high (gap between current and i-2)
      if (bars[i].low > bars[i - 2].high) {
        const gapSize = bars[i].low - bars[i - 2].high;
        const lower = bars[i - 2].high;
        const upper = bars[i].low;
        
        // ATR filter: gap must be at least 1 ATR
        if (gapSize >= atr) {
          // Calculate volume score for the gap zone
          let totalVolume = 0;
          let count = 0;
          
          for (let j = 0; j < bars.length; j++) {
            const bar = bars[j];
            // Check if bar overlaps with FVG zone
            if (bar.low <= upper && bar.high >= lower) {
              totalVolume += bar.volume;
              count++;
            }
          }
          
          const volumeScore = count > 0 ? totalVolume / (avgVolume * count) : 0;
          
          // Only keep high value FVGs
          if (volumeScore >= FVG_VOLUME_THRESHOLD) {
            bullFVG.push({
              time: bars[i].time,
              low: lower,
              high: upper,
              mitigated: false
            });
          }
        }
      }
      
      // Bearish FVG: bars[i].high < bars[i-2].low (gap between current and i-2)
      if (bars[i].high < bars[i - 2].low) {
        const gapSize = bars[i - 2].low - bars[i].high;
        const lower = bars[i].high;
        const upper = bars[i - 2].low;
        
        // ATR filter: gap must be at least 1 ATR
        if (gapSize >= atr) {
          // Calculate volume score for the gap zone
          let totalVolume = 0;
          let count = 0;
          
          for (let j = 0; j < bars.length; j++) {
            const bar = bars[j];
            // Check if bar overlaps with FVG zone
            if (bar.low <= upper && bar.high >= lower) {
              totalVolume += bar.volume;
              count++;
            }
          }
          
          const volumeScore = count > 0 ? totalVolume / (avgVolume * count) : 0;
          
          // Only keep high value FVGs
          if (volumeScore >= FVG_VOLUME_THRESHOLD) {
            bearFVG.push({
              time: bars[i].time,
              low: lower,
              high: upper,
              mitigated: false
            });
          }
        }
      }
    }
    
    // Mark mitigated FVGs (price filled the gap completely)
    for (let i = 0; i < bullFVG.length; i++) {
      const fvg = bullFVG[i];
      const fvgIndex = bars.findIndex(b => b.time === fvg.time);
      if (fvgIndex >= 0) {
        for (let j = fvgIndex + 1; j < bars.length; j++) {
          // Bullish FVG is filled if price went below the lower boundary
          if (bars[j].low <= fvg.low) {
            bullFVG[i].mitigated = true;
            break;
          }
        }
      }
    }
    
    for (let i = 0; i < bearFVG.length; i++) {
      const fvg = bearFVG[i];
      const fvgIndex = bars.findIndex(b => b.time === fvg.time);
      if (fvgIndex >= 0) {
        for (let j = fvgIndex + 1; j < bars.length; j++) {
          // Bearish FVG is filled if price went above the upper boundary
          if (bars[j].high >= fvg.high) {
            bearFVG[i].mitigated = true;
            break;
          }
        }
      }
    }
    
    return { 
      bullFVG: bullFVG.filter(f => !f.mitigated), 
      bearFVG: bearFVG.filter(f => !f.mitigated) 
    };
  }, [calculateATR]);

  // === Volume Imbalances Detection ===
  const detectImbalances = useCallback((profile: VolumeProfileBin[]): Imbalance[] => {
    const imbalances: Imbalance[] = [];
    for (let i = 1; i < profile.length - 1; i++) {
      const ratio = profile[i].buyVol / (profile[i].sellVol || 1);
      if (ratio > 3) imbalances.push({ price: profile[i].price, type: 'buy' });
      if (ratio < 0.33) imbalances.push({ price: profile[i].price, type: 'sell' });
    }
    return imbalances;
  }, []);

  // === Absorption / Exhaustion Detection ===
  // Detects significant absorption: massive volume + delta with minimal price movement
  const detectAbsorption = useCallback((bars: Bar[], cvdData: any[]): Absorption[] => {
    if (bars.length < 30) return [];
    
    const signals: Absorption[] = [];
    const atrArray = calculateATR(bars, 14);
    const avgVol20 = averageVolume(bars.slice(-20));
    const avgDelta20 = averageDelta(bars.slice(-20));
    
    const atr14 = atrArray[atrArray.length - 1];
    
    // SIGNIFICANCE THRESHOLDS (no cooldowns, just strict requirements):
    const MAX_PRICE_MOVE = 0.15 * atr14;      // price must stall <0.15 ATR (very tight)
    const MIN_DELTA_STRENGTH = 4.0 * avgDelta20;  // delta surge >4x average (exceptional)
    const VOLUME_MULTIPLIER = 2.5;            // volume >2.5x 20-bar avg (major spike)
    const LOOKBACK_WINDOW = 5;                // check over 5 bars
    
    for (let i = 20; i < bars.length - 5; i++) {
      const priceMove = Math.abs(bars[i].close - bars[i - LOOKBACK_WINDOW].close);
      const deltaChange = Math.abs(cvdData[i].delta - cvdData[i - LOOKBACK_WINDOW].delta);
      
      // All conditions must be met for significant absorption
      if (priceMove > MAX_PRICE_MOVE) continue;
      if (deltaChange < MIN_DELTA_STRENGTH) continue;
      if (bars[i].volume < avgVol20 * VOLUME_MULTIPLIER) continue;
      
      // Additional: confirm absorption over multiple bars (not just spike)
      const multiBarVolume = bars.slice(i - 2, i + 1).reduce((s, b) => s + b.volume, 0) / 3;
      if (multiBarVolume < avgVol20 * 2.0) continue;
      
      signals.push({
        time: bars[i].time,
        price: bars[i].close,
        type: cvdData[i].delta > cvdData[i - LOOKBACK_WINDOW].delta ? 'bullAbsorb' : 'bearAbsorb'
      });
    }
    return signals;
  }, [calculateATR, averageVolume, averageDelta]);

  // === Hidden Divergence Detection ===
  // Detects significant divergences: price and CVD moving in opposite directions
  const detectHiddenDivergence = useCallback((bars: Bar[], cvdData: any[]) => {
    if (bars.length < 60) return [];
    
    const divergences: any[] = [];
    const atrArray = calculateATR(bars, 14);
    const avgDelta20 = averageDelta(bars.slice(-20));
    
    const atr14 = atrArray[atrArray.length - 1];
    
    // SIGNIFICANCE THRESHOLDS (no cooldowns):
    const MIN_SWING_STRENGTH = 1.8 * atr14;   // price swing >1.8 ATR (major swing)
    const MIN_CVD_DIVERGENCE = 3.5 * avgDelta20;  // CVD counter-move >3.5x avg (strong divergence)
    const LOOKBACK = 30;                      // 30-bar window to find swing points
    
    for (let i = LOOKBACK; i < bars.length - 3; i++) {
      const recentBars = bars.slice(i - LOOKBACK, i + 1);
      const recentCVD = cvdData.slice(i - LOOKBACK, i + 1);
      
      // Find swing lows in price and CVD
      const priceLows = recentBars.map(b => b.low);
      const cvdValues = recentCVD.map(c => c.value);
      
      const currentPriceLow = priceLows[priceLows.length - 1];
      const prevPriceLow = Math.min(...priceLows.slice(0, -5));
      const currentCVD = cvdValues[cvdValues.length - 1];
      const prevCVDLow = Math.min(...cvdValues.slice(0, -5));
      
      const priceSwing = currentPriceLow - prevPriceLow;
      const cvdSwing = currentCVD - prevCVDLow;
      
      // Bullish hidden divergence: LOWER price low but HIGHER CVD low (accumulation)
      if (priceSwing < -MIN_SWING_STRENGTH && cvdSwing > MIN_CVD_DIVERGENCE) {
        divergences.push({ time: bars[i].time, type: 'bullish', price: bars[i].low });
      }
      
      // Find swing highs
      const priceHighs = recentBars.map(b => b.high);
      const currentPriceHigh = priceHighs[priceHighs.length - 1];
      const prevPriceHigh = Math.max(...priceHighs.slice(0, -5));
      const prevCVDHigh = Math.max(...cvdValues.slice(0, -5));
      
      const priceHighSwing = currentPriceHigh - prevPriceHigh;
      const cvdHighSwing = currentCVD - prevCVDHigh;
      
      // Bearish hidden divergence: HIGHER price high but LOWER CVD high (distribution)
      if (priceHighSwing > MIN_SWING_STRENGTH && cvdHighSwing < -MIN_CVD_DIVERGENCE) {
        divergences.push({ time: bars[i].time, type: 'bearish', price: bars[i].high });
      }
    }
    
    return divergences;
  }, [calculateATR, averageDelta]);

  // === Liquidity Grab Detection ===
  // Detects significant liquidity grabs: sweeping major swing levels with strong reversal
  const detectLiquidityGrabs = useCallback((bars: Bar[]) => {
    const grabs: any[] = [];
    const lookback = 30;           // 30-bar lookback for significant swing levels
    
    for (let i = lookback; i < bars.length - 4; i++) {
      const recentBars = bars.slice(i - lookback, i);
      const recentLows = recentBars.map(b => b.low);
      const recentHighs = recentBars.map(b => b.high);
      const minLow = Math.min(...recentLows);
      const maxHigh = Math.max(...recentHighs);
      
      // SIGNIFICANCE: swing range must be substantial
      const swingRange = maxHigh - minLow;
      const avgRange = recentBars.reduce((sum, b) => sum + (b.high - b.low), 0) / recentBars.length;
      if (swingRange < avgRange * 5) continue;  // Swing must be 5x avg bar range (major level)
      
      // The sweep must be meaningful (not just touching by a tiny wick)
      const sweepDepth = minLow - bars[i].low;
      const sweepHeight = bars[i].high - maxHigh;
      
      // Bullish liquidity grab: sweep well below + strong bullish reversal bar
      if (sweepDepth > avgRange * 0.5 &&          // Swept by at least 0.5x avg range
          bars[i].close > bars[i].open &&          // Bullish candle
          bars[i].close > (bars[i].high + bars[i].low) / 2 &&  // Close in upper half
          (bars[i].close - bars[i].open) > avgRange * 0.8) {   // Strong body
        // Confirm reversal in next 2-3 bars
        const nextBars = bars.slice(i + 1, i + 4);
        const allHigher = nextBars.every((b, idx) => b.close > bars[i].close - avgRange * 0.3);
        if (allHigher) {
          grabs.push({ time: bars[i].time, type: 'bullish', price: bars[i].low });
        }
      }
      
      // Bearish liquidity grab: sweep well above + strong bearish reversal bar
      if (sweepHeight > avgRange * 0.5 &&          // Swept by at least 0.5x avg range
          bars[i].close < bars[i].open &&          // Bearish candle
          bars[i].close < (bars[i].high + bars[i].low) / 2 &&  // Close in lower half
          (bars[i].open - bars[i].close) > avgRange * 0.8) {   // Strong body
        // Confirm reversal in next 2-3 bars
        const nextBars = bars.slice(i + 1, i + 4);
        const allLower = nextBars.every((b, idx) => b.close < bars[i].close + avgRange * 0.3);
        if (allLower) {
          grabs.push({ time: bars[i].time, type: 'bearish', price: bars[i].high });
        }
      }
    }
    
    return grabs;
  }, []);

  // === Swing Pivot Detection (for market structure) ===
  const detectSwingPivots = useCallback((bars: Bar[], swingLength: number = 5) => {
    const swingHighs: { time: number; price: number; index: number }[] = [];
    const swingLows: { time: number; price: number; index: number }[] = [];
    
    if (bars.length < swingLength * 2 + 1) return { swingHighs, swingLows };
    
    for (let i = swingLength; i < bars.length - swingLength; i++) {
      // Check for swing high: current bar high is higher than all bars within swingLength on both sides
      let isSwingHigh = true;
      let isSwingLow = true;
      
      for (let j = 1; j <= swingLength; j++) {
        if (bars[i].high <= bars[i - j].high || bars[i].high <= bars[i + j].high) {
          isSwingHigh = false;
        }
        if (bars[i].low >= bars[i - j].low || bars[i].low >= bars[i + j].low) {
          isSwingLow = false;
        }
      }
      
      if (isSwingHigh) {
        swingHighs.push({ time: bars[i].time as number, price: bars[i].high, index: i });
      }
      if (isSwingLow) {
        swingLows.push({ time: bars[i].time as number, price: bars[i].low, index: i });
      }
    }
    
    return { swingHighs, swingLows };
  }, []);

  // === Oscillator Calculation Functions ===
  const calculateRSI = useCallback((candles: Bar[], period: number = 14) => {
    if (candles.length < period + 1) return [];
    const result: { time: number; value: number }[] = [];
    
    for (let i = period; i < candles.length; i++) {
      let gains = 0;
      let losses = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        const change = candles[j].close - candles[j - 1].close;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      
      result.push({ time: candles[i].time as number, value: rsi });
    }
    
    return result;
  }, []);

  const calculateMACD = useCallback((candles: Bar[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) => {
    if (candles.length < slowPeriod) return { macd: [], signal: [], histogram: [] };
    
    const emaFast: number[] = [];
    const emaSlow: number[] = [];
    
    const multFast = 2 / (fastPeriod + 1);
    const multSlow = 2 / (slowPeriod + 1);
    
    emaFast[0] = candles[0].close;
    emaSlow[0] = candles[0].close;
    
    for (let i = 1; i < candles.length; i++) {
      emaFast[i] = (candles[i].close - emaFast[i - 1]) * multFast + emaFast[i - 1];
      emaSlow[i] = (candles[i].close - emaSlow[i - 1]) * multSlow + emaSlow[i - 1];
    }
    
    const macdLine: { time: number; value: number }[] = [];
    for (let i = 0; i < candles.length; i++) {
      macdLine.push({ time: candles[i].time as number, value: emaFast[i] - emaSlow[i] });
    }
    
    const signalLine: { time: number; value: number }[] = [];
    const histogram: { time: number; value: number; color: string }[] = [];
    
    if (macdLine.length >= signalPeriod) {
      const multSignal = 2 / (signalPeriod + 1);
      signalLine[0] = { time: macdLine[0].time, value: macdLine[0].value };
      
      for (let i = 1; i < macdLine.length; i++) {
        const signalVal = (macdLine[i].value - signalLine[i - 1].value) * multSignal + signalLine[i - 1].value;
        signalLine[i] = { time: macdLine[i].time, value: signalVal };
        
        const histVal = macdLine[i].value - signalVal;
        histogram[i] = { 
          time: macdLine[i].time, 
          value: histVal,
          color: histVal >= 0 ? '#22c55e' : '#ef4444'
        };
      }
    }
    
    return { macd: macdLine, signal: signalLine, histogram };
  }, []);

  const calculateOBV = useCallback((candles: Bar[]) => {
    if (candles.length === 0) return [];
    const result: { time: number; value: number }[] = [];
    let obv = 0;
    
    result.push({ time: candles[0].time as number, value: 0 });
    
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].close > candles[i - 1].close) {
        obv += candles[i].volume;
      } else if (candles[i].close < candles[i - 1].close) {
        obv -= candles[i].volume;
      }
      result.push({ time: candles[i].time as number, value: obv });
    }
    
    return result;
  }, []);

  const calculateMFI = useCallback((candles: Bar[], period: number = 14) => {
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

  // === Bollinger Bands Calculation ===
  const calculateBollingerBands = useCallback((candles: Bar[], period: number = 20, stdDev: number = 2) => {
    if (candles.length < period) return { upper: [], middle: [], lower: [] };
    
    const upper: { time: number; value: number }[] = [];
    const middle: { time: number; value: number }[] = [];
    const lower: { time: number; value: number }[] = [];
    
    for (let i = period - 1; i < candles.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += candles[j].close;
      }
      const sma = sum / period;
      
      let sumSquares = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sumSquares += Math.pow(candles[j].close - sma, 2);
      }
      const std = Math.sqrt(sumSquares / period);
      
      middle.push({ time: candles[i].time as number, value: sma });
      upper.push({ time: candles[i].time as number, value: sma + stdDev * std });
      lower.push({ time: candles[i].time as number, value: sma - stdDev * std });
    }
    
    return { upper, middle, lower };
  }, []);

  // === VWAP Calculation ===
  const calculateVWAP = useCallback((candles: Bar[]) => {
    if (candles.length === 0) return [];
    
    const result: { time: number; value: number }[] = [];
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;
    
    for (let i = 0; i < candles.length; i++) {
      const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
      cumulativeTPV += typicalPrice * candles[i].volume;
      cumulativeVolume += candles[i].volume;
      
      const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
      result.push({ time: candles[i].time as number, value: vwap });
    }
    
    return result;
  }, []);

  // === Stochastic Oscillator Calculation ===
  const calculateStochastic = useCallback((candles: Bar[], kPeriod: number = 14, dPeriod: number = 3) => {
    if (candles.length < kPeriod) return { k: [], d: [] };
    
    const kValues: { time: number; value: number }[] = [];
    
    for (let i = kPeriod - 1; i < candles.length; i++) {
      let highestHigh = candles[i].high;
      let lowestLow = candles[i].low;
      
      for (let j = i - kPeriod + 1; j <= i; j++) {
        if (candles[j].high > highestHigh) highestHigh = candles[j].high;
        if (candles[j].low < lowestLow) lowestLow = candles[j].low;
      }
      
      const range = highestHigh - lowestLow;
      const k = range === 0 ? 50 : ((candles[i].close - lowestLow) / range) * 100;
      kValues.push({ time: candles[i].time as number, value: k });
    }
    
    const dValues: { time: number; value: number }[] = [];
    for (let i = dPeriod - 1; i < kValues.length; i++) {
      let sum = 0;
      for (let j = i - dPeriod + 1; j <= i; j++) {
        sum += kValues[j].value;
      }
      dValues.push({ time: kValues[i].time, value: sum / dPeriod });
    }
    
    return { k: kValues, d: dValues };
  }, []);

  // === CMF (Chaikin Money Flow) Calculation ===
  const calculateCMF = useCallback((candles: Bar[], period: number = 20) => {
    if (candles.length < period) return [];
    
    const result: { time: number; value: number }[] = [];
    
    for (let i = period - 1; i < candles.length; i++) {
      let mfvSum = 0;
      let volSum = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        const hl = candles[j].high - candles[j].low;
        const mfMultiplier = hl === 0 ? 0 : ((candles[j].close - candles[j].low) - (candles[j].high - candles[j].close)) / hl;
        const mfVolume = mfMultiplier * candles[j].volume;
        mfvSum += mfVolume;
        volSum += candles[j].volume;
      }
      
      const cmf = volSum === 0 ? 0 : mfvSum / volSum;
      result.push({ time: candles[i].time as number, value: cmf });
    }
    
    return result;
  }, []);

  // === Service Worker & Push Notification Setup ===
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered:', registration);
          
          // Check if already subscribed
          return registration.pushManager.getSubscription();
        })
        .then(existingSubscription => {
          if (existingSubscription) {
            setPushSubscription(existingSubscription);
            setNotificationsEnabled(true);
          }
        })
        .catch(err => console.error('Service Worker registration failed:', err));
    }
  }, []);

  const toggleNotifications = async () => {
    // Check browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast({
        title: "Browser Not Supported",
        description: "Push notifications require a modern browser. Try Chrome, Firefox, or Safari on desktop/mobile.",
        variant: "destructive"
      });
      return;
    }

    // Check tier access (Pro/Elite only)
    if (tier !== 'pro' && tier !== 'elite') {
      toast({
        title: "Premium Feature",
        description: "Push notifications are available for Pro and Elite subscribers only.",
        variant: "destructive"
      });
      return;
    }

    if (notificationsEnabled) {
      // Unsubscribe
      if (pushSubscription) {
        await pushSubscription.unsubscribe();
        setPushSubscription(null);
        setNotificationsEnabled(false);
        toast({
          title: "Alerts Disabled",
          description: "You will no longer receive push notifications for trade alerts."
        });
      }
    } else {
      try {
        // Request permission and subscribe
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
          // Fetch the VAPID public key from server
          const vapidResponse = await fetch('/api/crypto/vapid-key');
          if (!vapidResponse.ok) {
            throw new Error('Failed to get VAPID key from server');
          }
          const { publicKey: vapidPublicKey } = await vapidResponse.json();
          
          if (!vapidPublicKey) {
            throw new Error('VAPID key not configured on server');
          }
          
          const registration = await navigator.serviceWorker.ready;
          const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
          
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey
          });
          
          // Send subscription to server
          await fetch('/api/crypto/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
          });
          
          setPushSubscription(subscription);
          setNotificationsEnabled(true);
          toast({
            title: "Alerts Enabled! 🔔",
            description: "You'll receive real-time trade alerts based on your settings."
          });
        } else if (permission === 'denied') {
          toast({
            title: "Permission Denied",
            description: "Please enable notifications in your browser settings to receive alerts.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Permission Required",
            description: "Notification permission is needed to send you trade alerts.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Push notification error:', error);
        toast({
          title: "Notification Setup Failed",
          description: "There was an error setting up push notifications. Please try again or check your browser settings.",
          variant: "destructive"
        });
      }
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // === Fetch data from Binance ===
  const fetchData = useCallback(async (retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds
    
    console.log(`📊 Fetching data for ${symbol} at ${interval} interval... (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
    setLoading(true);
    try {
      const response = await fetch(`/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=1000`);
      if (!response.ok) throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
      
      const rawData = await response.json();
      const bars: Bar[] = rawData.map((d: any) => ({
        time: Math.floor(d[0] / 1000),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
      
      console.log(`✅ Fetched ${bars.length} bars for ${symbol}`);
      setData(bars);
    } catch (error) {
      console.error('Failed to fetch candle data:', error);
      
      // Retry logic
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 Retrying in ${RETRY_DELAY / 1000} seconds...`);
        setTimeout(() => {
          fetchData(retryCount + 1);
        }, RETRY_DELAY);
        return; // Don't set loading false yet
      }
      
      // Final failure - show toast to user
      toast({
        title: "Failed to load chart data",
        description: "Unable to fetch candle data. Please refresh the page or try again later.",
        variant: "destructive"
      });
    } finally {
      if (retryCount >= MAX_RETRIES || retryCount === 0) {
        // Only set loading false if this is the final attempt or first successful attempt
      }
      setLoading(false);
    }
  }, [symbol, interval, toast]);


  // Initial fetch (removed auto-refresh for cost control)
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Clear analysis data when symbol changes to prevent showing stale data from another ticker
  useEffect(() => {
    // Only clear if symbol actually changed (not on initial mount)
    if (prevSymbolRef.current !== null && prevSymbolRef.current !== symbol) {
      setTradeAlerts([]);
      setMultiTFInsights(null);
      setMarketInsights(null);
      setIndicatorData(null);
    }
    prevSymbolRef.current = symbol;
  }, [symbol]);

  // Helper function to calculate time ago string
  const getTimeAgoString = useCallback((dateString: string) => {
    const updatedAt = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - updatedAt.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
  }, []);

  // Check if cache is still valid (less than 1 hour old)
  const isCacheValid = useCallback((updatedAtString: string) => {
    const updatedAt = new Date(updatedAtString);
    const now = new Date();
    const diffMs = now.getTime() - updatedAt.getTime();
    const oneHourMs = 60 * 60 * 1000;
    return diffMs < oneHourMs;
  }, []);

  // Get remaining cache time in minutes
  const getRemainingCacheTime = useCallback((updatedAtString: string) => {
    const updatedAt = new Date(updatedAtString);
    const now = new Date();
    const diffMs = now.getTime() - updatedAt.getTime();
    const oneHourMs = 60 * 60 * 1000;
    const remainingMs = oneHourMs - diffMs;
    return Math.ceil(remainingMs / (1000 * 60));
  }, []);

  // Load cached analysis (no credit used) - allows viewing previous analysis
  const loadCachedAnalysis = useCallback(async () => {
    // First try from already-loaded data
    if (cachedAnalysis?.cached) {
      // Clear Multi-TF insights when loading single-TF
      setMultiTFInsights(null);
      setTradeAlerts(cachedAnalysis.cached.alerts || []);
      setMarketInsights(cachedAnalysis.cached.marketInsights || null);
      // Also restore indicatorData to show "Data Sent to Grok" section
      if (cachedAnalysis.cached.indicatorData) {
        setIndicatorData(cachedAnalysis.cached.indicatorData);
      }
      toast({
        title: "Previous analysis loaded",
        description: `Last updated: ${getTimeAgoString(cachedAnalysis.cached.updatedAt)}`,
        duration: 3000,
      });
      return;
    }
    
    // If data not in state yet, refetch it
    const result = await refetchCachedAnalysis();
    if (result.data?.cached) {
      setMultiTFInsights(null);
      setTradeAlerts(result.data.cached.alerts || []);
      setMarketInsights(result.data.cached.marketInsights || null);
      if (result.data.cached.indicatorData) {
        setIndicatorData(result.data.cached.indicatorData);
      }
      toast({
        title: "Previous analysis loaded",
        description: `Last updated: ${getTimeAgoString(result.data.cached.updatedAt)}`,
        duration: 3000,
      });
    }
  }, [cachedAnalysis, toast, getTimeAgoString, refetchCachedAnalysis]);

  // Load cached Multi-TF analysis
  const loadCachedMultiTF = useCallback(async () => {
    console.log('🔄 loadCachedMultiTF called, existing cachedMultiTF:', !!cachedMultiTF?.cached);
    
    try {
      // Always force a fresh fetch to ensure we have latest data
      const result = await refetchCachedMultiTF();
      console.log('🔄 refetch result:', !!result.data?.cached);
      
      const data = result.data || cachedMultiTF;
      
      if (data?.cached) {
        console.log('✅ Loading cached Multi-TF data:', {
          hasMultiTFInsights: !!data.cached.multiTFInsights,
          hasTradeAlerts: !!data.cached.tradeAlerts,
          tradeAlertsLength: data.cached.tradeAlerts?.length || 0,
          allKeys: Object.keys(data.cached)
        });
        // Clear single-TF insights when loading Multi-TF
        setMarketInsights(null);
        setMultiTFInsights(data.cached.multiTFInsights);
        // Set trade alerts from tradeAlerts (the correct field name)
        if (data.cached.tradeAlerts && data.cached.tradeAlerts.length > 0) {
          setTradeAlerts(data.cached.tradeAlerts);
        } else {
          console.log('⚠️ No tradeAlerts in cached Multi-TF data');
        }
        toast({
          title: "Previous Multi-TF analysis loaded",
          description: `Last updated: ${getTimeAgoString(data.cached.updatedAt)}`,
          duration: 3000,
        });
      } else {
        console.log('❌ No cached Multi-TF data found');
        toast({
          title: "No cached analysis",
          description: "Run Multi-TF analysis first to generate data",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Failed to load cached Multi-TF:', error);
      toast({
        title: "Failed to load",
        description: "Could not load cached analysis",
        variant: "destructive",
      });
    }
  }, [cachedMultiTF, toast, getTimeAgoString, refetchCachedMultiTF]);

  // === Analyze Trades with Grok API ===
  const analyzeTrades = useCallback(async () => {
    if (data.length === 0) return;
    
    // Check if we have a valid cache (less than 1 hour old)
    if (cachedAnalysis?.cached?.updatedAt) {
      const isValid = isCacheValid(cachedAnalysis.cached.updatedAt);
      
      if (isValid) {
        const updatedAt = new Date(cachedAnalysis.cached.updatedAt);
        const now = new Date();
        const diffMins = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60));
        const remainingMins = getRemainingCacheTime(cachedAnalysis.cached.updatedAt);
        
        // Clear Multi-TF insights when showing single-TF analysis
        setMultiTFInsights(null);
        // Show cached results and warning toast
        setTradeAlerts(cachedAnalysis.cached.alerts || []);
        setMarketInsights(cachedAnalysis.cached.marketInsights || null);
        // Also restore indicatorData for cached timeout path
        if (cachedAnalysis.cached.indicatorData) {
          setIndicatorData(cachedAnalysis.cached.indicatorData);
        }
        
        toast({
          title: "Analysis recently updated",
          description: `Analysis was updated ${diffMins} minute${diffMins !== 1 ? 's' : ''} ago. Please wait ${remainingMins} more minute${remainingMins !== 1 ? 's' : ''} before refreshing.`,
          duration: 5000,
        });
        return;
      }
    }
    
    setAnalyzing(true);
    try {
      const cvdData = calculateCVD(data);
      const { poc, vah, val, profile } = calculateVolumeProfile(data);
      const { bullishOB, bearishOB } = detectOrderBlocks(data);
      const { bullFVG, bearFVG } = detectFVG(data);
      const imbalances = detectImbalances(profile);
      const absorption = detectAbsorption(data, cvdData);
      const hiddenDivergences = detectHiddenDivergence(data, cvdData);
      const liquidityGrabs = detectLiquidityGrabs(data);
      const { swingHighs, swingLows } = detectSwingPivots(data, 5);
      
      const currentPrice = data[data.length - 1].close;
      const cvdCurrent = cvdData[cvdData.length - 1].value;
      const cvd20BarsAgo = cvdData[Math.max(0, cvdData.length - 20)].value;
      const cvdTrend = cvdCurrent > cvd20BarsAgo ? 'rising' : 'falling';

      // Calculate CCI and ADX values
      const cciData = calculateCCI(data.map(d => ({ ...d, volume: d.volume })), cciPeriod);
      const currentCCI = cciData.length > 0 ? cciData[cciData.length - 1].value : 0;
      
      const adxData = calculateADX(data.map(d => ({ ...d, volume: d.volume })), adxPeriod);
      const currentADX = adxData.length > 0 ? adxData[adxData.length - 1].adx : 0;
      const currentPlusDI = adxData.length > 0 ? adxData[adxData.length - 1].plusDI : 0;
      const currentMinusDI = adxData.length > 0 ? adxData[adxData.length - 1].minusDI : 0;

      // Calculate RSI, MACD, OBV, MFI for comprehensive analysis
      const rsiData = calculateRSI(data, rsiPeriod);
      const currentRSI = rsiData.length > 0 ? rsiData[rsiData.length - 1].value : 50;
      
      const macdData = calculateMACD(data, macdFast, macdSlow, macdSignal);
      const currentMACD = macdData.macd.length > 0 ? macdData.macd[macdData.macd.length - 1].value : 0;
      const currentMACDSignal = macdData.signal.length > 0 ? macdData.signal[macdData.signal.length - 1].value : 0;
      const currentMACDHistogram = macdData.histogram.length > 0 ? macdData.histogram[macdData.histogram.length - 1].value : 0;
      
      const obvData = calculateOBV(data);
      const currentOBV = obvData.length > 0 ? obvData[obvData.length - 1].value : 0;
      const obv20BarsAgo = obvData.length > 20 ? obvData[obvData.length - 20].value : currentOBV;
      const obvTrend = currentOBV > obv20BarsAgo ? 'rising' : 'falling';
      
      const mfiData = calculateMFI(data, mfiPeriod);
      const currentMFI = mfiData.length > 0 ? mfiData[mfiData.length - 1].value : 50;
      
      // Calculate ATR for volatility context
      const atrData = calculateATR(data, 14);
      const currentATR = atrData.length > 0 ? atrData[atrData.length - 1] : 0;
      
      // Calculate Stochastic
      const stochPeriod = 14;
      const stochData: { k: number; d: number }[] = [];
      for (let i = stochPeriod - 1; i < data.length; i++) {
        const slice = data.slice(i - stochPeriod + 1, i + 1);
        const highest = Math.max(...slice.map(b => b.high));
        const lowest = Math.min(...slice.map(b => b.low));
        const k = highest !== lowest ? ((data[i].close - lowest) / (highest - lowest)) * 100 : 50;
        stochData.push({ k, d: 0 });
      }
      // Calculate %D (3-period SMA of %K)
      for (let i = 2; i < stochData.length; i++) {
        stochData[i].d = (stochData[i].k + stochData[i-1].k + stochData[i-2].k) / 3;
      }
      const currentStochK = stochData.length > 0 ? stochData[stochData.length - 1].k : 50;
      const currentStochD = stochData.length > 0 ? stochData[stochData.length - 1].d : 50;
      
      // Calculate Bollinger Bands
      const bbPeriod = 20;
      const bbStdDev = 2;
      let bbMiddle = 0, bbUpper = 0, bbLower = 0, bbBandwidth = 0;
      if (data.length >= bbPeriod) {
        const closes = data.slice(-bbPeriod).map(d => d.close);
        bbMiddle = closes.reduce((a, b) => a + b, 0) / bbPeriod;
        const variance = closes.reduce((sum, c) => sum + Math.pow(c - bbMiddle, 2), 0) / bbPeriod;
        const stdDev = Math.sqrt(variance);
        bbUpper = bbMiddle + (stdDev * bbStdDev);
        bbLower = bbMiddle - (stdDev * bbStdDev);
        bbBandwidth = bbMiddle > 0 ? ((bbUpper - bbLower) / bbMiddle) * 100 : 0;
      }

      // Fetch professional orderflow data (OI, Funding, L/S Ratio) and liquidation data
      let orderflowData = null;
      let liquidationData = null;
      
      // Safe fetch helper
      const safeFetch = async (url: string) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      };

      if (tier === 'intermediate' || tier === 'pro' || tier === 'elite') {
        try {
          const [openInterest, fundingRate, longShortRatio, liquidations] = await Promise.all([
            safeFetch(`/api/crypto/orderflow/open-interest?symbol=${symbol}&interval=${alertTimeframe}`),
            safeFetch(`/api/crypto/orderflow/funding-rate?symbol=${symbol}`),
            safeFetch(`/api/crypto/orderflow/long-short-ratio?symbol=${symbol}&interval=${alertTimeframe}`),
            safeFetch(`/api/crypto/liquidations/grid?symbol=${symbol}`)
          ]);

          orderflowData = { openInterest, fundingRate, longShortRatio };
          
          // Extract key liquidation levels from grid data
          if (liquidations?.predictedColumn && liquidations?.minPrice && liquidations?.maxPrice) {
            const priceRange = liquidations.maxPrice - liquidations.minPrice;
            const numBands = liquidations.predictedColumn.length;
            const bandSize = priceRange / numBands;
            
            // Find top 5 liquidation clusters
            const clusters = liquidations.predictedColumn
              .map((vol: number, idx: number) => ({
                price: liquidations.minPrice + (idx * bandSize) + (bandSize / 2),
                volume: vol
              }))
              .filter((c: any) => c.volume > 0)
              .sort((a: any, b: any) => b.volume - a.volume)
              .slice(0, 5);
            
            liquidationData = {
              highestCluster: clusters[0] || null,
              topClusters: clusters,
              currentPricePosition: currentPrice > liquidations.minPrice + (priceRange / 2) ? 'upper_half' : 'lower_half'
            };
          }
        } catch (error) {
          console.warn('Failed to fetch orderflow/liquidation data:', error);
          orderflowData = { openInterest: null, fundingRate: null, longShortRatio: null };
        }
      }
      
      const token = await getToken();
      if (!token) {
        toast({
          title: "Authentication required",
          description: "Please sign in to use AI analysis.",
          duration: 5000,
        });
        return;
      }
      
      const response = await fetch('/api/crypto/order-flow-alerts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          symbol,
          interval: alertTimeframe,
          currentPrice,
          recentBars: data.slice(-100),
          cvd: cvdCurrent,
          cvdTrend,
          poc,
          vah,
          val,
          bullishOBCount: bullishOB.length,
          bearishOBCount: bearishOB.length,
          bullFVGCount: bullFVG.length,
          bearFVGCount: bearFVG.length,
          buyImbalancesCount: imbalances.filter(i => i.type === 'buy').length,
          sellImbalancesCount: imbalances.filter(i => i.type === 'sell').length,
          absorptionCount: absorption.length,
          hiddenDivergenceCount: hiddenDivergences.length,
          liquidityGrabCount: liquidityGrabs.length,
          bullishOB,
          bearishOB,
          bullFVG,
          bearFVG,
          buyImbalances: imbalances.filter(i => i.type === 'buy'),
          sellImbalances: imbalances.filter(i => i.type === 'sell'),
          absorption,
          hiddenDivergences,
          liquidityGrabs,
          swingHighs: swingHighs.slice(-100),
          swingLows: swingLows.slice(-100),
          orderflowData,
          liquidationData,
          cci: currentCCI,
          adx: currentADX,
          plusDI: currentPlusDI,
          minusDI: currentMinusDI,
          rsi: currentRSI,
          macd: currentMACD,
          macdSignal: currentMACDSignal,
          macdHistogram: currentMACDHistogram,
          obv: currentOBV,
          obvTrend,
          mfi: currentMFI,
          atr: currentATR,
          stochK: currentStochK,
          stochD: currentStochD,
          bbMiddle,
          bbUpper,
          bbLower,
          bbBandwidth,
        }),
      });
      
      const result = await response.json();
      
      // Handle credit limit error
      if (!response.ok) {
        if (result.error === 'No AI credits remaining') {
          toast({
            title: "No AI credits remaining",
            description: "You've used all your AI credits for this month. Credits reset on the 1st.",
            duration: 5000,
          });
          refetchSubscription(); // Refresh the counter
          return;
        }
        if (result.error === 'Subscription required') {
          toast({
            title: "Subscription required",
            description: "Please upgrade to Intermediate tier or higher for AI analysis.",
            duration: 5000,
          });
          return;
        }
        throw new Error(result.message || 'Failed to analyze trades');
      }
      
      const alerts = result.alerts || [];
      
      setTradeAlerts(alerts);
      
      // Refresh subscription data to update the counter
      refetchSubscription();
      // Refresh cached analysis to update timestamp
      refetchCachedAnalysis();
      
      // Store market insights for display - always show when available
      if (result.marketInsights) {
        setMarketInsights(result.marketInsights);
      } else {
        setMarketInsights(null);
      }
      
      // Store indicator data from backend for display
      if (result.indicatorData) {
        setIndicatorData(result.indicatorData);
      } else {
        setIndicatorData(null);
      }
    } catch (error) {
      console.error('Failed to analyze trades:', error);
      setTradeAlerts([]);
    } finally {
      setAnalyzing(false);
    }
  }, [data, symbol, interval, alertTimeframe, tier, calculateCVD, calculateVolumeProfile, detectOrderBlocks, detectFVG, detectImbalances, detectAbsorption, detectHiddenDivergence, detectLiquidityGrabs, detectSwingPivots, calculateRSI, calculateMACD, calculateOBV, calculateMFI, rsiPeriod, macdFast, macdSlow, macdSignal, mfiPeriod, cciPeriod, adxPeriod, refetchSubscription, refetchCachedAnalysis, toast, getToken, cachedAnalysis, isCacheValid, getRemainingCacheTime]);

  // === Multi-Timeframe Analysis (15m, 1h, 4h) - Elite only ===
  const analyzeMultiTF = useCallback(async () => {
    // Check if we have a valid cache (less than 1 hour old)
    if (cachedMultiTF?.cached?.updatedAt) {
      const isValid = isCacheValid(cachedMultiTF.cached.updatedAt);
      
      if (isValid) {
        const updatedAt = new Date(cachedMultiTF.cached.updatedAt);
        const now = new Date();
        const diffMins = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60));
        const remainingMins = getRemainingCacheTime(cachedMultiTF.cached.updatedAt);
        
        // Clear single-TF insights when showing Multi-TF analysis
        setMarketInsights(null);
        // Show cached results and warning toast
        setMultiTFInsights(cachedMultiTF.cached.multiTFInsights);
        if (cachedMultiTF.cached.tradeAlerts?.length > 0) {
          setTradeAlerts(cachedMultiTF.cached.tradeAlerts);
        }
        
        toast({
          title: "Multi-TF analysis recently updated",
          description: `Analysis was updated ${diffMins} minute${diffMins !== 1 ? 's' : ''} ago. Please wait ${remainingMins} more minute${remainingMins !== 1 ? 's' : ''} before refreshing.`,
          duration: 5000,
        });
        return;
      }
    }

    setAnalyzingMultiTF(true);
    try {
      const token = await getToken();
      if (!token) {
        toast({
          title: "Authentication required",
          description: "Please sign in to use AI analysis.",
          duration: 5000,
        });
        return;
      }

      const response = await fetch('/api/crypto/order-flow-alerts-multi-tf', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          symbol,
          timeframes: ['5m', '15m', '1h', '4h'],
        }),
      });

      const result = await response.json();
      console.log('🤖 Multi-TF Analysis received', result);

      if (!result.success && result.message) {
        if (result.requireUpgrade) {
          toast({
            title: "Elite Required",
            description: "Multi-TF Analysis is an Elite-only feature. Please upgrade to Elite tier.",
            duration: 5000,
          });
          return;
        }
        throw new Error(result.message || 'Failed to analyze');
      }

      // Store multi-TF insights
      if (result.multiTFInsights) {
        setMultiTFInsights(result.multiTFInsights);
      }
      
      // Also set trade alerts from best trades
      if (result.bestTrades?.length > 0) {
        setTradeAlerts(result.bestTrades);
      }
      
      // Set market insights from overall summary
      if (result.multiTFInsights?.overallSummary) {
        setMarketInsights({
          summary: result.multiTFInsights.overallSummary,
          bias: result.multiTFInsights['1h']?.bias || result.multiTFInsights['15m']?.bias || 'NEUTRAL',
        });
      }

      // Refresh subscription to update credits
      refetchSubscription();
      refetchCachedMultiTF();

      toast({
        title: "Multi-TF Analysis Complete",
        description: `Analyzed ${symbol} across 5m, 15m, 1h, and 4h timeframes`,
        duration: 5000,
      });
    } catch (error) {
      console.error('Failed to analyze multi-TF:', error);
      toast({
        title: "Analysis Failed",
        description: "Unable to complete multi-timeframe analysis",
        variant: "destructive",
      });
    } finally {
      setAnalyzingMultiTF(false);
    }
  }, [symbol, getToken, toast, refetchSubscription, refetchCachedMultiTF, cachedMultiTF, isCacheValid, getRemainingCacheTime]);

  // Keep ref in sync with latest analyzeTrades callback
  useEffect(() => {
    analyzeTradesRef.current = analyzeTrades;
  }, [analyzeTrades]);

  // === Track Trade ===
  const trackTrade = async (alert: TradeAlert) => {
    if (!isAuthenticated) {
      toast({
        title: "Login Required",
        description: "Please login to track trades",
        variant: "destructive"
      });
      return;
    }

    const tradeKey = `${symbol}-${alert.direction}-${alert.entry}`;
    if (trackedTrades.includes(tradeKey)) {
      toast({
        title: "Already Tracked",
        description: "This trade is already being tracked",
      });
      return;
    }

    setTrackingTradeId(tradeKey);
    try {
      const token = await getToken();
      if (!token) {
        toast({
          title: "Authentication required",
          description: "Please sign in to track trades.",
        });
        return;
      }
      
      // Strip dollar signs from price values if present, handle both string and number inputs
      const parsePrice = (val: string | number): number => {
        if (typeof val === 'number') return val;
        return parseFloat(String(val).replace(/[$,]/g, ''));
      };
      
      const response = await fetch('/api/crypto/tracked-trades', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          symbol,
          direction: alert.direction,
          grade: alert.grade,
          entry: parsePrice(alert.entry),
          stopLoss: parsePrice(alert.stopLoss),
          targets: (alert.targets || []).map((t: string | number) => parsePrice(t)),
          confluenceSignals: alert.confluenceSignals || [],
          reasoning: alert.reasoning || '',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Track trade error response:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to track trade');
      }

      const tracked = await response.json();
      setTrackedTrades(prev => [...prev, tradeKey]);
      
      // Refetch tracked trades to update chart
      refetchTrackedTrades();

      toast({
        title: "Trade Tracked! 🎯",
        description: "You'll receive notifications when entry, SL, or TP is hit",
      });
    } catch (error) {
      console.error('Failed to track trade:', error);
      toast({
        title: "Error",
        description: "Failed to track trade. Please try again.",
        variant: "destructive"
      });
    } finally {
      setTrackingTradeId(null);
    }
  };

  // === Chart Setup ===
  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // Cleanup existing chart
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (e) {
        // Chart already disposed, ignore
      }
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: { 
        background: { type: ColorType.Solid, color: '#0e0e0e' }, 
        textColor: '#d1d4dc' 
      },
      grid: { 
        vertLines: { color: '#2a2e39' }, 
        horzLines: { color: '#2a2e39' } 
      },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false },
    });

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, { 
      upColor: '#00c4b4', 
      downColor: '#ff5252',
      borderVisible: false,
      wickUpColor: '#00c4b4',
      wickDownColor: '#ff5252',
    });


    // Set data
    const candleData: CandlestickData[] = data.map(d => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candleSeries.setData(candleData);

    // Calculate CVD for stats
    const cvdData = calculateCVD(data);

    // Calculate Volume Profile from FULL dataset for accurate POC/VAH/VAL
    const { poc, vah, val, profile } = calculateVolumeProfile(data);
    
    // Draw POC/VAH/VAL as fixed horizontal price lines
    candleSeries.createPriceLine({
      price: poc,
      color: '#ffd700',
      lineWidth: 2,
      lineStyle: 2, // dashed
      axisLabelVisible: true,
      title: 'POC',
    });
    
    candleSeries.createPriceLine({
      price: vah,
      color: '#4caf50',
      lineWidth: 1,
      lineStyle: 2, // dashed
      axisLabelVisible: true,
      title: 'VAH',
    });
    
    candleSeries.createPriceLine({
      price: val,
      color: '#f44336',
      lineWidth: 1,
      lineStyle: 2, // dashed
      axisLabelVisible: true,
      title: 'VAL',
    });

    // Draw Tracked Trade Lines - only show selected trade
    if (trackedTradesData && trackedTradesData.length > 0 && selectedTrackedTradeId !== null) {
      const selectedTrade = trackedTradesData.find((t: any) => t.id === selectedTrackedTradeId);
      if (selectedTrade) {
        const trade = selectedTrade;
        // Only show pending trades or trades that hit entry
        if (trade.status === 'pending' || trade.status === 'entry_hit') {
          // Convert string prices to numbers (database stores as text/decimal)
          const entryPrice = Number(trade.entry);
          const slPrice = Number(trade.stopLoss);
          
          // Entry Line (Cyan)
          if (!isNaN(entryPrice)) {
            candleSeries.createPriceLine({
              price: entryPrice,
              color: '#00c4b4',
              lineWidth: 2,
              lineStyle: 0, // solid
              axisLabelVisible: true,
              title: `${trade.direction} Entry`,
            });
          }

          // Stop Loss Line (Red)
          if (!isNaN(slPrice)) {
            candleSeries.createPriceLine({
              price: slPrice,
              color: '#ff5252',
              lineWidth: 2,
              lineStyle: 0, // solid
              axisLabelVisible: true,
              title: 'SL',
            });
          }

          // Target Lines (Green shades)
          trade.targets.forEach((target: any, idx: number) => {
            const tpPrice = Number(target);
            if (!isNaN(tpPrice)) {
              candleSeries.createPriceLine({
                price: tpPrice,
                color: idx === 0 ? '#4caf50' : idx === 1 ? '#66bb6a' : '#81c784',
                lineWidth: 2,
                lineStyle: 0, // solid
                axisLabelVisible: true,
                title: `TP${idx + 1}`,
              });
            }
          });
        }
      }
    }

    // Detect Order Blocks
    const { bullishOB, bearishOB } = detectOrderBlocks(data);
    
    // Detect FVG
    const { bullFVG, bearFVG } = detectFVG(data);
    
    // Detect Volume Imbalances
    const imbalances = detectImbalances(profile);
    const buyImbalances = imbalances.filter(i => i.type === 'buy');
    const sellImbalances = imbalances.filter(i => i.type === 'sell');
    
    // Detect Absorption
    const absorption = detectAbsorption(data, cvdData);
    
    // Detect Hidden Divergences
    const hiddenDivergences = detectHiddenDivergence(data, cvdData);
    
    // Detect Liquidity Grabs
    const liquidityGrabs = detectLiquidityGrabs(data);
    
    // Detect Swing Points
    const { swingHighs, swingLows } = detectSwingPivots(data, 5);
    
    // === Grok's Indicators Overlay ===
    if (showGrokIndicators) {
      // Bollinger Bands (purple tones)
      const bb = calculateBollingerBands(data, 20, 2);
      if (bb.upper.length > 0) {
        const bbUpperSeries = chart.addSeries(LineSeries, { 
          color: '#9333ea', 
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        bbUpperSeries.setData(bb.upper.map(d => ({ time: d.time as Time, value: d.value })));
        
        const bbMiddleSeries = chart.addSeries(LineSeries, { 
          color: '#a855f7', 
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        bbMiddleSeries.setData(bb.middle.map(d => ({ time: d.time as Time, value: d.value })));
        
        const bbLowerSeries = chart.addSeries(LineSeries, { 
          color: '#9333ea', 
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        bbLowerSeries.setData(bb.lower.map(d => ({ time: d.time as Time, value: d.value })));
      }
      
      // VWAP (orange line)
      const vwapData = calculateVWAP(data);
      if (vwapData.length > 0) {
        const vwapSeries = chart.addSeries(LineSeries, { 
          color: '#f97316', 
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        });
        vwapSeries.setData(vwapData.map(d => ({ time: d.time as Time, value: d.value })));
      }
      
      // Order Blocks as price lines (last 3 of each)
      const recentBullOB = bullishOB.slice(-3);
      const recentBearOB = bearishOB.slice(-3);
      
      recentBullOB.forEach((ob, idx) => {
        candleSeries.createPriceLine({
          price: ob.price,
          color: '#22c55e80',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: false,
          title: '',
        });
      });
      
      recentBearOB.forEach((ob, idx) => {
        candleSeries.createPriceLine({
          price: ob.price,
          color: '#ef444480',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: false,
          title: '',
        });
      });
      
      // FVG zones as price lines (last 3 of each)
      const recentBullFVG = bullFVG.slice(-3);
      const recentBearFVG = bearFVG.slice(-3);
      
      recentBullFVG.forEach((fvg) => {
        candleSeries.createPriceLine({
          price: (fvg.high + fvg.low) / 2,
          color: '#22c55e50',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: '',
        });
      });
      
      recentBearFVG.forEach((fvg) => {
        candleSeries.createPriceLine({
          price: (fvg.high + fvg.low) / 2,
          color: '#ef444450',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: '',
        });
      });
      
      // Swing Points as price lines (last 5 of each)
      swingHighs.slice(-5).forEach((sh) => {
        candleSeries.createPriceLine({
          price: sh.price,
          color: '#ef444460',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: '',
        });
      });
      
      swingLows.slice(-5).forEach((sl) => {
        candleSeries.createPriceLine({
          price: sl.price,
          color: '#22c55e60',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: '',
        });
      });
    }
    
    // Update stats
    setStats({
      cvd: cvdData[cvdData.length - 1]?.value || 0,
      poc,
      vah,
      val,
      bullishOB: bullishOB.length,
      bearishOB: bearishOB.length,
      bullFVG: bullFVG.length,
      bearFVG: bearFVG.length,
      buyImbalances: buyImbalances.length,
      sellImbalances: sellImbalances.length,
      absorptionEvents: absorption.length,
      hiddenDivergences: hiddenDivergences.length,
      liquidityGrabs: liquidityGrabs.length,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        chart.remove();
      } catch (e) {
        // Chart already disposed, ignore
      }
    };
  }, [data, trackedTradesData, selectedTrackedTradeId, showGrokIndicators, calculateCVD, calculateVolumeProfile, detectOrderBlocks, detectFVG, detectImbalances, detectAbsorption, detectHiddenDivergence, detectLiquidityGrabs, detectSwingPivots, calculateBollingerBands, calculateVWAP]);

  // === Resize chart when switching to chart tab ===
  useEffect(() => {
    if (activeTab === 'chart' && chartContainerRef.current && chartRef.current) {
      // Small delay to ensure tab content is visible
      setTimeout(() => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ 
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight
          });
          chartRef.current.timeScale().fitContent();
        }
      }, 100);
    }
  }, [activeTab]);

  // === Volume Chart ===
  useEffect(() => {
    if (!volumeChartRef.current || data.length === 0) return;
    
    const chart = createChart(volumeChartRef.current, { 
      width: volumeChartRef.current.clientWidth, 
      height: 150, 
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
    
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
    });
    
    volumeSeries.setData(data.map(d => ({
      time: d.time as Time,
      value: d.volume,
      color: d.close >= d.open ? '#22c55e80' : '#ef444480'
    })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } });
    
    return () => chart.remove();
  }, [data, volumeOpen]);

  // === CVD Chart ===
  useEffect(() => {
    if (!cvdChartRef.current || data.length === 0) return;
    
    const chart = createChart(cvdChartRef.current, { 
      width: cvdChartRef.current.clientWidth, 
      height: 150, 
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
    
    // Calculate CVD approximation based on candle direction
    // Bullish candles (close >= open) = buy volume, Bearish = sell volume
    let cvd = 0;
    const cvdData = data.map(d => {
      const delta = d.close >= d.open ? d.volume : -d.volume;
      cvd += delta;
      return { time: d.time as Time, value: cvd };
    });
    
    // Filter out any NaN values just in case
    const validCvdData = cvdData.filter(d => !isNaN(d.value) && isFinite(d.value));
    
    if (validCvdData.length > 0) {
      const cvdSeries = chart.addSeries(LineSeries, { 
        color: '#3b82f6', 
        lineWidth: 2 
      });
      cvdSeries.setData(validCvdData);
      
      chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    }
    
    return () => chart.remove();
  }, [data, cvdOpen]);

  // === RSI Chart ===
  useEffect(() => {
    if (!rsiRef.current || data.length === 0) return;
    
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
    line.setData(calculateRSI(data, rsiPeriod).map(d => ({ time: d.time as Time, value: d.value })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 70 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 30 })));
    
    return () => chart.remove();
  }, [data, rsiPeriod, calculateRSI, rsiOpen]);

  // === MACD Chart ===
  useEffect(() => {
    if (!macdRef.current || data.length === 0) return;
    
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
    
    const { macd, signal, histogram } = calculateMACD(data, macdFast, macdSlow, macdSignal);
    const validHistogram = histogram.filter(h => h !== undefined && h !== null);
    chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2 }).setData(macd.map(d => ({ time: d.time as Time, value: d.value })));
    chart.addSeries(LineSeries, { color: '#ef5350', lineWidth: 2 }).setData(signal.map(d => ({ time: d.time as Time, value: d.value })));
    chart.addSeries(HistogramSeries, { color: '#26a69a' }).setData(validHistogram.map(d => ({ time: d.time as Time, value: d.value, color: d.color })));
    
    return () => chart.remove();
  }, [data, macdFast, macdSlow, macdSignal, calculateMACD, macdOpen]);

  // === OBV Chart ===
  useEffect(() => {
    if (!obvRef.current || data.length === 0) return;
    
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
    
    chart.addSeries(LineSeries, { color: '#9580ff', lineWidth: 2 }).setData(calculateOBV(data).map(d => ({ time: d.time as Time, value: d.value })));
    
    return () => chart.remove();
  }, [data, calculateOBV, obvOpen]);

  // === MFI Chart ===
  useEffect(() => {
    if (!mfiRef.current || data.length === 0) return;
    
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
    line.setData(calculateMFI(data, mfiPeriod).map(d => ({ time: d.time as Time, value: d.value })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (80/20 for MFI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 80 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 20 })));
    
    return () => chart.remove();
  }, [data, mfiPeriod, calculateMFI, mfiOpen]);

  // === CCI Chart ===
  useEffect(() => {
    if (!cciRef.current || data.length === 0) return;
    
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
    line.setData(calculateCCI(data.map(d => ({ ...d, volume: d.volume })), cciPeriod).map(d => ({ time: d.time as Time, value: d.value })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (+100/-100 for CCI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 100 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: -100 })));
    chart.addSeries(LineSeries, { color: '#444', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 0 })));
    
    return () => chart.remove();
  }, [data, cciPeriod, cciOpen]);

  // === ADX Chart ===
  useEffect(() => {
    if (!adxRef.current || data.length === 0) return;
    
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
    
    const adxData = calculateADX(data.map(d => ({ ...d, volume: d.volume })), adxPeriod);
    
    // Add ADX line (green)
    const adxLine = chart.addSeries(LineSeries, { color: '#4ade80', lineWidth: 2 });
    adxLine.setData(adxData.map(d => ({ time: d.time as Time, value: d.adx })));
    
    // Add +DI line (blue)
    const plusDILine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 });
    plusDILine.setData(adxData.map(d => ({ time: d.time as Time, value: d.plusDI })));
    
    // Add -DI line (red)
    const minusDILine = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 2 });
    minusDILine.setData(adxData.map(d => ({ time: d.time as Time, value: d.minusDI })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add level 25 line
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 25 })));
    
    return () => chart.remove();
  }, [data, adxPeriod, adxOpen]);

  // === Stochastic Chart ===
  useEffect(() => {
    if (!stochRef.current || data.length === 0 || !stochOpen) return;
    
    const chart = createChart(stochRef.current, { 
      width: stochRef.current.clientWidth, 
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
    
    const stochData = calculateStochastic(data, 14, 3);
    
    // %K line (blue)
    const kLine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 });
    kLine.setData(stochData.k.map(d => ({ time: d.time as Time, value: d.value })));
    
    // %D line (orange)
    const dLine = chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 2 });
    dLine.setData(stochData.d.map(d => ({ time: d.time as Time, value: d.value })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (80/20)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 80 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 20 })));
    
    return () => chart.remove();
  }, [data, calculateStochastic, stochOpen]);

  // === CMF Chart ===
  useEffect(() => {
    if (!cmfRef.current || data.length === 0 || !cmfOpen) return;
    
    const chart = createChart(cmfRef.current, { 
      width: cmfRef.current.clientWidth, 
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
    
    const cmfData = calculateCMF(data, 20);
    
    // CMF line (cyan/teal)
    const cmfLine = chart.addSeries(LineSeries, { color: '#14b8a6', lineWidth: 2 });
    cmfLine.setData(cmfData.map(d => ({ time: d.time as Time, value: d.value })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add zero line
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 0 })));
    
    return () => chart.remove();
  }, [data, calculateCMF, cmfOpen]);

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A+': return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-extrabold';
      case 'A': return 'bg-emerald-500 text-black';
      case 'B': return 'bg-blue-500 text-white';
      case 'C': return 'bg-yellow-500 text-black';
      case 'D': return 'bg-orange-500 text-white';
      case 'E': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getRRColor = (ratio: number) => {
    if (ratio < 1.0) {
      return {
        bg: 'bg-[#ff5252]/20',
        border: 'border-[#ff5252]',
        text: 'text-[#ff5252]'
      };
    } else if (ratio >= 2.0) {
      return {
        bg: 'bg-[#4caf50]/20',
        border: 'border-[#4caf50]',
        text: 'text-[#4caf50]'
      };
    } else {
      const t = (ratio - 1.0) / 1.0;
      const r = Math.round(255 - (255 - 76) * t);
      const g = Math.round(82 + (175 - 82) * t);
      const b = Math.round(82 + (80 - 82) * t);
      const color = `rgb(${r}, ${g}, ${b})`;
      return {
        bg: `bg-[${color}]/20`,
        border: `border-[${color}]`,
        text: `text-[${color}]`,
        style: { 
          backgroundColor: `${color}33`,
          borderColor: color,
          color: color
        }
      };
    }
  };

  const toggleTickerSelection = (ticker: string) => {
    setSelectedTickers(prev => {
      if (prev.includes(ticker)) {
        return prev.filter(t => t !== ticker);
      } else if (prev.length < 3) {
        return [...prev, ticker];
      }
      return prev; // Max 3 tickers
    });
  };

  const toggleGradeSelection = (grade: string) => {
    setSelectedGrades(prev => {
      if (prev.includes(grade)) {
        return prev.filter(g => g !== grade);
      } else {
        return [...prev, grade];
      }
    });
  };

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch('/api/crypto/subscription', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.selectedTickers) {
            setSelectedTickers(data.selectedTickers);
          }
          if (data.alertGrades) {
            setSelectedGrades(data.alertGrades);
          }
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    };

    loadPreferences();
  }, []);

  // Save preferences to backend
  const savePreferences = async () => {
    setSavingPreferences(true);
    try {
      const response = await fetch('/api/crypto/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          selectedTickers,
          alertGrades: selectedGrades
        })
      });

      if (response.ok) {
        console.log('✅ Preferences saved successfully');
      } else {
        console.error('Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setSavingPreferences(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const returnUrl = encodeURIComponent('/cryptoai');
      setLocation(`/cryptologin?returnTo=${returnUrl}`);
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
        <title>AI Trade Alerts - Grok-Powered Crypto Analysis | BearTec</title>
        <meta name="description" content="AI-powered cryptocurrency trade alerts using Grok analysis. Professional orderflow signals, CVD confluence, institutional positioning, and graded trade setups (A+ to E). Real-time alerts for BTC, ETH, XRP." />
        <meta property="og:title" content="AI Trade Alerts - Grok-Powered Crypto Analysis" />
        <meta property="og:description" content="AI-powered crypto trade alerts with Grok analysis. Institutional orderflow, CVD confluence, graded setups." />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="min-h-screen bg-[#0e0e0e] text-white p-6 pb-20">
        <div className="max-w-[1800px] mx-auto space-y-6">
          {/* BearTec Logo - Top Center */}
        <div className="flex justify-center mb-8">
          <img 
            src={bearTecLogoNew} 
            alt="BearTec Logo" 
            className="h-[140px] w-auto object-contain"
          />
        </div>

        {/* Back Button */}
        <Link href="/cryptoindicators">
          <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Indicators
          </Button>
        </Link>

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 lg:w-8 lg:h-8 text-[#00c4b4]" />
              AI-Powered Order Flow Analysis
            </h1>
            <p className="text-gray-400 mt-1 text-sm lg:text-base">
              Real CVD • Volume Profile • POC/VAH/VAL • Order Blocks • Oscillator Suite • AI Trade Alerts
            </p>
            <div className="flex flex-wrap items-center gap-3 lg:gap-4 mt-2">
              <div className="text-sm">
                <span className="text-gray-400">Tier: </span>
                <span className="font-semibold capitalize text-[#00c4b4]" data-testid="text-tier">{tier}</span>
              </div>
              {subscription?.monthlyUsage && (tier === 'intermediate' || tier === 'pro' || tier === 'elite') && (
                <div className="text-sm">
                  <span className="text-gray-400">AI Credits: </span>
                  <span className="font-semibold text-white" data-testid="text-ai-credits">
                    {subscription.monthlyUsage.aiCredits} of {subscription.monthlyUsage.aiLimit} remaining
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
            <div className="flex gap-2 w-full sm:w-auto">
              <FavoritesOnlySelector 
                value={symbol} 
                onChange={(val) => { incrementTickerClick(val); setSymbol(val); }}
              />

              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger className="w-[100px] bg-[#1a1a1a] border-[#2a2e39]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map(i => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <Button 
                onClick={() => fetchData()} 
                disabled={loading}
                className="flex-1 sm:flex-none bg-[#00c4b4] hover:bg-[#00a89c] text-black"
                data-testid="button-refresh"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh Data</span>
                <span className="sm:hidden">Refresh</span>
              </Button>

              <Button
                onClick={toggleNotifications}
                className={`flex-1 sm:flex-none ${
                  notificationsEnabled 
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700' 
                    : 'bg-gray-700 hover:bg-gray-600'
                } text-white`}
                data-testid="button-toggle-notifications"
              >
                <Zap className={`w-4 h-4 mr-2 ${notificationsEnabled ? 'text-yellow-300' : ''}`} />
                <span className="hidden sm:inline">{notificationsEnabled ? 'Alerts ON' : 'Enable Alerts'}</span>
                <span className="sm:hidden">Alerts</span>
              </Button>

              <Button
                onClick={() => setShowSettings(!showSettings)}
                className="bg-[#1a1a1a] hover:bg-[#2a2e39] text-white border border-[#2a2e39]"
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Alert Settings Panel */}
        {showSettings && (
          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-6">
            <h3 className="text-xl font-bold text-white mb-4">Settings</h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Ticker Selection */}
              <div>
                <div className="text-gray-400 mb-2">Select Tickers (Max 3)</div>
                <div className="flex flex-wrap gap-2">
                  {getFavorites().map(t => (
                    <Button
                      key={t.value}
                      onClick={() => toggleTickerSelection(t.value)}
                      className={`${
                        selectedTickers.includes(t.value)
                          ? 'bg-[#00c4b4] text-black hover:bg-[#00a89c]'
                          : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
                      }`}
                      disabled={!selectedTickers.includes(t.value) && selectedTickers.length >= 3}
                      data-testid={`ticker-${t.value}`}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {selectedTickers.length}/3 selected
                </p>
              </div>

              {/* Grade Selection */}
              <div>
                <div className="text-gray-400 mb-2">Alert Grades</div>
                <div className="space-y-2">
                  {['A+', 'A', 'B', 'C', 'D', 'E'].map(grade => (
                    <div key={grade} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedGrades.includes(grade)}
                        onCheckedChange={() => toggleGradeSelection(grade)}
                        data-testid={`grade-${grade}`}
                      />
                      <span className={`px-2 py-1 rounded text-sm font-semibold ${getGradeColor(grade)}`}>
                        {grade}
                      </span>
                      <span className="text-gray-400 text-sm">
                        {grade === 'A+' ? '7-9 signals' : 
                         grade === 'A' ? '6 signals' :
                         grade === 'B' ? '5 signals' :
                         grade === 'C' ? '3-4 signals' :
                         grade === 'D' ? '2 signals' : '≤1 signal'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeframe Selection */}
              <div>
                <div className="text-gray-400 mb-2">AI Analysis Timeframe</div>
                <div className="space-y-2">
                  {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
                    <Button
                      key={tf}
                      onClick={() => setAlertTimeframe(tf)}
                      className={`w-full ${
                        alertTimeframe === tf
                          ? 'bg-[#00c4b4] text-black hover:bg-[#00a89c]'
                          : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
                      }`}
                      data-testid={`timeframe-${tf}`}
                    >
                      {tf}
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Alerts will analyze {alertTimeframe} charts
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[#2a2e39] flex items-center justify-between">
              <p className="text-sm text-gray-400">
                You'll receive push notifications for selected tickers and grades only. 
                Helps reduce noise and focus on your best setups.
              </p>
              <Button
                onClick={savePreferences}
                disabled={savingPreferences}
                className="bg-[#00c4b4] hover:bg-[#00a89c] text-black font-semibold"
                data-testid="button-save-preferences"
              >
                {savingPreferences ? 'Saving...' : 'Save Preferences'}
              </Button>
            </div>
          </Card>
        )}

        {/* Collapsible Data Boxes Section */}
        <Collapsible open={dataBoxesOpen} onOpenChange={setDataBoxesOpen}>
          <Card className="bg-[#1a1a1a] border-[#2a2e39]">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-[#2a2e39]/50 transition-colors py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-sm">Market Data Summary</CardTitle>
                  {dataBoxesOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                {/* Row 1: Core Volume Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Real CVD</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#ffa726]">
                      {stats.cvd.toFixed(0)}
                    </div>
                  </Card>
                  
                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">POC</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#ffd700]">
                      {stats.poc.toFixed(4)}
                    </div>
                  </Card>

                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">VAH</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#4caf50]">
                      {stats.vah.toFixed(4)}
                    </div>
                  </Card>

                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">VAL</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#f44336]">
                      {stats.val.toFixed(4)}
                    </div>
                  </Card>
                </div>

                {/* Row 2: Order Blocks & Fair Value Gaps */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Bullish Order Blocks</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#00ff9d]">
                      {stats.bullishOB}
                    </div>
                  </Card>

                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Bearish Order Blocks</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#ff3b69]">
                      {stats.bearishOB}
                    </div>
                  </Card>

                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Bullish FVG</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#26a69a]">
                      {stats.bullFVG}
                    </div>
                  </Card>
                  
                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Bearish FVG</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#ef5350]">
                      {stats.bearFVG}
                    </div>
                  </Card>
                </div>

                {/* Row 3: Advanced Confluence Signals */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4">
                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Buy Imbalances</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#00ff9d]">
                      {stats.buyImbalances}
                    </div>
                  </Card>

                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Sell Imbalances</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#ff3b69]">
                      {stats.sellImbalances}
                    </div>
                  </Card>

                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Absorption Events</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#00c4b4]">
                      {stats.absorptionEvents}
                    </div>
                  </Card>

                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Hidden Divergences</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#9c27b0]">
                      {stats.hiddenDivergences}
                    </div>
                  </Card>

                  <Card className="bg-[#0d0d0d] border-[#2a2e39] p-2 sm:p-4 text-center">
                    <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Liquidity Grabs</div>
                    <div className="text-lg sm:text-2xl font-bold text-[#ff9800]">
                      {stats.liquidityGrabs}
                    </div>
                  </Card>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Tabs for Chart and Alerts */}
        <div className="w-full">
          <div className="bg-[#1a1a1a] border-[#2a2e39] rounded-md p-1 flex gap-1">
            <button
              onClick={() => setActiveTab('chart')}
              className={`flex-1 px-3 py-2 rounded-sm transition-colors ${
                activeTab === 'chart' 
                  ? 'bg-[#00c4b4] text-black font-medium' 
                  : 'text-gray-400 hover:text-white'
              }`}
              role="tab"
              aria-selected={activeTab === 'chart'}
            >
              Chart View
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`flex-1 px-3 py-2 rounded-sm transition-colors flex items-center justify-center ${
                activeTab === 'alerts' 
                  ? 'bg-[#00c4b4] text-black font-medium' 
                  : 'text-gray-400 hover:text-white'
              }`}
              role="tab"
              aria-selected={activeTab === 'alerts'}
            >
              <Zap className="w-4 h-4 mr-2" />
              AI Trade Alerts
            </button>
          </div>

          {/* Always-rendered panels with CSS visibility toggle */}
          <div className="relative mt-4">
            {/* Chart View Panel */}
            <div className={`space-y-4 ${activeTab === 'chart' ? 'block' : 'hidden'}`}>
            {/* Chart */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39] p-4">
              {loading || data.length === 0 ? (
                <div className="w-full h-[350px] sm:h-[450px] lg:h-[600px] flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[#00c4b4]" />
                    <span className="text-sm text-gray-400">Loading chart data...</span>
                  </div>
                </div>
              ) : (
                <div 
                  ref={chartContainerRef} 
                  className="w-full h-[350px] sm:h-[450px] lg:h-[600px]"
                />
              )}
            </Card>

            {/* Grok Indicators Toggle */}
            <div className="flex items-center justify-between p-3 bg-[#1a1a1a] border border-[#2a2e39] rounded-lg">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-gray-300">Show Grok's Indicators</span>
                <span className="text-xs text-gray-500">(BB, VWAP, OB, FVG, Swings)</span>
              </div>
              <Switch
                checked={showGrokIndicators}
                onCheckedChange={setShowGrokIndicators}
                data-testid="toggle-grok-indicators"
              />
            </div>

            {/* Volume Chart */}
            <Collapsible open={volumeOpen} onOpenChange={setVolumeOpen}>
              <Card className="bg-slate-800 border-slate-700">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-sm">Volume</CardTitle>
                      {volumeOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    {loading || data.length === 0 ? (
                      <div className="w-full h-[150px] flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                          <span className="text-xs text-gray-500">Loading volume data...</span>
                        </div>
                      </div>
                    ) : (
                      <div ref={volumeChartRef} className="w-full h-[150px]" />
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* CVD Chart */}
            <Collapsible open={cvdOpen} onOpenChange={setCvdOpen}>
              <Card className="bg-slate-800 border-slate-700">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-sm">Cumulative Delta (CVD)</CardTitle>
                      {cvdOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    {loading || data.length === 0 ? (
                      <div className="w-full h-[150px] flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                          <span className="text-xs text-gray-500">Loading CVD data...</span>
                        </div>
                      </div>
                    ) : (
                      <div ref={cvdChartRef} className="w-full h-[150px]" />
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Oscillators Section */}
            <div className="grid grid-cols-1 gap-4">
              <Collapsible open={rsiOpen} onOpenChange={setRsiOpen}>
                <Card className="bg-slate-800 border-slate-700">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">RSI ({rsiPeriod})</CardTitle>
                        {rsiOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {loading || data.length === 0 ? (
                        <div className="w-full h-[200px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            <span className="text-xs text-gray-500">Loading RSI...</span>
                          </div>
                        </div>
                      ) : (
                        <div ref={rsiRef} className="w-full h-[200px]" />
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
              
              <Collapsible open={macdOpen} onOpenChange={setMacdOpen}>
                <Card className="bg-slate-800 border-slate-700">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">MACD ({macdFast},{macdSlow},{macdSignal})</CardTitle>
                        {macdOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {loading || data.length === 0 ? (
                        <div className="w-full h-[200px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            <span className="text-xs text-gray-500">Loading MACD...</span>
                          </div>
                        </div>
                      ) : (
                        <div ref={macdRef} className="w-full h-[200px]" />
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
              
              <Collapsible open={obvOpen} onOpenChange={setObvOpen}>
                <Card className="bg-slate-800 border-slate-700">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">On-Balance Volume</CardTitle>
                        {obvOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {loading || data.length === 0 ? (
                        <div className="w-full h-[200px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            <span className="text-xs text-gray-500">Loading OBV...</span>
                          </div>
                        </div>
                      ) : (
                        <div ref={obvRef} className="w-full h-[200px]" />
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
              
              <Collapsible open={mfiOpen} onOpenChange={setMfiOpen}>
                <Card className="bg-slate-800 border-slate-700">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">Money Flow Index ({mfiPeriod})</CardTitle>
                        {mfiOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {loading || data.length === 0 ? (
                        <div className="w-full h-[200px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            <span className="text-xs text-gray-500">Loading MFI...</span>
                          </div>
                        </div>
                      ) : (
                        <div ref={mfiRef} className="w-full h-[200px]" />
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
              
              <Collapsible open={cciOpen} onOpenChange={setCciOpen}>
                <Card className="bg-slate-800 border-slate-700">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">CCI ({cciPeriod})</CardTitle>
                        {cciOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {loading || data.length === 0 ? (
                        <div className="w-full h-[200px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            <span className="text-xs text-gray-500">Loading CCI...</span>
                          </div>
                        </div>
                      ) : (
                        <div ref={cciRef} className="w-full h-[200px]" />
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
              
              <Collapsible open={adxOpen} onOpenChange={setAdxOpen}>
                <Card className="bg-slate-800 border-slate-700">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">ADX ({adxPeriod})</CardTitle>
                        {adxOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {loading || data.length === 0 ? (
                        <div className="w-full h-[200px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            <span className="text-xs text-gray-500">Loading ADX...</span>
                          </div>
                        </div>
                      ) : (
                        <div ref={adxRef} className="w-full h-[200px]" />
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Stochastic Chart */}
              <Collapsible open={stochOpen} onOpenChange={setStochOpen}>
                <Card className="bg-slate-800 border-slate-700">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">Stochastic (14, 3)</CardTitle>
                        {stochOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {loading || data.length === 0 ? (
                        <div className="w-full h-[200px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            <span className="text-xs text-gray-500">Loading Stochastic...</span>
                          </div>
                        </div>
                      ) : (
                        <div ref={stochRef} className="w-full h-[200px]" />
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* CMF Chart */}
              <Collapsible open={cmfOpen} onOpenChange={setCmfOpen}>
                <Card className="bg-slate-800 border-slate-700">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">CMF (20)</CardTitle>
                        {cmfOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {loading || data.length === 0 ? (
                        <div className="w-full h-[200px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            <span className="text-xs text-gray-500">Loading CMF...</span>
                          </div>
                        </div>
                      ) : (
                        <div ref={cmfRef} className="w-full h-[200px]" />
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            </div>

            {/* AI Alerts Panel */}
            <div className={`space-y-4 ${activeTab === 'alerts' ? 'block' : 'hidden'}`}>
            {/* Analyze Buttons - Compact layout with small reload icons */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39] p-3">
              <div className="flex items-center justify-center gap-2">
                {/* Small reload icon for single timeframe - left side */}
                {cachedAnalysis?.cached && (tier === 'intermediate' || tier === 'pro' || tier === 'elite') && (
                  <Button
                    onClick={loadCachedAnalysis}
                    variant="outline"
                    size="icon"
                    className="border-[#2a2e39] text-gray-300 hover:bg-[#252525] hover:text-white h-9 w-9"
                    data-testid="button-view-last-analysis"
                    title="Load last single-TF analysis"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                )}
                
                {/* Analyze button - bigger */}
                <Button
                  onClick={() => (tier !== 'intermediate' && tier !== 'pro' && tier !== 'elite') ? setLocation('/cryptosubscribe') : analyzeTrades()}
                  disabled={analyzing || analyzingMultiTF || data.length === 0}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white disabled:opacity-50 px-4 py-2"
                  data-testid="button-analyze-trades"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Analyze
                    </>
                  )}
                </Button>
                
                {/* Multi-TF button - Elite only */}
                <Button
                  onClick={() => tier !== 'elite' ? setLocation('/cryptosubscribe') : analyzeMultiTF()}
                  disabled={analyzing || analyzingMultiTF}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white disabled:opacity-50 px-4 py-2"
                  data-testid="button-multi-tf-analysis"
                  title="Analyze 5m, 15m, 1h, 4h timeframes together"
                >
                  {analyzingMultiTF ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Multi-TF...
                    </>
                  ) : (
                    <>
                      <Layers className="w-4 h-4 mr-2" />
                      Multi-TF
                    </>
                  )}
                </Button>
                
                {/* Small reload icon for multi-TF - Elite only, always shown for elite users */}
                {tier === 'elite' && (
                  <Button
                    onClick={loadCachedMultiTF}
                    variant="outline"
                    size="icon"
                    className="border-[#2a2e39] text-gray-300 hover:bg-[#252525] hover:text-white h-9 w-9"
                    data-testid="button-view-last-multi-tf"
                    title="Load last Multi-TF analysis"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {/* Monthly Usage Counter */}
              {subscription?.monthlyUsage && subscription.monthlyUsage.aiLimit > 0 && (
                <div className="mt-3 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700">
                    <Zap className="w-3.5 h-3.5 text-[#00c4b4]" />
                    <span className="text-xs text-gray-300">
                      <span className="font-semibold text-white">{subscription.monthlyUsage.aiCredits}</span>
                      <span className="text-gray-500"> of {subscription.monthlyUsage.aiLimit}</span>
                      <span className="ml-1 text-gray-400">used this month</span>
                    </span>
                  </div>
                  {/* Cached analysis timestamps */}
                  {cachedAnalysis?.cached && (
                    <div className="text-xs text-gray-500">
                      Single-TF: {getTimeAgoString(cachedAnalysis.cached.updatedAt)}
                    </div>
                  )}
                  {cachedMultiTF?.cached && tier === 'elite' && (
                    <div className="text-xs text-gray-500">
                      Multi-TF: {getTimeAgoString(cachedMultiTF.cached.updatedAt)}
                    </div>
                  )}
                </div>
              )}
              {(tier === 'free' || tier === 'beginner') && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  <Link href="/cryptosubscribe" className="text-[#00c4b4] hover:underline">
                    Upgrade to Intermediate
                  </Link> for AI analysis
                </p>
              )}
            </Card>

            {/* AI Analysis Report - Shows when analysis is complete or market insights available */}
            {(tradeAlerts.length > 0 || marketInsights) && (
              <div className="space-y-3">
                {/* 1. AI Summary Report - Grok's Combined Analysis - HIDE if Multi-TF insights present */}
                {!multiTFInsights && (
                <Card className="bg-[#1a1a1a] border-[#2a2e39]">
                  <Collapsible open={aiSummaryOpen} onOpenChange={setAiSummaryOpen}>
                    <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-[#252525] transition-colors rounded-lg">
                      <div className="flex items-center gap-2">
                        <img src={grokLogo} alt="Grok" className="h-5 brightness-110" />
                        <h3 className="text-lg font-semibold text-white">AI Summary Report</h3>
                        <span className="text-xs text-gray-500 ml-2">Grok Analysis</span>
                      </div>
                      {aiSummaryOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 space-y-3">
                        {marketInsights?.summary ? (
                          <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39] space-y-3">
                            <p className="text-sm text-gray-300 leading-relaxed">{marketInsights.summary}</p>
                            {marketInsights.bias && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Market Bias:</span>
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                  marketInsights.bias === 'BULLISH' ? 'bg-green-500/20 text-green-400' :
                                  marketInsights.bias === 'BEARISH' ? 'bg-red-500/20 text-red-400' :
                                  'bg-gray-500/20 text-gray-400'
                                }`}>{marketInsights.bias}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39]">
                            <p className="text-sm text-gray-400">Click "Analyze" to generate AI market evaluation.</p>
                          </div>
                        )}
                        {marketInsights?.keyLevels && marketInsights.keyLevels.length > 0 && (
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-xs text-gray-500">Key Levels:</span>
                            {marketInsights.keyLevels.map((level: string, i: number) => (
                              <span key={i} className="px-2 py-1 bg-[#2a2e39] text-xs text-[#00c4b4] rounded">{level}</span>
                            ))}
                          </div>
                        )}
                        {marketInsights?.noTradesReason && tradeAlerts.length === 0 && (
                          <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-yellow-400">{marketInsights.noTradesReason}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
                )}

                {/* Multi-Timeframe Insights - Shows when multi-TF analysis is complete */}
                {multiTFInsights && (
                  <Card className="bg-[#1a1a1a] border-[#2a2e39]">
                    <Collapsible defaultOpen={true}>
                      <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-[#252525] transition-colors rounded-lg">
                        <div className="flex items-center gap-2">
                          <Layers className="w-5 h-5 text-emerald-400" />
                          <h3 className="text-lg font-semibold text-white">Multi-Timeframe Analysis</h3>
                          <span className="text-xs text-gray-500 ml-2">5m • 15m • 1h • 4h</span>
                        </div>
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 space-y-3">
                          {/* Per-TF Breakdown */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {(['5m', '15m', '1h', '4h'] as const).map((tf) => (
                              multiTFInsights[tf] && (
                                <div key={tf} className="bg-[#0e0e0e] p-3 rounded-lg border border-[#2a2e39]">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-emerald-400 uppercase">{tf}</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      multiTFInsights[tf]?.bias === 'BULLISH' ? 'bg-green-500/20 text-green-400' :
                                      multiTFInsights[tf]?.bias === 'BEARISH' ? 'bg-red-500/20 text-red-400' :
                                      'bg-gray-500/20 text-gray-400'
                                    }`}>{multiTFInsights[tf]?.bias}</span>
                                  </div>
                                  <p className="text-xs text-gray-300 leading-relaxed">{multiTFInsights[tf]?.summary}</p>
                                  {multiTFInsights[tf]?.keyLevels?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {multiTFInsights[tf].keyLevels.map((level: string, i: number) => (
                                        <span key={i} className="px-1.5 py-0.5 bg-[#2a2e39] text-[10px] text-[#00c4b4] rounded">{level}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            ))}
                          </div>
                          {/* Overall Cross-TF Summary */}
                          {multiTFInsights.overallSummary && (
                            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-lg">
                              <div className="flex items-start gap-2">
                                <Target className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <span className="text-xs font-semibold text-emerald-400">Cross-TF Confluence</span>
                                  <p className="text-xs text-emerald-300 mt-1">{multiTFInsights.overallSummary}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                )}

                {/* Data Sent to Grok - All Indicators */}
                {indicatorData && (
                  <Card className="bg-[#1a1a1a] border-[#2a2e39]">
                    <Collapsible open={indicatorDataOpen} onOpenChange={setIndicatorDataOpen}>
                      <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-[#252525] transition-colors rounded-lg">
                        <div className="flex items-center gap-2">
                          <img src={grokLogo} alt="Grok" className="h-4 brightness-110" />
                          <h3 className="text-lg font-semibold text-white">Data Sent to Grok</h3>
                          <span className="text-xs text-gray-500 ml-2">Complete Analysis Input</span>
                        </div>
                        {indicatorDataOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 space-y-4">
                          {/* Market Data Section */}
                          <div>
                            <h4 className="text-sm font-semibold text-[#00c4b4] mb-2">Market Data</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Price</div>
                                <div className="text-white font-semibold">${indicatorData.price?.toFixed(4)}</div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">50-bar Change</div>
                                <div className={indicatorData.priceChange > 0 ? 'text-green-400' : 'text-red-400'}>
                                  {indicatorData.priceChange > 0 ? '+' : ''}{indicatorData.priceChange?.toFixed(2)}%
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">POC</div>
                                <div className="text-white">${indicatorData.volumeProfile?.poc?.toFixed(4)}</div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">VAH / VAL</div>
                                <div className="text-white">${indicatorData.volumeProfile?.vah?.toFixed(4)} / ${indicatorData.volumeProfile?.val?.toFixed(4)}</div>
                              </div>
                            </div>
                          </div>

                          {/* Oscillators & Momentum */}
                          <div>
                            <h4 className="text-sm font-semibold text-[#00c4b4] mb-2">Oscillators & Momentum</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">RSI (14)</div>
                                <div className={indicatorData.rsi?.value > 70 ? 'text-red-400' : indicatorData.rsi?.value < 30 ? 'text-green-400' : 'text-white'}>
                                  {indicatorData.rsi?.value?.toFixed(1)} <span className="text-gray-500">({indicatorData.rsi?.label})</span>
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">MACD</div>
                                <div className={indicatorData.macd?.momentum === 'bullish' ? 'text-green-400' : 'text-red-400'}>
                                  {indicatorData.macd?.momentum} {indicatorData.macd?.crossover !== 'none' && `(${indicatorData.macd?.crossover})`}
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">CCI (20)</div>
                                <div className={indicatorData.cci?.value > 100 ? 'text-red-400' : indicatorData.cci?.value < -100 ? 'text-green-400' : 'text-white'}>
                                  {indicatorData.cci?.value?.toFixed(1)} <span className="text-gray-500">({indicatorData.cci?.label})</span>
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Stochastic</div>
                                <div className={indicatorData.stochastic?.k > 80 ? 'text-red-400' : indicatorData.stochastic?.k < 20 ? 'text-green-400' : 'text-white'}>
                                  %K {indicatorData.stochastic?.k?.toFixed(0)} / %D {indicatorData.stochastic?.d?.toFixed(0)}
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">MFI (14)</div>
                                <div className={indicatorData.mfi?.value > 80 ? 'text-red-400' : indicatorData.mfi?.value < 20 ? 'text-green-400' : 'text-white'}>
                                  {indicatorData.mfi?.value?.toFixed(1)} <span className="text-gray-500">({indicatorData.mfi?.label})</span>
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">CMF</div>
                                <div className={indicatorData.cmf?.value > 0 ? 'text-green-400' : 'text-red-400'}>
                                  {indicatorData.cmf?.value?.toFixed(3)} <span className="text-gray-500">({indicatorData.cmf?.label})</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Trend & Volatility */}
                          <div>
                            <h4 className="text-sm font-semibold text-[#00c4b4] mb-2">Trend & Volatility</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">ADX (14)</div>
                                <div className={indicatorData.adx?.value > 25 ? 'text-yellow-400' : 'text-gray-400'}>
                                  {indicatorData.adx?.value?.toFixed(1)} <span className="text-gray-500">({indicatorData.adx?.label})</span>
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">DI Direction</div>
                                <div className={indicatorData.diPlusMinus?.momentum === 'bullish' ? 'text-green-400' : 'text-red-400'}>
                                  +DI {indicatorData.diPlusMinus?.plusDI?.toFixed(1)} / -DI {indicatorData.diPlusMinus?.minusDI?.toFixed(1)}
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">ATR (14)</div>
                                <div className="text-white">{indicatorData.atr?.value?.toFixed(6)}</div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Bollinger</div>
                                <div className={indicatorData.bollingerBands?.squeeze ? 'text-yellow-400' : 'text-white'}>
                                  {indicatorData.bollingerBands?.squeeze ? 'SQUEEZE' : `BW ${(indicatorData.bollingerBands?.bandwidth * 100)?.toFixed(1)}%`}
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">VWAP</div>
                                <div className={indicatorData.vwap?.label === 'premium' ? 'text-red-400' : indicatorData.vwap?.label === 'discount' ? 'text-green-400' : 'text-white'}>
                                  ${indicatorData.vwap?.value?.toFixed(4)} <span className="text-gray-500">({indicatorData.vwap?.label})</span>
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">CVD</div>
                                <div className={indicatorData.cvd?.trend === 'rising' ? 'text-green-400' : 'text-red-400'}>
                                  {(indicatorData.cvd?.value / 1000)?.toFixed(1)}K <span className="text-gray-500">({indicatorData.cvd?.trend})</span>
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">OBV</div>
                                <div className={indicatorData.obv?.divergence !== 'none' ? 'text-yellow-400' : 'text-white'}>
                                  {(indicatorData.obv?.value / 1000000)?.toFixed(2)}M {indicatorData.obv?.divergence !== 'none' && `(${indicatorData.obv?.divergence})`}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* SMC/ICT Structure */}
                          <div>
                            <h4 className="text-sm font-semibold text-[#00c4b4] mb-2">SMC/ICT Structure</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">BOS</div>
                                <div className={indicatorData.bos === 'bullish' ? 'text-green-400' : indicatorData.bos === 'bearish' ? 'text-red-400' : 'text-gray-400'}>
                                  {indicatorData.bos || 'none'}
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">CHoCH</div>
                                <div className={indicatorData.choch === 'bullish' ? 'text-green-400' : indicatorData.choch === 'bearish' ? 'text-red-400' : 'text-gray-400'}>
                                  {indicatorData.choch || 'none'}
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Displacement</div>
                                <div className={indicatorData.displacement?.active ? (indicatorData.displacement?.direction === 'bullish' ? 'text-green-400' : 'text-red-400') : 'text-gray-400'}>
                                  {indicatorData.displacement?.active ? indicatorData.displacement?.direction : 'none'}
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Order Blocks</div>
                                <div className="text-white">
                                  <span className="text-green-400">{indicatorData.orderBlocks?.bullish}</span> / <span className="text-red-400">{indicatorData.orderBlocks?.bearish}</span>
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">FVGs</div>
                                <div className="text-white">
                                  <span className="text-green-400">{indicatorData.fvgs?.bullish}</span> / <span className="text-red-400">{indicatorData.fvgs?.bearish}</span>
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Liq Grabs</div>
                                <div className="text-yellow-400">{indicatorData.liquidityGrabs}</div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Hidden Div</div>
                                <div className="text-purple-400">{indicatorData.hiddenDivergences ?? 0}</div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Osc Div Flags</div>
                                <div className="text-white">
                                  {[
                                    indicatorData.oscillatorDivergences?.macd,
                                    indicatorData.oscillatorDivergences?.mfi,
                                    indicatorData.oscillatorDivergences?.obv,
                                  ]
                                    .filter((v: string | undefined) => v && v !== 'none')
                                    .join(', ') || 'none'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Institutional Sentiment */}
                          <div>
                            <h4 className="text-sm font-semibold text-[#00c4b4] mb-2">Institutional Sentiment</h4>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Open Interest</div>
                                <div className={indicatorData.openInterest?.trend === 'rising' ? 'text-green-400' : indicatorData.openInterest?.trend === 'falling' ? 'text-red-400' : 'text-white'}>
                                  {indicatorData.openInterest?.trend} ({indicatorData.openInterest?.delta > 0 ? '+' : ''}{indicatorData.openInterest?.delta?.toFixed(2)}%)
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">Funding Rate</div>
                                <div className={indicatorData.fundingRate?.value > 0 ? 'text-green-400' : indicatorData.fundingRate?.value < 0 ? 'text-red-400' : 'text-white'}>
                                  {indicatorData.fundingRate?.value?.toFixed(4)}% <span className="text-gray-500">({indicatorData.fundingRate?.bias})</span>
                                </div>
                              </div>
                              <div className="bg-[#0e0e0e] p-2 rounded border border-[#2a2e39]">
                                <div className="text-gray-500">L/S Ratio</div>
                                <div className={indicatorData.longShortRatio?.value > 1.2 ? 'text-green-400' : indicatorData.longShortRatio?.value < 0.8 ? 'text-red-400' : 'text-white'}>
                                  {indicatorData.longShortRatio?.value?.toFixed(2)} <span className="text-gray-500">({indicatorData.longShortRatio?.label})</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                )}

                {/* 3. Trade Ideas - Collapsible */}
                <Card className="bg-[#1a1a1a] border-[#2a2e39]">
                  <Collapsible open={tradeIdeasOpen} onOpenChange={setTradeIdeasOpen}>
                    <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-[#252525] transition-colors rounded-lg">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-[#00c4b4]" />
                        <h3 className="text-lg font-semibold text-white">Trade Ideas</h3>
                        <span className="text-xs bg-[#00c4b4]/20 text-[#00c4b4] px-2 py-0.5 rounded ml-2">{tradeAlerts.length} setup{tradeAlerts.length !== 1 ? 's' : ''}</span>
                      </div>
                      {tradeIdeasOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 pb-4">
                        {tradeAlerts.length > 0 ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {tradeAlerts.map((alert, idx) => {
                              // Parse prices, stripping $ and other non-numeric chars
                              const parsePrice = (val: any): number => {
                                if (!val) return 0;
                                const str = String(val).replace(/[^0-9.-]/g, '');
                                return parseFloat(str) || 0;
                              };
                              const entry = parsePrice(alert.entry);
                              const stopLoss = parsePrice(alert.stopLoss);
                              const firstTarget = parsePrice(alert.targets?.[0]) || entry;
                              
                              const risk = Math.abs(alert.direction === 'LONG' ? entry - stopLoss : stopLoss - entry);
                              const reward = Math.abs(alert.direction === 'LONG' ? firstTarget - entry : entry - firstTarget);
                              const rrRatio = risk > 0 && reward > 0 ? (reward / risk).toFixed(1) : '0';
                              const rrRatioNum = parseFloat(rrRatio);
                              const rrColors = getRRColor(rrRatioNum);
                              
                              return (
                                <div key={idx} className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39] space-y-3">
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className={`px-3 py-1 rounded-lg font-bold ${getGradeColor(alert.grade)}`}>{alert.grade}</div>
                                      <div className={`text-lg font-bold ${alert.direction === 'LONG' ? 'text-[#00ff9d]' : 'text-[#ff3b69]'}`}>{alert.direction}</div>
                                    </div>
                                    <div className={`px-2 py-1 rounded text-xs ${rrColors.bg} ${rrColors.border}`} style={rrColors.style}>
                                      <span className={rrColors.text} style={rrColors.style ? { color: rrColors.style.color } : undefined}>{rrRatio}:1 R/R</span>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div><span className="text-gray-500">Entry:</span> <span className="text-[#00c4b4] font-semibold">{alert.entry}</span></div>
                                    <div><span className="text-gray-500">SL:</span> <span className="text-[#ff5252] font-semibold">{alert.stopLoss}</span></div>
                                    <div><span className="text-gray-500">TP:</span> <span className="text-[#4caf50] font-semibold">{alert.targets[0]}</span></div>
                                  </div>
                                  <div className="text-xs text-gray-400">{alert.reasoning}</div>
                                  <Button
                                    onClick={() => trackTrade(alert)}
                                    disabled={trackingTradeId === `${symbol}-${alert.direction}-${alert.entry}` || trackedTrades.includes(`${symbol}-${alert.direction}-${alert.entry}`)}
                                    className={`w-full text-sm ${trackedTrades.includes(`${symbol}-${alert.direction}-${alert.entry}`) ? 'bg-emerald-600' : 'bg-[#00c4b4]'}`}
                                    size="sm"
                                    data-testid={`track-trade-${idx}`}
                                  >
                                    {trackingTradeId === `${symbol}-${alert.direction}-${alert.entry}` ? 'Tracking...' : 
                                     trackedTrades.includes(`${symbol}-${alert.direction}-${alert.entry}`) ? '✓ Tracked' : 'Track Trade'}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center text-gray-500 py-4">
                            <p>No trade setups found. Try a different timeframe or wait for better market conditions.</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              </div>
            )}

            {/* Placeholder when no analysis yet */}
            {tradeAlerts.length === 0 && !marketInsights && !multiTFInsights && !analyzing && (
              <Card className="bg-[#1a1a1a] border-[#2a2e39] p-6 sm:p-12">
                <div className="text-center text-gray-400">
                  <Zap className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                  <p className="text-lg">Click "Analyze" to get AI-powered trade alerts</p>
                  <p className="text-sm mt-2">Grades A-E based on order flow confluence</p>
                </div>
              </Card>
            )}
            
            {/* Analyzing State */}
            {analyzing && (
              <Card className="bg-[#1a1a1a] border-[#2a2e39] p-6 sm:p-12">
                <div className="flex items-center justify-center gap-3 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Analyzing market structure and order flow...</span>
                </div>
              </Card>
            )}

            {/* Tracked Trades Summary Panel - Always visible */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39] mt-6" data-testid="tracked-trades-panel">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-[#00c4b4]" />
                      <h3 className="font-semibold text-white">Tracked Trades</h3>
                      <span className="text-xs bg-[#2a2e39] px-2 py-1 rounded text-gray-400">
                        {trackedTradesData?.length || 0} total
                      </span>
                    </div>
                    {/* Win/Loss Stats with Total P/L - Always show */}
                    {trackedTradesData && trackedTradesData.length > 0 && (() => {
                      const completed = trackedTradesData.filter(t => t.status === 'sl_hit' || t.status === 'tp_hit');
                      const inTrade = trackedTradesData.filter(t => t.status === 'entry_hit').length;
                      const wins = completed.filter(t => t.status === 'tp_hit').length;
                      const losses = completed.filter(t => t.status === 'sl_hit').length;
                      const winRate = completed.length > 0 ? ((wins / completed.length) * 100).toFixed(0) : '0';
                      
                      // Calculate total P/L for closed trades
                      const totalPL = completed.reduce((sum, trade) => {
                        const entry = parseFloat(trade.entry);
                        const exitPrice = trade.status === 'tp_hit' ? parseFloat(trade.targets[0]) : parseFloat(trade.stopLoss);
                        const pl = trade.direction === 'LONG' 
                          ? ((exitPrice - entry) / entry) * 100
                          : ((entry - exitPrice) / entry) * 100;
                        return sum + pl;
                      }, 0);
                      
                      return (
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="text-green-400 font-semibold">{wins}W</span>
                          <span className="text-red-400 font-semibold">{losses}L</span>
                          {inTrade > 0 && <span className="text-cyan-400 font-semibold">{inTrade} Active</span>}
                          {completed.length > 0 && (
                            <>
                              <div className={`px-2 py-1 rounded text-xs font-bold ${Number(winRate) >= 50 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {winRate}% WR
                              </div>
                              <div className={`px-2 py-1 rounded text-xs font-bold ${totalPL >= 0 ? 'bg-green-500/30 text-green-300 border border-green-500/50' : 'bg-red-500/30 text-red-300 border border-red-500/50'}`}>
                                {totalPL >= 0 ? '+' : ''}{totalPL.toFixed(2)}% Total
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* Individual Tracked Trades */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {trackedTradesData && trackedTradesData.map((trade: any, idx: number) => {
                      const entryPrice = parseFloat(trade.entry);
                      const slPrice = parseFloat(trade.stopLoss);
                      const tp1Price = parseFloat(trade.targets[0]);
                      
                      // Use fetched price for the trade's symbol, fallback to chart price if same symbol
                      const isMatchingSymbol = trade.symbol === symbol;
                      const fetchedPrice = trackedTradesPrices[trade.symbol];
                      const chartPrice = data.length > 0 ? data[data.length - 1].close : 0;
                      const currentPrice = fetchedPrice || (isMatchingSymbol ? chartPrice : 0);
                      
                      let profitPercent = 0;
                      let statusLabel = 'Waiting';
                      let statusColor = 'text-yellow-400';
                      let statusBg = 'bg-yellow-500/20';
                      let showPL = false;
                      
                      if (trade.status === 'sl_hit') {
                        const exitPrice = slPrice;
                        statusLabel = 'SL Hit';
                        statusColor = 'text-red-400';
                        statusBg = 'bg-red-500/20';
                        showPL = true;
                        profitPercent = trade.direction === 'LONG' 
                          ? ((exitPrice - entryPrice) / entryPrice) * 100
                          : ((entryPrice - exitPrice) / entryPrice) * 100;
                      } else if (trade.status === 'tp_hit') {
                        const exitPrice = tp1Price;
                        statusLabel = 'TP Hit';
                        statusColor = 'text-green-400';
                        statusBg = 'bg-green-500/20';
                        showPL = true;
                        profitPercent = trade.direction === 'LONG' 
                          ? ((exitPrice - entryPrice) / entryPrice) * 100
                          : ((entryPrice - exitPrice) / entryPrice) * 100;
                      } else if (trade.status === 'entry_hit') {
                        statusLabel = 'In Trade';
                        statusColor = 'text-cyan-400';
                        statusBg = 'bg-cyan-500/20';
                        // Show live P/L if we have a current price
                        showPL = currentPrice > 0;
                        if (currentPrice > 0) {
                          profitPercent = trade.direction === 'LONG' 
                            ? ((currentPrice - entryPrice) / entryPrice) * 100
                            : ((entryPrice - currentPrice) / entryPrice) * 100;
                        }
                      } else if (trade.status === 'pending') {
                        statusLabel = 'Waiting';
                        statusColor = 'text-yellow-400';
                        statusBg = 'bg-yellow-500/20';
                        showPL = false;
                      }
                      
                      const isProfit = profitPercent > 0;
                      
                      return (
                        <div 
                          key={trade.id || idx}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedTrackedTradeId === trade.id 
                              ? 'bg-cyan-900/30 border-cyan-500' 
                              : 'bg-[#0e0e0e] border-[#2a2e39] hover:border-[#3a3e49]'
                          }`}
                          onClick={() => setSelectedTrackedTradeId(selectedTrackedTradeId === trade.id ? null : trade.id)}
                          data-testid={`tracked-trade-${idx}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`px-2 py-1 rounded text-xs font-bold ${trade.direction === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {trade.direction}
                            </div>
                            <div>
                              <div className="text-sm text-white font-medium">{trade.symbol}</div>
                              <div className="text-xs text-gray-500">
                                Entry: {entryPrice.toFixed(4)} | SL: {slPrice.toFixed(4)} | TP: {tp1Price.toFixed(4)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`px-2 py-1 rounded text-xs font-semibold ${statusBg} ${statusColor}`}>
                              {statusLabel}
                            </div>
                            {showPL ? (
                              <div className={`text-sm font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                                {isProfit ? '+' : ''}{profitPercent.toFixed(2)}%
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">--</div>
                            )}
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                try {
                                  console.log('Deleting trade:', trade.id);
                                  const token = await getToken();
                                  await apiRequest('DELETE', `/api/crypto/tracked-trades/${trade.id}`, undefined, token || undefined);
                                  toast({
                                    title: "Trade Removed",
                                    description: `${trade.symbol} ${trade.direction} trade deleted`,
                                    duration: 2000,
                                  });
                                  refetchTrackedTrades();
                                } catch (err: any) {
                                  console.error('Failed to delete trade:', err);
                                  toast({
                                    title: "Error",
                                    description: err.message || "Failed to delete trade",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                              data-testid={`delete-tracked-trade-${idx}`}
                              title="Remove trade"
                            >
                              <X className="w-4 h-4 text-gray-400 hover:text-red-400" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Empty state when no trades */}
                  {(!trackedTradesData || trackedTradesData.length === 0) && (
                    <div className="text-center text-gray-500 py-6">
                      <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No tracked trades yet</p>
                      <p className="text-xs mt-1">Click "Track Trade" on any AI trade idea to start tracking</p>
                    </div>
                  )}
                </CardContent>
              </Card>

            {/* Liquidation Heatmap - Show in Alerts tab for easy reference */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39] mt-6">
              <Collapsible open={liquidationInfoOpen} onOpenChange={setLiquidationInfoOpen}>
                <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-[#252525] transition-colors rounded-lg">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-[#ff3b69]" />
                    <h3 className="text-lg font-semibold text-white">Liquidation Information</h3>
                  </div>
                  {liquidationInfoOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4">
                    <LiquidationHeatmapChart 
                      symbol={symbol} 
                      currentPrice={data.length > 0 ? data[data.length - 1].close : undefined}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Professional Orderflow Table - Intermediate+ Tier */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39] mt-6">
              <Collapsible open={oiInfoOpen} onOpenChange={setOiInfoOpen}>
                <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-[#252525] transition-colors rounded-lg">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#00c4b4]" />
                    <h3 className="text-lg font-semibold text-white">Open Interest Info</h3>
                  </div>
                  {oiInfoOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4">
                    {tier !== 'free' && tier !== 'beginner' ? (
                      <ProfessionalOrderflowTable 
                        symbol={symbol} 
                        interval={interval}
                        className=""
                      />
                    ) : (
                      <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/50" data-testid="card-orderflow-locked">
                        <CardContent className="p-8">
                          <div className="text-center space-y-4">
                            <div className="flex justify-center">
                              <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center">
                                <Activity className="w-8 h-8 text-purple-400" />
                              </div>
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-white mb-2">
                                Professional Orderflow Analysis
                              </h3>
                              <p className="text-gray-300 max-w-2xl mx-auto">
                                Access real-time CVD, Open Interest, Funding Rates, and Long/Short Ratios from 
                                Coinalyze & Coinglass APIs. Get institutional-grade market structure signals.
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-gray-400">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span>Cumulative Volume Delta (CVD)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                <span>Open Interest Deltas</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                                <span>Funding Rate Analysis</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                <span>Long/Short Ratios</span>
                              </div>
                            </div>
                            <div className="pt-4">
                              <Link href="/cryptosubscribe">
                                <Button 
                                  className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-4 sm:px-8 py-4 sm:py-6 text-base sm:text-lg font-semibold"
                                  data-testid="button-upgrade-intermediate"
                                >
                                  Upgrade to Intermediate ($15/month)
                                </Button>
                              </Link>
                              <p className="text-xs text-gray-500 mt-3">
                                Requires Intermediate tier or higher
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            </div>
          </div>
        </div>
      </div>

        {/* Disclaimer Section */}
        <div className="max-w-4xl mx-auto px-4 pt-6 pb-6 text-center">
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
      
      {/* Bottom Navigation */}
      <CryptoNavigation />
      
      {/* Spacer for fixed navigation */}
      <div className="h-20"></div>
    </div>
    </>
  );
}

// Build v2.0
import { useEffect, useRef, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { createChart, IChartApi, ISeriesApi, ColorType, CandlestickData, HistogramData, LineData, Time, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, TrendingUp, Zap, Loader2, ArrowLeft, Settings, Activity, Info, AlertCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Link, useLocation } from 'wouter';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useToast } from '@/hooks/use-toast';
import { LiquidationHeatmapChart } from '@/components/LiquidationHeatmapChart';
import { ProfessionalOrderflowTable } from '@/components/ProfessionalOrderflowTable';
import { CryptoNavigation } from '@/components/CryptoNavigation';
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

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'ADAUSDT', 'SOLUSDT'];
const INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
];

export default function CryptoAI() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const obvRef = useRef<HTMLDivElement>(null);
  const mfiRef = useRef<HTMLDivElement>(null);
  const cciRef = useRef<HTMLDivElement>(null);
  const adxRef = useRef<HTMLDivElement>(null);
  const volumeChartRef = useRef<HTMLDivElement>(null);
  const cvdChartRef = useRef<HTMLDivElement>(null);

  const { isAuthenticated, isLoading: authLoading, tier, getToken } = useCryptoAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [data, setData] = useState<Bar[]>([]);
  const [symbol, setSymbol] = useState('XRPUSDT');
  const [interval, setInterval] = useState('15m');

  const { data: subscription, refetch: refetchSubscription } = useQuery<{
    tier: string;
    dailyUsage?: { used: number; limit: number; remainingToday: number };
  }>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isAuthenticated && !authLoading,
    staleTime: 0, // Force fresh data
    refetchOnMount: true
  });

  const { data: trackedTradesData, refetch: refetchTrackedTrades } = useQuery<any[]>({
    queryKey: [`/api/crypto/tracked-trades/${symbol}`],
    enabled: isAuthenticated && !authLoading,
    refetchInterval: 10000, // Refetch every 10 seconds to check for status updates
  });
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [tradeAlerts, setTradeAlerts] = useState<TradeAlert[]>(() => {
    const cached = localStorage.getItem(`tradeAlerts_${symbol}_${interval}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return [];
      }
    }
    return [];
  });
  
  const [marketInsights, setMarketInsights] = useState<{ noTradesReason?: string; summary?: string; bias?: string } | null>(() => {
    const cached = localStorage.getItem(`marketInsights_${symbol}_${interval}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>(['A+', 'A', 'B', 'C']);
  const [alertTimeframe, setAlertTimeframe] = useState('15m');
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [trackedTrades, setTrackedTrades] = useState<string[]>([]); // IDs of tracked trades
  const [trackingTradeId, setTrackingTradeId] = useState<string | null>(null); // Currently tracking
  const [activeTab, setActiveTab] = useState('chart'); // Track active tab for chart resize
  
  // Update tradeAlerts when symbol or interval changes
  useEffect(() => {
    const cached = localStorage.getItem(`tradeAlerts_${symbol}_${interval}`);
    if (cached) {
      try {
        setTradeAlerts(JSON.parse(cached));
      } catch {
        setTradeAlerts([]);
      }
    } else {
      setTradeAlerts([]);
    }
  }, [symbol, interval]);
  
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
  const [mfiPeriod, setMfiPeriod] = useState(14);
  const [cciPeriod, setCciPeriod] = useState(20);
  const [adxPeriod, setAdxPeriod] = useState(14);

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
  const detectAbsorption = useCallback((bars: Bar[], cvdData: any[]): Absorption[] => {
    if (bars.length < 30) return [];
    
    const signals: Absorption[] = [];
    const atrArray = calculateATR(bars, 14);
    const avgVol20 = averageVolume(bars.slice(-20));
    const avgDelta20 = averageDelta(bars.slice(-20));
    
    const atr14 = atrArray[atrArray.length - 1]; // Use latest ATR
    const MIN_PRICE_MOVE = 0.3 * atr14;     // price must stall <0.3 ATR over 5-10 bars
    const MIN_DELTA_STRENGTH = 2.5 * avgDelta20;  // delta surge >2.5x average
    const VOLUME_MULTIPLIER = 1.8;          // volume >1.8x 20-bar avg
    const COOLDOWN_BARS = 15;               // no repeat within 15 bars
    
    let lastAbsorb = -100;
    
    for (let i = 20; i < bars.length - 5; i++) {
      const priceMove5 = Math.abs(bars[i].close - bars[i - 5].close);
      const deltaSum = Math.abs(cvdData[i].delta - cvdData[i - 5].delta);
      
      if (priceMove5 > MIN_PRICE_MOVE) continue;
      if (deltaSum < MIN_DELTA_STRENGTH) continue;
      if (bars[i].volume < avgVol20 * VOLUME_MULTIPLIER) continue;
      if (i - lastAbsorb < COOLDOWN_BARS) continue;
      
      signals.push({
        time: bars[i].time,
        price: bars[i].close,
        type: cvdData[i].delta > cvdData[i - 5].delta ? 'bullAbsorb' : 'bearAbsorb'
      });
      lastAbsorb = i;
    }
    return signals;
  }, [calculateATR, averageVolume, averageDelta]);

  // === Hidden Divergence Detection ===
  const detectHiddenDivergence = useCallback((bars: Bar[], cvdData: any[]) => {
    if (bars.length < 60) return [];
    
    const divergences: any[] = [];
    const atrArray = calculateATR(bars, 14);
    const avgDelta20 = averageDelta(bars.slice(-20));
    
    const atr14 = atrArray[atrArray.length - 1]; // Use latest ATR
    const MIN_SWING_STRENGTH = 0.5 * atr14;  // price move must be >0.5 ATR
    const MIN_CVD_DIFF = 1.5 * avgDelta20;   // CVD counter-move >1.5x avg delta
    const LOOKBACK = 50;                     // only check last 50 bars
    const MIN_BARS_BETWEEN = 5;              // no repeat signals sooner
    
    let lastBullSignalIndex = -100;
    let lastBearSignalIndex = -100;
    
    for (let i = LOOKBACK; i < bars.length - 5; i++) {
      const recentBars = bars.slice(i - LOOKBACK, i);
      const recentCVD = cvdData.slice(i - LOOKBACK, i);
      
      // Bullish hidden divergence: price making lower lows, CVD making higher lows
      const priceLows = recentBars.map(b => b.low);
      const cvdLows = recentCVD.map(c => c.value);
      const priceSwing = priceLows[priceLows.length - 1] - Math.min(...priceLows.slice(0, -1));
      const cvdSwing = cvdLows[cvdLows.length - 1] - Math.min(...cvdLows.slice(0, -1));
      
      if (Math.abs(priceSwing) < MIN_SWING_STRENGTH) continue;
      if (Math.abs(cvdSwing) < MIN_CVD_DIFF) continue;
      if (i - lastBullSignalIndex < MIN_BARS_BETWEEN) continue;
      
      if (priceSwing < 0 && cvdSwing > 0) {
        divergences.push({ time: bars[i].time, type: 'bullish', price: bars[i].low });
        lastBullSignalIndex = i;
      }
      
      // Bearish hidden divergence: price making higher highs, CVD making lower highs
      const priceHighs = recentBars.map(b => b.high);
      const cvdHighs = recentCVD.map(c => c.value);
      const priceHighSwing = priceHighs[priceHighs.length - 1] - Math.max(...priceHighs.slice(0, -1));
      const cvdHighSwing = cvdHighs[cvdHighs.length - 1] - Math.max(...cvdHighs.slice(0, -1));
      
      if (Math.abs(priceHighSwing) < MIN_SWING_STRENGTH) continue;
      if (Math.abs(cvdHighSwing) < MIN_CVD_DIFF) continue;
      if (i - lastBearSignalIndex < MIN_BARS_BETWEEN) continue;
      
      if (priceHighSwing > 0 && cvdHighSwing < 0) {
        divergences.push({ time: bars[i].time, type: 'bearish', price: bars[i].high });
        lastBearSignalIndex = i;
      }
    }
    
    return divergences;
  }, [calculateATR, averageDelta]);

  // === Liquidity Grab Detection ===
  const detectLiquidityGrabs = useCallback((bars: Bar[]) => {
    const grabs: any[] = [];
    const lookback = 10;
    
    for (let i = lookback; i < bars.length - 5; i++) {
      const recentBars = bars.slice(i - lookback, i);
      const recentLows = recentBars.map(b => b.low);
      const recentHighs = recentBars.map(b => b.high);
      const minLow = Math.min(...recentLows);
      const maxHigh = Math.max(...recentHighs);
      
      // Bullish liquidity grab: sweep below recent lows + immediate reversal
      if (bars[i].low < minLow && 
          bars[i].close > bars[i].open &&
          bars.slice(i + 1, i + 4).every((b, idx) => idx === 0 || b.close > bars[i + idx].close)) {
        grabs.push({ time: bars[i].time, type: 'bullish', price: bars[i].low });
      }
      
      // Bearish liquidity grab: sweep above recent highs + immediate reversal
      if (bars[i].high > maxHigh && 
          bars[i].close < bars[i].open &&
          bars.slice(i + 1, i + 4).every((b, idx) => idx === 0 || b.close < bars[i + idx].close)) {
        grabs.push({ time: bars[i].time, type: 'bearish', price: bars[i].high });
      }
    }
    
    return grabs;
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
          const registration = await navigator.serviceWorker.ready;
          
          // Convert VAPID key
          const publicVapidKey = import.meta.env.VITE_PUBLIC_VAPID_KEY || 'BIvKNAbXbD5crSXFie5H2yEXWT4tBhZGYqc9u8ADj5h9NXxgCi6ylS1M7KvowyyJFkQwEQaesLUuVgbOyHrM61M';
          const convertedKey = urlBase64ToUint8Array(publicVapidKey);
          
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
  const fetchData = useCallback(async () => {
    console.log(`📊 Fetching data for ${symbol} at ${interval} interval...`);
    setLoading(true);
    try {
      // Delete all pending/active trades for this symbol before refreshing
      console.log(`🧹 Clearing pending trades for ${symbol}...`);
      const deleteResponse = await fetch(`/api/crypto/tracked-trades/clear/${symbol}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (deleteResponse.ok) {
        const result = await deleteResponse.json();
        console.log(`✅ Cleared ${result.deletedCount} pending trades`);
        // Invalidate tracked trades cache to update UI
        queryClient.invalidateQueries({ queryKey: ['/api/crypto/tracked-trades'] });
      }
      
      const response = await fetch(`/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch data');
      
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
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  // Load cached trade alerts when symbol/interval changes
  useEffect(() => {
    const cached = localStorage.getItem(`tradeAlerts_${symbol}_${interval}`);
    if (cached) {
      try {
        setTradeAlerts(JSON.parse(cached));
      } catch {
        setTradeAlerts([]);
      }
    } else {
      setTradeAlerts([]);
    }
  }, [symbol, interval]);

  // Initial fetch (removed auto-refresh for cost control)
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // === Analyze Trades with Grok API ===
  const analyzeTrades = useCallback(async () => {
    if (data.length === 0) return;
    
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

      // Fetch professional orderflow data (OI, Funding, L/S Ratio) - only for Intermediate+ tiers
      let orderflowData = null;
      if (tier === 'intermediate' || tier === 'pro' || tier === 'elite') {
        // Fetch each independently to prevent one failure from breaking all
        const safeFetch = async (url: string) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            return await res.json();
          } catch {
            return null;
          }
        };

        try {
          const [openInterest, fundingRate, longShortRatio] = await Promise.all([
            safeFetch(`/api/crypto/orderflow/open-interest?symbol=${symbol}&interval=${alertTimeframe}`),
            safeFetch(`/api/crypto/orderflow/funding-rate?symbol=${symbol}`),
            safeFetch(`/api/crypto/orderflow/long-short-ratio?symbol=${symbol}&interval=${alertTimeframe}`)
          ]);

          orderflowData = { openInterest, fundingRate, longShortRatio };
        } catch (error) {
          console.warn('Failed to fetch orderflow data:', error);
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
          recentBars: data.slice(-50),
          bullishOB: bullishOB.slice(-5),
          bearishOB: bearishOB.slice(-5),
          bullFVG: bullFVG.slice(-5),
          bearFVG: bearFVG.slice(-5),
          buyImbalances: imbalances.filter(i => i.type === 'buy').slice(-5),
          sellImbalances: imbalances.filter(i => i.type === 'sell').slice(-5),
          absorption: absorption.slice(-5),
          hiddenDivergences: hiddenDivergences.slice(-5),
          liquidityGrabs: liquidityGrabs.slice(-5),
          orderflowData,
          cci: currentCCI,
          adx: currentADX,
          plusDI: currentPlusDI,
          minusDI: currentMinusDI,
        }),
      });
      
      const result = await response.json();
      
      // Handle daily limit error
      if (!response.ok) {
        if (result.error === 'Daily limit reached') {
          toast({
            title: "Daily limit reached",
            description: "You've used all your AI trade calls for today. Limit resets at midnight.",
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
      localStorage.setItem(`tradeAlerts_${symbol}_${interval}`, JSON.stringify(alerts));
      
      // Refresh subscription data to update the counter
      refetchSubscription();
      
      // Store market insights for display
      if (result.marketInsights && alerts.length === 0) {
        setMarketInsights(result.marketInsights);
        localStorage.setItem(`marketInsights_${symbol}_${interval}`, JSON.stringify(result.marketInsights));
      } else {
        setMarketInsights(null);
        localStorage.removeItem(`marketInsights_${symbol}_${interval}`);
      }
    } catch (error) {
      console.error('Failed to analyze trades:', error);
      setTradeAlerts([]);
      localStorage.removeItem(`tradeAlerts_${symbol}_${interval}`);
    } finally {
      setAnalyzing(false);
    }
  }, [data, symbol, interval, alertTimeframe, tier, calculateCVD, calculateVolumeProfile, detectOrderBlocks, detectFVG, detectImbalances, detectAbsorption, detectHiddenDivergence, detectLiquidityGrabs, refetchSubscription, toast]);

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
          entry: parseFloat(alert.entry),
          stopLoss: parseFloat(alert.stopLoss),
          targets: alert.targets.map((t: string) => parseFloat(t)),
          confluenceSignals: alert.confluenceSignals,
          reasoning: alert.reasoning,
        }),
      });

      if (!response.ok) throw new Error('Failed to track trade');

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
      height: 800,
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

    // Draw Tracked Trade Lines
    if (trackedTradesData && trackedTradesData.length > 0) {
      trackedTradesData.forEach((trade) => {
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
      });
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
    
    // FVG detection and mitigation logic runs above (no visual rendering)
    // Stats will show count of unmitigated FVGs for AI analysis
    
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
          width: chartContainerRef.current.clientWidth 
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
  }, [data, trackedTradesData, calculateCVD, calculateVolumeProfile, detectOrderBlocks, detectFVG, detectImbalances, detectAbsorption, detectHiddenDivergence, detectLiquidityGrabs]);

  // === Resize chart when switching to chart tab ===
  useEffect(() => {
    if (activeTab === 'chart' && chartContainerRef.current && chartRef.current) {
      // Small delay to ensure tab content is visible
      setTimeout(() => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ 
            width: chartContainerRef.current.clientWidth 
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
  }, [data]);

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
  }, [data]);

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
    line.setData(calculateRSI(data, rsiPeriod));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 70 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 30 })));
    
    return () => chart.remove();
  }, [data, rsiPeriod, calculateRSI]);

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
    chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2 }).setData(macd);
    chart.addSeries(LineSeries, { color: '#ef5350', lineWidth: 2 }).setData(signal);
    chart.addSeries(HistogramSeries, { color: '#26a69a' }).setData(validHistogram);
    
    return () => chart.remove();
  }, [data, macdFast, macdSlow, macdSignal, calculateMACD]);

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
    
    chart.addSeries(LineSeries, { color: '#9580ff', lineWidth: 2 }).setData(calculateOBV(data));
    
    return () => chart.remove();
  }, [data, calculateOBV]);

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
    line.setData(calculateMFI(data, mfiPeriod));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (80/20 for MFI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 80 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 20 })));
    
    return () => chart.remove();
  }, [data, mfiPeriod, calculateMFI]);

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
    line.setData(calculateCCI(data.map(d => ({ ...d, volume: d.volume })), cciPeriod));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (+100/-100 for CCI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 100 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: -100 })));
    chart.addSeries(LineSeries, { color: '#444', lineStyle: 1, lineWidth: 1 }).setData(data.map(d => ({ time: d.time as Time, value: 0 })));
    
    return () => chart.remove();
  }, [data, cciPeriod]);

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
  }, [data, adxPeriod]);

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
              {tier === 'intermediate' && subscription && (
                <div className="text-sm">
                  <span className="text-gray-400">AI Credits: </span>
                  <span className="font-semibold text-white" data-testid="text-ai-credits">{subscription.aiCreditsRemaining}/{subscription.aiCreditsLimit}</span>
                </div>
              )}
              {(tier === 'pro' || tier === 'elite') && (
                <div className="text-sm text-green-500 font-semibold" data-testid="text-unlimited-credits">
                  Unlimited AI Credits
                </div>
              )}
              <div className="text-sm">
                <span className="text-gray-400">Auto-Refresh: </span>
                <span className="font-semibold text-white" data-testid="text-refresh-rate">
                  {tier === 'intermediate' ? 'Every 3 min' :
                   tier === 'pro' ? 'Every 1 min' :
                   tier === 'elite' ? 'Every 30 sec' : 'Manual Only'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
            <div className="flex gap-2 w-full sm:w-auto">
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="flex-1 sm:w-[140px] bg-[#1a1a1a] border-[#2a2e39]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYMBOLS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
                onClick={fetchData} 
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
                  {SYMBOLS.map(ticker => (
                    <Button
                      key={ticker}
                      onClick={() => toggleTickerSelection(ticker)}
                      className={`${
                        selectedTickers.includes(ticker)
                          ? 'bg-[#00c4b4] text-black hover:bg-[#00a89c]'
                          : 'bg-[#2a2e39] text-gray-400 hover:bg-[#3a3e49]'
                      }`}
                      disabled={!selectedTickers.includes(ticker) && selectedTickers.length >= 3}
                      data-testid={`ticker-${ticker}`}
                    >
                      {ticker}
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

        {/* Row 1: Core Volume Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Real CVD</div>
            <div className="text-lg sm:text-2xl font-bold text-[#ffa726]">
              {stats.cvd.toFixed(0)}
            </div>
          </Card>
          
          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">POC</div>
            <div className="text-lg sm:text-2xl font-bold text-[#ffd700]">
              {stats.poc.toFixed(4)}
            </div>
          </Card>

          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">VAH</div>
            <div className="text-lg sm:text-2xl font-bold text-[#4caf50]">
              {stats.vah.toFixed(4)}
            </div>
          </Card>

          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">VAL</div>
            <div className="text-lg sm:text-2xl font-bold text-[#f44336]">
              {stats.val.toFixed(4)}
            </div>
          </Card>
        </div>

        {/* Row 2: Order Blocks & Fair Value Gaps */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Bullish Order Blocks</div>
            <div className="text-lg sm:text-2xl font-bold text-[#00ff9d]">
              {stats.bullishOB}
            </div>
          </Card>

          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Bearish Order Blocks</div>
            <div className="text-lg sm:text-2xl font-bold text-[#ff3b69]">
              {stats.bearishOB}
            </div>
          </Card>

          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Bullish FVG</div>
            <div className="text-lg sm:text-2xl font-bold text-[#26a69a]">
              {stats.bullFVG}
            </div>
          </Card>
          
          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Bearish FVG</div>
            <div className="text-lg sm:text-2xl font-bold text-[#ef5350]">
              {stats.bearFVG}
            </div>
          </Card>
        </div>

        {/* Row 3: Advanced Confluence Signals */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4">
          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Buy Imbalances</div>
            <div className="text-lg sm:text-2xl font-bold text-[#00ff9d]">
              {stats.buyImbalances}
            </div>
          </Card>

          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Sell Imbalances</div>
            <div className="text-lg sm:text-2xl font-bold text-[#ff3b69]">
              {stats.sellImbalances}
            </div>
          </Card>

          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Absorption Events</div>
            <div className="text-lg sm:text-2xl font-bold text-[#00c4b4]">
              {stats.absorptionEvents}
            </div>
          </Card>

          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Hidden Divergences</div>
            <div className="text-lg sm:text-2xl font-bold text-[#9c27b0]">
              {stats.hiddenDivergences}
            </div>
          </Card>

          <Card className="bg-[#1a1a1a] border-[#2a2e39] p-2 sm:p-4 text-center">
            <div className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">Liquidity Grabs</div>
            <div className="text-lg sm:text-2xl font-bold text-[#ff9800]">
              {stats.liquidityGrabs}
            </div>
          </Card>
        </div>

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
              <div 
                ref={chartContainerRef} 
                className="w-full"
                style={{ height: '800px' }}
              />
            </Card>

            {/* Volume Chart */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-sm">Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <div ref={volumeChartRef} className="w-full" />
              </CardContent>
            </Card>

            {/* CVD Chart */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-sm">Cumulative Delta (CVD)</CardTitle>
              </CardHeader>
              <CardContent>
                <div ref={cvdChartRef} className="w-full" />
              </CardContent>
            </Card>

            {/* Oscillators Section */}
            <div className="grid grid-cols-1 gap-4">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">RSI ({rsiPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={rsiRef} className="w-full" />
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">MACD ({macdFast},{macdSlow},{macdSignal})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={macdRef} className="w-full" />
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">On-Balance Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={obvRef} className="w-full" />
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Money Flow Index ({mfiPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={mfiRef} className="w-full" />
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">CCI ({cciPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={cciRef} className="w-full" />
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm">ADX ({adxPeriod})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={adxRef} className="w-full" />
                </CardContent>
              </Card>
            </div>

            {/* Legend */}
            <div className="text-sm text-gray-400 space-y-1">
              <div className="flex gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ffa726]"></div>
                  <span>CVD (Cumulative Volume Delta) - Buy/Sell Pressure</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ffd700]"></div>
                  <span>POC (Point of Control) - Highest Volume Price</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#4caf50]"></div>
                  <span>VAH (Value Area High) - 70% Volume Upper Bound</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#f44336]"></div>
                  <span>VAL (Value Area Low) - 70% Volume Lower Bound</span>
                </div>
              </div>
              <div className="flex gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#00ff9d]"></div>
                  <span>Bullish Order Block - Smart Money Support</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-[#ff3b69]"></div>
                  <span>Bearish Order Block - Smart Money Resistance</span>
                </div>
              </div>
            </div>
            </div>

            {/* AI Alerts Panel */}
            <div className={`space-y-4 ${activeTab === 'alerts' ? 'block' : 'hidden'}`}>
            {/* Analyze Button */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39] p-4">
              <div className="flex items-center justify-between gap-4">
                <img src={grokLogo} alt="Grok" className="h-8 brightness-110" />
                <Button
                  onClick={() => (tier !== 'intermediate' && tier !== 'pro' && tier !== 'elite') ? setLocation('/cryptosubscribe') : analyzeTrades()}
                  disabled={analyzing || data.length === 0}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white disabled:opacity-50"
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
              </div>
              {/* Daily Usage Counter */}
              {subscription?.dailyUsage && subscription.dailyUsage.limit > 0 && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700">
                    <Zap className="w-3.5 h-3.5 text-[#00c4b4]" />
                    <span className="text-xs text-gray-300">
                      <span className="font-semibold text-white">{subscription.dailyUsage.remainingToday}</span>
                      <span className="text-gray-500"> of {subscription.dailyUsage.limit}</span>
                      <span className="ml-1 text-gray-400">remaining today</span>
                    </span>
                  </div>
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

            {/* Indicator Breakdown Report - Only shows when analysis is complete */}
            {tradeAlerts.length > 0 && (
              <Card className="bg-[#1a1a1a] border-[#2a2e39] p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[#2a2e39] pb-3">
                    <Activity className="w-5 h-5 text-[#00c4b4]" />
                    <h3 className="text-lg font-semibold text-white">Indicator Breakdown Report</h3>
                    <span className="ml-auto text-xs text-gray-400">Notable Signals Only</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* RSI Analysis */}
                    <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39]">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="font-semibold text-sm text-white">RSI (14)</span>
                        <span className="ml-auto text-xs text-orange-400">⚠️ Oversold</span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-1">
                        <div>Current: <span className="text-white font-semibold">28.4</span></div>
                        <div>Status: <span className="text-orange-400">Below 30 threshold</span></div>
                        <div className="pt-2 text-[11px] text-gray-500">Watch for bullish reversal signals</div>
                      </div>
                    </div>

                    {/* MACD Divergence */}
                    <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39]">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                        <span className="font-semibold text-sm text-white">MACD</span>
                        <span className="ml-auto text-xs text-green-400">✓ Bullish Cross</span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-1">
                        <div>Signal: <span className="text-green-400">Positive crossover detected</span></div>
                        <div>Histogram: <span className="text-white">+0.0024</span></div>
                        <div className="pt-2 text-[11px] text-gray-500">Momentum shifting bullish</div>
                      </div>
                    </div>

                    {/* OBV Volume Analysis */}
                    <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39]">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                        <span className="font-semibold text-sm text-white">OBV</span>
                        <span className="ml-auto text-xs text-yellow-400">⚠️ Divergence</span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-1">
                        <div>Trend: <span className="text-green-400">Rising (+2.4M)</span></div>
                        <div>Price: <span className="text-red-400">Making lower lows</span></div>
                        <div className="pt-2 text-[11px] text-gray-500">Bullish hidden divergence forming</div>
                      </div>
                    </div>

                    {/* EMA Structure */}
                    <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39]">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        <span className="font-semibold text-sm text-white">EMA (21/55)</span>
                        <span className="ml-auto text-xs text-red-400">✗ Below MAs</span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-1">
                        <div>Price: <span className="text-white">$2.0845</span></div>
                        <div>EMA21: <span className="text-gray-300">$2.1120</span> | EMA55: <span className="text-gray-300">$2.1450</span></div>
                        <div className="pt-2 text-[11px] text-gray-500">Key resistance overhead at EMAs</div>
                      </div>
                    </div>

                    {/* VWAP Levels */}
                    <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39]">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                        <span className="font-semibold text-sm text-white">VWAP</span>
                        <span className="ml-auto text-xs text-cyan-400">→ Near Level</span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-1">
                        <div>Daily VWAP: <span className="text-white">$2.0880</span></div>
                        <div>Distance: <span className="text-cyan-400">+0.35% above</span></div>
                        <div className="pt-2 text-[11px] text-gray-500">Testing daily VWAP as support</div>
                      </div>
                    </div>

                    {/* Structure Trend */}
                    <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39]">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="font-semibold text-sm text-white">Market Structure</span>
                        <span className="ml-auto text-xs text-orange-400">⚠️ Ranging</span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-1">
                        <div>Pattern: <span className="text-yellow-400">Consolidation</span></div>
                        <div>Range: <span className="text-white">$2.06 - $2.12</span></div>
                        <div className="pt-2 text-[11px] text-gray-500">Watch for breakout direction</div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#2a2e39]">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Info className="w-3 h-3" />
                      <span>This report highlights only notable indicator signals. Indicators in normal ranges are not shown.</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Trade Alerts Display */}
            {tradeAlerts.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {tradeAlerts.map((alert, idx) => {
                  const entry = parseFloat(alert.entry);
                  const stopLoss = parseFloat(alert.stopLoss);
                  const firstTarget = parseFloat(alert.targets[0]);
                  
                  const risk = alert.direction === 'LONG' 
                    ? entry - stopLoss 
                    : stopLoss - entry;
                  const reward = alert.direction === 'LONG'
                    ? firstTarget - entry
                    : entry - firstTarget;
                  const rrRatio = risk > 0 ? (reward / risk).toFixed(2) : '0';
                  const rrRatioNum = parseFloat(rrRatio);
                  const rrColors = getRRColor(rrRatioNum);
                  
                  return (
                  <Card key={idx} className="bg-[#1a1a1a] border-[#2a2e39] p-6">
                    <div className="space-y-4">
                      {/* Header with Grade */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`px-4 py-2 rounded-lg font-bold text-xl ${getGradeColor(alert.grade)}`}>
                            {alert.grade}
                          </div>
                          <div>
                            <div className={`text-xl font-bold ${alert.direction === 'LONG' ? 'text-[#00ff9d]' : 'text-[#ff3b69]'}`}>
                              {alert.direction}
                            </div>
                            <div className="text-gray-400 text-sm">
                              {alert.confluenceCount} confluence signals
                            </div>
                          </div>
                        </div>
                        <div 
                          className={`px-3 py-1 rounded-lg border ${rrColors.bg} ${rrColors.border}`}
                          style={rrColors.style}
                        >
                          <div className="text-xs text-gray-400">R/R Ratio</div>
                          <div className={`text-lg font-bold ${rrColors.text}`} style={rrColors.style ? { color: rrColors.style.color } : undefined}>
                            {rrRatio}:1
                          </div>
                        </div>
                      </div>

                      {/* Entry, SL, Targets */}
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="bg-[#0e0e0e] p-3 rounded">
                          <div className="text-gray-400">Entry</div>
                          <div className="font-semibold text-[#00c4b4]">{alert.entry}</div>
                        </div>
                        <div className="bg-[#0e0e0e] p-3 rounded">
                          <div className="text-gray-400">Stop Loss</div>
                          <div className="font-semibold text-[#ff5252]">{alert.stopLoss}</div>
                        </div>
                        <div className="bg-[#0e0e0e] p-3 rounded">
                          <div className="text-gray-400">Targets</div>
                          <div className="font-semibold text-[#4caf50]">
                            {alert.targets.join(' / ')}
                          </div>
                        </div>
                      </div>

                      {/* Confluence Signals */}
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-gray-300">Confluence Signals:</div>
                        <div className="space-y-1">
                          {alert.confluenceSignals.map((signal, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#00c4b4] mt-1.5 flex-shrink-0"></div>
                              <span className="text-gray-300">{signal}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Reasoning */}
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-gray-300">Analysis:</div>
                        <div className="text-sm text-gray-400 leading-relaxed">
                          {alert.reasoning}
                        </div>
                      </div>

                      {/* Track Button */}
                      <div className="pt-2 border-t border-[#2a2e39]">
                        <Button
                          onClick={() => trackTrade(alert)}
                          disabled={trackingTradeId === `${symbol}-${alert.direction}-${alert.entry}` || trackedTrades.includes(`${symbol}-${alert.direction}-${alert.entry}`)}
                          className={`w-full ${
                            trackedTrades.includes(`${symbol}-${alert.direction}-${alert.entry}`)
                              ? 'bg-emerald-600 hover:bg-emerald-700' 
                              : 'bg-[#00c4b4] hover:bg-[#00a89d]'
                          } text-white font-semibold`}
                          data-testid={`track-trade-${idx}`}
                        >
                          {trackingTradeId === `${symbol}-${alert.direction}-${alert.entry}` ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Tracking...
                            </>
                          ) : trackedTrades.includes(`${symbol}-${alert.direction}-${alert.entry}`) ? (
                            <>
                              ✓ Tracked
                            </>
                          ) : (
                            <>
                              🎯 Track This Trade
                            </>
                          )}
                        </Button>
                        
                        {/* Profit/Loss Display - Show for active and completed trades */}
                        {(() => {
                          const matchedTrade = trackedTradesData?.find(
                            (t) => t.symbol === symbol && 
                            t.direction === alert.direction && 
                            parseFloat(t.entry) === parseFloat(alert.entry)
                          );
                          
                          if (matchedTrade) {
                            const entryPrice = parseFloat(matchedTrade.entry);
                            const currentPrice = data.length > 0 ? data[data.length - 1].close : entryPrice;
                            
                            let profitPercent = 0;
                            let exitPrice = currentPrice;
                            let isCompleted = false;
                            let statusLabel = 'Active';
                            
                            // Check if trade is completed
                            if (matchedTrade.status === 'sl_hit' || matchedTrade.status === 'tp_hit') {
                              isCompleted = true;
                              exitPrice = matchedTrade.status === 'sl_hit' 
                                ? parseFloat(matchedTrade.stopLoss)
                                : parseFloat(matchedTrade.targets[0]);
                              statusLabel = matchedTrade.status === 'sl_hit' ? 'SL Hit' : 'TP Hit';
                            }
                            
                            // Calculate profit/loss
                            if (matchedTrade.direction === 'LONG') {
                              profitPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
                            } else {
                              profitPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
                            }
                            
                            const isProfit = profitPercent > 0;
                            const colorClass = isProfit ? 'text-green-400' : 'text-red-400';
                            const bgClass = isProfit ? 'bg-green-500/10' : 'bg-red-500/10';
                            const borderClass = isProfit ? 'border-green-500/30' : 'border-red-500/30';
                            
                            return (
                              <div 
                                className={`mt-3 p-3 rounded-lg border ${bgClass} ${borderClass} flex items-center justify-center gap-2`}
                                data-testid="trade-result"
                              >
                                <div className="flex items-center gap-2">
                                  {isCompleted && <span className="text-xl">✓</span>}
                                  <span className={`font-semibold ${colorClass}`}>
                                    {isProfit ? '+' : ''}{profitPercent.toFixed(2)}%
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    ({statusLabel})
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="bg-[#1a1a1a] border-[#2a2e39] p-6 sm:p-12">
                {analyzing ? (
                  <div className="flex items-center justify-center gap-3 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Analyzing market structure and order flow...</span>
                  </div>
                ) : marketInsights ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg mb-4">
                        <AlertCircle className="w-5 h-5 text-orange-400" />
                        <span className="font-semibold text-orange-400">No C+ Grade Setups Available</span>
                      </div>
                      {marketInsights.noTradesReason && (
                        <p className="text-gray-300 text-sm mb-4">{marketInsights.noTradesReason}</p>
                      )}
                    </div>
                    
                    {marketInsights.summary && (
                      <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39]">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-4 h-4 text-[#00c4b4]" />
                          <span className="font-semibold text-white">Market Analysis</span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed">{marketInsights.summary}</p>
                      </div>
                    )}
                    
                    {marketInsights.bias && (
                      <div className="bg-[#0e0e0e] p-4 rounded-lg border border-[#2a2e39]">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity className="w-4 h-4 text-[#00c4b4]" />
                          <span className="font-semibold text-white">Market Bias</span>
                        </div>
                        <p className="text-sm text-gray-300">{marketInsights.bias}</p>
                      </div>
                    )}
                    
                    <div className="text-center pt-2">
                      <p className="text-xs text-gray-500">
                        Click "Analyze Trades" again to refresh analysis or change timeframe/symbol for different opportunities
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <Zap className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                    <p className="text-lg">Click "Analyze Trades" to get AI-powered trade alerts</p>
                    <p className="text-sm mt-2">Grades A-E based on order flow confluence</p>
                  </div>
                )}
              </Card>
            )}

            {/* Liquidation Heatmap - Show in Alerts tab for easy reference */}
            <div className="w-full max-w-none mt-6">
              <LiquidationHeatmapChart 
                symbol={symbol} 
                currentPrice={data.length > 0 ? data[data.length - 1].close : undefined}
              />
            </div>

            {/* Professional Orderflow Table - Intermediate+ Tier */}
            {tier !== 'free' && tier !== 'beginner' ? (
              <ProfessionalOrderflowTable 
                symbol={symbol} 
                interval={interval}
                className="mt-6"
              />
            ) : (
              <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/50 mt-6" data-testid="card-orderflow-locked">
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
                          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-6 text-lg font-semibold"
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

            {/* Trading Rules Reference */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39] p-4">
              <div className="text-xs text-gray-500 space-y-2">
                <div className="font-semibold text-gray-400 text-sm mb-2">Advanced Confluence Analysis Rules:</div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[#00ff9d] font-medium mb-2">Long Entry Signals (9 total):</div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      <li>Price mitigates bearish Order Block + bounces</li>
                      <li>Price mitigates bullish FVG + holds as support</li>
                      <li>Bullish hidden divergence (CVD rising, price lower lows)</li>
                      <li>CVD trending higher (bullish delta)</li>
                      <li>Price above POC/VAL + absorption at low volume</li>
                      <li>Buy volume imbalance zone below (support)</li>
                      <li>Liquidity grab below lows + bullish reversal</li>
                      <li>Price rejection from VAL with strong bull candle</li>
                      <li>Bullish absorption (large buy delta, weak price move)</li>
                    </ul>
                  </div>
                  <div>
                    <div className="text-[#ff3b69] font-medium mb-2">Short Entry Signals (9 total):</div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      <li>Price mitigates bullish Order Block + rejects</li>
                      <li>Price mitigates bearish FVG + acts as resistance</li>
                      <li>Bearish hidden divergence (CVD falling, price higher highs)</li>
                      <li>CVD trending lower (bearish delta)</li>
                      <li>Price below POC/VAH + absorption at high volume</li>
                      <li>Sell volume imbalance zone above (resistance)</li>
                      <li>Liquidity grab above highs + bearish reversal</li>
                      <li>Price rejection from VAH with strong bear candle</li>
                      <li>Bearish absorption (large sell delta, weak price move)</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-[#2a2e39]">
                  <div className="font-medium text-gray-400 mb-1">Grading System:</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black rounded font-bold text-[11px]">A+</span>
                    <span className="text-[11px]">7-9 signals (institutional-grade, rare)</span>
                    <span className="px-2 py-0.5 bg-emerald-500 text-black rounded font-semibold text-[11px]">A</span>
                    <span className="text-[11px]">6 signals</span>
                    <span className="px-2 py-0.5 bg-blue-500 text-white rounded font-semibold text-[11px]">B</span>
                    <span className="text-[11px]">5 signals</span>
                    <span className="px-2 py-0.5 bg-yellow-500 text-black rounded font-semibold text-[11px]">C</span>
                    <span className="text-[11px]">3-4 signals</span>
                    <span className="px-2 py-0.5 bg-orange-500 text-white rounded font-semibold text-[11px]">D</span>
                    <span className="text-[11px]">2 signals</span>
                    <span className="px-2 py-0.5 bg-red-500 text-white rounded font-semibold text-[11px]">E</span>
                    <span className="text-[11px]">≤1 signal</span>
                  </div>
                </div>
              </div>
            </Card>
            </div>
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

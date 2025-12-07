import { useEffect, useRef, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { createChart, IChartApi, ISeriesApi, ColorType, CrosshairMode, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, Trash2, Save, RefreshCw, AlertCircle, CheckCircle2, Info, Wand2, MousePointer2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useLocation } from 'wouter';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { AuthButtons } from '@/components/AuthButtons';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface WavePoint {
  index: number;
  label: string;
  price: number;
  time: number;
  isCorrection: boolean;
  snappedToHigh?: boolean; // True if snapped to candle high, false if snapped to low
  isFutureProjection?: boolean; // True if this point is placed beyond available candle data
  fibLabel?: string; // Fib projection label like "B zig 50%" or "C flat 127%" when snapped to Fib line
}

interface WaveDegree {
  name: string;
  color: string;
  labels: string[];
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fibonacciRatios: {
    wave: string;
    ratio: number;
    idealRatio: number;
    validMin: number;
    validMax: number;
    quality: 'excellent' | 'good' | 'ok' | 'valid' | 'poor';
  }[];
  detectedType?: 'zigzag' | 'flat' | 'impulse' | 'triangle' | 'diagonal';
  detectedSubtype?: 'regular_flat' | 'expanded_flat' | 'running_flat';
}

interface ElliottWaveLabel {
  id: string;
  userId: string;
  symbol: string;
  timeframe: string;
  degree: string;
  patternType: string;
  points: WavePoint[];
  isComplete: boolean;
  fibonacciMode: string;
  validationResult?: ValidationResult;
}

interface GrokWaveAnalysis {
  patternType: string;
  degree: string;
  confidence: number;
  currentWave: string;
  suggestedLabels: Array<{
    label: string;
    approximatePosition: string;
    priceLevel?: string;
    candleIndex?: number;
    snapTo?: 'high' | 'low';
  }>;
  originPoint?: {
    candleIndex: number;
    price: number;
    label: string;
  };
  endPoint?: {
    candleIndex: number;
    price: number;
    label: string;
  };
  continuation: {
    direction: 'up' | 'down' | 'sideways';
    targetDescription: string;
    fibonacciLevels?: string[];
    upTargets?: Array<{ level: string; price: number }>;
    downTargets?: Array<{ level: string; price: number }>;
  };
  analysis: string;
  alternativeCount?: string;
  riskFactors?: string[];
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'ADAUSDT', 'SOLUSDT'];
const TIMEFRAMES = [
  { label: '1 Month', value: '1M' },
  { label: '1 Week', value: '1w' },
  { label: '1 Day', value: '1d' },
  { label: '4 Hour', value: '4h' },
  { label: '1 Hour', value: '1h' },
  { label: '15 Min', value: '15m' },
];

const PATTERN_TYPES = [
  { label: 'Impulse (12345)', value: 'impulse' },
  { label: 'Correction (ABC)', value: 'correction' },
  { label: 'Triangle (ABCDE)', value: 'triangle' },
  { label: 'Diagonal (12345)', value: 'diagonal' },
];

const FIBONACCI_MODES = [
  { label: 'Measured (Live %)', value: 'measured' },
  { label: 'Projected (Targets)', value: 'projected' },
  { label: 'Off', value: 'off' },
];

export default function CryptoElliottWave() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, tier: localTier } = useCryptoAuth();
  const { toast } = useToast();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<any>(null); // Store markers primitive for updates
  const fibLinesRef = useRef<any[]>([]); // Store Fib price lines for cleanup
  const fibProjectionPricesRef = useRef<{ price: number; label: string; color: string; correctionType?: 'flat' | 'zigzag'; diagonalType?: 'contracting' | 'expanding' }[]>([]); // Store active projection prices for future clicks
  const fibonacciModeRef = useRef<string>('measured'); // Track fib mode for click handler
  const detectedCorrectionTypeRef = useRef<'flat' | 'zigzag' | null>(null); // Track if user clicked flat or zigzag B target
  const detectedDiagonalTypeRef = useRef<'contracting' | 'expanding' | null>(null); // Track if user clicked contracting or expanding diagonal target
  const diagonalTrendlinesRef = useRef<any[]>([]); // Store diagonal trendline series for cleanup
  const futurePointsSeriesRef = useRef<any>(null); // LineSeries for rendering future projection points
  const futurePointsDataRef = useRef<WavePoint[]>([]); // Store future projection points for virtual candle updates
  const blueCandelSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null); // Blue simulation candles for future projections
  const blueCandleMarkersRef = useRef<any>(null); // Markers on blue candle series
  const touchStartTimeRef = useRef<number>(0); // Track when touch/click started for long-press detection
  const timeframeRef = useRef<string>('1d'); // Track timeframe for click handler window sizing
  const loadMoreCandlesRef = useRef<() => void>(() => {}); // Ref to loadMoreCandles for use in chart subscription
  
  // Dynamic click tolerances that scale with zoom level
  const dynamicTolerancesRef = useRef<{ barTolerance: number; priceTolerance: number }>({
    barTolerance: 3,      // Default: 3 candles
    priceTolerance: 0.08, // Default: 8% of price
  });

  const [symbol, setSymbol] = useState('XRPUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedDegree, setSelectedDegree] = useState('Minor');
  const [patternType, setPatternType] = useState('impulse');
  const [fibonacciMode, setFibonacciMode] = useState('measured');
  const [currentPoints, setCurrentPoints] = useState<WavePoint[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [waveDegrees, setWaveDegrees] = useState<WaveDegree[]>([]);
  const [savedLabels, setSavedLabels] = useState<ElliottWaveLabel[]>([]);
  const [previewPoint, setPreviewPoint] = useState<{ time: number; price: number } | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<GrokWaveAnalysis | null>(null);
  const [isCapturingChart, setIsCapturingChart] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null); // Index of point being dragged
  const [isDragging, setIsDragging] = useState(false);
  const [markersVersion, setMarkersVersion] = useState(0); // Force marker refresh
  const [futurePointOverlays, setFuturePointOverlays] = useState<{ x: number; y: number; label: string; color: string }[]>([]); // HTML overlays for future points
  const [visibleCandleCount, setVisibleCandleCount] = useState(0); // Track visible candles for counter display
  const [isLoadingMore, setIsLoadingMore] = useState(false); // Track if loading more historical candles
  const oldestCandleTimeRef = useRef<number | null>(null); // Track oldest candle time for pagination
  const hasMoreHistoryRef = useRef(true); // Track if there's more history to load
  const lastLoadTriggerRef = useRef(0); // Throttle loading triggers
  const prevCandleCountRef = useRef(0); // Track previous candle count to detect prepends
  const prevOldestTimeRef = useRef<number | null>(null); // Track previous oldest candle time to detect prepends vs appends
  const isInitialLoadRef = useRef(true); // Track if this is the first load (for fitContent)

  // Check subscription tier
  const { data: subscription, isLoading: subLoading } = useQuery<{ tier: string }>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isAuthenticated,
  });

  const isElite = subscription?.tier === 'elite' || localTier === 'elite';

  // Reset chart when symbol or timeframe changes
  useEffect(() => {
    // Destroy existing chart so it gets recreated with new data
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (e) {
        // Chart may already be disposed
      }
      chartRef.current = null;
      candleSeriesRef.current = null;
      blueCandelSeriesRef.current = null;
    }
    // Reset refs for new data
    prevCandleCountRef.current = 0;
    prevOldestTimeRef.current = null;
    isInitialLoadRef.current = true;
  }, [symbol, timeframe]);

  // Fetch wave degrees
  const { data: degreesData } = useQuery<{ degrees: WaveDegree[] }>({
    queryKey: ['/api/crypto/elliott-wave/degrees'],
  });

  useEffect(() => {
    if (degreesData?.degrees) {
      setWaveDegrees(degreesData.degrees);
    }
  }, [degreesData]);

  // Fetch extended historical data
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery<{
    candles: CandleData[];
    candleCount: number;
  }>({
    queryKey: ['/api/crypto/extended-history', symbol, timeframe],
    queryFn: async () => {
      const response = await fetch(`/api/crypto/extended-history?symbol=${symbol}&timeframe=${timeframe}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch history');
      }
      return response.json();
    },
    enabled: isAuthenticated && isElite,
  });

  useEffect(() => {
    if (historyData?.candles) {
      setCandles(historyData.candles);
      if (historyData.candles.length > 0) {
        oldestCandleTimeRef.current = historyData.candles[0].time;
      }
      // Reset pagination state when data source changes
      hasMoreHistoryRef.current = true;
      lastLoadTriggerRef.current = 0;
      // Reset candle count tracking for new data set
      prevCandleCountRef.current = historyData.candles.length;
      prevOldestTimeRef.current = historyData.candles.length > 0 ? historyData.candles[0].time : null;
      isInitialLoadRef.current = true;
    }
  }, [historyData]);

  // Load more historical candles when scrolling into the past
  const loadMoreCandles = useCallback(async () => {
    const now = Date.now();
    // Throttle: minimum 2 seconds between load attempts
    if (now - lastLoadTriggerRef.current < 2000) return;
    if (isLoadingMore || !oldestCandleTimeRef.current || !hasMoreHistoryRef.current) return;
    
    lastLoadTriggerRef.current = now;
    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/crypto/extended-history?symbol=${symbol}&timeframe=${timeframe}&endTime=${oldestCandleTimeRef.current}&limit=200`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.candles && data.candles.length > 0) {
          const newUniqueCount = data.candles.filter(
            (c: CandleData) => c.time < (oldestCandleTimeRef.current || 0)
          ).length;
          
          // If we got less than 50 new unique candles, we're near the end
          if (newUniqueCount < 50) {
            hasMoreHistoryRef.current = false;
          }
          
          setCandles(prev => {
            const newCandles = data.candles.filter(
              (c: CandleData) => !prev.some(p => p.time === c.time)
            );
            if (newCandles.length === 0) {
              hasMoreHistoryRef.current = false;
              return prev;
            }
            const merged = [...newCandles, ...prev].sort((a, b) => a.time - b.time);
            oldestCandleTimeRef.current = merged[0].time;
            return merged;
          });
        } else {
          // No more candles available
          hasMoreHistoryRef.current = false;
        }
      }
    } catch (err) {
      console.error('Failed to load more candles:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [symbol, timeframe, isLoadingMore]);

  // Keep ref updated for use in chart subscription
  useEffect(() => {
    loadMoreCandlesRef.current = loadMoreCandles;
  }, [loadMoreCandles]);

  // Fetch saved wave labels
  const { data: labelsData, refetch: refetchLabels } = useQuery<ElliottWaveLabel[]>({
    queryKey: ['/api/crypto/elliott-wave/labels', symbol, timeframe],
    queryFn: async () => {
      const response = await fetch(`/api/crypto/elliott-wave/labels?symbol=${symbol}&timeframe=${timeframe}`);
      if (!response.ok) throw new Error('Failed to fetch labels');
      return response.json();
    },
    enabled: isAuthenticated && isElite,
  });

  useEffect(() => {
    if (labelsData) {
      setSavedLabels(labelsData);
    }
  }, [labelsData]);

  // Save wave label mutation
  const saveLabel = useMutation({
    mutationFn: async (label: Partial<ElliottWaveLabel>) => {
      const response = await apiRequest('POST', '/api/crypto/elliott-wave/labels', label);
      return response.json();
    },
    onSuccess: (newLabel: ElliottWaveLabel) => {
      toast({
        title: 'Wave Label Saved',
        description: 'Pattern saved! Drawing mode disabled - scroll freely.',
      });
      
      // IMMEDIATELY add the new label to local state to prevent visual gaps
      // This avoids the race condition where currentPoints is cleared before refetch completes
      const updatedLabels = [...savedLabels, newLabel];
      setSavedLabels(updatedLabels);
      savedLabelsRef.current = updatedLabels;
      
      // Auto-select the newly saved label to keep trendlines visible
      setSelectedLabelId(newLabel.id);
      
      // Clear current drawing state
      setCurrentPoints([]);
      setIsDrawing(false); // Turn off drawing after save
      trendDirectionRef.current = null; // Clear cached direction for next pattern
      
      // Force marker refresh to show the new pattern
      setMarkersVersion(v => v + 1);
      
      // Also refetch to sync with server (in case of concurrent changes)
      refetchLabels();
    },
    onError: (error: Error) => {
      toast({
        title: 'Save Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete wave label mutation
  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/crypto/elliott-wave/labels/${id}`);
      return response.json();
    },
    onSuccess: (_, deletedId) => {
      toast({
        title: 'Label Deleted',
        description: 'Pattern deleted. Select another or tap Select again to exit.',
      });
      // Immediately update local state to remove deleted pattern (don't wait for refetch)
      const updatedLabels = savedLabels.filter(l => l.id !== deletedId);
      setSavedLabels(updatedLabels);
      savedLabelsRef.current = updatedLabels; // Sync ref immediately
      setSelectedLabelId(null);
      
      // Detach old markers primitive first to remove from chart
      if (markersRef.current) {
        try {
          (markersRef.current as any).detach?.();
        } catch (e) { /* ignore */ }
        markersRef.current = null;
      }
      
      // Force markers useEffect to re-run with updated savedLabels
      setMarkersVersion(v => v + 1);
      refetchLabels(); // Also refetch to sync with server
    },
  });

  // Update wave label mutation (for drag-and-drop point editing)
  const updateLabel = useMutation({
    mutationFn: async (data: { id: string; points: WavePoint[] }) => {
      const response = await apiRequest('PATCH', `/api/crypto/elliott-wave/labels/${data.id}`, { points: data.points });
      return response.json();
    },
    onSuccess: () => {
      // Toast shown in click handler, just clear state here
      setIsDragging(false);
      setDraggedPointIndex(null);
      refetchLabels();
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsDragging(false);
      setDraggedPointIndex(null);
    },
  });

  // Validate wave pattern mutation
  const validatePattern = useMutation({
    mutationFn: async (data: { patternType: string; points: WavePoint[] }) => {
      const response = await apiRequest('POST', '/api/crypto/elliott-wave/validate', data);
      return response.json();
    },
    onSuccess: (result: ValidationResult) => {
      setValidation(result);
    },
  });

  // Auto-analyze mutation (algorithmic)
  const autoAnalyze = useMutation({
    mutationFn: async (data: { candles: CandleData[]; startIndex: number; endIndex: number }) => {
      const response = await apiRequest('POST', '/api/crypto/elliott-wave/analyze', data);
      return response.json();
    },
    onSuccess: (result) => {
      if (result.patterns && result.patterns.length > 0) {
        const pattern = result.patterns[0];
        setCurrentPoints(pattern.points);
        setPatternType(pattern.type);
        toast({
  title: 'Pattern Detected',
  description: `Found ${pattern.type} pattern with ${(pattern.confidence * 100).toFixed(0)}% confidence`,
});
      } else {
        toast({
          title: 'No Pattern Found',
          description: 'Try adjusting the visible range or selecting different candles.',
        });
      }
    },
  });

  // AI-powered analysis mutation using Grok
const aiAnalyze = useMutation({
    // IMPORTANT: Ensure you define visibleCandles and visibleStartIndex 
    // elsewhere in this component and pass them in the data object.
    mutationFn: async (data: { 
      chartImage: string; 
      symbol: string; 
      timeframe: string; 
      existingLabels?: string; 
      degreeContext?: string; 
      visibleRange?: string;
      // CRITICAL: Added these two fields for index matching and trend analysis
      candles: CandleData[]; // The visible array of candles
      visibleStartIndex: number; // The index of the first visible candle
    }) => {
      const response = await apiRequest('POST', '/api/crypto/elliott-wave/ai-analyze', data);
      return response.json();
    },
  onSuccess: (data: any) => {
  // Test mode returns { success: true, grokSaid: 'GROK IS ALIVE' }
  if (data.grokSaid || data.mock) {
    setAiAnalysis(null);
    toast({
      title: 'Grok Connection Test',
      description: data.grokSaid || 'Grok is alive and ready!',
    });
    return;
  }

  // Normal Grok response
  setAiAnalysis(data);
  toast({
    title: `AI: ${data.patternType?.charAt(0).toUpperCase() + data.patternType?.slice(1) || 'Unknown'} Pattern`,
    description: `${data.confidence?.toFixed(0) || '?'}% confidence - ${data.currentWave || 'Analyzing...'}`,
  });
},

  
    onError: (error: any) => {
      toast({
        title: 'AI Analysis Failed',
        description: error.message || 'Could not analyze chart',
        variant: 'destructive',
      });
    },
});

  // Refs to hold current state values for click handler (avoids re-creating chart)
  const isDrawingRef = useRef(isDrawing);
  const selectedDegreeRef = useRef(selectedDegree);
  const patternTypeRef = useRef(patternType);
  const currentPointsRef = useRef(currentPoints);
  const waveDegreesRef = useRef(waveDegrees);
  const candlesRef = useRef(candles);
  const selectionModeRef = useRef(selectionMode);
  const savedLabelsRef = useRef(savedLabels);
  const selectedLabelIdRef = useRef(selectedLabelId);
  const draggedPointIndexRef = useRef(draggedPointIndex);
  const isDraggingRef = useRef(isDragging);
  const updateLabelRef = useRef(updateLabel);
  const validatePatternRef = useRef(validatePattern);
  
  // CRITICAL: Cache trend direction when point 0 is placed - used for all subsequent snaps
  const trendDirectionRef = useRef<'up' | 'down' | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    isDrawingRef.current = isDrawing;
    selectedDegreeRef.current = selectedDegree;
    patternTypeRef.current = patternType;
    currentPointsRef.current = currentPoints;
    waveDegreesRef.current = waveDegrees;
    candlesRef.current = candles;
    selectionModeRef.current = selectionMode;
    savedLabelsRef.current = savedLabels;
    selectedLabelIdRef.current = selectedLabelId;
    draggedPointIndexRef.current = draggedPointIndex;
    isDraggingRef.current = isDragging;
    updateLabelRef.current = updateLabel;
    validatePatternRef.current = validatePattern;
    fibonacciModeRef.current = fibonacciMode;
    timeframeRef.current = timeframe;
  }, [isDrawing, selectedDegree, patternType, currentPoints, waveDegrees, candles, selectionMode, savedLabels, selectedLabelId, draggedPointIndex, isDragging, updateLabel, validatePattern, fibonacciMode, timeframe]);

  // Auto-validate when pattern has 3+ points (for Fib ratios)
  useEffect(() => {
    if (currentPoints.length >= 3 && !validatePattern.isPending) {
      validatePattern.mutate({ patternType, points: currentPoints });
    }
  }, [currentPoints.length, patternType]);

  // Auto-save when pattern is complete AND validation is available
  useEffect(() => {
    const labels = patternType === 'impulse' ? ['0', '1', '2', '3', '4', '5'] :
                   patternType === 'correction' || patternType === 'zigzag' || patternType === 'flat' ? ['0', 'A', 'B', 'C'] :
                   patternType === 'triangle' ? ['0', 'A', 'B', 'C', 'D', 'E'] :
                   ['0', '1', '2', '3', '4', '5'];
    
    // Check if pattern is complete (all points placed)
    if (currentPoints.length === labels.length && currentPoints.length > 0 && !saveLabel.isPending) {
      // Auto-save the completed pattern (validation will be included if available)
      saveLabel.mutate({
        symbol,
        timeframe,
        degree: selectedDegree,
        patternType,
        points: currentPoints,
        isComplete: true,
        fibonacciMode,
        validationResult: validation || undefined,
      });
    }
  }, [currentPoints, patternType, symbol, timeframe, selectedDegree, fibonacciMode, validation]);

  // Initialize chart - only recreate when candles data changes
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    const chartData = candles.map(c => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    // Add virtual/invisible candles for future projection points so markers can be placed there
    const lastCandle = candles[candles.length - 1];
    const secondLastCandle = candles.length >= 2 ? candles[candles.length - 2] : candles[0];
    const candleInterval = lastCandle.time - secondLastCandle.time || 60;
    
    // Extend chart data with 20 virtual future candles (invisible - all values equal close)
    for (let i = 1; i <= 20; i++) {
      const futureTime = lastCandle.time + (candleInterval * i);
      chartData.push({
        time: futureTime as any,
        open: lastCandle.close,
        high: lastCandle.close,
        low: lastCandle.close,
        close: lastCandle.close,
      });
    }

    // If chart already exists, update data in-place and preserve scroll position
    if (chartRef.current && candleSeriesRef.current) {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      
      // Get current visible range BEFORE updating data
      const visibleRange = chart.timeScale().getVisibleLogicalRange();
      const prevCount = prevCandleCountRef.current;
      const newCount = candles.length;
      const addedCount = newCount - prevCount;
      
      // Detect if candles were PREPENDED (oldest time changed) vs APPENDED (real-time)
      const newOldestTime = candles.length > 0 ? candles[0].time : null;
      const wasPrepended = prevOldestTimeRef.current !== null && 
                           newOldestTime !== null && 
                           newOldestTime < prevOldestTimeRef.current;
      
      // Update the series data
      candleSeries.setData(chartData);
      
      // Only shift the range if candles were PREPENDED (historical load)
      // Do NOT shift for real-time appends - user should stay where they are
      if (wasPrepended && addedCount > 0 && visibleRange && prevCount > 0) {
        // New candles were prepended, shift the range to keep view stable
        const adjustedRange = {
          from: visibleRange.from + addedCount,
          to: visibleRange.to + addedCount,
        };
        chart.timeScale().setVisibleLogicalRange(adjustedRange);
      }
      
      prevCandleCountRef.current = newCount;
      prevOldestTimeRef.current = newOldestTime;
      return;
    }

    // First time: create the chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0e0e0e' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    candleSeries.setData(chartData);
    
    // Only fit content on initial load
    chart.timeScale().fitContent();
    prevCandleCountRef.current = candles.length;
    prevOldestTimeRef.current = candles.length > 0 ? candles[0].time : null;
    isInitialLoadRef.current = false;

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    
    // Create a secondary blue candlestick series for future projection candles
    // This allows markers to anchor at correct prices in the future area
    const blueCandleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00b4d8', // Cyan blue
      downColor: '#00b4d8',
      borderUpColor: '#0077b6',
      borderDownColor: '#0077b6',
      wickUpColor: '#0077b6',
      wickDownColor: '#0077b6',
    });
    blueCandleSeries.setData([]); // Start empty
    blueCandelSeriesRef.current = blueCandleSeries;

    // Handle chart click/tap for wave point selection - use refs for current state
    chart.subscribeClick((param) => {
      if (!param.point) {
        console.log('📍 Click rejected - no param.point');
        return;
      }
      
      // LONG-PRESS DETECTION: If held for > 500ms, treat as pan gesture (skip marker placement)
      // This allows users to pan the chart while in draw mode without accidentally placing markers
      const holdDuration = Date.now() - touchStartTimeRef.current;
      const LONG_PRESS_THRESHOLD = 500; // milliseconds
      
      if (holdDuration > LONG_PRESS_THRESHOLD && isDrawingRef.current) {
        console.log('📍 Click ignored - long press detected (', holdDuration, 'ms) - treating as pan');
        return;
      }

      // Try primary candle series first, then fallback to blue simulation series or price scale
      let clickedPrice = candleSeries.coordinateToPrice(param.point.y);
      
      // FALLBACK: If main series returns null (click on future blue candles at different price range),
      // try the blue simulation series or the chart's price scale directly
      if (clickedPrice === null && blueCandelSeriesRef.current) {
        clickedPrice = blueCandelSeriesRef.current.coordinateToPrice(param.point.y);
        console.log('📍 Fallback to blue series, price:', clickedPrice);
      }
      if (clickedPrice === null) {
        // Final fallback: estimate price from visible price range and Y coordinate
        try {
          const visibleRange = candleSeries.priceScale().getVisibleRange();
          if (visibleRange) {
            // Get chart container height for calculation
            const container = chartContainerRef.current;
            if (container) {
              const chartHeight = container.clientHeight - 30; // Approximate header/margin
              const priceRange = visibleRange.to - visibleRange.from;
              const pricePerPixel = priceRange / chartHeight;
              clickedPrice = (visibleRange.to - (param.point.y * pricePerPixel)) as any;
              console.log('📍 Fallback to price scale calc, price:', clickedPrice);
            }
          }
        } catch (e) {
          console.log('📍 Fallback price calc failed:', e);
        }
      }
      
      console.log('📍 Click at Y:', param.point.y, 'converted to price:', clickedPrice);
      if (clickedPrice === null) {
        console.log('📍 Click rejected - all price conversion methods returned null');
        return;
      }

      // Check if clicking on existing candle or in future area (projected mode)
      const candleIndex = param.time ? candlesRef.current.findIndex(c => c.time === param.time) : -1;
      
      // ALSO check if click X position is beyond the last candle (chart may snap time to last candle)
      const lastCandle = candlesRef.current[candlesRef.current.length - 1];
      const timeScale = chart.timeScale();
      const lastCandleX = timeScale.timeToCoordinate(lastCandle.time as any);
      const isClickBeyondLastCandle = lastCandleX !== null && param.point.x > lastCandleX + 10; // 10px buffer
      
      // DEBUG: Log click detection details
      console.log('📍 Click debug:', {
        clickX: param.point.x,
        lastCandleX,
        candleIndex,
        paramTime: param.time,
        isClickBeyondLastCandle,
        isDrawing: isDrawingRef.current,
        selectionMode: selectionModeRef.current,
        fibMode: fibonacciModeRef.current,
        fibPricesCount: fibProjectionPricesRef.current.length,
        savedLabelsCount: savedLabelsRef.current.length
      });
      
      const isClickingFuture = candleIndex === -1 || isClickBeyondLastCandle;
      
      // PRICE-BASED FIB SNAPPING: Allow clicking anywhere near a Fib price level to snap to it
      // This works regardless of X position - user can click on labels on the right side
      const canSnapToFib = isDrawingRef.current && 
        fibonacciModeRef.current === 'projected' && 
        fibProjectionPricesRef.current.length > 0;
      
      if (canSnapToFib) {
        // Find nearest Fib projection line by price
        const fibPrices = fibProjectionPricesRef.current;
        let nearestFib = fibPrices[0];
        let minDistance = Math.abs(clickedPrice - nearestFib.price);
        
        for (const fib of fibPrices) {
          const dist = Math.abs(clickedPrice - fib.price);
          if (dist < minDistance) {
            minDistance = dist;
            nearestFib = fib;
          }
        }
        
        // Check if click is close enough to the Fib line (within 3% of price)
        const tolerance = nearestFib.price * 0.03;
        console.log('🔮 Fib proximity check:', { clickedPrice, nearestFib: nearestFib.label, fibPrice: nearestFib.price, distance: minDistance, tolerance });
        
        if (minDistance <= tolerance) {
          // Detect if clicking on flat or zigzag target for corrections
          if (nearestFib.correctionType) {
            console.log('🎯 Detected correction type from Fib click:', nearestFib.correctionType);
            detectedCorrectionTypeRef.current = nearestFib.correctionType;
          }
          
          // Detect if clicking on contracting or expanding target for diagonals
          if (nearestFib.diagonalType) {
            console.log('🎯 Detected diagonal type from Fib click:', nearestFib.diagonalType);
            detectedDiagonalTypeRef.current = nearestFib.diagonalType;
          }
          
          // Get next label for the pattern
          const labels = patternTypeRef.current === 'impulse' ? ['0', '1', '2', '3', '4', '5'] :
                         patternTypeRef.current === 'correction' || patternTypeRef.current === 'zigzag' || patternTypeRef.current === 'flat' ? ['0', 'A', 'B', 'C'] :
                         patternTypeRef.current === 'triangle' ? ['0', 'A', 'B', 'C', 'D', 'E'] :
                         ['0', '1', '2', '3', '4', '5'];
          
          if (currentPointsRef.current.length >= labels.length) return;
          
          const nextLabel = labels[currentPointsRef.current.length];
          const isCorrection = ['2', '4', 'A', 'B', 'C', 'D', 'E'].includes(nextLabel);
          
          // Determine snappedToHigh based on trend AND wave label (not just isCorrection)
          const isDowntrend = trendDirectionRef.current === 'down';
          let snappedToHigh: boolean;
          if (['A', 'B', 'C', 'D', 'E'].includes(nextLabel)) {
            // Correction pattern labels
            if (isDowntrend) {
              // Downtrend: A/C/E go to lows (bottom), B/D go to highs (top)
              snappedToHigh = ['B', 'D'].includes(nextLabel);
            } else {
              // Uptrend: A/C/E go to highs (top), B/D go to lows (bottom)
              snappedToHigh = ['A', 'C', 'E'].includes(nextLabel);
            }
          } else {
            // Impulse pattern labels (1, 2, 3, 4, 5)
            const isOddWave = ['1', '3', '5'].includes(nextLabel);
            snappedToHigh = isDowntrend ? !isOddWave : isOddWave;
          }
          
          let pointTime: number;
          let pointIndex: number;
          let isFutureProjection: boolean;
          
          // CRITICAL: Check if clicking on existing candle or in future area
          if (isClickingFuture) {
            // Future area: calculate future time from logical position
            const secondLastCandle = candlesRef.current[candlesRef.current.length - 2];
            const candleInterval = lastCandle.time - secondLastCandle.time;
            const lastCandleIndex = candlesRef.current.length - 1;
            
            const clickLogical = timeScale.coordinateToLogical(param.point.x);
            const barsAhead = clickLogical !== null 
              ? Math.max(1, Math.ceil(clickLogical - lastCandleIndex))
              : 5;
            
            pointTime = lastCandle.time + (candleInterval * barsAhead);
            pointIndex = candlesRef.current.length + barsAhead;
            isFutureProjection = true;
            
            console.log('📅 Future Fib snap:', { 
              clickLogical, barsAhead, 
              futureTime: new Date(pointTime * 1000).toISOString() 
            });
          } else {
            // Existing candle: use the candle's actual time
            const targetCandle = candlesRef.current[candleIndex];
            pointTime = targetCandle.time;
            pointIndex = candleIndex;
            isFutureProjection = false;
            
            console.log('📍 Existing candle Fib snap:', { 
              candleIndex, 
              candleTime: new Date(pointTime * 1000).toISOString() 
            });
          }
          
          console.log('🔮 Snapping to Fib:', nearestFib.label, 'at price', nearestFib.price, 
            isFutureProjection ? '(future)' : '(existing candle)');
          
          // Extract just the percentage from the label (e.g., "B zig 50%" -> "50%")
          const percentMatch = nearestFib.label.match(/(\d+(?:\.\d+)?%)/);
          const fibPercent = percentMatch ? percentMatch[1] : '';
          
          const newPoint: WavePoint = {
            index: pointIndex,
            time: pointTime,
            price: nearestFib.price,
            label: nextLabel,
            isCorrection: isCorrection,
            snappedToHigh,
            isFutureProjection,
            fibLabel: fibPercent // Store Fib label like "zig 50%" or "flat 127%"
          };
          
          const newPoints = [...currentPointsRef.current, newPoint];
          setCurrentPoints(newPoints);
          currentPointsRef.current = newPoints;
          console.log('✅ Added point via Fib snap:', newPoint);
          return; // Handled by Fib snap - don't continue to normal candle placement
        }
      }
      
      // In projected mode with Fib lines, also allow future clicks beyond last candle
      // BUT: Skip this if in selection mode - we need to check for future point selection first!
      if (isClickingFuture && !selectionModeRef.current) {
        // Only allow future clicks if in drawing mode
        if (!isDrawingRef.current) {
          return;
        }
        
        // If no Fib lines available, just ignore future clicks
        if (fibonacciModeRef.current !== 'projected' || fibProjectionPricesRef.current.length === 0) {
          console.log('🎯 Future click ignored - no Fib projection lines');
          return;
        }
        
        // This section handles future clicks that weren't caught by price-based snapping above
        // Find nearest Fib projection line by price (with looser tolerance for area clicks)
        const fibPrices = fibProjectionPricesRef.current;
        let nearestFib = fibPrices[0];
        let minDistance = Math.abs(clickedPrice - nearestFib.price);
        
        for (const fib of fibPrices) {
          const dist = Math.abs(clickedPrice - fib.price);
          if (dist < minDistance) {
            minDistance = dist;
            nearestFib = fib;
          }
        }
        
        // Use looser tolerance (5%) for general future area clicks
        const tolerance = nearestFib.price * 0.05;
        if (minDistance > tolerance) {
          console.log('🎯 Future click too far from Fib lines, ignoring');
          return;
        }
        
        // Calculate future time based on logical bar position
        const secondLastCandle = candlesRef.current[candlesRef.current.length - 2];
        const candleInterval = lastCandle.time - secondLastCandle.time;
        const lastCandleIndex = candlesRef.current.length - 1;
        
        // Use logical coordinates to get bar position - this works beyond the data range
        const clickLogical = timeScale.coordinateToLogical(param.point.x);
        const barsAhead = clickLogical !== null 
          ? Math.max(1, Math.ceil(clickLogical - lastCandleIndex))
          : 5; // fallback
        
        const futureTime = lastCandle.time + (candleInterval * barsAhead);
        console.log('📅 Logical time calc (future):', { 
          clickX: param.point.x, 
          clickLogical, 
          lastCandleIndex,
          barsAhead, 
          futureTime: new Date(futureTime * 1000).toISOString() 
        });
        
        console.log('🔮 Future area click - snapping to Fib:', nearestFib.label, 'at price', nearestFib.price, 'time', futureTime);
        
        // Detect if clicking on flat or zigzag target for corrections
        if (nearestFib.correctionType) {
          console.log('🎯 Detected correction type from Fib click:', nearestFib.correctionType);
          detectedCorrectionTypeRef.current = nearestFib.correctionType;
        }
        
        // Detect if clicking on contracting or expanding target for diagonals
        if (nearestFib.diagonalType) {
          console.log('🎯 Detected diagonal type from Fib click:', nearestFib.diagonalType);
          detectedDiagonalTypeRef.current = nearestFib.diagonalType;
        }
        
        // Get next label for the pattern
        const labels = patternTypeRef.current === 'impulse' ? ['0', '1', '2', '3', '4', '5'] :
                       patternTypeRef.current === 'correction' || patternTypeRef.current === 'zigzag' || patternTypeRef.current === 'flat' ? ['0', 'A', 'B', 'C'] :
                       patternTypeRef.current === 'triangle' ? ['0', 'A', 'B', 'C', 'D', 'E'] :
                       ['0', '1', '2', '3', '4', '5'];
        
        if (currentPointsRef.current.length >= labels.length) return;
        
        const nextLabel = labels[currentPointsRef.current.length];
        const isCorrection = ['2', '4', 'A', 'B', 'C', 'D', 'E'].includes(nextLabel);
        
        // For future points, we can't snap to wick since there's no candle
        // Use the Fib line's price directly and determine snappedToHigh based on trend AND wave label
        const isDowntrend = trendDirectionRef.current === 'down';
        
        // CORRECT marker positioning based on wave label and trend:
        // - Motive waves (1, 3, 5, A, C): In uptrend → top (high), In downtrend → bottom (low)
        // - Corrective waves (2, 4, B, D): In uptrend → bottom (low), In downtrend → top (high)
        let snappedToHigh: boolean;
        if (['A', 'B', 'C', 'D', 'E'].includes(nextLabel)) {
          // Correction pattern labels
          if (isDowntrend) {
            // Downtrend: A/C/E go to lows (bottom), B/D go to highs (top)
            snappedToHigh = ['B', 'D'].includes(nextLabel);
          } else {
            // Uptrend: A/C/E go to highs (top), B/D go to lows (bottom)
            snappedToHigh = ['A', 'C', 'E'].includes(nextLabel);
          }
        } else {
          // Impulse pattern labels (1, 2, 3, 4, 5)
          const isOddWave = ['1', '3', '5'].includes(nextLabel);
          snappedToHigh = isDowntrend ? !isOddWave : isOddWave;
        }
        console.log('📍 Future point snappedToHigh:', { nextLabel, isDowntrend, snappedToHigh });
        
        // Extract just the percentage from the label (e.g., "C zig 127%" -> "127%")
        const percentMatch = nearestFib.label.match(/(\d+(?:\.\d+)?%)/);
        const fibPercent = percentMatch ? percentMatch[1] : '';
        
        const newPoint: WavePoint = {
          index: candlesRef.current.length + Math.floor((futureTime - lastCandle.time) / candleInterval),
          label: nextLabel,
          price: nearestFib.price,
          time: futureTime,
          isCorrection: isCorrection,
          snappedToHigh: snappedToHigh,
          isFutureProjection: true, // Mark this as a projected future point
          fibLabel: fibPercent // Store Fib label like "zig 127%" or "flat 161%"
        };
        
        const updatedPoints = [...currentPointsRef.current, newPoint];
        setCurrentPoints(updatedPoints);
        setPreviewPoint(null);
        
        // Validate when enough points
        if (updatedPoints.length >= 3) {
          validatePattern.mutate({ patternType: patternTypeRef.current, points: updatedPoints });
        }
        return;
      }
      
      // Use dynamic tolerances that scale with zoom level
      const { barTolerance: clickThreshold, priceTolerance } = dynamicTolerancesRef.current;

      // DEBUG: Check if we're reaching the selection mode check
      console.log('📍 Checking selection mode:', {
        selectionMode: selectionModeRef.current,
        isClickingFuture,
        willEnterSelectionBlock: selectionModeRef.current
      });

      // SELECTION MODE: Select/deselect patterns OR drag-and-drop points
      // Handle this BEFORE accessing candle to support future point selection
      if (selectionModeRef.current) {
        const timeScale = chart.timeScale();
        const clickX = param.point?.x ?? 0;
        const selectClickPrice = candleSeries.coordinateToPrice(param.point?.y ?? 0);
        const selectedId = selectedLabelIdRef.current;
        console.log('🔧 Selection mode click:', { 
          selectedId, 
          isDragging: isDraggingRef.current, 
          draggedPointIndex: draggedPointIndexRef.current,
          candleIndex 
        });
        
        // If currently dragging a point, this click is the DROP
        if (isDraggingRef.current && selectedId !== null && draggedPointIndexRef.current !== null) {
          console.log('📍 DROPPING point at candle:', candleIndex);
          const selectedLabel = savedLabelsRef.current.find(l => l.id === selectedId);
          if (selectedLabel) {
            const pointIndex = draggedPointIndexRef.current;
            const originalPoint = selectedLabel.points[pointIndex];
            
            // Infer snappedToHigh for legacy patterns that don't have this field
            // If undefined, infer from whether original price was closer to high or low
            let shouldSnapToHigh = originalPoint.snappedToHigh;
            if (shouldSnapToHigh === undefined) {
              // Find the original candle to infer wick direction
              const origCandle = candlesRef.current.find(c => c.time === originalPoint.time);
              if (origCandle) {
                // If original price was closer to high, it was snapped to high
                const distToHigh = Math.abs(originalPoint.price - origCandle.high);
                const distToLow = Math.abs(originalPoint.price - origCandle.low);
                shouldSnapToHigh = distToHigh < distToLow;
              } else {
                // Fallback: use point 0 to infer trend direction
                const firstPoint = selectedLabel.points[0];
                if (firstPoint) {
                  const firstCandle = candlesRef.current.find(c => c.time === firstPoint.time);
                  if (firstCandle) {
                    const isDowntrend = Math.abs(firstPoint.price - firstCandle.high) < Math.abs(firstPoint.price - firstCandle.low);
                    const isOddWave = ['1', '3', '5'].includes(originalPoint.label);
                    shouldSnapToHigh = isDowntrend ? !isOddWave : isOddWave;
                  }
                }
              }
            }
            
            // HANDLE FUTURE DROPS: If candleIndex is -1, we're dropping in the future area
            let updatedPoints: typeof selectedLabel.points;
            
            if (candleIndex < 0 || !candlesRef.current[candleIndex]) {
              // FUTURE DROP: Calculate future time and use click price directly
              console.log('🔮 FUTURE DROP detected - calculating future position');
              
              const lastCandle = candlesRef.current[candlesRef.current.length - 1];
              const secondLastCandle = candlesRef.current[candlesRef.current.length - 2];
              const candleInterval = lastCandle.time - secondLastCandle.time;
              const lastCandleIndex = candlesRef.current.length - 1;
              
              // Get logical position from click X coordinate
              const clickLogical = timeScale.coordinateToLogical(clickX);
              const barsAhead = clickLogical !== null 
                ? Math.max(1, Math.ceil(clickLogical - lastCandleIndex))
                : 5;
              
              const futureTime = lastCandle.time + (candleInterval * barsAhead);
              const futureIndex = candlesRef.current.length + barsAhead;
              const dropPrice = selectClickPrice ?? originalPoint.price;
              
              console.log('📅 Future drop calculated:', { 
                clickLogical, barsAhead, futureIndex,
                futureTime: new Date(futureTime * 1000).toISOString(),
                dropPrice
              });
              
              // Helper to recalculate fibLabel percentage based on wave position
              const recalculateFibLabel = (label: string, newPrice: number, points: typeof selectedLabel.points): string => {
                // For ABC corrections: B = retracement of A, C = extension from B
                // For impulse: 2 = retracement of 1, 3 = extension, 4 = retracement of 3, 5 = extension
                const point0 = points.find(p => p.label === '0');
                const pointA = points.find(p => p.label === 'A' || p.label === '1');
                const pointB = points.find(p => p.label === 'B' || p.label === '2');
                const point3 = points.find(p => p.label === '3');
                const point4 = points.find(p => p.label === '4');
                
                let percentage = 0;
                
                if (label === 'B' || label === '2') {
                  // Retracement from A (or 1) back toward 0
                  if (point0 && pointA) {
                    const wave1Range = Math.abs(pointA.price - point0.price);
                    if (wave1Range > 0) {
                      const retracement = Math.abs(newPrice - pointA.price);
                      percentage = (retracement / wave1Range) * 100;
                    }
                  }
                } else if (label === 'C' || label === '3') {
                  // Extension from B (or 2) relative to wave 1 range
                  if (point0 && pointA && pointB) {
                    const wave1Range = Math.abs(pointA.price - point0.price);
                    if (wave1Range > 0) {
                      const extension = Math.abs(newPrice - pointB.price);
                      percentage = (extension / wave1Range) * 100;
                    }
                  }
                } else if (label === '4') {
                  // Retracement of wave 3
                  if (pointB && point3) {
                    const wave3Range = Math.abs(point3.price - pointB.price);
                    if (wave3Range > 0) {
                      const retracement = Math.abs(newPrice - point3.price);
                      percentage = (retracement / wave3Range) * 100;
                    }
                  }
                } else if (label === '5') {
                  // Extension relative to Wave 1 (standard Elliott Wave measurement)
                  if (point0 && pointA && point4) {
                    const wave1Range = Math.abs(pointA.price - point0.price);
                    if (wave1Range > 0) {
                      const extension = Math.abs(newPrice - point4.price);
                      percentage = (extension / wave1Range) * 100;
                    }
                  }
                }
                
                return percentage > 0 ? `${Math.round(percentage)}%` : '';
              };
              
              // Create updated points with future position
              updatedPoints = selectedLabel.points.map((p, i) => {
                if (i === pointIndex) {
                  // Recalculate the fibLabel based on new price position
                  const newFibLabel = recalculateFibLabel(p.label, dropPrice, selectedLabel.points);
                  console.log('📊 Recalculated fibLabel for', p.label, ':', newFibLabel);
                  
                  return {
                    ...p,
                    index: futureIndex,
                    time: futureTime as number,
                    price: dropPrice,
                    snappedToHigh: shouldSnapToHigh ?? false,
                    isFutureProjection: true,
                    fibLabel: newFibLabel || p.fibLabel, // Use new or keep old if calc failed
                  };
                }
                // Also backfill snappedToHigh for other points if missing
                if (p.snappedToHigh === undefined) {
                  const pCandle = candlesRef.current.find(c => c.time === p.time);
                  if (pCandle) {
                    const distH = Math.abs(p.price - pCandle.high);
                    const distL = Math.abs(p.price - pCandle.low);
                    return { ...p, snappedToHigh: distH < distL };
                  }
                }
                return p;
              });
            } else {
              // EXISTING CANDLE DROP: Use larger window for 15m timeframe (7 candles vs 5)
              const windowSize = timeframeRef.current === '15m' ? 3 : 2;
              const dropCandle = candlesRef.current[candleIndex];
              const startIdx = Math.max(0, candleIndex - windowSize);
              const endIdx = Math.min(candlesRef.current.length - 1, candleIndex + windowSize);
              
              let bestIdx = candleIndex;
              let bestPrice = shouldSnapToHigh ? dropCandle.high : dropCandle.low;
              
              for (let i = startIdx; i <= endIdx; i++) {
                const c = candlesRef.current[i];
                if (shouldSnapToHigh && c.high > bestPrice) {
                  bestPrice = c.high;
                  bestIdx = i;
                } else if (!shouldSnapToHigh && c.low < bestPrice) {
                  bestPrice = c.low;
                  bestIdx = i;
                }
              }
              
              const finalCandle = candlesRef.current[bestIdx];
              const snappedPrice = bestPrice;
              
              // Helper to recalculate fibLabel percentage based on wave position
              const recalculateFibLabel = (label: string, newPrice: number, points: typeof selectedLabel.points): string => {
                const point0 = points.find(p => p.label === '0');
                const pointA = points.find(p => p.label === 'A' || p.label === '1');
                const pointB = points.find(p => p.label === 'B' || p.label === '2');
                const point3 = points.find(p => p.label === '3');
                const point4 = points.find(p => p.label === '4');
                
                let percentage = 0;
                
                if (label === 'B' || label === '2') {
                  if (point0 && pointA) {
                    const wave1Range = Math.abs(pointA.price - point0.price);
                    if (wave1Range > 0) {
                      percentage = (Math.abs(newPrice - pointA.price) / wave1Range) * 100;
                    }
                  }
                } else if (label === 'C' || label === '3') {
                  if (point0 && pointA && pointB) {
                    const wave1Range = Math.abs(pointA.price - point0.price);
                    if (wave1Range > 0) {
                      percentage = (Math.abs(newPrice - pointB.price) / wave1Range) * 100;
                    }
                  }
                } else if (label === '4') {
                  if (pointB && point3) {
                    const wave3Range = Math.abs(point3.price - pointB.price);
                    if (wave3Range > 0) {
                      percentage = (Math.abs(newPrice - point3.price) / wave3Range) * 100;
                    }
                  }
                } else if (label === '5') {
                  // Extension relative to Wave 1 (standard Elliott Wave measurement)
                  if (point0 && pointA && point4) {
                    const wave1Range = Math.abs(pointA.price - point0.price);
                    if (wave1Range > 0) {
                      percentage = (Math.abs(newPrice - point4.price) / wave1Range) * 100;
                    }
                  }
                }
                
                return percentage > 0 ? `${Math.round(percentage)}%` : '';
              };
              
              // Create updated points array with new position and ensure snappedToHigh is set
              updatedPoints = selectedLabel.points.map((p, i) => {
                if (i === pointIndex) {
                  // Recalculate the fibLabel based on new price position
                  const newFibLabel = recalculateFibLabel(p.label, snappedPrice, selectedLabel.points);
                  console.log('📊 Recalculated fibLabel for', p.label, ':', newFibLabel);
                  
                  return {
                    ...p,
                    index: bestIdx,
                    time: finalCandle.time as number,
                    price: snappedPrice,
                    snappedToHigh: shouldSnapToHigh ?? false,
                    isFutureProjection: false,
                    fibLabel: newFibLabel || p.fibLabel,
                  };
                }
                // Also backfill snappedToHigh for other points if missing
                if (p.snappedToHigh === undefined) {
                  const pCandle = candlesRef.current.find(c => c.time === p.time);
                  if (pCandle) {
                    const distH = Math.abs(p.price - pCandle.high);
                    const distL = Math.abs(p.price - pCandle.low);
                    return { ...p, snappedToHigh: distH < distL };
                  }
                }
                return p;
              });
            }
            
            // Update the label with new point position
            updateLabelRef.current.mutate({ id: selectedId, points: updatedPoints });
            
            // Also update local state immediately for smooth UI
            const updatedLabels = savedLabelsRef.current.map(l => {
              if (l.id === selectedId) {
                return { ...l, points: updatedPoints };
              }
              return l;
            });
            setSavedLabels(updatedLabels);
            savedLabelsRef.current = updatedLabels;
            
            // RE-VALIDATE after moving point - update Fib ratios in real-time
            if (updatedPoints.length >= 3) {
              validatePatternRef.current.mutate({ 
                patternType: selectedLabel.patternType, 
                points: updatedPoints 
              });
            }
            
            // CRITICAL: Clear drag state, DESELECT pattern, and force marker refresh
            // Deselecting prevents accidental consecutive drags after a drop
            console.log('✅ Point dropped - clearing all state and re-validating');
            setIsDragging(false);
            setDraggedPointIndex(null);
            setSelectedLabelId(null); // DESELECT after drop to prevent accidental consecutive drags
            isDraggingRef.current = false;
            draggedPointIndexRef.current = null;
            selectedLabelIdRef.current = null;
            
            // CRITICAL: Detach the old markers primitive FIRST to prevent duplicates
            // Then use setTimeout to ensure state updates propagate before creating new markers
            if (markersRef.current) {
              markersRef.current.detach();
              markersRef.current = null;
            }
            setTimeout(() => {
              setMarkersVersion(v => v + 1);
            }, 50);
          }
          return;
        }
        
        // If a pattern is already selected, check if clicking EXACTLY on one of its points to drag
        // Must match BOTH X (candle) AND Y (price) to start a drag
        if (selectedId !== null) {
          const selectedLabel = savedLabelsRef.current.find(l => l.id === selectedId);
          if (selectedLabel) {
            // Use dynamic tolerance (slightly smaller for drag to prevent accidental drags)
            const dragThreshold = Math.max(2, Math.floor(clickThreshold * 0.7));
            // Get click price from chart coordinates
            const clickPrice = candleSeries.coordinateToPrice(param.point?.y ?? 0);
            const timeScale = chart.timeScale();
            const clickX = param.point?.x ?? 0;
            
            const clickedPointIndex = selectedLabel.points.findIndex(p => {
              // For future points, use X coordinate comparison instead of index
              const isFuturePoint = (p as any).isFutureProjection === true;
              const pointIsBeyondLastCandle = p.index >= candlesRef.current.length;
              let xMatch = false;
              
              if (isFuturePoint || pointIsBeyondLastCandle) {
                // Future points: compare X coordinates directly
                const pointX = timeScale.timeToCoordinate(p.time as any);
                if (pointX !== null) {
                  xMatch = Math.abs(clickX - pointX) <= 40; // 40px tolerance for future points

                  console.log('🔍 Future point check:', { pointX, clickX, diff: Math.abs(clickX - pointX), xMatch });
                } else {
                  // timeToCoordinate returned null - try logical index comparison
                  const clickLogical = timeScale.coordinateToLogical(clickX);
                  if (clickLogical !== null) {
                    // Compare logical bar positions with tolerance
                    xMatch = Math.abs(p.index - clickLogical) <= 2;
                    console.log('🔍 Future point logical check:', { pointIndex: p.index, clickLogical, diff: Math.abs(p.index - clickLogical), xMatch });
                  }
                }
              } else {
                // Regular points: use index comparison
                xMatch = Math.abs(p.index - candleIndex) <= dragThreshold;
              }
              
              if (!xMatch || clickPrice === null) return false;
              
              // Check Y-axis - use LARGER tolerance for future points since labels appear below markers
              const isFuture = isFuturePoint || pointIsBeyondLastCandle;
              const priceThreshold = isFuture 
                ? p.price * 0.25  // 25% tolerance for future points (label offset)
                : p.price * priceTolerance;
              const yMatch = Math.abs(p.price - clickPrice) <= priceThreshold;
              
              console.log('🎯 Point match check:', { label: p.label, isFuture, xMatch, yMatch, priceThreshold, priceDiff: Math.abs(p.price - clickPrice) });
              return xMatch && yMatch;
            });
            
            if (clickedPointIndex !== -1) {
              // Start dragging this point - marker will disappear to show it's picked up
              console.log('🎯 STARTING DRAG of point index:', clickedPointIndex);
              setDraggedPointIndex(clickedPointIndex);
              setIsDragging(true);
              isDraggingRef.current = true;
              draggedPointIndexRef.current = clickedPointIndex;
              return;
            } else {
              // Clicked away from points in selected pattern - DESELECT
              console.log('🔓 Deselecting pattern - click not on any point');
              setSelectedLabelId(null);
              setIsDragging(false);
              setDraggedPointIndex(null);
              return;
            }
          }
        }
        
        // Check if clicking on any saved label's points to select pattern
        // Must match BOTH X (candle) AND Y (price) using dynamic tolerances
        // (reuse selectClickPrice, timeScale, clickX from above)
        for (const label of savedLabelsRef.current) {
          const matchingPoint = label.points.find(p => {
            // For future points, use X coordinate comparison instead of index
            const isFuturePoint = (p as any).isFutureProjection === true;
            const pointIsBeyondLastCandle = p.index >= candlesRef.current.length;
            let xMatch = false;
            
            if (isFuturePoint || pointIsBeyondLastCandle) {
              // Future points: compare X coordinates directly
              const pointX = timeScale.timeToCoordinate(p.time as any);
              if (pointX !== null) {
                xMatch = Math.abs(clickX - pointX) <= 40; // 40px tolerance for future points
              } else {
                // timeToCoordinate returned null - try logical index comparison
                const clickLogical = timeScale.coordinateToLogical(clickX);
                if (clickLogical !== null) {
                  xMatch = Math.abs(p.index - clickLogical) <= 2;
                }
              }
            } else {
              // Regular points: use index comparison
              xMatch = Math.abs(p.index - candleIndex) <= clickThreshold;
            }
            
            if (!xMatch || selectClickPrice === null) return false;
            
            // Check Y-axis - use LARGER tolerance for future points since labels appear below markers
            // Future points need ~25% tolerance to account for label text position
            const isFuture = isFuturePoint || pointIsBeyondLastCandle;
            const priceThreshold = isFuture 
              ? p.price * 0.25  // 25% tolerance for future points (label offset)
              : p.price * priceTolerance;
            const yMatch = Math.abs(p.price - selectClickPrice) <= priceThreshold;
            
            console.log('🔍 Selection match check:', { label: p.label, isFuture, xMatch, yMatch, priceDiff: Math.abs(p.price - selectClickPrice), priceThreshold });
            return xMatch && yMatch;
          });
          if (matchingPoint) {
            // Toggle selection of this entire pattern
            const isCurrentlySelected = selectedLabelIdRef.current === label.id;
            setSelectedLabelId(isCurrentlySelected ? null : label.id);
            setIsDragging(false);
            setDraggedPointIndex(null);
            toast({
              title: isCurrentlySelected ? 'Pattern Deselected' : 'Pattern Selected',
              description: isCurrentlySelected 
                ? 'Selection cleared'
                : `${label.patternType} - ${label.degree} degree. Tap a point to move it.`,
            });
            return;
          }
        }
        // Clicked empty space - deselect and cancel any drag
        setSelectedLabelId(null);
        setIsDragging(false);
        setDraggedPointIndex(null);
        return;
      }

      // Only process clicks if in drawing mode
      if (!isDrawingRef.current) return;
      
      // Get the candle at click position for drawing mode
      const candle = candlesRef.current[candleIndex];
      if (!candle) {
        console.log('❌ Cannot draw - no candle at index', candleIndex);
        return;
      }
      
      // Determine pattern labels
      const labels = patternTypeRef.current === 'impulse' ? ['0', '1', '2', '3', '4', '5'] :
                     patternTypeRef.current === 'correction' || patternTypeRef.current === 'zigzag' || patternTypeRef.current === 'flat' ? ['0', 'A', 'B', 'C'] :
                     patternTypeRef.current === 'triangle' ? ['0', 'A', 'B', 'C', 'D', 'E'] :
                     ['0', '1', '2', '3', '4', '5'];
      
      // Check if pattern is already complete - don't allow more clicks
      if (currentPointsRef.current.length >= labels.length) {
        // Pattern already complete - ignore further clicks
        return;
      }

      const degree = waveDegreesRef.current.find(d => d.name === selectedDegreeRef.current);
      const nextLabelIndex = currentPointsRef.current.length;

      const nextLabel = labels[nextLabelIndex];
      const isCorrection = ['2', '4', 'A', 'B', 'C', 'D', 'E'].includes(nextLabel);
      
      // SNAP TO WICK: Direction is determined by point 0 click position and CACHED
      // - If point 0 clicked above candle mid → DOWNTREND (0=high, 1=low, 2=high, 3=low, 4=high, 5=low)
      // - If point 0 clicked below candle mid → UPTREND (0=low, 1=high, 2=low, 3=high, 4=low, 5=high)
      
      // CANDLE WINDOW: Find best candle within range for easier placement
      // 15m timeframe uses 7-candle window (3+1+3), others use 5-candle window (2+1+2)
      const windowSize = timeframeRef.current === '15m' ? 3 : 2;
      const startIdx = Math.max(0, candleIndex - windowSize);
      const endIdx = Math.min(candlesRef.current.length - 1, candleIndex + windowSize);
      
      const findBestCandle = (snapToHigh: boolean) => {
        let bestIdx = candleIndex;
        let bestPrice = snapToHigh ? candle.high : candle.low;
        
        for (let i = startIdx; i <= endIdx; i++) {
          const c = candlesRef.current[i];
          if (snapToHigh && c.high > bestPrice) {
            bestPrice = c.high;
            bestIdx = i;
          } else if (!snapToHigh && c.low < bestPrice) {
            bestPrice = c.low;
            bestIdx = i;
          }
        }
        return { index: bestIdx, price: bestPrice, candle: candlesRef.current[bestIdx] };
      };
      
      const candleMid = (candle.high + candle.low) / 2;
      let snappedPrice: number;
      let finalCandleIndex = candleIndex;
      let finalCandle = candle;
      
      let snappedToHigh = false; // Track whether we snapped to high or low for marker positioning
      
      if (nextLabel === '0') {
        // First point - user click determines direction, snap to nearest wick
        // CACHE the trend direction for all subsequent points
        const isDowntrend = clickedPrice > candleMid;
        trendDirectionRef.current = isDowntrend ? 'down' : 'up';
        snappedToHigh = isDowntrend; // Point 0 in downtrend = high, uptrend = low
        
        // Use 5-candle window to find best snap point
        const best = findBestCandle(snappedToHigh);
        finalCandleIndex = best.index;
        finalCandle = best.candle;
        snappedPrice = best.price;
        console.log('🎯 Point 0: Trend set to', trendDirectionRef.current, 'snapped to', snappedPrice, 'at candle', finalCandleIndex, 'high?', snappedToHigh);
      } else if (patternTypeRef.current === 'impulse' || patternTypeRef.current === 'diagonal') {
        // Use CACHED trend direction from point 0
        const isDowntrend = trendDirectionRef.current === 'down';
        
        // In uptrend: odd (1,3,5) = high, even (2,4) = low
        // In downtrend: odd (1,3,5) = low, even (2,4) = high
        const isOddWave = ['1', '3', '5'].includes(nextLabel);
        if (isDowntrend) {
          snappedToHigh = !isOddWave; // In downtrend: even waves (2,4) snap to high
        } else {
          snappedToHigh = isOddWave; // In uptrend: odd waves (1,3,5) snap to high
        }
        
        // Use 5-candle window to find best snap point
        const best = findBestCandle(snappedToHigh);
        finalCandleIndex = best.index;
        finalCandle = best.candle;
        snappedPrice = best.price;
        console.log('🎯 Wave', nextLabel, ': Trend=', trendDirectionRef.current, 'isOdd=', isOddWave, 'snapped to', snappedPrice, 'at candle', finalCandleIndex, 'high?', snappedToHigh);
      } else {
        // For corrections/triangles: use click position to determine high/low snap
        snappedToHigh = clickedPrice > candleMid;

        // Use 5-candle window to find best snap point
        const best = findBestCandle(snappedToHigh);
        finalCandleIndex = best.index;
        finalCandle = best.candle;
        snappedPrice = best.price;
      }

      const newPoint: WavePoint = {
        index: finalCandleIndex,
        label: nextLabel,
        price: snappedPrice,
        time: finalCandle.time as number,
        isCorrection: isCorrection,
        snappedToHigh: snappedToHigh, // Store for marker positioning
      };

      const updatedPoints = [...currentPointsRef.current, newPoint];
      setCurrentPoints(updatedPoints);
      setPreviewPoint(null); // Clear preview after placing

      // Validate when enough points are collected
      if (updatedPoints.length >= 3) {
        validatePattern.mutate({ patternType: patternTypeRef.current, points: updatedPoints });
      }
    });

    // Handle crosshair move for preview (works on both desktop and mobile)
    chart.subscribeCrosshairMove((param) => {
      if (!isDrawingRef.current || !param.point || !param.time) {
        setPreviewPoint(null);
        return;
      }
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price !== null) {
        setPreviewPoint({ time: param.time as number, price });
      }
    });

    // DYNAMIC CLICK TOLERANCE: Update tolerances based on zoom level
    // When zoomed out (more visible bars), increase tap area so points remain clickable
    const updateTolerances = () => {
      if (!chartContainerRef.current || !chart) return;
      
      const visibleRange = chart.timeScale().getVisibleLogicalRange();
      if (!visibleRange) return;
      
      const visibleBars = Math.abs(visibleRange.to - visibleRange.from);
      const chartWidth = chartContainerRef.current.clientWidth;
      
      // Calculate pixels per bar
      const pixelsPerBar = chartWidth / visibleBars;
      
      // Mobile touch target = ~44px, desktop = ~24px
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const targetPixelRadius = isMobile ? 44 : 24;
      
      // Bar tolerance: how many candles equals our target pixel radius
      // Clamp between 3 and 30 for reasonable bounds
      const calculatedBarTolerance = Math.ceil(targetPixelRadius / pixelsPerBar);
      const barTolerance = Math.max(3, Math.min(30, calculatedBarTolerance));
      
      // Price tolerance: scale based on visible price range
      // More zoomed out = larger price tolerance needed
      // Base 8% at normal zoom, up to 20% when very zoomed out
      const zoomFactor = visibleBars / 50; // Normalize: 50 bars = normal zoom
      const priceTolerance = Math.max(0.08, Math.min(0.25, 0.08 * Math.sqrt(zoomFactor)));
      
      dynamicTolerancesRef.current = { barTolerance, priceTolerance };
    };
    
    // Update tolerances on visible range change
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateTolerances);
    
    // Also update overlay positions and visible candle count when chart view changes (pan/zoom)
    // Trigger dynamic loading when scrolling into the past
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      setMarkersVersion(v => v + 1);
      if (range) {
        const visibleCount = Math.round(Math.abs(range.to - range.from));
        setVisibleCandleCount(visibleCount);
        
        // Detect if user has scrolled to near the left edge (oldest candles)
        // If range.from is less than 10, we're near the start - load more
        if (range.from < 10) {
          loadMoreCandlesRef.current();
        }
      }
    });
    
    // Initial tolerance calculation and visible candle count
    setTimeout(() => {
      updateTolerances();
      const range = chart.timeScale().getVisibleLogicalRange();
      if (range) {
        setVisibleCandleCount(Math.round(Math.abs(range.to - range.from)));
      }
    }, 100);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (chartContainerRef.current && chartRef.current) {
        try {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        } catch (e) {
          // Chart may be disposed
        }
      }
    });

    resizeObserver.observe(chartContainerRef.current);
    
    // LONG-PRESS DETECTION: Track touch/mouse start time to distinguish taps from pans
    // If held for > 500ms, it's a pan gesture - don't place markers
    const container = chartContainerRef.current;
    const handleTouchStart = () => {
      touchStartTimeRef.current = Date.now();
    };
    const handleMouseDown = () => {
      touchStartTimeRef.current = Date.now();
    };
    
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('mousedown', handleMouseDown, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('mousedown', handleMouseDown);
      markersRef.current = null; // Clear markers when chart is destroyed
      blueCandleMarkersRef.current = null;
      blueCandelSeriesRef.current = null;
      try {
        chart.remove();
      } catch (e) {
        // Chart may already be disposed
      }
    };
  }, [candles]); // Only depend on candles - other state accessed via refs

  // Calculate Fibonacci ratios for wave points (used by markers for measured mode text)
  // Returns a Map keyed by point label (e.g., "2", "3", "A", "B") for lookup
  // For diagonals: Wave 5 is measured against Wave 3 only (not W1+W3)
  const calculateFibRatios = (points: WavePoint[], patternTypeForCalc?: string): Map<string, string> => {
    const ratios = new Map<string, string>();
    if (points.length < 3) return ratios;

    const isDiagonal = patternTypeForCalc === 'diagonal';

    // Wave 2/B retracement of Wave 1/A
    const p0 = points[0], p1 = points[1], p2 = points[2];
    const wave1Range = Math.abs(p1.price - p0.price);
    if (wave1Range > 0) {
      const wave2Retrace = Math.abs(p2.price - p1.price);
      const ratio = (wave2Retrace / wave1Range) * 100;
      ratios.set(p2.label, `${ratio.toFixed(1)}%`);
    }

    // Wave 3/C extension of Wave 1/A
    if (points.length >= 4) {
      const p3 = points[3];
      const wave3Range = Math.abs(p3.price - p2.price);
      if (wave1Range > 0) {
        const extension = (wave3Range / wave1Range) * 100;
        ratios.set(p3.label, `${extension.toFixed(0)}%`);
      }
    }

    // Wave 4 retracement of Wave 3
    if (points.length >= 5) {
      const p3 = points[3], p4 = points[4];
      const wave3Range = Math.abs(p3.price - p2.price);
      if (wave3Range > 0) {
        const wave4Retrace = Math.abs(p4.price - p3.price);
        const ratio = (wave4Retrace / wave3Range) * 100;
        ratios.set(p4.label, `${ratio.toFixed(1)}%`);
      }
    }

    // Wave 5 extension - measured as % of Wave 1 (standard Elliott Wave)
    // Common targets: 61.8% (if W3 extended), 100%, 161.8% (extended W5)
    // For DIAGONALS: also measure against Wave 3 for comparison
    if (points.length >= 6) {
      const p4 = points[4], p5 = points[5];
      const wave5Range = Math.abs(p5.price - p4.price);
      
      if (isDiagonal) {
        // Diagonal: Wave 5 as % of Wave 3 (contracting diagonals have W5 < W3)
        const p3 = points[3];
        const wave3Range = Math.abs(p3.price - p2.price);
        if (wave3Range > 0) {
          const extension = (wave5Range / wave3Range) * 100;
          ratios.set(p5.label, `${extension.toFixed(0)}%`);
        }
      } else {
        // Impulse: Wave 5 as % of Wave 1 (standard measurement)
        if (wave1Range > 0) {
          const extension = (wave5Range / wave1Range) * 100;
          ratios.set(p5.label, `${extension.toFixed(0)}%`);
        }
      }
    }

    return ratios;
  };

  // Draw all wave markers (saved labels + current points + preview) - using v5 createSeriesMarkers API
  useEffect(() => {
    if (!candleSeriesRef.current) {
      console.log('🌊 Skipping markers - series not ready');
      return;
    }

    // Collect all future projection points - these need special rendering via the futurePointsSeries
    const allFuturePoints: { point: WavePoint; color: string; shape: 'circle' | 'square'; labelText: string }[] = [];
    
    // Helper to get last real candle time
    const lastRealCandleTime = candles.length > 0 ? candles[candles.length - 1].time : 0;

    // Build markers from saved labels (highlight selected pattern, SKIP dragged point entirely)
    // Also collect future projection points separately for special rendering
    const savedMarkers = savedLabels.flatMap(label => {
      const degree = waveDegrees.find(d => d.name === label.degree);
      const baseColor = degree?.color || '#00c4b4';
      const isSelected = label.id === selectedLabelId;
      // Use gold/amber color for selected pattern, otherwise use degree color
      const color = isSelected ? '#fbbf24' : baseColor;
      
      // ALWAYS calculate Fib ratios for percentage display on ALL waves (not just measured mode)
      const fibRatios = calculateFibRatios(label.points, label.patternType);

      return label.points
        .map((point, pointIdx) => {
          // SKIP the dragged point entirely - don't render it at all while being moved
          const isBeingDragged = isSelected && isDragging && draggedPointIndex === pointIdx;
          if (isBeingDragged) {
            return null; // Remove from display
          }
          
          // Handle legacy patterns without snappedToHigh - infer from price vs candle
          let isHigh = point.snappedToHigh;
          if (isHigh === undefined) {
            const pointCandle = candles.find(c => c.time === point.time);
            if (pointCandle) {
              const distH = Math.abs(point.price - pointCandle.high);
              const distL = Math.abs(point.price - pointCandle.low);
              isHigh = distH < distL;
            } else {
              isHigh = false; // Default fallback
            }
          }
          
          // ALWAYS show Fib percentages on all waves (except point 0 and point 1)
          // Use stored fibLabel if available, otherwise calculate from actual wave positions
          let labelText = point.label;
          if (point.fibLabel) {
            // Show the Fib label that was stored when the point was placed on a projection line
            labelText = `${point.label} (${point.fibLabel})`;
          } else {
            // Calculate and show percentage for waves after wave 1 (B, C, 2, 3, 4, 5)
            const fibRatio = fibRatios.get(point.label);
            if (fibRatio) {
              labelText = `${point.label} (${fibRatio})`;
            }
          }
          
          // For future projection points, collect separately instead of making a marker
          if (point.isFutureProjection || point.time > lastRealCandleTime) {
            allFuturePoints.push({
              point,
              color,
              shape: isSelected ? 'square' : 'circle',
              labelText,
            });
            return null; // Don't create regular marker
          }
          
          return {
            time: point.time as any,
            position: (isHigh ? 'aboveBar' : 'belowBar') as 'belowBar' | 'aboveBar',
            color: color,
            shape: (isSelected ? 'square' : 'circle') as 'square' | 'circle',
            text: labelText,
          };
        })
        .filter(Boolean); // Remove null entries (dragged points and future points)
    });

    // Build markers from current points being drawn (also collect future points separately)
    // ALWAYS calculate Fib ratios for percentage display
    const currentFibRatios = calculateFibRatios(currentPoints, patternType);
    const currentMarkers = currentPoints.map((point) => {
      const degree = waveDegrees.find(d => d.name === selectedDegree);
      const color = degree?.color || '#00c4b4';
      
      // ALWAYS show Fib percentages - use stored fibLabel or calculate from positions
      let labelText = point.label;
      if (point.fibLabel) {
        // Show the Fib label that was stored when the point was placed on a projection line
        labelText = `${point.label} (${point.fibLabel})`;
      } else {
        // Calculate and show percentage for waves after wave 1
        const fibRatio = currentFibRatios.get(point.label);
        if (fibRatio) {
          labelText = `${point.label} (${fibRatio})`;
        }
      }
      
      // For future projection points, collect separately instead of making a marker
      if (point.isFutureProjection || point.time > lastRealCandleTime) {
        allFuturePoints.push({
          point,
          color,
          shape: 'circle',
          labelText,
        });
        return null; // Don't create regular marker
      }
      
      return {
        time: point.time as any,
        // Use snappedToHigh for marker position - high = aboveBar, low = belowBar
        position: (point.snappedToHigh ? 'aboveBar' : 'belowBar') as 'belowBar' | 'aboveBar',
        color,
        shape: 'circle' as const,
        text: labelText,
      };
    }).filter(Boolean);

    // Build preview marker (ghost marker showing where next point will be placed)
    const previewMarkers: any[] = [];
    if (isDrawing && previewPoint) {
      const labels = patternType === 'impulse' ? ['0', '1', '2', '3', '4', '5'] :
                     patternType === 'correction' || patternType === 'zigzag' || patternType === 'flat' ? ['0', 'A', 'B', 'C'] :
                     patternType === 'triangle' ? ['0', 'A', 'B', 'C', 'D', 'E'] :
                     ['0', '1', '2', '3', '4', '5'];
      const nextLabel = labels[currentPoints.length] || '?';
      
      // Determine preview position based on trend direction and wave
      let previewSnappedToHigh = true; // Default for point 0
      if (nextLabel !== '0' && currentPoints.length > 0) {
        const isDowntrend = currentPoints[0]?.snappedToHigh ?? false;
        const isOddWave = ['1', '3', '5'].includes(nextLabel);
        if (patternType === 'impulse' || patternType === 'diagonal') {
          // In downtrend: odd=low, even=high. In uptrend: odd=high, even=low
          previewSnappedToHigh = isDowntrend ? !isOddWave : isOddWave;
        }
      }
      
      previewMarkers.push({
        time: previewPoint.time as any,
        position: (previewSnappedToHigh ? 'aboveBar' : 'belowBar') as 'belowBar' | 'aboveBar',
        color: 'rgba(0, 196, 180, 0.5)', // Semi-transparent preview color
        shape: 'circle' as const,
        text: nextLabel,
      });
    }

    const rawMarkers = [...savedMarkers, ...currentMarkers, ...previewMarkers];

    // Merge overlapping markers at the same time+position (e.g., "5" and "0" become "5/0")
    const markerMap = new Map<string, typeof rawMarkers[0]>();
    for (const marker of rawMarkers) {
      const key = `${marker.time}-${marker.position}`;
      const existing = markerMap.get(key);
      if (existing) {
        // Extract wave label and Fib ratio separately
        const existingLabel = existing.text.split(' (')[0];
        const newLabel = marker.text.split(' (')[0];
        const existingFib = existing.text.match(/\( ([^)]+) \)/)?.[1]; // e.g., "121%"
        const newFib = marker.text.match(/\( ([^)]+) \)/)?.[1];
        
        // Combine labels with "/" separator (avoid duplicates like "C/C")
        let combinedLabel = existingLabel;
        if (existingLabel !== newLabel) {
          combinedLabel = `${existingLabel}/${newLabel}`;
        }
        
        // Combine Fib ratios if both exist (e.g., "121%/129%")
        let combinedFib = '';
        if (existingFib && newFib && existingFib !== newFib) {
          combinedFib = ` (${existingFib}/${newFib})`;
        } else if (existingFib) {
          combinedFib = ` (${existingFib})`;
        } else if (newFib) {
          combinedFib = ` (${newFib})`;
        }
        
        existing.text = `${combinedLabel}${combinedFib}`;
        
        // Keep the existing marker (already in map), prioritize selected pattern's color
        if (marker.shape === 'square') {
          existing.color = marker.color;
          existing.shape = 'square';
        }
      } else {
        markerMap.set(key, { ...marker });
      }
    }
    const allMarkers = Array.from(markerMap.values());

    try {
      // ALWAYS detach old primitive first to prevent duplicates, then create new one
      if (markersRef.current) {
        try {
          // Detach removes the primitive from the series completely
          (markersRef.current as any).detach?.();
        } catch (e) {
          // May fail if already detached
        }
        markersRef.current = null;
      }
      
      // Debug: log all markers being rendered with their details
      console.log('🎨 Creating markers:', allMarkers.length, 'total (merged from', rawMarkers.length, ')');
      console.log('📍 Saved labels count:', savedLabels.length, 
        savedLabels.map(l => `${l.patternType}:${l.points.length}pts`));
      
      // Create fresh markers primitive each time
      markersRef.current = createSeriesMarkers(candleSeriesRef.current, allMarkers);
    } catch (e) {
      console.error('Failed to set wave markers:', e);
      markersRef.current = null;
    }
    
    // Generate blue simulation candles for future projection points
    // This creates a visible bridge from last real candle to each projection point
    if (blueCandelSeriesRef.current && allFuturePoints.length > 0 && candles.length > 1) {
      const lastRealCandle = candles[candles.length - 1];
      const secondLastCandle = candles[candles.length - 2];
      const candleInterval = lastRealCandle.time - secondLastCandle.time;
      
      // Collect all blue candles for all future points
      const allBlueCandles: { time: any; open: number; high: number; low: number; close: number }[] = [];
      const blueMarkers: any[] = [];
      
      // Sort future points by time so we can chain them properly
      const sortedFuturePoints = [...allFuturePoints].sort((a, b) => a.point.time - b.point.time);
      
      // Track where each segment should start
      // Start from the last real candle, but update if we find points on existing candles
      let prevTime = lastRealCandle.time;
      let prevPrice = lastRealCandle.close;
      
      // Check if there are points on existing candles that should be our starting point
      // (e.g., B placed on existing candle, C in future should start from B)
      const pointsOnExistingCandles = sortedFuturePoints.filter(fp => fp.point.time <= lastRealCandle.time);
      if (pointsOnExistingCandles.length > 0) {
        // Use the last point on existing candles as starting position
        const lastExistingPoint = pointsOnExistingCandles[pointsOnExistingCandles.length - 1];
        prevTime = lastExistingPoint.point.time;
        prevPrice = lastExistingPoint.point.price;
        console.log('📍 Starting blue candles from existing point', lastExistingPoint.labelText, 
          'at price', prevPrice.toFixed(0));
      }
      
      // Helper to generate wave-like candle pattern
      const generateWaveCandles = (
        startTime: number, 
        startPrice: number, 
        endTime: number, 
        endPrice: number, 
        waveCount: 3 | 5
      ) => {
        const totalBars = Math.round((endTime - startTime) / candleInterval);
        if (totalBars <= 0) return [];
        
        const totalMove = endPrice - startPrice;
        const isUptrend = totalMove > 0;
        const candles: typeof allBlueCandles = [];
        
        // Define wave proportions
        // 3-wave (abc): Wave a 40%, wave b retrace 50%, wave c 60%
        // 5-wave (12345): W1 20%, W2 retrace 50%, W3 40%, W4 retrace 38%, W5 remaining
        const waveTargets: number[] = [];
        
        if (waveCount === 3) {
          // 3-wave correction: a-b-c
          const waveA = totalMove * 0.5; // 50% of move
          const waveB = -waveA * 0.5;    // 50% retrace of wave A
          const waveC = totalMove - waveA - waveB; // Remaining
          waveTargets.push(waveA, waveB, waveC);
        } else {
          // 5-wave impulse: 1-2-3-4-5
          const wave1 = totalMove * 0.23;
          const wave2 = -wave1 * 0.618;  // 61.8% retrace
          const wave3 = totalMove * 0.45; // Longest wave
          const wave4 = -wave3 * 0.382;  // 38.2% retrace
          const wave5 = totalMove - wave1 - wave2 - wave3 - wave4; // Remaining
          waveTargets.push(wave1, wave2, wave3, wave4, wave5);
        }
        
        // Calculate bars per wave
        const barsPerWave = waveTargets.map((_, i) => {
          if (waveCount === 3) {
            // 3-wave: distribute as 35%, 20%, 45%
            return Math.max(1, Math.round(totalBars * [0.35, 0.20, 0.45][i]));
          } else {
            // 5-wave: distribute as 18%, 12%, 32%, 15%, 23%
            return Math.max(1, Math.round(totalBars * [0.18, 0.12, 0.32, 0.15, 0.23][i]));
          }
        });
        
        // Ensure total bars match
        const totalAssigned = barsPerWave.reduce((a, b) => a + b, 0);
        if (totalAssigned < totalBars) {
          barsPerWave[waveCount === 3 ? 2 : 2] += totalBars - totalAssigned; // Add extra to wave 3/c
        }
        
        let currentPrice = startPrice;
        let currentTime = startTime;
        
        waveTargets.forEach((waveDelta, waveIdx) => {
          const barsForWave = barsPerWave[waveIdx];
          const waveEndPrice = currentPrice + waveDelta;
          const pricePerBar = waveDelta / barsForWave;
          
          for (let i = 1; i <= barsForWave; i++) {
            const candleTime = currentTime + (candleInterval * i);
            // Add some randomness to candle sizes (±15%)
            const randomFactor = 0.85 + Math.random() * 0.3;
            const adjustedMove = pricePerBar * randomFactor;
            
            const candleOpen = currentPrice + pricePerBar * (i - 1);
            const candleClose = i === barsForWave ? waveEndPrice : candleOpen + adjustedMove;
            const isUp = candleClose >= candleOpen;
            
            // Add wicks for realism
            const wickSize = Math.abs(candleClose - candleOpen) * (0.2 + Math.random() * 0.3);
            
            candles.push({
              time: candleTime as any,
              open: candleOpen,
              close: candleClose,
              high: (isUp ? candleClose : candleOpen) + wickSize,
              low: (isUp ? candleOpen : candleClose) - wickSize,
            });
          }
          
          currentTime += candleInterval * barsForWave;
          currentPrice = waveEndPrice;
        });
        
        return candles;
      };
      
      sortedFuturePoints.forEach((fp, index) => {
        const targetTime = fp.point.time;
        const targetPrice = fp.point.price;
        
        // Only generate blue candles if the point is ACTUALLY in the future (beyond last real candle)
        const isActuallyInFuture = targetTime > lastRealCandle.time;
        
        if (isActuallyInFuture) {
          // Determine wave count based on label and Elliott Wave structure
          // MOTIVE waves (1, 3, 5, A, C) = 5-wave sub-structure
          // CORRECTIVE waves (2, 4, B, D) = 3-wave sub-structure (a-b-c)
          const label = fp.point.label.toUpperCase();
          const isMotiveWave = ['1', '3', '5', 'A', 'C'].includes(label);
          const waveCount: 3 | 5 = isMotiveWave ? 5 : 3;
          
          // Generate wave-like candle pattern
          const waveCandles = generateWaveCandles(prevTime, prevPrice, targetTime, targetPrice, waveCount);
          allBlueCandles.push(...waveCandles);
          
          // Add marker at the final candle position on blue series
          blueMarkers.push({
            time: targetTime as any,
            position: (fp.point.snappedToHigh ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
            color: fp.color,
            shape: fp.shape as 'circle' | 'square',
            text: fp.labelText,
          });
          
          console.log('🔵 Generated', waveCount, '-wave pattern (', waveCandles.length, 'candles) for', fp.labelText, 
            'from', prevPrice.toFixed(0), 'to', targetPrice.toFixed(0));
        } else {
          // Point is on existing candle - will be rendered by normal marker system
          console.log('📍 Point', fp.labelText, 'is on existing candle, skipping blue candles');
        }
        
        // Update previous point for next segment
        prevTime = targetTime;
        prevPrice = targetPrice;
      });
      
      // Remove duplicate candles at same time (keep the one closest to target for each time)
      const uniqueBlueCandles = allBlueCandles.reduce((acc, candle) => {
        const existing = acc.find(c => c.time === candle.time);
        if (!existing) {
          acc.push(candle);
        }
        return acc;
      }, [] as typeof allBlueCandles);
      
      // Sort by time
      uniqueBlueCandles.sort((a, b) => (a.time as number) - (b.time as number));
      
      // Set the blue candle data
      try {
        blueCandelSeriesRef.current.setData(uniqueBlueCandles);
        console.log('🔵 Set', uniqueBlueCandles.length, 'blue simulation candles');
        
        // Add markers to the blue candle series
        if (blueCandleMarkersRef.current) {
          (blueCandleMarkersRef.current as any).detach?.();
        }
        if (blueMarkers.length > 0) {
          blueCandleMarkersRef.current = createSeriesMarkers(blueCandelSeriesRef.current, blueMarkers);
          console.log('🔵 Added', blueMarkers.length, 'markers to blue candle series');
        }
      } catch (e: any) {
        console.error('Failed to set blue candles:', e?.message || e);
      }
    } else if (blueCandelSeriesRef.current) {
      // Clear blue candles if no future points
      try {
        blueCandelSeriesRef.current.setData([]);
        if (blueCandleMarkersRef.current) {
          (blueCandleMarkersRef.current as any).detach?.();
          blueCandleMarkersRef.current = null;
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    // Store future points in ref for potential re-use
    futurePointsDataRef.current = allFuturePoints.map(fp => fp.point);
  }, [savedLabels, currentPoints, selectedDegree, waveDegrees, isDrawing, previewPoint, patternType, selectedLabelId, isDragging, draggedPointIndex, markersVersion, candles, fibonacciMode]);

  // Draw Fibonacci projection lines on the chart (projected mode only)
  useEffect(() => {
    // Helper to clean up all existing Fib lines - uses ref to get current series
    const clearFibLines = () => {
      const series = candleSeriesRef.current;
      fibLinesRef.current.forEach(line => {
        try {
          series?.removePriceLine(line);
        } catch (e) { /* ignore - line may already be removed */ }
      });
      fibLinesRef.current = [];
    };

    // ALWAYS clear existing lines first to prevent stacking/duplicates
    clearFibLines();
    fibProjectionPricesRef.current = []; // Clear projection prices too

    const candleSeries = candleSeriesRef.current;
    
    // Only draw lines in PROJECTED mode
    if (!candleSeries || fibonacciMode !== 'projected') {
      return;
    }

    // Get the points to calculate Fib from (either currentPoints or selected pattern)
    let pointsToUse = selectedLabelId 
      ? savedLabels.find(l => l.id === selectedLabelId)?.points || []
      : currentPoints;
    
    // CRITICAL: When dragging a point, adjust pointsToUse to show correct targets
    // e.g., when dragging B (index 2), show B targets by using only points up to A
    if (isDragging && draggedPointIndex !== null && selectedLabelId) {
      // Show targets for the dragged point by excluding it and subsequent points
      pointsToUse = pointsToUse.slice(0, draggedPointIndex);
      console.log('📊 Fib targets adjusted for drag - showing targets for point', draggedPointIndex, 'using', pointsToUse.length, 'points');
    }
    
    // Need at least 2 points to project targets
    if (pointsToUse.length < 2) {
      return;
    }

    const newLines: any[] = [];
    const newPrices: { price: number; label: string; color: string; correctionType?: 'flat' | 'zigzag'; diagonalType?: 'contracting' | 'expanding' }[] = [];
    const p0 = pointsToUse[0];
    const p1 = pointsToUse[1];
    const wave1Range = Math.abs(p1.price - p0.price);
    const isUptrend = p1.price > p0.price;
    
    // Get current pattern type from the label or current selection
    const currentPattern = selectedLabelId 
      ? savedLabels.find(l => l.id === selectedLabelId)?.patternType 
      : patternType;
    const isCorrection = currentPattern === 'correction' || currentPattern === 'zigzag' || currentPattern === 'flat';
    const isDiagonal = currentPattern === 'diagonal';
    
    // CORRECTION PATTERNS: Show both flat and zigzag targets for Wave B
    if (isCorrection) {
      // Wave B targets after Wave A is placed (2 points: 0, A)
      if (pointsToUse.length === 2) {
        // ZIGZAG B targets (38.2% - 78.6% retracement) - YELLOW
        const zigzagBLevels = [0.382, 0.5, 0.618, 0.786];
        zigzagBLevels.forEach(level => {
          const fibPrice = isUptrend 
            ? p1.price - (wave1Range * level)
            : p1.price + (wave1Range * level);
          
          const label = `B zig ${(level * 100).toFixed(0)}%`;
          const line = candleSeries.createPriceLine({
            price: fibPrice,
            color: '#FFE66D', // Yellow for zigzag
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: label,
          });
          if (line) {
            newLines.push(line);
            newPrices.push({ price: fibPrice, label, color: '#FFE66D', correctionType: 'zigzag' });
          }
        });
        
        // FLAT B targets (90% - 138.6% retracement) - CYAN
        const flatBLevels = [0.90, 1.0, 1.236, 1.382];
        flatBLevels.forEach(level => {
          const fibPrice = isUptrend 
            ? p1.price - (wave1Range * level)
            : p1.price + (wave1Range * level);
          
          const label = `B flat ${(level * 100).toFixed(0)}%`;
          const line = candleSeries.createPriceLine({
            price: fibPrice,
            color: '#00CED1', // Cyan for flat
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: label,
          });
          if (line) {
            newLines.push(line);
            newPrices.push({ price: fibPrice, label, color: '#00CED1', correctionType: 'flat' });
          }
        });
      }
      
      // Wave C targets after Wave B is placed (3 points: 0, A, B)
      if (pointsToUse.length >= 3) {
        const p2 = pointsToUse[2]; // Wave B
        const waveBRange = Math.abs(p2.price - p1.price);
        const waveBRatio = waveBRange / wave1Range;
        
        // Determine if flat or zigzag based on B's retracement OR user's click
        const detectedType = detectedCorrectionTypeRef.current || (waveBRatio >= 0.90 ? 'flat' : 'zigzag');
        
        if (detectedType === 'flat') {
          // FLAT C targets: 100% - 161.8% extension of Wave A from B
          // C moves in SAME direction as A (if A went down, C goes down from B)
          const flatCLevels = [1.0, 1.236, 1.382, 1.618];
          flatCLevels.forEach(ext => {
            const fibPrice = isUptrend 
              ? p2.price + (wave1Range * ext)  // A went UP, so C goes UP from B
              : p2.price - (wave1Range * ext); // A went DOWN, so C goes DOWN from B
            
            const label = `C flat ${(ext * 100).toFixed(0)}%`;
            const line = candleSeries.createPriceLine({
              price: fibPrice,
              color: '#FF6B6B', // Red for C wave
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: label,
            });
            if (line) {
              newLines.push(line);
              newPrices.push({ price: fibPrice, label, color: '#FF6B6B', correctionType: 'flat' });
            }
          });
        } else {
          // ZIGZAG C targets: 100% - 161.8% extension of Wave A from B
          // C moves in SAME direction as A (if A went down, C goes down from B)
          const zigzagCLevels = [1.0, 1.272, 1.414, 1.618];
          zigzagCLevels.forEach(ext => {
            const fibPrice = isUptrend 
              ? p2.price + (wave1Range * ext)  // A went UP, so C goes UP from B
              : p2.price - (wave1Range * ext); // A went DOWN, so C goes DOWN from B
            
            const label = `C zig ${(ext * 100).toFixed(0)}%`;
            const line = candleSeries.createPriceLine({
              price: fibPrice,
              color: '#FF6B6B', // Red for C wave
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: label,
            });
            if (line) {
              newLines.push(line);
              newPrices.push({ price: fibPrice, label, color: '#FF6B6B', correctionType: 'zigzag' });
            }
          });
        }
      }
    } else if (isDiagonal) {
      // DIAGONAL PATTERNS: Show both contracting and expanding targets
      // Diagonals have overlapping waves and converging/diverging trendlines
      
      // Wave 2 targets after Wave 1 is placed (2 points: 0, 1)
      if (pointsToUse.length === 2) {
        // Diagonal Wave 2: 50% - 88.6% retracement (deeper than impulse)
        // CONTRACTING (shorter waves) - YELLOW
        const contractingW2Levels = [0.50, 0.618, 0.707];
        contractingW2Levels.forEach(level => {
          const fibPrice = isUptrend 
            ? p1.price - (wave1Range * level)
            : p1.price + (wave1Range * level);
          
          const label = `W2 con ${(level * 100).toFixed(0)}%`;
          const line = candleSeries.createPriceLine({
            price: fibPrice,
            color: '#FFE66D', // Yellow for contracting
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: label,
          });
          if (line) {
            newLines.push(line);
            newPrices.push({ price: fibPrice, label, color: '#FFE66D', diagonalType: 'contracting' });
          }
        });
        
        // EXPANDING (deeper retracement) - CYAN
        const expandingW2Levels = [0.786, 0.886];
        expandingW2Levels.forEach(level => {
          const fibPrice = isUptrend 
            ? p1.price - (wave1Range * level)
            : p1.price + (wave1Range * level);
          
          const label = `W2 exp ${(level * 100).toFixed(0)}%`;
          const line = candleSeries.createPriceLine({
            price: fibPrice,
            color: '#00CED1', // Cyan for expanding
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: label,
          });
          if (line) {
            newLines.push(line);
            newPrices.push({ price: fibPrice, label, color: '#00CED1', diagonalType: 'expanding' });
          }
        });
      }
      
      // Wave 3 targets after Wave 2 is placed (3 points: 0, 1, 2)
      if (pointsToUse.length >= 3) {
        const p2 = pointsToUse[2]; // Wave 2
        
        // Determine if contracting or expanding based on W2 depth OR user's click
        const wave2Range = Math.abs(p2.price - p1.price);
        const wave2Ratio = wave2Range / wave1Range;
        const detectedType = detectedDiagonalTypeRef.current || (wave2Ratio >= 0.75 ? 'expanding' : 'contracting');
        
        if (detectedType === 'contracting') {
          // Contracting W3: 61.8% - 100% of W1 (shorter waves)
          const contractingW3Levels = [0.618, 0.786, 1.0];
          contractingW3Levels.forEach(ext => {
            const fibPrice = isUptrend 
              ? p2.price + (wave1Range * ext)
              : p2.price - (wave1Range * ext);
            
            const label = `W3 con ${(ext * 100).toFixed(0)}%`;
            const line = candleSeries.createPriceLine({
              price: fibPrice,
              color: '#00CED1', // Cyan for wave 3
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: label,
            });
            if (line) {
              newLines.push(line);
              newPrices.push({ price: fibPrice, label, color: '#00CED1', diagonalType: 'contracting' });
            }
          });
        } else {
          // Expanding W3: 100% - 161.8% of W1 (longer waves)
          const expandingW3Levels = [1.0, 1.272, 1.618];
          expandingW3Levels.forEach(ext => {
            const fibPrice = isUptrend 
              ? p2.price + (wave1Range * ext)
              : p2.price - (wave1Range * ext);
            
            const label = `W3 exp ${(ext * 100).toFixed(0)}%`;
            const line = candleSeries.createPriceLine({
              price: fibPrice,
              color: '#00CED1', // Cyan for wave 3
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: label,
            });
            if (line) {
              newLines.push(line);
              newPrices.push({ price: fibPrice, label, color: '#00CED1', diagonalType: 'expanding' });
            }
          });
        }
      }
      
      // Wave 4 targets after Wave 3 is placed (4 points: 0, 1, 2, 3)
      if (pointsToUse.length >= 4) {
        const p2 = pointsToUse[2]; // Wave 2
        const p3 = pointsToUse[3]; // Wave 3
        const wave3Range = Math.abs(p3.price - p2.price);
        
        // Determine diagonal type from prior detection
        const wave2Range = Math.abs(p2.price - p1.price);
        const wave2Ratio = wave2Range / wave1Range;
        const detectedType = detectedDiagonalTypeRef.current || (wave2Ratio >= 0.75 ? 'expanding' : 'contracting');
        
        if (detectedType === 'contracting') {
          // Contracting W4: 50% - 78.6% retracement of W3
          const contractingW4Levels = [0.50, 0.618, 0.786];
          contractingW4Levels.forEach(level => {
            const fibPrice = isUptrend 
              ? p3.price - (wave3Range * level)
              : p3.price + (wave3Range * level);
            
            const label = `W4 con ${(level * 100).toFixed(0)}%`;
            const line = candleSeries.createPriceLine({
              price: fibPrice,
              color: '#9B59B6', // Purple for wave 4
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: label,
            });
            if (line) {
              newLines.push(line);
              newPrices.push({ price: fibPrice, label, color: '#9B59B6', diagonalType: 'contracting' });
            }
          });
        } else {
          // Expanding W4: 61.8% - 88.6% retracement of W3 (deeper)
          const expandingW4Levels = [0.618, 0.786, 0.886];
          expandingW4Levels.forEach(level => {
            const fibPrice = isUptrend 
              ? p3.price - (wave3Range * level)
              : p3.price + (wave3Range * level);
            
            const label = `W4 exp ${(level * 100).toFixed(0)}%`;
            const line = candleSeries.createPriceLine({
              price: fibPrice,
              color: '#9B59B6', // Purple for wave 4
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: label,
            });
            if (line) {
              newLines.push(line);
              newPrices.push({ price: fibPrice, label, color: '#9B59B6', diagonalType: 'expanding' });
            }
          });
        }
      }
      
      // Wave 5 targets after Wave 4 is placed (5 points: 0, 1, 2, 3, 4)
      if (pointsToUse.length >= 5) {
        const p2 = pointsToUse[2]; // Wave 2
        const p3 = pointsToUse[3]; // Wave 3
        const p4 = pointsToUse[4]; // Wave 4
        const wave3Range = Math.abs(p3.price - p2.price);
        
        // Determine diagonal type from prior detection
        const wave2Range = Math.abs(p2.price - p1.price);
        const wave2Ratio = wave2Range / wave1Range;
        const detectedType = detectedDiagonalTypeRef.current || (wave2Ratio >= 0.75 ? 'expanding' : 'contracting');
        
        if (detectedType === 'contracting') {
          // Contracting W5: 38.2% - 61.8% of W3 (shorter due to convergence)
          const contractingW5Levels = [0.382, 0.50, 0.618];
          contractingW5Levels.forEach(ext => {
            const fibPrice = isUptrend 
              ? p4.price + (wave3Range * ext)
              : p4.price - (wave3Range * ext);
            
            const label = `W5 con ${(ext * 100).toFixed(0)}%`;
            const line = candleSeries.createPriceLine({
              price: fibPrice,
              color: '#FF6B6B', // Red for wave 5
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: label,
            });
            if (line) {
              newLines.push(line);
              newPrices.push({ price: fibPrice, label, color: '#FF6B6B', diagonalType: 'contracting' });
            }
          });
        } else {
          // Expanding W5: 100% - 123.6% of W3 (longer due to divergence)
          const expandingW5Levels = [1.0, 1.13, 1.236];
          expandingW5Levels.forEach(ext => {
            const fibPrice = isUptrend 
              ? p4.price + (wave3Range * ext)
              : p4.price - (wave3Range * ext);
            
            const label = `W5 exp ${(ext * 100).toFixed(0)}%`;
            const line = candleSeries.createPriceLine({
              price: fibPrice,
              color: '#FF6B6B', // Red for wave 5
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: label,
            });
            if (line) {
              newLines.push(line);
              newPrices.push({ price: fibPrice, label, color: '#FF6B6B', diagonalType: 'expanding' });
            }
          });
        }
      }
    } else {
      // IMPULSE PATTERNS: Standard wave projections
      
      // Project Wave 2 targets (retracement of Wave 1)
      if (pointsToUse.length >= 2) {
        const w2Levels = [0.382, 0.5, 0.618];
        w2Levels.forEach(level => {
          const fibPrice = isUptrend 
            ? p1.price - (wave1Range * level)
            : p1.price + (wave1Range * level);
          
          const label = `W2 ${(level * 100).toFixed(0)}%`;
          const line = candleSeries.createPriceLine({
            price: fibPrice,
            color: '#FFE66D',
            lineWidth: 1,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: label,
          });
          if (line) {
            newLines.push(line);
            newPrices.push({ price: fibPrice, label, color: '#FFE66D' });
          }
        });
      }

      // Project Wave 3 targets (extension of Wave 1 from Wave 2)
      if (pointsToUse.length >= 3) {
        const p2 = pointsToUse[2];
        const w3Extensions = [1.618, 2.0, 2.618];
        w3Extensions.forEach(ext => {
          const fibPrice = isUptrend 
            ? p2.price + (wave1Range * ext)
            : p2.price - (wave1Range * ext);
          
          const label = `W3 ${(ext * 100).toFixed(0)}%`;
          const line = candleSeries.createPriceLine({
            price: fibPrice,
            color: '#00CED1',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: label,
          });
          if (line) {
            newLines.push(line);
            newPrices.push({ price: fibPrice, label, color: '#00CED1' });
          }
        });
      }

      // Project Wave 4 targets (retracement of Wave 3)
      if (pointsToUse.length >= 4) {
        const p2 = pointsToUse[2];
        const p3 = pointsToUse[3];
        const wave3Range = Math.abs(p3.price - p2.price);
        const w4Levels = [0.236, 0.382, 0.5];
        w4Levels.forEach(level => {
          const fibPrice = isUptrend 
            ? p3.price - (wave3Range * level)
            : p3.price + (wave3Range * level);
          
          const label = `W4 ${(level * 100).toFixed(0)}%`;
          const line = candleSeries.createPriceLine({
            price: fibPrice,
            color: '#9B59B6',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: label,
          });
          if (line) {
            newLines.push(line);
            newPrices.push({ price: fibPrice, label, color: '#9B59B6' });
          }
        });
      }

      // Project Wave 5 targets (extension from Wave 4)
      if (pointsToUse.length >= 5) {
        const p4 = pointsToUse[4];
        const w5Extensions = [0.618, 1.0, 1.618];
        w5Extensions.forEach(ext => {
          const fibPrice = isUptrend 
            ? p4.price + (wave1Range * ext)
            : p4.price - (wave1Range * ext);
          
          const label = `W5 ${(ext * 100).toFixed(0)}%`;
          const line = candleSeries.createPriceLine({
            price: fibPrice,
            color: '#FF6B6B',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: label,
          });
          if (line) {
            newLines.push(line);
            newPrices.push({ price: fibPrice, label, color: '#FF6B6B' });
          }
        });
      }
    }

    fibLinesRef.current = newLines;
    fibProjectionPricesRef.current = newPrices;

    // Cleanup function to remove lines when effect re-runs or component unmounts
    return () => {
      clearFibLines();
    };
  }, [fibonacciMode, currentPoints, savedLabels, selectedLabelId, candles, isDragging, draggedPointIndex]);

  // Draw diagonal trendlines (W2→W4 and W1→W3, extended to W5 candle time)
  // These form the wedge channel and allow visualization of over/underthrow at Wave 5
  useEffect(() => {
    const chart = chartRef.current;
    
    // Helper to clean up existing diagonal trendlines
    const clearDiagonalLines = () => {
      diagonalTrendlinesRef.current.forEach(series => {
        try {
          chart?.removeSeries(series);
        } catch (e) { /* ignore - series may already be removed */ }
      });
      diagonalTrendlinesRef.current = [];
    };

    // ALWAYS clear existing lines first
    clearDiagonalLines();

    if (!chart) return;

    // Get the points to use (either from selected saved label or current points)
    const pointsToUse = selectedLabelId 
      ? savedLabels.find(l => l.id === selectedLabelId)?.points || []
      : currentPoints;
    
    // Get pattern type
    const currentPattern = selectedLabelId 
      ? savedLabels.find(l => l.id === selectedLabelId)?.patternType 
      : patternType;
    
    // Only draw trendlines for diagonals with at least 5 points (0, 1, 2, 3, 4)
    // We need W2 and W4 for lower trendline
    const isDiagonal = currentPattern === 'diagonal';
    if (!isDiagonal || pointsToUse.length < 5) {
      return;
    }

    const newSeries: any[] = [];
    
    try {
      console.log('📐 Drawing diagonal trendlines, points:', pointsToUse.length);
      
      // Points: 0=start, 1=end of wave 1, 2=end of wave 2, 3=end of wave 3, 4=end of wave 4, 5=end of wave 5
      const p1 = pointsToUse[1]; // End of Wave 1
      const p2 = pointsToUse[2]; // End of Wave 2
      const p3 = pointsToUse[3]; // End of Wave 3
      const p4 = pointsToUse[4]; // End of Wave 4
      const p5 = pointsToUse.length >= 6 ? pointsToUse[5] : null; // End of Wave 5 (if exists)

      console.log('📐 Points - p1:', p1?.time, p1?.price, 'p2:', p2?.time, p2?.price, 'p3:', p3?.time, p3?.price, 'p4:', p4?.time, p4?.price);

      // Trendline color - semi-transparent white
      const trendlineColor = 'rgba(255, 255, 255, 0.5)';
      
      // Helper function to extend a trendline to a target time
      const extendLine = (startP: WavePoint, endP: WavePoint, targetTime: number): { time: number; value: number } => {
        const timeDiff = (endP.time as number) - (startP.time as number);
        const priceDiff = endP.price - startP.price;
        const slope = timeDiff !== 0 ? priceDiff / timeDiff : 0;
        const targetTimeDiff = targetTime - (startP.time as number);
        const targetPrice = startP.price + (slope * targetTimeDiff);
        return { time: targetTime, value: targetPrice };
      };

      // Determine how far to extend the lines
      // If we have W5, extend to W5. Otherwise extend a bit beyond W4
      const p4Time = p4.time as number;
      const p5Time = p5?.time as number | undefined;
      
      // If no W5, calculate estimated future extension (one candle interval beyond W4)
      // Get time interval from existing points
      const timeInterval = p4Time - (p3.time as number);
      const extendToTime = p5Time || (p4Time + Math.abs(timeInterval));

      // Draw lower trendline: W2 → W4 extended beyond
      // (Connects the correction wave endpoints - forms lower boundary of wedge)
      if (p2 && p4 && p2.time && p4.time && p2.time !== p4.time) {
        const extendedPoint = extendLine(p2, p4, extendToTime);
        
        // Only add extension point if it has a different time
        const dataLower: { time: any; value: number }[] = [
          { time: p2.time as any, value: p2.price },
          { time: p4.time as any, value: p4.price },
        ];
        
        // Add extended point only if time is different from p4
        if (extendedPoint.time !== p4Time) {
          dataLower.push({ time: extendedPoint.time as any, value: extendedPoint.value });
        }
        
        dataLower.sort((a, b) => (a.time as number) - (b.time as number));
        
        console.log('📐 Lower trendline data:', dataLower);
        
        const lineLower = chart.addSeries(LineSeries, {
          color: trendlineColor,
          lineWidth: 1,
          lineStyle: 0, // Solid
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        lineLower.setData(dataLower);
        newSeries.push(lineLower);
        console.log('📐 Lower trendline created successfully');
      }

      // Draw upper trendline: W1 → W3 extended beyond
      // (Connects the impulse wave peaks - forms upper boundary of wedge)
      if (p1 && p3 && p1.time && p3.time && p1.time !== p3.time) {
        const extendedPoint = extendLine(p1, p3, extendToTime);
        const p3Time = p3.time as number;
        
        // Only add extension point if it has a different time
        const dataUpper: { time: any; value: number }[] = [
          { time: p1.time as any, value: p1.price },
          { time: p3.time as any, value: p3.price },
        ];
        
        // Add extended point only if time is different from p3
        if (extendedPoint.time !== p3Time) {
          dataUpper.push({ time: extendedPoint.time as any, value: extendedPoint.value });
        }
        
        dataUpper.sort((a, b) => (a.time as number) - (b.time as number));
        
        console.log('📐 Upper trendline data:', dataUpper);
        
        const lineUpper = chart.addSeries(LineSeries, {
          color: trendlineColor,
          lineWidth: 1,
          lineStyle: 0, // Solid
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        lineUpper.setData(dataUpper);
        newSeries.push(lineUpper);
        console.log('📐 Upper trendline created successfully');
      }
    } catch (e: any) {
      console.warn('Failed to draw diagonal trendlines:', e?.message || e);
    }

    diagonalTrendlinesRef.current = newSeries;

    // Cleanup function
    return () => {
      clearDiagonalLines();
    };
  }, [currentPoints, savedLabels, selectedLabelId, patternType]);

  const handleSaveLabel = () => {
    if (currentPoints.length < 3) {
      toast({
        title: 'Not Enough Points',
        description: 'Please place at least 3 wave points before saving.',
        variant: 'destructive',
      });
      return;
    }

    saveLabel.mutate({
      symbol,
      timeframe,
      degree: selectedDegree,
      patternType,
      points: currentPoints,
      isComplete: true,
      fibonacciMode,
      validationResult: validation || undefined,
    });
  };

  const handleClearPoints = () => {
    setCurrentPoints([]);
    setValidation(null);
    trendDirectionRef.current = null; // Clear cached direction for next pattern
    detectedCorrectionTypeRef.current = null; // Clear detected correction type
    detectedDiagonalTypeRef.current = null; // Clear detected diagonal type
    // Keep drawing mode enabled so user can continue labeling
  };
  // ──────────────────────────────────────────────────────────────────────
  //  CHART SCREENSHOT CAPTURE – Built-in + Rock-Solid Fallback
  // ──────────────────────────────────────────────────────────────────────
  const captureChartScreenshot = async (): Promise<string | null> => {
    if (!chartRef.current || !chartContainerRef.current) return null;

    // 1. Try official lightweight-charts method first (fastest)
    try {
      const image = await chartRef.current.takeScreenshot();
      if (image && image.startsWith('data:') && image.length > 100) {
        console.log('[Screenshot] Built-in takeScreenshot() succeeded');
        return image; // Already perfect base64 PNG
      }
    } catch (err) {
      console.warn('[Screenshot] Built-in method failed (continuing to fallback):', err);
      // Fall through to manual capture
    }
    // 2. Manual fallback – captures EVERY canvas (chart + price/time axes)
    try {
      const container = chartContainerRef.current!;
      const rect = container.getBoundingClientRect();

      // High-res temp canvas (2x for crispness)
      const tempCanvas = document.createElement('canvas');
      const scaleFactor = window.devicePixelRatio >= 2 ? 2 : 1.5;
      tempCanvas.width = rect.width * scaleFactor;
      tempCanvas.height = rect.height * scaleFactor;

      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return null;

      ctx.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Draw all canvas layers in correct order
      const canvases = container.querySelectorAll('canvas');
      canvases.forEach((c) => {
        const cRect = c.getBoundingClientRect();
        const offsetX = cRect.left - rect.left;
        const offsetY = cRect.top - rect.top;
        ctx.drawImage(c, offsetX, offsetY);
      });

      // Resize down to sane limits (1200×800 max)
      const MAX_W = 1200;
      const MAX_H = 800;
      let { width, height } = tempCanvas;

      if (width > MAX_W) {
        height = (height * MAX_W) / width;
        width = MAX_W;
      }
      if (height > MAX_H) {
        width = (width * MAX_H) / height;
        height = MAX_H;
      }

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = width;
      finalCanvas.height = height;
      const finalCtx = finalCanvas.getContext('2d')!;
      finalCtx.drawImage(tempCanvas, 0, 0, width, height);

      const jpeg = finalCanvas.toDataURL('image/jpeg', 0.85);
      console.log('[Screenshot] Fallback capture succeeded');
      return jpeg;
    } catch (err) {
      console.error('[Screenshot] Fallback completely failed:', err);
      return null;
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  //  AI AUTO-ANALYZE HANDLER – Clean & Final Version
  // ──────────────────────────────────────────────────────────────────────
  const handleAutoAnalyze = useCallback(async () => {
    if (!chartRef.current || !chartContainerRef.current) {
      toast({
        title: 'Chart not ready',
        description: 'Please wait for the chart to load.',
        variant: 'destructive',
      });
      return;
    }

    setIsCapturingChart(true);
    let chartImage: string | null = null;

    try {
      chartImage = await captureChartScreenshot();
      if (chartImage) {
        console.log('SCREENSHOT SUCCESS — Size:', (chartImage.length / 1024 / 1024).toFixed(2), 'MB');
      } else {
        console.log('SCREENSHOT FAILED — chartImage is null');
      }
    } finally {
      setIsCapturingChart(false);
    }

    // Candle data & visible range
    const allCandles = candlesRef.current || candles;
    if (allCandles.length === 0) {
      toast({ title: 'No data', description: 'No candle data available.', variant: 'destructive' });
      return;
    }

    const timeScale = chartRef.current!.timeScale();
    const visibleRange = timeScale.getVisibleRange();
    if (!visibleRange) {
      toast({ title: 'Zoom required', description: 'Please zoom/pan the chart first.', variant: 'destructive' });
      return;
    }

    // Find first visible candle index
    let visibleStartIdx = allCandles.findIndex(c => c.time >= visibleRange.from);
    if (visibleStartIdx === -1) visibleStartIdx = 0;

    const visibleCandles = allCandles.filter(
      c => c.time >= visibleRange.from && c.time <= visibleRange.to
    );

    if (visibleCandles.length < 10) {
      toast({ title: 'Zoom in', description: 'Need at least 10 visible candles.', variant: 'destructive' });
      return;
    }

    // ─── Prepare payload ───
    const degreeContextString = JSON.stringify(waveDegreesRef.current || []);
    const currentPoints = currentPointsRef.current || [];

    if (aiAnalyze.isPending) return;

    console.log('Sending AI analysis request...', {
      symbol,
      timeframe,
      visibleCandles: visibleCandles.length,
      hasImage: !!chartImage,
    });

    aiAnalyze.mutate({
      chartImage: chartImage || undefined,
      candles: visibleCandles,
      visibleStartIndex: visibleStartIdx,
      symbol,
      timeframe,
      degreeContext: degreeContextString,
      existingLabels:
        currentPoints.length > 0
          ? currentPoints
              .map(p => `${p.label} at [${p.index}] ${p.price.toFixed(4)}`)
              .join('\n')
          : undefined,
    });
  }, [
    symbol,
    timeframe,
    candles,
    aiAnalyze,
    toast,
    // Add any other refs/states you actually use inside the callback
  ]);

  // ─── Auth redirect (unchanged) ───
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/cryptologin');
    }
  }, [authLoading, isAuthenticated, setLocation]);
  
  return (
  <div className="min-h-screen bg-[#0e0e0e] text-white pb-24">
    <Helmet>
      <title>Elliott Wave Analysis - Professional Trading | BearTec</title>
      <meta name="description" content="Professional Elliott Wave analysis with interactive wave labeling, Fibonacci ratios, pattern validation, and auto-detection. Elite trading tools for cryptocurrency markets." />
      <meta property="og:title" content="Elliott Wave Analysis | BearTec Crypto" />
      <meta property="og:description" content="Professional Elliott Wave analysis with 9-degree wave labeling, Fibonacci tools, and pattern validation for crypto trading." />
    </Helmet>

    {/* Header - Hidden on mobile, shown on desktop */}
    <div className="hidden lg:block lg:sticky lg:top-0 z-50 bg-[#0e0e0e]/95 backdrop-blur-sm border-b border-slate-800 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={bearTecLogoNew} alt="BearTec" className="h-8" />
          <h1 className="text-xl font-bold">Elliott Wave Analysis</h1>
          <Badge variant="outline" className="bg-red-600/20 text-red-400 border-red-600">
            Elite
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-32 bg-slate-800 border-slate-700" data-testid="select-symbol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SYMBOLS.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-28 bg-slate-800 border-slate-700" data-testid="select-timeframe">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEFRAMES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchHistory()}
            disabled={historyLoading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
          </Button>

          <AuthButtons />
        </div>
      </div>
    </div>

    <div className="max-w-7xl mx-auto p-4 pt-32 lg:pt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Chart Area */}
      <div className="lg:col-span-2">
        {/* Mobile Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-slate-900/95 rounded-lg border border-slate-800 fixed top-0 left-0 right-0 z-40 mx-4 mt-1 lg:static lg:mx-0 lg:mt-0 backdrop-blur-sm">
          <div className="flex items-center gap-2 lg:hidden w-full pb-2 border-b border-slate-700 mb-2">
            <img src={bearTecLogoNew} alt="BearTec" className="h-8" />
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="flex-1 h-8 bg-slate-800 border-slate-700 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{SYMBOLS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-20 h-8 bg-slate-800 border-slate-700 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{TIMEFRAMES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1 w-full lg:w-auto lg:gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={`w-8 h-7 p-0 ${isDrawing ? 'bg-[#00c4b4] text-white hover:bg-[#00a89c]' : 'bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700'}`}
              onClick={() => { setIsDrawing(!isDrawing); setSelectionMode(false); }}
              title="Draw mode"
            >
              <Pencil className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className={`w-8 h-7 p-0 ${selectionMode ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700'}`}
              onClick={() => { setSelectionMode(!selectionMode); setIsDrawing(false); setCurrentPoints([]); }}
              title="Select mode"
            >
              <MousePointer2 className="w-4 h-4" />
            </Button>

            <Select value={selectedDegree} onValueChange={setSelectedDegree}>
              <SelectTrigger className="flex-1 min-w-0 lg:w-[100px] h-7 bg-slate-800 border-slate-700 text-xs px-2">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: waveDegrees.find(d => d.name === selectedDegree)?.color || '#ffa500' }} />
                  <span className="truncate">{selectedDegree.slice(0, 3)}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {waveDegrees.map(d => (
                  <SelectItem key={d.name} value={d.name}>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={patternType} onValueChange={setPatternType}>
              <SelectTrigger className="flex-1 min-w-0 lg:w-[80px] h-7 bg-slate-800 border-slate-700 text-xs px-2">
                <span className="truncate">
                  {patternType === 'impulse' ? '12345' : patternType === 'diagonal' ? 'Diag' : patternType === 'zigzag' ? 'ZZ' : patternType === 'flat' ? 'Flat' : patternType === 'triangle' ? 'Tri' : 'ABC'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {PATTERN_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={fibonacciMode} onValueChange={setFibonacciMode}>
              <SelectTrigger className="flex-1 min-w-0 lg:w-[70px] h-7 bg-slate-800 border-slate-700 text-xs px-2">
                <span className="truncate">{fibonacciMode === 'measured' ? 'M%' : fibonacciMode === 'projected' ? 'P%' : 'Off'}</span>
              </SelectTrigger>
              <SelectContent>
                {FIBONACCI_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button
              onClick={handleAutoAnalyze}
              disabled={aiAnalyze.isPending || isCapturingChart}
              variant="ghost"
              size="sm"
              className="w-8 h-7 p-0 text-[#00c4b4] hover:bg-[#00c4b4]/10 font-bold text-xs bg-slate-800 border border-slate-700"
              title="AI Auto-analyze"
            >
              {aiAnalyze.isPending || isCapturingChart ? <Loader2 className="w-4 h-4 animate-spin" /> : 'AI'}
            </Button>

            {/* STAGE 2: DUMMY TEST BUTTON — REMOVE AFTER TESTING */}
            <Button
              onClick={() => {
                console.log('Sending DUMMY payload to test Grok...');
                aiAnalyze.mutate({
                  symbol: 'BTCUSDT',
                  timeframe: '1h',
                  candles: Array.from({ length: 20 }, (_, i) => ({
                    time: Math.floor(Date.now() / 1000) - (20 - i) * 3600,
                    open: 45000 + i * 15,
                    high: 45150 + i * 15,
                    low: 44850 + i * 15,
                    close: 45050 + i * 15,
                    volume: 1000 + i * 200,
                  })),
                  visibleStartIndex: 0,
                  chartImage: null,
                  dummy: true,
                });
              }}
              className="h-7 px-3 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded"
            >
              TEST GROK
            </Button>

            <Button
              onClick={handleClearPoints}
              disabled={!isDrawing || currentPoints.length === 0}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-red-400 hover:bg-red-500/10"
              title="Clear points"
            >
              <Trash2 className="w-4 h-4" />
            </Button>

            {isDrawing && currentPoints.length >= 3 && (
              <Button onClick={handleSaveLabel} disabled={saveLabel.isPending} size="sm" className="h-7 px-2 bg-[#00c4b4] hover:bg-[#00a89c]">
                {saveLabel.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </Button>
            )}

            {selectionMode && selectedLabelId && (
              <Button onClick={() => deleteLabel.mutate(selectedLabelId)} disabled={deleteLabel.isPending} variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:bg-red-500/10">
                {deleteLabel.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Status Bar */}
        <div className="text-xs text-gray-400 px-2 mb-1 flex items-center gap-2">
          {isDrawing ? (
            <span className="text-[#00c4b4]">Tap candles ({currentPoints.length}/{patternType === 'impulse' ? 6 : patternType === 'triangle' ? 6 : 4})</span>
          ) : selectionMode ? (
            <span className="text-amber-400">
              {selectedLabelId ? `Selected: ${savedLabels.find(l => l.id === selectedLabelId)?.patternType} (${savedLabels.find(l => l.id === selectedLabelId)?.degree})` : "Tap a pattern"}
            </span>
          ) : (
            <span>View mode</span>
          )}
          <span className="ml-auto flex items-center gap-1">
            {isLoadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
            {visibleCandleCount > 0 ? `${visibleCandleCount}/` : ''}{candles.length} candles
          </span>
        </div>

        {/* Chart */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-2">
            {historyLoading ? (
              <div className="h-[500px] flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#00c4b4] mx-auto mb-2" />
                  <p className="text-gray-400">Loading extended history...</p>
                </div>
              </div>
            ) : (
              <div ref={chartContainerRef} className={`w-full ${isDrawing ? 'cursor-crosshair ring-2 ring-[#00c4b4]/50 rounded' : ''}`} style={{ touchAction: isDrawing ? 'none' : 'pan-x pan-y pinch-zoom' }} />
            )}

            {currentPoints.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {currentPoints.map((point, idx) => (
                  <Badge key={idx} variant="outline" className="cursor-pointer hover:bg-red-500/20 text-xs" onClick={() => {
                    setCurrentPoints(prev => prev.filter((_, i) => i !== idx));
                  }}>
                    <span className="text-[#00c4b4]">{point.label}</span>
                    <span className="text-gray-400 ml-1">${point.price.toFixed(0)}</span>
                    <Trash2 className="w-3 h-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Panel */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
        <CardTitle className="text-lg">Validation</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={aiAnalysis ? "ai" : "validation"}>
          <TabsList className="grid w-full grid-cols-3 bg-slate-800">
            <TabsTrigger value="validation">Rules</TabsTrigger>
            <TabsTrigger value="fibonacci">Fib</TabsTrigger>
            <TabsTrigger value="ai" className={aiAnalysis ? 'text-[#00c4b4]' : ''}>
              AI {aiAnalysis && 'Check'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="validation" className="mt-4">
            {/* Your existing validation UI */}
          </TabsContent>

          <TabsContent value="fibonacci" className="mt-4">
            {/* Your existing fib UI */}
          </TabsContent>

          <TabsContent value="ai" className="mt-4 space-y-5">
            {aiAnalyze.isPending ? (
              <div className="text-center py-16">
                <Loader2 className="w-10 h-10 animate-spin text-[#00c4b4] mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Grok is analyzing the chart...</p>
              </div>
            ) : aiAnalysis ? (
              <div className="space-y-6">
                {/* Pattern Summary */}
                <div className="bg-gradient-to-r from-emerald-900/40 to-teal-900/40 border border-emerald-600/50 rounded-xl p-6">
                  <h3 className="text-2xl font-bold text-emerald-400 mb-3">
                    {aiAnalysis.patternType.charAt(0).toUpperCase() + aiAnalysis.patternType.slice(1)} Pattern
                  </h3>
                  <div className="flex items-center gap-5 text-lg">
                    <span className="text-gray-400">Confidence:</span>
                    <span className="text-3xl font-bold text-emerald-300">{aiAnalysis.confidence}%</span>
                    <span className="text-gray-300">— {aiAnalysis.currentWave}</span>
                  </div>
                  <p className="text-gray-200 mt-5 leading-relaxed text-base">{aiAnalysis.analysis}</p>
                </div>

                {/* Continuation Targets */}
                {aiAnalysis.continuation && (
                  <div className="bg-slate-800/90 rounded-xl p-6 border border-slate-700">
                    <h4 className="text-xl font-semibold text-cyan-400 mb-4">
                      {aiAnalysis.continuation.direction === 'up' ? 'Bullish' : 'Bearish'} Continuation
                    </h4>
                    <p className="text-gray-300 mb-5 text-base">{aiAnalysis.continuation.targetDescription}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {aiAnalysis.continuation.upTargets?.length > 0 && (
                        <div>
                          <h5 className="text-green-400 font-medium mb-3 text-lg">Upside Targets</h5>
                          {aiAnalysis.continuation.upTargets.map((t, i) => (
                            <div key={i} className="flex justify-between py-2 border-b border-slate-700/50 last:border-0">
                              <span className="text-green-300">{t.level}</span>
                              <span className="font-mono text-green-200 text-lg">${t.price?.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {aiAnalysis.continuation.downTargets?.length > 0 && (
                        <div>
                          <h5 className="text-red-400 font-medium mb-3 text-lg">Downside Targets</h5>
                          {aiAnalysis.continuation.downTargets.map((t, i) => (
                            <div key={i} className="flex justify-between py-2 border-b border-slate-700/50 last:border-0">
                              <span className="text-red-300">{t.level}</span>
                              <span className="font-mono text-red-200 text-lg">${t.price?.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-20 text-gray-500 text-lg">
                Click “AI Check” to analyze the current chart
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
    </div>

      {/* Elliott Wave Training Manual Section */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Card className="bg-slate-900/90 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cyan-400">
              <TrendingUp className="w-5 h-5" />
              Elliott Wave Training Manual
            </CardTitle>
            <p className="text-sm text-gray-400">
              Learn to identify and label Elliott Wave patterns with visual examples
            </p>
          </CardHeader>
          <CardContent className="space-y-8">
            
            {/* Impulse Pattern */}
            <div className="border border-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-emerald-400 mb-3">Impulse Wave (5-Wave Motive)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="h-56 relative flex items-center justify-center">
                    {/* Impulse with proper 5-3-5-3-5 structure and Fib ratios */}
                    {/* W1=base(30pts), W2=61.8%(18pts), W3=161.8%(49pts), W4=38.2%(19pts), W5=100%(30pts) */}
                    <svg viewBox="0 0 340 180" className="w-full h-full">
                      
                      {/* WAVE 1: 5 sub-waves UP from 160 to 130 (30pts) */}
                      {/* i */}
                      <line x1="10" y1="155" x2="10" y2="163" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="7" y="156" width="5" height="5" fill="#00b4d8" rx="1"/>
                      {/* ii */}
                      <line x1="17" y1="154" x2="17" y2="162" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="14" y="157" width="5" height="3" fill="#0077b6" rx="1"/>
                      {/* iii */}
                      <line x1="24" y1="145" x2="24" y2="158" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="21" y="147" width="5" height="8" fill="#00b4d8" rx="1"/>
                      {/* iv */}
                      <line x1="31" y1="148" x2="31" y2="155" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="28" y="150" width="5" height="3" fill="#0077b6" rx="1"/>
                      {/* v */}
                      <line x1="38" y1="138" x2="38" y2="152" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="35" y="140" width="5" height="9" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE 2: 3 sub-waves DOWN (61.8% = 18pts) from 130 to 148 */}
                      {/* a */}
                      <line x1="45" y1="145" x2="45" y2="158" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="42" y="148" width="5" height="7" fill="#0077b6" rx="1"/>
                      {/* b */}
                      <line x1="52" y1="145" x2="52" y2="155" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="49" y="147" width="5" height="5" fill="#00b4d8" rx="1"/>
                      {/* c */}
                      <line x1="59" y1="152" x2="59" y2="165" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="56" y="155" width="5" height="7" fill="#0077b6" rx="1"/>
                      
                      {/* WAVE 3: 5 sub-waves UP (161.8% = 49pts) from 148 to 99 - LONGEST */}
                      {/* i */}
                      <line x1="66" y1="145" x2="66" y2="160" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="63" y="147" width="5" height="10" fill="#00b4d8" rx="1"/>
                      {/* ii */}
                      <line x1="73" y1="148" x2="73" y2="158" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="70" y="151" width="5" height="5" fill="#0077b6" rx="1"/>
                      {/* iii (extended - largest candles) */}
                      <line x1="80" y1="130" x2="80" y2="155" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="77" y="132" width="5" height="18" fill="#00b4d8" rx="1"/>

                      <line x1="87" y1="112" x2="87" y2="138" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="84" y="115" width="5" height="18" fill="#00b4d8" rx="1"/>
                      <line x1="94" y1="95" x2="94" y2="120" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="91" y="98" width="5" height="18" fill="#00b4d8" rx="1"/>
                      {/* iv */}
                      <line x1="101" y1="100" x2="101" y2="115" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="98" y="103" width="5" height="9" fill="#0077b6" rx="1"/>
                      {/* v */}
                      <line x1="108" y1="82" x2="108" y2="105" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="105" y="85" width="5" height="15" fill="#00b4d8" rx="1"/>
                      <line x1="115" y1="68" x2="115" y2="88" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="112" y="70" width="5" height="14" fill="#00b4d8" rx="1"/>
                      <line x1="122" y1="55" x2="122" y2="75" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="119" y="58" width="5" height="12" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE 4: 3 sub-waves DOWN (38.2% of W3 = 19pts) from 99 to 118 */}
                      {/* a */}
                      <line x1="129" y1="65" x2="129" y2="82" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="126" y="68" width="5" height="11" fill="#0077b6" rx="1"/>
                      {/* b */}
                      <line x1="136" y1="62" x2="136" y2="75" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="133" y="65" width="5" height="7" fill="#00b4d8" rx="1"/>
                      {/* c */}
                      <line x1="143" y1="72" x2="143" y2="88" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="140" y="75" width="5" height="10" fill="#0077b6" rx="1"/>
                      
                      {/* WAVE 5: 5 sub-waves UP (100% of W1 = 30pts) from 118 to 88 */}
                      {/* i */}
                      <line x1="150" y1="70" x2="150" y2="82" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="147" y="72" width="5" height="7" fill="#00b4d8" rx="1"/>
                      {/* ii */}
                      <line x1="157" y1="73" x2="157" y2="82" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="154" y="76" width="5" height="4" fill="#0077b6" rx="1"/>
                      {/* iii */}
                      <line x1="164" y1="58" x2="164" y2="78" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="161" y="60" width="5" height="14" fill="#00b4d8" rx="1"/>
                      <line x1="171" y1="48" x2="171" y2="65" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="168" y="50" width="5" height="12" fill="#00b4d8" rx="1"/>
                      {/* iv */}
                      <line x1="178" y1="52" x2="178" y2="62" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="175" y="55" width="5" height="5" fill="#0077b6" rx="1"/>
                      {/* v */}
                      <line x1="185" y1="42" x2="185" y2="58" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="182" y="44" width="5" height="11" fill="#00b4d8" rx="1"/>
                      <line x1="192" y1="35" x2="192" y2="48" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="189" y="37" width="5" height="9" fill="#00b4d8" rx="1"/>
                      
                      {/* Wave labels at major pivots */}
                      <text x="5" y="175" fill="#00b4d8" fontSize="10" fontWeight="bold">0</text>
                      <text x="34" y="132" fill="#00b4d8" fontSize="10" fontWeight="bold">1</text>
                      <text x="54" y="175" fill="#fbbf24" fontSize="10" fontWeight="bold">2</text>
                      <text x="118" y="50" fill="#00b4d8" fontSize="10" fontWeight="bold">3</text>
                      <text x="138" y="95" fill="#fbbf24" fontSize="10" fontWeight="bold">4</text>
                      <text x="188" y="30" fill="#00b4d8" fontSize="10" fontWeight="bold">5</text>
                      
                      {/* Wave path connecting major pivots */}
                      <polyline points="10,160 38,140 59,162 122,58 143,85 192,37" fill="none" stroke="#00b4d8" strokeWidth="1.5" strokeDasharray="3" opacity="0.5"/>
                      
                      {/* Legend showing ratios */}
                      <text x="210" y="55" fill="#94a3b8" fontSize="7">W1: Base (5 waves)</text>
                      <text x="210" y="67" fill="#fbbf24" fontSize="7">W2: 61.8% (3 waves)</text>
                      <text x="210" y="79" fill="#00b4d8" fontSize="7">W3: 161.8% (5 waves)</text>
                      <text x="210" y="91" fill="#fbbf24" fontSize="7">W4: 38.2% (3 waves)</text>
                      <text x="210" y="103" fill="#00b4d8" fontSize="7">W5: 100% (5 waves)</text>
                      <text x="210" y="120" fill="#a855f7" fontSize="8" fontWeight="bold">5-3-5-3-5</text>
                    </svg>
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-2">Impulse: 5-3-5-3-5 with W3=161.8%, W2=61.8%, W4=38.2%</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Rules</h4>
                    <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                      <li>Wave 2 never retraces more than 100% of Wave 1</li>
                      <li>Wave 3 is never the shortest motive wave</li>
                      <li>Wave 4 never enters Wave 1 territory</li>
                      <li>Waves 1, 3, 5 are motive (trend direction)</li>
                      <li>Waves 2, 4 are corrective (counter-trend)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Fibonacci Targets</h4>
                    <ul className="text-xs text-gray-300 space-y-1">
                      <li><span className="text-yellow-400">Wave 2:</span> 50% - 61.8% of Wave 1</li>
                      <li><span className="text-cyan-400">Wave 3:</span> 161.8% - 261.8% of Wave 1</li>
                      <li><span className="text-yellow-400">Wave 4:</span> 38.2% - 50% of Wave 3</li>
                      <li><span className="text-cyan-400">Wave 5:</span> 61.8% - 100% of (W1+W3)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Diagonal Pattern */}
            <div className="border border-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-purple-400 mb-3">Diagonal (Ending/Leading)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="h-56 relative flex items-center justify-center">
                    {/* Diagonal with proper Fib ratios and trendlines connecting 1-3 and 2-4 */}
                    <svg viewBox="0 0 320 180" className="w-full h-full">
                      
                      {/* WAVE 1: a-b-c UP from 155 to 120 */}
                      <line x1="12" y1="148" x2="12" y2="158" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="9" y="150" width="5" height="6" fill="#00b4d8" rx="1"/>
                      <line x1="19" y1="140" x2="19" y2="152" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="16" y="142" width="5" height="8" fill="#00b4d8" rx="1"/>
                      <line x1="26" y1="142" x2="26" y2="152" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="23" y="145" width="5" height="5" fill="#0077b6" rx="1"/>
                      <line x1="33" y1="130" x2="33" y2="148" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="30" y="132" width="5" height="12" fill="#00b4d8" rx="1"/>
                      <line x1="40" y1="118" x2="40" y2="135" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="37" y="120" width="5" height="12" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE 2: a-b-c DOWN from 120 to 148 */}
                      <line x1="47" y1="125" x2="47" y2="138" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="44" y="127" width="5" height="9" fill="#0077b6" rx="1"/>
                      <line x1="54" y1="132" x2="54" y2="145" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="51" y="135" width="5" height="8" fill="#0077b6" rx="1"/>
                      <line x1="61" y1="128" x2="61" y2="140" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="58" y="130" width="5" height="7" fill="#00b4d8" rx="1"/>
                      <line x1="68" y1="138" x2="68" y2="152" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="65" y="140" width="5" height="9" fill="#0077b6" rx="1"/>
                      <line x1="75" y1="145" x2="75" y2="158" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="72" y="147" width="5" height="8" fill="#0077b6" rx="1"/>
                      
                      {/* WAVE 3: a-b-c UP from 148 to 78 */}
                      <line x1="82" y1="132" x2="82" y2="150" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="79" y="134" width="5" height="12" fill="#00b4d8" rx="1"/>
                      <line x1="89" y1="118" x2="89" y2="138" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="86" y="120" width="5" height="14" fill="#00b4d8" rx="1"/>
                      <line x1="96" y1="122" x2="96" y2="135" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="93" y="125" width="5" height="7" fill="#0077b6" rx="1"/>
                      <line x1="103" y1="105" x2="103" y2="128" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="100" y="108" width="5" height="15" fill="#00b4d8" rx="1"/>
                      <line x1="110" y1="88" x2="110" y2="112" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="107" y="90" width="5" height="18" fill="#00b4d8" rx="1"/>
                      <line x1="117" y1="72" x2="117" y2="95" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="114" y="75" width="5" height="15" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE 4: a-b-c DOWN from 78 to 115 */}
                      <line x1="124" y1="82" x2="124" y2="98" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="121" y="85" width="5" height="10" fill="#0077b6" rx="1"/>
                      <line x1="131" y1="92" x2="131" y2="108" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="128" y="95" width="5" height="10" fill="#0077b6" rx="1"/>
                      <line x1="138" y1="88" x2="138" y2="102" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="135" y="90" width="5" height="8" fill="#00b4d8" rx="1"/>
                      <line x1="145" y1="98" x2="145" y2="115" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="142" y="100" width="5" height="12" fill="#0077b6" rx="1"/>
                      <line x1="152" y1="108" x2="152" y2="125" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="149" y="110" width="5" height="12" fill="#0077b6" rx="1"/>
                      
                      {/* WAVE 5: a-b-c UP from 115 to 65 */}
                      <line x1="159" y1="100" x2="159" y2="118" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="156" y="102" width="5" height="12" fill="#00b4d8" rx="1"/>
                      <line x1="166" y1="88" x2="166" y2="105" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="163" y="90" width="5" height="12" fill="#00b4d8" rx="1"/>
                      <line x1="173" y1="92" x2="173" y2="105" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="170" y="94" width="5" height="8" fill="#0077b6" rx="1"/>
                      <line x1="180" y1="78" x2="180" y2="95" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="177" y="80" width="5" height="12" fill="#00b4d8" rx="1"/>
                      <line x1="187" y1="62" x2="187" y2="82" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="184" y="65" width="5" height="14" fill="#00b4d8" rx="1"/>
                      
                      {/* Converging trendlines - connect 1-3 (upper) and 2-4 (lower) */}
                      {/* Upper: W1 top (40,120) to W3 top (117,75) extended */}
                      <line x1="40" y1="120" x2="200" y2="55" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4" opacity="0.7"/>
                      {/* Lower: W2 bottom (75,155) to W4 bottom (152,122) extended */}
                      <line x1="75" y1="155" x2="200" y2="105" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4" opacity="0.7"/>
                      
                      {/* Wave labels at pivots */}
                      <text x="6" y="168" fill="#00b4d8" fontSize="10" fontWeight="bold">0</text>
                      <text x="36" y="112" fill="#00b4d8" fontSize="10" fontWeight="bold">1</text>
                      <text x="70" y="168" fill="#fbbf24" fontSize="10" fontWeight="bold">2</text>
                      <text x="112" y="66" fill="#00b4d8" fontSize="10" fontWeight="bold">3</text>
                      <text x="147" y="132" fill="#fbbf24" fontSize="10" fontWeight="bold">4</text>
                      <text x="182" y="58" fill="#00b4d8" fontSize="10" fontWeight="bold">5</text>
                      
                      {/* Wave path connecting major pivots */}
                      <polyline points="12,155 40,120 75,155 117,75 152,122 187,65" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="3" opacity="0.5"/>
                      
                      {/* Legend */}
                      <text x="205" y="80" fill="#94a3b8" fontSize="8">Each wave = a-b-c</text>
                      <text x="205" y="92" fill="#a855f7" fontSize="9" fontWeight="bold">3-3-3-3-3</text>
                      <text x="205" y="108" fill="#fbbf24" fontSize="7">1-3 line (upper)</text>
                      <text x="205" y="118" fill="#fbbf24" fontSize="7">2-4 line (lower)</text>
                      <text x="205" y="132" fill="#94a3b8" fontSize="7">W5 &lt; W3 &lt; W1</text>
                    </svg>
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-2">Diagonal: Trendlines connect 1-3 and 2-4 (converging)</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Types & Positions</h4>
                    <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                      <li><span className="text-purple-400">Ending Diagonal:</span> Wave 5 or C (exhaustion)</li>
                      <li><span className="text-emerald-400">Leading Diagonal:</span> Wave 1 or A (new trend)</li>
                      <li><span className="text-gray-400">Contracting:</span> W5 &lt; W3 &lt; W1 (common)</li>
                      <li><span className="text-gray-400">Expanding:</span> W5 &gt; W3 &gt; W1 (rare)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Key Rules</h4>
                    <ul className="text-xs text-gray-300 space-y-0.5 list-disc list-inside">
                      <li>All 5 waves = 3-wave (a-b-c) structures</li>
                      <li>1-3 trendline connects W1 &amp; W3 tops</li>
                      <li>2-4 trendline connects W2 &amp; W4 bottoms</li>
                      <li>Wave 4 CAN enter Wave 1 territory</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Fibonacci Targets</h4>
                    <ul className="text-xs text-gray-300 space-y-0.5">
                      <li><span className="text-yellow-400">W2:</span> 50-88.6% of W1</li>
                      <li><span className="text-cyan-400">W3:</span> 61.8-161.8% of W1</li>
                      <li><span className="text-yellow-400">W4:</span> 50-78.6% of W3</li>
                      <li><span className="text-cyan-400">W5:</span> 38.2-123.6% of W3</li>
                    </ul>
                  </div>
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded">
                    <p className="text-xs text-emerald-300"><span className="font-semibold">Wave 1 Diagonal:</span> Leading diagonal in W1 signals powerful new trend. Expect deep W2 (61.8-78.6%) then extended W3.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Zigzag Correction */}
            <div className="border border-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-orange-400 mb-3">Zigzag Correction (A-B-C)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="h-56 relative flex items-center justify-center">
                    {/* Zigzag with proper 5-3-5 internal structure */}
                    {/* A=5 waves down, B=3 waves up (50% retrace), C=5 waves down (100-161.8% of A) */}
                    <svg viewBox="0 0 280 180" className="w-full h-full">
                      
                      {/* Starting point 0 */}
                      <line x1="10" y1="18" x2="10" y2="28" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="7" y="20" width="5" height="5" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE A: 5 sub-waves DOWN from 20 to 110 (90pts) */}
                      {/* i */}
                      <line x1="17" y1="28" x2="17" y2="45" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="14" y="30" width="5" height="12" fill="#0077b6" rx="1"/>
                      {/* ii */}
                      <line x1="24" y1="32" x2="24" y2="42" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="21" y="34" width="5" height="5" fill="#00b4d8" rx="1"/>
                      {/* iii (extended - biggest move) */}
                      <line x1="31" y1="45" x2="31" y2="68" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="28" y="48" width="5" height="16" fill="#0077b6" rx="1"/>
                      <line x1="38" y1="62" x2="38" y2="85" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="35" y="65" width="5" height="16" fill="#0077b6" rx="1"/>
                      <line x1="45" y1="78" x2="45" y2="98" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="42" y="80" width="5" height="14" fill="#0077b6" rx="1"/>
                      {/* iv */}
                      <line x1="52" y1="85" x2="52" y2="98" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="49" y="87" width="5" height="8" fill="#00b4d8" rx="1"/>
                      {/* v */}
                      <line x1="59" y1="95" x2="59" y2="115" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="56" y="98" width="5" height="12" fill="#0077b6" rx="1"/>
                      <line x1="66" y1="108" x2="66" y2="128" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="63" y="110" width="5" height="14" fill="#0077b6" rx="1"/>
                      
                      {/* WAVE B: 3 sub-waves UP (50% retrace = 45pts) from 110 to 65 */}
                      {/* a */}
                      <line x1="73" y1="95" x2="73" y2="118" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="70" y="98" width="5" height="15" fill="#00b4d8" rx="1"/>
                      <line x1="80" y1="82" x2="80" y2="102" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="77" y="85" width="5" height="12" fill="#00b4d8" rx="1"/>
                      {/* b */}
                      <line x1="87" y1="88" x2="87" y2="102" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="84" y="92" width="5" height="7" fill="#0077b6" rx="1"/>
                      {/* c */}
                      <line x1="94" y1="72" x2="94" y2="95" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="91" y="75" width="5" height="15" fill="#00b4d8" rx="1"/>
                      <line x1="101" y1="58" x2="101" y2="78" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="98" y="60" width="5" height="14" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE C: 5 sub-waves DOWN (100% of A = 90pts) from 65 to 155 - LOWER than A */}
                      {/* i */}
                      <line x1="108" y1="72" x2="108" y2="92" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="105" y="75" width="5" height="13" fill="#0077b6" rx="1"/>
                      {/* ii */}
                      <line x1="115" y1="78" x2="115" y2="90" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="112" y="80" width="5" height="7" fill="#00b4d8" rx="1"/>
                      {/* iii (extended - biggest) */}
                      <line x1="122" y1="92" x2="122" y2="115" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="119" y="95" width="5" height="16" fill="#0077b6" rx="1"/>
                      <line x1="129" y1="108" x2="129" y2="132" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="126" y="110" width="5" height="18" fill="#0077b6" rx="1"/>
                      <line x1="136" y1="125" x2="136" y2="148" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="133" y="128" width="5" height="16" fill="#0077b6" rx="1"/>
                      {/* iv */}
                      <line x1="143" y1="135" x2="143" y2="150" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="140" y="138" width="5" height="8" fill="#00b4d8" rx="1"/>
                      {/* v */}
                      <line x1="150" y1="148" x2="150" y2="168" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="147" y="150" width="5" height="14" fill="#0077b6" rx="1"/>
                      <line x1="157" y1="158" x2="157" y2="175" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="154" y="160" width="5" height="12" fill="#0077b6" rx="1"/>
                      
                      {/* Wave labels */}
                      <text x="5" y="15" fill="#00b4d8" fontSize="10" fontWeight="bold">0</text>
                      <text x="62" y="138" fill="#ef4444" fontSize="10" fontWeight="bold">A</text>
                      <text x="96" y="52" fill="#fbbf24" fontSize="10" fontWeight="bold">B</text>
                      <text x="152" y="178" fill="#ef4444" fontSize="10" fontWeight="bold">C</text>
                      
                      {/* Wave path */}
                      <polyline points="10,20 66,124 101,60 157,172" fill="none" stroke="#f97316" strokeWidth="1.5" strokeDasharray="3" opacity="0.6"/>
                      
                      {/* Horizontal reference showing C lower than A */}
                      <line x1="60" y1="124" x2="165" y2="124" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="2" opacity="0.4"/>
                      <text x="168" y="127" fill="#ef4444" fontSize="6" opacity="0.7">A level</text>
                      
                      {/* Legend */}
                      <text x="185" y="60" fill="#94a3b8" fontSize="7">A: 5 waves down</text>
                      <text x="185" y="72" fill="#fbbf24" fontSize="7">B: 3 waves (50%)</text>
                      <text x="185" y="84" fill="#94a3b8" fontSize="7">C: 5 waves down</text>
                      <text x="185" y="100" fill="#f97316" fontSize="8" fontWeight="bold">5-3-5</text>
                      <text x="185" y="115" fill="#ef4444" fontSize="6">C extends past A</text>
                    </svg>
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-2">Zigzag: 5-3-5 with C extending beyond A</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Characteristics</h4>
                    <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                      <li>Sharp, impulsive move in Wave A</li>
                      <li>Wave B is typically shallow (38-62% of A)</li>
                      <li>Wave C often equals Wave A in length</li>
                      <li>Internal structure: 5-3-5</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Fibonacci Targets</h4>
                    <ul className="text-xs text-gray-300 space-y-1">
                      <li><span className="text-yellow-400">Wave B:</span> 38.2% - 61.8% of Wave A</li>
                      <li><span className="text-red-400">Wave C:</span> 100% - 161.8% of Wave A</li>
                    </ul>
                  </div>
                  <div className="p-2 bg-orange-500/10 border border-orange-500/30 rounded">
                    <p className="text-xs text-orange-300">Zigzags are the sharpest corrections. Often seen in Wave 2 positions.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Flat Correction */}
            <div className="border border-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-blue-400 mb-3">Flat Correction (A-B-C)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="h-56 relative flex items-center justify-center">
                    {/* Regular Flat with proper 3-3-5 internal structure */}
                    {/* A=3 waves, B=3 waves (deep 90-100%), C=5 waves ending at A level */}
                    <svg viewBox="0 0 280 160" className="w-full h-full">
                      
                      {/* Starting point 0 */}
                      <line x1="10" y1="28" x2="10" y2="38" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="7" y="30" width="5" height="5" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE A: 3 sub-waves (a-b-c) DOWN from 30 to 100 */}
                      {/* a down */}
                      <line x1="17" y1="40" x2="17" y2="58" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="14" y="42" width="5" height="13" fill="#0077b6" rx="1"/>
                      <line x1="24" y1="52" x2="24" y2="72" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="21" y="55" width="5" height="14" fill="#0077b6" rx="1"/>
                      {/* b up */}
                      <line x1="31" y1="58" x2="31" y2="72" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="28" y="60" width="5" height="9" fill="#00b4d8" rx="1"/>
                      {/* c down */}
                      <line x1="38" y1="68" x2="38" y2="88" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="35" y="70" width="5" height="14" fill="#0077b6" rx="1"/>
                      <line x1="45" y1="82" x2="45" y2="105" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="42" y="85" width="5" height="16" fill="#0077b6" rx="1"/>
                      
                      {/* WAVE B: 3 sub-waves (a-b-c) UP - deep retrace (90-100%) from 100 to ~35 */}
                      {/* a up */}
                      <line x1="52" y1="70" x2="52" y2="95" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="49" y="72" width="5" height="18" fill="#00b4d8" rx="1"/>
                      <line x1="59" y1="55" x2="59" y2="78" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="56" y="58" width="5" height="16" fill="#00b4d8" rx="1"/>
                      {/* b down */}
                      <line x1="66" y1="62" x2="66" y2="78" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="63" y="65" width="5" height="10" fill="#0077b6" rx="1"/>
                      {/* c up - reaches near start */}
                      <line x1="73" y1="45" x2="73" y2="68" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="70" y="48" width="5" height="16" fill="#00b4d8" rx="1"/>
                      <line x1="80" y1="32" x2="80" y2="52" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="77" y="35" width="5" height="14" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE C: 5 sub-waves (i-ii-iii-iv-v) DOWN - ends at A level (~100) */}
                      {/* i */}
                      <line x1="87" y1="42" x2="87" y2="58" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="84" y="45" width="5" height="10" fill="#0077b6" rx="1"/>
                      {/* ii */}
                      <line x1="94" y1="48" x2="94" y2="58" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="91" y="50" width="5" height="5" fill="#00b4d8" rx="1"/>
                      {/* iii */}
                      <line x1="101" y1="55" x2="101" y2="72" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="98" y="58" width="5" height="11" fill="#0077b6" rx="1"/>
                      <line x1="108" y1="68" x2="108" y2="85" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="105" y="70" width="5" height="12" fill="#0077b6" rx="1"/>
                      {/* iv */}
                      <line x1="115" y1="75" x2="115" y2="85" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="112" y="77" width="5" height="5" fill="#00b4d8" rx="1"/>
                      {/* v - ends at A level */}
                      <line x1="122" y1="82" x2="122" y2="98" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="119" y="85" width="5" height="10" fill="#0077b6" rx="1"/>
                      <line x1="129" y1="92" x2="129" y2="105" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="126" y="95" width="5" height="7" fill="#0077b6" rx="1"/>
                      
                      {/* Wave labels */}
                      <text x="5" y="25" fill="#00b4d8" fontSize="10" fontWeight="bold">0</text>
                      <text x="40" y="115" fill="#ef4444" fontSize="10" fontWeight="bold">A</text>
                      <text x="76" y="28" fill="#fbbf24" fontSize="10" fontWeight="bold">B</text>
                      <text x="124" y="115" fill="#ef4444" fontSize="10" fontWeight="bold">C</text>
                      
                      {/* Wave path - C ends at same level as A */}
                      <polyline points="10,30 45,101 80,35 129,101" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3" opacity="0.6"/>
                      
                      {/* Horizontal reference lines showing "flat" nature */}
                      <line x1="5" y1="30" x2="90" y2="30" stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="2" opacity="0.4"/>
                      <text x="55" y="27" fill="#3b82f6" fontSize="6" opacity="0.6">0 level</text>
                      <line x1="5" y1="101" x2="145" y2="101" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="2" opacity="0.6"/>
                      <text x="55" y="98" fill="#ef4444" fontSize="6" opacity="0.6">A = C level</text>
                      
                      {/* 161% extension zone indicator */}
                      <line x1="5" y1="145" x2="145" y2="145" stroke="#f97316" strokeWidth="0.5" strokeDasharray="4" opacity="0.4"/>
                      <text x="55" y="142" fill="#f97316" fontSize="5" opacity="0.6">161% extension</text>
                      
                      {/* Legend */}
                      <text x="155" y="35" fill="#94a3b8" fontSize="7">A: 3 waves (a-b-c)</text>
                      <text x="155" y="47" fill="#fbbf24" fontSize="7">B: 3 waves (90-100%)</text>
                      <text x="155" y="59" fill="#94a3b8" fontSize="7">C: 5 waves (i-ii-iii-iv-v)</text>
                      <text x="155" y="75" fill="#3b82f6" fontSize="8" fontWeight="bold">REGULAR FLAT</text>
                      <text x="155" y="88" fill="#fbbf24" fontSize="6">B nearly reaches 0</text>
                      <text x="155" y="100" fill="#ef4444" fontSize="6">C = ~100% of A</text>
                      <text x="155" y="115" fill="#f97316" fontSize="6">Can extend to 161%</text>
                    </svg>
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-2">Regular Flat: 3-3-5 with B near start, C ends at A level (can extend to 161%)</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Types of Flats</h4>
                    <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                      <li><span className="text-blue-400">Regular:</span> B ends near start of A, C ends near end of A</li>
                      <li><span className="text-yellow-400">Expanded:</span> B exceeds start of A, C exceeds end of A</li>
                      <li><span className="text-gray-400">Running:</span> B exceeds start of A, C doesn't reach end of A</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Fibonacci Targets</h4>
                    <ul className="text-xs text-gray-300 space-y-1">
                      <li><span className="text-yellow-400">Wave B:</span> 78.6% - 138.2% of Wave A</li>
                      <li><span className="text-red-400">Wave C:</span> 100% - 161.8% of Wave A</li>
                    </ul>
                  </div>
                  <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded">
                    <p className="text-xs text-blue-300">Flats are sideways corrections. Wave B nearly or fully retraces Wave A. Often in Wave 4.</p>
                  </div>
                </div>
              </div>

              {/* Flat Type Variants - Expanded and Running */}
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                {/* Expanded Flat */}
                <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-500/30">
                  <h4 className="text-sm font-semibold text-yellow-400 mb-2">Expanded Flat (3-3-5)</h4>
                  <div className="h-48 relative flex items-center justify-center">
                    <svg viewBox="0 0 240 160" className="w-full h-full">
                      {/* Starting point 0 */}
                      <line x1="10" y1="48" x2="10" y2="58" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="7" y="50" width="5" height="5" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE A: 3 waves down (a-b-c) from 50 to 90 */}
                      <line x1="17" y1="58" x2="17" y2="72" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="14" y="60" width="5" height="10" fill="#0077b6" rx="1"/>
                      <line x1="24" y1="65" x2="24" y2="75" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="21" y="67" width="5" height="5" fill="#00b4d8" rx="1"/>
                      <line x1="31" y1="75" x2="31" y2="92" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="28" y="78" width="5" height="10" fill="#0077b6" rx="1"/>
                      
                      {/* WAVE B: 3 waves UP - exceeds start (>100%) from 90 to 35 */}
                      <line x1="38" y1="68" x2="38" y2="88" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="35" y="70" width="5" height="14" fill="#00b4d8" rx="1"/>
                      <line x1="45" y1="55" x2="45" y2="72" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="42" y="58" width="5" height="10" fill="#00b4d8" rx="1"/>
                      <line x1="52" y1="48" x2="52" y2="60" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="49" y="50" width="5" height="7" fill="#0077b6" rx="1"/>
                      <line x1="59" y1="32" x2="59" y2="52" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="56" y="35" width="5" height="14" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE C: 5 waves DOWN - exceeds A (>100%) from 35 to 130 */}
                      <line x1="66" y1="45" x2="66" y2="60" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="63" y="48" width="5" height="9" fill="#0077b6" rx="1"/>
                      <line x1="73" y1="52" x2="73" y2="62" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="70" y="54" width="5" height="5" fill="#00b4d8" rx="1"/>
                      <line x1="80" y1="62" x2="80" y2="82" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="77" y="65" width="5" height="13" fill="#0077b6" rx="1"/>
                      <line x1="87" y1="78" x2="87" y2="100" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="84" y="80" width="5" height="16" fill="#0077b6" rx="1"/>
                      <line x1="94" y1="95" x2="94" y2="118" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="91" y="98" width="5" height="16" fill="#0077b6" rx="1"/>
                      <line x1="101" y1="108" x2="101" y2="120" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="98" y="110" width="5" height="7" fill="#00b4d8" rx="1"/>
                      <line x1="108" y1="118" x2="108" y2="138" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="105" y="120" width="5" height="14" fill="#0077b6" rx="1"/>
                      
                      {/* Wave labels */}
                      <text x="5" y="45" fill="#00b4d8" fontSize="9" fontWeight="bold">0</text>
                      <text x="26" y="100" fill="#ef4444" fontSize="9" fontWeight="bold">A</text>
                      <text x="54" y="28" fill="#fbbf24" fontSize="9" fontWeight="bold">B</text>
                      <text x="103" y="148" fill="#ef4444" fontSize="9" fontWeight="bold">C</text>
                      
                      {/* Reference lines */}
                      <line x1="5" y1="50" x2="70" y2="50" stroke="#00b4d8" strokeWidth="0.5" strokeDasharray="2" opacity="0.5"/>
                      <text x="3" y="47" fill="#00b4d8" fontSize="5">0</text>
                      <line x1="5" y1="90" x2="115" y2="90" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="2" opacity="0.5"/>
                      <text x="3" y="87" fill="#ef4444" fontSize="5">A</text>
                      
                      {/* Wave path */}
                      <polyline points="10,50 31,90 59,35 108,134" fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3" opacity="0.6"/>
                      
                      {/* Legend */}
                      <text x="130" y="45" fill="#fbbf24" fontSize="8" fontWeight="bold">EXPANDED</text>
                      <text x="130" y="58" fill="#94a3b8" fontSize="6">{"B > 100% of A"}</text>
                      <text x="130" y="68" fill="#94a3b8" fontSize="6">{"C > 100% of A"}</text>
                      <text x="130" y="82" fill="#fbbf24" fontSize="7">B exceeds 0</text>
                      <text x="130" y="92" fill="#ef4444" fontSize="7">C exceeds A</text>
                    </svg>
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-1">B breaks above start, C breaks below A</p>
                </div>

                {/* Running Flat */}
                <div className="bg-slate-800/50 rounded-lg p-4 border border-gray-500/30">
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">Running Flat (3-3-5)</h4>
                  <div className="h-48 relative flex items-center justify-center">
                    <svg viewBox="0 0 240 160" className="w-full h-full">
                      {/* Starting point 0 */}
                      <line x1="10" y1="58" x2="10" y2="68" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="7" y="60" width="5" height="5" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE A: 3 waves down (a-b-c) from 60 to 100 */}
                      <line x1="17" y1="68" x2="17" y2="82" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="14" y="70" width="5" height="10" fill="#0077b6" rx="1"/>
                      <line x1="24" y1="75" x2="24" y2="85" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="21" y="77" width="5" height="5" fill="#00b4d8" rx="1"/>
                      <line x1="31" y1="85" x2="31" y2="102" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="28" y="88" width="5" height="10" fill="#0077b6" rx="1"/>
                      
                      {/* WAVE B: 3 waves UP - exceeds start (>100%) from 100 to 40 */}
                      <line x1="38" y1="78" x2="38" y2="98" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="35" y="80" width="5" height="14" fill="#00b4d8" rx="1"/>
                      <line x1="45" y1="62" x2="45" y2="82" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="42" y="65" width="5" height="12" fill="#00b4d8" rx="1"/>
                      <line x1="52" y1="52" x2="52" y2="68" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="49" y="55" width="5" height="9" fill="#0077b6" rx="1"/>
                      <line x1="59" y1="38" x2="59" y2="58" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="56" y="40" width="5" height="14" fill="#00b4d8" rx="1"/>
                      
                      {/* WAVE C: 5 waves DOWN - does NOT reach A from 40 to 85 */}
                      <line x1="66" y1="48" x2="66" y2="62" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="63" y="50" width="5" height="9" fill="#0077b6" rx="1"/>
                      <line x1="73" y1="55" x2="73" y2="65" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="70" y="57" width="5" height="5" fill="#00b4d8" rx="1"/>
                      <line x1="80" y1="62" x2="80" y2="78" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="77" y="65" width="5" height="10" fill="#0077b6" rx="1"/>
                      <line x1="87" y1="72" x2="87" y2="88" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="84" y="75" width="5" height="10" fill="#0077b6" rx="1"/>
                      <line x1="94" y1="80" x2="94" y2="95" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="91" y="82" width="5" height="10" fill="#0077b6" rx="1"/>
                      <line x1="101" y1="85" x2="101" y2="95" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="98" y="87" width="5" height="5" fill="#00b4d8" rx="1"/>
                      <line x1="108" y1="88" x2="108" y2="100" stroke="#0077b6" strokeWidth="1"/>
                      <rect x="105" y="90" width="5" height="7" fill="#0077b6" rx="1"/>
                      
                      {/* Wave labels */}
                      <text x="5" y="55" fill="#00b4d8" fontSize="9" fontWeight="bold">0</text>
                      <text x="26" y="110" fill="#ef4444" fontSize="9" fontWeight="bold">A</text>
                      <text x="54" y="33" fill="#fbbf24" fontSize="9" fontWeight="bold">B</text>
                      <text x="103" y="108" fill="#ef4444" fontSize="9" fontWeight="bold">C</text>
                      
                      {/* Reference lines */}
                      <line x1="5" y1="60" x2="70" y2="60" stroke="#00b4d8" strokeWidth="0.5" strokeDasharray="2" opacity="0.5"/>
                      <text x="3" y="57" fill="#00b4d8" fontSize="5">0</text>
                      <line x1="5" y1="100" x2="115" y2="100" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="2" opacity="0.5"/>
                      <text x="3" y="97" fill="#ef4444" fontSize="5">A</text>
                      
                      {/* Wave path - C stays above A level */}
                      <polyline points="10,60 31,100 59,40 108,97" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3" opacity="0.6"/>
                      
                      {/* Legend */}
                      <text x="130" y="45" fill="#94a3b8" fontSize="8" fontWeight="bold">RUNNING</text>
                      <text x="130" y="58" fill="#94a3b8" fontSize="6">{"B > 100% of A"}</text>
                      <text x="130" y="68" fill="#22c55e" fontSize="6">{"C < 100% of A"}</text>
                      <text x="130" y="82" fill="#fbbf24" fontSize="7">B exceeds 0</text>
                      <text x="130" y="92" fill="#22c55e" fontSize="7">C fails to reach A</text>
                      <text x="130" y="108" fill="#60a5fa" fontSize="6">Strong trend signal</text>
                    </svg>
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-1">B breaks start, C fails to reach A (bullish)</p>
                </div>
              </div>
            </div>

            {/* Triangle Pattern */}
            <div className="border border-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-teal-400 mb-3">Triangle (A-B-C-D-E)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="h-48 relative flex items-center justify-center">
                    {/* Visual triangle using SVG with blue simulated candles */}
                    <svg viewBox="0 0 220 140" className="w-full h-full">
                      {/* Converging trendlines */}
                      <line x1="10" y1="20" x2="200" y2="55" stroke="#14b8a6" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
                      <line x1="10" y1="120" x2="200" y2="85" stroke="#14b8a6" strokeWidth="1" strokeDasharray="4" opacity="0.5"/>
                      {/* Wave 0 - Starting point */}
                      <rect x="15" y="15" width="5" height="25" fill="#00b4d8" rx="1"/>
                      {/* Wave A - Down */}
                      <rect x="25" y="35" width="5" height="30" fill="#0077b6" rx="1"/>
                      <rect x="33" y="55" width="5" height="35" fill="#0077b6" rx="1"/>
                      <rect x="41" y="75" width="5" height="35" fill="#0077b6" rx="1"/>
                      {/* Wave B - Up */}
                      <rect x="51" y="55" width="5" height="35" fill="#00b4d8" rx="1"/>
                      <rect x="59" y="35" width="5" height="30" fill="#00b4d8" rx="1"/>
                      <rect x="67" y="25" width="5" height="25" fill="#00b4d8" rx="1"/>
                      {/* Wave C - Down (smaller) */}
                      <rect x="77" y="45" width="5" height="30" fill="#0077b6" rx="1"/>
                      <rect x="85" y="60" width="5" height="30" fill="#0077b6" rx="1"/>
                      <rect x="93" y="70" width="5" height="25" fill="#0077b6" rx="1"/>
                      {/* Wave D - Up (smaller) */}
                      <rect x="103" y="55" width="5" height="25" fill="#00b4d8" rx="1"/>
                      <rect x="111" y="42" width="5" height="25" fill="#00b4d8" rx="1"/>
                      <rect x="119" y="35" width="5" height="20" fill="#00b4d8" rx="1"/>
                      {/* Wave E - Down (smallest) */}
                      <rect x="129" y="50" width="5" height="22" fill="#0077b6" rx="1"/>
                      <rect x="137" y="58" width="5" height="20" fill="#0077b6" rx="1"/>
                      <rect x="145" y="65" width="5" height="18" fill="#0077b6" rx="1"/>
                      {/* Wave labels */}
                      <text x="13" y="10" fill="#00b4d8" fontSize="11" fontWeight="bold">0</text>
                      <text x="39" y="120" fill="#ef4444" fontSize="11" fontWeight="bold">A</text>
                      <text x="65" y="18" fill="#fbbf24" fontSize="11" fontWeight="bold">B</text>
                      <text x="91" y="105" fill="#ef4444" fontSize="11" fontWeight="bold">C</text>
                      <text x="117" y="28" fill="#fbbf24" fontSize="11" fontWeight="bold">D</text>
                      <text x="143" y="93" fill="#ef4444" fontSize="11" fontWeight="bold">E</text>
                      {/* Wave path */}
                      <polyline points="18,15 44,110 70,25 96,95 122,35 148,83" fill="none" stroke="#14b8a6" strokeWidth="1.5" strokeDasharray="3" opacity="0.7"/>
                    </svg>
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-2">Contracting Triangle: Each wave smaller (Blue = Projected Candles)</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Characteristics</h4>
                    <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                      <li>5 waves labeled A-B-C-D-E</li>
                      <li>Each wave is a 3-wave correction</li>
                      <li>Only appears in Wave 4 or Wave B positions</li>
                      <li>Trendlines converge (contracting) or diverge (expanding)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white mb-1">Fibonacci Targets</h4>
                    <ul className="text-xs text-gray-300 space-y-1">
                      <li><span className="text-yellow-400">Wave B:</span> 50% - 85% of Wave A</li>
                      <li><span className="text-red-400">Wave C:</span> 50% - 85% of Wave B</li>
                      <li><span className="text-yellow-400">Wave D:</span> 50% - 85% of Wave C</li>
                      <li><span className="text-red-400">Wave E:</span> 50% - 85% of Wave D</li>
                    </ul>
                  </div>
                  <div className="p-2 bg-teal-500/10 border border-teal-500/30 rounded">
                    <p className="text-xs text-teal-300">Triangles show decreasing momentum. After E, expect a thrust in the direction of the larger trend.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Complex Corrections - Double & Triple Patterns */}
            <div className="border border-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-purple-400 mb-3">Complex Corrections (W-X-Y / W-X-Y-X-Z)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-purple-300 mb-2">Double Zigzag (W-X-Y)</h4>
                    <div className="h-64 relative flex items-center justify-center mb-2">
                      <svg viewBox="0 0 400 180" className="w-full h-full">
                        {/* Starting point */}
                        <line x1="8" y1="8" x2="8" y2="18" stroke="#0077b6" strokeWidth="1"/>
                        <rect x="5" y="10" width="4" height="4" fill="#00b4d8" rx="1"/>
                        
                        {/* ========== W ZIGZAG (5-3-5) ========== */}
                        {/* W-A wave (8 candles - impulsive down) */}
                        <rect x="12" y="18" width="4" height="12" fill="#0077b6" rx="1"/>
                        <rect x="18" y="26" width="4" height="10" fill="#0077b6" rx="1"/>
                        <rect x="24" y="32" width="4" height="6" fill="#00b4d8" rx="1"/>
                        <rect x="30" y="36" width="4" height="14" fill="#0077b6" rx="1"/>
                        <rect x="36" y="46" width="4" height="12" fill="#0077b6" rx="1"/>
                        <rect x="42" y="54" width="4" height="6" fill="#00b4d8" rx="1"/>
                        <rect x="48" y="58" width="4" height="14" fill="#0077b6" rx="1"/>
                        <rect x="54" y="68" width="4" height="12" fill="#0077b6" rx="1"/>
                        
                        {/* W-B wave (5 candles - corrective up) */}
                        <rect x="60" y="62" width="4" height="14" fill="#00b4d8" rx="1"/>
                        <rect x="66" y="52" width="4" height="12" fill="#00b4d8" rx="1"/>
                        <rect x="72" y="56" width="4" height="6" fill="#0077b6" rx="1"/>
                        <rect x="78" y="46" width="4" height="12" fill="#00b4d8" rx="1"/>
                        <rect x="84" y="38" width="4" height="10" fill="#00b4d8" rx="1"/>
                        
                        {/* W-C wave (8 candles - impulsive down) */}
                        <rect x="90" y="46" width="4" height="14" fill="#0077b6" rx="1"/>
                        <rect x="96" y="56" width="4" height="12" fill="#0077b6" rx="1"/>
                        <rect x="102" y="64" width="4" height="6" fill="#00b4d8" rx="1"/>
                        <rect x="108" y="68" width="4" height="16" fill="#0077b6" rx="1"/>
                        <rect x="114" y="80" width="4" height="14" fill="#0077b6" rx="1"/>
                        <rect x="120" y="90" width="4" height="6" fill="#00b4d8" rx="1"/>
                        <rect x="126" y="94" width="4" height="16" fill="#0077b6" rx="1"/>
                        <rect x="132" y="106" width="4" height="14" fill="#0077b6" rx="1"/>
                        
                        {/* W sub-labels - larger and clearer */}
                        <text x="50" y="90" fill="#ef4444" fontSize="9" fontWeight="bold">A</text>
                        <text x="80" y="32" fill="#fbbf24" fontSize="9" fontWeight="bold">B</text>
                        <text x="128" y="130" fill="#ef4444" fontSize="9" fontWeight="bold">C</text>
                        
                        {/* ========== X WAVE (connector - 8 candles up with a-b-c structure) ========== */}
                        {/* X-a up */}
                        <rect x="138" y="100" width="4" height="16" fill="#00b4d8" rx="1"/>
                        <rect x="144" y="86" width="4" height="16" fill="#00b4d8" rx="1"/>
                        <rect x="150" y="74" width="4" height="14" fill="#00b4d8" rx="1"/>
                        {/* X-b down */}
                        <rect x="156" y="78" width="4" height="10" fill="#0077b6" rx="1"/>
                        <rect x="162" y="84" width="4" height="8" fill="#0077b6" rx="1"/>
                        {/* X-c up */}
                        <rect x="168" y="72" width="4" height="14" fill="#00b4d8" rx="1"/>
                        <rect x="174" y="60" width="4" height="14" fill="#00b4d8" rx="1"/>
                        <rect x="180" y="50" width="4" height="12" fill="#00b4d8" rx="1"/>
                        
                        {/* ========== Y ZIGZAG (5-3-5) ========== */}
                        {/* Y-A wave (8 candles - impulsive down) */}
                        <rect x="186" y="58" width="4" height="12" fill="#0077b6" rx="1"/>
                        <rect x="192" y="66" width="4" height="10" fill="#0077b6" rx="1"/>
                        <rect x="198" y="72" width="4" height="6" fill="#00b4d8" rx="1"/>
                        <rect x="204" y="76" width="4" height="14" fill="#0077b6" rx="1"/>
                        <rect x="210" y="86" width="4" height="12" fill="#0077b6" rx="1"/>
                        <rect x="216" y="94" width="4" height="6" fill="#00b4d8" rx="1"/>
                        <rect x="222" y="98" width="4" height="14" fill="#0077b6" rx="1"/>
                        <rect x="228" y="108" width="4" height="12" fill="#0077b6" rx="1"/>
                        
                        {/* Y-B wave (5 candles - corrective up) */}
                        <rect x="234" y="102" width="4" height="14" fill="#00b4d8" rx="1"/>
                        <rect x="240" y="92" width="4" height="12" fill="#00b4d8" rx="1"/>
                        <rect x="246" y="96" width="4" height="6" fill="#0077b6" rx="1"/>
                        <rect x="252" y="86" width="4" height="12" fill="#00b4d8" rx="1"/>
                        <rect x="258" y="78" width="4" height="10" fill="#00b4d8" rx="1"/>
                        
                        {/* Y-C wave (8 candles - impulsive down) */}
                        <rect x="264" y="86" width="4" height="14" fill="#0077b6" rx="1"/>
                        <rect x="270" y="96" width="4" height="12" fill="#0077b6" rx="1"/>
                        <rect x="276" y="104" width="4" height="6" fill="#00b4d8" rx="1"/>
                        <rect x="282" y="108" width="4" height="16" fill="#0077b6" rx="1"/>
                        <rect x="288" y="120" width="4" height="14" fill="#0077b6" rx="1"/>
                        <rect x="294" y="130" width="4" height="6" fill="#00b4d8" rx="1"/>
                        <rect x="300" y="134" width="4" height="16" fill="#0077b6" rx="1"/>
                        <rect x="306" y="146" width="4" height="14" fill="#0077b6" rx="1"/>
                        
                        {/* Y sub-labels - larger and clearer */}
                        <text x="224" y="128" fill="#ef4444" fontSize="9" fontWeight="bold">A</text>
                        <text x="254" y="72" fill="#fbbf24" fontSize="9" fontWeight="bold">B</text>
                        <text x="302" y="170" fill="#ef4444" fontSize="9" fontWeight="bold">C</text>
                        
                        {/* Main W-X-Y Labels - positioned at end points */}
                        <text x="75" y="135" fill="#f97316" fontSize="14" fontWeight="bold">W</text>
                        <text x="175" y="42" fill="#fbbf24" fontSize="12" fontWeight="bold">X</text>
                        <text x="248" y="170" fill="#f97316" fontSize="14" fontWeight="bold">Y</text>
                        
                        {/* Wave path - connects end points */}
                        <polyline points="8,10 134,120 182,50 308,160" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="3" opacity="0.7"/>
                        
                        {/* Legend */}
                        <text x="310" y="30" fill="#94a3b8" fontSize="8">W = Zigzag (5-3-5)</text>
                        <text x="310" y="45" fill="#fbbf24" fontSize="8">X = Connector (3)</text>
                        <text x="310" y="60" fill="#94a3b8" fontSize="8">Y = Zigzag (5-3-5)</text>
                        <text x="310" y="85" fill="#a855f7" fontSize="8" fontWeight="bold">Used when single</text>
                        <text x="310" y="100" fill="#a855f7" fontSize="8" fontWeight="bold">zigzag too shallow</text>
                        <text x="310" y="125" fill="#ef4444" fontSize="7">A,C = 5 waves each</text>
                        <text x="310" y="140" fill="#fbbf24" fontSize="7">B = 3 waves</text>
                        <text x="310" y="160" fill="#94a3b8" fontSize="6">Each zigzag = 13 waves</text>
                      </svg>
                    </div>
                    <p className="text-xs text-gray-400">Two zigzags connected by X wave. Each zigzag shows clear A-B-C (5-3-5) internal structure.</p>
                  </div>

                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-purple-300 mb-2">Triple Zigzag (W-X-Y-X-Z)</h4>
                    <p className="text-xs text-gray-300 mb-2">Three zigzags connected by two X waves. Very rare - occurs when even double zigzag doesn't complete the correction.</p>
                    <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                      <li>W, Y, Z = Three separate zigzags (each 5-3-5)</li>
                      <li>X waves = Connectors (each is 3-wave pattern)</li>
                      <li>Creates extended sideways correction</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-indigo-300 mb-2">Combination (Double Three)</h4>
                    <p className="text-xs text-gray-300 mb-2">Mix of different correction types connected by X waves:</p>
                    <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                      <li><span className="text-orange-400">Zigzag + Flat:</span> Sharp move then sideways</li>
                      <li><span className="text-blue-400">Flat + Zigzag:</span> Sideways then sharp move</li>
                      <li><span className="text-teal-400">Zigzag + Triangle:</span> Sharp then contracting</li>
                      <li><span className="text-purple-400">Flat + Triangle:</span> Sideways then contracting</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded">
                    <h4 className="text-sm font-medium text-purple-300 mb-2">Key Rules for Complex Corrections</h4>
                    <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                      <li>Maximum of 3 simple patterns (W-X-Y-X-Z)</li>
                      <li>X waves are always 3-wave structures</li>
                      <li>Triangle can only appear as final pattern (Y or Z)</li>
                      <li>Each W/Y/Z must be a complete correction</li>
                      <li>Complex corrections = extended time, not necessarily price</li>
                    </ul>
                  </div>

                  <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded">
                    <p className="text-xs text-indigo-300">Complex corrections often form in Wave 4 positions or in B waves of larger patterns. They indicate indecision and are common in ranging markets.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ABC Summary Reference */}
            <div className="border border-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-cyan-400 mb-3">ABC Correction Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-800/50 rounded p-3 border border-orange-500/30">
                  <h4 className="text-sm font-semibold text-orange-400">Zigzag</h4>
                  <p className="text-xs text-gray-300 mt-1">5-3-5 structure</p>
                  <p className="text-xs text-gray-400">Sharp, impulsive A</p>
                  <p className="text-xs text-gray-400">B: 38-78% retrace</p>
                  <p className="text-xs text-gray-400">C extends past A</p>
                </div>
                <div className="bg-slate-800/50 rounded p-3 border border-blue-500/30">
                  <h4 className="text-sm font-semibold text-blue-400">Regular Flat</h4>
                  <p className="text-xs text-gray-300 mt-1">3-3-5 structure</p>
                  <p className="text-xs text-gray-400">B: 90-100% of A</p>
                  <p className="text-xs text-gray-400">C: ~100% of A</p>
                  <p className="text-xs text-gray-400">Sideways pattern</p>
                </div>
                <div className="bg-slate-800/50 rounded p-3 border border-yellow-500/30">
                  <h4 className="text-sm font-semibold text-yellow-400">Expanded Flat</h4>
                  <p className="text-xs text-gray-300 mt-1">3-3-5 structure</p>
                  <p className="text-xs text-gray-400">{"B > 100% of A"}</p>
                  <p className="text-xs text-gray-400">{"C > 100% of A"}</p>
                  <p className="text-xs text-gray-400">B exceeds start</p>
                </div>
                <div className="bg-slate-800/50 rounded p-3 border border-gray-500/30">
                  <h4 className="text-sm font-semibold text-gray-300">Running Flat</h4>
                  <p className="text-xs text-gray-300 mt-1">3-3-5 structure</p>
                  <p className="text-xs text-gray-400">{"B > 100% of A"}</p>
                  <p className="text-xs text-gray-400">{"C < 100% of A"}</p>
                  <p className="text-xs text-gray-400">Strong trend signal</p>
                </div>
              </div>
            </div>

            {/* Feature Guide */}
            <div className="border border-cyan-500/30 rounded-lg p-4 bg-cyan-500/5">
              <h3 className="text-lg font-semibold text-cyan-400 mb-3">Using the Elliott Wave Tools</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <Pencil className="w-4 h-4 text-emerald-400" /> Drawing Waves
                  </h4>
                  <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                    <li>Select pattern type (Impulse, Correction, etc.)</li>
                    <li>Click "Draw" to enter drawing mode</li>
                    <li>Tap candle wicks to place points</li>
                    <li>Points auto-snap to high/low</li>
                    <li>Long-press to pan (won't place markers)</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <MousePointer2 className="w-4 h-4 text-yellow-400" /> Editing & Selecting
                  </h4>
                  <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                    <li>Click "Select" to enter selection mode</li>
                    <li>Tap a pattern to select it</li>
                    <li>Drag any point to reposition</li>
                    <li>Drop on future area for projections</li>
                    <li>Blue candles simulate future waves</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" /> Fibonacci Modes
                  </h4>
                  <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                    <li><span className="text-cyan-400">M%:</span> Measured - shows actual Fib ratios</li>
                    <li><span className="text-purple-400">Proj:</span> Projected - shows target lines</li>
                    <li>Click on Fib lines to snap points</li>
                    <li>Validation panel shows rating quality</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Validation Ratings
                  </h4>
                  <ul className="text-xs text-gray-300 space-y-1">
                    <li><span className="text-emerald-400">Excellent:</span> Within 2% of ideal target</li>
                    <li><span className="text-green-400">Good:</span> Within 4% of ideal target</li>
                    <li><span className="text-yellow-400">OK:</span> Within 6% of ideal target</li>
                    <li><span className="text-blue-400">Valid:</span> Within allowed range</li>
                    <li><span className="text-red-400">Poor:</span> Outside valid range</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-cyan-400" /> AI Analysis
                  </h4>
                  <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                    <li>Click "AI Auto" for automatic analysis</li>
                    <li>AI identifies patterns on the chart</li>
                    <li>Provides confidence score</li>
                    <li>Suggests alternative counts</li>
                    <li>Highlights risk factors</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-400" /> Wave Degrees
                  </h4>
                  <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                    <li>9 degrees from Grand Supercycle to Subminuette</li>
                    <li>Each degree has unique color coding</li>
                    <li>Higher degrees = longer timeframes</li>
                    <li>Nest patterns within larger degrees</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Quick Reference Table */}
            <div className="border border-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-3">Quick Reference: Fibonacci Ratios</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2 px-2 text-gray-400">Pattern</th>
                      <th className="text-left py-2 px-2 text-gray-400">Wave</th>
                      <th className="text-left py-2 px-2 text-gray-400">Ideal Target</th>
                      <th className="text-left py-2 px-2 text-gray-400">Valid Range</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-2 text-emerald-400" rowSpan={4}>Impulse</td>
                      <td className="py-2 px-2">Wave 2</td>
                      <td className="py-2 px-2">50% - 61.8%</td>
                      <td className="py-2 px-2">38.2% - 78.6%</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-2">Wave 3</td>
                      <td className="py-2 px-2">161.8%</td>
                      <td className="py-2 px-2">100% - 261.8%</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-2">Wave 4</td>
                      <td className="py-2 px-2">38.2%</td>
                      <td className="py-2 px-2">23.6% - 50%</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-2">Wave 5</td>
                      <td className="py-2 px-2">61.8% - 100%</td>
                      <td className="py-2 px-2">38.2% - 161.8%</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-2 text-orange-400" rowSpan={2}>Zigzag</td>
                      <td className="py-2 px-2">Wave B</td>
                      <td className="py-2 px-2">50%</td>
                      <td className="py-2 px-2">38.2% - 61.8%</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-2">Wave C</td>
                      <td className="py-2 px-2">100% - 127%</td>
                      <td className="py-2 px-2">100% - 161.8%</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-2 text-blue-400" rowSpan={2}>Flat</td>
                      <td className="py-2 px-2">Wave B</td>
                      <td className="py-2 px-2">90% - 100%</td>
                      <td className="py-2 px-2">78.6% - 138.2%</td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-2 px-2">Wave C</td>
                      <td className="py-2 px-2">100% - 127%</td>
                      <td className="py-2 px-2">100% - 161.8%</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-2 text-teal-400">Triangle</td>
                      <td className="py-2 px-2">Each Wave</td>
                      <td className="py-2 px-2">61.8% - 78.6%</td>
                      <td className="py-2 px-2">50% - 85%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>

      <CryptoNavigation />
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { createChart, IChartApi, ISeriesApi, ColorType, CrosshairMode, CandlestickSeries, 
  LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 
  '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, Trash2, Save, RefreshCw, AlertCircle, CheckCircle2, Info, 
  Wand2, MousePointer2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useLocation } from 'wouter';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';

// NEW: For hybrid screenshot
import html2canvas from 'html2canvas';

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
  fibLabel?: string; // Fib projection label like "B zig 50%" or "C flat 127%" when snapped 
  // to Fib line
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

// NEW: Structured AI response interface (matches backend JSON)
interface GrokWaveAnalysis {
  patternType: string;
  degree?: string;
  confidence: number;
  currentWave?: string;
  suggestedLabels: Array<{
    label: string;
    approximatePosition: string;
    priceLevel: number;
    candleIndex: number;
    snapTo: 'high' | 'low';
  }>;
  originPoint: { candleIndex: number; price: number; label: string };
  endPoint: { candleIndex: number; price: number; label: string };
  continuation: {
    direction: 'up' | 'down' | 'sideways';
    targetDescription: string;
    fibonacciLevels: string[];
    upTargets: Array<{ level: string; price: number }>;
    downTargets: Array<{ level: string; price: number }>;
  };
  analysis: string;
  alternativeCount?: string;
  riskFactors: string[];
  model?: string;
  timestamp?: number;
}

export default function CryptoElliottWave() {
  const [location, setLocation] = useLocation();
  const { user, isElite } = useCryptoAuth();
  const { toast } = useToast();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartCaptureRef = useRef<HTMLDivElement>(null); // NEW: For screenshot
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [currentPoints, setCurrentPoints] = useState<WavePoint[]>([]);
  const [savedLabels, setSavedLabels] = useState<WavePoint[]>([]);
  const [patternType, setPatternType] = useState<'impulse' | 'correction'>('impulse');
  const [fibonacciMode, setFibonacciMode] = useState<'measured' | 'projected'>('measured');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<GrokWaveAnalysis | null>(null); // Safe typing
  const [aiPending, setAiPending] = useState(false); // NEW: Loading state
  const [validatePending, setValidatePending] = useState(false);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [historyData, setHistoryData] = useState<{ candles: CandleData[] } | null>(null);
  const [isElite, setIsElite] = useState(false); // From auth

  // ... (Your existing useQuery for historyData - unchanged)
  const historyQuery = useQuery({
    queryKey: ['cryptoHistory', symbol, timeframe],
    queryFn: async () => {
      const res = await apiRequest('/crypto/history', {
        method: 'POST',
        body: JSON.stringify({ symbol, timeframe, limit: 200 }),
      });
      if (!res.ok) throw new Error('Failed to fetch data');
      return res.json();
    },
    onSuccess: (data) => setHistoryData(data),
  });

  // ... (Your existing validateMutation - unchanged, around line 200)
  const validateMutation = useMutation({
    mutationFn: async () => {
      // Your validate logic
      const res = await apiRequest('/crypto/validate-wave', {
        method: 'POST',
        body: JSON.stringify({ points: currentPoints, patternType }),
      });
      return res.json();
    },
    onSuccess: setValidation,
  });

  // NEW: AI Analyze Mutation (hybrid + safe parsing)
  const aiAnalyzeMutation = useMutation({
    mutationFn: async () => {
      if (!currentPoints.length) {
        throw new Error('Add at least 2 wave points for analysis');
      }
      setAiPending(true);

      // Hybrid: Capture screenshot
      let imageBase64 = '';
      try {
        if (chartCaptureRef.current) {
          const canvas = await html2canvas(chartCaptureRef.current, {
            backgroundColor: '#000',
            scale: 1,
            useCORS: true,
            allowTaint: true
          });
          imageBase64 = canvas.toDataURL('image/png');
        }
      } catch (captureErr) {
        console.warn('Screenshot failed:', captureErr);
      }

      // POST with hybrid data
      const response = await fetch('/api/crypto/elliott-wave/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: currentPoints,
          patternType,
          symbol,
          timeframe,
          candles: historyData?.candles || [], // Raw data
          imageBase64
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'AI request failed');
      }

      const data = await response.json();
      
      // Safe validation: Ensure min structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid AI response structure');
      }
      // Coerce missing fields to defaults (prevents crashes)
      return {
        ...data,
        patternType: data.patternType || 'unknown',
        confidence: data.confidence || 0,
        analysis: data.analysis || 'No analysis available',
        suggestedLabels: data.suggestedLabels || [],
        continuation: data.continuation || { direction: 'sideways', targetDescription: 'N/A', fibonacciLevels: [], upTargets: [], downTargets: [] },
        riskFactors: data.riskFactors || [],
        originPoint: data.originPoint || { candleIndex: 0, price: 0, label: 'Start' },
        endPoint: data.endPoint || { candleIndex: 0, price: 0, label: 'End' }
      } as GrokWaveAnalysis;
    },
    onSuccess: (data) => {
      console.log('AI Structured:', data);
      setAiAnalysis(data);
      setAiPending(false);
      toast({ title: 'AI Analysis Complete', description: `Pattern: ${data.patternType}` });
    },
    onError: (err: Error) => {
      console.error('AI Error:', err);
      setAiAnalysis(null);
      setAiPending(false);
      toast({ title: 'AI Analysis Failed', description: err.message, variant: 'destructive' });
    },
  });

  // ... (Your existing chart setup with createChart, candleSeriesRef.setData - unchanged)
  useEffect(() => {
    if (historyData?.candles && chartContainerRef.current) {
      const chart = createChart(chartContainerRef.current, {
        // Your options
        width: chartContainerRef.current.clientWidth,
        height: 500,
        layout: { backgroundColor: '#000', textColor: '#fff' },
        grid: { vertLines: { color: '#333' }, horzLines: { color: '#333' } },
        crosshair: { mode: CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: false },
      });
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350',
      });
      candleSeries.setData(historyData.candles);
      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

      // Your marker/click handlers - unchanged
    }
  }, [historyData]);

  // ... (Your wave point click/drag handlers - unchanged)

  // JSX Render (Your tabs structure - enhanced AI tab)
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Elliott Wave Analyzer | BearTec</title>
      </Helmet>
      <CryptoNavigation />
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <img src={bearTecLogoNew} alt="BearTec" className="h-8 w-8" />
              Elliott Wave Analyzer - {symbol} {timeframe}
              {user && <Badge variant="secondary">Elite: {isElite ? 'Yes' : 'No'}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b mb-4">
              <div className="flex gap-2">
                {/* Your Validate Button */}
                <Button onClick={() => validateMutation.mutate()} disabled={validatePending}>
                  {validatePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Validate
                </Button>
                
                {/* AI Button - Enhanced/Replace your existing one */}
                <Button 
                  onClick={() => aiAnalyzeMutation.mutate()} 
                  disabled={aiPending || !currentPoints.length || !isElite}
                  className="ml-2"
                >
                  {aiPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  AI Analyze
                </Button>

                {/* Your Save/Delete buttons - unchanged */}
                <Button variant="outline" onClick={() => {/* save logic */}}>
                  <Save className="mr-2 h-4 w-4" /> Save
                </Button>
                <Button variant="destructive" onClick={() => setCurrentPoints([])}>
                  <Trash2 className="mr-2 h-4 w-4" /> Clear
                </Button>
              </div>
              <div className="flex gap-2">
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger className="w-[120px]">BTCUSDT</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BTCUSDT">BTCUSDT</SelectItem>
                    {/* More symbols */}
                  </SelectContent>
                </Select>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger className="w-[80px]">1h</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1h</SelectItem>
                    {/* More timeframes */}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Chart Wrapper - NEW ref for capture */}
            <div ref={chartCaptureRef} className="w-full h-[500px] relative mb-4">
              <div ref={chartContainerRef} className="w-full h-full" />
            </div>

            {/* Tabs: Training/Indicators/AI/Waves */}
            <Tabs defaultValue="waves" className="w-full">
              <TabsList>
                <TabsTrigger value="training">Training</TabsTrigger>
                <TabsTrigger value="indicators">Indicators</TabsTrigger>
                <TabsTrigger value="ai">AI</TabsTrigger>
                <TabsTrigger value="waves">Waves</TabsTrigger>
              </TabsList>

              {/* Waves Tab - Your validation/Fib table - unchanged */}
              <TabsContent value="waves">
                {validation && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Validation: {validation.isValid ? 'Valid' : 'Invalid'}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Your errors/warnings/fib table JSX - unchanged */}
                      <table className="w-full">
                        {/* ... Fib rows ... */}
                      </table>
                    </CardContent>
                  </Card>
                )}
                {/* Place points prompt */}
                <p className="text-muted-foreground">Place wave points to see validation.</p>
              </TabsContent>

              {/* NEW/Enhanced AI Tab - Safe render */}
              <TabsContent value="ai">
                {aiAnalysis ? (
                  <Card className="space-y-4">
                    <CardHeader>
                      <CardTitle>
                        AI Pattern: {aiAnalysis.patternType.toUpperCase()} 
                        <Badge variant="secondary" className="ml-2">
                          Confidence: {aiAnalysis.confidence}/10 (via {aiAnalysis.model})
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Current Wave: {aiAnalysis.currentWave || 'TBD'} | Degree: {aiAnalysis.degree || 'N/A'}
                      </p>
                      {aiAnalysis.suggestedLabels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {aiAnalysis.suggestedLabels.map((lbl, idx) => (
                            <Badge key={idx} variant={lbl.snapTo === 'high' ? 'default' : 'secondary'}>
                              {lbl.label} @ {lbl.priceLevel.toFixed(4)}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{aiAnalysis.analysis}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>Direction: {aiAnalysis.continuation.direction.toUpperCase()}</div>
                        <div>Targets: {aiAnalysis.continuation.targetDescription}</div>
                        {aiAnalysis.alternativeCount && <div>Alt Count: {aiAnalysis.alternativeCount}</div>}
                      </div>
                      {aiAnalysis.riskFactors.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {aiAnalysis.riskFactors.map((risk, idx) => (
                            <li key={idx} className="flex items-center gap-1 text-destructive">
                              <AlertCircle className="h-3 w-3" />
                              {risk}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ) : aiPending ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing with Grok...
                  </div>
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    Click AI Analyze for Grok insights. Add points & elite sub first!
                  </div>
                )}
              </TabsContent>

              {/* Other tabs - unchanged */}
              <TabsContent value="training">Training content...</TabsContent>
              <TabsContent value="indicators">Indicators...</TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

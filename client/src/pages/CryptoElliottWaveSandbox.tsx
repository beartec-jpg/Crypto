import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { createChart, IChartApi, ISeriesApi, ColorType, CrosshairMode, CandlestickSeries } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, AlertCircle, CheckCircle2, Brain, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { useCryptoAuth, isDevelopment } from '@/hooks/useCryptoAuth';
import { useEnsureAuthReady } from '@/hooks/useEnsureAuthReady';
import { useLocation } from 'wouter';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ElliottWaveLabel {
  id: string;
  userId: string;
  symbol: string;
  timeframe: string;
  degree: string;
  patternType: string;
  points: { time: number; price: number; label: string }[];
  isComplete: boolean;
}

interface WaveStackEntry {
  id: string;
  timeframe: string;
  degree: string;
  patternType: string;
  waveCount: number;
  direction: 'up' | 'down';
  startPrice: number;
  endPrice: number;
  startTime: number;
  endTime: number;
}

interface GrokAnalysisResult {
  success: boolean;
  waveCount: number;
  symbol: string;
  analysis: {
    hierarchy?: { entry: number; role: string; parent: number | null; degree: string }[];
    validation?: { isValid: boolean; issues: string[]; warnings: string[] };
    prediction?: { nextWave: string; direction: string; confidence: number; reasoning: string };
    interpretation?: string;
    raw?: string;
    parseError?: string;
  };
  rawResponse: string;
}

const CRYPTO_SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT' },
  { value: 'ADAUSDT', label: 'ADA/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },
];

const TIMEFRAMES = [
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hour' },
  { value: '1d', label: '1 Day' },
  { value: '1w', label: '1 Week' },
];

const waveDegrees = [
  { name: 'Grand Supercycle', color: '#FF6B6B' },
  { name: 'Supercycle', color: '#FF8E53' },
  { name: 'Cycle', color: '#FFC107' },
  { name: 'Primary', color: '#4CAF50' },
  { name: 'Intermediate', color: '#2196F3' },
  { name: 'Minor', color: '#9C27B0' },
  { name: 'Minute', color: '#E91E63' },
  { name: 'Minuette', color: '#00BCD4' },
  { name: 'Subminuette', color: '#607D8B' },
];

function getWaveCount(patternType: string): number {
  if (patternType === 'impulse' || patternType === 'diagonal') return 5;
  return 3;
}

export default function CryptoElliottWaveSandbox() {
  const [symbol, setSymbol] = useState('XRPUSDT');
  const [timeframe, setTimeframe] = useState('1d');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  
  const { isAuthenticated, isAdmin, user } = useCryptoAuth();
  const userEmail = user?.email;
  const authReady = useEnsureAuthReady();
  
  const [grokAnalysis, setGrokAnalysis] = useState<GrokAnalysisResult | null>(null);
  const [showRawResponse, setShowRawResponse] = useState(false);

  // Admin-only access check
  const isAdminUser = isAdmin || userEmail?.toLowerCase() === 'beartec@beartec.uk';
  
  // Redirect non-admin users
  useEffect(() => {
    if (authReady.ready && !isDevelopment && !isAdminUser) {
      toast({
        title: 'Access Denied',
        description: 'This sandbox is only available to admin users.',
        variant: 'destructive',
      });
      navigate('/cryptoelliottwave');
    }
  }, [authReady.ready, isAdminUser, navigate, toast]);

  // Fetch candle data
  const { data: candles = [], isLoading: candlesLoading } = useQuery<CandleData[]>({
    queryKey: ['/api/crypto/candles', symbol, timeframe],
    queryFn: async () => {
      const response = await authenticatedApiRequest('GET', `/api/crypto/candles?symbol=${symbol}&interval=${timeframe}&limit=500`);
      return response.json();
    },
    enabled: isDevelopment || (authReady.ready && isAuthenticated),
  });

  // Fetch ALL labels across all timeframes for Wave Stacking
  const { data: allTimeframeLabels } = useQuery<ElliottWaveLabel[]>({
    queryKey: ['/api/crypto/elliott-wave/labels-all', symbol],
    queryFn: async () => {
      const response = await authenticatedApiRequest('GET', `/api/crypto/elliott-wave/labels?symbol=${symbol}&allTimeframes=true`);
      return response.json();
    },
    enabled: isDevelopment || (authReady.ready && isAuthenticated),
  });

  // Convert labels to wave stack entries
  const waveStackEntries: WaveStackEntry[] = (allTimeframeLabels || [])
    .filter(label => label.points && label.points.length >= 2)
    .map(label => {
      const times = label.points.map(p => p.time);
      const prices = label.points.map(p => p.price);
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const priceAtMinTime = label.points.find(p => p.time === minTime)?.price || prices[0];
      const priceAtMaxTime = label.points.find(p => p.time === maxTime)?.price || prices[prices.length - 1];
      
      return {
        id: label.id,
        timeframe: label.timeframe,
        degree: label.degree,
        patternType: label.patternType,
        waveCount: getWaveCount(label.patternType),
        direction: (priceAtMaxTime > priceAtMinTime ? 'up' : 'down') as 'up' | 'down',
        startPrice: priceAtMinTime,
        endPrice: priceAtMaxTime,
        startTime: minTime,
        endTime: maxTime,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);

  // Grok wave stack analysis mutation
  const analyzeStack = useMutation({
    mutationFn: async (data: { waveEntries: WaveStackEntry[]; symbol: string }) => {
      const response = await authenticatedApiRequest('POST', '/api/crypto/elliott-wave/analyze-stack', data);
      return response.json();
    },
    onSuccess: (data: GrokAnalysisResult) => {
      setGrokAnalysis(data);
      toast({
        title: 'Grok Analysis Complete',
        description: `Analyzed ${data.waveCount} wave entries`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Could not analyze wave stack',
        variant: 'destructive',
      });
    },
  });

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a2e' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#2d2d44' },
        horzLines: { color: '#2d2d44' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2d2d44' },
      timeScale: { borderColor: '#2d2d44', timeVisible: true },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    candleSeries.setData(candles.map(c => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })));

    chart.timeScale().fitContent();
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles]);

  const handleAnalyzeStack = () => {
    if (waveStackEntries.length === 0) {
      toast({
        title: 'No Waves to Analyze',
        description: 'Draw some wave patterns first on the main Waves page.',
        variant: 'destructive',
      });
      return;
    }
    analyzeStack.mutate({ waveEntries: waveStackEntries, symbol });
  };

  if (!isDevelopment && !isAdminUser) {
    return (
      <div className="min-h-screen bg-[#0f0f23] text-white flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Admin Access Required</h1>
          <p className="text-gray-400">This sandbox is only available to admin users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f23] text-white">
      <Helmet>
        <title>Wave Stack AI Sandbox | BearTec</title>
        <meta name="description" content="Experimental AI-powered Elliott Wave analysis sandbox" />
      </Helmet>

      {/* Header */}
      <header className="bg-[#1a1a2e] border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={bearTecLogoNew} alt="BearTec" className="h-8 w-auto" />
            <div>
              <h1 className="text-lg font-bold text-cyan-400">Wave Stack AI Sandbox</h1>
              <p className="text-xs text-gray-500">Admin Only - Experimental</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-32 bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRYPTO_SYMBOLS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-24 bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEFRAMES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Chart */}
        <Card className="bg-[#1a1a2e] border-slate-700">
          <CardContent className="p-0">
            {candlesLoading ? (
              <div className="h-[400px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              </div>
            ) : (
              <div ref={chartContainerRef} className="w-full" />
            )}
          </CardContent>
        </Card>

        {/* Wave Stack Display */}
        <Card className="bg-[#1a1a2e] border-slate-700">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-cyan-400 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Wave Stack ({waveStackEntries.length} entries)
              </CardTitle>
              <Button 
                onClick={handleAnalyzeStack}
                disabled={analyzeStack.isPending || waveStackEntries.length === 0}
                className="bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700"
              >
                {analyzeStack.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                ) : (
                  <><Brain className="w-4 h-4 mr-2" /> Analyze with Grok</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {waveStackEntries.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No wave entries found</p>
                <p className="text-xs mt-1">Draw waves on the main Waves page first</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {waveStackEntries.map((entry, idx) => {
                  const degreeColor = waveDegrees.find(d => d.name === entry.degree)?.color || '#74C0FC';
                  return (
                    <div 
                      key={entry.id}
                      className="flex items-center gap-3 px-3 py-2 bg-slate-800/50 rounded-lg"
                    >
                      <span className="text-xs text-gray-500 w-6">{idx + 1}</span>
                      <Badge style={{ backgroundColor: degreeColor + '30', color: degreeColor, borderColor: degreeColor }} variant="outline">
                        {entry.degree}
                      </Badge>
                      <span className={`text-sm ${entry.patternType === 'impulse' ? 'text-green-400' : 'text-amber-400'}`}>
                        {entry.patternType}
                      </span>
                      <span className="text-cyan-400 font-mono text-sm">{entry.waveCount}</span>
                      <span className={entry.direction === 'up' ? 'text-green-400' : 'text-red-400'}>
                        {entry.direction === 'up' ? '↑' : '↓'}
                      </span>
                      <span className="text-xs text-gray-500 ml-auto">
                        {new Date(entry.startTime * 1000).toLocaleDateString()} - {new Date(entry.endTime * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grok Analysis Results */}
        {grokAnalysis && (
          <Card className="bg-[#1a1a2e] border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-purple-400 flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Grok Analysis Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Interpretation */}
              {grokAnalysis.analysis.interpretation && (
                <div className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-300 mb-2">Interpretation</h4>
                  <p className="text-gray-300">{grokAnalysis.analysis.interpretation}</p>
                </div>
              )}

              {/* Hierarchy */}
              {grokAnalysis.analysis.hierarchy && (
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h4 className="font-semibold text-cyan-300 mb-3">Wave Hierarchy</h4>
                  <div className="space-y-2">
                    {grokAnalysis.analysis.hierarchy.map((h, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 w-8">#{h.entry}</span>
                        <Badge variant="outline" className="border-cyan-600 text-cyan-400">{h.degree}</Badge>
                        <span className="text-white font-medium">{h.role}</span>
                        {h.parent && (
                          <span className="text-gray-500 text-xs">← child of #{h.parent}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation */}
              {grokAnalysis.analysis.validation && (
                <div className={`rounded-lg p-4 ${grokAnalysis.analysis.validation.isValid ? 'bg-green-900/20 border border-green-700/50' : 'bg-red-900/20 border border-red-700/50'}`}>
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    {grokAnalysis.analysis.validation.isValid ? (
                      <><CheckCircle2 className="w-4 h-4 text-green-400" /> <span className="text-green-300">Valid Structure</span></>
                    ) : (
                      <><AlertCircle className="w-4 h-4 text-red-400" /> <span className="text-red-300">Issues Found</span></>
                    )}
                  </h4>
                  {grokAnalysis.analysis.validation.issues?.length > 0 && (
                    <ul className="list-disc list-inside text-red-300 text-sm">
                      {grokAnalysis.analysis.validation.issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {grokAnalysis.analysis.validation.warnings?.length > 0 && (
                    <ul className="list-disc list-inside text-amber-300 text-sm mt-2">
                      {grokAnalysis.analysis.validation.warnings.map((warn, idx) => (
                        <li key={idx}>{warn}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Prediction */}
              {grokAnalysis.analysis.prediction && (
                <div className="bg-cyan-900/20 border border-cyan-700/50 rounded-lg p-4">
                  <h4 className="font-semibold text-cyan-300 mb-2">Prediction</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-400">Next Wave:</span> <span className="text-white font-medium">{grokAnalysis.analysis.prediction.nextWave}</span></p>
                    <p><span className="text-gray-400">Direction:</span> <span className={grokAnalysis.analysis.prediction.direction === 'up' ? 'text-green-400' : 'text-red-400'}>{grokAnalysis.analysis.prediction.direction}</span></p>
                    <p><span className="text-gray-400">Confidence:</span> <span className="text-cyan-400">{grokAnalysis.analysis.prediction.confidence}%</span></p>
                    <p className="text-gray-300 mt-2">{grokAnalysis.analysis.prediction.reasoning}</p>
                  </div>
                </div>
              )}

              {/* Raw Response Toggle */}
              <div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowRawResponse(!showRawResponse)}
                  className="text-gray-400 hover:text-white"
                >
                  {showRawResponse ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                  {showRawResponse ? 'Hide' : 'Show'} Raw Response
                </Button>
                {showRawResponse && (
                  <pre className="mt-2 bg-slate-900 p-3 rounded text-xs text-gray-400 overflow-x-auto max-h-60">
                    {grokAnalysis.rawResponse}
                  </pre>
                )}
              </div>

              {/* Parse Error */}
              {grokAnalysis.analysis.parseError && (
                <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
                  <p className="text-amber-400 text-sm">Parse Warning: {grokAnalysis.analysis.parseError}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Back to Main Waves Page */}
        <div className="text-center pt-4">
          <Button 
            variant="outline" 
            onClick={() => navigate('/cryptoelliottwave')}
            className="border-slate-600 text-gray-300 hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Back to Main Waves Page
          </Button>
        </div>
      </main>

      <CryptoNavigation />
    </div>
  );
}

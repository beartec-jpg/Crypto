import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, CandlestickSeries } from 'lightweight-charts';
import { X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DrawingToolbar } from '@/components/drawings/DrawingToolbar';
import { useDrawingState } from '@/hooks/useDrawingState';

type DrawingTool = 'trendline' | 'horizontal' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel' | null;

interface ChartFullscreenPageProps {
  onClose: () => void;
  initialSymbol: string;        // e.g., 'XRPUSDT'
  initialTimeframe: string;     // e.g., '1h'
  watchlistTickers: string[];   // e.g., ['XRPUSDT', 'BTCUSDT', 'ETHUSDT']
}

// Convert timeframe to Binance API format
const convertTimeframe = (tf: string): string => {
  const map: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  return map[tf] || '1h';
};

// Format symbol for display (e.g., 'XRPUSDT' -> 'XRP/USDT')
const formatSymbol = (symbol: string): string => {
  if (symbol.endsWith('USDT')) {
    return symbol.replace('USDT', '/USDT');
  }
  return symbol;
};

export function ChartFullscreenPage({
  onClose,
  initialSymbol,
  initialTimeframe,
  watchlistTickers,
}: ChartFullscreenPageProps) {
  // Independent state - not controlled by parent
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [activeTool, setActiveTool] = useState<DrawingTool>(null);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [candles, setCandles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Drawing state - independent from parent
  const drawingState = useDrawingState();

  // Tool selection handler
  const handleSelectTool = useCallback((tool: DrawingTool) => {
    setActiveTool(tool);
  }, []);

  // Toggle tool picker
  const handleToggleToolPicker = useCallback(() => {
    setShowToolPicker(prev => !prev);
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#cbd5e1',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, []);

  // Fetch candles data
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const fetchCandles = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const binanceTimeframe = convertTimeframe(timeframe);
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceTimeframe}&limit=500`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch candles: ${response.status} ${response.statusText}`);
        }

        const klines = await response.json();
        const candleData = klines.map((kline: any) => ({
          time: Math.floor(kline[0] / 1000),
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
        }));

        setCandles(candleData);
        candleSeriesRef.current?.setData(candleData);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to fetch candle data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch candle data');
        setIsLoading(false);
      }
    };

    fetchCandles();
  }, [symbol, timeframe]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Top Toolbar */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between gap-4">
        {/* Close button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="gap-2"
        >
          <X className="h-4 w-4" />
          Close
        </Button>

        {/* Symbol display */}
        <div className="flex-1 text-center">
          <span className="text-lg font-semibold text-white">
            {formatSymbol(symbol)}
          </span>
        </div>

        {/* Ticker selector */}
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {watchlistTickers.map((ticker) => (
              <SelectItem key={ticker} value={ticker}>
                {formatSymbol(ticker)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Timeframe selector */}
        <Select value={timeframe} onValueChange={setTimeframe}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">1m</SelectItem>
            <SelectItem value="5m">5m</SelectItem>
            <SelectItem value="15m">15m</SelectItem>
            <SelectItem value="1h">1h</SelectItem>
            <SelectItem value="4h">4h</SelectItem>
            <SelectItem value="1d">1d</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Drawing Tools Toolbar */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 relative">
        <DrawingToolbar
          activeTool={activeTool}
          onSelectTool={handleSelectTool}
          showToolPicker={showToolPicker}
          onToggleToolPicker={handleToggleToolPicker}
        />
      </div>

      {/* Chart Area */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 z-10">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
              <div className="mt-2 text-slate-400">Loading chart...</div>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 z-10">
            <div className="text-center text-red-400">
              <div className="text-lg font-semibold">Error</div>
              <div className="mt-2">{error}</div>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

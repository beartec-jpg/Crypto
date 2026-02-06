import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TickerData {
  symbol: string;
  price: number;
  priceChange: number;
  emaBias: 'bullish' | 'bearish' | 'neutral';
  structureBias: 'bullish' | 'bearish' | 'neutral';
}

interface TickerTableProps {
  tickers: string[];
  onRemoveTicker: (symbol: string) => void;
  onSelectTicker: (symbol: string) => void;
  selectedTicker: string;
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
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

// Calculate EMA
const calculateEMA = (prices: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  let ema = prices[0];
  
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      emaArray.push(prices[0]);
    } else {
      ema = prices[i] * k + ema * (1 - k);
      emaArray.push(ema);
    }
  }
  
  return emaArray;
};

// Detect swing highs and lows
const detectSwings = (candles: any[], lookback: number = 5) => {
  const highs: number[] = [];
  const lows: number[] = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    
    let isSwingHigh = true;
    let isSwingLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= currentHigh || candles[i + j].high >= currentHigh) {
        isSwingHigh = false;
      }
      if (candles[i - j].low <= currentLow || candles[i + j].low <= currentLow) {
        isSwingLow = false;
      }
    }
    
    if (isSwingHigh) highs.push(currentHigh);
    if (isSwingLow) lows.push(currentLow);
  }
  
  return { highs, lows };
};

// Detect structure (HH/HL for bull, LH/LL for bear)
const detectStructure = (candles: any[]): 'bullish' | 'bearish' | 'neutral' => {
  const { highs, lows } = detectSwings(candles, 5);
  
  if (highs.length < 2 || lows.length < 2) return 'neutral';
  
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  
  // Check for Higher Highs (HH)
  let hasHH = true;
  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] <= recentHighs[i - 1]) {
      hasHH = false;
      break;
    }
  }
  
  // Check for Higher Lows (HL)
  let hasHL = true;
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] <= recentLows[i - 1]) {
      hasHL = false;
      break;
    }
  }
  
  // Check for Lower Highs (LH)
  let hasLH = true;
  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] >= recentHighs[i - 1]) {
      hasLH = false;
      break;
    }
  }
  
  // Check for Lower Lows (LL)
  let hasLL = true;
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] >= recentLows[i - 1]) {
      hasLL = false;
      break;
    }
  }
  
  if (hasHH && hasHL) return 'bullish';
  if (hasLH && hasLL) return 'bearish';
  return 'neutral';
};

/**
 * Watchlist table component showing ticker data
 * Columns: Ticker, Price, % Change, EMA Bias, Structure Bias, Remove
 */
export function TickerTable({
  tickers,
  onRemoveTicker,
  onSelectTicker,
  selectedTicker,
  timeframe,
  onTimeframeChange,
}: TickerTableProps) {
  const [tickerData, setTickerData] = useState<Record<string, TickerData>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch real prices and calculate EMA/Structure
  useEffect(() => {
    if (tickers.length === 0) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch 24hr ticker data for prices
        const priceResponse = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const priceData = await priceResponse.json();

        const newTickerData: Record<string, TickerData> = {};
        const binanceTimeframe = convertTimeframe(timeframe);

        // Fetch candle data for each ticker
        for (const ticker of tickers) {
          const tickerInfo = priceData.find((t: any) => t.symbol === ticker);
          
          if (tickerInfo) {
            try {
              // Fetch last 150 candles for EMA and structure calculation
              const candleResponse = await fetch(
                `https://api.binance.com/api/v3/klines?symbol=${ticker}&interval=${binanceTimeframe}&limit=150`
              );
              const candles = await candleResponse.json();
              console.log(`📊 Fetched ${candles.length} candles for ${ticker} on ${binanceTimeframe}`);
              
              // Parse candles
              const parsedCandles = candles.map((c: any) => ({
                time: c[0],
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4]),
                volume: parseFloat(c[5]),
              }));
              
              // Calculate EMAs
              const closePrices = parsedCandles.map((c: any) => c.close);
              const ema20 = calculateEMA(closePrices, 20);
              const ema50 = calculateEMA(closePrices, 50);
              const ema100 = calculateEMA(closePrices, 100);
              
              const lastEma20 = ema20[ema20.length - 1];
              const lastEma50 = ema50[ema50.length - 1];
              const lastEma100 = ema100[ema100.length - 1];
              
              // Determine EMA bias
              let emaBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
              if (lastEma20 > lastEma50 && lastEma50 > lastEma100) {
                emaBias = 'bullish';
              } else if (lastEma20 < lastEma50 && lastEma50 < lastEma100) {
                emaBias = 'bearish';
              }
              
              // Detect structure
              const structureBias = detectStructure(parsedCandles);
              
              newTickerData[ticker] = {
                symbol: ticker,
                price: parseFloat(tickerInfo.lastPrice),
                priceChange: parseFloat(tickerInfo.priceChangePercent),
                emaBias,
                structureBias,
              };
            } catch (err) {
              console.error(`Failed to fetch candles for ${ticker}:`, err);
              // Fallback to just price data
              newTickerData[ticker] = {
                symbol: ticker,
                price: parseFloat(tickerInfo.lastPrice),
                priceChange: parseFloat(tickerInfo.priceChangePercent),
                emaBias: 'neutral',
                structureBias: 'neutral',
              };
            }
          }
        }

        setTickerData(newTickerData);
        console.log('✅ Loaded ticker data:', Object.keys(newTickerData).length, 'tickers');
      } catch (error) {
        console.error('Failed to fetch ticker data:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch real-time data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    // Fetch immediately
    fetchData();

    // Update every 10 seconds
    const interval = setInterval(fetchData, 10000);

    return () => clearInterval(interval);
  }, [tickers, timeframe, toast]);

  const getBiasIcon = (bias: 'bullish' | 'bearish' | 'neutral') => {
    switch (bias) {
      case 'bullish':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'bearish':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'neutral':
        return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getBiasText = (bias: 'bullish' | 'bearish' | 'neutral') => {
    switch (bias) {
      case 'bullish':
        return <span className="text-green-500 font-medium">BULL</span>;
      case 'bearish':
        return <span className="text-red-500 font-medium">BEAR</span>;
      case 'neutral':
        return <span className="text-yellow-500 font-medium">NEUT</span>;
    }
  };

  const formatPrice = (price: number) => {
    if (price === 0) return '-';
    return price < 1 ? price.toFixed(6) : price.toFixed(2);
  };

  const formatChange = (change: number) => {
    const sign = change > 0 ? '+' : '';
    const color = change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-gray-500';
    return <span className={color}>{sign}{change.toFixed(2)}%</span>;
  };

  return (
    <div className="w-full space-y-3">
      {/* Header with timeframe selector */}
      <div className="flex items-center justify-between bg-slate-900 p-3 rounded-lg">
        <h3 className="text-lg font-semibold text-white">WATCHLIST</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white hidden sm:inline">Timeframe:</span>
          <Select value={timeframe} onValueChange={onTimeframeChange}>
            <SelectTrigger className="w-20 sm:w-24 bg-slate-800 text-white border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">1m</SelectItem>
              <SelectItem value="5m">5m</SelectItem>
              <SelectItem value="15m">15m</SelectItem>
              <SelectItem value="1h">1H</SelectItem>
              <SelectItem value="4h">4H</SelectItem>
              <SelectItem value="1d">1D</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Table */}
      <div className="border border-slate-700 rounded-lg overflow-x-auto bg-slate-900">
        <table className="w-full min-w-[600px]">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-300">Ticker</th>
              <th className="px-2 sm:px-4 py-2 text-right text-xs sm:text-sm font-medium text-gray-300">Price</th>
              <th className="px-2 sm:px-4 py-2 text-right text-xs sm:text-sm font-medium text-gray-300">% Chg</th>
              <th className="px-2 sm:px-4 py-2 text-center text-xs sm:text-sm font-medium text-gray-300">EMA</th>
              <th className="px-2 sm:px-4 py-2 text-center text-xs sm:text-sm font-medium text-gray-300">Structure</th>
              <th className="px-2 sm:px-4 py-2 text-center text-xs sm:text-sm font-medium text-gray-300 w-12 sm:w-16"></th>
            </tr>
          </thead>
          <tbody>
            {tickers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No tickers in watchlist. Use the search above to add some.
                </td>
              </tr>
            ) : loading && Object.keys(tickerData).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Loading...
                </td>
              </tr>
            ) : (
              tickers.map((ticker) => {
                const data = tickerData[ticker];
                const isSelected = ticker === selectedTicker;
                
                return (
                  <tr
                    key={ticker}
                    className={`border-t border-slate-700 hover:bg-slate-800 cursor-pointer transition-colors ${
                      isSelected ? 'bg-slate-800' : ''
                    }`}
                    onClick={() => onSelectTicker(ticker)}
                  >
                    <td className="px-2 sm:px-4 py-3 font-medium text-white text-xs sm:text-sm">
                      {ticker.replace('USDT', '/USDT')}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-right font-mono text-gray-300 text-xs sm:text-sm">
                      ${data ? formatPrice(data.price) : '-'}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-right font-mono text-xs sm:text-sm">
                      {data ? formatChange(data.priceChange) : '-'}
                    </td>
                    <td className="px-2 sm:px-4 py-3">
                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                        {data && getBiasIcon(data.emaBias)}
                        <span className="hidden sm:inline">{data && getBiasText(data.emaBias)}</span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-3">
                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                        {data && getBiasIcon(data.structureBias)}
                        <span className="hidden sm:inline">{data && getBiasText(data.structureBias)}</span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveTicker(ticker);
                        }}
                        className="h-6 w-6 sm:h-8 sm:w-8 p-0 hover:bg-red-500/20 hover:text-red-400"
                      >
                        <X className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

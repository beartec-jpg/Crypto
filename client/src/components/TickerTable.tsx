import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { calculateEMABias } from '@/utils/emaBias';
import { detectStructure } from '@/utils/structureDetection';
import { BiasBadge } from '@/components/BiasBadge';
import type { Bias } from '@/types/candle';

interface TickerData {
  symbol: string;
  price: number;
  priceChange: number;
  emaBias: Bias;
  structureBias: Bias;
}

interface TickerTableProps {
  tickers: string[];
  onRemoveTicker: (symbol: string) => void;
  onSelectTicker: (symbol: string) => void;
  selectedTicker: string;
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;

  // Bias configuration (UI exists, calculation implementation pending)
  // These values are persisted but not yet applied to calculations
  structurePivotLength?: number;
  emaLengths?: number[]; // e.g. [21, 50, 200]
  
  // Settings button handler
  onOpenSettings?: () => void;
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
  structurePivotLength, // NEW
  emaLengths,           // NEW
  onOpenSettings,       // NEW
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
              
              // Calculate EMA bias using utility
              // TODO: calculateEMABias currently uses fixed EMA lengths (20,50,100); emaLengths parameter not yet implemented
              const emaBias = calculateEMABias(parsedCandles);
              
              // Detect structure using utility
              // TODO: detectStructure currently uses fixed lookback (5); structurePivotLength parameter not yet implemented
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
  }, [
    tickers,
    timeframe,
    toast,
    structurePivotLength, // NEW: refetch when structure setting changes
    emaLengths,           // NEW: refetch when EMA setting changes
  ]);

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
      {/* Header with timeframe selector and settings button */}
      <div className="flex items-center justify-between bg-slate-900 p-3 rounded-lg">
        <h3 className="text-lg font-semibold text-white">WATCHLIST</h3>
        <div className="flex items-center gap-2">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-900/80 border border-slate-600 rounded-md hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
              title="Configure bias settings"
            >
              <Settings2 className="h-3 w-3" />
              <span className="hidden sm:inline">Bias</span>
            </button>
          )}
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
        <table className="w-full table-auto min-w-[600px]">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-1 sm:px-2 py-2 text-left text-xs sm:text-sm font-medium text-gray-300 w-0 whitespace-nowrap">Ticker</th>
              <th className="px-1 sm:px-2 py-2 text-right text-xs sm:text-sm font-medium text-gray-300 w-0 whitespace-nowrap">Price</th>
              <th className="px-1 sm:px-2 py-2 text-right text-xs sm:text-sm font-medium text-gray-300">% Chg</th>
              <th className="px-1 sm:px-2 py-2 text-center text-xs sm:text-sm font-medium text-gray-300 w-0">EMA</th>
              <th className="px-1 sm:px-2 py-2 text-center text-xs sm:text-sm font-medium text-gray-300 w-0">Structure</th>
              <th className="px-1 sm:px-2 py-2 text-center text-xs sm:text-sm font-medium text-gray-300 w-12 sm:w-16"></th>
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
                    <td className="px-1 sm:px-2 py-3 font-medium text-white text-xs sm:text-sm w-0 whitespace-nowrap">
                      {ticker.replace('USDT', '/USDT')}
                    </td>
                    <td className="px-1 sm:px-2 py-3 text-right font-mono text-gray-300 text-xs sm:text-sm w-0 whitespace-nowrap">
                      ${data ? formatPrice(data.price) : '-'}
                    </td>
                    <td className="px-1 sm:px-2 py-3 text-right font-mono text-xs sm:text-sm">
                      {data ? formatChange(data.priceChange) : '-'}
                    </td>
                    <td className="px-1 sm:px-2 py-3">
                      {data && <BiasBadge bias={data.emaBias} />}
                    </td>
                    <td className="px-1 sm:px-2 py-3">
                      {data && <BiasBadge bias={data.structureBias} />}
                    </td>
                    <td className="px-1 sm:px-2 py-3 text-center">
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

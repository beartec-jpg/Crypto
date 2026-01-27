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
  const { toast } = useToast();

  // Fetch real prices from Binance API
  useEffect(() => {
    if (tickers.length === 0) return;

    const fetchPrices = async () => {
      try {
        // Fetch 24hr ticker data for all symbols
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const data = await response.json();

        const newTickerData: Record<string, TickerData> = {};
        const biasOptions: Array<'bullish' | 'bearish' | 'neutral'> = ['bullish', 'bearish', 'neutral'];

        tickers.forEach((ticker) => {
          const tickerInfo = data.find((t: any) => t.symbol === ticker);
          
          if (tickerInfo) {
            newTickerData[ticker] = {
              symbol: ticker,
              price: parseFloat(tickerInfo.lastPrice),
              priceChange: parseFloat(tickerInfo.priceChangePercent),
              // TODO: Calculate real EMA and structure bias from candle data
              emaBias: biasOptions[Math.floor(Math.random() * 3)],
              structureBias: biasOptions[Math.floor(Math.random() * 3)],
            };
          }
        });

        setTickerData(newTickerData);
      } catch (error) {
        console.error('Failed to fetch ticker prices:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch real-time prices',
          variant: 'destructive',
        });
      }
    };

    // Fetch immediately
    fetchPrices();

    // Update prices every 5 seconds
    const interval = setInterval(fetchPrices, 5000);

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
          <span className="text-sm text-white">Timeframe:</span>
          <Select value={timeframe} onValueChange={onTimeframeChange}>
            <SelectTrigger className="w-24 bg-slate-800 text-white border-slate-700">
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
      <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Ticker</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-300">Price</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-300">% Chg</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-300">EMA Bias</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-300">Structure</th>
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-300 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {tickers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No tickers in watchlist. Use the search above to add some.
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
                    <td className="px-4 py-3 font-medium text-white">
                      {ticker.replace('USDT', '/USDT')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">
                      ${data ? formatPrice(data.price) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {data ? formatChange(data.priceChange) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {data && getBiasIcon(data.emaBias)}
                        {data && getBiasText(data.emaBias)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {data && getBiasIcon(data.structureBias)}
                        {data && getBiasText(data.structureBias)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveTicker(ticker);
                        }}
                        className="h-8 w-8 p-0 hover:bg-red-500/20 hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
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

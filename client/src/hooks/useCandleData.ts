import { useState, useEffect } from 'react';
import type { Candle, BinanceKline } from '@/types/chart';

interface UseCandleDataOptions {
  symbol: string;
  timeframe: string;
  enabled?: boolean;
  refreshInterval?: number; // milliseconds
}

interface UseCandleDataReturn {
  candles: Candle[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useCandleData({
  symbol,
  timeframe,
  enabled = true,
  refreshInterval = 10000, // 10s default
}: UseCandleDataOptions): UseCandleDataReturn {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCandles = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=500`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch candles: ${response.status} ${response.statusText}`);
      }

      const klines: BinanceKline[] = await response.json();
      const candleData: Candle[] = klines.map((kline) => ({
        time: Math.floor(kline[0] / 1000),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
      }));

      setCandles(candleData);
    } catch (err) {
      console.error('Failed to fetch candle data:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;

    fetchCandles();

    const interval = setInterval(fetchCandles, refreshInterval);

    return () => clearInterval(interval);
  }, [symbol, timeframe, enabled, refreshInterval]);

  return {
    candles,
    isLoading,
    error,
    refetch: fetchCandles,
  };
}

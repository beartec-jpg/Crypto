import { useState, useEffect } from 'react';
import type { Candle } from '@/types/chart';

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
        `/api/crypto/extended-history?symbol=${symbol}&timeframe=${timeframe}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch candles: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const candleData: Candle[] = Array.isArray(data.candles) ? data.candles : [];

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
    // Note: refreshInterval is intentionally in deps to allow dynamic updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, enabled, refreshInterval]);

  return {
    candles,
    isLoading,
    error,
    refetch: fetchCandles,
  };
}

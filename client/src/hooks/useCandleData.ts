import { useState, useEffect, useRef, useCallback } from 'react';
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
  const requestIdRef = useRef(0);

  const fetchCandles = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++requestIdRef.current;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/crypto/extended-history?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
        { signal },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch candles: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const candleData: Candle[] = Array.isArray(data.candles) ? data.candles : [];

      if (requestId === requestIdRef.current) {
        setCandles(candleData);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch candle data:', err);
      if (requestId === requestIdRef.current) {
        setCandles([]);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!enabled) return;

    // Immediately clear stale candles so symbol/timeframe switches never keep old price bars.
    setCandles([]);
    setError(null);
    setIsLoading(true);

    const initialController = new AbortController();
    fetchCandles(initialController.signal);

    const interval = setInterval(() => {
      const pollController = new AbortController();
      fetchCandles(pollController.signal);
    }, refreshInterval);

    return () => {
      initialController.abort();
      clearInterval(interval);
    };
  }, [symbol, timeframe, enabled, refreshInterval]);

  return {
    candles,
    isLoading,
    error,
    refetch: fetchCandles,
  };
}

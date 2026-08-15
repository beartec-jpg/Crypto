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
  /** Key reflecting the symbol+timeframe the current `candles` array actually belongs to.
   *  Callers can compare against `${symbol}_${timeframe}` to detect stale candle data. */
  candlesKey: string;
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
  /** Tracks which symbol+timeframe the current `candles` array represents. */
  const [candlesKey, setCandlesKey] = useState(`${symbol}_${timeframe}`);
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
        setCandlesKey(`${symbol}_${timeframe}`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch candle data:', err);
      if (requestId === requestIdRef.current) {
        setCandles([]);
        setCandlesKey(`${symbol}_${timeframe}`);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!enabled || !symbol?.trim()) {
      setCandles([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Do NOT immediately clear candles on symbol/timeframe changes.
    // Keeping the previous bars visible prevents the chart from going blank
    // during the brief network round-trip.  New data replaces them atomically
    // once the fetch completes.  The `candlesKey` lets the chart lifecycle skip
    // rendering stale candles at the wrong timeframe scale.
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
  }, [symbol, timeframe, enabled, refreshInterval, fetchCandles]);

  return {
    candles,
    candlesKey,
    isLoading,
    error,
    refetch: fetchCandles,
  };
}

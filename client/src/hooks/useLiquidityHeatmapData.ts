import { useState, useEffect, useCallback, useRef } from 'react';
import type { LiquidityHeatmapData, LiquidityHeatmapSettings } from '@/types/liquidityHeatmap';
import { fetchLiquidationHeatmap } from '@/services/coinglassApi';

interface UseLiquidityHeatmapDataReturn {
  data: LiquidityHeatmapData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLiquidityHeatmapData(
  symbol: string,
  settings: LiquidityHeatmapSettings,
): UseLiquidityHeatmapDataReturn {
  const [data, setData] = useState<LiquidityHeatmapData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchCountRef = useRef(0);

  const fetchData = useCallback(async () => {
    if (!settings.enabled || !symbol) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchLiquidationHeatmap(symbol, settings.exchange, settings.lookbackDays);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch liquidation data');
    } finally {
      setIsLoading(false);
    }
  }, [symbol, settings.enabled, settings.exchange, settings.lookbackDays]);

  // Trigger fetch when enabled or key settings change
  useEffect(() => {
    if (!settings.enabled) {
      setData(null);
      setError(null);
      return;
    }

    fetchCountRef.current += 1;
    fetchData();
  }, [settings.enabled, settings.exchange, settings.lookbackDays, symbol, fetchData]);

  // Auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!settings.enabled || !settings.autoRefresh) return;

    const ms = Math.max(settings.refreshInterval, 60) * 1000;
    intervalRef.current = setInterval(() => {
      fetchData();
    }, ms);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [settings.enabled, settings.autoRefresh, settings.refreshInterval, fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

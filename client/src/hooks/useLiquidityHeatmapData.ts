import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CoinglassRange, LiquidityHeatmapData, LiquidityHeatmapSettings } from '@/types/liquidityHeatmap';
import { fetchPredictiveLiquidationProfile } from '@/services/predictiveLiquidationApi';
import { mapChartIntervalToRange } from '@/lib/liquidityTimeframeMapping';

export interface LiquidityHeatmapDebugInfo {
  lastRequestUrl: string;
  lastRequestTime: number | null;
  normalizedSymbol: string;
  source: string;
  stats: {
    forceOrderCount: number;
    realtimeOrderCount: number;
    mergedForceOrderCount: number;
    coinalyzeMapLevels: number;
    depthBidLevels: number;
    depthAskLevels: number;
    cacheWarm: boolean;
  };
}

interface UseLiquidityHeatmapDataReturn {
  data: LiquidityHeatmapData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  effectiveRange: CoinglassRange;
  debugInfo: LiquidityHeatmapDebugInfo;
}

export function useLiquidityHeatmapData(
  symbol: string,
  settings: LiquidityHeatmapSettings,
  chartInterval: string,
): UseLiquidityHeatmapDataReturn {
  const [data, setData] = useState<LiquidityHeatmapData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<LiquidityHeatmapDebugInfo>({
    lastRequestUrl: '',
    lastRequestTime: null,
    normalizedSymbol: '',
    source: '—',
    stats: {
      forceOrderCount: 0,
      realtimeOrderCount: 0,
      mergedForceOrderCount: 0,
      coinalyzeMapLevels: 0,
      depthBidLevels: 0,
      depthAskLevels: 0,
      cacheWarm: false,
    },
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchCountRef = useRef(0);

  // Determine effective range: auto-mapped from chart interval or manual override
  const effectiveRange: CoinglassRange = useMemo(
    () =>
      settings.syncToChartTimeframe
        ? mapChartIntervalToRange(chartInterval)
        : settings.range,
    [settings.syncToChartTimeframe, chartInterval, settings.range],
  );

  const fetchData = useCallback(async () => {
    if (!settings.enabled || !symbol) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchPredictiveLiquidationProfile(symbol, effectiveRange, {
        oiWeight: settings.oiWeight,
        orderbookWeight: settings.orderbookWeight,
        liqFlowWeight: settings.liqFlowWeight,
        biasWeight: settings.biasWeight,
      });
      setData(result.data);
      setDebugInfo({
        lastRequestUrl: `${result.requestUrl}&source=${result.source}`,
        lastRequestTime: Date.now(),
        normalizedSymbol: result.normalizedSymbol,
        source: result.source,
        stats: result.debugStats,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch liquidation data');
    } finally {
      setIsLoading(false);
    }
  }, [
    symbol,
    settings.enabled,
    settings.exchange,
    settings.oiWeight,
    settings.orderbookWeight,
    settings.liqFlowWeight,
    settings.biasWeight,
    effectiveRange,
  ]);

  // Trigger fetch when enabled or key settings change
  useEffect(() => {
    if (!settings.enabled) {
      setData(null);
      setError(null);
      return;
    }

    fetchCountRef.current += 1;
    fetchData();
  }, [
    settings.enabled,
    settings.exchange,
    settings.oiWeight,
    settings.orderbookWeight,
    settings.liqFlowWeight,
    settings.biasWeight,
    effectiveRange,
    symbol,
    fetchData,
  ]);

  // Auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!settings.enabled || !settings.autoRefresh) return;

    const ms = Math.max(settings.refreshInterval, 15) * 1000;
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

  return { data, isLoading, error, refetch: fetchData, effectiveRange, debugInfo };
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CoinglassRange, LiquidityHeatmapData, LiquidityHeatmapSettings, LiquidityLevel } from '@/types/liquidityHeatmap';
import type { Candle } from '@/types/candle';
import { fetchPredictiveLiquidationProfile } from '@/services/predictiveLiquidationApi';
import type { EndpointDiagnostic } from '@/services/predictiveLiquidationApi';
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
  diagnostics: EndpointDiagnostic[];
}

interface UseLiquidityHeatmapDataReturn {
  data: LiquidityHeatmapData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  effectiveRange: CoinglassRange;
  debugInfo: LiquidityHeatmapDebugInfo;
}

function mapVisibleWindowToRange(visibleRange: { from: number; to: number } | null): CoinglassRange {
  if (!visibleRange) return '24h';
  const seconds = Math.max(0, Number(visibleRange.to) - Number(visibleRange.from));
  const hours = seconds / 3600;

  if (hours <= 12) return '12h';
  if (hours <= 24) return '24h';
  if (hours <= 72) return '3d';
  if (hours <= 24 * 7) return '7d';
  if (hours <= 24 * 30) return '30d';
  if (hours <= 24 * 90) return '90d';
  if (hours <= 24 * 180) return '180d';
  return '1y';
}

export function useLiquidityHeatmapData(
  symbol: string,
  settings: LiquidityHeatmapSettings,
  chartInterval: string,
  candles: Candle[],
  visibleRange: { from: number; to: number } | null,
): UseLiquidityHeatmapDataReturn {
  const [rawData, setRawData] = useState<LiquidityHeatmapData | null>(null);
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
    diagnostics: [],
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

  // Screen-scoped range: follows currently visible candle window.
  // This is what drives API fetch so LIQ behaves like VP while panning/zooming.
  const requestRange: CoinglassRange = useMemo(
    () => mapVisibleWindowToRange(visibleRange) || effectiveRange,
    [visibleRange, effectiveRange],
  );

  const fetchData = useCallback(async () => {
    if (!settings.enabled || !symbol) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchPredictiveLiquidationProfile(symbol, requestRange, {
        oiWeight: settings.oiWeight,
        orderbookWeight: settings.orderbookWeight,
        liqFlowWeight: settings.liqFlowWeight,
        biasWeight: settings.biasWeight,
      });
      setRawData(result.data);
      setDebugInfo({
        lastRequestUrl: `${result.requestUrl}&source=${result.source}`,
        lastRequestTime: Date.now(),
        normalizedSymbol: result.normalizedSymbol,
        source: result.source,
        stats: {
          forceOrderCount: result.debugStats.forceOrderCount,
          realtimeOrderCount: result.debugStats.realtimeOrderCount,
          mergedForceOrderCount: result.debugStats.mergedForceOrderCount,
          coinalyzeMapLevels: result.debugStats.coinalyzeMapLevels,
          depthBidLevels: result.debugStats.depthBidLevels,
          depthAskLevels: result.debugStats.depthAskLevels,
          cacheWarm: result.debugStats.cacheWarm,
        },
        diagnostics: result.debugStats.diagnostics,
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
    requestRange,
  ]);

  const data = useMemo(() => {
    if (!rawData) return null;
    if (!visibleRange || candles.length === 0) return rawData;

    const visibleCandles = candles.filter(
      (c) => Number(c.time) >= visibleRange.from && Number(c.time) <= visibleRange.to,
    );
    if (visibleCandles.length === 0) return rawData;

    const minPrice = Math.min(...visibleCandles.map((c) => Number(c.low)));
    const maxPrice = Math.max(...visibleCandles.map((c) => Number(c.high)));
    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || minPrice >= maxPrice) return rawData;

    const pad = (maxPrice - minPrice) * 0.02;
    const scopedMin = minPrice - pad;
    const scopedMax = maxPrice + pad;

    const levels = rawData.levels.filter((l: LiquidityLevel) => l.price >= scopedMin && l.price <= scopedMax);
    if (levels.length === 0) return rawData;

    let totalLongLiquidation = 0;
    let totalShortLiquidation = 0;
    let maxLongPrice = 0;
    let maxShortPrice = 0;
    let maxLongValue = 0;
    let maxShortValue = 0;

    for (const level of levels) {
      if (level.side === 'long') {
        totalLongLiquidation += level.liquidationValue;
        if (level.liquidationValue > maxLongValue) {
          maxLongValue = level.liquidationValue;
          maxLongPrice = level.price;
        }
      } else {
        totalShortLiquidation += level.liquidationValue;
        if (level.liquidationValue > maxShortValue) {
          maxShortValue = level.liquidationValue;
          maxShortPrice = level.price;
        }
      }
    }

    return {
      levels,
      maxLongPrice,
      maxShortPrice,
      totalLongLiquidation,
      totalShortLiquidation,
      lastUpdated: rawData.lastUpdated,
    };
  }, [rawData, candles, visibleRange]);

  // Trigger fetch when enabled or key settings change
  useEffect(() => {
    if (!settings.enabled) {
      setRawData(null);
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
    requestRange,
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

  return { data, isLoading, error, refetch: fetchData, effectiveRange: requestRange, debugInfo };
}

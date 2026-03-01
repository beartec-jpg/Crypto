import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CVDDataItem } from '@/types/chart';
import type { GDSExternalMetrics } from '@/lib/indicators/genuineDemandScore';

interface UseGDSMarketMetricsOptions {
  symbol: string;
  timeframe: string;
  enabled?: boolean;
}

interface NormalizedSeriesPoint {
  timestamp: number;
  value: number;
}

interface CVDResponse {
  history?: Array<{ timestamp: number; value: number }>;
  current?: { timestamp?: number; value?: number };
}

interface OpenInterestResponse {
  history?: NormalizedSeriesPoint[];
  current?: { value?: number };
}

interface FundingResponse {
  history?: NormalizedSeriesPoint[];
  current?: number | { value?: number; rate?: number; c?: number; fr?: number; fundingRate?: number };
}

interface PremiumResponse {
  current?: { value?: number };
}

interface UseGDSMarketMetricsReturn {
  externalMetrics: GDSExternalMetrics;
  cvdData: CVDDataItem[];
  isLoading: boolean;
  error: Error | null;
}

function toSortedSeries(series: NormalizedSeriesPoint[] | undefined): NormalizedSeriesPoint[] {
  return (series || []).slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

function extractFundingValue(value: FundingResponse['current']): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const candidates = [value.value, value.rate, value.fr, value.fundingRate, value.c];
  const selected = candidates.find((candidate) => typeof candidate === 'number' && Number.isFinite(candidate));
  return typeof selected === 'number' ? selected : undefined;
}

function mapCvdToTable(history: Array<{ timestamp: number; value: number }> | undefined): CVDDataItem[] {
  const sorted = (history || []).slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  return sorted.map((point, index) => {
    const previous = index > 0 ? sorted[index - 1].value : point.value;
    const delta = point.value - previous;

    return {
      time: new Date(point.timestamp).toLocaleTimeString(),
      timestamp: Math.floor(point.timestamp / 1000),
      delta,
      cumDelta: point.value,
      isBull: delta >= 0,
      volume: Math.abs(delta),
    };
  });
}

export function useGDSMarketMetrics({
  symbol,
  timeframe,
  enabled = true,
}: UseGDSMarketMetricsOptions): UseGDSMarketMetricsReturn {
  const { data, isLoading, error } = useQuery({
    queryKey: ['gds-market-metrics', symbol, timeframe],
    queryFn: async () => {
      const [cvdRes, oiRes, fundingRes, premiumRes] = await Promise.all([
        fetch(`/api/crypto/orderflow/cvd?symbol=${symbol}&interval=${timeframe}`),
        fetch(`/api/crypto/orderflow/open-interest?symbol=${symbol}&interval=${timeframe}`),
        fetch(`/api/crypto/orderflow/funding-rate?symbol=${symbol}`),
        fetch(`/api/crypto/orderflow/coinbase-premium?symbol=${symbol}`),
      ]);

      const [cvdJson, oiJson, fundingJson, premiumJson] = await Promise.all([
        cvdRes.ok ? cvdRes.json() : Promise.resolve({}),
        oiRes.ok ? oiRes.json() : Promise.resolve({}),
        fundingRes.ok ? fundingRes.json() : Promise.resolve({}),
        premiumRes.ok ? premiumRes.json() : Promise.resolve({}),
      ]);

      console.log('[GDS Debug] API response statuses:', {
        cvd: cvdRes.status,
        openInterest: oiRes.status,
        funding: fundingRes.status,
        premium: premiumRes.status,
      });

      return {
        cvd: cvdJson as CVDResponse,
        openInterest: oiJson as OpenInterestResponse,
        funding: fundingJson as FundingResponse,
        premium: premiumJson as PremiumResponse,
      };
    },
    enabled,
    refetchInterval: 60_000,
  });

  return useMemo(() => {
    const oiHistory = toSortedSeries(data?.openInterest?.history);
    const latestOi = oiHistory[oiHistory.length - 1]?.value;
    const previousOi = oiHistory[oiHistory.length - 2]?.value;

    const openInterestChangePct =
      typeof latestOi === 'number' && typeof previousOi === 'number' && Math.abs(previousOi) > 0
        ? ((latestOi - previousOi) / previousOi) * 100
        : undefined;

    const fundingHistory = toSortedSeries(data?.funding?.history);
    const fundingRate =
      fundingHistory.length > 0
        ? fundingHistory[fundingHistory.length - 1].value
        : extractFundingValue(data?.funding?.current);

    if (!fundingRate) {
      console.log('[GDS Debug] fundingRate is 0 or undefined. Raw funding data:', data?.funding);
    }

    const coinbasePremiumPct =
      typeof data?.premium?.current?.value === 'number'
        ? data.premium.current.value
        : undefined;

    console.log('[GDS Debug] Parsed metrics:', { fundingRate, coinbasePremiumPct });

    return {
      externalMetrics: {
        openInterestChangePct,
        fundingRate,
        coinbasePremiumPct,
      },
      cvdData: mapCvdToTable(data?.cvd?.history),
      isLoading,
      error: error instanceof Error ? error : null,
    };
  }, [data, isLoading, error]);
}

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  alignTetherDivergenceToChart,
  chartBarSeconds,
  computeTetherDivergence,
  type DailyPoint,
  type TetherCoinCandle,
  type TetherDivergenceComputeResult,
} from '@/lib/indicators/tetherDivergence';
import type { TetherDivergenceSettings } from '@/types/tetherDivergenceSettings';

export const USDT_DOMINANCE_QUERY_KEY = ['usdt-dominance'] as const;

export interface UsdtDominanceResponse {
  source: string;
  approximate: boolean;
  updatedAt: string;
  count: number;
  series: DailyPoint[];
  stale?: boolean;
}

export type TetherDivergenceResult = TetherDivergenceComputeResult;

const STABLE_BASES = new Set([
  'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FDUSD', 'USDP', 'USDD', 'GUSD', 'FRAX', 'LUSD', 'PYUSD', 'USD',
]);

export function isStablecoinSymbol(symbol: string | null | undefined): boolean {
  if (!symbol) return false;
  const s = symbol.toUpperCase().replace(/[-_/]/g, '');
  const base = s.replace(/USDT$|USDC$|BUSD$|USD$/, '');
  return STABLE_BASES.has(base) || STABLE_BASES.has(s);
}

async function fetchUsdtDominance(): Promise<UsdtDominanceResponse> {
  const res = await fetch('/api/crypto/usdt-dominance');
  if (!res.ok) throw new Error(`USDT.D ${res.status}`);
  return res.json();
}

async function fetchDailyCandles(symbol: string): Promise<TetherCoinCandle[]> {
  const res = await fetch(
    `/api/crypto/extended-history?symbol=${encodeURIComponent(symbol)}&timeframe=1d&limit=3200`,
  );
  if (!res.ok) throw new Error(`daily candles ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data?.candles) ? data.candles : [];
  return raw
    .map((c: any) => ({
      time: Number(c.time),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume) || 0,
    }))
    .filter((c: TetherCoinCandle) => Number.isFinite(c.time) && Number.isFinite(c.close));
}

export function useTetherDivergence({
  symbol,
  chartCandles,
  chartTimeframe,
  settings,
  enabled,
}: {
  symbol: string;
  chartCandles: Array<{ time: number }>;
  chartTimeframe: string;
  settings: TetherDivergenceSettings;
  enabled: boolean;
}): {
  result: TetherDivergenceResult | null;
  loading: boolean;
  error: Error | null;
  source: string | null;
  approximate: boolean;
} {
  const stable = isStablecoinSymbol(symbol);
  const active = enabled && !!symbol && !stable;

  const usdtdQuery = useQuery({
    queryKey: USDT_DOMINANCE_QUERY_KEY,
    queryFn: fetchUsdtDominance,
    staleTime: 60 * 60 * 1000,
    enabled: active,
  });

  const dailyQuery = useQuery({
    queryKey: ['tether-divergence-daily', symbol],
    queryFn: () => fetchDailyCandles(symbol),
    staleTime: 10 * 60 * 1000,
    enabled: active,
  });

  const result = useMemo(() => {
    if (!active) return null;
    const series = usdtdQuery.data?.series;
    const daily = dailyQuery.data;
    if (!series?.length || !daily?.length || !chartCandles.length) return null;
    const nowSec = Date.now() / 1000;
    const computed = computeTetherDivergence({
      coinCandles: daily,
      usdtd: series,
      settings,
      nowSec,
    });
    return {
      ...alignTetherDivergenceToChart(
        computed,
        chartCandles,
        chartBarSeconds(chartTimeframe),
      ),
      approximate: usdtdQuery.data?.approximate === true,
      source: usdtdQuery.data?.source ?? null,
    };
  }, [
    active,
    usdtdQuery.data,
    dailyQuery.data,
    chartCandles,
    chartTimeframe,
    settings,
  ]);

  return {
    result,
    loading: active && (usdtdQuery.isLoading || dailyQuery.isLoading),
    error: (usdtdQuery.error as Error | null) || (dailyQuery.error as Error | null) || null,
    source: usdtdQuery.data?.source ?? null,
    approximate: usdtdQuery.data?.approximate === true,
  };
}

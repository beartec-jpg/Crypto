import type { CoinglassRange, LiquidityHeatmapData } from '@/types/liquidityHeatmap';

const API_BASE = '/api/crypto/liquidations';

interface PredictiveApiResponse {
  code: string;
  data: LiquidityHeatmapData;
  meta?: {
    symbol?: string;
    source?: string;
    inputs?: {
      forceOrderCount?: number;
      realtimeOrderCount?: number;
      mergedForceOrderCount?: number;
      coinalyzeMapLevels?: number;
      depthBidLevels?: number;
      depthAskLevels?: number;
      cacheWarm?: boolean;
    };
  };
  error?: string;
}

export interface PredictiveDebugStats {
  forceOrderCount: number;
  realtimeOrderCount: number;
  mergedForceOrderCount: number;
  coinalyzeMapLevels: number;
  depthBidLevels: number;
  depthAskLevels: number;
  cacheWarm: boolean;
}

export interface FetchPredictiveLiquidationResult {
  data: LiquidityHeatmapData;
  requestUrl: string;
  normalizedSymbol: string;
  source: string;
  debugStats: PredictiveDebugStats;
}

interface PredictiveWeights {
  oiWeight: number;
  orderbookWeight: number;
  liqFlowWeight: number;
  biasWeight: number;
}

function normalizeSymbol(symbol: string): string {
  const cleaned = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!cleaned) return 'BTCUSDT';
  if (cleaned.endsWith('USDT')) return cleaned;
  return `${cleaned}USDT`;
}

export async function fetchPredictiveLiquidationProfile(
  symbol: string,
  range: CoinglassRange,
  weights: PredictiveWeights,
): Promise<FetchPredictiveLiquidationResult> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const url = new URL(`${API_BASE}/predictive-profile`, window.location.origin);
  url.searchParams.set('symbol', normalizedSymbol);
  url.searchParams.set('range', range);
  url.searchParams.set('oiWeight', String(weights.oiWeight));
  url.searchParams.set('orderbookWeight', String(weights.orderbookWeight));
  url.searchParams.set('liqFlowWeight', String(weights.liqFlowWeight));
  url.searchParams.set('biasWeight', String(weights.biasWeight));

  const requestUrl = url.toString();
  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Predictive profile request failed: ${response.status}`);
  }

  const json = await response.json() as PredictiveApiResponse;
  if (json.code !== '0' || !json.data) {
    throw new Error(json.error || 'Predictive profile unavailable');
  }

  return {
    data: json.data,
    requestUrl,
    normalizedSymbol,
    source: json.meta?.source || 'predictive-profile',
    debugStats: {
      forceOrderCount: Number(json.meta?.inputs?.forceOrderCount || 0),
      realtimeOrderCount: Number(json.meta?.inputs?.realtimeOrderCount || 0),
      mergedForceOrderCount: Number(json.meta?.inputs?.mergedForceOrderCount || 0),
      coinalyzeMapLevels: Number(json.meta?.inputs?.coinalyzeMapLevels || 0),
      depthBidLevels: Number(json.meta?.inputs?.depthBidLevels || 0),
      depthAskLevels: Number(json.meta?.inputs?.depthAskLevels || 0),
      cacheWarm: Boolean(json.meta?.inputs?.cacheWarm),
    },
  };
}

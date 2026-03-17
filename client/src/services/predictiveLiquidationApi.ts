import type { CoinglassRange, LiquidityHeatmapData } from '@/types/liquidityHeatmap';

const API_BASE = '/api/crypto/liquidations';

export interface EndpointDiagnostic {
  endpoint: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
  dataPoints?: number;
}

interface PredictiveApiResponse {
  code: string;
  data: LiquidityHeatmapData;
  meta?: {
    symbol?: string;
    source?: string;
    note?: string;
    inputs?: {
      forceOrderCount?: number;
      realtimeOrderCount?: number;
      mergedForceOrderCount?: number;
      coinalyzeMapLevels?: number;
      depthBidLevels?: number;
      depthAskLevels?: number;
      cacheWarm?: boolean;
    };
    diagnostics?: EndpointDiagnostic[];
  };
  error?: string;
}

interface LegacyPredictedResponse {
  symbol?: string;
  source?: string;
  timestamp?: number;
  priceList?: number[];
  liquidationMatrix?: number[][];
  available?: boolean;
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
  diagnostics: EndpointDiagnostic[];
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

function mapLegacyPredictedToHeatmapData(payload: LegacyPredictedResponse): LiquidityHeatmapData {
  const prices = Array.isArray(payload.priceList) ? payload.priceList : [];
  const matrix = Array.isArray(payload.liquidationMatrix) ? payload.liquidationMatrix : [];

  const midpoint = prices.length > 0
    ? prices[Math.floor(prices.length / 2)]
    : 0;

  const levels = prices
    .map((price, idx) => {
      const value = Number(matrix[idx]?.[0] ?? 0);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(value) || value <= 0) return null;
      return {
        price,
        liquidationValue: value,
        side: price < midpoint ? 'long' as const : 'short' as const,
      };
    })
    .filter((l): l is { price: number; liquidationValue: number; side: 'long' | 'short' } => Boolean(l));

  let maxLongPrice = 0;
  let maxShortPrice = 0;
  let maxLongValue = 0;
  let maxShortValue = 0;
  let totalLongLiquidation = 0;
  let totalShortLiquidation = 0;

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
    lastUpdated: Number(payload.timestamp || Date.now()),
  };
}

async function fetchLegacyPredictedFallback(normalizedSymbol: string): Promise<FetchPredictiveLiquidationResult> {
  const fallbackUrl = new URL(`${API_BASE}/predicted`, window.location.origin);
  fallbackUrl.searchParams.set('symbol', normalizedSymbol);
  fallbackUrl.searchParams.set('interval', '4h');

  const response = await fetch(fallbackUrl.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Fallback predicted request failed: ${response.status}`);
  }

  const json = await response.json() as LegacyPredictedResponse;
  if (!json.available || !Array.isArray(json.priceList) || json.priceList.length === 0) {
    throw new Error(json.error || 'Fallback predicted data unavailable');
  }

  return {
    data: mapLegacyPredictedToHeatmapData(json),
    requestUrl: fallbackUrl.toString(),
    normalizedSymbol,
    source: `fallback-${json.source || 'predicted'}`,
    debugStats: {
      forceOrderCount: 0,
      realtimeOrderCount: 0,
      mergedForceOrderCount: 0,
      coinalyzeMapLevels: Array.isArray(json.priceList) ? json.priceList.length : 0,
      depthBidLevels: 0,
      depthAskLevels: 0,
      cacheWarm: false,
      diagnostics: [],
    },
  };
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
    try {
      return await fetchLegacyPredictedFallback(normalizedSymbol);
    } catch {
      throw new Error(json.error || json.meta?.note || 'Predictive profile unavailable');
    }
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
      diagnostics: Array.isArray(json.meta?.diagnostics) ? json.meta.diagnostics : [],
    },
  };
}

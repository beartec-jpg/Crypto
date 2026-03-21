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
  optional?: boolean;
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
      directionScore?: number;
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
  directionScore: number;
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
      directionScore: 50,
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
  anchorTime?: number,
  visiblePriceBounds?: { min: number; max: number },
  visibleTimeWindow?: { from: number; to: number },
  chartInterval?: string,
): Promise<FetchPredictiveLiquidationResult> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const precomputedUrl = new URL(`${API_BASE}/precomputed-profile`, window.location.origin);
  precomputedUrl.searchParams.set('symbol', normalizedSymbol);
  precomputedUrl.searchParams.set('range', range);

  try {
    const precomputedResponse = await fetch(precomputedUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
    });

    if (precomputedResponse.ok) {
      const precomputedJson = await precomputedResponse.json() as PredictiveApiResponse;
      if (precomputedJson.code === '0' && precomputedJson.data) {
        return {
          data: precomputedJson.data,
          requestUrl: precomputedUrl.toString(),
          normalizedSymbol,
          source: precomputedJson.meta?.source || 'precomputed-profile',
          debugStats: {
            forceOrderCount: Number(precomputedJson.meta?.inputs?.forceOrderCount || 0),
            realtimeOrderCount: Number(precomputedJson.meta?.inputs?.realtimeOrderCount || 0),
            mergedForceOrderCount: Number(precomputedJson.meta?.inputs?.mergedForceOrderCount || 0),
            coinalyzeMapLevels: Number(precomputedJson.meta?.inputs?.coinalyzeMapLevels || 0),
            depthBidLevels: Number(precomputedJson.meta?.inputs?.depthBidLevels || 0),
            depthAskLevels: Number(precomputedJson.meta?.inputs?.depthAskLevels || 0),
            cacheWarm: true,
            directionScore: Number(precomputedJson.data.directionScore ?? precomputedJson.meta?.inputs?.directionScore ?? 50),
            diagnostics: Array.isArray(precomputedJson.meta?.diagnostics) ? precomputedJson.meta.diagnostics : [],
          },
        };
      }
    }
  } catch {
    // Fall through to live predictive endpoint.
  }

  const url = new URL(`${API_BASE}/predictive-profile`, window.location.origin);
  url.searchParams.set('symbol', normalizedSymbol);
  url.searchParams.set('range', range);
  url.searchParams.set('liqFlowWeight', String(weights.liqFlowWeight));
  url.searchParams.set('biasWeight', String(weights.biasWeight));
  if (anchorTime && Number.isFinite(anchorTime) && anchorTime > 0) {
    url.searchParams.set('anchorTime', String(Math.floor(anchorTime)));
  }
  if (visiblePriceBounds && Number.isFinite(visiblePriceBounds.min) && Number.isFinite(visiblePriceBounds.max) && visiblePriceBounds.max > visiblePriceBounds.min) {
    url.searchParams.set('visibleMinPrice', String(visiblePriceBounds.min));
    url.searchParams.set('visibleMaxPrice', String(visiblePriceBounds.max));
  }
  if (visibleTimeWindow && Number.isFinite(visibleTimeWindow.from) && Number.isFinite(visibleTimeWindow.to) && visibleTimeWindow.to > visibleTimeWindow.from) {
    url.searchParams.set('visibleFromTime', String(Math.floor(visibleTimeWindow.from)));
    url.searchParams.set('visibleToTime', String(Math.floor(visibleTimeWindow.to)));
  }
  if (chartInterval) {
    url.searchParams.set('chartInterval', chartInterval);
  }

  const requestUrl = url.toString();
  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    cache: 'no-store',
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
      directionScore: Number(json.data.directionScore ?? json.meta?.inputs?.directionScore ?? 50),
      diagnostics: Array.isArray(json.meta?.diagnostics) ? json.meta.diagnostics : [],
    },
  };
}

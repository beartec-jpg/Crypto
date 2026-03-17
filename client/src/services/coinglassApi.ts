import type { CoinglassRange, LiquidityHeatmapData } from '@/types/liquidityHeatmap';

// Use server-side proxy instead of direct Coinglass API call
const API_BASE = '/api/crypto';

interface CoinglassHeatmapRow {
  p: number;   // price
  lv: number;  // long liquidation value (USD)
  sv: number;  // short liquidation value (USD)
}

interface ServerHeatmapResponse {
  code: string;
  data: {
    priceList: number[];
    liqList: CoinglassHeatmapRow[];
  };
  meta: {
    symbol: string;
    exchange: string;
    range: string;
    timestamp: number;
  };
  error?: string;
  message?: string;
}

/**
 * Normalize symbol for display/debugging purposes.
 */
function normalizeSymbol(symbol: string): string {
  return symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Result shape that includes the heatmap data plus debug metadata.
 */
export interface FetchLiquidationHeatmapResult {
  data: LiquidityHeatmapData;
  requestUrl: string;
  normalizedSymbol: string;
}

/**
 * Fetch liquidation heatmap data via server-side proxy.
 * This keeps the API key secure on the server.
 */
export async function fetchLiquidationHeatmap(
  symbol: string,
  exchange: string,
  range: CoinglassRange,
): Promise<FetchLiquidationHeatmapResult> {
  const normalised = normalizeSymbol(symbol);
  const url = new URL(`${API_BASE}/liquidation-heatmap`, window.location.origin);
  url.searchParams.set('symbol', normalised);
  url.searchParams.set('exchange', exchange);
  url.searchParams.set('range', range);

  const requestUrl = url.toString();

  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Server error: ${response.status} ${response.statusText}`);
  }

  const json: ServerHeatmapResponse = await response.json();

  if (json.code !== '0') {
    throw new Error(json.message || 'Server returned error');
  }

  return {
    data: transformHeatmapResponse(json),
    requestUrl,
    normalizedSymbol: json.meta?.symbol || normalised,
  };
}

/**
 * Check if the server-side API key is configured.
 * This is used by the debug panel.
 */
export async function checkApiKeyStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/liquidation-heatmap?symbol=BTCUSDT&exchange=Binance&range=7d`);
    if (response.status === 503) {
      return false; // API key not configured
    }
    return true;
  } catch {
    return false;
  }
}

function transformHeatmapResponse(json: ServerHeatmapResponse): LiquidityHeatmapData {
  const rows = json.data?.liqList ?? [];

  let maxLongLiq = 0;
  let maxShortLiq = 0;
  let maxLongPrice = 0;
  let maxShortPrice = 0;
  let totalLong = 0;
  let totalShort = 0;

  const levels = rows.flatMap((row) => {
    const results = [];
    if (row.lv > 0) {
      totalLong += row.lv;
      if (row.lv > maxLongLiq) {
        maxLongLiq = row.lv;
        maxLongPrice = row.p;
      }
      results.push({ price: row.p, liquidationValue: row.lv, side: 'long' as const });
    }
    if (row.sv > 0) {
      totalShort += row.sv;
      if (row.sv > maxShortLiq) {
        maxShortLiq = row.sv;
        maxShortPrice = row.p;
      }
      results.push({ price: row.p, liquidationValue: row.sv, side: 'short' as const });
    }
    return results;
  });

  return {
    levels,
    maxLongPrice,
    maxShortPrice,
    totalLongLiquidation: totalLong,
    totalShortLiquidation: totalShort,
    lastUpdated: Date.now(),
  };
}

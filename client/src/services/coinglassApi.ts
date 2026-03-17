import type { LiquidityHeatmapData } from '@/types/liquidityHeatmap';

const API_BASE = 'https://open-api.coinglass.com';
const API_KEY = import.meta.env.VITE_COINGLASS_API_KEY as string | undefined;

interface CoinglassHeatmapRow {
  p: number;   // price
  lv: number;  // long liquidation value (USD)
  sv: number;  // short liquidation value (USD)
}

interface CoinglassHeatmapResponse {
  code: string;
  msg: string;
  data: {
    priceList: number[];
    liqList: CoinglassHeatmapRow[];
  };
}

function buildHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers['CG-API-KEY'] = API_KEY;
  }
  return headers;
}

/**
 * Map a Coinglass symbol (e.g. "BTCUSDT") to the format Coinglass expects.
 * Strip exchange-specific suffixes added by the chart app.
 */
function normalizeSymbol(symbol: string): string {
  return symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Fetch liquidation heatmap data for a given symbol and exchange.
 * Uses the `/api/futures/liquidation/heatmap/model2` endpoint.
 */
export async function fetchLiquidationHeatmap(
  symbol: string,
  exchange: string,
  lookbackDays: number,
): Promise<LiquidityHeatmapData> {
  const normalised = normalizeSymbol(symbol);
  const url = new URL(`${API_BASE}/api/futures/liquidation/heatmap/model2`);
  url.searchParams.set('symbol', normalised);
  url.searchParams.set('exchange', exchange);
  url.searchParams.set('range', String(lookbackDays));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Coinglass API error: ${response.status} ${response.statusText}`);
  }

  const json: CoinglassHeatmapResponse = await response.json();

  if (json.code !== '0') {
    throw new Error(`Coinglass API returned error: ${json.msg}`);
  }

  return transformHeatmapResponse(json);
}

function transformHeatmapResponse(json: CoinglassHeatmapResponse): LiquidityHeatmapData {
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

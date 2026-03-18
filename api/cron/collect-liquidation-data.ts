import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

interface BybitTicker {
  lastPrice?: string;
  markPrice?: string;
}

interface BybitOIEntry {
  openInterest?: string;
  timestamp?: string;
}

interface BybitFundingEntry {
  fundingRate?: string;
  fundingRateTimestamp?: string;
}

interface BybitOrderbook {
  b?: [string, string][];
  a?: [string, string][];
}

interface BybitAccountRatioEntry {
  buyRatio?: string;
  sellRatio?: string;
}

interface FetchResult<T> {
  data: T | null;
  error?: string;
  status?: number;
}

async function safeFetch<T>(url: string, label: string): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[collect-liq] ${label} failed: HTTP ${res.status} - ${body.slice(0, 200)}`);
      return { data: null, error: `HTTP ${res.status}`, status: res.status };
    }
    const json = await res.json() as T;
    return { data: json };
  } catch (err: any) {
    console.warn(`[collect-liq] ${label} error: ${err?.message || err}`);
    return { data: null, error: err?.message || String(err) };
  }
}

interface MarketDataDiagnostics {
  ticker: { ok: boolean; price?: number; error?: string };
  oi: { ok: boolean; value?: number; error?: string };
  funding: { ok: boolean; rate?: number; error?: string };
  depth: { ok: boolean; bids?: number; asks?: number; error?: string };
  ratio: { ok: boolean; longShort?: number; error?: string };
  liquidations: { ok: boolean; count?: number; error?: string };
  baseUrl: string;
}

interface MarketDataResult {
  price: number;
  openInterestUsd: number;
  fundingRate: number;
  longShortRatio: number;
  depthBids: [string, string][];
  depthAsks: [string, string][];
  diagnostics: MarketDataDiagnostics;
}

const BYBIT_BASE_URLS = ['https://api.bybit.com', 'https://api2.bybit.com'];

async function fetchBybitMarketData(symbol: string): Promise<MarketDataResult | null> {
  for (const baseUrl of BYBIT_BASE_URLS) {
    const isRetry = baseUrl !== BYBIT_BASE_URLS[0];
    if (isRetry) {
      console.log(`[collect-liq] Trying fallback base URL: ${baseUrl} for ${symbol}`);
    }

    const [tickerResult, oiResult, fundingResult, depthResult, ratioResult] = await Promise.all([
      safeFetch<{ result?: { list?: BybitTicker[] } }>(
        `${baseUrl}/v5/market/tickers?category=linear&symbol=${symbol}`,
        `${symbol} ticker${isRetry ? ' (fallback)' : ''}`,
      ),
      safeFetch<{ result?: { list?: BybitOIEntry[] } }>(
        `${baseUrl}/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=1`,
        `${symbol} OI${isRetry ? ' (fallback)' : ''}`,
      ),
      safeFetch<{ result?: { list?: BybitFundingEntry[] } }>(
        `${baseUrl}/v5/market/funding/history?category=linear&symbol=${symbol}&limit=1`,
        `${symbol} funding${isRetry ? ' (fallback)' : ''}`,
      ),
      safeFetch<{ result?: BybitOrderbook }>(
        `${baseUrl}/v5/market/orderbook?category=linear&symbol=${symbol}&limit=100`,
        `${symbol} depth${isRetry ? ' (fallback)' : ''}`,
      ),
      safeFetch<{ result?: { list?: BybitAccountRatioEntry[] } }>(
        `${baseUrl}/v5/market/account-ratio?category=linear&symbol=${symbol}&period=1d&limit=1`,
        `${symbol} ratio${isRetry ? ' (fallback)' : ''}`,
      ),
    ]);

    console.log(`[collect-liq] ${symbol} (${baseUrl}) raw results:`, JSON.stringify({
      ticker: tickerResult.error ?? 'ok',
      oi: oiResult.error ?? 'ok',
      funding: fundingResult.error ?? 'ok',
      depth: depthResult.error ?? 'ok',
      ratio: ratioResult.error ?? 'ok',
    }));

    const ticker = tickerResult.data?.result?.list?.[0];
    const price = parseFloat(ticker?.lastPrice || ticker?.markPrice || '0');

    if (price <= 0) {
      console.warn(`[collect-liq] ${symbol} price is ${price} from ${baseUrl} — ${tickerResult.error ? 'fetch failed' : 'API returned no price'}. ${isRetry ? 'All base URLs exhausted.' : 'Will try fallback.'}`);
      if (!isRetry) continue;
      return null;
    }

    const oiQty = parseFloat(oiResult.data?.result?.list?.[0]?.openInterest || '0');
    const openInterestUsd = oiQty * price;
    const fundingRate = parseFloat(fundingResult.data?.result?.list?.[0]?.fundingRate || '0');
    const buyRatio = parseFloat(ratioResult.data?.result?.list?.[0]?.buyRatio || '0');
    const sellRatio = parseFloat(ratioResult.data?.result?.list?.[0]?.sellRatio || '0');
    const longShortRatio = sellRatio > 0 ? buyRatio / sellRatio : 1;
    const depthBids: [string, string][] = depthResult.data?.result?.b ?? [];
    const depthAsks: [string, string][] = depthResult.data?.result?.a ?? [];

    const diagnostics: MarketDataDiagnostics = {
      baseUrl,
      ticker: tickerResult.error ? { ok: false, error: tickerResult.error } : { ok: true, price },
      oi: oiResult.error ? { ok: false, error: oiResult.error } : { ok: true, value: openInterestUsd },
      funding: fundingResult.error ? { ok: false, error: fundingResult.error } : { ok: true, rate: fundingRate },
      depth: depthResult.error ? { ok: false, error: depthResult.error } : { ok: true, bids: depthBids.length, asks: depthAsks.length },
      ratio: ratioResult.error ? { ok: false, error: ratioResult.error } : { ok: true, longShort: longShortRatio },
      liquidations: { ok: false },
    };

    console.log(`[collect-liq] ${symbol} market data OK — price: ${price}, OI: ${openInterestUsd}, funding: ${fundingRate}, ls: ${longShortRatio}, bids: ${depthBids.length}, asks: ${depthAsks.length}`);

    return { price, openInterestUsd, fundingRate, longShortRatio, depthBids, depthAsks, diagnostics };
  }

  return null;
}

async function fetchBybitLiquidations(symbol: string): Promise<Array<{
  side: string;
  price: number;
  quantity: number;
  eventTime: Date;
  valueUsd: number;
}>> {
  // Bybit v5/market/liquidation endpoint
  const result = await safeFetch<{ result?: { list?: Array<{ side?: string; price?: string; qty?: string; updatedTime?: string }> } }>(
    `https://api.bybit.com/v5/market/liquidation?category=linear&symbol=${symbol}&limit=200`,
    `${symbol} liquidations`,
  );
  const list = result.data?.result?.list;
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      const price = parseFloat(item.price || '0');
      const qty = parseFloat(item.qty || '0');
      return {
        side: item.side === 'Buy' ? 'Buy' : 'Sell',
        price,
        quantity: qty,
        eventTime: new Date(parseInt(item.updatedTime || '0')),
        valueUsd: price * qty,
      };
    })
    .filter((e) => e.price > 0 && e.quantity > 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // 1. Read enabled symbols from DB
    const trackedRows = await sql`
      SELECT symbol FROM liq_tracked_symbols WHERE enabled = TRUE ORDER BY priority DESC
    `;
    const symbols: string[] = trackedRows.map((r: any) => r.symbol as string);

    if (symbols.length === 0) {
      return res.status(200).json({ ok: true, message: 'No tracked symbols', snapshots: 0, orders: 0 });
    }

    let totalSnapshots = 0;
    let totalOrders = 0;
    const diagnosticsMap: Record<string, MarketDataDiagnostics> = {};

    for (const symbol of symbols) {
      // 2. Fetch market data from Bybit
      const marketData = await fetchBybitMarketData(symbol);
      if (!marketData) {
        console.warn(`[collect-liq] No market data for ${symbol}, skipping`);
        continue;
      }

      const { diagnostics } = marketData;

      // Round snapshot_time to the nearest minute to deduplicate
      const snapshotTime = new Date(Math.floor(Date.now() / 60000) * 60000);

      // 3. INSERT snapshot with ON CONFLICT DO NOTHING
      await sql`
        INSERT INTO liq_market_snapshots
          (symbol, snapshot_time, price, open_interest_usd, funding_rate, long_short_ratio, depth_bids, depth_asks, source)
        VALUES (
          ${symbol},
          ${snapshotTime.toISOString()},
          ${marketData.price},
          ${marketData.openInterestUsd},
          ${marketData.fundingRate},
          ${marketData.longShortRatio},
          ${JSON.stringify(marketData.depthBids)},
          ${JSON.stringify(marketData.depthAsks)},
          'bybit'
        )
        ON CONFLICT (symbol, snapshot_time) DO NOTHING
      `;
      totalSnapshots++;

      // 4. Fetch and insert liquidation events
      const liquidations = await fetchBybitLiquidations(symbol);
      diagnostics.liquidations = { ok: true, count: liquidations.length };
      console.log(`[collect-liq] ${symbol} liquidations fetched: ${liquidations.length}`);

      for (const liq of liquidations) {
        await sql`
          INSERT INTO liq_force_orders
            (symbol, side, price, quantity, exchange, event_time, value_usd)
          VALUES (
            ${symbol},
            ${liq.side},
            ${liq.price},
            ${liq.quantity},
            'bybit',
            ${liq.eventTime.toISOString()},
            ${liq.valueUsd}
          )
          ON CONFLICT (symbol, exchange, price, quantity, event_time) DO NOTHING
        `;
        totalOrders++;
      }

      diagnosticsMap[symbol] = diagnostics;
      console.log(`[collect-liq] ${symbol} diagnostics:`, JSON.stringify(diagnostics));
    }

    // 5. Cleanup old data — run only on the first minute of each hour to reduce DB load
    const currentMinute = new Date().getMinutes();
    if (currentMinute === 0) {
      await sql`DELETE FROM liq_market_snapshots WHERE snapshot_time < NOW() - INTERVAL '7 days'`;
      await sql`DELETE FROM liq_force_orders WHERE event_time < NOW() - INTERVAL '24 hours'`;
    }

    return res.status(200).json({
      ok: true,
      symbols: symbols.length,
      snapshots: totalSnapshots,
      orders: totalOrders,
      timestamp: new Date().toISOString(),
      diagnostics: diagnosticsMap,
    });
  } catch (error: any) {
    console.error('[collect-liq] Error:', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}

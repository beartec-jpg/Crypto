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

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function fetchBybitMarketData(symbol: string): Promise<{
  price: number;
  openInterestUsd: number;
  fundingRate: number;
  longShortRatio: number;
  depthBids: [string, string][];
  depthAsks: [string, string][];
} | null> {
  const [tickerData, oiData, fundingData, depthData, ratioData] = await Promise.all([
    safeFetch<{ result?: { list?: BybitTicker[] } }>(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
    ),
    safeFetch<{ result?: { list?: BybitOIEntry[] } }>(
      `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=1`,
    ),
    safeFetch<{ result?: { list?: BybitFundingEntry[] } }>(
      `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=1`,
    ),
    safeFetch<{ result?: BybitOrderbook }>(
      `https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${symbol}&limit=100`,
    ),
    safeFetch<{ result?: { list?: BybitAccountRatioEntry[] } }>(
      `https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${symbol}&period=1d&limit=1`,
    ),
  ]);

  const ticker = tickerData?.result?.list?.[0];
  const price = parseFloat(ticker?.lastPrice || ticker?.markPrice || '0');
  if (price <= 0) return null;

  const oiQty = parseFloat(oiData?.result?.list?.[0]?.openInterest || '0');
  const openInterestUsd = oiQty * price;

  const fundingRate = parseFloat(fundingData?.result?.list?.[0]?.fundingRate || '0');

  const buyRatio = parseFloat(ratioData?.result?.list?.[0]?.buyRatio || '0');
  const sellRatio = parseFloat(ratioData?.result?.list?.[0]?.sellRatio || '0');
  const longShortRatio = sellRatio > 0 ? buyRatio / sellRatio : 1;

  const depthBids: [string, string][] = depthData?.result?.b ?? [];
  const depthAsks: [string, string][] = depthData?.result?.a ?? [];

  return { price, openInterestUsd, fundingRate, longShortRatio, depthBids, depthAsks };
}

async function fetchBybitLiquidations(symbol: string): Promise<Array<{
  side: string;
  price: number;
  quantity: number;
  eventTime: Date;
  valueUsd: number;
}>> {
  // Bybit v5/market/liquidation endpoint
  const data = await safeFetch<{ result?: { list?: Array<{ side?: string; price?: string; qty?: string; updatedTime?: string }> } }>(
    `https://api.bybit.com/v5/market/liquidation?category=linear&symbol=${symbol}&limit=200`,
  );
  const list = data?.result?.list;
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

    for (const symbol of symbols) {
      // 2. Fetch market data from Bybit
      const marketData = await fetchBybitMarketData(symbol);
      if (!marketData) {
        console.warn(`[collect-liq] No market data for ${symbol}, skipping`);
        continue;
      }

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
    }

    // 5. Cleanup old data
    await sql`DELETE FROM liq_market_snapshots WHERE snapshot_time < NOW() - INTERVAL '7 days'`;
    await sql`DELETE FROM liq_force_orders WHERE event_time < NOW() - INTERVAL '24 hours'`;

    return res.status(200).json({
      ok: true,
      symbols: symbols.length,
      snapshots: totalSnapshots,
      orders: totalOrders,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[collect-liq] Error:', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  BASKET_COIN_IDS,
  buildProxyDominance,
  dropFormingUtcDay,
  exactDominanceFromCaps,
  mergeBasketByUtcDay,
  snapshotsToBarDays,
  type DominancePoint,
} from '../_lib/usdtDominance.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_CONTROL = 'public, s-maxage=21600, stale-while-revalidate=86400';
const FREE_HOST = 'https://api.coingecko.com/api/v3';
const PRO_HOST = 'https://pro-api.coingecko.com/api/v3';

type Source = 'coingecko-pro' | 'coingecko-free-basket-proxy';

interface CachedPayload {
  source: Source;
  approximate: boolean;
  updatedAt: string;
  count: number;
  series: DominancePoint[];
  stale?: boolean;
}

let cache: { at: number; payload: CachedPayload } | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, headers: Record<string, string>, attempt = 0): Promise<any> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 8000)
      : 1000 * 2 ** attempt;
    await sleep(wait);
    return fetchJson(url, headers, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`upstream ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
  }
  return res.json();
}

function pairsFromMarketCaps(raw: any): Array<[number, number]> {
  const caps = raw?.market_caps ?? raw?.market_cap ?? raw?.market_cap_chart?.market_cap;
  if (!Array.isArray(caps)) return [];
  return caps.filter((p: unknown) => Array.isArray(p) && p.length >= 2) as Array<[number, number]>;
}

async function fetchProSeries(apiKey: string): Promise<CachedPayload> {
  const headers = { accept: 'application/json', 'x-cg-pro-api-key': apiKey };
  const totalRaw = await fetchJson(
    `${PRO_HOST}/global/market_cap_chart?days=max&vs_currency=usd`,
    headers,
  );
  const usdtRaw = await fetchJson(
    `${PRO_HOST}/coins/tether/market_chart?days=max&interval=daily&vs_currency=usd`,
    headers,
  );
  const total = snapshotsToBarDays(pairsFromMarketCaps(totalRaw));
  const usdt = snapshotsToBarDays(pairsFromMarketCaps(usdtRaw));
  const series = dropFormingUtcDay(exactDominanceFromCaps(usdt, total));
  return {
    source: 'coingecko-pro',
    approximate: false,
    updatedAt: new Date().toISOString(),
    count: series.length,
    series,
  };
}

async function fetchFreeBasketProxy(demoKey?: string): Promise<CachedPayload> {
  // CoinGecko's keyless tier rate-limits by IP, and Vercel's shared egress IPs are
  // usually already over it (429). A free Demo key gives a per-key quota instead.
  const headers: Record<string, string> = { accept: 'application/json' };
  if (demoKey) headers['x-cg-demo-api-key'] = demoKey;
  const seriesById: Record<string, Array<[number, number]>> = {};
  for (let i = 0; i < BASKET_COIN_IDS.length; i++) {
    const id = BASKET_COIN_IDS[i];
    if (i > 0) await sleep(demoKey ? 300 : 1500);
    const raw = await fetchJson(
      `${FREE_HOST}/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`,
      headers,
    );
    seriesById[id] = pairsFromMarketCaps(raw);
  }
  const globalRaw = await fetchJson(`${FREE_HOST}/global`, headers);
  const globalTotalNow = Number(globalRaw?.data?.total_market_cap?.usd);
  const exactUsdtNow = Number(globalRaw?.data?.market_cap_percentage?.usdt);
  const rows = mergeBasketByUtcDay(seriesById);
  const series = dropFormingUtcDay(buildProxyDominance(rows, globalTotalNow, exactUsdtNow));
  if (!series.length) throw new Error('empty proxy series');
  return {
    source: 'coingecko-free-basket-proxy',
    approximate: true,
    updatedAt: new Date().toISOString(),
    count: series.length,
    series,
  };
}

function sendJson(res: VercelResponse, status: number, body: unknown, extraHeaders?: Record<string, string>) {
  res.setHeader('Cache-Control', CACHE_CONTROL);
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  }
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return sendJson(res, 200, cache.payload);
  }

  try {
    const proKey = process.env.COINGECKO_PRO_API_KEY;
    const demoKey = process.env.COINGECKO_DEMO_API_KEY;
    const payload = proKey ? await fetchProSeries(proKey) : await fetchFreeBasketProxy(demoKey);
    cache = { at: now, payload };
    return sendJson(res, 200, payload);
  } catch (err) {
    console.error('usdt-dominance upstream failed:', err instanceof Error ? err.message : 'error');
    if (cache?.payload) {
      return sendJson(res, 200, { ...cache.payload, stale: true });
    }
    // Never let the CDN cache a failure for hours (s-maxage); retry on next request.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Failed to fetch USDT dominance' });
  }
}

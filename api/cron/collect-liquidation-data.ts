import type { VercelRequest, VercelResponse } from '@vercel/node';

type EndpointResult = {
  endpoint: string;
  ok: boolean;
  status: number;
  ms: number;
  error?: string;
};

function getRequestOrigin(req: VercelRequest): string {
  const host = req.headers.host;
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = typeof protoHeader === 'string' ? protoHeader : 'https';
  return `${proto}://${host}`;
}

function parseSymbols(raw: unknown): string[] {
  const fallback = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const parsed = raw
    .split(',')
    .map((s) => s.replace(/[^A-Z0-9]/gi, '').toUpperCase())
    .filter(Boolean)
    .map((s) => (s.endsWith('USDT') ? s : `${s}USDT`));
  return parsed.length > 0 ? parsed.slice(0, 20) : fallback;
}

async function probe(url: string, endpoint: string): Promise<EndpointResult> {
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    return {
      endpoint,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      error: response.ok ? undefined : `http_${response.status}`,
    };
  } catch (error: any) {
    return {
      endpoint,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: error?.message || 'network_error',
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const symbols = parseSymbols(req.query.symbols);
  const origin = getRequestOrigin(req);
  const allResults: Array<{ symbol: string; endpoints: EndpointResult[] }> = [];

  for (const symbol of symbols) {
    const endpoints = await Promise.all([
      probe(`${origin}/api/crypto/liquidations/realtime?symbol=${symbol}&limit=300&exchange=all`, 'realtime-liquidations'),
      probe(`${origin}/api/crypto/orderflow/open-interest?symbol=${symbol}&interval=1h`, 'open-interest'),
      probe(`${origin}/api/crypto/orderflow/funding-rate?symbol=${symbol}&interval=1h`, 'funding-rate'),
      probe(`${origin}/api/crypto/orderflow/long-short-ratio?symbol=${symbol}&interval=1h`, 'long-short-ratio'),
      probe(`${origin}/api/crypto/extended-history?symbol=${symbol}&timeframe=1m&limit=300`, 'extended-history'),
    ]);
    allResults.push({ symbol, endpoints });
  }

  const okCount = allResults.reduce(
    (sum, row) => sum + row.endpoints.filter((e) => e.ok).length,
    0,
  );
  const totalCount = allResults.reduce((sum, row) => sum + row.endpoints.length, 0);

  return res.status(200).json({
    ok: true,
    message: 'Liquidation data collection probes completed',
    symbols,
    successRate: totalCount > 0 ? Number(((okCount / totalCount) * 100).toFixed(2)) : 0,
    timestamp: Date.now(),
    results: allResults,
  });
}

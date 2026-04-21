import type { VercelRequest, VercelResponse } from '@vercel/node';

const POOL_STATS_URL = process.env.QBTC_POOL_STATS_URL || '';

function getSecurePoolStatsUrl(): string {
  if (!POOL_STATS_URL) {
    throw new Error('QBTC_POOL_STATS_URL is not configured');
  }
  const url = new URL(POOL_STATS_URL);
  // URL is from env var (admin-controlled), not user input — http is acceptable for server-to-server
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('QBTC_POOL_STATS_URL must use http:// or https://');
  }
  return url.toString();
}

async function readProxyResponse(response: Response) {
  const contentType = String(response.headers.get('content-type') || '');
  if (contentType.toLowerCase().includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return { error: text || 'Upstream error' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const response = await fetch(getSecurePoolStatsUrl(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const data = await readProxyResponse(response);
    return res.status(response.status).json(data);
  } catch (error: any) {
    const message = String(error?.message || 'Pool stats unavailable');
    const timeout = message.toLowerCase().includes('timed out') || error?.name === 'TimeoutError';
    const isConfigError = message.includes('QBTC_POOL_STATS_URL');
    return res.status(isConfigError ? 500 : timeout ? 504 : 502).json({ error: message });
  }
}

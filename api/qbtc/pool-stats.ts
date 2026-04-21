import type { VercelRequest, VercelResponse } from '@vercel/node';

const POOL_STATS_URL = process.env.QBTC_POOL_STATS_URL || '';
const CORS_ALLOWED_ORIGINS = String(process.env.QBTC_MINING_CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOW_ORIGINLESS = String(process.env.QBTC_MINING_ALLOW_ORIGINLESS || 'false').toLowerCase() === 'true';

function getOrigin(req: VercelRequest): string {
  return String(req.headers.origin || '').trim();
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return ALLOW_ORIGINLESS;
  if (CORS_ALLOWED_ORIGINS.length === 0) return false;
  return CORS_ALLOWED_ORIGINS.includes(origin);
}

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = getOrigin(req);
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

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
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return isAllowedOrigin(getOrigin(req))
      ? res.status(204).end()
      : res.status(403).json({ error: 'Origin not allowed' });
  }

  if (!isAllowedOrigin(getOrigin(req))) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

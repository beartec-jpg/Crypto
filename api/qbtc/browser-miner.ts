import type { VercelRequest, VercelResponse } from '@vercel/node';

const POOL_BASE_URL = process.env.QBTC_POOL_HTTP_BASE_URL || '';
const CORS_ALLOWED_ORIGINS = String(process.env.QBTC_MINING_CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOW_ORIGINLESS = String(process.env.QBTC_MINING_ALLOW_ORIGINLESS || 'false').toLowerCase() === 'true';
const SUBMIT_RATE_LIMIT_PER_MINUTE = Math.max(
  1,
  Number(process.env.QBTC_BROWSER_MINER_SUBMIT_RATE_LIMIT_PER_MINUTE || 120),
);
const RATE_WINDOW_MS = 60_000;
const submitRateLimit = new Map<string, { windowStart: number; count: number }>();
let lastRateCleanupAt = Date.now();
const WORKER_ALIAS_MAX_LEN = 32;
const DEFAULT_WORKER_ALIAS = 'browser';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function getSecurePoolBaseUrl(): URL {
  if (!POOL_BASE_URL) {
    throw new Error('QBTC_POOL_HTTP_BASE_URL is not configured');
  }
  const url = new URL(POOL_BASE_URL);
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(isLocalhost && url.protocol === 'http:')) {
    throw new Error('QBTC_POOL_HTTP_BASE_URL must use http:// or https://');
  }
  return url;
}

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '');
  const first = raw.split(',')[0]?.trim();
  return first || String(req.socket?.remoteAddress || 'unknown');
}

function isRateLimited(clientIp: string, now: number): boolean {
  if (now - lastRateCleanupAt >= RATE_WINDOW_MS) {
    for (const [ip, entry] of submitRateLimit.entries()) {
      if (now - entry.windowStart > RATE_WINDOW_MS) {
        submitRateLimit.delete(ip);
      }
    }
    lastRateCleanupAt = now;
  }
  const current = submitRateLimit.get(clientIp);
  if (!current || now - current.windowStart > RATE_WINDOW_MS) {
    submitRateLimit.set(clientIp, { windowStart: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > SUBMIT_RATE_LIMIT_PER_MINUTE;
}

function isValidQbtcAddress(address: string): boolean {
  // QBTC bech32-style addresses:
  // prefix: qbtc1/qbtct1/qbtcr1 + charset [qpzry9x8gf2tvdw0s3jn54khce6mua7l], min payload length 20.
  const value = address.trim();
  const isUniformCase = value === value.toLowerCase() || value === value.toUpperCase();
  if (!isUniformCase) return false;
  return /^qbtc(t|r)?1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,}$/.test(value.toLowerCase());
}

function sanitizeWorker(worker: string): string {
  return worker.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, WORKER_ALIAS_MAX_LEN) || DEFAULT_WORKER_ALIAS;
}

function isHex(value: string, expectedBytes?: number): boolean {
  if (!/^[0-9a-f]+$/i.test(value)) return false;
  if (typeof expectedBytes === 'number') return value.length === expectedBytes * 2;
  return value.length > 0 && value.length % 2 === 0;
}

function parseSubmitPayload(input: unknown) {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const worker_name = String(body.worker_name || '').trim();
  const job_id = String(body.job_id || '').trim();
  const extranonce2 = String(body.extranonce2 || '').trim();
  const ntime = String(body.ntime || '').trim();
  const nonce = String(body.nonce || '').trim();

  if (!worker_name || worker_name.length > 64) return null;
  if (!job_id || job_id.length > 128) return null;
  if (!isHex(extranonce2)) return null;
  if (!isHex(ntime, 4)) return null;
  if (!isHex(nonce, 4)) return null;

  return { worker_name, job_id, extranonce2, ntime, nonce };
}

async function readProxyResponse(response: Response) {
  const contentType = String(response.headers.get('content-type') || '');
  if (contentType.toLowerCase().includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return { ok: response.ok, error: text || 'Upstream error' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return isAllowedOrigin(getOrigin(req))
      ? res.status(204).end()
      : res.status(403).json({ ok: false, error: 'Origin not allowed' });
  }

  if (!isAllowedOrigin(getOrigin(req))) {
    return res.status(403).json({ ok: false, error: 'Origin not allowed' });
  }

  const action = String(req.query.action || '').toLowerCase();

  try {
    const poolBaseUrl = getSecurePoolBaseUrl();

    if (req.method === 'GET' && action === 'job') {
      const address = String(req.query.address || '').trim();
      if (!isValidQbtcAddress(address)) {
        return res.status(400).json({ ok: false, error: 'Enter a valid QBTC payout address' });
      }

      const worker = sanitizeWorker(String(req.query.worker || 'browser'));
      const upstreamUrl = new URL('/browser-miner/job', poolBaseUrl);
      upstreamUrl.searchParams.set('address', address);
      upstreamUrl.searchParams.set('worker', worker);

      const response = await fetch(upstreamUrl.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const data = await readProxyResponse(response);
      return res.status(response.status).json(data);
    }

    if (req.method === 'POST' && action === 'submit') {
      const clientIp = getClientIp(req);
      if (isRateLimited(clientIp, Date.now())) {
        return res.status(429).json({ ok: false, error: 'Rate limit exceeded' });
      }

      const payload = parseSubmitPayload(req.body);
      if (!payload) {
        return res.status(400).json({ ok: false, error: 'Invalid share payload' });
      }

      const response = await fetch(new URL('/browser-miner/submit', poolBaseUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      const data = await readProxyResponse(response);
      return res.status(response.status).json(data);
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed for requested action' });
  } catch (error: any) {
    const message = String(error?.message || 'Browser miner unavailable');
    const timeout = message.toLowerCase().includes('timed out') || error?.name === 'TimeoutError';
    const isConfigError = message.includes('QBTC_POOL_HTTP_BASE_URL');
    return res.status(isConfigError ? 500 : timeout ? 504 : 502).json({
      ok: false,
      error: message,
    });
  }
}

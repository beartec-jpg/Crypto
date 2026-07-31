/**
 * Proxy / aggregate AI trade-tracker performance for the web app.
 * Primary source: always-on worker (TRACKER_URL). Falls back to empty if unset.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const trackerUrl = (process.env.TRACKER_URL || '').replace(/\/+$/, '');
  if (!trackerUrl) {
    return res.status(503).json({
      error: 'TRACKER_URL not configured',
      hint: 'Point TRACKER_URL at the spare-server trade tracker (e.g. http://5.78.142.246:3101)',
    });
  }

  try {
    const days = typeof req.query.days === 'string' ? req.query.days : '';
    const qs = days ? `?days=${encodeURIComponent(days)}` : '';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.TRACKER_API_KEY) {
      headers['X-Tracker-Key'] = process.env.TRACKER_API_KEY;
    }

    const [perfRes, tradesRes, healthRes] = await Promise.all([
      fetch(`${trackerUrl}/api/performance${qs}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(`${trackerUrl}/api/trades?active=1&limit=50`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(`${trackerUrl}/health`, {
        headers,
        signal: AbortSignal.timeout(5_000),
      }),
    ]);

    const performance = perfRes.ok ? await perfRes.json() : { error: await perfRes.text() };
    const trades = tradesRes.ok ? await tradesRes.json() : { trades: [] };
    const health = healthRes.ok ? await healthRes.json() : null;

    return res.json({
      ok: perfRes.ok,
      health,
      performance,
      activeTrades: trades.trades || [],
      trackerUrl: trackerUrl.replace(/\/\/.*@/, '//'), // strip userinfo if any
    });
  } catch (err: any) {
    console.error('trade-performance proxy failed:', err);
    return res.status(502).json({ error: err?.message || 'tracker unreachable' });
  }
}

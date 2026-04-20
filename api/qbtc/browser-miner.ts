import type { VercelRequest, VercelResponse } from '@vercel/node';

const POOL_BASE_URL = process.env.QBTC_POOL_HTTP_BASE_URL || 'http://89.167.109.241:8088';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  const action = String(req.query.action || '').toLowerCase();

  try {
    if (req.method === 'GET' && action === 'job') {
      const address = encodeURIComponent(String(req.query.address || ''));
      const worker = encodeURIComponent(String(req.query.worker || 'browser'));
      const response = await fetch(`${POOL_BASE_URL}/browser-miner/job?address=${address}&worker=${worker}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const data = await response.json();
      return res.status(response.ok ? 200 : 400).json(data);
    }

    if (req.method === 'POST' && action === 'submit') {
      const response = await fetch(`${POOL_BASE_URL}/browser-miner/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(req.body || {}),
        signal: AbortSignal.timeout(8000),
      });
      const data = await response.json();
      return res.status(response.ok ? 200 : 400).json(data);
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(200).json({
      ok: false,
      error: error?.message || 'Browser miner unavailable',
    });
  }
}

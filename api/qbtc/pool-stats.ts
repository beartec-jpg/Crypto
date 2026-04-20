import type { VercelRequest, VercelResponse } from '@vercel/node';

const POOL_STATS_URL = process.env.QBTC_POOL_STATS_URL || 'http://89.167.109.241:8088/stats';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(POOL_STATS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Pool stats endpoint returned ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(200).json({
      pool_name: 'BearTec',
      running: false,
      connected_miners: 0,
      authorized_workers: 0,
      accepted_shares: 0,
      invalid_shares: 0,
      pending_payouts: 0,
      total_paid: 0,
      workers: [],
      error: error?.message || 'Pool stats unavailable',
    });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, toCamelCase } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM swap_offers WHERE status = 'OPEN' ORDER BY created_at ASC`
    );
    return res.json(result.rows.map(toCamelCase));
  } catch (error: any) {
    console.error('GET /api/swap/offers error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch swap offers' });
  }
}

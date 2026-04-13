import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, toCamelCase } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const swapId = req.query.swapId as string;
    if (!swapId) return res.status(400).json({ error: 'swapId is required' });

    const pool = getPool();
    const result = await pool.query('SELECT * FROM atomic_swaps WHERE id = $1', [swapId]);
    const swap = result.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });

    // Only expose the secret when the swap is complete
    const mapped = toCamelCase(swap);
    const exposeSecret = swap.status === 'COMPLETE';
    return res.json({
      ...mapped,
      secret: exposeSecret ? swap.secret : null,
    });
  } catch (error: any) {
    console.error('GET /api/swap/:swapId error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch swap' });
  }
}

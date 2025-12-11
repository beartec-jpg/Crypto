import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';
import pg from 'pg';

async function verifyAuth(req: VercelRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const secretKey = process.env.CLERK_SECRET_KEY;

    if (!secretKey) {
      console.error('CLERK_SECRET_KEY not set');
      return null;
    }
    
    const payload = await verifyToken(token, { secretKey });
    return payload?.sub || null;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

async function getDb() {
  const Pool = pg.Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function checkEliteTier(pool: any, userId: string): Promise<boolean> {
  const result = await pool.query('SELECT subscription_tier FROM crypto_users WHERE id = $1', [userId]);
  if (result.rows.length === 0) return false;
  return result.rows[0].subscription_tier === 'elite';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await verifyAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const pool = await getDb();
  const { id } = req.query;

  try {
    const isElite = await checkEliteTier(pool, userId);
    if (!isElite) {
      await pool.end();
      return res.status(403).json({ error: 'Elite subscription required' });
    }

    if (req.method === 'DELETE') {
      const result = await pool.query(
        'DELETE FROM saved_projection_lines WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, userId]
      );
      
      if (result.rows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Projection line not found' });
      }
      
      await pool.end();
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PATCH') {
      const { alertEnabled } = req.body;
      
      const result = await pool.query(
        'UPDATE saved_projection_lines SET alert_enabled = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
        [alertEnabled, id, userId]
      );
      
      if (result.rows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Projection line not found' });
      }
      
      const l = result.rows[0];
      const camelCased = {
        id: l.id,
        userId: l.user_id,
        symbol: l.symbol,
        timeframe: l.timeframe,
        structureId: l.structure_id,
        levelLabel: l.level_label,
        price: l.price,
        color: l.color,
        waveType: l.wave_type,
        alertEnabled: l.alert_enabled,
        createdAt: l.created_at,
      };
      
      await pool.end();
      return res.status(200).json(camelCased);
    }

    await pool.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in projection-lines/[id]:', error);
    await pool.end();
    return res.status(500).json({ error: error.message });
  }
}

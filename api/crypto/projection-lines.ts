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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await verifyAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const pool = await getDb();
  
  try {
    const isElite = await checkEliteTier(pool, userId);
    if (!isElite) {
      await pool.end();
      return res.status(403).json({ error: 'Elite subscription required' });
    }

    if (req.method === 'GET') {
      const { symbol } = req.query;
      
      let result;
      if (symbol) {
        result = await pool.query(
          'SELECT * FROM saved_projection_lines WHERE user_id = $1 AND symbol = $2',
          [userId, symbol]
        );
      } else {
        result = await pool.query(
          'SELECT * FROM saved_projection_lines WHERE user_id = $1',
          [userId]
        );
      }
      
      const camelCased = result.rows.map((l: any) => ({
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
      }));
      
      await pool.end();
      return res.status(200).json(camelCased);
    }

    if (req.method === 'POST') {
      const { symbol, timeframe, structureId, levelLabel, price, color, waveType, alertEnabled } = req.body;
      
      if (!symbol || !timeframe || !structureId || !levelLabel || price === undefined || !waveType) {
        await pool.end();
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const finalColor = color || (waveType === 'impulse' ? '#00CED1' : '#FBBF24');
      
      const result = await pool.query(
        `INSERT INTO saved_projection_lines (user_id, symbol, timeframe, structure_id, level_label, price, color, wave_type, alert_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [userId, symbol, timeframe, structureId, levelLabel, price, finalColor, waveType, alertEnabled || false]
      );
      
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
    console.error('Error in projection-lines:', error);
    await pool.end();
    return res.status(500).json({ error: error.message });
  }
}

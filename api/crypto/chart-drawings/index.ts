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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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
    if (req.method === 'GET') {
      const { symbol, timeframe } = req.query;
      
      if (!symbol || !timeframe) {
        await pool.end();
        return res.status(400).json({ error: 'symbol and timeframe required' });
      }
      
      const result = await pool.query(
        'SELECT * FROM chart_drawings WHERE user_id = $1 AND symbol = $2 AND timeframe = $3 ORDER BY created_at ASC',
        [userId, symbol, timeframe]
      );
      
      await pool.end();
      return res.status(200).json(result.rows);
    }
    
    if (req.method === 'POST') {
      const { symbol, timeframe, drawingType, coordinates, style, isLocked } = req.body;
      
      if (!symbol || !timeframe || !drawingType || !coordinates) {
        await pool.end();
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const result = await pool.query(`
        INSERT INTO chart_drawings (user_id, symbol, timeframe, drawing_type, coordinates, style, is_locked)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [userId, symbol, timeframe, drawingType, JSON.stringify(coordinates), JSON.stringify(style || {}), isLocked || false]);
      
      await pool.end();
      return res.status(201).json(result.rows[0]);
    }
    
    if (req.method === 'DELETE') {
      const { symbol, timeframe } = req.query;
      
      if (!symbol || !timeframe) {
        await pool.end();
        return res.status(400).json({ error: 'symbol and timeframe required for bulk delete' });
      }
      
      await pool.query(
        'DELETE FROM chart_drawings WHERE user_id = $1 AND symbol = $2 AND timeframe = $3',
        [userId, symbol, timeframe]
      );
      
      await pool.end();
      return res.status(200).json({ success: true });
    }
    
    await pool.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Chart drawings error:', error);
    await pool.end();
    return res.status(500).json({ error: error.message });
  }
}

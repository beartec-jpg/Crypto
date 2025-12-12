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

async function checkEliteTier(pool: any, clerkUserId: string): Promise<boolean> {
  // First get the user's email from crypto_users using the Clerk ID
  const userResult = await pool.query('SELECT id, email FROM crypto_users WHERE id = $1', [clerkUserId]);
  if (userResult.rows.length === 0) return false;
  
  const dbUserId = userResult.rows[0].id;
  const email = userResult.rows[0].email;
  
  // Admin bypass for beartec@beartec.uk
  if (email === 'beartec@beartec.uk') return true;
  
  // Check subscription tier from crypto_subscriptions table
  const subResult = await pool.query('SELECT tier, has_elliott_addon FROM crypto_subscriptions WHERE user_id = $1', [dbUserId]);
  if (subResult.rows.length === 0) return false;
  
  const tier = subResult.rows[0].tier;
  const hasElliott = subResult.rows[0].has_elliott_addon;
  
  // Elite tier OR Elliott Wave addon grants access
  return tier === 'elite' || hasElliott === true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
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

    // Extract ID from multiple sources - Vercel routing can be inconsistent
    // Try: URL path, query param, or body
    const urlParts = req.url?.split('/') || [];
    const lastPart = urlParts[urlParts.length - 1]?.split('?')[0];
    const idFromPath = lastPart && lastPart !== 'projection-lines' && !lastPart.includes('=') ? lastPart : null;
    const idFromQuery = typeof req.query.id === 'string' ? req.query.id : null;
    const idFromBody = req.body?.id;
    const idFromUrl = idFromPath || idFromQuery || idFromBody;
    
    // Debug logging for production
    console.log('[projection-lines] method:', req.method, 'url:', req.url, 'idFromUrl:', idFromUrl);

    // GET - List all projection lines
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

    // POST - Create new projection line
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

    // PATCH - Update alert status (requires ID in URL)
    if (req.method === 'PATCH' && idFromUrl) {
      const { alertEnabled } = req.body;
      
      const result = await pool.query(
        'UPDATE saved_projection_lines SET alert_enabled = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
        [alertEnabled, idFromUrl, userId]
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

    // DELETE - Remove projection line (requires ID in URL)
    if (req.method === 'DELETE' && idFromUrl) {
      const result = await pool.query(
        'DELETE FROM saved_projection_lines WHERE id = $1 AND user_id = $2 RETURNING *',
        [idFromUrl, userId]
      );
      
      if (result.rows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Projection line not found' });
      }
      
      await pool.end();
      return res.status(200).json({ success: true });
    }

    await pool.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in projection-lines:', error);
    await pool.end();
    return res.status(500).json({ error: error.message });
  }
}

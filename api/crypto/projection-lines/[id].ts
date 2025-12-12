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

  // Extract ID from query params (Vercel puts [id] in req.query.id)
  const id = req.query.id as string || req.body?.id;
  
  console.log('[projection-lines/[id]] method:', req.method, 'query.id:', req.query.id, 'body.id:', req.body?.id, 'final id:', id);
  
  if (!id) {
    return res.status(400).json({ error: 'Missing projection line ID' });
  }

  const pool = await getDb();
  
  try {
    const isElite = await checkEliteTier(pool, userId);
    if (!isElite) {
      await pool.end();
      return res.status(403).json({ error: 'Elite subscription required' });
    }

    // PATCH - Update alert status
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

    // DELETE - Remove projection line
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

    await pool.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in projection-lines/[id]:', error);
    await pool.end();
    return res.status(500).json({ error: error.message });
  }
}

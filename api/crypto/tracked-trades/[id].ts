import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

// Verify user authentication from Clerk token
async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
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

    if (!payload?.sub) {
      return null;
    }

    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(payload.sub);
    const email = user.emailAddresses[0]?.emailAddress || '';

    return { userId: payload.sub, email };
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

// Database connection
async function getDb() {
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = new (Pool as any)({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  return pool;
}

function mapRowToTrade(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    direction: row.direction,
    grade: row.grade,
    entry: row.entry,
    stopLoss: row.stop_loss,
    targets: row.targets || [],
    confluenceSignals: row.confluence_signals || [],
    reasoning: row.reasoning,
    status: row.status,
    entryHitAt: row.entry_hit_at,
    slHitAt: row.sl_hit_at,
    tpHitAt: row.tp_hit_at,
    tpHitLevel: row.tp_hit_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Trade ID required' });
  }

  // Authenticate user
  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized - please sign in' });
  }
  const { userId } = auth;

  let pool: any = null;
  try {
    pool = await getDb();
    
    if (req.method === 'PATCH') {
      const { status, entryHitAt, slHitAt, tpHitAt, tpHitLevel } = req.body;
      
      if (!status && !entryHitAt && !slHitAt && !tpHitAt && !tpHitLevel) {
        return res.status(400).json({ error: 'No update fields provided' });
      }
      
      const updates: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      let paramIndex = 1;
      
      if (status) {
        updates.push(`status = $${paramIndex++}`);
        params.push(status);
      }
      if (entryHitAt) {
        updates.push(`entry_hit_at = $${paramIndex++}`);
        params.push(new Date(entryHitAt));
      }
      if (slHitAt) {
        updates.push(`sl_hit_at = $${paramIndex++}`);
        params.push(new Date(slHitAt));
      }
      if (tpHitAt) {
        updates.push(`tp_hit_at = $${paramIndex++}`);
        params.push(new Date(tpHitAt));
      }
      if (tpHitLevel !== undefined) {
        updates.push(`tp_hit_level = $${paramIndex++}`);
        params.push(tpHitLevel);
      }
      
      params.push(id, userId);
      
      const result = await pool.query(
        `UPDATE tracked_trades SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING *`,
        params
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Trade not found' });
      }
      
      return res.json(mapRowToTrade(result.rows[0]));
    }
    
    if (req.method === 'DELETE') {
      const result = await pool.query(
        'DELETE FROM tracked_trades WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Trade not found' });
      }
      
      console.log(`🗑️ Deleted tracked trade: ${id} for user: ${userId}`);
      return res.json({ success: true, trade: mapRowToTrade(result.rows[0]) });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error: any) {
    console.error('Tracked trade error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

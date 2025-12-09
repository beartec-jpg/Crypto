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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
    
    if (req.method === 'GET') {
      const { symbol } = req.query;
      
      let query = 'SELECT * FROM tracked_trades WHERE user_id = $1';
      const params: any[] = [userId];
      
      if (symbol) {
        query += ' AND symbol = $2';
        params.push(symbol);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const result = await pool.query(query, params);
      return res.json(result.rows.map(mapRowToTrade));
    }
    
    if (req.method === 'POST') {
      const { symbol, direction, grade, entry, stopLoss, targets, confluenceSignals, reasoning } = req.body;
      
      if (!symbol || !direction || !grade || entry === undefined || stopLoss === undefined) {
        return res.status(400).json({ error: 'Missing required fields: symbol, direction, grade, entry, stopLoss' });
      }
      
      const existingResult = await pool.query(
        `SELECT * FROM tracked_trades WHERE user_id = $1 AND symbol = $2 AND direction = $3 AND entry = $4 LIMIT 1`,
        [userId, symbol, direction, entry.toString()]
      );
      
      if (existingResult.rows.length > 0) {
        return res.json(mapRowToTrade(existingResult.rows[0]));
      }
      
      const targetsArray = Array.isArray(targets) ? targets.map((t: any) => t.toString()) : targets ? [targets.toString()] : [];
      const signalsArray = Array.isArray(confluenceSignals) ? confluenceSignals : [];
      
      const insertResult = await pool.query(
        `INSERT INTO tracked_trades (user_id, symbol, direction, grade, entry, stop_loss, targets, confluence_signals, reasoning, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW(), NOW())
         RETURNING *`,
        [userId, symbol, direction, grade, entry.toString(), stopLoss.toString(), targetsArray, signalsArray, reasoning || null]
      );
      
      return res.json(mapRowToTrade(insertResult.rows[0]));
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Tracked trades error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

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

async function getDb() {
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = new (Pool as any)({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { email } = auth;
  const { symbol, interval } = req.query;

  if (!symbol || !interval) {
    return res.status(400).json({ error: 'Symbol and interval required' });
  }

  let pool: any = null;

  try {
    pool = await getDb();

    // Get user ID
    const userResult = await pool.query(
      'SELECT id FROM crypto_users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      await pool.end();
      return res.json({ cached: null });
    }

    const cryptoUserId = userResult.rows[0].id;

    // Get cached Elliott analysis
    const result = await pool.query(
      `SELECT elliott_analysis, updated_at
       FROM crypto_ai_analyses
       WHERE user_id = $1 AND symbol = $2 AND interval = $3`,
      [cryptoUserId, symbol, interval]
    );

    await pool.end();

    if (result.rows.length === 0 || !result.rows[0].elliott_analysis) {
      return res.json({ cached: null });
    }

    const row = result.rows[0];
    // Parse JSON if needed (pg driver usually handles this but be safe)
    const elliottData = typeof row.elliott_analysis === 'string' 
      ? JSON.parse(row.elliott_analysis) 
      : row.elliott_analysis;
    return res.json({
      cached: {
        ...elliottData,
        updatedAt: row.updated_at?.toISOString() || null
      }
    });
  } catch (error: any) {
    console.error('Error fetching cached Elliott analysis:', error);
    try { await pool?.end(); } catch {}
    return res.status(500).json({ error: error.message });
  }
}

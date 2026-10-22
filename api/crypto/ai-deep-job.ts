import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.substring(7);
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;

    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) return null;

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
  const pool = new (Pool as any)({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
  });
  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Authentication required' });

  const rawId = req.query.id;
  const id = (Array.isArray(rawId) ? rawId[0] : rawId)?.trim();
  if (!id) return res.status(400).json({ error: 'Job id is required' });

  let pool: any = null;
  try {
    pool = await getDb();

    const userResult = await pool.query('SELECT id FROM crypto_users WHERE email = $1', [auth.email]);
    if (userResult.rows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'Not found' });
    }
    const cryptoUserId = String(userResult.rows[0].id);

    const jobResult = await pool.query(
      `SELECT user_id, status, result, error
       FROM crypto_ai_deep_jobs
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    await pool.end();
    pool = null;

    const row = jobResult.rows[0];
    if (!row || String(row.user_id) !== cryptoUserId) {
      return res.status(404).json({ error: 'Not found' });
    }

    const body: { status: string; result?: unknown; error?: string } = { status: row.status };
    if (row.status === 'done' && row.result != null) {
      body.result = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
    }
    if (row.status === 'error') {
      body.error = row.error || 'Deep-dive failed';
    }
    return res.json(body);
  } catch (error: any) {
    try { await pool?.end(); } catch { /* already closed */ }
    if (error?.code === '22P02') {
      return res.status(404).json({ error: 'Not found' });
    }
    console.error('Deep-dive job status error:', error?.message || 'unknown error');
    return res.status(500).json({ error: 'Failed to load job' });
  }
}

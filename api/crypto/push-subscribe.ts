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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await verifyAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { endpoint, p256dh, auth } = req.body;
  
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Missing subscription data' });
  }

  const pool = await getDb();

  try {
    // Upsert subscription - update if endpoint exists, otherwise insert
    await pool.query(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint) 
      DO UPDATE SET p256dh = $2, auth = $3, user_id = $4, last_used_at = NOW()
    `, [endpoint, p256dh, auth, userId]);
    
    await pool.end();
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error saving push subscription:', error);
    await pool.end();
    return res.status(500).json({ error: error.message });
  }
}

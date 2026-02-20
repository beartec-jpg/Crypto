import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { Pool } from 'pg';

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

// Singleton pool for connection reuse within the same function instance
let poolInstance: Pool | null = null;

async function getDb(): Promise<Pool> {
  if (poolInstance) {
    return poolInstance;
  }

  const pg = await import('pg');
  const PoolConstructor = pg.default?.Pool || pg.Pool;
  poolInstance = new PoolConstructor({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });
  return poolInstance;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email } = auth;
  const pool = await getDb();

  try {
    // Get user ID from crypto_users
    const userResult = await pool.query(
      'SELECT id FROM crypto_users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cryptoUserId = userResult.rows[0].id;

    if (req.method === 'GET') {
      console.log(`📥 GET /api/users/positions - userId: ${cryptoUserId}`);

      const positionsResult = await pool.query(
        'SELECT positions FROM user_positions WHERE user_id = $1',
        [cryptoUserId]
      );

      if (positionsResult.rows.length === 0) {
        console.log(`⚠️ No positions found for user ${cryptoUserId}, returning 404`);
        return res.status(404).json({ error: 'No positions found' });
      }

      const positions = positionsResult.rows[0].positions || [];
      console.log(`✅ Positions loaded for user ${cryptoUserId}: ${positions.length} positions`);
      return res.json({ positions });
    }

    if (req.method === 'PUT') {
      const { positions } = req.body;

      if (!Array.isArray(positions)) {
        return res.status(400).json({ error: 'positions must be an array' });
      }

      console.log(`💾 PUT /api/users/positions - userId: ${cryptoUserId}, count: ${positions.length}`);

      await pool.query(
        `INSERT INTO user_positions (id, user_id, positions, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           positions = EXCLUDED.positions,
           updated_at = NOW()`,
        [cryptoUserId, JSON.stringify(positions)]
      );

      console.log(`✅ Positions saved for user ${cryptoUserId}`);
      return res.json({ positions });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error with user positions:', error);
    return res.status(500).json({ error: error.message || 'Failed to process user positions' });
  }
}

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

// Singleton pool for connection reuse within the same function instance
let poolInstance: any = null;

async function getDb() {
  if (poolInstance) {
    return poolInstance;
  }
  
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  poolInstance = new (Pool as any)({ 
    connectionString: process.env.DATABASE_URL,
    max: 1, // Limit to 1 connection per serverless function instance
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
      console.log(`📥 GET /api/crypto/watchlist/settings - userId: ${cryptoUserId}`);
      
      // Get bias settings from watchlist
      const settingsResult = await pool.query(
        'SELECT structure_pivot_length, ema_lengths FROM user_watchlists WHERE user_id = $1',
        [cryptoUserId]
      );

      if (settingsResult.rows.length === 0) {
        // No watchlist row exists yet - return 404 so frontend can use defaults
        console.log(`⚠️ No watchlist found for user ${cryptoUserId}, returning 404`);
        return res.status(404).json({ error: 'No watchlist settings found' });
      }

      const settings = {
        structurePivotLength: settingsResult.rows[0].structure_pivot_length,
        emaLengths: settingsResult.rows[0].ema_lengths,
      };

      console.log(`✅ Bias settings loaded for user ${cryptoUserId}:`, settings);
      return res.json(settings);
    }

    if (req.method === 'PUT') {
      const { structurePivotLength, emaLengths } = req.body;
      
      // Validate input
      if (typeof structurePivotLength !== 'number' || structurePivotLength < 1) {
        return res.status(400).json({ error: 'structurePivotLength must be a positive number' });
      }
      if (!Array.isArray(emaLengths) || emaLengths.length !== 3 || !emaLengths.every((l) => typeof l === 'number' && l > 0)) {
        return res.status(400).json({ error: 'emaLengths must be an array of 3 positive numbers' });
      }

      console.log(`💾 PUT /api/crypto/watchlist/settings - userId: ${cryptoUserId}, pivot: ${structurePivotLength}, ema: ${emaLengths}`);

      // Check if watchlist exists
      const existingResult = await pool.query(
        'SELECT id FROM user_watchlists WHERE user_id = $1',
        [cryptoUserId]
      );

      if (existingResult.rows.length === 0) {
        // Create new watchlist with default tickers and provided settings
        await pool.query(
          `INSERT INTO user_watchlists (id, user_id, tickers, structure_pivot_length, ema_lengths, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())`,
          [cryptoUserId, JSON.stringify([]), structurePivotLength, emaLengths]
        );
        console.log(`✅ Watchlist created with bias settings for user ${cryptoUserId}`);
      } else {
        // Update existing watchlist bias settings only
        await pool.query(
          'UPDATE user_watchlists SET structure_pivot_length = $1, ema_lengths = $2, updated_at = NOW() WHERE user_id = $3',
          [structurePivotLength, emaLengths, cryptoUserId]
        );
        console.log(`✅ Bias settings updated for user ${cryptoUserId}`);
      }

      return res.json({ structurePivotLength, emaLengths });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error with watchlist bias settings:', error);
    return res.status(500).json({ error: error.message || 'Failed to process watchlist bias settings' });
  }
  // Note: Do not close the pool in serverless functions - it will be reused across invocations
}

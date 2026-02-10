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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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
      console.log(`📥 GET /api/crypto/watchlist - userId: ${cryptoUserId}`);
      
      // Get or create watchlist
      let watchlistResult = await pool.query(
        'SELECT tickers FROM user_watchlists WHERE user_id = $1',
        [cryptoUserId]
      );

      let tickers: string[];
      if (watchlistResult.rows.length === 0) {
        // Create default watchlist
        console.log(`✅ Creating default watchlist for user ${cryptoUserId}`);
        const defaultTickers = ['XRPUSDT', 'BTCUSDT', 'ETHUSDT'];
        
        await pool.query(
          `INSERT INTO user_watchlists (id, user_id, tickers, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())`,
          [cryptoUserId, JSON.stringify(defaultTickers)]
        );
        
        tickers = defaultTickers;
      } else {
        tickers = watchlistResult.rows[0].tickers;
      }

      console.log(`✅ Watchlist loaded for user ${cryptoUserId}:`, tickers);
      return res.json({ tickers });
    }

    if (req.method === 'POST') {
      const { tickers } = req.body;
      
      // Validate input
      if (!Array.isArray(tickers)) {
        return res.status(400).json({ error: 'Tickers must be an array' });
      }

      console.log(`💾 POST /api/crypto/watchlist - userId: ${cryptoUserId}, tickers:`, tickers);

      // Check if watchlist exists
      const existingResult = await pool.query(
        'SELECT id FROM user_watchlists WHERE user_id = $1',
        [cryptoUserId]
      );

      if (existingResult.rows.length === 0) {
        // Create new watchlist
        await pool.query(
          `INSERT INTO user_watchlists (id, user_id, tickers, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())`,
          [cryptoUserId, JSON.stringify(tickers)]
        );
        console.log(`✅ Watchlist created for user ${cryptoUserId}`);
      } else {
        // Update existing watchlist
        await pool.query(
          'UPDATE user_watchlists SET tickers = $1, updated_at = NOW() WHERE user_id = $2',
          [JSON.stringify(tickers), cryptoUserId]
        );
        console.log(`✅ Watchlist updated for user ${cryptoUserId}`);
      }

      return res.json({ tickers });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error with watchlist:', error);
    return res.status(500).json({ error: error.message || 'Failed to process watchlist' });
  } finally {
    try { 
      await pool.end(); 
    } catch (e) {
      console.error('Failed to close pool:', e);
    }
  }
}

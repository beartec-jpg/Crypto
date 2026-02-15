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
  const Pool = pg.Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
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
      console.log(`📥 GET /api/crypto/oscillator-preferences - userId: ${cryptoUserId}`);
      
      // Get or create oscillator preferences
      let preferencesResult = await pool.query(
        'SELECT favorite_oscillators FROM user_oscillator_preferences WHERE user_id = $1',
        [cryptoUserId]
      );

      let favoriteOscillators: string[];
      if (preferencesResult.rows.length === 0) {
        // Create default preferences with empty array
        console.log(`✅ Creating default oscillator preferences for user ${cryptoUserId}`);
        favoriteOscillators = [];
        
        await pool.query(
          `INSERT INTO user_oscillator_preferences (id, user_id, favorite_oscillators, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())`,
          [cryptoUserId, JSON.stringify(favoriteOscillators)]
        );
      } else {
        favoriteOscillators = preferencesResult.rows[0].favorite_oscillators;
      }

      console.log(`✅ Oscillator preferences loaded for user ${cryptoUserId}:`, favoriteOscillators);
      return res.json({ favoriteOscillators });
    }

    if (req.method === 'PUT') {
      const { favoriteOscillators } = req.body;
      
      // Validate input
      if (!Array.isArray(favoriteOscillators)) {
        return res.status(400).json({ error: 'favoriteOscillators must be an array' });
      }

      // Validate oscillator IDs
      const validOscillators = ['rsi', 'macd', 'stochRSI', 'obv', 'mfi', 'williamsR', 'cci', 'adx'];
      const invalidOscillators = favoriteOscillators.filter(id => !validOscillators.includes(id));
      if (invalidOscillators.length > 0) {
        return res.status(400).json({ 
          error: `Invalid oscillator IDs: ${invalidOscillators.join(', ')}` 
        });
      }

      console.log(`💾 PUT /api/crypto/oscillator-preferences - userId: ${cryptoUserId}, favorites:`, favoriteOscillators);

      // Check if preferences exist
      const existingResult = await pool.query(
        'SELECT id FROM user_oscillator_preferences WHERE user_id = $1',
        [cryptoUserId]
      );

      if (existingResult.rows.length === 0) {
        // Create new preferences
        await pool.query(
          `INSERT INTO user_oscillator_preferences (id, user_id, favorite_oscillators, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())`,
          [cryptoUserId, JSON.stringify(favoriteOscillators)]
        );
        console.log(`✅ Oscillator preferences created for user ${cryptoUserId}`);
      } else {
        // Update existing preferences
        await pool.query(
          'UPDATE user_oscillator_preferences SET favorite_oscillators = $1, updated_at = NOW() WHERE user_id = $2',
          [JSON.stringify(favoriteOscillators), cryptoUserId]
        );
        console.log(`✅ Oscillator preferences updated for user ${cryptoUserId}`);
      }

      return res.json({ favoriteOscillators });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error with oscillator preferences:', error);
    return res.status(500).json({ error: error.message || 'Failed to process oscillator preferences' });
  } finally {
    try { 
      await pool.end(); 
    } catch (e) {
      console.error('Failed to close pool:', e);
    }
  }
}

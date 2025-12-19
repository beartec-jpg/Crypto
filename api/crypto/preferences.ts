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
      await pool.end();
      return res.status(404).json({ error: 'User not found' });
    }

    const cryptoUserId = userResult.rows[0].id;

    if (req.method === 'GET') {
      const result = await pool.query(
        `SELECT selected_tickers, alert_grades, alert_timeframes, alert_types, 
                alerts_enabled, push_subscription, tier
         FROM crypto_subscriptions WHERE user_id = $1`,
        [cryptoUserId]
      );

      await pool.end();

      if (result.rows.length === 0) {
        return res.json({
          selectedTickers: [],
          alertGrades: ['A+', 'A'],
          alertTimeframes: ['15m', '1h', '4h'],
          alertTypes: ['bos', 'choch', 'fvg', 'liquidation'],
          alertsEnabled: false,
          pushSubscription: null,
          tier: 'free',
        });
      }

      const row = result.rows[0];
      return res.json({
        selectedTickers: row.selected_tickers || [],
        alertGrades: row.alert_grades || ['A+', 'A'],
        alertTimeframes: row.alert_timeframes || ['15m', '1h', '4h'],
        alertTypes: row.alert_types || ['bos', 'choch', 'fvg', 'liquidation'],
        alertsEnabled: row.alerts_enabled || false,
        pushSubscription: row.push_subscription || null,
        tier: row.tier || 'free',
      });
    }

    if (req.method === 'POST') {
      const { selectedTickers, alertGrades, alertTimeframes, alertTypes, alertsEnabled, pushSubscription } = req.body || {};

      // Check if subscription exists
      const existingResult = await pool.query(
        'SELECT id FROM crypto_subscriptions WHERE user_id = $1',
        [cryptoUserId]
      );

      if (existingResult.rows.length === 0) {
        // Insert new subscription
        await pool.query(
          `INSERT INTO crypto_subscriptions 
           (id, user_id, selected_tickers, alert_grades, alert_timeframes, alert_types, alerts_enabled, push_subscription, tier, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'free', NOW(), NOW())`,
          [
            cryptoUserId,
            selectedTickers || [],
            alertGrades || ['A+', 'A'],
            alertTimeframes || ['15m', '1h', '4h'],
            alertTypes || ['bos', 'choch'],
            alertsEnabled || false,
            pushSubscription ? JSON.stringify(pushSubscription) : null
          ]
        );
      } else {
        // Update existing subscription
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (selectedTickers !== undefined) {
          updates.push(`selected_tickers = $${paramIndex++}`);
          values.push(selectedTickers);
        }
        if (alertGrades !== undefined) {
          updates.push(`alert_grades = $${paramIndex++}`);
          values.push(alertGrades);
        }
        if (alertTimeframes !== undefined) {
          updates.push(`alert_timeframes = $${paramIndex++}`);
          values.push(alertTimeframes);
        }
        if (alertTypes !== undefined) {
          updates.push(`alert_types = $${paramIndex++}`);
          values.push(alertTypes);
        }
        if (alertsEnabled !== undefined) {
          updates.push(`alerts_enabled = $${paramIndex++}`);
          values.push(alertsEnabled);
        }
        if (pushSubscription !== undefined) {
          updates.push(`push_subscription = $${paramIndex++}`);
          values.push(pushSubscription ? JSON.stringify(pushSubscription) : null);
        }

        updates.push(`updated_at = NOW()`);
        values.push(cryptoUserId);

        const query = `UPDATE crypto_subscriptions SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`;
        await pool.query(query, values);
      }

      await pool.end();
      return res.json({ success: true });
    }

    await pool.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error with preferences:', error);
    try { await pool.end(); } catch {}
    return res.status(500).json({ error: error.message });
  }
}

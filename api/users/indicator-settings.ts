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
      console.log(`📥 GET /api/users/indicator-settings - userId: ${cryptoUserId}`);

      const settingsResult = await pool.query(
        `SELECT fvg_settings, order_block_settings, liquidity_settings, pd_zone_settings, bos_settings
         FROM user_indicator_settings WHERE user_id = $1`,
        [cryptoUserId]
      );

      if (settingsResult.rows.length === 0) {
        console.log(`⚠️ No indicator settings found for user ${cryptoUserId}, returning 404`);
        return res.status(404).json({ error: 'No indicator settings found' });
      }

      const row = settingsResult.rows[0];
      const settings = {
        fvgSettings: row.fvg_settings,
        orderBlockSettings: row.order_block_settings,
        liquiditySettings: row.liquidity_settings,
        pdZoneSettings: row.pd_zone_settings,
        bosSettings: row.bos_settings,
      };

      console.log(`✅ Indicator settings loaded for user ${cryptoUserId}`);
      return res.json(settings);
    }

    if (req.method === 'PUT') {
      const { fvgSettings, orderBlockSettings, liquiditySettings, pdZoneSettings, bosSettings } = req.body;

      console.log(`💾 PUT /api/users/indicator-settings - userId: ${cryptoUserId}`);

      // Load existing to merge (only update provided fields)
      const existingResult = await pool.query(
        `SELECT fvg_settings, order_block_settings, liquidity_settings, pd_zone_settings, bos_settings
         FROM user_indicator_settings WHERE user_id = $1`,
        [cryptoUserId]
      );

      const existing = existingResult.rows.length > 0 ? existingResult.rows[0] : null;
      const merged = {
        fvgSettings: fvgSettings !== undefined ? fvgSettings : (existing?.fvg_settings ?? null),
        orderBlockSettings: orderBlockSettings !== undefined ? orderBlockSettings : (existing?.order_block_settings ?? null),
        liquiditySettings: liquiditySettings !== undefined ? liquiditySettings : (existing?.liquidity_settings ?? null),
        pdZoneSettings: pdZoneSettings !== undefined ? pdZoneSettings : (existing?.pd_zone_settings ?? null),
        bosSettings: bosSettings !== undefined ? bosSettings : (existing?.bos_settings ?? null),
      };

      await pool.query(
        `INSERT INTO user_indicator_settings (id, user_id, fvg_settings, order_block_settings, liquidity_settings, pd_zone_settings, bos_settings, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           fvg_settings = EXCLUDED.fvg_settings,
           order_block_settings = EXCLUDED.order_block_settings,
           liquidity_settings = EXCLUDED.liquidity_settings,
           pd_zone_settings = EXCLUDED.pd_zone_settings,
           bos_settings = EXCLUDED.bos_settings,
           updated_at = NOW()`,
        [
          cryptoUserId,
          JSON.stringify(merged.fvgSettings),
          JSON.stringify(merged.orderBlockSettings),
          JSON.stringify(merged.liquiditySettings),
          JSON.stringify(merged.pdZoneSettings),
          JSON.stringify(merged.bosSettings),
        ]
      );

      console.log(`✅ Indicator settings saved for user ${cryptoUserId}`);
      return res.json(merged);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error with user indicator settings:', error);
    return res.status(500).json({ error: error.message || 'Failed to process user indicator settings' });
  }
}

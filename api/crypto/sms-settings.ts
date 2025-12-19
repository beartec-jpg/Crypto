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
    if (req.method === 'GET') {
      const result = await pool.query(
        'SELECT phone_number, sms_alerts_enabled FROM crypto_users WHERE email = $1',
        [email]
      );

      await pool.end();

      if (result.rows.length === 0) {
        return res.json({ phoneNumber: null, smsAlertsEnabled: false });
      }

      return res.json({
        phoneNumber: result.rows[0].phone_number,
        smsAlertsEnabled: result.rows[0].sms_alerts_enabled || false
      });
    }

    if (req.method === 'POST') {
      const { phoneNumber, smsAlertsEnabled } = req.body || {};

      if (phoneNumber !== undefined && phoneNumber && !phoneNumber.match(/^\+[1-9]\d{6,14}$/)) {
        await pool.end();
        return res.status(400).json({ 
          error: "Phone number must be in international format (e.g., +447712345678)" 
        });
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (phoneNumber !== undefined) {
        updates.push(`phone_number = $${paramIndex++}`);
        values.push(phoneNumber || null);
      }

      if (smsAlertsEnabled !== undefined) {
        updates.push(`sms_alerts_enabled = $${paramIndex++}`);
        values.push(smsAlertsEnabled);
      }

      updates.push(`updated_at = NOW()`);
      values.push(email);

      const query = `UPDATE crypto_users SET ${updates.join(', ')} WHERE email = $${paramIndex} RETURNING phone_number, sms_alerts_enabled`;
      const result = await pool.query(query, values);

      await pool.end();

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({
        success: true,
        phoneNumber: result.rows[0].phone_number,
        smsAlertsEnabled: result.rows[0].sms_alerts_enabled
      });
    }

    await pool.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error with SMS settings:', error);
    try { await pool.end(); } catch {}
    return res.status(500).json({ error: error.message });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';

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
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = new (Pool as any)({ connectionString: process.env.DATABASE_URL });
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

  const pool = await getDb();

  try {
    const userResult = await pool.query(
      'SELECT phone_number FROM crypto_users WHERE clerk_user_id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0 || !userResult.rows[0].phone_number) {
      await pool.end();
      return res.status(400).json({ error: 'No phone number configured' });
    }

    const phoneNumber = userResult.rows[0].phone_number;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      await pool.end();
      return res.status(500).json({ error: 'SMS service not configured' });
    }

    const twilioModule = await import('twilio');
    const twilioClient = twilioModule.default || twilioModule;
    const client = twilioClient(accountSid, authToken);
    
    await client.messages.create({
      body: '✅ BearTec SMS alerts are now connected! You will receive trading alerts via SMS.',
      from: fromNumber,
      to: phoneNumber
    });
    
    await pool.end();
    return res.status(200).json({ success: true, message: 'Test SMS sent successfully' });
  } catch (error: any) {
    console.error('Error sending test SMS:', error);
    await pool.end();
    return res.status(500).json({ error: error.message });
  }
}

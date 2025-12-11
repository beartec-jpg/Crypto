import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';
import pg from 'pg';
import webpush from 'web-push';

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

  const pool = await getDb();

  try {
    // Sanitize VAPID keys - remove quotes, newlines, whitespace
    let publicVapidKey = process.env.PUBLIC_VAPID_KEY?.replace(/["\n\r\s]/g, '').trim();
    let privateVapidKey = process.env.PRIVATE_VAPID_KEY?.replace(/["\n\r\s]/g, '').trim();
    
    if (!publicVapidKey || !privateVapidKey) {
      await pool.end();
      return res.status(500).json({ error: 'VAPID keys not configured' });
    }
    
    // Validate public key length (should be ~87 chars base64)
    if (publicVapidKey.length < 80 || publicVapidKey.length > 100) {
      await pool.end();
      return res.status(500).json({ error: `Invalid PUBLIC_VAPID_KEY length: ${publicVapidKey.length} (expected ~87)` });
    }
    
    webpush.setVapidDetails(
      'mailto:alerts@beartec.uk',
      publicVapidKey,
      privateVapidKey
    );
    
    const result = await pool.query(
      'SELECT * FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'No push subscription found. Please enable notifications first.' });
    }
    
    const sub = result.rows[0];
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };
    
    const payload = JSON.stringify({
      title: '🔔 Test Notification',
      body: 'Push notifications are working! You will receive alerts for your saved targets.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'test-notification',
    });
    
    await webpush.sendNotification(pushSubscription, payload);
    
    await pool.end();
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error sending test push:', error);
    await pool.end();
    return res.status(500).json({ error: error.message });
  }
}

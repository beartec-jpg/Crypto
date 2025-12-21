import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.PUBLIC_VAPID_KEY;
  
  if (!publicKey) {
    console.error('VAPID public key not configured');
    return res.status(500).json({ error: 'VAPID key not configured' });
  }

  return res.status(200).json({ publicKey });
}

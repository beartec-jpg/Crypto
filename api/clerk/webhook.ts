// Clerk webhook (Svix-signed) → auth_events, idempotent on svix-id.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { verifySvixSignature } from '../_lib/svix.js';
import { authEventFromClerk, insertAuthEvent } from '../_lib/authEvents.js';

export const config = { api: { bodyParser: false } };

async function getRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const header = (req: VercelRequest, name: string) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook not configured' });

  const body = await getRawBody(req);
  const id = header(req, 'svix-id');
  const ok = verifySvixSignature({
    secret, id, timestamp: header(req, 'svix-timestamp'), signatureHeader: header(req, 'svix-signature'), body,
  });
  if (!ok) return res.status(400).json({ error: 'Invalid signature' });

  let payload: any;
  try { payload = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const row = authEventFromClerk(id as string, payload);
  if (!row) return res.json({ received: true, ignored: true });
  try {
    const inserted = await insertAuthEvent(getPool(), row);
    return res.json({ received: true, duplicate: !inserted });
  } catch (err: any) {
    console.error('auth_events insert failed:', err?.message ?? 'unknown error');
    return res.status(500).json({ error: 'Failed to record event' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';
import pg from 'pg';

const { Pool } = pg;
const dbPool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  : null;

let tableReady: Promise<void> | null = null;

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function isValidQbtcAddress(address: string): boolean {
  return /^qbtc(t|r)?1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,}$/i.test(address.trim());
}

async function ensureTable() {
  if (!dbPool) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!tableReady) {
    tableReady = dbPool.query(`
      CREATE TABLE IF NOT EXISTS qbtc_pool_bindings (
        user_id TEXT PRIMARY KEY,
        payout_address TEXT NOT NULL,
        worker_alias TEXT NOT NULL DEFAULT 'worker1',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => undefined);
  }

  return tableReady;
}

async function getUserId(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY is not configured');
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, { secretKey });
  return payload?.sub ? String(payload.sub) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await getUserId(req).catch(() => null);
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    await ensureTable();

    if (req.method === 'GET') {
      const result = await dbPool!.query(
        `SELECT payout_address, worker_alias, created_at, updated_at
         FROM qbtc_pool_bindings
         WHERE user_id = $1
         LIMIT 1`,
        [userId],
      );

      const row = result.rows[0];
      return res.status(200).json({
        binding: row
          ? {
              payoutAddress: row.payout_address,
              workerAlias: row.worker_alias,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            }
          : null,
      });
    }

    if (req.method === 'POST') {
      const payoutAddress = String(req.body?.payoutAddress || '').trim();
      const workerAliasRaw = String(req.body?.workerAlias || 'worker1').trim();
      const workerAlias = workerAliasRaw.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32) || 'worker1';

      if (!isValidQbtcAddress(payoutAddress)) {
        return res.status(400).json({ error: 'Enter a valid QBTC payout address' });
      }

      const result = await dbPool!.query(
        `INSERT INTO qbtc_pool_bindings (user_id, payout_address, worker_alias)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id)
         DO UPDATE SET
           payout_address = EXCLUDED.payout_address,
           worker_alias = EXCLUDED.worker_alias,
           updated_at = NOW()
         RETURNING payout_address, worker_alias, created_at, updated_at`,
        [userId, payoutAddress, workerAlias],
      );

      const row = result.rows[0];
      return res.status(200).json({
        ok: true,
        binding: {
          payoutAddress: row.payout_address,
          workerAlias: row.worker_alias,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Miner binding request failed' });
  }
}

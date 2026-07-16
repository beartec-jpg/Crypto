import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

import { getPool } from '../_lib/db.js';
import { CRYPTO_AI_HIGHER_TIMEFRAMES, CRYPTO_AI_LOWER_TIMEFRAMES } from '../_lib/cryptoAiConfig.js';

const ADMIN_EMAIL = 'beartec@beartec.uk';

async function verifyAuth(req: VercelRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.substring(7);
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;

    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) return null;

    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(payload.sub);
    return user.emailAddresses[0]?.emailAddress || null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = await verifyAuth(req);
  if (!email || (email !== ADMIN_EMAIL && !email.endsWith('@beartec.uk'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const pool = getPool();
  try {
    const activeTickerResult = await pool.query(
      `SELECT DISTINCT unnest(scan_tickers) AS symbol
       FROM crypto_subscriptions
       WHERE cardinality(scan_tickers) > 0`
    );

    const activeTickers = activeTickerResult.rows
      .map((row: { symbol?: string }) => row.symbol)
      .filter((symbol): symbol is string => Boolean(symbol));
    const activeCombos = activeTickers.length * CRYPTO_AI_HIGHER_TIMEFRAMES.length * CRYPTO_AI_LOWER_TIMEFRAMES.length;

    const cacheResult = await pool.query(
      `SELECT ai_narration, mode
       FROM crypto_scan_cache
       WHERE ai_narration IS NOT NULL`
    );

    const latestUsage = cacheResult.rows
      .map((row: { ai_narration?: any }) => {
        const narration = typeof row.ai_narration === 'string' ? JSON.parse(row.ai_narration) : row.ai_narration;
        return {
          inputTokens: Number(narration?.tokens?.input ?? 0),
          outputTokens: Number(narration?.tokens?.output ?? 0),
          estimatedCost: Number(narration?.estimatedCost ?? 0),
        };
      })
      .filter((value) => Number.isFinite(value.estimatedCost) && value.estimatedCost >= 0);

    const averageCost = latestUsage.length > 0
      ? latestUsage.reduce((sum, value) => sum + value.estimatedCost, 0) / latestUsage.length
      : 0;
    const averageInputTokens = latestUsage.length > 0
      ? latestUsage.reduce((sum, value) => sum + value.inputTokens, 0) / latestUsage.length
      : 0;
    const averageOutputTokens = latestUsage.length > 0
      ? latestUsage.reduce((sum, value) => sum + value.outputTokens, 0) / latestUsage.length
      : 0;
    const warmedGeneralCombos = cacheResult.rows.filter((row: { mode?: string }) => row.mode === 'general').length;
    const cacheHitRate = activeCombos > 0 ? Math.min(1, warmedGeneralCombos / activeCombos) : 0;
    const callsPerDay = activeCombos * 3;
    const estimatedDailyCost = callsPerDay * averageCost;

    return res.json({
      activeTickers: activeTickers.length,
      activeCombos,
      activePairs: activeCombos,
      callsPerDay,
      averageInputTokens,
      averageOutputTokens,
      cacheHitRate,
      estimatedDailyCost,
      estimatedMonthlyCost: estimatedDailyCost * 30,
      averageCostPerCall: averageCost,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

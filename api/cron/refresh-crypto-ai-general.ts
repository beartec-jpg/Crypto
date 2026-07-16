import type { VercelRequest, VercelResponse } from '@vercel/node';

import { getPool } from '../_lib/db.js';
import {
  CRYPTO_AI_HIGHER_TIMEFRAMES,
  CRYPTO_AI_LOWER_TIMEFRAMES,
} from '../_lib/cryptoAiConfig.js';
import { runGeneralPairRefresh } from '../crypto/order-flow-alerts-multi-tf.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  const expectedCronAuth = process.env.CRON_SECRET ? ['Bearer', process.env.CRON_SECRET].join(' ') : null;
  if (expectedCronAuth && authHeader !== expectedCronAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  const pool = getPool();
  try {
    const activeTickerResult = await pool.query(
      `SELECT DISTINCT unnest(scan_tickers) AS symbol
       FROM crypto_subscriptions
       WHERE cardinality(scan_tickers) > 0`
    );

    const symbols = activeTickerResult.rows
      .map((row: { symbol?: string }) => row.symbol)
      .filter((symbol): symbol is string => Boolean(symbol));

    const pairs = CRYPTO_AI_HIGHER_TIMEFRAMES.flatMap((higherTimeframe) =>
      CRYPTO_AI_LOWER_TIMEFRAMES.map((lowerTimeframe) => ({ higherTimeframe, lowerTimeframe })),
    );

    const results = [];
    for (const symbol of symbols) {
      for (const pair of pairs) {
        results.push(await runGeneralPairRefresh(pool, apiKey, symbol, pair.higherTimeframe, pair.lowerTimeframe));
      }
    }

    return res.json({
      success: true,
      activeTickers: symbols.length,
      activePairs: symbols.length * pairs.length,
      callsPerDay: symbols.length * pairs.length * 3,
      estimatedDailyCost: results.reduce((sum, result) => sum + (result.estimatedCost ?? 0), 0) * 3,
    });
  } catch (error: any) {
    console.error('Failed to refresh crypto AI general cache:', error);
    return res.status(500).json({ error: error.message });
  }
}

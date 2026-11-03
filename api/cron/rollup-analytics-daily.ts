// Daily 00:15 UTC: fill subscription_snapshots_daily and analytics_daily_stats.
// Rolls up yesterday and re-runs today so far; ?date=YYYY-MM-DD targets one day.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { runDailyRollup } from '../_lib/adminAnalytics.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.CRON_SECRET ? ['Bearer', process.env.CRON_SECRET].join(' ') : null;
  if (expected && req.headers.authorization !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const pool = getPool();
  try {
    const now = new Date();
    const days: Date[] = [];
    if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      days.push(new Date(req.query.date + 'T00:00:00Z'));
    } else {
      days.push(new Date(now.getTime() - 86400000), now);
    }
    const results = [];
    for (const d of days) results.push(await runDailyRollup(pool as any, d));
    return res.json({ ok: true, results });
  } catch (err: any) {
    console.error('rollup-analytics-daily failed:', err?.message ?? 'unknown error');
    return res.status(500).json({ error: 'Rollup failed' });
  }
}

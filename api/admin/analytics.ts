// GET /api/admin/analytics/{summary|timeseries|tiers|ai-cost} (rewritten to ?view=).
// Admin only: same Clerk email rule as api/crypto/admin-ai-usage.ts.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { isAdminRequest } from '../_lib/adminAuth.js';
import { handleAnalyticsView } from '../_lib/adminAnalytics.js';
import { parseRange } from '../_lib/analyticsMetrics.js';

export type AdminCheck = (req: VercelRequest) => Promise<boolean>;

export function createHandler(check: AdminCheck = isAdminRequest, pool = () => getPool() as any) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!(await check(req))) return res.status(403).json({ error: 'Forbidden' });
    const view = String(req.query.view ?? '');
    try {
      const range = parseRange(req.query.from, req.query.to);
      const out = await handleAnalyticsView(pool(), view, req.query as Record<string, unknown>, range);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(out.status).json(out.body);
    } catch (err: any) {
      console.error('admin analytics error:', err?.message ?? 'unknown error');
      return res.status(500).json({ error: 'Analytics query failed' });
    }
  };
}

export default createHandler();

/**
 * Queries behind /api/admin/analytics/*. Every function takes a Queryable so
 * the same code runs from the Vercel function, the Express dev server, the
 * daily rollup cron and unit tests. Auth is checked by the callers.
 */
import type { Queryable } from './billingEvents.js';
import {
  ALL_TIERS, buildAiCostRow, churnPct, clampInt, pct, sortAiCostRows, sumMovements, usdGbpRate, usdToPence,
  type DateRange, type NetMrrMovement, type AiCostRow,
} from './analyticsMetrics.js';

const DAY = 86400000;

/** Latest known state of every subscription strictly before $1. */
const LATEST_STATE = `
  SELECT DISTINCT ON (stripe_subscription_id)
         stripe_subscription_id, user_id, COALESCE(tier, 'unknown') AS tier, status, mrr_pence
  FROM billing_events
  WHERE stripe_subscription_id IS NOT NULL AND mrr_pence IS NOT NULL AND occurred_at < $1
  ORDER BY stripe_subscription_id, occurred_at DESC, id DESC`;

const AI_CALL_FILTER = `(api_type ILIKE '%ai%' OR COALESCE(tokens_used, 0) > 0)`;

export interface AnalyticsSummary {
  from: string; to: string; currency: 'gbp';
  signups: number; trialStarts: number; trialConversions: number; trialToPaidPct: number;
  paidConversions: number; mrrPence: number; arrPence: number; activePaid: number;
  churnPct: number; netMrrMovement: NetMrrMovement;
  dau: number; wau: number; mau: number;
  aiCostPence: number; aiCostToMrrPct: number;
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function getSummary(db: Queryable, range: DateRange): Promise<AnalyticsSummary> {
  const { from, to } = range;
  const [signups, typeCounts, churned, startState, endState, moves, active, aiCost] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT user_id AS id FROM auth_events WHERE type = 'user.created' AND occurred_at >= $1 AND occurred_at < $2
         UNION SELECT id FROM crypto_users WHERE created_at >= $1 AND created_at < $2) s`, [from, to]),
    db.query(
      `SELECT type, COUNT(DISTINCT COALESCE(stripe_subscription_id, stripe_event_id)) AS c FROM billing_events
       WHERE occurred_at >= $1 AND occurred_at < $2
         AND type IN ('trial_started','trial_converted','first_payment')
       GROUP BY type`, [from, to]),
    db.query(
      `SELECT COUNT(DISTINCT stripe_subscription_id) AS c FROM billing_events
       WHERE type = 'subscription_canceled' AND occurred_at >= $1 AND occurred_at < $2
         AND (mrr_pence - COALESCE(mrr_delta_pence, 0)) > 0`, [from, to]),
    db.query(`SELECT COUNT(*) AS c FROM (${LATEST_STATE}) s WHERE mrr_pence > 0`, [from]),
    db.query(`SELECT COUNT(*) FILTER (WHERE mrr_pence > 0) AS paid, COALESCE(SUM(mrr_pence), 0) AS mrr FROM (${LATEST_STATE}) s`, [to]),
    db.query(
      `SELECT mrr_pence - mrr_delta_pence AS prev, mrr_pence AS next FROM billing_events
       WHERE occurred_at >= $1 AND occurred_at < $2 AND mrr_pence IS NOT NULL
         AND mrr_delta_pence IS NOT NULL AND mrr_delta_pence <> 0`, [from, to]),
    db.query(
      `SELECT COUNT(DISTINCT user_id) FILTER (WHERE created_at >= $1::timestamptz - interval '1 day') AS dau,
              COUNT(DISTINCT user_id) FILTER (WHERE created_at >= $1::timestamptz - interval '7 days') AS wau,
              COUNT(DISTINCT user_id) AS mau
       FROM analytics_events
       WHERE user_id IS NOT NULL AND created_at >= $1::timestamptz - interval '30 days' AND created_at < $1`, [to]),
    db.query(
      `SELECT COALESCE(SUM(estimated_cost), 0) AS usd FROM api_usage_log
       WHERE created_at >= $1 AND created_at < $2`, [from, to]),
  ]);

  const byType: Record<string, number> = {};
  for (const r of typeCounts.rows) byType[r.type] = n(r.c);
  const trialStarts = byType.trial_started ?? 0;
  const trialConversions = byType.trial_converted ?? 0;
  const mrrPence = n(endState.rows[0]?.mrr);
  const days = Math.max(1, (to.getTime() - from.getTime()) / DAY);
  const aiCostPence = usdToPence(n(aiCost.rows[0]?.usd), usdGbpRate());
  const aiMonthly = Math.round((aiCostPence / days) * 30);

  return {
    from: from.toISOString(), to: to.toISOString(), currency: 'gbp',
    signups: n(signups.rows[0]?.c),
    trialStarts,
    trialConversions,
    trialToPaidPct: pct(trialConversions, trialStarts),
    paidConversions: trialConversions + (byType.first_payment ?? 0),
    mrrPence,
    arrPence: mrrPence * 12,
    activePaid: n(endState.rows[0]?.paid),
    churnPct: churnPct(n(churned.rows[0]?.c), n(startState.rows[0]?.c)),
    netMrrMovement: sumMovements(moves.rows.map((r: any) => ({ prev: n(r.prev), next: n(r.next) }))),
    dau: n(active.rows[0]?.dau), wau: n(active.rows[0]?.wau), mau: n(active.rows[0]?.mau),
    aiCostPence,
    aiCostToMrrPct: pct(aiMonthly, mrrPence),
  };
}

export type Metric = 'signups' | 'mrr' | 'active' | 'ai_cost';
export type Interval = 'day' | 'week';
export interface TimeseriesPoint { date: string; value: number; byTier?: Record<string, number> }

export function parseMetric(v: unknown): Metric | null {
  return v === 'signups' || v === 'mrr' || v === 'active' || v === 'ai_cost' ? v : null;
}
export function parseInterval(v: unknown): Interval { return v === 'week' ? 'week' : 'day'; }

export async function getTimeseries(db: Queryable, metric: Metric, interval: Interval, range: DateRange): Promise<TimeseriesPoint[]> {
  const params = [range.from, range.to, interval];
  const series = `SELECT generate_series(date_trunc($3, $1::timestamptz), date_trunc($3, $2::timestamptz), ('1 ' || $3)::interval) AS bucket`;
  let sql: string;
  switch (metric) {
    case 'signups':
      sql = `WITH s AS (${series}), u AS (
               SELECT id, MIN(t) AS t FROM (
                 SELECT user_id AS id, occurred_at AS t FROM auth_events WHERE type = 'user.created' AND user_id IS NOT NULL
                 UNION ALL SELECT id, created_at FROM crypto_users) x
               WHERE t >= $1 AND t < $2 GROUP BY id)
             SELECT s.bucket, COUNT(u.id) AS value FROM s
             LEFT JOIN u ON date_trunc($3, u.t) = s.bucket GROUP BY s.bucket ORDER BY s.bucket`;
      break;
    case 'mrr':
      // MRR is a level, so a weekly point is the last snapshot in that week.
      sql = `WITH s AS (${series}), d AS (
               SELECT date, SUM(mrr_pence) AS total, jsonb_object_agg(tier, mrr_pence) AS by_tier
               FROM subscription_snapshots_daily WHERE date >= $1::date AND date <= $2::date GROUP BY date),
             w AS (SELECT DISTINCT ON (date_trunc($3, date::timestamptz)) date_trunc($3, date::timestamptz) AS bucket, total, by_tier
                   FROM d ORDER BY date_trunc($3, date::timestamptz), date DESC)
             SELECT s.bucket, COALESCE(w.total, 0) AS value, w.by_tier FROM s LEFT JOIN w ON w.bucket = s.bucket ORDER BY s.bucket`;
      break;
    case 'active':
      sql = interval === 'day'
        ? `WITH s AS (${series}), d AS (SELECT date_trunc('day', date) AS bucket, MAX(unique_users) AS v FROM analytics_daily_stats
                 WHERE date >= date_trunc('day', $1::timestamptz) AND date < $2 GROUP BY 1)
           SELECT s.bucket, COALESCE(d.v, 0) AS value FROM s LEFT JOIN d ON d.bucket = s.bucket ORDER BY s.bucket`
        : `WITH s AS (${series}), d AS (SELECT date_trunc('week', created_at) AS bucket, COUNT(DISTINCT user_id) AS v FROM analytics_events
                 WHERE user_id IS NOT NULL AND created_at >= date_trunc('week', $1::timestamptz) AND created_at < $2 GROUP BY 1)
           SELECT s.bucket, COALESCE(d.v, 0) AS value FROM s LEFT JOIN d ON d.bucket = s.bucket ORDER BY s.bucket`;
      break;
    case 'ai_cost':
      sql = `WITH s AS (${series}), d AS (SELECT date_trunc($3, date) AS bucket, SUM(estimated_ai_cost) AS v FROM analytics_daily_stats
               WHERE date >= date_trunc($3, $1::timestamptz) AND date < $2 GROUP BY 1)
             SELECT s.bucket, COALESCE(d.v, 0) AS value FROM s LEFT JOIN d ON d.bucket = s.bucket ORDER BY s.bucket`;
      break;
  }
  const r = await db.query(sql, params);
  const rate = usdGbpRate();
  return r.rows.map((row: any) => {
    const date = new Date(row.bucket).toISOString().slice(0, 10);
    const value = metric === 'ai_cost' ? usdToPence(n(row.value), rate) : n(row.value);
    const point: TimeseriesPoint = { date, value };
    if (metric === 'mrr' && row.by_tier) {
      point.byTier = Object.fromEntries(Object.entries(row.by_tier as Record<string, unknown>).map(([k, v]) => [k, n(v)]));
    }
    return point;
  });
}

export interface TierMixRow { tier: string; count: number; trialing: number; mrrPence: number }

export async function getTiers(db: Queryable, now: Date = new Date()): Promise<{ tiers: TierMixRow[]; elliottAddon: { count: number; mrrPence: number }; totalUsers: number }> {
  const [counts, users, mrr, elliott] = await Promise.all([
    db.query(
      `SELECT CASE WHEN subscription_status IN ('active','trialing','past_due') THEN tier ELSE 'free' END AS tier,
              COUNT(*) AS c, COUNT(*) FILTER (WHERE subscription_status = 'trialing') AS trialing
       FROM crypto_subscriptions GROUP BY 1`),
    db.query(`SELECT COUNT(*) AS c FROM crypto_users`),
    db.query(`SELECT tier, COALESCE(SUM(mrr_pence), 0) AS mrr FROM (${LATEST_STATE}) s GROUP BY tier`, [now]),
    db.query(`SELECT COUNT(*) AS c FROM crypto_subscriptions WHERE has_elliott_addon = true`),
  ]);
  const map = new Map<string, TierMixRow>();
  for (const t of ALL_TIERS) map.set(t, { tier: t, count: 0, trialing: 0, mrrPence: 0 });
  let withRow = 0;
  for (const r of counts.rows) {
    const t = String(r.tier ?? 'free');
    const row = map.get(t) ?? { tier: t, count: 0, trialing: 0, mrrPence: 0 };
    row.count += n(r.c); row.trialing += n(r.trialing); withRow += n(r.c);
    map.set(t, row);
  }
  const totalUsers = n(users.rows[0]?.c);
  // Users with no crypto_subscriptions row are on the free tier.
  map.get('free')!.count += Math.max(0, totalUsers - withRow);
  let elliottMrr = 0;
  for (const r of mrr.rows) {
    if (r.tier === 'elliott_addon') { elliottMrr += n(r.mrr); continue; }
    const row = map.get(r.tier) ?? { tier: r.tier, count: 0, trialing: 0, mrrPence: 0 };
    row.mrrPence += n(r.mrr);
    map.set(r.tier, row);
  }
  return { tiers: [...map.values()], elliottAddon: { count: n(elliott.rows[0]?.c), mrrPence: elliottMrr }, totalUsers };
}

export async function getAiCost(db: Queryable, opts: { range: DateRange; limit?: unknown; sort?: unknown; now?: Date }): Promise<{ rows: AiCostRow[]; usdGbpRate: number }> {
  const limit = clampInt(opts.limit, 50, 1, 500);
  const r = await db.query(
    `WITH usage AS (
       SELECT user_id, COALESCE(SUM(tokens_used), 0) AS tokens, COUNT(*) FILTER (WHERE ${AI_CALL_FILTER}) AS calls,
              COALESCE(SUM(estimated_cost), 0) AS cost
       FROM api_usage_log WHERE user_id IS NOT NULL AND created_at >= $1 AND created_at < $2
       GROUP BY user_id ORDER BY cost DESC LIMIT 500),
     rev AS (SELECT user_id, SUM(mrr_pence) AS mrr FROM (${LATEST_STATE.replace('$1', '$3')}) s GROUP BY user_id)
     SELECT u.user_id, cu.email, cs.tier, u.tokens, u.calls, u.cost, COALESCE(rev.mrr, 0) AS revenue
     FROM usage u
     LEFT JOIN crypto_users cu ON cu.id = u.user_id
     LEFT JOIN crypto_subscriptions cs ON cs.user_id = u.user_id
     LEFT JOIN rev ON rev.user_id = u.user_id`,
    [opts.range.from, opts.range.to, opts.now ?? new Date()]);
  const rate = usdGbpRate();
  const rows = r.rows.map((row: any) => buildAiCostRow({
    userId: String(row.user_id), email: row.email ?? null, tier: row.tier ?? 'free',
    tokens: n(row.tokens), calls: n(row.calls), costUsd: n(row.cost), revenuePence: n(row.revenue),
  }, rate));
  return { rows: sortAiCostRows(rows, typeof opts.sort === 'string' ? opts.sort : undefined).slice(0, limit), usdGbpRate: rate };
}

/** Fill subscription_snapshots_daily and analytics_daily_stats for one UTC day. */
export async function runDailyRollup(db: Queryable, day: Date): Promise<{ date: string; tiers: number }> {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start.getTime() + DAY);
  const date = start.toISOString().slice(0, 10);

  const [state, churn] = await Promise.all([
    db.query(
      `SELECT tier,
              COUNT(*) FILTER (WHERE status IN ('active','past_due') AND mrr_pence > 0) AS active,
              COUNT(*) FILTER (WHERE status = 'trialing') AS trialing,
              COALESCE(SUM(mrr_pence), 0) AS mrr
       FROM (${LATEST_STATE}) s GROUP BY tier`, [end]),
    db.query(
      `SELECT COALESCE(tier, 'unknown') AS tier, COUNT(DISTINCT stripe_subscription_id) AS c FROM billing_events
       WHERE type = 'subscription_canceled' AND occurred_at >= $1 AND occurred_at < $2 GROUP BY 1`, [start, end]),
  ]);
  const rows = new Map<string, { active: number; trialing: number; mrr: number; churned: number }>();
  for (const t of ALL_TIERS) rows.set(t, { active: 0, trialing: 0, mrr: 0, churned: 0 });
  for (const r of state.rows) rows.set(r.tier, { ...(rows.get(r.tier) ?? { churned: 0 }), active: n(r.active), trialing: n(r.trialing), mrr: n(r.mrr) } as any);
  for (const r of churn.rows) {
    const v = rows.get(r.tier) ?? { active: 0, trialing: 0, mrr: 0, churned: 0 };
    v.churned = n(r.c); rows.set(r.tier, v);
  }
  for (const [tier, v] of rows) {
    await db.query(
      `INSERT INTO subscription_snapshots_daily (date, tier, active_count, trialing_count, mrr_pence, churned_count, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (date, tier) DO UPDATE SET active_count = EXCLUDED.active_count, trialing_count = EXCLUDED.trialing_count,
         mrr_pence = EXCLUDED.mrr_pence, churned_count = EXCLUDED.churned_count, updated_at = NOW()`,
      [date, tier, v.active, v.trialing, v.mrr, v.churned]);
  }

  const ev = await db.query(
    `SELECT COUNT(*) FILTER (WHERE event_type = 'page_view') AS views,
            COUNT(DISTINCT user_id) AS users,
            COUNT(*) FILTER (WHERE event_type = 'click') AS clicks
     FROM analytics_events WHERE created_at >= $1 AND created_at < $2`, [start, end]);
  const api = await db.query(
    `SELECT COUNT(*) AS calls, COUNT(*) FILTER (WHERE ${AI_CALL_FILTER}) AS ai_calls,
            COALESCE(SUM(tokens_used), 0) AS tokens, COALESCE(SUM(estimated_cost), 0) AS cost
     FROM api_usage_log WHERE created_at >= $1 AND created_at < $2`, [start, end]);
  const tierBreakdown = Object.fromEntries([...rows].map(([t, v]) => [t, v.active]));
  const vals = [n(ev.rows[0]?.views), n(ev.rows[0]?.users), n(ev.rows[0]?.clicks), n(api.rows[0]?.calls),
    n(api.rows[0]?.ai_calls), n(api.rows[0]?.tokens), n(api.rows[0]?.cost), JSON.stringify(tierBreakdown), start];
  // analytics_daily_stats has no unique key on date, so update first and insert if missing.
  const upd = await db.query(
    `UPDATE analytics_daily_stats SET total_page_views=$1, unique_users=$2, total_clicks=$3, total_api_calls=$4,
       total_ai_calls=$5, total_ai_tokens=$6, estimated_ai_cost=$7, tier_breakdown=$8
     WHERE date = $9`, vals);
  if ((upd.rowCount ?? 0) === 0) {
    await db.query(
      `INSERT INTO analytics_daily_stats (total_page_views, unique_users, total_clicks, total_api_calls,
         total_ai_calls, total_ai_tokens, estimated_ai_cost, tier_breakdown, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, vals);
  }
  return { date, tiers: rows.size };
}

export type AnalyticsView = 'summary' | 'timeseries' | 'tiers' | 'ai-cost';

/** Shared dispatcher used by the Vercel function and the Express dev route. */
export async function handleAnalyticsView(db: Queryable, view: string, query: Record<string, unknown>, range: DateRange):
  Promise<{ status: number; body: unknown }> {
  switch (view) {
    case 'summary': return { status: 200, body: await getSummary(db, range) };
    case 'timeseries': {
      const metric = parseMetric(query.metric);
      if (!metric) return { status: 400, body: { error: 'metric must be signups, mrr, active or ai_cost' } };
      return { status: 200, body: await getTimeseries(db, metric, parseInterval(query.interval), range) };
    }
    case 'tiers': return { status: 200, body: await getTiers(db) };
    case 'ai-cost': return { status: 200, body: await getAiCost(db, { range, limit: query.limit, sort: query.sort }) };
    default: return { status: 404, body: { error: 'Unknown analytics view' } };
  }
}

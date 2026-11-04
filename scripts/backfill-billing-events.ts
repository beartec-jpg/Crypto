/**
 * One-off backfill for the admin analytics page.
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... npx tsx scripts/backfill-billing-events.ts [--days 90] [--dry-run]
 *
 * Pulls Stripe subscriptions and paid invoices, writes synthetic billing_events
 * (ids prefixed `backfill:` so re-runs are no-ops and real webhook ids never
 * collide), then rolls up subscription_snapshots_daily for the last N days.
 * Only inserts; never updates or deletes existing billing rows.
 */
import Stripe from 'stripe';
import pg from 'pg';
import { billingEventFromStripe, insertBillingEvent } from '../api/_lib/billingEvents';
import { runDailyRollup } from '../api/_lib/adminAnalytics';
import { lifecycleEvents, synthetic } from '../api/_lib/billingBackfill';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysIdx = args.indexOf('--days');
const days = daysIdx >= 0 ? Math.max(1, parseInt(args[daysIdx + 1], 10) || 90) : 90;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !process.env.DATABASE_URL) throw new Error('STRIPE_SECRET_KEY and DATABASE_URL must be set');
  const stripe = new Stripe(key, { apiVersion: '2023-10-16' as any });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  let seen = 0; let inserted = 0;
  const handle = async (ev: any) => {
    const row = billingEventFromStripe(ev);
    if (!row) return;
    seen++;
    if (!dryRun && await insertBillingEvent(pool, row)) inserted++;
  };

  for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    for (const ev of lifecycleEvents(sub)) await handle(ev);
  }
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  for await (const inv of stripe.invoices.list({ status: 'paid', limit: 100, created: { gte: since } })) {
    await handle(synthetic(`backfill:invoice:${inv.id}`, 'invoice.paid', inv.status_transitions?.paid_at ?? inv.created, inv));
  }
  console.log(`billing events: ${seen} mapped, ${inserted} inserted${dryRun ? ' (dry run)' : ''}`);

  if (!dryRun) {
    for (let i = days; i >= 0; i--) await runDailyRollup(pool, new Date(Date.now() - i * 86400000));
    console.log(`rolled up ${days + 1} days`);
  }
  await pool.end();
}

if (process.argv[1] && /backfill-billing-events/.test(process.argv[1])) {
  main().catch((err) => { console.error(err?.message ?? err); process.exit(1); });
}

/**
 * Append-only billing event log for the admin analytics page.
 * Rows are written from the Stripe webhook and the backfill script and are
 * deduplicated on stripe_event_id, so replaying a webhook adds nothing.
 */
import { subscriptionMrrPence, type SubscriptionLike } from './analyticsMetrics.js';
import { tierFromSubscription as sharedTierFromSubscription } from '../../shared/stripeTiers.js';

export interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface BillingEventRow {
  userId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeEventId: string;
  type: string;
  status: string | null;
  tier: string | null;
  amountPence: number | null;
  currency: string | null;
  /** MRR of the subscription after this event; null for non-state events (invoices). */
  mrrPence: number | null;
  occurredAt: Date;
  raw: Record<string, unknown>;
}

export const TRACKED_STRIPE_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.paid',
  'invoice.payment_failed',
]);

function idOf(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'id' in (v as any)) return String((v as any).id);
  return null;
}

function tierFromSubscription(sub: any): string | null {
  return sharedTierFromSubscription(sub);
}

/** Keep raw small: ids, amounts and statuses only, no card or address data. */
function slimRaw(eventType: string, obj: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event: eventType,
    object: obj?.object ?? null,
    id: obj?.id ?? null,
    status: obj?.status ?? null,
    billing_reason: obj?.billing_reason ?? null,
    cancel_at_period_end: obj?.cancel_at_period_end ?? null,
    trial_end: obj?.trial_end ?? null,
    ...extra,
  };
}

/**
 * Map a Stripe event to a billing_events row. Returns null for events that
 * are not tracked. Pure apart from reading the event, so it is unit tested.
 */
export function billingEventFromStripe(event: any): BillingEventRow | null {
  if (!event?.id || !TRACKED_STRIPE_EVENTS.has(event.type)) return null;
  const obj = event.data?.object ?? {};
  const prev = event.data?.previous_attributes ?? {};
  const occurredAt = new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000);
  const base = {
    stripeEventId: String(event.id),
    occurredAt,
    userId: obj?.metadata?.userId ? String(obj.metadata.userId) : null,
    stripeCustomerId: idOf(obj.customer),
  };

  switch (event.type) {
    case 'checkout.session.completed':
      return {
        ...base,
        stripeSubscriptionId: idOf(obj.subscription),
        type: 'checkout_completed',
        status: obj.payment_status ?? null,
        tier: obj?.metadata?.tier ?? (obj?.metadata?.type === 'elliott_addon' ? 'elliott_addon' : null),
        amountPence: typeof obj.amount_total === 'number' ? obj.amount_total : null,
        currency: obj.currency ?? null,
        mrrPence: null,
        raw: slimRaw(event.type, obj, { checkout_type: obj?.metadata?.type ?? null }),
      };
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.trial_will_end': {
      const sub = obj as SubscriptionLike & any;
      let type = 'subscription_updated';
      if (event.type === 'customer.subscription.created') type = sub.status === 'trialing' ? 'trial_started' : 'subscription_created';
      else if (event.type === 'customer.subscription.deleted') type = 'subscription_canceled';
      else if (event.type === 'customer.subscription.trial_will_end') type = 'trial_will_end';
      else if (prev.status === 'trialing' && sub.status === 'active') type = 'trial_converted';
      else if (prev.status && prev.status !== 'trialing' && sub.status === 'trialing') type = 'trial_started';
      else if (sub.status === 'canceled') type = 'subscription_canceled';
      const mrr = event.type === 'customer.subscription.deleted' ? 0 : subscriptionMrrPence(sub);
      const firstItem = sub.items?.data?.[0];
      return {
        ...base,
        stripeSubscriptionId: sub.id ?? null,
        type,
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : (sub.status ?? null),
        tier: tierFromSubscription(sub),
        amountPence: null,
        currency: firstItem?.price?.currency ?? (sub as any).currency ?? null,
        mrrPence: mrr,
        raw: slimRaw(event.type, sub, { previous_status: prev.status ?? null }),
      };
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const paid = event.type === 'invoice.paid';
      const amount = paid ? obj.amount_paid : obj.amount_due;
      const first = paid && obj.billing_reason === 'subscription_create' && (obj.amount_paid ?? 0) > 0;
      return {
        ...base,
        userId: base.userId ?? (obj?.subscription_details?.metadata?.userId ?? null),
        stripeSubscriptionId: idOf(obj.subscription),
        type: paid ? (first ? 'first_payment' : 'invoice_paid') : 'invoice_payment_failed',
        status: obj.status ?? null,
        tier: obj?.subscription_details?.metadata?.tier ?? null,
        amountPence: typeof amount === 'number' ? amount : null,
        currency: obj.currency ?? null,
        mrrPence: null,
        raw: slimRaw(event.type, obj),
      };
    }
  }
  return null;
}

/** Fill in user_id / tier from our own tables when Stripe metadata lacks them. */
async function resolveUser(db: Queryable, row: BillingEventRow): Promise<BillingEventRow> {
  if (row.userId && row.tier) return row;
  let userId = row.userId;
  let tier = row.tier;
  if (row.stripeSubscriptionId) {
    const r = await db.query(
      `SELECT user_id, tier FROM crypto_subscriptions WHERE stripe_subscription_id = $1 LIMIT 1`,
      [row.stripeSubscriptionId],
    );
    if (r.rows[0]) { userId = userId ?? r.rows[0].user_id; tier = tier ?? r.rows[0].tier; }
  }
  if (!userId && row.stripeCustomerId) {
    const r = await db.query(`SELECT id FROM crypto_users WHERE stripe_customer_id = $1 LIMIT 1`, [row.stripeCustomerId]);
    if (r.rows[0]) userId = r.rows[0].id;
  }
  if (!tier && userId) {
    const r = await db.query(`SELECT tier FROM crypto_subscriptions WHERE user_id = $1 LIMIT 1`, [userId]);
    if (r.rows[0]) tier = r.rows[0].tier;
  }
  return { ...row, userId, tier };
}

/**
 * Insert one billing event. mrr_delta_pence is computed against the latest
 * earlier state of the same subscription. Returns true if a row was inserted,
 * false if it was a duplicate.
 */
export async function insertBillingEvent(db: Queryable, input: BillingEventRow): Promise<boolean> {
  const row = await resolveUser(db, input);
  let delta: number | null = null;
  if (row.mrrPence !== null && row.stripeSubscriptionId) {
    const prev = await db.query(
      `SELECT mrr_pence FROM billing_events
       WHERE stripe_subscription_id = $1 AND mrr_pence IS NOT NULL AND occurred_at <= $2
         AND stripe_event_id <> $3
       ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [row.stripeSubscriptionId, row.occurredAt, row.stripeEventId],
    );
    delta = row.mrrPence - Number(prev.rows[0]?.mrr_pence ?? 0);
  }
  const res = await db.query(
    `INSERT INTO billing_events
       (user_id, stripe_customer_id, stripe_subscription_id, stripe_event_id, type, status, tier,
        amount_pence, currency, mrr_pence, mrr_delta_pence, occurred_at, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (stripe_event_id) DO NOTHING`,
    [row.userId, row.stripeCustomerId, row.stripeSubscriptionId, row.stripeEventId, row.type, row.status,
      row.tier, row.amountPence, row.currency ? row.currency.toLowerCase() : null, row.mrrPence, delta,
      row.occurredAt, JSON.stringify(row.raw)],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Webhook entry point: never throws, so billing processing is unaffected. */
export async function recordStripeEvent(db: Queryable, event: any): Promise<void> {
  try {
    const row = billingEventFromStripe(event);
    if (row) await insertBillingEvent(db, row);
  } catch (err: any) {
    console.error('billing_events insert failed:', err?.message ?? 'unknown error');
  }
}

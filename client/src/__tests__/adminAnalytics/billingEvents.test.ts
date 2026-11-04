import { describe, expect, it } from 'vitest';
import { billingEventFromStripe, insertBillingEvent, recordStripeEvent, type Queryable } from '../../../../api/_lib/billingEvents';
import { lifecycleEvents } from '../../../../api/_lib/billingBackfill';

const sub = (over: any = {}) => ({
  id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'active', metadata: { userId: 'user_1', tier: 'pro' },
  items: { data: [{ quantity: 1, price: { unit_amount: 2900, currency: 'gbp', recurring: { interval: 'month', interval_count: 1 } } }] },
  ...over,
});
const ev = (id: string, type: string, object: any, created = 1_790_000_000, previous: any = {}) =>
  ({ id, type, created, data: { object, previous_attributes: previous } });

/** In-memory billing_events + lookup tables, matched on SQL shape. */
function fakeDb(): Queryable & { rows: any[] } {
  const rows: any[] = [];
  return {
    rows,
    async query(text: string, params: any[] = []) {
      if (text.includes('FROM crypto_subscriptions') || text.includes('FROM crypto_users')) return { rows: [] };
      if (text.startsWith('SELECT mrr_pence FROM billing_events')) {
        const [subId, at, evId] = params;
        const prev = rows.filter((r) => r.stripe_subscription_id === subId && r.mrr_pence !== null && r.occurred_at <= at && r.stripe_event_id !== evId)
          .sort((a, b) => b.occurred_at - a.occurred_at)[0];
        return { rows: prev ? [prev] : [] };
      }
      if (text.includes('INSERT INTO billing_events')) {
        if (rows.some((r) => r.stripe_event_id === params[3])) return { rows: [], rowCount: 0 };
        rows.push({ user_id: params[0], stripe_subscription_id: params[2], stripe_event_id: params[3], type: params[4],
          tier: params[6], mrr_pence: params[9], mrr_delta_pence: params[10], occurred_at: params[11] });
        return { rows: [], rowCount: 1 };
      }
      throw new Error('unexpected sql: ' + text);
    },
  };
}

describe('billingEventFromStripe', () => {
  it('ignores untracked events', () => {
    expect(billingEventFromStripe(ev('evt_x', 'charge.refunded', {}))).toBeNull();
    expect(billingEventFromStripe(null)).toBeNull();
  });
  it('detects trial start on created+trialing and conversion on update', () => {
    expect(billingEventFromStripe(ev('e1', 'customer.subscription.created', sub({ status: 'trialing' })))!)
      .toMatchObject({ type: 'trial_started', mrrPence: 0, tier: 'pro', userId: 'user_1', stripeSubscriptionId: 'sub_1' });
    expect(billingEventFromStripe(ev('e2', 'customer.subscription.updated', sub(), 1, { status: 'trialing' }))!)
      .toMatchObject({ type: 'trial_converted', mrrPence: 2900, currency: 'gbp' });
    expect(billingEventFromStripe(ev('e3', 'customer.subscription.trial_will_end', sub({ status: 'trialing' })))!.type).toBe('trial_will_end');
  });
  it('maps deletion to zero MRR and invoices to amounts', () => {
    expect(billingEventFromStripe(ev('e4', 'customer.subscription.deleted', sub({ status: 'canceled' })))!)
      .toMatchObject({ type: 'subscription_canceled', status: 'canceled', mrrPence: 0 });
    expect(billingEventFromStripe(ev('e5', 'invoice.paid', { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', amount_paid: 2900, currency: 'gbp', billing_reason: 'subscription_create' }))!)
      .toMatchObject({ type: 'first_payment', amountPence: 2900, mrrPence: null });
    expect(billingEventFromStripe(ev('e6', 'invoice.paid', { id: 'in_2', amount_paid: 2900, billing_reason: 'subscription_cycle' }))!.type).toBe('invoice_paid');
    expect(billingEventFromStripe(ev('e7', 'invoice.payment_failed', { id: 'in_3', amount_due: 2900 }))!)
      .toMatchObject({ type: 'invoice_payment_failed', amountPence: 2900 });
    expect(billingEventFromStripe(ev('e8', 'checkout.session.completed', { id: 'cs_1', subscription: 'sub_1', amount_total: 2900, currency: 'gbp', metadata: { userId: 'u', tier: 'pro', type: 'base_tier' } }))!)
      .toMatchObject({ type: 'checkout_completed', tier: 'pro', amountPence: 2900 });
  });
  it('keeps raw small (no customer details)', () => {
    const row = billingEventFromStripe(ev('e9', 'invoice.paid', { id: 'in', customer_email: 'x@y.z', customer_address: { line1: 'a' }, amount_paid: 1 }))!;
    expect(JSON.stringify(row.raw)).not.toContain('x@y.z');
  });
});

describe('insertBillingEvent', () => {
  it('is idempotent on stripe event id', async () => {
    const db = fakeDb();
    const e = ev('evt_dup', 'customer.subscription.created', sub());
    await recordStripeEvent(db, e);
    await recordStripeEvent(db, e);
    expect(db.rows).toHaveLength(1);
  });
  it('computes MRR delta against the previous state', async () => {
    const db = fakeDb();
    await insertBillingEvent(db, billingEventFromStripe(ev('a', 'customer.subscription.created', sub(), 100))!);
    const up = sub({ items: { data: [{ quantity: 1, price: { unit_amount: 9900, recurring: { interval: 'month' } } }] } });
    await insertBillingEvent(db, billingEventFromStripe(ev('b', 'customer.subscription.updated', up, 200))!);
    await insertBillingEvent(db, billingEventFromStripe(ev('c', 'customer.subscription.deleted', up, 300))!);
    expect(db.rows.map((r) => r.mrr_delta_pence)).toEqual([2900, 7000, -9900]);
  });
  it('never throws from the webhook path', async () => {
    const broken: Queryable = { query: async () => { throw new Error('db down'); } };
    await expect(recordStripeEvent(broken, ev('z', 'customer.subscription.created', sub()))).resolves.toBeUndefined();
  });
});

describe('backfill lifecycle', () => {
  it('builds created, trial conversion and cancel events with stable ids', () => {
    const evs = lifecycleEvents(sub({ status: 'canceled', start_date: 100, trial_start: 100, trial_end: 200, ended_at: 300 }));
    expect(evs.map((e) => e.id)).toEqual(['backfill:created:sub_1', 'backfill:trial_converted:sub_1', 'backfill:canceled:sub_1']);
    const mapped = evs.map((e) => billingEventFromStripe(e)!);
    expect(mapped.map((m) => m.type)).toEqual(['trial_started', 'trial_converted', 'subscription_canceled']);
    expect(mapped.map((m) => m.mrrPence)).toEqual([0, 2900, 0]);
  });
});

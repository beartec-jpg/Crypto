/** Synthetic Stripe-shaped events used by scripts/backfill-billing-events.ts. */

export function synthetic(id: string, type: string, created: number, object: any, previous: any = {}) {
  return { id, type, created, data: { object, previous_attributes: previous } };
}

/** Synthetic lifecycle for one subscription, oldest first. */
export function lifecycleEvents(sub: any): any[] {
  const out: any[] = [];
  const created = sub.start_date ?? sub.created;
  const wasTrial = Boolean(sub.trial_start);
  out.push(synthetic(`backfill:created:${sub.id}`, 'customer.subscription.created', created,
    { ...sub, status: wasTrial ? 'trialing' : 'active' }));
  if (wasTrial && sub.trial_end && sub.status !== 'trialing' && sub.trial_end * 1000 <= Date.now()) {
    out.push(synthetic(`backfill:trial_converted:${sub.id}`, 'customer.subscription.updated', sub.trial_end,
      { ...sub, status: 'active' }, { status: 'trialing' }));
  }
  const endedAt = sub.ended_at ?? sub.canceled_at;
  if (sub.status === 'canceled' && endedAt) {
    out.push(synthetic(`backfill:canceled:${sub.id}`, 'customer.subscription.deleted', endedAt, sub));
  } else if (sub.status !== 'active' && sub.status !== 'trialing') {
    out.push(synthetic(`backfill:status:${sub.id}:${sub.status}`, 'customer.subscription.updated',
      Math.floor(Date.now() / 1000) - 1, sub, { status: 'active' }));
  }
  return out;
}


/**
 * Pure helpers for the admin analytics page. No DB or network access here so
 * the maths can be unit tested directly.
 */

export const PAID_TIERS = ['beginner', 'intermediate', 'pro', 'elite'] as const;
export const ALL_TIERS = ['free', ...PAID_TIERS] as const;

/** Product names used in Stripe, same map as api/stripe/webhook.ts. */
export const PRODUCT_NAME_TO_TIER: Record<string, string> = {
  'Beginner membership': 'beginner',
  'Intermediate membership': 'intermediate',
  'Pro membership': 'pro',
  'Elite membership': 'elite',
};

export interface PriceLike {
  unit_amount?: number | null;
  recurring?: { interval?: string | null; interval_count?: number | null } | null;
}

/** Normalise a recurring price amount (minor units) to a monthly amount. */
export function monthlyAmountPence(unitAmount: number, interval: string | null | undefined, intervalCount = 1): number {
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) return 0;
  const count = intervalCount && intervalCount > 0 ? intervalCount : 1;
  switch (interval) {
    case 'day': return Math.round((unitAmount * 365) / 12 / count);
    case 'week': return Math.round((unitAmount * 52) / 12 / count);
    case 'month': return Math.round(unitAmount / count);
    case 'year': return Math.round(unitAmount / 12 / count);
    default: return 0; // one-off prices do not count toward MRR
  }
}

export interface SubscriptionLike {
  status?: string | null;
  items?: { data?: Array<{ quantity?: number | null; price?: PriceLike | null; plan?: { amount?: number | null; interval?: string | null; interval_count?: number | null } | null }> } | null;
  discount?: { coupon?: { percent_off?: number | null } | null } | null;
}

/** States that count toward MRR (trialing is excluded: no revenue yet). */
export function statusCountsForMrr(status: string | null | undefined): boolean {
  return status === 'active' || status === 'past_due';
}

/** Monthly recurring revenue of one Stripe subscription in pence. */
export function subscriptionMrrPence(sub: SubscriptionLike): number {
  if (!statusCountsForMrr(sub.status)) return 0;
  let total = 0;
  for (const item of sub.items?.data ?? []) {
    const qty = item.quantity ?? 1;
    const unit = item.price?.unit_amount ?? item.plan?.amount ?? 0;
    const interval = item.price?.recurring?.interval ?? item.plan?.interval ?? null;
    const count = item.price?.recurring?.interval_count ?? item.plan?.interval_count ?? 1;
    total += monthlyAmountPence(unit ?? 0, interval, count ?? 1) * qty;
  }
  const pct = sub.discount?.coupon?.percent_off;
  if (pct && pct > 0) total = Math.round(total * (1 - pct / 100));
  return total;
}

export type MovementKind = 'new' | 'expansion' | 'contraction' | 'churn' | 'none';

/** Classify an MRR change between two states of the same subscription. */
export function classifyMovement(prevMrr: number, nextMrr: number): MovementKind {
  if (prevMrr === nextMrr) return 'none';
  if (prevMrr <= 0 && nextMrr > 0) return 'new';
  if (prevMrr > 0 && nextMrr <= 0) return 'churn';
  return nextMrr > prevMrr ? 'expansion' : 'contraction';
}

export interface NetMrrMovement { new: number; expansion: number; contraction: number; churn: number }

export function sumMovements(changes: Array<{ prev: number; next: number }>): NetMrrMovement {
  const out: NetMrrMovement = { new: 0, expansion: 0, contraction: 0, churn: 0 };
  for (const { prev, next } of changes) {
    const kind = classifyMovement(prev, next);
    if (kind === 'none') continue;
    out[kind] += next - prev;
  }
  return out;
}

/** Percentage helper that returns 0 for an empty denominator, rounded to 2 dp. */
export function pct(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/** churn = subscriptions that moved to canceled in period ÷ active paid at period start. */
export function churnPct(canceledInPeriod: number, activePaidAtStart: number): number {
  return pct(canceledInPeriod, activePaidAtStart);
}

export interface DateRange { from: Date; to: Date }

const MAX_RANGE_DAYS = 400;

/** Parse ?from&to (ISO dates). Defaults to the last 30 days. */
export function parseRange(from: unknown, to: unknown, now: Date = new Date()): DateRange {
  const toDate = typeof to === 'string' && to ? new Date(to) : now;
  const end = Number.isNaN(toDate.getTime()) ? now : toDate;
  const fromDate = typeof from === 'string' && from ? new Date(from) : new Date(end.getTime() - 30 * 86400000);
  let start = Number.isNaN(fromDate.getTime()) ? new Date(end.getTime() - 30 * 86400000) : fromDate;
  if (start > end) start = new Date(end.getTime() - 30 * 86400000);
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86400000) {
    start = new Date(end.getTime() - MAX_RANGE_DAYS * 86400000);
  }
  return { from: start, to: end };
}

/** Convert USD (api_usage_log.estimated_cost) to pence using USD_GBP_RATE. */
export function usdToPence(usd: number, rate: number): number {
  if (!Number.isFinite(usd)) return 0;
  return Math.round(usd * rate * 100);
}

export function usdGbpRate(): number {
  const r = Number(process.env.USD_GBP_RATE);
  return Number.isFinite(r) && r > 0 ? r : 0.79;
}

export interface AiCostRowInput {
  userId: string;
  email: string | null;
  tier: string | null;
  tokens: number;
  calls: number;
  costUsd: number;
  revenuePence: number;
}

export interface AiCostRow extends AiCostRowInput {
  costPence: number;
  marginPence: number;
  flagged: boolean;
}

/** Margin = revenue − AI cost. Flagged when cost is over 50% of revenue. */
export function buildAiCostRow(input: AiCostRowInput, rate: number): AiCostRow {
  const costPence = usdToPence(input.costUsd, rate);
  const marginPence = input.revenuePence - costPence;
  const flagged = costPence > 0 && costPence > input.revenuePence * 0.5;
  return { ...input, costPence, marginPence, flagged };
}

export type AiCostSort = 'cost' | 'tokens' | 'calls' | 'margin' | 'revenue';

export function sortAiCostRows(rows: AiCostRow[], sort: string | undefined): AiCostRow[] {
  const key: AiCostSort = (['cost', 'tokens', 'calls', 'margin', 'revenue'] as const).includes(sort as AiCostSort)
    ? (sort as AiCostSort) : 'cost';
  const val = (r: AiCostRow) => key === 'cost' ? r.costPence : key === 'tokens' ? r.tokens
    : key === 'calls' ? r.calls : key === 'revenue' ? r.revenuePence : r.marginPence;
  // margin sorts ascending (worst first), the rest descending
  return [...rows].sort((a, b) => key === 'margin' ? val(a) - val(b) : val(b) - val(a));
}

export function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** RFC 4180-ish CSV with a guard against spreadsheet formula injection. */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0 && !columns) return '';
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

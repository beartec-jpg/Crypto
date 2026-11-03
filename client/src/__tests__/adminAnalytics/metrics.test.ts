import { describe, expect, it } from 'vitest';
import {
  buildAiCostRow, churnPct, classifyMovement, clampInt, monthlyAmountPence, parseRange, pct,
  sortAiCostRows, subscriptionMrrPence, sumMovements, toCsv, usdToPence,
} from '../../../../api/_lib/analyticsMetrics';
import { isAdminEmail } from '../../../../api/_lib/adminAuth';

describe('MRR normalisation', () => {
  it('normalises intervals to monthly pence', () => {
    expect(monthlyAmountPence(1999, 'month')).toBe(1999);
    expect(monthlyAmountPence(12000, 'year')).toBe(1000);
    expect(monthlyAmountPence(3000, 'month', 3)).toBe(1000);
    expect(monthlyAmountPence(100, 'week')).toBe(433);
    expect(monthlyAmountPence(10, 'day')).toBe(304);
    expect(monthlyAmountPence(500, null)).toBe(0);
    expect(monthlyAmountPence(-5, 'month')).toBe(0);
  });

  it('sums items × quantity and ignores non-paying states', () => {
    const items = { data: [
      { quantity: 1, price: { unit_amount: 2900, recurring: { interval: 'month', interval_count: 1 } } },
      { quantity: 2, price: { unit_amount: 12000, recurring: { interval: 'year', interval_count: 1 } } },
    ] };
    expect(subscriptionMrrPence({ status: 'active', items })).toBe(2900 + 2000);
    expect(subscriptionMrrPence({ status: 'past_due', items })).toBe(4900);
    expect(subscriptionMrrPence({ status: 'trialing', items })).toBe(0);
    expect(subscriptionMrrPence({ status: 'canceled', items })).toBe(0);
  });

  it('applies percent-off discounts and legacy plan fields', () => {
    expect(subscriptionMrrPence({ status: 'active', discount: { coupon: { percent_off: 50 } },
      items: { data: [{ plan: { amount: 1000, interval: 'month', interval_count: 1 } }] } })).toBe(500);
  });
});

describe('movement, churn and conversion maths', () => {
  it('classifies movements', () => {
    expect(classifyMovement(0, 1000)).toBe('new');
    expect(classifyMovement(1000, 2000)).toBe('expansion');
    expect(classifyMovement(2000, 1000)).toBe('contraction');
    expect(classifyMovement(1000, 0)).toBe('churn');
    expect(classifyMovement(1000, 1000)).toBe('none');
  });
  it('sums signed movements', () => {
    expect(sumMovements([{ prev: 0, next: 1000 }, { prev: 1000, next: 1500 }, { prev: 1500, next: 1200 }, { prev: 900, next: 0 }]))
      .toEqual({ new: 1000, expansion: 500, contraction: -300, churn: -900 });
  });
  it('computes churn and pct safely', () => {
    expect(churnPct(2, 40)).toBe(5);
    expect(churnPct(3, 0)).toBe(0);
    expect(pct(1, 3)).toBe(33.33);
  });
});

describe('ranges and params', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  it('defaults to 30 days and fixes bad input', () => {
    const r = parseRange(undefined, undefined, now);
    expect(r.to).toEqual(now);
    expect(now.getTime() - r.from.getTime()).toBe(30 * 86400000);
    const bad = parseRange('nope', 'x', now);
    expect(bad.to).toEqual(now);
    const swapped = parseRange('2026-12-01', '2026-11-01', now);
    expect(swapped.from < swapped.to).toBe(true);
  });
  it('caps very long ranges', () => {
    const r = parseRange('2000-01-01', '2026-11-03', now);
    expect((r.to.getTime() - r.from.getTime()) / 86400000).toBe(400);
  });
  it('clamps ints', () => {
    expect(clampInt('9999', 50, 1, 500)).toBe(500);
    expect(clampInt('abc', 50, 1, 500)).toBe(50);
    expect(clampInt(undefined, 50, 1, 500)).toBe(50);
  });
});

describe('AI cost rows', () => {
  it('computes margin in pence and flags cost over 50% of revenue', () => {
    const base = { userId: 'u', email: null, tier: 'pro', tokens: 10, calls: 1 };
    expect(usdToPence(1, 0.8)).toBe(80);
    const ok = buildAiCostRow({ ...base, costUsd: 1, revenuePence: 2900 }, 0.8);
    expect(ok).toMatchObject({ costPence: 80, marginPence: 2820, flagged: false });
    const hot = buildAiCostRow({ ...base, costUsd: 20, revenuePence: 2900 }, 0.8);
    expect(hot.flagged).toBe(true);
    const free = buildAiCostRow({ ...base, costUsd: 0.5, revenuePence: 0 }, 0.8);
    expect(free.flagged).toBe(true);
    expect(buildAiCostRow({ ...base, costUsd: 0, revenuePence: 0 }, 0.8).flagged).toBe(false);
  });
  it('sorts by cost desc by default and margin asc', () => {
    const mk = (id: string, costUsd: number, revenuePence: number) =>
      buildAiCostRow({ userId: id, email: null, tier: null, tokens: 0, calls: 0, costUsd, revenuePence }, 1);
    const rows = [mk('a', 1, 5000), mk('b', 5, 100), mk('c', 2, 0)];
    expect(sortAiCostRows(rows, undefined).map((r) => r.userId)).toEqual(['b', 'c', 'a']);
    expect(sortAiCostRows(rows, 'margin').map((r) => r.userId)).toEqual(['b', 'c', 'a']);
    expect(sortAiCostRows(rows, 'revenue').map((r) => r.userId)).toEqual(['a', 'b', 'c']);
  });
});

describe('csv and admin rule', () => {
  it('escapes and neutralises formulas', () => {
    expect(toCsv([{ a: 'x,y', b: '=SUM(A1)', c: -5 }], ['a', 'b', 'c'])).toBe('a,b,c\n"x,y",\'=SUM(A1),-5');
  });
  it('matches the existing admin email rule', () => {
    expect(isAdminEmail('beartec@beartec.uk')).toBe(true);
    expect(isAdminEmail('scott@beartec.uk')).toBe(true);
    expect(isAdminEmail('someone@gmail.com')).toBe(false);
    expect(isAdminEmail('beartec.uk@evil.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

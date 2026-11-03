import { describe, expect, it } from 'vitest';
import { buildFunnel, formatGbp, formatPct, presetRange, toCsv } from '@/lib/adminAnalytics';

describe('admin analytics client helpers', () => {
  it('formats GBP from pence', () => {
    expect(formatGbp(2900)).toBe('£29.00');
    expect(formatGbp(1234500)).toBe('£12,345');
    expect(formatPct(4.236)).toBe('4.2%');
  });
  it('builds preset ranges', () => {
    const now = new Date('2026-11-03T00:00:00Z');
    expect(presetRange('7d', now).from).toBe('2026-10-27T00:00:00.000Z');
    expect(presetRange('90d', now).to).toBe(now.toISOString());
  });
  it('builds the funnel with step conversion', () => {
    expect(buildFunnel(100, 20, 5)).toEqual([
      { label: 'Sign-ups', value: 100, pctOfPrev: null },
      { label: 'Trial starts', value: 20, pctOfPrev: 20 },
      { label: 'Paid', value: 5, pctOfPrev: 25 },
    ]);
    expect(buildFunnel(0, 0, 0)[2].pctOfPrev).toBe(0);
  });
  it('csv guards formulas', () => {
    expect(toCsv([{ e: '@cmd' }], ['e'])).toBe("e\n'@cmd");
  });
});

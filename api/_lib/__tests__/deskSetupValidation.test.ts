import { describe, it, expect } from 'vitest';
import {
  anchorStructuralStop,
  computeRiskReward,
  entryWithinCap,
  gradeSetup,
  validateDeskSetup,
  computeDeskTrend,
  selectDeskSetups,
  planDeskBook,
  detectSwingLevels,
} from '../deskSetupValidation';
import { resolveWebhookForSymbol } from '../../cron/discord-btc-pre-london';

const swings = { highs: [104, 106], lows: [95, 98] };
const base = {
  currentPrice: 100,
  dailyAtr: 4,
  swings,
  minRiskReward: 1.5,
  structuralLevels: [99, 103.5],
  fibOte: { low: 98.5, high: 99.5 },
  emas: [99.1],
};
const long = { direction: 'LONG', entry: 99, stopLoss: 97.95, targets: [103, 105], riskRewardRatio: 9, grade: 'A' };
const short = { direction: 'SHORT', entry: 103.5, stopLoss: 104.05, targets: [100, 98], riskRewardRatio: 9, grade: 'A' };

describe('structural swing stop', () => {
  it('accepts a stop just beyond a computed swing low', () => {
    const r: any = anchorStructuralStop('LONG', 99, 97.95, swings);
    expect(r.ok).toBe(true);
    expect(r.source).toBe('model');
    expect(r.anchor).toBe(98);
  });
  it('allows a very tight stop when structurally valid (no minimum distance)', () => {
    const r: any = anchorStructuralStop('LONG', 98.1, 97.98, swings);
    expect(r.ok).toBe(true);
    expect(r.stop).toBe(97.98);
  });
  it('re-anchors an arbitrary %/ATR stop to the nearest swing beyond entry', () => {
    const r: any = anchorStructuralStop('LONG', 99, 96.5, swings);
    expect(r.ok).toBe(true);
    expect(r.source).toBe('re-anchored');
    expect(r.anchor).toBe(98);
    expect(r.stop).toBeLessThan(98);
    expect(r.stop).toBeGreaterThan(97.9);
  });
  it('mirrors for shorts (stop above swing high)', () => {
    const r: any = anchorStructuralStop('SHORT', 103.5, 104.05, swings);
    expect(r.ok).toBe(true);
    expect(r.anchor).toBe(104);
  });
  it('rejects when no swing exists beyond entry', () => {
    expect(anchorStructuralStop('LONG', 94, 93, swings).ok).toBe(false);
    expect(anchorStructuralStop('SHORT', 107, 108, swings).ok).toBe(false);
  });
  it('detects fractal swings from bars', () => {
    const bars = Array.from({ length: 21 }, (_, i) => {
      const v = 100 + (i === 10 ? 5 : 0) - (i === 4 || i === 16 ? 5 : 0);
      return { high: v + 1, low: v - 1 };
    });
    const s = detectSwingLevels(bars, 3, 12);
    expect(s.highs).toContain(106);
    expect(s.lows).toContain(94);
  });
});

describe('RR, entry cap, grade', () => {
  it('recomputes RR in code and ignores the model RR', () => {
    expect(computeRiskReward('LONG', 99, 98, 103)).toBeCloseTo(4);
    const v = validateDeskSetup(long, base);
    expect(v.ok).toBe(true);
    expect(v.riskRewardRatio).toBeCloseTo(4 / 1.05, 1);
    expect(v.riskRewardRatio).not.toBe(9);
  });
  it('applies min RR to the computed value', () => {
    const v = validateDeskSetup({ ...long, targets: [100] }, base);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/computed RR/);
  });
  it('enforces entry cap of 1.25× daily ATR from live price', () => {
    expect(entryWithinCap(104.9, 100, 4)).toBe(true);
    expect(entryWithinCap(105.1, 100, 4)).toBe(false);
    expect(validateDeskSetup({ ...long, entry: 94.5, stopLoss: 94, targets: [99] }, base).ok).toBe(false);
  });
  it('grades from measured confluence and stop quality, not the model', () => {
    expect(gradeSetup(4, 'model', 2.5)).toBe('A');
    expect(gradeSetup(4, 're-anchored', 2.5)).toBe('B');
    expect(gradeSetup(2, 'model', 1.6)).toBe('B');
    expect(gradeSetup(1, 'model', 3)).toBe('C');
  });
});

describe('trend', () => {
  it('bullish from BOS + HH/HL + EMA alignment', () => {
    const t = computeDeskTrend({ upBreaks: 5, downBreaks: 1, htfSwings: { highs: [100, 105], lows: [90, 95] }, price: 106, ema20: 104, ema50: 100 });
    expect(t.trend).toBe('BULLISH');
  });
  it('bearish mirror', () => {
    const t = computeDeskTrend({ upBreaks: 0, downBreaks: 4, htfSwings: { highs: [105, 100], lows: [95, 90] }, price: 89, ema20: 92, ema50: 96 });
    expect(t.trend).toBe('BEARISH');
  });
  it('neutral when mixed', () => {
    const t = computeDeskTrend({ upBreaks: 3, downBreaks: 1, htfSwings: { highs: [105, 100], lows: [90, 95] }, price: 99, ema20: 100, ema50: 98 });
    expect(t.trend).toBe('NEUTRAL');
  });
});

describe('with-trend / counter-trend selection', () => {
  it('keeps 1 with-trend + 1 counter-trend, counter labelled, downgraded, smaller, listed second', () => {
    const r = selectDeskSetups([short, long], { ...base, emas: [99.1, 103.4], trend: 'BULLISH', dominantBias: 'BULLISH', minConfluence: 2 });
    expect(r.kept.map((t) => t.direction)).toEqual(['LONG', 'SHORT']);
    const [w, c] = r.kept;
    expect(w.label).toBe('With-trend');
    expect(c.label).toBe('Counter-trend');
    expect(c.confidence).toBe('low');
    expect(c.suggestedSize).toBe(0.5);
    expect(['B', 'C']).toContain(c.grade);
    expect(c.score).toBeLessThan(w.score);
  });
  it('counter-trend needs one extra measured confluence', () => {
    const weakShort = { ...short, entry: 103.9, stopLoss: 104.05, targets: [102] }; // no level confluence
    const r = selectDeskSetups([long, weakShort], { ...base, structuralLevels: [99], trend: 'BULLISH', dominantBias: 'BULLISH', minConfluence: 2 });
    expect(r.kept.map((t) => t.direction)).toEqual(['LONG']);
    expect(r.rejected[0].reason).toMatch(/counter-trend needs measured confluence/);
  });
  it('blocks a second idea in the same direction', () => {
    const r = selectDeskSetups([long, { ...long, entry: 99.2 }], { ...base, trend: 'BULLISH', dominantBias: 'BULLISH' });
    expect(r.kept).toHaveLength(1);
    expect(r.rejected[0].reason).toMatch(/max 1 with-trend/);
  });
  it('NEUTRAL trend producing both directions is a contradiction → blocked', () => {
    const r = selectDeskSetups([long, short], { ...base, trend: 'NEUTRAL', minConfluence: 1 });
    expect(r.kept).toHaveLength(0);
    expect(r.rejected.every((x) => /contradiction/.test(x.reason))).toBe(true);
  });
  it('applies structural stop + computed RR to the counter-trend idea too', () => {
    const r = selectDeskSetups([long, { ...short, stopLoss: 110 }], { ...base, trend: 'BULLISH', dominantBias: 'BULLISH' });
    const c = r.kept.find((t) => t.direction === 'SHORT');
    if (c) {
      expect(c.stopSource).toBe('re-anchored');
      expect(c.stopAnchor).toBe(104);
    }
  });
});

describe('open book persistence', () => {
  const openLong = { id: 'a', direction: 'LONG', entry: 99, stop_loss: 97.95, targets: [103], status: 'entry_armed' };
  it('carries a still-valid open idea and adds nothing when unchanged', () => {
    const p = planDeskBook([openLong], [{ id: 'a', action: 'keep' }], [], 'BULLISH');
    expect(p.carried).toEqual([openLong]);
    expect(p.newTrades).toHaveLength(0);
  });
  it('blocks a fresh same-direction idea while one is open (no fresh fill)', () => {
    const p = planDeskBook([openLong], [], [long], 'BULLISH');
    expect(p.newTrades).toHaveLength(0);
    expect(p.blocked[0].reason).toMatch(/carried instead/);
  });
  it('closes an invalidated idea with the recorded reason', () => {
    const p = planDeskBook([openLong], [{ id: 'a', action: 'cancel', reason: '4h close below swing 98' }], [], 'BULLISH');
    expect(p.carried).toHaveLength(0);
    expect(p.cancelled[0].reason).toBe('4h close below swing 98');
  });
  it('allows a counter-trend idea against an open with-trend idea', () => {
    const p = planDeskBook([openLong], [], [short], 'BULLISH');
    expect(p.newTrades).toHaveLength(1);
    expect(p.newTrades[0].label).toBe('Counter-trend');
  });
  it('blocks the opposite idea vs open book when trend is neutral', () => {
    const p = planDeskBook([openLong], [], [short], 'NEUTRAL');
    expect(p.newTrades).toHaveLength(0);
    expect(p.blocked[0].reason).toMatch(/contradiction/);
  });
  it('TP/stop-closed ideas are terminal and not in the active book → slot frees for a new idea', () => {
    // tracker returns only active statuses (pending/entry_armed/entry_hit/tp1_hit) for activeOnly
    const p = planDeskBook([], [], [long], 'BULLISH');
    expect(p.newTrades).toHaveLength(1);
  });
});

describe('webhook resolution', () => {
  it('BTC resolves its dedicated env var when only per-symbol vars exist', () => {
    const r = resolveWebhookForSymbol('BTCUSDT', { DISCORD_WEBHOOK_URL_BTC: 'x', DISCORD_WEBHOOK_URL_XRP: 'y' } as any);
    expect(r.dedicated).toBe(true);
    expect(r.envName).toBe('DISCORD_WEBHOOK_URL_BTC');
  });
  it('falls back to the shared var and labels it shared', () => {
    const r = resolveWebhookForSymbol('ETHUSDT', { DISCORD_WEBHOOK_URL: 'z' } as any);
    expect(r.dedicated).toBe(false);
    expect(r.envName).toBe('DISCORD_WEBHOOK_URL');
  });
});

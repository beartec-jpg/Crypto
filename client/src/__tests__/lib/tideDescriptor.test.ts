// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { describe, it, expect } from 'vitest';
import { buildTideDescriptor, type TideDescriptorInput } from '@/lib/tideDescriptor';
import type { TideZonePoint } from '@/lib/indicators/tideZone';

function pt(over: Partial<TideZonePoint> = {}): TideZonePoint {
  return { time: 1, score: 56, tide: 0.96, energy: 0.7, tape: 0.75, kind: 'follow_buy', ...over };
}

function desc(over: Partial<TideDescriptorInput> = {}) {
  return buildTideDescriptor({
    last: pt(),
    timeframe: '1h',
    crossEma: 'short',
    emaPeriod: 8,
    emaValue: 54,
    ...over,
  });
}

describe('buildTideDescriptor', () => {
  it('returns Tide-off copy when there is no last point', () => {
    const off = buildTideDescriptor(null);
    expect(off.headline).toBe('Tide off');
    expect(off.showingNow).toMatch(/1h and 4h/);
    expect(buildTideDescriptor({ last: null }).headline).toBe('Tide off');
  });

  it('describes the score and the EMA below the histogram', () => {
    const d = desc();
    expect(d.headline).toBe('Up tide — with the 4h');
    expect(d.color).toBe('text-emerald-400');
    expect(d.showingNow).toContain('Score is +56');
    expect(d.showingNow).toContain('T 96 · E 70 · Tp 75');
    expect(d.showingNow).toContain('The short EMA (8) is +54, below the histogram');
    expect(d.showingNow).toContain('Chart 1h');
    expect(d.watch).toMatch(/Tide in = the EMA crosses below/);
  });

  it('names the long EMA when it drives the cross, and says above', () => {
    const d = desc({ crossEma: 'long', emaPeriod: 21, emaValue: 60 });
    expect(d.showingNow).toContain('The long EMA (21) is +60, above the histogram');
  });

  it('leads with a fresh Tide in / Tide out', () => {
    const i = desc({ fresh: 'in', last: pt({ score: -50, kind: 'sell' }), emaValue: -52 });
    expect(i.headline).toBe('Tide in · Down tide');
    expect(i.showingNow).toContain('Tide in just printed');
    const o = desc({ fresh: 'out' });
    expect(o.headline).toBe('Tide out · Up tide — with the 4h');
    expect(o.showingNow).toContain('Tide out just printed');
  });

  it('colours by zone', () => {
    expect(desc({ last: pt({ kind: 'bounce_buy' }) }).color).toBe('text-amber-400');
    expect(desc({ last: pt({ kind: 'sell', score: -50 }) }).color).toBe('text-red-400');
    expect(desc({ last: pt({ kind: 'neutral', score: 3 }) }).color).toBe('text-slate-400');
  });
});

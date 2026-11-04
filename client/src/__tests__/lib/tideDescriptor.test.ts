// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { describe, it, expect } from 'vitest';
import { buildTideDescriptor, type TideDescriptorInput } from '@/lib/tideDescriptor';
import type { TideZonePoint } from '@/lib/indicators/tideZone';

function pt(over: Partial<TideZonePoint> = {}): TideZonePoint {
  return {
    time: 1,
    score: 56,
    tide: 0.96,
    energy: 0.7,
    tape: 0.75,
    kind: 'follow_buy',
    tell: null,
    ...over,
  };
}

function desc(over: Partial<TideDescriptorInput> = {}) {
  return buildTideDescriptor({ last: pt(), timeframe: '1h', emaPeriod: 21, emaValue: 54, ...over });
}

describe('buildTideDescriptor', () => {
  it('returns Tide-off copy when there is no last point', () => {
    const off = buildTideDescriptor(null);
    expect(off.headline).toBe('Tide off');
    expect(off.color).toBe('text-slate-400');
    expect(off.showingNow).toMatch(/1h and 4h/);
    expect(off.watch).toMatch(/Switch to 1h or 4h/);
    expect(buildTideDescriptor({ last: null }).headline).toBe('Tide off');
  });

  it('describes an up-tide aligned with HTF and EMA', () => {
    const d = desc();
    expect(d.headline).toBe('Up tide — with the 4h');
    expect(d.color).toBe('text-emerald-400');
    expect(d.showingNow).toContain('Score is +56');
    expect(d.showingNow).toContain('T 96 · E 70 · Tp 75');
    expect(d.showingNow).toContain('Higher-timeframe tide is up and this hist is aligned with it');
    expect(d.showingNow).toContain('EMA21 is +54, agreeing with this bar');
    expect(d.showingNow).toContain('Chart 1h');
    expect(d.watch).toMatch(/location, not a buy/);
    expect(d.watch).toMatch(/Tide-out/);
  });

  it('describes a down-tide aligned with HTF', () => {
    const d = desc({
      last: pt({ score: -48, tide: 0.22, energy: 0.4, tape: 0.3, kind: 'sell' }),
      emaValue: -44,
    });
    expect(d.headline).toBe('Down tide');
    expect(d.color).toBe('text-red-400');
    expect(d.showingNow).toContain('Score is -48');
    expect(d.showingNow).toContain('Higher-timeframe tide is down and this hist is aligned with it');
    expect(d.watch).toMatch(/not an automatic short/);
    expect(d.watch).toMatch(/Do not buy the washout/);
  });

  it('flags a bounce versus a down 4h tide', () => {
    const d = desc({
      last: pt({ score: 22, tide: 0.3, energy: 0.8, tape: 0.6, kind: 'bounce_buy' }),
      emaValue: 18,
    });
    expect(d.headline).toBe('Bounce vs down tide');
    expect(d.color).toBe('text-amber-400');
    expect(d.showingNow).toContain('leaning against it (bounce/repair)');
    expect(d.watch).toMatch(/not a new up-tide/);
  });

  it('calls out hist vs EMA disagreement', () => {
    const d = desc({ last: pt({ score: 50 }), emaPeriod: 8, emaValue: -12 });
    expect(d.showingNow).toContain('EMA8 is -12, so the smoothed hist has not confirmed this bar yet');
  });

  it('calls out hist leaning against an up HTF tide', () => {
    const d = desc({
      last: pt({ score: -8, tide: 0.8, kind: 'neutral' }),
      emaValue: -6,
    });
    expect(d.headline).toBe('No tide');
    expect(d.showingNow).toContain('Higher-timeframe tide is up, but this hist is leaning against it');
    expect(d.watch).toMatch(/No strong tide/);
  });

  it('mentions mixed HTF when tide is mid-range', () => {
    const d = desc({
      last: pt({ score: 5, tide: 0.5, kind: 'neutral' }),
      emaValue: 3,
    });
    expect(d.showingNow).toContain('Higher-timeframe tide is mixed');
  });

  it('leads with Tide out and describes the print', () => {
    const d = desc({ fresh: 'out', activeStop: 91.4, openCount: 1 });
    expect(d.headline).toBe('Tide out · Up tide — with the 4h');
    expect(d.showingNow).toContain('A Tide-out just printed');
    expect(d.showingNow).toContain('Open Tide-out stop 91.4');
    expect(d.watch).toMatch(/long trigger/);
    expect(d.watch).toMatch(/exit on Tide-in/);
  });

  it('tags Tide out + with the RSI quality note', () => {
    const d = desc({
      last: pt({ score: -52, tide: 0.2, kind: 'sell' }),
      fresh: 'out_plus',
      emaValue: -48,
    });
    expect(d.headline).toBe('Tide out + · Down tide');
    expect(d.showingNow).toContain('Tide-out + just printed');
    expect(d.showingNow).toContain('RSI(14) was under 30');
    expect(d.watch).toMatch(/quality tag/);
  });

  it('describes Tide-in as the exit', () => {
    const d = desc({ fresh: 'in' });
    expect(d.headline).toBe('Tide in · Up tide — with the 4h');
    expect(d.showingNow).toContain('Tide-in just printed');
    expect(d.watch).toMatch(/do not treat the next green bar as a new entry/);
  });

  it('describes a stop hit', () => {
    const d = desc({
      last: pt({ score: -41, tide: 0.2, kind: 'sell' }),
      fresh: 'stop',
      emaValue: -30,
    });
    expect(d.headline).toBe('Stop hit · Down tide');
    expect(d.showingNow).toContain('stop under the Tide-out low was just hit');
    expect(d.watch).toMatch(/Wait for a fresh Tide-out/);
  });

  it('prefixes absorb / distro / reacc tells', () => {
    expect(desc({ last: pt({ tell: 'absorb' }) }).headline).toMatch(/^Absorb ·/);
    expect(desc({ last: pt({ tell: 'absorb' }) }).showingNow).toMatch(/Absorb: price was flat/);
    expect(desc({ last: pt({ tell: 'absorb' }) }).watch).toMatch(/not a reason to chase/);

    expect(desc({ last: pt({ tell: 'distro' }) }).headline).toMatch(/^Distro ·/);
    expect(desc({ last: pt({ tell: 'distro' }) }).showingNow).toMatch(/open interest is flushing/);

    expect(desc({ last: pt({ tell: 'reacc' }) }).headline).toMatch(/^Reacc ·/);
    expect(desc({ last: pt({ tell: 'reacc' }) }).showingNow).toMatch(/book is not leaving/);
  });

  it('honours absorb/distro/reacc flags even if last.tell is null', () => {
    expect(desc({ absorb: true }).headline).toMatch(/^Absorb ·/);
    expect(desc({ distro: true }).headline).toMatch(/^Distro ·/);
    expect(desc({ reacc: true }).headline).toMatch(/^Reacc ·/);
  });

  it('names the 4h chart when that is the timeframe', () => {
    const d = desc({ timeframe: '4h', emaPeriod: 8, emaValue: 54 });
    expect(d.showingNow).toContain('Chart 4h');
    expect(d.showingNow).toContain('EMA8 is +54');
  });
});

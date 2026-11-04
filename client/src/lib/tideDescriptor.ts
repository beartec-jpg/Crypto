// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import type { TideZoneKind, TideZonePoint, TideZoneTell } from '@/lib/indicators/tideZone';
import { tideZoneLabel } from '@/lib/indicators/tideZone';
import type { TideTimeframe } from '@/lib/indicators/tideSignals';

export type TideDescriptorFresh = 'out' | 'out_plus' | 'in' | 'stop' | null;

export type TideDescriptorInput = {
  last?: TideZonePoint | null;
  timeframe?: TideTimeframe | null;
  emaPeriod?: number;
  emaValue?: number;
  fresh?: TideDescriptorFresh;
  activeStop?: number | null;
  openCount?: number;
  absorb?: boolean;
  distro?: boolean;
  reacc?: boolean;
};

export type TideDescriptor = {
  headline: string;
  color: string;
  showingNow: string;
  watch: string;
};

function pct(v: number): number {
  return Math.round(v * 100);
}

function fmtScore(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : `${r}`;
}

function fmtPrice(p: number): string {
  return p >= 100 ? p.toFixed(1) : p.toPrecision(5);
}

function zoneColor(kind: TideZoneKind): string {
  if (kind === 'follow_buy') return 'text-emerald-400';
  if (kind === 'bounce_buy') return 'text-amber-400';
  if (kind === 'sell') return 'text-red-400';
  return 'text-slate-400';
}

function htfBias(tide: number): 'up' | 'down' | 'mixed' {
  if (tide >= 0.55) return 'up';
  if (tide <= 0.45) return 'down';
  return 'mixed';
}

function histVsHtf(score: number, tide: number): 'with' | 'against' | 'mixed' {
  const h = htfBias(tide);
  if (h === 'mixed') return 'mixed';
  const histUp = score > 0;
  if (h === 'up') return histUp ? 'with' : 'against';
  return histUp ? 'against' : 'with';
}

function emaAgrees(score: number, emaValue: number): boolean {
  return score >= 0 === emaValue >= 0;
}

function tellOf(input: TideDescriptorInput, last: TideZonePoint): TideZoneTell {
  if (input.absorb || last.tell === 'absorb') return 'absorb';
  if (input.distro || last.tell === 'distro') return 'distro';
  if (input.reacc || last.tell === 'reacc') return 'reacc';
  return last.tell ?? null;
}

const OFF: TideDescriptor = {
  headline: 'Tide off',
  color: 'text-slate-400',
  showingNow: 'Tide Zone only runs on 1h and 4h charts. This timeframe has no live score.',
  watch: 'Switch to 1h or 4h to read the tide, Tide-out / Tide-in prints, and the hist EMA.',
};

/**
 * Plain-English Tide Zone readout for the oscillators card (status + what it is
 * showing now + what to watch). Pure: no I/O, no React.
 */
export function buildTideDescriptor(input: TideDescriptorInput | null | undefined): TideDescriptor {
  if (!input?.last) return OFF;

  const last = input.last;
  const { score, kind, tide, energy, tape } = last;
  const fresh = input.fresh ?? null;
  const tell = tellOf(input, last);
  const htf = htfBias(tide);
  const align = histVsHtf(score, tide);
  const tf = input.timeframe ?? null;

  const bits: string[] = [];
  if (tell === 'absorb') bits.push('Absorb');
  else if (tell === 'distro') bits.push('Distro');
  else if (tell === 'reacc') bits.push('Reacc');
  if (fresh === 'out') bits.push('Tide out');
  else if (fresh === 'out_plus') bits.push('Tide out +');
  else if (fresh === 'in') bits.push('Tide in');
  else if (fresh === 'stop') bits.push('Stop hit');
  bits.push(tideZoneLabel(kind));
  const headline = bits.join(' · ');

  const parts: string[] = [
    `Score is ${fmtScore(score)} (${tideZoneLabel(kind)}). T ${pct(tide)} · E ${pct(energy)} · Tp ${pct(tape)}.`,
  ];

  if (htf === 'up') {
    parts.push(
      align === 'with'
        ? 'Higher-timeframe tide is up and this hist is aligned with it.'
        : 'Higher-timeframe tide is up, but this hist is leaning against it.',
    );
  } else if (htf === 'down') {
    parts.push(
      align === 'with'
        ? 'Higher-timeframe tide is down and this hist is aligned with it.'
        : 'Higher-timeframe tide is down, but this hist is leaning against it (bounce/repair).',
    );
  } else {
    parts.push('Higher-timeframe tide is mixed — no strong 4h location.');
  }

  const emaPeriod = input.emaPeriod;
  const emaValue = input.emaValue;
  if (emaPeriod != null && emaValue != null && Number.isFinite(emaValue)) {
    parts.push(
      emaAgrees(score, emaValue)
        ? `EMA${emaPeriod} is ${fmtScore(emaValue)}, agreeing with this bar.`
        : `EMA${emaPeriod} is ${fmtScore(emaValue)}, so the smoothed hist has not confirmed this bar yet.`,
    );
  }

  if (tf) parts.push(`Chart ${tf}.`);

  if (fresh === 'out') {
    parts.push('A Tide-out just printed (price lower-low vs Tide-EMA higher-low under the threshold).');
  } else if (fresh === 'out_plus') {
    parts.push(
      'A Tide-out + just printed: RSI(14) was under 30 between the pivot low and the confirm bar.',
    );
  } else if (fresh === 'in') {
    parts.push('Tide-in just printed — that is the exit for the open Tide-out.');
  } else if (fresh === 'stop') {
    parts.push('The stop under the Tide-out low was just hit.');
  }

  if (tell === 'absorb') {
    parts.push('Absorb: price was flat or down while the Tide EMA rose — demand under the candles, not a breakout.');
  } else if (tell === 'distro') {
    parts.push('Distro watch: open interest is flushing at a local high — leverage leaving, not a confirmed short.');
  } else if (tell === 'reacc') {
    parts.push('Reacc watch: still in an up-tide at a high and the book is not leaving.');
  }

  if (input.activeStop != null && (input.openCount ?? 0) > 0) {
    parts.push(`Open Tide-out stop ${fmtPrice(input.activeStop)}.`);
  }

  let watch: string;
  if (fresh === 'out' || fresh === 'out_plus') {
    watch =
      'Tide-out is the long trigger, not the green zone. Keep the stop under the pivot low; exit on Tide-in or if the stop is hit.';
    if (fresh === 'out_plus') {
      watch +=
        ' Tide-out + tagged RSI(14) under 30 on the way here — treat it as a quality tag, not a filter you must wait for.';
    }
  } else if (fresh === 'in') {
    watch = 'Tide-in is the exit. Close or trail; do not treat the next green bar as a new entry.';
  } else if (fresh === 'stop') {
    watch =
      'The stop under the Tide-out low was hit. Wait for a fresh Tide-out; do not re-enter just because the hist is still red.';
  } else if (kind === 'bounce_buy') {
    watch =
      'This is a bounce versus a down 4h tide, not a new up-tide. Take it as a counter-trend bounce and still watch for Tide-in as the exit.';
  } else if (kind === 'sell') {
    watch =
      'A red −40 print is down-tide location, not an automatic short. Do not buy the washout. Wait for Tide-out under the threshold, or a bounce-vs-down-tide print with high energy.';
  } else if (kind === 'follow_buy') {
    watch =
      'This is location, not a buy. Ignore 1–2 bar flips while the EMA stays with the 4h. The long trigger is Tide-out; Tide-in (amber) is the exit.';
  } else {
    watch =
      'No strong tide. Wait for the hist and its EMA to hold above +40 (with the 4h) or below −40 (down tide) before treating location as real.';
  }

  if (tell === 'absorb' && fresh == null) {
    watch += ' Absorb is demand under the candles — not a reason to chase a breakout.';
  }

  return {
    headline,
    color: zoneColor(kind),
    showingNow: parts.join(' '),
    watch,
  };
}

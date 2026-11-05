// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import type { TideZoneKind, TideZonePoint } from '@/lib/indicators/tideZone';
import { tideZoneLabel } from '@/lib/indicators/tideZone';
import type { TideCrossDriver, TideCrossKind, TideTimeframe } from '@/lib/indicators/tideSignals';

export type TideDescriptorInput = {
  last?: TideZonePoint | null;
  timeframe?: TideTimeframe | null;
  /** The EMA that drives the cross, and its latest value. */
  crossEma?: TideCrossDriver;
  emaPeriod?: number;
  emaValue?: number;
  /** A Tide in / Tide out printed on one of the last few closed bars. */
  fresh?: TideCrossKind | null;
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

function zoneColor(kind: TideZoneKind): string {
  if (kind === 'follow_buy') return 'text-emerald-400';
  if (kind === 'bounce_buy') return 'text-amber-400';
  if (kind === 'sell') return 'text-red-400';
  return 'text-slate-400';
}

const OFF: TideDescriptor = {
  headline: 'Tide off',
  color: 'text-slate-400',
  showingNow: 'Tide Zone only runs on 1h and 4h charts. This timeframe has no live score.',
  watch: 'Switch to 1h or 4h to read the tide score and its Tide in / Tide out crosses.',
};

/** Plain-English Tide Zone readout (status, what it shows now, what to watch). Pure. */
export function buildTideDescriptor(input: TideDescriptorInput | null | undefined): TideDescriptor {
  if (!input?.last) return OFF;
  const { score, kind, tide, energy, tape } = input.last;
  const fresh = input.fresh ?? null;

  const headline = [fresh === 'in' ? 'Tide in' : fresh === 'out' ? 'Tide out' : null, tideZoneLabel(kind)]
    .filter(Boolean)
    .join(' · ');

  const parts: string[] = [
    `Score is ${fmtScore(score)} (${tideZoneLabel(kind)}). T ${pct(tide)} · E ${pct(energy)} · Tp ${pct(tape)}.`,
  ];
  const { emaPeriod, emaValue } = input;
  if (emaPeriod != null && emaValue != null && Number.isFinite(emaValue)) {
    const which = input.crossEma === 'long' ? 'long' : 'short';
    parts.push(
      score > emaValue
        ? `The ${which} EMA (${emaPeriod}) is ${fmtScore(emaValue)}, below the histogram.`
        : score < emaValue
          ? `The ${which} EMA (${emaPeriod}) is ${fmtScore(emaValue)}, above the histogram.`
          : `The ${which} EMA (${emaPeriod}) is level with the histogram.`,
    );
  }
  if (fresh === 'in') parts.push('Tide in just printed: the EMA crossed below the histogram.');
  else if (fresh === 'out') parts.push('Tide out just printed: the EMA crossed above the histogram.');
  if (input.timeframe) parts.push(`Chart ${input.timeframe}.`);

  return {
    headline,
    color: zoneColor(kind),
    showingNow: parts.join(' '),
    watch:
      'Tide in = the EMA crosses below the histogram at or under the Tide-in level. Tide out = the EMA crosses above it at or over the Tide-out level. Markers only print on closed bars and never move.',
  };
}

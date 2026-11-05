// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { TideZonePoint } from '@/lib/indicators/tideZone';
import { tideZoneLabel } from '@/lib/indicators/tideZone';
import type { TideCrossDriver, TideCrossKind } from '@/lib/indicators/tideSignals';
import type { TideTimeframe } from '@/types/tideZoneSettings';

interface TideZoneHudProps {
  last: TideZonePoint;
  /** Chart timeframe ('1h' | '4h'). */
  timeframe: TideTimeframe;
  /** A Tide in / Tide out printed on one of the last few closed bars. */
  fresh?: TideCrossKind | null;
  className?: string;
  emaShort?: { period: number; value: number };
  emaLong?: { period: number; value: number };
  /** Which EMA drives Tide in / Tide out (shown in bold). */
  crossEma?: TideCrossDriver;
  /**
   * overlay (default): floating card on the plot (fullscreen).
   * inline: wrapping row outside the plot (main indicators card).
   */
  variant?: 'overlay' | 'inline';
}

const COMPONENTS = [
  {
    key: 'tide',
    label: 'Tide',
    blurb: '4h RSI and distance from 4h EMA50. High = uptrend location, not a buy. Low = downtrend location.',
  },
  {
    key: 'energy',
    label: 'Energy',
    blurb: 'How violent this timeframe is (ATR% / Bollinger width). High + low Tide = bounce. Low + low Tide = grind down — do not buy.',
  },
  {
    key: 'tape',
    label: 'Tape',
    blurb: 'Recent buying vs selling. Confirms the Tide. It does not override a down Tide on its own.',
  },
] as const;

function kindClass(kind: TideZonePoint['kind']): string {
  if (kind === 'follow_buy') return 'text-emerald-300 border-emerald-700/60 bg-emerald-950/80';
  if (kind === 'bounce_buy') return 'text-amber-300 border-amber-700/60 bg-amber-950/80';
  if (kind === 'sell') return 'text-red-300 border-red-700/60 bg-red-950/80';
  return 'text-slate-300 border-slate-600/60 bg-slate-900/85';
}

/** Shown instead of the HUD on timeframes where Tide does not run. */
export function TideOffNote({ className }: { className?: string }) {
  return (
    <div
      className={`pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-slate-600/60 bg-slate-900/85 px-2 py-1 text-[11px] text-slate-300 backdrop-blur-sm ${className ?? ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="font-semibold">Tide: 1h/4h only</span>
    </div>
  );
}

export function TideZoneHud({
  last,
  timeframe,
  fresh = null,
  className,
  emaShort,
  emaLong,
  crossEma = 'short',
  variant = 'overlay',
}: TideZoneHudProps) {
  const [open, setOpen] = useState(false);
  const pct = (v: number) => Math.round(v * 100);
  const inline = variant === 'inline';

  return (
    <div
      className={`pointer-events-auto rounded-lg border ${
        inline
          ? 'w-full min-w-0 max-w-full'
          : 'max-w-[min(100%,20rem)] backdrop-blur-sm shadow-lg'
      } ${kindClass(last.kind)} ${className ?? ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 px-2 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold leading-tight break-words">
            {fresh === 'in' && (
              <span className="mr-1 rounded bg-cyan-500/30 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-200">
                Tide in
              </span>
            )}
            {fresh === 'out' && (
              <span className="mr-1 rounded bg-pink-500/30 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-pink-200">
                Tide out
              </span>
            )}
            {tideZoneLabel(last.kind)}
            <span className="opacity-80"> · {last.score.toFixed(0)}</span>
          </div>
          <div className="text-[10px] opacity-90 tabular-nums leading-tight break-words">
            T {pct(last.tide)} · E {pct(last.energy)} · Tp {pct(last.tape)}
            {[
              { k: 'short' as const, e: emaShort },
              { k: 'long' as const, e: emaLong },
            ].map(({ k, e }) =>
              e && Number.isFinite(e.value) ? (
                <span key={k} className={k === 'short' ? 'text-sky-200' : 'text-amber-200'}>
                  {' · '}
                  <span className={crossEma === k ? 'font-bold' : ''}>
                    EMA{e.period} {e.value.toFixed(0)}
                  </span>
                </span>
              ) : null,
            )}
            <span className="opacity-60"> · {timeframe}</span>
          </div>
        </div>
        {open ? <ChevronUp className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/10 px-2 py-2 space-y-2">
          {COMPONENTS.map((c) => (
            <div key={c.key}>
              <div className="text-[10px] font-semibold uppercase tracking-wide">
                {c.label}{' '}
                <span className="font-mono opacity-80">
                  {c.key === 'tide' ? pct(last.tide) : c.key === 'energy' ? pct(last.energy) : pct(last.tape)}
                </span>
              </div>
              <p className="text-[10px] leading-snug text-slate-200/90">{c.blurb}</p>
            </div>
          ))}
          <p className="text-[10px] leading-snug text-cyan-200">
            Tide in: the EMA crosses below the histogram, at or under the Tide-in level. Tide out: the
            EMA crosses above it, at or over the Tide-out level. Closed bars only; a print never moves.
          </p>
          <p className="text-[10px] leading-snug text-slate-400">
            Green +40 = 4h tide is up (where you are, not a buy). Amber = bounce vs down tide. Red −40 =
            4h tide is down. The gear sets the two EMAs, the two levels and which EMA drives the cross.
          </p>
        </div>
      )}
    </div>
  );
}

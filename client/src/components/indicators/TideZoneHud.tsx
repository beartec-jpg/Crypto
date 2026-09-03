import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { TideZonePoint } from '@/lib/indicators/tideZone';
import { tideZoneLabel } from '@/lib/indicators/tideZone';
import { TideHistEmaControl } from '@/components/indicators/TideHistEmaControl';

interface TideZoneHudProps {
  last: TideZonePoint;
  absorb?: boolean;
  distro?: boolean;
  reacc?: boolean;
  className?: string;
  emaPeriod?: number;
  emaValue?: number;
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

export function TideZoneHud({
  last,
  absorb = false,
  distro = false,
  reacc = false,
  className,
  emaPeriod,
  emaValue,
}: TideZoneHudProps) {
  const [open, setOpen] = useState(false);
  const pct = (v: number) => Math.round(v * 100);
  const showAbsorb = absorb || last.tell === 'absorb';
  const showDistro = !showAbsorb && (distro || last.tell === 'distro');
  const showReacc = !showAbsorb && !showDistro && (reacc || last.tell === 'reacc');

  return (
    <div
      className={`pointer-events-auto max-w-[min(100%,20rem)] rounded-lg border backdrop-blur-sm shadow-lg ${kindClass(last.kind)} ${className ?? ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold leading-tight truncate">
            {showAbsorb && (
              <span className="mr-1 rounded bg-cyan-500/30 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-200">
                Absorb
              </span>
            )}
            {showDistro && (
              <span className="mr-1 rounded bg-orange-500/30 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-200">
                Distro
              </span>
            )}
            {showReacc && (
              <span className="mr-1 rounded bg-sky-500/25 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-200">
                Reacc
              </span>
            )}
            {tideZoneLabel(last.kind)}
            <span className="opacity-80"> · {last.score.toFixed(0)}</span>
          </div>
          <div className="text-[10px] opacity-90 tabular-nums leading-tight">
            T {pct(last.tide)} · E {pct(last.energy)} · Tp {pct(last.tape)}
            {emaPeriod != null && emaValue != null && Number.isFinite(emaValue) && (
              <span className="text-sky-200"> · EMA{emaPeriod} {emaValue.toFixed(0)}</span>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/10 px-2 py-2 space-y-2">
          <TideHistEmaControl />
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
          {showAbsorb && (
            <p className="text-[10px] leading-snug text-cyan-200">
              Absorb: price down/flat at a low or 0-cross while hist and tape rose. Taking the long here is
              still a success even if you exit before a runner. Not a breakout yet.
            </p>
          )}
          {showDistro && (
            <p className="text-[10px] leading-snug text-orange-200">
              Distro watch (stage 1): 16-bar high and 24h OI ≤ −3% while price is still hanging there.
              Looks like leverage leaving the high — not a confirmed short. Stop chasing; fine to bank a
              long from absorb.
            </p>
          )}
          {showReacc && (
            <p className="text-[10px] leading-snug text-sky-200">
              Reacc watch: high in an up-tide and OI is not flushing. Pause in trend, not OI-leave distro.
            </p>
          )}
          <p className="text-[10px] leading-snug text-slate-400">
            Green +40 = 4h tide is up (where you are, not a buy). Amber = bounce vs down tide.
            Red −40 = 4h tide is down. Sky line is an EMA of the hist — use it to ignore 1–2 bar
            early flips. Exit longs at 0, not −40. Distro/Reacc need OI; they stay off if the
            book feed is missing.
          </p>
        </div>
      )}
    </div>
  );
}

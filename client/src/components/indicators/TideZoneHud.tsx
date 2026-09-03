import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { TideZonePoint } from '@/lib/indicators/tideZone';
import { tideZoneLabel } from '@/lib/indicators/tideZone';

interface TideZoneHudProps {
  last: TideZonePoint;
  className?: string;
}

const COMPONENTS = [
  {
    key: 'tide',
    label: 'Tide',
    blurb: '4h RSI and distance from 4h EMA50. High = uptrend location — follow-buy. Low = downtrend.',
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

export function TideZoneHud({ last, className }: TideZoneHudProps) {
  const [open, setOpen] = useState(false);
  const pct = (v: number) => Math.round(v * 100);

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
            {tideZoneLabel(last.kind)}
            <span className="opacity-80"> · {last.score.toFixed(0)}</span>
          </div>
          <div className="text-[10px] opacity-90 tabular-nums leading-tight">
            T {pct(last.tide)} · E {pct(last.energy)} · Tp {pct(last.tape)}
          </div>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
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
          <p className="text-[10px] leading-snug text-slate-400">
            Green +40 = follow 4h. Amber = bounce vs down tide. Red −40 = sell / no long.
          </p>
        </div>
      )}
    </div>
  );
}

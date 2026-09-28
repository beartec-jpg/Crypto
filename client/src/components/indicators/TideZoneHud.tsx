import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { TideZonePoint } from '@/lib/indicators/tideZone';
import { tideZoneLabel } from '@/lib/indicators/tideZone';
import { TideHistEmaControl } from '@/components/indicators/TideHistEmaControl';
import { ConnectedTideZoneSettingsModal } from '@/components/modals/TideZoneSettingsModal';
import type { TideStatus } from '@/hooks/useTideV2';
import type { TideTimeframe } from '@/types/tideZoneSettings';

interface TideZoneHudProps {
  last: TideZonePoint;
  /** Chart timeframe ('1h' | '4h'). */
  timeframe: TideTimeframe;
  /** Point-in-time Tide v2 status (fresh print, open stop). */
  status?: TideStatus;
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

function fmtPrice(p: number): string {
  return p >= 100 ? p.toFixed(1) : p.toPrecision(5);
}

/** Shown instead of the HUD on timeframes where Tide does not run. */
export function TideOffNote({ className }: { className?: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div
      className={`pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-slate-600/60 bg-slate-900/85 px-2 py-1 text-[11px] text-slate-300 backdrop-blur-sm ${className ?? ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="font-semibold">Tide: 1h/4h only</span>
      <TideHistEmaControl timeframe={null} onOpenSettings={() => setSettingsOpen(true)} className="border-0 bg-transparent px-0" />
      <ConnectedTideZoneSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export function TideZoneHud({
  last,
  timeframe,
  status,
  absorb = false,
  distro = false,
  reacc = false,
  className,
  emaPeriod,
  emaValue,
}: TideZoneHudProps) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pct = (v: number) => Math.round(v * 100);
  const showAbsorb = absorb || last.tell === 'absorb';
  const showDistro = !showAbsorb && (distro || last.tell === 'distro');
  const showReacc = !showAbsorb && !showDistro && (reacc || last.tell === 'reacc');
  const fresh = status?.fresh ?? null;

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
            {(fresh === 'out' || fresh === 'out_plus') && (
              <span
                className={`mr-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                  fresh === 'out_plus' ? 'bg-emerald-500/30 text-emerald-200' : 'bg-violet-500/30 text-violet-200'
                }`}
              >
                {fresh === 'out_plus' ? 'Tide out +' : 'Tide out'}
              </span>
            )}
            {fresh === 'in' && (
              <span className="mr-1 rounded bg-amber-500/30 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">
                Tide in
              </span>
            )}
            {fresh === 'stop' && (
              <span className="mr-1 rounded bg-red-500/30 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-200">
                Stop hit
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
            {status?.activeStop != null && (
              <span className="text-red-200"> · SL {fmtPrice(status.activeStop)}</span>
            )}
            <span className="opacity-60"> · {timeframe}</span>
          </div>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/10 px-2 py-2 space-y-2">
          <TideHistEmaControl timeframe={timeframe} onOpenSettings={() => setSettingsOpen(true)} />
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
              Absorb: price flat or down between two price zigzag lows while the Tide EMA is
              rising. Demand under the candles — not a breakout.
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
          <p className="text-[10px] leading-snug text-violet-200">
            Tide out: price lower low vs Tide-EMA higher low (both under the threshold), printed on the
            bar it confirms and never removed. Tide out + (green) = RSI(14) under 30 between the low and
            that bar. Dashed red line = stop under the low; it ends at the Tide in exit or when hit.
          </p>
          <p className="text-[10px] leading-snug text-slate-400">
            Green +40 = 4h tide is up (where you are, not a buy). Amber = bounce vs down tide.
            Red −40 = 4h tide is down. Sky line is an EMA of the hist — use it to ignore 1–2 bar
            early flips. Exit on Tide in (amber). Distro/Reacc need OI; they stay off if the
            book feed is missing.
          </p>
        </div>
      )}
      <ConnectedTideZoneSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} timeframe={timeframe} />
    </div>
  );
}

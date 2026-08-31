import type { SwoopResult } from '@/types/swoop';

interface SwoopHudProps {
  result: SwoopResult;
  visible: boolean;
}

function stateClass(state: SwoopResult['state']): string {
  switch (state) {
    case 'release':
      return 'text-emerald-300 border-emerald-700/60 bg-emerald-950/40';
    case 'compressing':
      return 'text-amber-200 border-amber-700/60 bg-amber-950/40';
    case 'slowing':
      return 'text-yellow-200 border-yellow-700/50 bg-yellow-950/35';
    case 'armed':
      return 'text-rose-200 border-rose-700/50 bg-rose-950/35';
    default:
      return 'text-slate-300 border-slate-700/60 bg-slate-950/40';
  }
}

function fmtSlope(s: number | null): string {
  if (s == null || !Number.isFinite(s)) return '\u2014';
  const pct = s * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(3)}%/bar`;
}

export function SwoopHud({ result, visible }: SwoopHudProps) {
  if (!visible) return null;

  return (
    <div
      className={`pointer-events-none select-none absolute top-14 left-2 z-[60] rounded-md border px-2 py-1.5 text-[11px] shadow-lg backdrop-blur-sm ${stateClass(result.state)}`}
      data-testid="swoop-hud"
    >
      <div className="flex items-center gap-1.5">
        <span className="font-bold tracking-wide">SWOOP</span>
        <span className="font-semibold">{result.label}</span>
      </div>
      <div className="text-[10px] text-slate-300 mt-0.5 space-y-0.5">
        <div>Top {fmtSlope(result.liveTopSlope)}</div>
        {result.expectedTopBand && (
          <div>
            Expect {fmtSlope(result.expectedTopBand.lo)} → {fmtSlope(result.expectedTopBand.hi)}
          </div>
        )}
        {result.compression != null && result.armed && (
          <div>Gap {Math.round(result.compression * 100)}% tight · proj {result.projectBars} bars</div>
        )}
      </div>
    </div>
  );
}

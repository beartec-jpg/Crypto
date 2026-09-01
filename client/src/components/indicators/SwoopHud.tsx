import { SWOOP_BOOK_LABEL, type SwoopGapStat, type SwoopResult } from '@/types/swoop';

interface SwoopHudProps {
  result: SwoopResult;
  visible: boolean;
  pivotLength: number;
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

function gapWord(g: SwoopGapStat): string {
  return `${g.side === 'top' ? 'H' : 'L'}${g.gapIndex + 1} ${g.status} ${g.score}`;
}

function angleWord(band: SwoopResult['expectedTopBand']): string {
  if (!band) return '';
  if (band.lo < band.mid - 1e-12) return 'steepening';
  if (band.hi > band.mid + 1e-12) return 'shallowing';
  return 'equal angle';
}

export function SwoopHud({ result, visible, pivotLength }: SwoopHudProps) {
  if (!visible) return null;
  const angle = angleWord(result.expectedTopBand);

  return (
    <div
      className={`pointer-events-none select-none absolute top-14 left-2 z-[60] rounded-md border px-2 py-1.5 text-[11px] shadow-lg backdrop-blur-sm ${stateClass(result.state)}`}
      data-testid="swoop-hud"
    >
      <div className="flex items-center gap-1.5">
        <span className="font-bold tracking-wide">BOOK</span>
        <span className="rounded bg-black/35 px-1 font-mono text-[10px] text-slate-200">P{pivotLength}</span>
        <span className="font-semibold">{SWOOP_BOOK_LABEL[result.pattern ?? 'none']}</span>
        <span className="text-slate-400">{result.label}</span>
      </div>
      <div className="text-[10px] text-slate-300 mt-0.5 space-y-0.5">
        <div>
          Last {fmtSlope(result.liveTopSlope)}
          {angle ? ` · ${angle}` : ''}
        </div>
        {result.expectedTopBand && (
          <div>
            Expect {fmtSlope(result.expectedTopBand.lo)} → {fmtSlope(result.expectedTopBand.hi)}
          </div>
        )}
        {result.compression != null && result.armed && (
          <div>Gap {Math.round(result.compression * 100)}% tight · proj {result.projectBars} bars</div>
        )}
        {result.gapStats
          .filter((g) => g.side === 'top')
          .slice(-3)
          .map((g) => (
            <div key={`t${g.gapIndex}`} className="font-mono text-[10px] text-slate-200/90">
              {gapWord(g)}
              {g.flags.includes('cvd_vs_price') ? ' · CVD↑/px↓' : ''}
            </div>
          ))}
      </div>
    </div>
  );
}

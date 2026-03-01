import type { GenuineDemandScoreResult } from '@/lib/indicators/genuineDemandScore';

interface GDSMiniBadgeProps {
  score: number;
  gds: GenuineDemandScoreResult;
  isLoading?: boolean;
}

function scoreClass(score: number): string {
  if (score >= 80) return 'text-green-300 border-green-700/60 bg-green-950/40';
  if (score >= 60) return 'text-emerald-300 border-emerald-700/60 bg-emerald-950/35';
  if (score >= 40) return 'text-yellow-300 border-yellow-700/60 bg-yellow-950/35';
  if (score >= 20) return 'text-orange-300 border-orange-700/60 bg-orange-950/35';
  return 'text-red-300 border-red-700/60 bg-red-950/35';
}

export function GDSMiniBadge({ score, gds, isLoading = false }: GDSMiniBadgeProps) {
  const rounded = Math.round(score);

  return (
    <div className={`pointer-events-none select-none absolute top-14 right-2 z-[60] rounded-md border px-2 py-1.5 text-[11px] shadow-lg backdrop-blur-sm ${scoreClass(rounded)}`}>
      {isLoading ? (
        <span className="font-semibold">GDS: ...</span>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="font-bold">{gds.emoji} GDS {rounded}</span>
          {gds.flags.fakeBreakoutWarning && <span className="text-red-300">⚠️</span>}
        </div>
      )}
      {!isLoading && <div className="text-[10px] text-slate-300 max-w-[220px] truncate">{gds.verdict}</div>}
    </div>
  );
}

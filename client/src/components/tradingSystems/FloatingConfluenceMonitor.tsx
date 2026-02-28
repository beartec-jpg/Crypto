import { useState } from 'react';
import { X, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { TRADING_SYSTEMS } from '@/types/tradingSystems';
import { getSignalLabel } from '@/lib/tradingSystemScoring';
import { cn } from '@/lib/utils';

const TOTAL_SYSTEMS = Object.keys(TRADING_SYSTEMS).length;

interface SystemDetail {
  systemId: string;
  systemName: string;
  /** Continuous score: -100 to +100 */
  score: number;
  state: 'bullish' | 'bearish' | 'neutral';
  signalLabel?: string;
  signalColor?: string;
  conditions?: Array<{ name: string; met: boolean; weight: number; value?: string }>;
}

interface FloatingConfluenceMonitorProps {
  confluenceSnapshot: {
    score: number;
    longCount: number;
    shortCount: number;
    neutralCount: number;
    updatedAt: number;
    systemDetails?: SystemDetail[];
  } | null;
  isVisible: boolean;
  onClose: () => void;
}

function getScoreColorClass(score: number) {
  if (score >= 0.35) return 'text-emerald-300';
  if (score >= 0.1) return 'text-lime-300';
  if (score <= -0.35) return 'text-rose-300';
  if (score <= -0.1) return 'text-orange-300';
  return 'text-yellow-300';
}

function getScoreBorderClass(score: number) {
  if (score >= 0.35) return 'border-emerald-700/60';
  if (score >= 0.1) return 'border-lime-700/60';
  if (score <= -0.35) return 'border-rose-700/60';
  if (score <= -0.1) return 'border-orange-700/60';
  return 'border-yellow-700/60';
}

function getStateColor(state: 'bullish' | 'bearish' | 'neutral') {
  if (state === 'bullish') return 'text-emerald-300';
  if (state === 'bearish') return 'text-rose-300';
  return 'text-yellow-300';
}

function getStateDot(state: 'bullish' | 'bearish' | 'neutral') {
  if (state === 'bullish') return 'bg-emerald-400';
  if (state === 'bearish') return 'bg-rose-400';
  return 'bg-yellow-400';
}

/** Map a -100..+100 system score to a bar fill colour using the shared scoring colour scheme. */
function scoreToBarColor(score: number): string {
  return getSignalLabel(score).color;
}

export function FloatingConfluenceMonitor({
  confluenceSnapshot,
  isVisible,
  onClose,
}: FloatingConfluenceMonitorProps) {
  const [expanded, setExpanded] = useState(false);

  const { position, isDragging, dragHandleProps } = useDraggable({
    initialPosition: { x: 20, y: 100 },
    storageKey: 'confluenceMonitorPosition',
  });

  if (!isVisible) return null;

  const score = confluenceSnapshot?.score ?? 0;
  const scoreText = confluenceSnapshot
    ? `${score > 0 ? '+' : ''}${score.toFixed(2)}`
    : 'N/A';
  const colorClass = confluenceSnapshot ? getScoreColorClass(score) : 'text-slate-300';
  const borderClass = confluenceSnapshot ? getScoreBorderClass(score) : 'border-slate-700';

  // Bias bar: bullish side extends right from center, bearish left
  const total = (confluenceSnapshot?.longCount ?? 0) + (confluenceSnapshot?.shortCount ?? 0) + (confluenceSnapshot?.neutralCount ?? 0);
  const bullishPct = total > 0 ? ((confluenceSnapshot?.longCount ?? 0) / total) * 100 : 0;
  const bearishPct = total > 0 ? ((confluenceSnapshot?.shortCount ?? 0) / total) * 100 : 0;

  return (
    <div
      data-draggable
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        opacity: isDragging ? 0.8 : 1,
        zIndex: 60,
      }}
      className={cn(
        'rounded-lg border bg-slate-900/95 shadow-xl backdrop-blur-sm text-white select-none',
        borderClass,
        expanded ? 'w-[220px]' : 'w-[140px]',
      )}
    >
      {/* Drag handle / header */}
      <div
        {...dragHandleProps}
        className="flex items-center justify-between px-2 py-1 border-b border-slate-700/60 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          <Activity className="h-3 w-3 text-blue-300 flex-shrink-0" />
          <span className="text-[10px] font-semibold text-blue-300 truncate">Confluence</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            className="p-0.5 rounded hover:bg-slate-700/60 transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded
              ? <ChevronUp className="h-3 w-3 text-slate-400" />
              : <ChevronDown className="h-3 w-3 text-slate-400" />
            }
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-0.5 rounded hover:bg-slate-700/60 transition-colors"
            title="Close"
          >
            <X className="h-3 w-3 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Score + bar */}
      <div className="px-2 py-1.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400 uppercase tracking-wide">Score</span>
          <span className={cn('text-sm font-bold', colorClass)}>{scoreText}</span>
        </div>

        {/* Bias gauge bar */}
        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden flex">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${bullishPct}%` }}
          />
          <div
            className="h-full bg-yellow-500/50 transition-all duration-300 flex-1"
            style={{ maxWidth: `${100 - bullishPct - bearishPct}%` }}
          />
          <div
            className="h-full bg-rose-500 transition-all duration-300"
            style={{ width: `${bearishPct}%` }}
          />
        </div>

        {/* L / N / S counts */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-emerald-300 font-semibold">
            L:{confluenceSnapshot?.longCount ?? 0}
          </span>
          <span className="text-yellow-300 font-semibold">
            N:{confluenceSnapshot?.neutralCount ?? 0}
          </span>
          <span className="text-rose-300 font-semibold">
            S:{confluenceSnapshot?.shortCount ?? 0}
          </span>
        </div>
      </div>

      {/* Expanded: system details with score bars */}
      {expanded && confluenceSnapshot?.systemDetails && (
        <div className="border-t border-slate-700/60 px-2 py-1.5 space-y-1.5 max-h-[300px] overflow-y-auto">
          {confluenceSnapshot.systemDetails.map((sys) => {
            const barColor = scoreToBarColor(sys.score);
            // Convert -100..+100 to 0..100% fill from center
            const absPct = Math.abs(sys.score);
            const isBullish = sys.score >= 0;
            return (
              <div key={sys.systemId} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', getStateDot(sys.state))} />
                  <span className="text-[10px] text-slate-300 flex-1 truncate">{sys.systemName}</span>
                  <span
                    className="text-[10px] font-semibold flex-shrink-0"
                    style={{ color: sys.signalColor ?? (isBullish ? '#22c55e' : '#ef4444') }}
                  >
                    {sys.score > 0 ? '+' : ''}{sys.score}%
                  </span>
                </div>
                {/* Narrow score bar */}
                <div className="h-1 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${absPct}%`, backgroundColor: barColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expanded && confluenceSnapshot && (
        <div className="px-2 pb-1.5 text-[9px] text-slate-500">
          {TOTAL_SYSTEMS} systems monitored
        </div>
      )}
    </div>
  );
}

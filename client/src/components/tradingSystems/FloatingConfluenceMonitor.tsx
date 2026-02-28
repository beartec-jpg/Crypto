import { useState } from 'react';
import { X, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { TRADING_SYSTEMS } from '@/types/tradingSystems';
import { getSignalLabel } from '@/lib/tradingSystemScoring';
import { type MarketPattern } from '@/lib/confluencePatterns';
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
    patterns?: MarketPattern[];
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
  // score is in -1..+1; convert to percentage for display
  const scorePct = score * 100;
  const scoreText = confluenceSnapshot
    ? `${scorePct > 0 ? '+' : ''}${scorePct.toFixed(0)}%`
    : 'N/A';
  const colorClass = confluenceSnapshot ? getScoreColorClass(score) : 'text-slate-300';
  const borderClass = confluenceSnapshot ? getScoreBorderClass(score) : 'border-slate-700';

  // Sentiment label derived from the -100..+100 percentage score
  const sentimentLabel = confluenceSnapshot ? getSignalLabel(scorePct).label : null;

  // Bar fill: map -100..+100 → 0..100% (center = neutral)
  const barFillPct = Math.max(0, Math.min(100, (scorePct + 100) / 2));
  const barColor = scorePct >= 20 ? '#22c55e' : scorePct <= -20 ? '#ef4444' : '#eab308';

  const patterns = confluenceSnapshot?.patterns ?? [];

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
        expanded ? 'w-[240px]' : 'w-[160px]',
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

      {/* Score bar + percentage + sentiment label (always visible) */}
      <div className="px-2 py-2 space-y-1">
        {/* Bar + score on same row */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${barFillPct}%`, backgroundColor: barColor }}
            />
          </div>
          <span className={cn('text-[11px] font-bold flex-shrink-0', colorClass)}>{scoreText}</span>
        </div>
        {/* Sentiment label */}
        {sentimentLabel && (
          <div className={cn('text-[10px] font-semibold text-center tracking-wide uppercase', colorClass)}>
            {sentimentLabel}
          </div>
        )}
      </div>

      {/* Expanded: pattern alert + counts + system details */}
      {expanded && (
        <div className="border-t border-slate-700/60">
          {/* Pattern alerts */}
          {patterns.length > 0 && (
            <div className="mx-2 mt-2 space-y-2">
              {patterns.map((pattern, idx) => (
                <div key={idx} className={cn('rounded-md border p-2 space-y-1', pattern.color.bg, pattern.color.border)}>
                  <div className={cn('flex items-center gap-1 text-[11px] font-bold', pattern.color.text)}>
                    <span>{pattern.icon}</span>
                    <span>{pattern.title}</span>
                  </div>
                  <p className="text-[10px] text-slate-300 leading-snug">{pattern.description}</p>
                  <p className={cn('text-[10px] font-medium leading-snug', pattern.color.text)}>
                    💡 {pattern.recommendation}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* System breakdown counts */}
          {confluenceSnapshot && (
            <div className="flex items-center justify-between px-2 py-1.5 text-[10px]">
              <span className="text-emerald-300 font-semibold">
                {confluenceSnapshot.longCount} bullish
              </span>
              <span className="text-yellow-300 font-semibold">
                {confluenceSnapshot.neutralCount} neutral
              </span>
              <span className="text-rose-300 font-semibold">
                {confluenceSnapshot.shortCount} bearish
              </span>
            </div>
          )}

          {/* System details */}
          {confluenceSnapshot?.systemDetails && (
            <div className="px-2 pb-1.5 space-y-1.5 max-h-[260px] overflow-y-auto">
              {confluenceSnapshot.systemDetails.map((sys) => {
                const barColor = scoreToBarColor(sys.score);
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

          <div className="px-2 pb-1.5 text-[9px] text-slate-500">
            {TOTAL_SYSTEMS} systems monitored
          </div>
        </div>
      )}
    </div>
  );
}

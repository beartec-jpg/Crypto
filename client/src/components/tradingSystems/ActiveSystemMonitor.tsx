import { useMemo, useState } from 'react';
import { X, ChevronDown, ChevronUp, Check, Lock, Unlock, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { TRADING_SYSTEMS, type TradingSystemId } from '@/types/tradingSystems';
import { type SystemEvaluation } from '@/types/systemScoring';
import { type ScoringInput } from '@/lib/tradingSystemScoring';
import { ConditionWeightAdjuster } from '@/components/ConditionWeightAdjuster';
import { resetWeightsToDefault } from '@/lib/conditionWeights';
import {
  getScoreColor,
  getScoreBarColor,
  getSentimentColor,
  getSentimentLabel,
  getTimeAgo,
} from '@/lib/tradingSystemColors';
import { cn } from '@/lib/utils';
import { SMCDebugTable } from './SMCDebugTable';
import { analyzeTrendState, detectTrendReversal } from '@/lib/tradingSystemBacktest';
import type { StructureBreak } from '@/types/structureBreak';

interface ActiveSystemMonitorProps {
  systemId: TradingSystemId;
  evaluation: SystemEvaluation;
  onClose: () => void;
  onWeightsChanged?: () => void;
  scoringInput?: ScoringInput;
  /** All detected structure breaks – used for trend analysis */
  structureBreaks?: StructureBreak[];
  /** Visible chart time range (seconds) – when provided, enables viewport locking */
  visibleRange?: { from: number; to: number };
  /** Historical signal events for the viewport backtest stats */
  historicalSignalEvents?: Array<{ time: number; action: 'OPEN LONG' | 'OPEN SHORT' }>;
}

export function ActiveSystemMonitor({
  systemId,
  evaluation,
  onClose,
  onWeightsChanged,
  scoringInput,
  structureBreaks,
  visibleRange,
  historicalSignalEvents,
}: ActiveSystemMonitorProps) {
  const [expanded, setExpanded] = useState(false);
  const [lockedToViewport, setLockedToViewport] = useState(false);

  const [buyThreshold, setBuyThreshold] = useState(() => {
    const saved = localStorage.getItem(`tradingSystem_${systemId}_buyThreshold`);
    return saved ? parseInt(saved, 10) : 70;
  });

  const [sellThreshold, setSellThreshold] = useState(() => {
    const saved = localStorage.getItem(`tradingSystem_${systemId}_sellThreshold`);
    return saved ? parseInt(saved, 10) : 70;
  });

  const adjustThreshold = (type: 'buy' | 'sell', delta: number) => {
    if (type === 'buy') {
      const newVal = Math.max(0, Math.min(100, buyThreshold + delta));
      setBuyThreshold(newVal);
      localStorage.setItem(`tradingSystem_${systemId}_buyThreshold`, newVal.toString());
    } else {
      const newVal = Math.max(0, Math.min(100, sellThreshold + delta));
      setSellThreshold(newVal);
      localStorage.setItem(`tradingSystem_${systemId}_sellThreshold`, newVal.toString());
    }
  };

  const { position, isDragging, dragHandleProps } = useDraggable({
    initialPosition: {
      x: typeof window !== 'undefined' ? Math.max(12, window.innerWidth - 360) : 980,
      y: 130,
    },
    storageKey: 'activeSystemMonitorPosition_v2',
  });

  const system = TRADING_SYSTEMS[systemId];
  if (!system) return null;

  const { score, confidence, conditions, signalLabel, timestamp } = evaluation;
  const sentimentLabel = getSentimentLabel(score);
  const scorePrefix = score > 0 ? '+' : '';
  const absPct = Math.abs(score);
  const metCount = conditions.filter(c => c.met).length;

  const weightedConditions = useMemo(
    () => conditions
      .filter(c => c.id && c.userWeight !== undefined && c.score !== undefined)
      .map(c => ({
        id: c.id!,
        name: c.name,
        score: c.score!,
        weight: c.userWeight!,
        weightedScore: c.weightedScore ?? ((c.score ?? 0) * (c.userWeight ?? 0)),
        description: c.description,
      })),
    [conditions],
  );

  // Trend analysis: computed from structure breaks, optionally filtered to visible viewport
  const trendAnalysis = useMemo(() => {
    if (!structureBreaks || structureBreaks.length === 0) return null;
    const startTime = lockedToViewport && visibleRange ? visibleRange.from : undefined;
    const endTime = lockedToViewport && visibleRange ? visibleRange.to : undefined;
    const trendState = analyzeTrendState(structureBreaks, startTime, endTime);
    const reversalInfo = detectTrendReversal(trendState);
    return { trendState, reversalInfo };
  }, [structureBreaks, lockedToViewport, visibleRange]);

  // Viewport backtest signal stats
  const viewportSignals = useMemo(() => {
    if (!historicalSignalEvents) return null;
    const events =
      lockedToViewport && visibleRange
        ? historicalSignalEvents.filter(
            e => e.time >= visibleRange.from && e.time <= visibleRange.to,
          )
        : historicalSignalEvents;
    const buySignals = events.filter(e => e.action === 'OPEN LONG').length;
    const sellSignals = events.filter(e => e.action === 'OPEN SHORT').length;
    return { buySignals, sellSignals, total: events.length };
  }, [historicalSignalEvents, lockedToViewport, visibleRange]);

  const showWeightAdjuster = weightedConditions.length > 0;

  const handleToggleViewportLock = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setLockedToViewport(v => !v);
    if (!expanded) setExpanded(true);
  };

  return (
    <div
      data-draggable
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        opacity: isDragging ? 0.85 : 1,
        zIndex: 60,
        width: expanded ? 360 : 300,
      }}
      className="rounded-lg border border-slate-700 bg-slate-900/95 shadow-xl backdrop-blur-sm text-white select-none"
    >
      {/* Header – draggable */}
      <div
        {...dragHandleProps}
        className="flex items-center justify-between px-2 py-1.5 border-b border-slate-700/60 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base leading-none flex-shrink-0">{system.icon}</span>
          <span className="text-[11px] font-semibold text-slate-200 truncate">{system.name}</span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {structureBreaks && structureBreaks.length > 0 && (
            <button
              type="button"
              onClick={handleToggleViewportLock}
              className={cn(
                'p-0.5 rounded transition-colors',
                lockedToViewport
                  ? 'bg-blue-600/30 hover:bg-blue-600/50 text-blue-400'
                  : 'hover:bg-slate-700/60 text-slate-400',
              )}
              title={lockedToViewport ? 'Unlock from viewport' : 'Lock to viewport – show trend analysis'}
            >
              {lockedToViewport
                ? <Lock className="h-3 w-3" />
                : <Unlock className="h-3 w-3" />
              }
            </button>
          )}
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

      {/* Compact score display (always visible) */}
      <div className="px-3 py-2">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className={cn('text-2xl font-bold', getScoreColor(score))}>
            {scorePrefix}{score}
          </span>
          <span className={cn('text-[10px] font-bold uppercase tracking-wide', getSentimentColor(signalLabel))}>
            {sentimentLabel}
          </span>
        </div>

        {/* Score bar */}
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex">
          {score >= 0 ? (
            <div
              className={cn('h-full rounded-full transition-all duration-300', getScoreBarColor(score))}
              style={{ width: `${absPct}%` }}
            />
          ) : (
            <div className="flex-1 flex justify-end">
              <div
                className={cn('h-full rounded-full transition-all duration-300', getScoreBarColor(score))}
                style={{ width: `${absPct}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-3 pb-3 pt-2 space-y-3 max-h-[500px] overflow-y-auto">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-slate-500 mb-0.5">Confidence</div>
              <div className="text-slate-200 font-semibold text-sm">{confidence}%</div>
            </div>
            {timestamp !== undefined && (
              <div>
                <div className="text-slate-500 mb-0.5">Updated</div>
                <div className="text-slate-200 font-semibold text-sm">{getTimeAgo(timestamp)}</div>
              </div>
            )}
          </div>

          {/* Signal Thresholds */}
          <div className="border-t border-slate-700/60 pt-2 space-y-1.5">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Signal Thresholds</div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-emerald-400">Buy:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => adjustThreshold('buy', -5)}
                  className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px]"
                >▼</button>
                <span className="text-[11px] font-mono w-8 text-center">{buyThreshold}</span>
                <button
                  onClick={() => adjustThreshold('buy', +5)}
                  className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px]"
                >▲</button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-rose-400">Sell:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => adjustThreshold('sell', -5)}
                  className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px]"
                >▼</button>
                <span className="text-[11px] font-mono w-8 text-center">{sellThreshold}</span>
                <button
                  onClick={() => adjustThreshold('sell', +5)}
                  className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px]"
                >▲</button>
              </div>
            </div>
          </div>

          {/* Trend Analysis (shown when locked to viewport and structure breaks available) */}
          {lockedToViewport && trendAnalysis && (
            <div className="border-t border-slate-700/60 pt-2 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                Trend Analysis
                {visibleRange ? (
                  <span className="ml-1 text-blue-400">(viewport)</span>
                ) : null}
              </div>

              {/* MSS / BOS counts */}
              <div className="text-xs text-slate-300 space-y-0.5">
                <div>
                  MSS:{' '}
                  <span className="text-emerald-400">{trendAnalysis.trendState.mssCount.bullish}↑</span>
                  {' '}
                  <span className="text-rose-400">{trendAnalysis.trendState.mssCount.bearish}↓</span>
                </div>
                <div>
                  BOS:{' '}
                  <span className="text-emerald-400">{trendAnalysis.trendState.bosCount.bullish}↑</span>
                  {' '}
                  <span className="text-rose-400">{trendAnalysis.trendState.bosCount.bearish}↓</span>
                </div>
              </div>

              {/* Trend status badge (only when no reversal) */}
              {trendAnalysis.trendState.current === 'bullish' && trendAnalysis.reversalInfo.status === 'neutral' && (
                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-400 mt-1">
                  <Check className="w-3 h-3" />
                  CONFIRMED BULLISH TREND
                </div>
              )}
              {trendAnalysis.trendState.current === 'bearish' && trendAnalysis.reversalInfo.status === 'neutral' && (
                <div className="flex items-center gap-1 text-xs font-semibold text-rose-400 mt-1">
                  <Check className="w-3 h-3" />
                  CONFIRMED BEARISH TREND
                </div>
              )}
              {trendAnalysis.trendState.current === 'neutral' && (
                <div className="text-xs text-slate-500 mt-1">No confirmed trend yet</div>
              )}

              {/* Reversal warning */}
              {trendAnalysis.reversalInfo.status === 'warning' && (
                <div className="mt-2 p-2 bg-orange-900/20 border border-orange-600/30 rounded">
                  <div className="flex items-center gap-1 text-xs font-bold text-orange-400 mb-1">
                    <AlertTriangle className="w-3 h-3" />
                    TREND REVERSAL WARNING
                  </div>
                  <div className="text-[10px] text-orange-300 whitespace-pre-line">
                    {trendAnalysis.reversalInfo.message.replace(/^⚠️ TREND REVERSAL WARNING\n/, '')}
                  </div>
                </div>
              )}

              {/* Confirmed reversal */}
              {trendAnalysis.reversalInfo.status === 'confirmed' && (
                <div className="mt-2 p-2 bg-red-900/20 border border-red-600/30 rounded">
                  <div className="flex items-center gap-1 text-xs font-bold text-red-400 mb-1">
                    <ArrowRightLeft className="w-3 h-3" />
                    TREND REVERSED
                  </div>
                  <div className="text-[10px] text-red-300 whitespace-pre-line">
                    {trendAnalysis.reversalInfo.message.replace(/^🔄 TREND REVERSED\n/, '')}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Viewport Backtest signal stats */}
          {lockedToViewport && viewportSignals && (
            <div className="border-t border-slate-700/60 pt-2 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                Viewport Backtest
                {trendAnalysis && trendAnalysis.reversalInfo.status !== 'neutral' && (
                  <span className="ml-1 text-orange-400">(Reversal-Adjusted)</span>
                )}
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-400">{viewportSignals.buySignals}↑ Buy</span>
                <span className="text-rose-400">{viewportSignals.sellSignals}↓ Sell</span>
                <span className="text-slate-500">{viewportSignals.total} total</span>
              </div>
            </div>
          )}
          {conditions.length > 0 && !showWeightAdjuster && (
            <div>
              <div className="text-[10px] text-slate-500 mb-1.5 font-semibold uppercase tracking-wide">
                Conditions ({metCount}/{conditions.length} met)
              </div>
              <div className="space-y-0.5 max-h-[320px] overflow-y-auto pr-1">
                {conditions.map((cond, i) => (
                  <div key={i} className="flex items-start gap-1.5 py-0.5 text-xs">
                    {cond.met ? (
                      <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={cond.met ? 'text-slate-300' : 'text-slate-500'}>
                        {cond.name}
                      </span>
                      {cond.value && (
                        <span className="text-slate-500 ml-1">({cond.value})</span>
                      )}
                    </div>
                    {cond.weight !== undefined && cond.weight !== 0 && (
                      <span className={cn(
                        'text-[10px] font-mono flex-shrink-0',
                        cond.weight > 0 ? 'text-green-600' : 'text-red-600',
                      )}>
                        {cond.weight > 0 ? '+' : ''}{cond.weight}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showWeightAdjuster && (
            <div className="border-t border-slate-700/60 pt-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Condition Weights</div>
                <button
                  onClick={() => {
                    resetWeightsToDefault(systemId);
                    onWeightsChanged?.();
                  }}
                  className="text-[10px] text-blue-400 hover:underline"
                  title="Set all condition weights back to 1"
                >
                  Reset to Defaults
                </button>
              </div>

              <div className="space-y-0.5">
                {weightedConditions.map(condition => (
                  <ConditionWeightAdjuster
                    key={condition.id}
                    systemId={systemId}
                    condition={condition}
                    onWeightChange={() => onWeightsChanged?.()}
                  />
                ))}
              </div>
            </div>
          )}

          {systemId === 'smart-money' && scoringInput && (
            <SMCDebugTable evaluation={evaluation} scoringInput={scoringInput} />
          )}
        </div>
      )}
    </div>
  );
}

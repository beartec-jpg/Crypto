import { useMemo, useState } from 'react';
import { X, ChevronDown, ChevronUp, Check, Lock, Unlock, Loader2 } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import type { OpportunityZone } from '@/lib/confluenceAnalysis';
import { TRADING_SYSTEMS, type TradingSystemId } from '@/types/tradingSystems';
import { type SystemEvaluation } from '@/types/systemScoring';
import { type ScoringInput } from '@/lib/tradingSystemScoring';
import { ConditionWeightAdjuster } from '@/components/ConditionWeightAdjuster';
import { CompactIndicatorRow } from '@/components/CompactIndicatorRow';
import { resetWeightsToDefault } from '@/lib/conditionWeights';
import {
  getScoreColor,
  getScoreBarColor,
  getSentimentColor,
  getSentimentLabel,
} from '@/lib/tradingSystemColors';
import { cn } from '@/lib/utils';
import { SMCDebugTable } from './SMCDebugTable';
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
  historicalSignalEvents?: Array<{ time: number; action: 'BUY OPEN' | 'BUY CLOSE' | 'SELL OPEN' | 'SELL CLOSE' }>;
  onLockToViewport?: (locked: boolean) => void;
  canLockToViewport?: boolean;
  viewportSignals?: {
    buySignals: Array<{ time: number; score: number; index: number }>;
    sellSignals: Array<{ time: number; score: number; index: number }>;
    totalCandles: number;
  } | null;
  onFindMaxOpportunity?: () => void;
  isAnalyzingOpportunities?: boolean;
  maxOpportunityZones?: OpportunityZone[];
  onClearOpportunityZones?: () => void;
  onJumpToZone?: (candleIndex: number) => void;
}

// Condition IDs that are read-only indicators (display-only, no adjustable weight).
const READONLY_INDICATOR_IDS = ['trendStrength', 'secondaryTrendStrength', 'counterTrend', 'inducementSequence'];

export function ActiveSystemMonitor({
  systemId,
  evaluation,
  onClose,
  onWeightsChanged,
  scoringInput,
  structureBreaks,
  visibleRange,
  historicalSignalEvents,
  onLockToViewport,
  canLockToViewport,
  viewportSignals,
  onFindMaxOpportunity,
  isAnalyzingOpportunities,
  maxOpportunityZones,
  onClearOpportunityZones,
  onJumpToZone,
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

  const handleToggleLock = () => {
    if (!onLockToViewport) return;
    const newLocked = !lockedToViewport;
    setLockedToViewport(newLocked);
    onLockToViewport(newLocked);
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

  const { score, conditions, signalLabel } = evaluation;
  const sentimentLabel = getSentimentLabel(score);
  const scorePrefix = score > 0 ? '+' : '';
  // Scale bar against 300-point max (triple-zone confluence ceiling).
  const SCORE_BAR_MAX = 300;
  const absPct = Math.min(100, (Math.abs(score) / SCORE_BAR_MAX) * 100);
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

  // Read-only indicator condition IDs — these display information only and have no adjustable weight.
  const readOnlyIndicators = useMemo(
    () => conditions
      .filter(c => c.id && READONLY_INDICATOR_IDS.includes(c.id))
      .map(c => ({
        id: c.id!,
        fullName: c.name,
        value: c.value,
        score: c.score ?? 0,
        met: c.met,
      })),
    [conditions],
  );

  const adjustableConditions = useMemo(
    () => weightedConditions.filter(c => !READONLY_INDICATOR_IDS.includes(c.id)),
    [weightedConditions],
  );

  const showWeightAdjuster = adjustableConditions.length > 0 || readOnlyIndicators.length > 0;

  // Derive trend direction arrow and multiplier from the trendStrength condition (Smart Money only).
  // The value encodes direction as a leading arrow character, e.g. "↑1.40x" or "↓1.20x".
  const trendStrengthCond = (systemId === 'smart-money' || systemId === 'smc-trend-engine')
    ? conditions.find(c => c.id === 'trendStrength')
    : undefined;
  const trendIndicatorDisplay = trendStrengthCond?.value; // e.g. "↑1.40x"
  const trendDirectionArrow = trendIndicatorDisplay?.[0]; // leading arrow character

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
          {lockedToViewport && (
            <span className="text-[9px] px-1 py-0.5 bg-blue-600 text-white rounded uppercase font-bold flex-shrink-0">
              LOCKED
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onLockToViewport && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleToggleLock(); }}
              className={cn(
                'p-2 rounded transition-colors',
                lockedToViewport
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'hover:bg-slate-700/60',
              )}
              title={lockedToViewport ? 'Unlock (return to real-time)' : 'Lock to viewport (backtest visible range)'}
              disabled={!lockedToViewport && canLockToViewport === false}
            >
              {lockedToViewport
                ? <Lock className="h-4 w-4" />
                : <Unlock className="h-4 w-4 text-slate-400" />
              }
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            className="p-2 rounded hover:bg-slate-700/60 transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded
              ? <ChevronUp className="h-4 w-4 text-slate-400" />
              : <ChevronDown className="h-4 w-4 text-slate-400" />
            }
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-2 rounded hover:bg-slate-700/60 hover:text-red-400 transition-colors"
            title="Close"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Compact score display (always visible) */}
      <div className="px-3 py-2">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-2xl font-bold', getScoreColor(score))}>
              {scorePrefix}{score}
            </span>
            {trendIndicatorDisplay && (
              <span className={cn(
                'text-xs font-semibold',
                trendDirectionArrow === '↑' ? 'text-emerald-400' : trendDirectionArrow === '↓' ? 'text-rose-400' : 'text-slate-400',
              )}>
                {trendIndicatorDisplay}
              </span>
            )}
          </div>
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

          {/* Viewport Backtest Stats */}
          {lockedToViewport && viewportSignals && (
            <div className="border-t border-slate-700/60 pt-2 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Viewport Backtest</div>
              <div className="text-xs text-slate-300">
                <span className="font-semibold">{viewportSignals.buySignals.length + viewportSignals.sellSignals.length}</span>
                {' signals in '}
                <span className="font-semibold">{viewportSignals.totalCandles}</span>
                {' candles'}
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-400">
                  {viewportSignals.buySignals.length}↑ Buy
                </span>
                <span className="text-rose-400">
                  {viewportSignals.sellSignals.length}↓ Sell
                </span>
              </div>
            </div>
          )}

          {/* Find Max Opportunity button */}
          {lockedToViewport && onFindMaxOpportunity && (
            <div className="border-t border-slate-700/60 pt-2">
              <button
                type="button"
                onClick={onFindMaxOpportunity}
                disabled={isAnalyzingOpportunities}
                className={cn(
                  'w-full py-2 px-3 rounded text-xs font-semibold transition-all',
                  isAnalyzingOpportunities
                    ? 'bg-blue-600/50 text-blue-200 cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700 text-white',
                )}
              >
                {isAnalyzingOpportunities ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Analyzing Confluence...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    🎯 Find Max Opportunity Zones
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Maximum Opportunity Zones list */}
          {maxOpportunityZones && maxOpportunityZones.length > 0 && (
            <div className="border-t border-slate-700/60 pt-2 mt-2 space-y-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center justify-between">
                <span>Maximum Opportunity Zones</span>
                {onClearOpportunityZones && (
                  <button
                    type="button"
                    onClick={onClearOpportunityZones}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              {maxOpportunityZones.slice(0, 3).map((zone, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-2 rounded border',
                    zone.strength === 'extreme' && 'bg-purple-900/20 border-purple-500/50',
                    zone.strength === 'high' && 'bg-blue-900/20 border-blue-500/50',
                    zone.strength === 'moderate' && 'bg-cyan-900/20 border-cyan-500/50',
                    zone.strength === 'low' && 'bg-slate-800/40 border-slate-600/50',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-white">#{idx + 1} Zone</span>
                      <span className={cn(
                        'text-[9px] px-1 py-0.5 rounded uppercase font-bold',
                        zone.strength === 'extreme' && 'bg-purple-600 text-white',
                        zone.strength === 'high' && 'bg-blue-600 text-white',
                        zone.strength === 'moderate' && 'bg-cyan-600 text-white',
                        zone.strength === 'low' && 'bg-slate-600 text-white',
                      )}>
                        {zone.strength}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-white">
                      ${zone.priceLevel.toFixed(2)}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-300 mb-1">{zone.description}</div>

                  <div className="flex flex-wrap gap-1 mt-1">
                    {zone.factors.slice(0, 4).map((factor, fidx) => (
                      <span
                        key={fidx}
                        className="text-[9px] px-1 py-0.5 rounded bg-slate-700/50 text-slate-300"
                      >
                        {factor.label}
                      </span>
                    ))}
                    {zone.factors.length > 4 && (
                      <span className="text-[9px] text-slate-500">
                        +{zone.factors.length - 4} more
                      </span>
                    )}
                  </div>

                  {onJumpToZone && (
                    <button
                      type="button"
                      onClick={() => onJumpToZone(zone.candleIndex)}
                      className="mt-2 w-full py-1 px-2 bg-slate-700 hover:bg-slate-600 rounded text-[10px] text-slate-200 transition-colors"
                    >
                      Jump to Zone →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Conditions list */}
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
                {adjustableConditions.length > 0 && (
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
                )}
              </div>

              {readOnlyIndicators.length > 0 && (
                <CompactIndicatorRow conditions={readOnlyIndicators} />
              )}

              <div className="space-y-0.5">
                {adjustableConditions.map(condition => (
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

          {(systemId === 'smart-money' || systemId === 'smc-trend-engine') && scoringInput && (
            <SMCDebugTable evaluation={evaluation} scoringInput={scoringInput} />
          )}
        </div>
      )}
    </div>
  );
}

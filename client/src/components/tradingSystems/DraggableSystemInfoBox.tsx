import { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { TRADING_SYSTEMS } from '@/types/tradingSystems';
import { cn } from '@/lib/utils';
import type { SystemEvaluation } from '@/types/systemScoring';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import { SMCDebugTable } from './SMCDebugTable';

interface ScoredCondition {
  name: string;
  met: boolean;
  weight: number;
  value?: string;
}

interface SystemEvaluationSummary {
  systemId: string;
  score: number;
  confidence: number;
  conditions: ScoredCondition[];
  signalLabel: string;
  signalColor: string;
}

interface HistoricalSummary {
  totalSignals: number;
  buySignals: number;
  sellSignals: number;
  lookbackCandles: number;
}

interface DraggableSystemInfoBoxProps {
  activeSystemId: string;
  evaluation: SystemEvaluationSummary | null;
  historicalSummary: HistoricalSummary | null;
  onClose: () => void;
  scoringInput?: ScoringInput;
  fullEvaluation?: SystemEvaluation;
}

export function DraggableSystemInfoBox({
  activeSystemId,
  evaluation,
  historicalSummary,
  onClose,
  scoringInput,
  fullEvaluation,
}: DraggableSystemInfoBoxProps) {
  const [collapsed, setCollapsed] = useState(false);

  const [buyThreshold, setBuyThreshold] = useState(() => {
    const saved = localStorage.getItem(`tradingSystem_${activeSystemId}_buyThreshold`);
    return saved ? parseInt(saved, 10) : 70;
  });

  const [sellThreshold, setSellThreshold] = useState(() => {
    const saved = localStorage.getItem(`tradingSystem_${activeSystemId}_sellThreshold`);
    return saved ? parseInt(saved, 10) : 70;
  });

  const adjustThreshold = (type: 'buy' | 'sell', delta: number) => {
    if (type === 'buy') {
      const newVal = Math.max(0, Math.min(100, buyThreshold + delta));
      setBuyThreshold(newVal);
      localStorage.setItem(`tradingSystem_${activeSystemId}_buyThreshold`, newVal.toString());
    } else {
      const newVal = Math.max(0, Math.min(100, sellThreshold + delta));
      setSellThreshold(newVal);
      localStorage.setItem(`tradingSystem_${activeSystemId}_sellThreshold`, newVal.toString());
    }
  };

  const { position, isDragging, dragHandleProps } = useDraggable({
    initialPosition: { x: typeof window !== 'undefined' ? window.innerWidth - 260 : 800, y: 80 },
    storageKey: 'activeSystemInfoBoxPosition',
  });

  const system = TRADING_SYSTEMS[activeSystemId as keyof typeof TRADING_SYSTEMS];
  if (!system) return null;

  const score = evaluation?.score ?? 0;
  const absPct = Math.abs(score);

  // Bar fill: positive = right from left, negative = left from right (shown as reversed)
  const barFillPct = absPct;
  const isBullish = score >= 0;

  return (
    <div
      data-draggable
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        opacity: isDragging ? 0.85 : 1,
        zIndex: 60,
        width: collapsed ? 180 : 270,
      }}
      className="rounded-lg border border-slate-700 bg-slate-900/95 shadow-xl backdrop-blur-sm text-white select-none"
    >
      {/* Drag handle / header */}
      <div
        {...dragHandleProps}
        className="flex items-center justify-between px-2 py-1.5 border-b border-slate-700/60 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base leading-none flex-shrink-0">{system.icon}</span>
          <span className="text-[11px] font-semibold text-blue-300 truncate">{system.name}</span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCollapsed(v => !v); }}
            className="p-0.5 rounded hover:bg-slate-700/60 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed
              ? <ChevronDown className="h-3 w-3 text-slate-400" />
              : <ChevronUp className="h-3 w-3 text-slate-400" />
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

      {!collapsed && (
        <div className="px-2 py-2 space-y-2">
          {/* Score display */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wide">Current Score</span>
              <span
                className="text-sm font-bold"
                style={{ color: evaluation?.signalColor ?? '#94a3b8' }}
              >
                {score > 0 ? '+' : ''}{score}%
              </span>
            </div>

            {/* Score bar */}
            <div className="h-2 rounded-full bg-slate-700 overflow-hidden flex">
              {isBullish ? (
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${barFillPct}%`, backgroundColor: evaluation?.signalColor ?? '#94a3b8' }}
                />
              ) : (
                <div className="flex-1 flex justify-end">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${barFillPct}%`, backgroundColor: evaluation?.signalColor ?? '#94a3b8' }}
                  />
                </div>
              )}
            </div>

            {/* Signal label */}
            <div className="text-center">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{
                  color: evaluation?.signalColor ?? '#94a3b8',
                  backgroundColor: `${evaluation?.signalColor ?? '#94a3b8'}20`,
                }}
              >
                {evaluation?.signalLabel ?? 'NEUTRAL'}
              </span>
            </div>
          </div>

          {/* Conditions */}
          {evaluation?.conditions && evaluation.conditions.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Conditions</div>
              {evaluation.conditions.slice(0, 6).map((cond, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className={cn(
                    'text-[11px] flex-shrink-0 leading-tight',
                    cond.met ? 'text-emerald-400' : 'text-slate-600'
                  )}>
                    {cond.met ? '✓' : '○'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      'text-[10px] leading-tight',
                      cond.met ? 'text-slate-200' : 'text-slate-500'
                    )}>
                      {cond.name}
                    </span>
                    {cond.value && (
                      <span className="text-[10px] text-slate-500 ml-1">({cond.value})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Signal Thresholds */}
          <div className="border-t border-slate-700/60 pt-1.5 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Signal Thresholds</div>
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

          {/* Historical signals */}
          {historicalSummary && (
            <div className="border-t border-slate-700/60 pt-1.5 space-y-0.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Historical Signals</div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Total</span>
                <span className="font-semibold text-slate-200">
                  {historicalSummary.totalSignals} / {historicalSummary.lookbackCandles} candles
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-emerald-400">Buy signals</span>
                <span className="font-semibold text-emerald-300">{historicalSummary.buySignals}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-rose-400">Sell signals</span>
                <span className="font-semibold text-rose-300">{historicalSummary.sellSignals}</span>
              </div>
            </div>
          )}

          {(activeSystemId === 'smart-money' || activeSystemId === 'smc-trend-engine') && scoringInput && fullEvaluation && (
            <SMCDebugTable evaluation={fullEvaluation} scoringInput={scoringInput} />
          )}
        </div>
      )}
    </div>
  );
}

import { SMCDebugTable } from '@/components/tradingSystems/SMCDebugTable';
import type { SMCTrendEnginePanelData } from '@/components/trading/SMCTrendEngine/types';

interface SMCTrendEnginePanelProps {
  panelData?: SMCTrendEnginePanelData;
  title?: string;
  loadingText?: string;
}

function getScoreColor(score: number): string {
  if (score >= 60) return 'text-green-400';
  if (score >= 20) return 'text-lime-400';
  if (score > -20) return 'text-slate-300';
  if (score > -60) return 'text-orange-400';
  return 'text-red-400';
}

export function SMCTrendEnginePanel({
  panelData,
  title = 'SMC Trend Engine',
  loadingText = 'Waiting for SMC Trend Engine data...',
}: SMCTrendEnginePanelProps) {
  if (!panelData?.evaluation || !panelData.scoringInput) {
    return <div className="text-xs text-slate-400">{loadingText}</div>;
  }

  const score = panelData.evaluation.score ?? 0;

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-200">{title}</div>
        <div className={`text-sm font-bold ${getScoreColor(score)}`}>
          {score > 0 ? '+' : ''}{score.toFixed(0)}
        </div>
      </div>

      <div className="mb-2 h-2 overflow-hidden rounded bg-slate-800">
        <div
          className={`h-full transition-all ${score >= 20 ? 'bg-green-500' : score <= -20 ? 'bg-red-500' : 'bg-slate-500'}`}
          style={{ width: `${Math.max(0, Math.min(100, (score + 100) / 2))}%` }}
        />
      </div>

      <div className="mb-3 text-[11px] text-slate-400">
        {panelData.evaluation.signalLabel} • Confidence {Math.round(panelData.evaluation.confidence)}%
      </div>

      <div className="space-y-1">
        {[...(panelData.evaluation.conditions ?? [])]
          .sort((a, b) => Math.abs((b.score ?? b.weightedScore ?? 0)) - Math.abs((a.score ?? a.weightedScore ?? 0)))
          .slice(0, 5)
          .map((condition, idx) => {
            const conditionScore = condition.score ?? condition.weightedScore ?? 0;
            const conditionColor = conditionScore === 0 ? 'text-slate-400' : conditionScore > 0 ? 'text-green-400' : 'text-red-400';
            return (
              <div key={`${condition.name}-${idx}`} className="flex items-center justify-between text-[11px]">
                <span className="truncate pr-2 text-slate-300">{condition.name}</span>
                <span className={`font-mono ${conditionColor}`}>
                  {conditionScore > 0 ? '+' : ''}{Math.round(conditionScore)}
                </span>
              </div>
            );
          })}
      </div>

      <SMCDebugTable
        evaluation={panelData.evaluation}
        scoringInput={panelData.scoringInput}
      />
    </>
  );
}


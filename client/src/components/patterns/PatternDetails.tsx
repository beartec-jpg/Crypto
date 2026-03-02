import type { PatternDetectionItem } from '@/services/patternDetectors.ts';

interface PatternDetailsProps {
  item: PatternDetectionItem;
}

function renderStageBars(stage: number): string {
  const filled = Math.max(0, Math.min(5, stage));
  return `${'▰'.repeat(filled)}${'▱'.repeat(5 - filled)}`;
}

function confidenceClass(confidence: number): string {
  if (confidence >= 80) return 'bg-green-500';
  if (confidence >= 60) return 'bg-emerald-500';
  if (confidence >= 40) return 'bg-yellow-500';
  if (confidence >= 25) return 'bg-orange-500';
  return 'bg-slate-500';
}

export function PatternDetails({ item }: PatternDetailsProps) {
  const { definition, result } = item;
  const isActive = result.score > 70;

  return (
    <div className="mt-3 border-t border-slate-700/60 pt-3 space-y-2.5">
      {/* Stage progress */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
          <span>Stage Progress</span>
          <span>{result.stageName}</span>
        </div>
        <div className="text-base text-slate-300 font-mono tracking-widest">
          {renderStageBars(result.stage)}
        </div>
      </div>

      {/* Orderflow signals */}
      <div>
        <div className="text-[11px] text-slate-400 mb-1">
          Orderflow <span className="text-slate-300 font-medium">{result.orderflowScore}/60</span>
        </div>
        <div className="space-y-0.5">
          {result.signals.orderflow.map((sig) => (
            <div key={sig.name} className="flex items-center gap-1.5 text-[11px]">
              <span className={sig.met ? 'text-emerald-400' : 'text-slate-600'}>
                {sig.met ? '●' : '○'}
              </span>
              <span className={sig.met ? 'text-slate-200' : 'text-slate-500'}>{sig.name}</span>
              {sig.met && sig.points > 0 && (
                <span className="ml-auto text-emerald-400 font-medium">+{sig.points}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Technical signals */}
      <div>
        <div className="text-[11px] text-slate-400 mb-1">
          Technical <span className="text-slate-300 font-medium">{result.technicalScore}/40</span>
        </div>
        <div className="space-y-0.5">
          {result.signals.technical.map((sig) => (
            <div key={sig.name} className="flex items-center gap-1.5 text-[11px]">
              <span className={sig.met ? 'text-blue-400' : 'text-slate-600'}>
                {sig.met ? '●' : '○'}
              </span>
              <span className={sig.met ? 'text-slate-200' : 'text-slate-500'}>{sig.name}</span>
              {sig.met && sig.points > 0 && (
                <span className="ml-auto text-blue-400 font-medium">+{sig.points}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Confidence</span>
          <span>{result.confidence}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full ${confidenceClass(result.confidence)}`}
            style={{ width: `${Math.max(0, Math.min(100, result.confidence))}%` }}
          />
        </div>
      </div>

      {/* Prerequisites */}
      <div className={`text-[11px] ${result.prerequisitesMet ? 'text-emerald-400' : 'text-slate-500'}`}>
        {result.prerequisitesMet ? '✓ Prerequisites met' : '✗ Prerequisites not met'}
      </div>

      {/* Active recommendation */}
      {isActive && (
        <div className="rounded border border-emerald-600/50 bg-emerald-950/30 px-2 py-1.5 text-[11px] text-emerald-200">
          🔔 {definition.activeMessage}
        </div>
      )}
    </div>
  );
}

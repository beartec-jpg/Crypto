import type { PatternDetectionItem } from '@/services/patternDetectors.ts';

interface PatternCardProps {
  item: PatternDetectionItem;
}

function scoreClass(score: number): string {
  if (score >= 80) return 'text-green-300';
  if (score >= 70) return 'text-emerald-300';
  if (score >= 50) return 'text-yellow-300';
  if (score >= 35) return 'text-orange-300';
  return 'text-slate-300';
}

function confidenceClass(confidence: number): string {
  if (confidence >= 80) return 'bg-green-500';
  if (confidence >= 60) return 'bg-emerald-500';
  if (confidence >= 40) return 'bg-yellow-500';
  if (confidence >= 25) return 'bg-orange-500';
  return 'bg-slate-500';
}

function renderStageBars(stage: number): string {
  const filled = Math.max(0, Math.min(5, stage));
  const empty = 5 - filled;
  return `${'▰'.repeat(filled)}${'▱'.repeat(Math.max(0, empty))}`;
}

export function PatternCard({ item }: PatternCardProps) {
  const { definition, result } = item;
  const isActive = result.score > 70;

  return (
    <div className={`rounded-lg border ${definition.borderClass} bg-slate-900/85 p-3.5`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold text-white">
            {definition.emoji} {definition.name}
          </h5>
          <p className="text-xs text-slate-400 mt-1">{result.stageName}</p>
        </div>
        <div className={`text-3xl leading-none font-bold ${scoreClass(result.score)}`}>{result.score}</div>
      </div>

      <div className="mt-2 text-sm text-slate-300 font-mono">{renderStageBars(result.stage)}</div>

      <div className="mt-2 text-xs text-slate-300">
        Orderflow: {result.orderflowScore}/60, Technical: {result.technicalScore}/40
      </div>

      <div className="mt-2">
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

      {isActive && (
        <div className="mt-2 rounded border border-emerald-600/50 bg-emerald-950/30 px-2 py-1.5 text-[11px] text-emerald-200">
          🔔 Signal Active - {definition.recommendation}
        </div>
      )}
    </div>
  );
}

interface PatternGridProps {
  patterns: PatternDetectionItem[];
}

export function PatternGrid({ patterns }: PatternGridProps) {
  const strongest = patterns.reduce<PatternDetectionItem | null>((best, current) => {
    if (!best) return current;
    return current.result.score > best.result.score ? current : best;
  }, null);

  const hasActiveSignal = strongest !== null && strongest.result.score > 70;

  return (
    <div className="space-y-3">
      {hasActiveSignal && strongest && (
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-950/25 p-3">
          <div className="text-sm font-semibold text-emerald-200">
            🔔 ACTIVE: {strongest.definition.name} ({strongest.result.score}/100)
          </div>
          <div className="text-xs text-emerald-100/90 mt-1">{strongest.definition.recommendation}</div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {patterns.map((item) => (
          <PatternCard key={item.definition.key} item={item} />
        ))}
      </div>
    </div>
  );
}

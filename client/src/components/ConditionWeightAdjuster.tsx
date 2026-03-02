import { setConditionWeight, type WeightLevel } from '@/lib/conditionWeights';
import type { WeightedConditionResult } from '@/lib/conditionWeights';

interface Props {
  systemId: string;
  condition: WeightedConditionResult;
  onWeightChange: () => void;
}

const WEIGHT_LABELS: Record<WeightLevel, string> = {
  0: 'Disabled',
  1: 'Normal importance',
  2: 'High importance',
  3: 'Critical importance',
};

export function ConditionWeightAdjuster({ systemId, condition, onWeightChange }: Props) {
  const handleWeightChange = (newWeight: WeightLevel) => {
    setConditionWeight(systemId, condition.id, newWeight);
    onWeightChange();
  };

  const weightColor = {
    0: 'text-slate-500',
    1: 'text-blue-400',
    2: 'text-orange-400',
    3: 'text-red-400 font-bold',
  }[condition.weight];

  const scoreColor =
    Math.abs(condition.score) >= 70
      ? 'text-green-400'
      : Math.abs(condition.score) >= 40
        ? 'text-yellow-400'
        : 'text-slate-400';

  return (
    <div className="py-2 border-b border-slate-700/40 last:border-b-0 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm text-slate-200 leading-tight break-words">{condition.name}</span>
          {condition.weight === 0 && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">Disabled</span>
          )}
        </div>
        <span className={`w-14 text-right font-mono text-sm ${scoreColor} flex-shrink-0`}>
          {condition.score > 0 ? '+' : ''}
          {condition.score}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleWeightChange(Math.max(0, condition.weight - 1) as WeightLevel)}
            disabled={condition.weight === 0}
            className="w-7 h-7 rounded border border-slate-600 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Decrease weight"
            title="Decrease condition weight"
          >
            −
          </button>

          <span
            className={`w-8 text-center text-base ${weightColor}`}
            title={WEIGHT_LABELS[condition.weight]}
          >
            {condition.weight}
          </span>

          <button
            onClick={() => handleWeightChange(Math.min(3, condition.weight + 1) as WeightLevel)}
            disabled={condition.weight === 3}
            className="w-7 h-7 rounded border border-slate-600 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Increase weight"
            title="Increase condition weight"
          >
            +
          </button>
        </div>

        <ScoreBar score={condition.score} />
      </div>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const percentage = Math.abs(score);
  const color = score >= 0 ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className="w-24 sm:w-28 h-2 bg-slate-700 rounded-full overflow-hidden flex-shrink-0">
      <div
        className={`h-full ${color} transition-all duration-300`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

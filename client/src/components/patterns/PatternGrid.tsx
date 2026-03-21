import { useState } from 'react';
import type { PatternDetectionItem } from '@/services/patternDetectors.ts';
import { PatternGauge } from './PatternGauge';
import { PatternDetails } from './PatternDetails';

interface PatternCardProps {
  item: PatternDetectionItem;
  expanded: boolean;
  onToggle: () => void;
}

function scoreClass(score: number): string {
  if (score >= 80) return 'text-green-300';
  if (score >= 70) return 'text-emerald-300';
  if (score >= 50) return 'text-yellow-300';
  if (score >= 35) return 'text-orange-300';
  return 'text-slate-300';
}

export function PatternCard({ item, expanded, onToggle }: PatternCardProps) {
  const { definition, result } = item;

  return (
    <div
      className={`rounded-lg border ${definition.borderClass} bg-slate-900/85 p-4 cursor-pointer select-none transition-colors duration-150 hover:bg-slate-800/85`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${definition.name} pattern details`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-expanded={expanded}
    >
      {/* Semi-circular gauge */}
      <PatternGauge score={result.score} />

      {/* Score number */}
      <div className={`text-center text-4xl font-bold leading-none -mt-2 ${scoreClass(result.score)}`}>
        {result.score}
      </div>

      {/* Pattern name */}
      <div className="mt-2 text-center">
        <div className="text-sm font-semibold text-white leading-snug">
          {definition.emoji} {definition.name}
        </div>
      </div>

      {/* Expanded details (in-place) */}
      {expanded && <PatternDetails item={item} />}
    </div>
  );
}

interface PatternGridProps {
  patterns: PatternDetectionItem[];
}

export function PatternGrid({ patterns }: PatternGridProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  function handleToggle(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {patterns.map((item) => (
        <PatternCard
          key={item.definition.key}
          item={item}
          expanded={expandedKey === item.definition.key}
          onToggle={() => handleToggle(item.definition.key)}
        />
      ))}
    </div>
  );
}

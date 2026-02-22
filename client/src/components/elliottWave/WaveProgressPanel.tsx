/**
 * WaveProgressPanel
 *
 * Floating panel that displays the current Elliott Wave progressive drawing state:
 *   – Pattern detection result (auto-detected type)
 *   – Fibonacci ratios at each pivot
 *   – Real-time Elliott Wave rule validation
 *   – Wave degree selector
 *   – Undo / Reset controls
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, Undo2, RotateCcw } from 'lucide-react';
import type { UseElliottWaveProgressiveResult } from '@/hooks/useElliottWaveProgressive';
import type { WaveFibResult } from '@/lib/elliottWave/fibCalculator';
import type { ValidationRule } from '@/lib/elliottWave/patternDetector';

interface WaveProgressPanelProps {
  wave: UseElliottWaveProgressiveResult;
  /** Optional className for the outer container */
  className?: string;
}

// Colour map for quality badges
const QUALITY_COLORS: Record<WaveFibResult['quality'], string> = {
  excellent: 'bg-emerald-600 text-white',
  good:      'bg-green-600 text-white',
  ok:        'bg-yellow-600 text-white',
  valid:     'bg-orange-500 text-white',
  poor:      'bg-red-600 text-white',
};

function FibRatioRow({ result }: { result: WaveFibResult }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-slate-300 font-medium w-16 shrink-0">{result.wave}</span>
      <span className="text-xs text-slate-400 flex-1 truncate">{result.description}</span>
      <span
        className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${QUALITY_COLORS[result.quality]}`}
      >
        {result.quality}
      </span>
    </div>
  );
}

function ValidationRow({ rule }: { rule: ValidationRule }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className={`text-xs mt-0.5 shrink-0 ${rule.passed ? 'text-emerald-400' : 'text-red-400'}`}>
        {rule.passed ? '✓' : '✗'}
      </span>
      <span className={`text-xs ${rule.passed ? 'text-slate-300' : 'text-red-300'}`}>
        {rule.message}
      </span>
    </div>
  );
}

function PatternBadge({ pattern }: { pattern: string }) {
  const colorMap: Record<string, string> = {
    abc_correction:   'bg-blue-700 text-white',
    impulse_forming:  'bg-purple-700 text-white',
    impulse_complete: 'bg-emerald-700 text-white',
    unknown:          'bg-slate-600 text-slate-200',
  };
  const color = colorMap[pattern] ?? colorMap.unknown;
  const labels: Record<string, string> = {
    abc_correction:   'ABC',
    impulse_forming:  'Impulse ▶',
    impulse_complete: 'Impulse ✓',
    unknown:          '—',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${color}`}>
      {labels[pattern] ?? pattern}
    </span>
  );
}

export function WaveProgressPanel({ wave, className = '' }: WaveProgressPanelProps) {
  const { detection, waveDegree, placedPoints, canUndo, isActive } = wave;

  if (!isActive) return null;

  const pointCount = placedPoints.length;

  return (
    <div
      className={`bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 w-72 select-none ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
            Elliott Wave
          </span>
          <PatternBadge pattern={detection.detectedPattern} />
        </div>
        <div className="flex items-center gap-1">
          {/* Wave degree controls */}
          <button
            onClick={wave.decrementDegree}
            title="Decrease wave degree"
            className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          <span className="text-xs text-slate-300 font-medium w-20 text-center">
            {waveDegree}
          </span>
          <button
            onClick={wave.incrementDegree}
            title="Increase wave degree"
            className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Pattern label + validity indicator */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-300">{detection.patternLabel}</span>
        {detection.validationRules.length > 0 && (
          <Badge
            variant="outline"
            className={`text-xs px-1.5 py-0 ${
              detection.isValid
                ? 'border-emerald-600 text-emerald-400'
                : 'border-red-600 text-red-400'
            }`}
          >
            {detection.isValid ? 'Valid' : 'Invalid'}
          </Badge>
        )}
      </div>

      {/* Progress dots (0–5) */}
      <div className="flex items-center gap-1.5 mb-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={`flex items-center justify-center rounded-full text-xs font-bold transition-colors
              ${i < pointCount
                ? 'w-5 h-5 bg-blue-600 text-white'
                : 'w-5 h-5 border border-slate-600 text-slate-500'
              }`}
          >
            {i}
          </div>
        ))}
        <span className="text-xs text-slate-500 ml-1">{pointCount}/6</span>
      </div>

      {/* Next point hint */}
      {detection.nextPointHint && (
        <div className="bg-slate-800 rounded px-2 py-1.5 mb-2">
          <p className="text-xs text-slate-300 leading-snug">{detection.nextPointHint}</p>
        </div>
      )}

      {/* Fibonacci ratios */}
      {detection.fibRatios.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Fib Ratios
          </p>
          <div className="divide-y divide-slate-800">
            {detection.fibRatios.map((r, i) => (
              <FibRatioRow key={i} result={r} />
            ))}
          </div>
        </div>
      )}

      {/* Validation rules */}
      {detection.validationRules.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Rules
          </p>
          <div>
            {detection.validationRules.map((r, i) => (
              <ValidationRow key={i} rule={r} />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-2 pt-2 border-t border-slate-800">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-700"
          disabled={!canUndo}
          onClick={wave.undo}
        >
          <Undo2 className="h-3 w-3 mr-1" />
          Undo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-700"
          onClick={wave.reset}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-7 text-xs text-slate-400 hover:text-white hover:bg-slate-700"
          onClick={wave.deactivateMode}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

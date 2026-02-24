/**
 * PredictiveWavePanel
 *
 * Floating panel for the Elliott Wave tool.
 * Shows current wave progress, fibonacci levels, and controls.
 */

import { Button } from '@/components/ui/button';
import { Undo2, RotateCcw, Save } from 'lucide-react';
import type { UseElliottWaveResult } from '@/hooks/usePredictiveElliottWave';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';

interface PredictiveWavePanelProps {
  wave: UseElliottWaveResult;
  onSave?: () => void;
  className?: string;
}

function FibLevelRow({ level }: { level: FibLevel }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className={`text-xs font-mono w-12 shrink-0 ${level.isRetrace ? 'text-amber-400' : 'text-blue-400'}`}>
        {level.label}
      </span>
      <span className="text-xs text-slate-300 font-mono">{level.price.toFixed(2)}</span>
      <span className="text-xs text-slate-500 shrink-0">{level.isRetrace ? 'ret' : 'ext'}</span>
    </div>
  );
}

export function PredictiveWavePanel({ wave, onSave, className = '' }: PredictiveWavePanelProps) {
  const { isActive, isComplete, points, fibProjections, canUndo, canSave } = wave;

  if (!isActive) return null;

  const progress = `${points.length} / 6`;

  return (
    <div className={`bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 w-72 select-none ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
            Elliott Wave
          </span>
          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
            isComplete ? 'bg-emerald-700 text-white' : 'bg-blue-700 text-white'
          }`}>
            Impulse
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">{progress}</span>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center justify-center rounded-full text-xs font-bold transition-colors
              ${i < points.length
                ? 'w-5 h-5 bg-blue-600 text-white'
                : 'w-5 h-5 border border-slate-600 text-slate-500'
              }`}
          >
            {i}
          </div>
        ))}
      </div>

      {/* Fib levels */}
      {fibProjections.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Fibonacci Levels
          </p>
          <div className="divide-y divide-slate-800">
            {fibProjections.map((level, i) => (
              <FibLevelRow key={i} level={level} />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-800">
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
        {onSave && (
          <Button
            size="sm"
            className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white mt-1"
            disabled={!canSave}
            onClick={onSave}
          >
            <Save className="h-3 w-3 mr-1" />
            Finish &amp; Save
          </Button>
        )}
      </div>
    </div>
  );
}

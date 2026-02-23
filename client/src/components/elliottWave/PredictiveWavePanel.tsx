/**
 * PredictiveWavePanel
 *
 * Floating panel for the predictive Elliott Wave tool.
 * Shows current wave type, progress, predictive fib levels, and controls.
 */

import { Button } from '@/components/ui/button';
import { Undo2, RotateCcw, Save, ArrowRight } from 'lucide-react';
import type { UsePredictiveElliottWaveResult } from '@/hooks/usePredictiveElliottWave';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';
import { getWaveLabel, getSubPatternLabel } from '@/lib/elliottWave/waveStructures';

interface PredictiveWavePanelProps {
  wave: UsePredictiveElliottWaveResult;
  onSave?: () => void;
  className?: string;
}

const FIB_COLORS: Record<string, string> = {
  retrace: 'text-amber-400',
  extend: 'text-blue-400',
};

function FibLevelRow({ level }: { level: FibLevel }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className={`text-xs font-mono w-12 shrink-0 ${level.isRetrace ? FIB_COLORS.retrace : FIB_COLORS.extend}`}>
        {level.label}
      </span>
      <span className="text-xs text-slate-300 font-mono">{level.price.toFixed(2)}</span>
      <span className="text-xs text-slate-500 shrink-0">{level.isRetrace ? 'ret' : 'ext'}</span>
    </div>
  );
}

export function PredictiveWavePanel({ wave, onSave, className = '' }: PredictiveWavePanelProps) {
  const {
    mode,
    selectedWaveType,
    selectedSubPattern,
    placedPoints,
    expectedPointCount,
    predictiveFibLevels,
    suggestedNextWave,
    continueToNextWave,
    canUndo,
    canSave,
    getStatusText,
  } = wave;

  if (!wave.isActive || mode === 'selecting') return null;

  const waveLabel = selectedWaveType ? getWaveLabel(selectedWaveType) : '—';
  const subPatternLabel = selectedSubPattern ? getSubPatternLabel(selectedSubPattern) : null;
  const progress = `${placedPoints.length} / ${expectedPointCount}`;

  return (
    <div className={`bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 w-72 select-none ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
            Elliott Wave
          </span>
          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
            mode === 'complete' ? 'bg-emerald-700 text-white' : 'bg-blue-700 text-white'
          }`}>
            {waveLabel}
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">{progress}</span>
      </div>

      {/* Sub-pattern */}
      {subPatternLabel && (
        <div className="mb-2">
          <span className="text-xs text-slate-400">{subPatternLabel}</span>
        </div>
      )}

      {/* Status */}
      <div className="bg-slate-800 rounded px-2 py-1.5 mb-2">
        <p className="text-xs text-slate-300 leading-snug">{getStatusText()}</p>
      </div>

      {/* Progress dots */}
      {expectedPointCount > 0 && (
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {Array.from({ length: expectedPointCount }).map((_, i) => (
            <div
              key={i}
              className={`flex items-center justify-center rounded-full text-xs font-bold transition-colors
                ${i < placedPoints.length
                  ? placedPoints[i]?.isMidAir
                    ? 'w-5 h-5 border-2 border-orange-400 text-orange-400 bg-transparent'
                    : 'w-5 h-5 bg-blue-600 text-white'
                  : 'w-5 h-5 border border-slate-600 text-slate-500'
                }`}
            >
              {i}
            </div>
          ))}
        </div>
      )}

      {/* Predictive fib levels */}
      {predictiveFibLevels.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
            {mode === 'complete' ? 'Next Wave Targets' : 'Sub-Wave Targets'}
          </p>
          <div className="divide-y divide-slate-800">
            {predictiveFibLevels.map((level, i) => (
              <FibLevelRow key={i} level={level} />
            ))}
          </div>
        </div>
      )}

      {/* Mid-air legend */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-600" />
          <span className="text-xs text-slate-500">Anchored</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full border-2 border-orange-400" />
          <span className="text-xs text-slate-500">Mid-air</span>
        </div>
      </div>

      {/* Wave continuation */}
      {mode === 'complete' && suggestedNextWave && (
        <div className="mb-2">
          <Button
            size="sm"
            className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={continueToNextWave}
          >
            <ArrowRight className="h-3 w-3 mr-1" />
            Continue to {getWaveLabel(suggestedNextWave)}
          </Button>
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
            Finish & Save
          </Button>
        )}
      </div>
    </div>
  );
}

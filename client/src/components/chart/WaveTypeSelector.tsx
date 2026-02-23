/**
 * WaveTypeSelector
 *
 * Popup shown when the Elliott Wave tool is first activated.
 * User selects the wave type (and optionally a sub-pattern) BEFORE drawing begins.
 *
 * Categories:
 *   - Impulse: W1, W2, W3, W4, W5
 *   - Corrective: A, B, C
 *   - Complex: W, X, Y
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { WaveType, SubPattern } from '@/types/drawing';
import {
  WAVE_STRUCTURES,
  getWaveLabel,
  getSubPatternLabel,
} from '@/lib/elliottWave/waveStructures';

interface WaveTypeSelectorProps {
  onSelect: (waveType: WaveType, subPattern?: SubPattern) => void;
  onCancel: () => void;
}

type Category = 'impulse' | 'corrective' | 'complex';

const CATEGORY_LABELS: Record<Category, string> = {
  impulse: 'Impulse Waves',
  corrective: 'Corrective Waves',
  complex: 'Complex Corrections',
};

const CATEGORY_COLORS: Record<Category, string> = {
  impulse: 'text-blue-400',
  corrective: 'text-amber-400',
  complex: 'text-purple-400',
};

const WAVE_BUTTON_COLORS: Record<Category, string> = {
  impulse: 'bg-blue-700 hover:bg-blue-600 border-blue-600 text-white',
  corrective: 'bg-amber-700 hover:bg-amber-600 border-amber-600 text-white',
  complex: 'bg-purple-700 hover:bg-purple-600 border-purple-600 text-white',
};

const CATEGORY_WAVES: Record<Category, WaveType[]> = {
  impulse: ['W1', 'W2', 'W3', 'W4', 'W5'],
  corrective: ['A', 'B', 'C'],
  complex: ['W', 'X', 'Y'],
};

export function WaveTypeSelector({ onSelect, onCancel }: WaveTypeSelectorProps) {
  const [pendingWave, setPendingWave] = useState<WaveType | null>(null);

  const handleWaveClick = (waveType: WaveType) => {
    const structure = WAVE_STRUCTURES[waveType];
    if (structure.subPatterns && structure.subPatterns.length > 0) {
      // Show sub-pattern step
      setPendingWave(waveType);
    } else {
      onSelect(waveType);
    }
  };

  const handleSubPatternSelect = (subPattern: SubPattern) => {
    if (pendingWave) {
      onSelect(pendingWave, subPattern);
    }
  };

  const handleSkipSubPattern = () => {
    if (pendingWave) {
      onSelect(pendingWave);
    }
  };

  // Sub-pattern selection step
  if (pendingWave) {
    const structure = WAVE_STRUCTURES[pendingWave];
    const subPatterns = structure.subPatterns ?? [];
    const category = structure.category as Category;

    return (
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl p-5 w-80 select-none">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white leading-tight">
              {getWaveLabel(pendingWave)} – Select Pattern
            </h3>
            <p className="text-xs text-slate-400 mt-1">{structure.description}</p>
          </div>

          <div className="flex flex-col gap-2 mb-4">
            {subPatterns.map(sp => (
              <Button
                key={sp}
                size="sm"
                variant="outline"
                className="h-8 text-xs justify-start px-3 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white"
                onClick={() => handleSubPatternSelect(sp)}
              >
                {getSubPatternLabel(sp)}
              </Button>
            ))}
          </div>

          <div className="flex gap-2 pt-3 border-t border-slate-700">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 h-7 text-xs text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={handleSkipSubPattern}
            >
              Skip (Standard)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 h-7 text-xs text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={() => setPendingWave(null)}
            >
              ← Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Wave type selection step
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl p-5 w-80 select-none">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-sm font-bold text-white leading-tight">Select Wave Type</h3>
          <p className="text-xs text-slate-400 mt-1">Choose the wave you are about to draw</p>
        </div>

        {/* Categories */}
        {(['impulse', 'corrective', 'complex'] as Category[]).map(category => (
          <div key={category} className="mb-4">
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${CATEGORY_COLORS[category]}`}>
              {CATEGORY_LABELS[category]}
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_WAVES[category].map(waveType => (
                <Button
                  key={waveType}
                  size="sm"
                  className={`h-8 text-xs px-3 ${WAVE_BUTTON_COLORS[category]}`}
                  onClick={() => handleWaveClick(waveType)}
                >
                  {getWaveLabel(waveType)}
                </Button>
              ))}
            </div>
          </div>
        ))}

        {/* Cancel */}
        <div className="pt-3 border-t border-slate-700">
          <Button
            size="sm"
            variant="ghost"
            className="w-full h-7 text-xs text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

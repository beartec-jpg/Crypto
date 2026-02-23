/**
 * WaveClassificationPopup
 *
 * Modal popup shown after a 5-wave impulse or 3-wave correction is completed.
 * User picks which wave this structure represents (Wave 1-5, A-C, or Standalone).
 */

import { Button } from '@/components/ui/button';
import type { WaveNumber } from '@/hooks/useElliottWaveProgressive';

interface WaveClassificationPopupProps {
  isOpen: boolean;
  structureType: 'impulse' | 'correction';
  /** Suggested waves to highlight based on context */
  suggestedWaves: WaveNumber[];
  onClassify: (wave: WaveNumber | 'standalone') => void;
  onSkip: () => void;
}

/** Display label for each wave number */
const WAVE_LABELS: Record<WaveNumber | 'standalone', string> = {
  1: 'Wave 1', 2: 'Wave 2', 3: 'Wave 3', 4: 'Wave 4', 5: 'Wave 5',
  A: 'Wave A', B: 'Wave B', C: 'Wave C',
  standalone: 'Standalone',
};

const IMPULSE_WAVES: WaveNumber[] = [1, 3, 5, 'A', 'C'];
const CORRECTION_WAVES: WaveNumber[] = [2, 4, 'B'];

export function WaveClassificationPopup({
  isOpen,
  structureType,
  suggestedWaves,
  onClassify,
  onSkip,
}: WaveClassificationPopupProps) {
  if (!isOpen) return null;

  const waves = structureType === 'impulse' ? IMPULSE_WAVES : CORRECTION_WAVES;
  const title = structureType === 'impulse'
    ? '5-Wave Structure Complete!'
    : '3-Wave Correction Complete!';
  const subtitle = structureType === 'impulse'
    ? 'This impulse move is:'
    : 'This correction is:';

  return (
    /* Backdrop – blocks chart clicks while popup is open */
    <div
      className="absolute inset-0 z-40 flex items-center justify-center"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl p-5 w-72 select-none">
        {/* Title */}
        <div className="mb-3">
          <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        </div>

        {/* Wave buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          {waves.map(w => {
            const isSuggested = suggestedWaves.includes(w);
            return (
              <Button
                key={String(w)}
                size="sm"
                variant={isSuggested ? 'default' : 'outline'}
                className={`h-8 text-xs px-3 ${
                  isSuggested
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                    : 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
                onClick={() => onClassify(w)}
              >
                {WAVE_LABELS[w]}
              </Button>
            );
          })}
        </div>

        {/* Secondary actions */}
        <div className="flex gap-2 pt-3 border-t border-slate-700">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-xs text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={() => onClassify('standalone')}
          >
            Standalone
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-xs text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={onSkip}
          >
            Continue Drawing
          </Button>
        </div>
      </div>
    </div>
  );
}

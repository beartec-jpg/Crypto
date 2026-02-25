import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export const USER_SELECTABLE_DEGREES = [
  { name: 'Grand Supercycle', color: '#FF0000', impulseLabels: ['(I)', '(II)', '(III)', '(IV)', '(V)'], correctionLabels: ['(A)', '(B)', '(C)'], complexLabels: ['(W)', '(X)', '(Y)', '(Z)'] },
  { name: 'Supercycle',       color: '#FF6B00', impulseLabels: ['(I)', '(II)', '(III)', '(IV)', '(V)'], correctionLabels: ['(A)', '(B)', '(C)'], complexLabels: ['(W)', '(X)', '(Y)', '(Z)'] },
  { name: 'Cycle',            color: '#FFD700', impulseLabels: ['I',   'II',   'III',   'IV',   'V'  ], correctionLabels: ['A',   'B',   'C'  ], complexLabels: ['W',   'X',   'Y',   'Z'  ] },
  { name: 'Primary',          color: '#00FF00', impulseLabels: ['1',   '2',    '3',     '4',    '5'  ], correctionLabels: ['A',   'B',   'C'  ], complexLabels: ['W',   'X',   'Y',   'Z'  ] },
  { name: 'Intermediate',     color: '#00BFFF', impulseLabels: ['(1)', '(2)',  '(3)',   '(4)',  '(5)'], correctionLabels: ['(A)', '(B)', '(C)'], complexLabels: ['(W)', '(X)', '(Y)', '(Z)'] },
  { name: 'Minor',            color: '#0000FF', impulseLabels: ['1',   '2',    '3',     '4',    '5'  ], correctionLabels: ['A',   'B',   'C'  ], complexLabels: ['W',   'X',   'Y',   'Z'  ] },
  { name: 'Minute',           color: '#8B00FF', impulseLabels: ['i',   'ii',   'iii',   'iv',   'v'  ], correctionLabels: ['a',   'b',   'c'  ], complexLabels: ['w',   'x',   'y',   'z'  ] },
  { name: 'Minuette',         color: '#FF1493', impulseLabels: ['(i)', '(ii)', '(iii)', '(iv)', '(v)'], correctionLabels: ['(a)', '(b)', '(c)'], complexLabels: ['(w)', '(x)', '(y)', '(z)'] },
];

export const SUBMINUETTE_DEGREE = {
  name: 'Subminuette',
  color: '#808080',
  impulseLabels: ['i', 'ii', 'iii', 'iv', 'v'],
  correctionLabels: ['a', 'b', 'c'],
  complexLabels: ['w', 'x', 'y', 'z'],
};

export function getDegreeConfiguration(selectedDegreeName: string) {
  const degreeIndex = USER_SELECTABLE_DEGREES.findIndex(d => d.name === selectedDegreeName);
  if (degreeIndex === -1) {
    const fallback = USER_SELECTABLE_DEGREES[5]; // Minor
    return {
      impulse: { color: fallback.color, labels: fallback.impulseLabels, degree: fallback.name },
      correction: { color: USER_SELECTABLE_DEGREES[6].color, labels: USER_SELECTABLE_DEGREES[6].correctionLabels, degree: USER_SELECTABLE_DEGREES[6].name },
    };
  }
  const selected = USER_SELECTABLE_DEGREES[degreeIndex];
  const lowerDegree = degreeIndex === USER_SELECTABLE_DEGREES.length - 1
    ? SUBMINUETTE_DEGREE
    : USER_SELECTABLE_DEGREES[degreeIndex + 1];
  return {
    impulse: { color: selected.color, labels: selected.impulseLabels, degree: selected.name },
    correction: { color: lowerDegree.color, labels: lowerDegree.correctionLabels, degree: lowerDegree.name },
  };
}

// Canonical wave positions (used to determine which sub-pattern menu to show)
type CanonicalWave = '1' | '2' | '3' | '4' | '5' | 'A' | 'B' | 'C' | 'W' | 'X' | 'Y' | 'Z';

interface SubPatternOption {
  value: string;
  label: string;
  description: string;
}

// Smart contextual sub-patterns per canonical wave type
const WAVE_SUB_PATTERNS: Record<CanonicalWave, SubPatternOption[] | null> = {
  '1': [
    { value: 'impulse',          label: '5-wave impulse',    description: 'Standard' },
    { value: 'leading_diagonal', label: 'Leading Diagonal',  description: '5-wave diagonal' },
  ],
  '2': [
    { value: 'zigzag',      label: 'Zigzag',   description: 'Sharp ABC (5-3-5)' },
    { value: 'flat',        label: 'Flat',     description: 'Sideways ABC (3-3-5)' },
    { value: 'combination', label: 'Complex',  description: 'W-X-Y' },
  ],
  '3': null, // Auto-impulse, no sub-menu needed
  '4': [
    { value: 'zigzag',      label: 'Zigzag',   description: 'Sharp ABC' },
    { value: 'flat',        label: 'Flat',     description: 'Sideways ABC' },
    { value: 'triangle',    label: 'Triangle', description: 'A-B-C-D-E' },
    { value: 'combination', label: 'Complex',  description: 'W-X-Y' },
  ],
  '5': [
    { value: 'impulse',          label: '5-wave impulse',    description: 'Standard' },
    { value: 'ending_diagonal',  label: 'Ending Diagonal',   description: '5-wave diagonal' },
    { value: 'truncated',        label: 'Truncated 5th',     description: 'Rare' },
  ],
  'A': [
    { value: 'impulse',          label: '5-wave impulse',    description: 'Standard' },
    { value: 'leading_diagonal', label: 'Leading Diagonal',  description: '5-wave diagonal' },
    { value: 'zigzag',           label: '3-wave correction', description: 'ABC' },
  ],
  'B': [
    { value: 'zigzag',      label: 'Zigzag',   description: '3-wave' },
    { value: 'flat',        label: 'Flat',     description: '3-wave' },
    { value: 'triangle',    label: 'Triangle', description: '5-wave' },
    { value: 'combination', label: 'Complex',  description: 'W-X-Y' },
  ],
  'C': [
    { value: 'impulse',         label: '5-wave impulse',   description: 'Standard' },
    { value: 'ending_diagonal', label: 'Ending Diagonal',  description: '5-wave diagonal' },
  ],
  'W': [
    { value: 'zigzag',   label: 'Zigzag',   description: 'A-B-C' },
    { value: 'flat',     label: 'Flat',     description: 'A-B-C' },
    { value: 'triangle', label: 'Triangle', description: 'A-B-C-D-E' },
  ],
  'X': [
    { value: 'zigzag',   label: 'Zigzag',   description: 'A-B-C' },
    { value: 'flat',     label: 'Flat',     description: 'A-B-C' },
    { value: 'triangle', label: 'Triangle', description: 'A-B-C-D-E' },
  ],
  'Y': [
    { value: 'zigzag',   label: 'Zigzag',   description: 'A-B-C' },
    { value: 'flat',     label: 'Flat',     description: 'A-B-C' },
    { value: 'triangle', label: 'Triangle', description: 'A-B-C-D-E' },
  ],
  'Z': [
    { value: 'zigzag',   label: 'Zigzag',   description: 'A-B-C' },
    { value: 'flat',     label: 'Flat',     description: 'A-B-C' },
    { value: 'triangle', label: 'Triangle', description: 'A-B-C-D-E' },
  ],
};

// Map a degree-specific wave label back to its canonical wave (e.g. '(1)' → '1', '(A)' → 'A')
function getCanonicalWave(
  label: string,
  degreeConfig: typeof USER_SELECTABLE_DEGREES[number],
): CanonicalWave {
  const impulseIdx = degreeConfig.impulseLabels.indexOf(label);
  if (impulseIdx !== -1) return (['1', '2', '3', '4', '5'] as CanonicalWave[])[impulseIdx];
  const corrIdx = degreeConfig.correctionLabels.indexOf(label);
  if (corrIdx !== -1) return (['A', 'B', 'C'] as CanonicalWave[])[corrIdx];
  const complexIdx = degreeConfig.complexLabels.indexOf(label);
  if (complexIdx !== -1) return (['W', 'X', 'Y', 'Z'] as CanonicalWave[])[complexIdx];
  return '1'; // fallback
}

interface DegreePickerProps {
  isOpen: boolean;
  onSelect: (degree: string, waveLabel: string, patternType: string) => void;
  onClose: () => void;
}

export function DegreePicker({ isOpen, onSelect, onClose }: DegreePickerProps) {
  const [selectedDegree, setSelectedDegree] = useState('Minor');
  const [step, setStep] = useState<'degree' | 'wave' | 'subpattern'>('degree');
  const [selectedWaveLabel, setSelectedWaveLabel] = useState<string | null>(null);
  const [selectedCanonical, setSelectedCanonical] = useState<CanonicalWave | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  const degreeConfig = USER_SELECTABLE_DEGREES.find(d => d.name === selectedDegree)!;

  const handleDegreeConfirm = () => {
    setStep('wave');
    setSelectedWaveLabel(null);
    setSelectedCanonical(null);
    setSelectedPattern(null);
  };

  const handleWaveSelect = (label: string) => {
    const canonical = getCanonicalWave(label, degreeConfig);
    setSelectedWaveLabel(label);
    setSelectedCanonical(canonical);

    // Wave 3 always uses impulse – skip sub-pattern step
    if (canonical === '3') {
      onSelect(selectedDegree, label, 'impulse');
      resetState();
      return;
    }

    setSelectedPattern(null);
    setStep('subpattern');
  };

  const handleSubPatternConfirm = () => {
    if (selectedWaveLabel && selectedPattern) {
      onSelect(selectedDegree, selectedWaveLabel, selectedPattern);
      resetState();
    }
  };

  const resetState = () => {
    setStep('degree');
    setSelectedWaveLabel(null);
    setSelectedCanonical(null);
    setSelectedPattern(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const subPatternOptions = selectedCanonical ? WAVE_SUB_PATTERNS[selectedCanonical] : null;

  const stepTitle =
    step === 'degree'     ? 'Select Elliott Wave Degree' :
    step === 'wave'       ? 'Which wave are you drawing?' :
                            'Choose pattern type';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[90vw] max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">{stepTitle}</DialogTitle>
        </DialogHeader>

        {step === 'degree' ? (
          <>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {USER_SELECTABLE_DEGREES.map(degree => (
                <button
                  key={degree.name}
                  type="button"
                  onClick={() => setSelectedDegree(degree.name)}
                  className={`w-full px-4 py-3 rounded-lg flex items-center justify-between transition-all ${
                    selectedDegree === degree.name
                      ? 'bg-blue-600 border-2 border-blue-400'
                      : 'bg-slate-800 border border-slate-600 hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: degree.color }}
                    />
                    <span className="text-white font-medium">{degree.name}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {degree.impulseLabels.join(' ')}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleDegreeConfirm}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Next →
              </Button>
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </>
        ) : step === 'wave' ? (
          <>
            <p className="text-sm text-slate-300 mb-3">
              Degree: <span className="font-bold text-white">{selectedDegree}</span>
            </p>

            {/* Impulse waves */}
            <div className="mb-2">
              <p className="text-xs text-slate-400 mb-1">Impulse</p>
              <div className="grid grid-cols-5 gap-2">
                {degreeConfig.impulseLabels.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleWaveSelect(label)}
                    className="px-3 py-2 rounded text-sm font-bold bg-blue-900 border border-blue-700 text-blue-200 hover:bg-blue-700 transition-all text-center"
                    title={`Wave ${i + 1}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Correction waves */}
            <div className="mb-2">
              <p className="text-xs text-slate-400 mb-1">Correction</p>
              <div className="grid grid-cols-3 gap-2">
                {degreeConfig.correctionLabels.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleWaveSelect(label)}
                    className="px-3 py-2 rounded text-sm font-bold bg-purple-900 border border-purple-700 text-purple-200 hover:bg-purple-700 transition-all text-center"
                    title={`Wave ${['A', 'B', 'C'][i]}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Complex waves */}
            <div className="mb-2">
              <p className="text-xs text-slate-400 mb-1">Complex correction</p>
              <div className="grid grid-cols-4 gap-2">
                {degreeConfig.complexLabels.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleWaveSelect(label)}
                    className="px-3 py-2 rounded text-sm font-bold bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 transition-all text-center"
                    title={`Wave ${['W', 'X', 'Y', 'Z'][i]}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => setStep('degree')}
                variant="outline"
                className="flex-1"
              >
                ← Back
              </Button>
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300 mb-3">
              Degree: <span className="font-bold text-white">{selectedDegree}</span>
              {' · '}
              Wave: <span className="font-bold text-white">{selectedWaveLabel}</span>
            </p>

            <div className="space-y-2">
              {subPatternOptions?.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedPattern(option.value)}
                  className={`w-full px-4 py-3 rounded-lg flex items-center justify-between transition-all ${
                    selectedPattern === option.value
                      ? 'bg-blue-600 border-2 border-blue-400'
                      : 'bg-slate-800 border border-slate-600 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-white font-medium">{option.label}</span>
                  <span className="text-xs text-slate-400">{option.description}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleSubPatternConfirm}
                disabled={!selectedPattern}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Start Drawing
              </Button>
              <Button
                onClick={() => setStep('wave')}
                variant="outline"
                className="flex-1"
              >
                ← Back
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

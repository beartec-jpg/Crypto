import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export const USER_SELECTABLE_DEGREES = [
  { name: 'Grand Supercycle', color: '#FF0000', impulseLabels: ['(I)', '(II)', '(III)', '(IV)', '(V)'], correctionLabels: ['(A)', '(B)', '(C)'] },
  { name: 'Supercycle',       color: '#FF6B00', impulseLabels: ['(I)', '(II)', '(III)', '(IV)', '(V)'], correctionLabels: ['(A)', '(B)', '(C)'] },
  { name: 'Cycle',            color: '#FFD700', impulseLabels: ['I',   'II',   'III',   'IV',   'V'  ], correctionLabels: ['A',   'B',   'C'  ] },
  { name: 'Primary',          color: '#00FF00', impulseLabels: ['1',   '2',    '3',     '4',    '5'  ], correctionLabels: ['A',   'B',   'C'  ] },
  { name: 'Intermediate',     color: '#00BFFF', impulseLabels: ['(1)', '(2)',  '(3)',   '(4)',  '(5)'], correctionLabels: ['(A)', '(B)', '(C)'] },
  { name: 'Minor',            color: '#0000FF', impulseLabels: ['1',   '2',    '3',     '4',    '5'  ], correctionLabels: ['A',   'B',   'C'  ] },
  { name: 'Minute',           color: '#8B00FF', impulseLabels: ['i',   'ii',   'iii',   'iv',   'v'  ], correctionLabels: ['a',   'b',   'c'  ] },
  { name: 'Minuette',         color: '#FF1493', impulseLabels: ['(i)', '(ii)', '(iii)', '(iv)', '(v)'], correctionLabels: ['(a)', '(b)', '(c)'] },
];

export const SUBMINUETTE_DEGREE = {
  name: 'Subminuette',
  color: '#808080',
  impulseLabels: ['i', 'ii', 'iii', 'iv', 'v'],
  correctionLabels: ['a', 'b', 'c'],
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

interface DegreePickerProps {
  isOpen: boolean;
  onSelect: (degree: string, waveLabel: string) => void;
  onClose: () => void;
}

export function DegreePicker({ isOpen, onSelect, onClose }: DegreePickerProps) {
  const [selectedDegree, setSelectedDegree] = useState('Minor');
  const [step, setStep] = useState<'degree' | 'wave'>('degree');
  const [selectedWave, setSelectedWave] = useState<string | null>(null);

  const handleDegreeConfirm = () => {
    setStep('wave');
    setSelectedWave(null);
  };

  const handleWaveConfirm = () => {
    if (selectedWave) {
      onSelect(selectedDegree, selectedWave);
      setStep('degree');
      setSelectedWave(null);
    }
  };

  const handleClose = () => {
    setStep('degree');
    setSelectedWave(null);
    onClose();
  };

  const degreeConfig = USER_SELECTABLE_DEGREES.find(d => d.name === selectedDegree);
  const allWaveLabels = degreeConfig
    ? [...degreeConfig.impulseLabels, ...degreeConfig.correctionLabels]
    : ['1', '2', '3', '4', '5', 'A', 'B', 'C'];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[90vw] max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">
            {step === 'degree' ? 'Select Elliott Wave Degree' : 'Which wave are you labeling?'}
          </DialogTitle>
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
        ) : (
          <>
            <p className="text-sm text-slate-300 mb-3">
              Degree: <span className="font-bold text-white">{selectedDegree}</span>
            </p>
            <div className="grid grid-cols-5 gap-2">
              {allWaveLabels.map(label => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSelectedWave(label)}
                  className={`px-3 py-2 rounded text-sm font-bold transition-all ${
                    selectedWave === label
                      ? 'bg-blue-600 text-white border-2 border-blue-400'
                      : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleWaveConfirm}
                disabled={!selectedWave}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Start Drawing
              </Button>
              <Button
                onClick={() => setStep('degree')}
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

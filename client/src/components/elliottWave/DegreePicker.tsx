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
  onSelect: (degree: string) => void;
  onClose: () => void;
}

export function DegreePicker({ isOpen, onSelect, onClose }: DegreePickerProps) {
  const [selectedDegree, setSelectedDegree] = useState('Minor');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[90vw] max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">Select Elliott Wave Degree</DialogTitle>
        </DialogHeader>

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
            onClick={() => onSelect(selectedDegree)}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            Start Drawing
          </Button>
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

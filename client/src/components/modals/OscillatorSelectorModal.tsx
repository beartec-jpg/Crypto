import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface OscillatorSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOscillators: Set<string>;
  onToggleOscillator: (oscillator: string) => void;
}

const OSCILLATORS = [
  { id: 'rsi', name: 'RSI', description: 'Relative Strength Index' },
  { id: 'macd', name: 'MACD', description: 'Moving Average Convergence Divergence' },
  { id: 'volume', name: 'Volume', description: 'Trading Volume' },
];

export function OscillatorSelectorModal({
  isOpen,
  onClose,
  selectedOscillators,
  onToggleOscillator,
}: OscillatorSelectorModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Select Oscillators</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {OSCILLATORS.map((osc) => (
            <div 
              key={osc.id} 
              className="flex items-start space-x-3 p-3 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer" 
              onClick={() => onToggleOscillator(osc.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleOscillator(osc.id);
                }
              }}
            >
              <Checkbox
                id={osc.id}
                checked={selectedOscillators.has(osc.id)}
                onCheckedChange={() => onToggleOscillator(osc.id)}
                className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
              />
              <div className="grid gap-1.5 leading-none flex-1">
                <Label
                  htmlFor={osc.id}
                  className="text-sm font-medium leading-none text-white cursor-pointer"
                >
                  {osc.name}
                </Label>
                <p className="text-sm text-slate-400">
                  {osc.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

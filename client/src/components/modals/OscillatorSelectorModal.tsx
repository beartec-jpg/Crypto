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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Oscillators</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {OSCILLATORS.map((osc) => (
            <div key={osc.id} className="flex items-start space-x-3">
              <Checkbox
                id={osc.id}
                checked={selectedOscillators.has(osc.id)}
                onCheckedChange={() => onToggleOscillator(osc.id)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor={osc.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {osc.name}
                </Label>
                <p className="text-sm text-muted-foreground">
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

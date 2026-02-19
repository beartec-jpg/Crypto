import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

interface OscillatorSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOscillators: Set<string>;
  onToggleOscillator: (oscillator: string, enabled: boolean) => void;
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
      <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Select Oscillators</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {OSCILLATORS.map((osc) => {
            const isEnabled = selectedOscillators.has(osc.id);

            return (
              <div
                key={osc.id}
                className="flex items-center justify-between p-4 rounded-lg border border-slate-700 hover:bg-slate-800/50 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-white">{osc.name}</div>
                  <p className="text-xs text-slate-400">{osc.description}</p>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => onToggleOscillator(osc.id, checked)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 text-center">
          Tap oscillator to cycle: Mini → Popout → Bottom
        </p>
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OscillatorSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOscillators: Set<string>;
  onToggleOscillator: (oscillator: string, enabled: boolean) => void;
}

const OSCILLATORS = [
  { id: 'rsi', name: 'RSI', description: 'Relative Strength Index (14)' },
  { id: 'macd', name: 'MACD', description: 'Moving Average Convergence Divergence' },
  { id: 'waddah', name: 'Waddah Explosion', description: 'MACD momentum + volatility explosion' },
  { id: 'cmf', name: 'CMF', description: 'Chaikin Money Flow (20)' },
  { id: 'volume', name: 'Volume', description: 'Trading Volume vs Average' },
  { id: 'stochRsi', name: 'Stoch RSI', description: 'Stochastic RSI (14,14,3,3)' },
  { id: 'tsi', name: 'TSI', description: 'True Strength Index (25,13,7)' },
  { id: 'williamsR', name: 'Williams %R', description: 'Williams Percent Range (14)' },
  { id: 'cci', name: 'CCI', description: 'Commodity Channel Index (20)' },
  { id: 'adx', name: 'ADX', description: 'Average Directional Index (14)' },
  { id: 'obv', name: 'OBV', description: 'On Balance Volume' },
  { id: 'mfi', name: 'MFI', description: 'Money Flow Index (14)' },
  { id: 'klinger', name: 'Klinger', description: 'Klinger Oscillator (34,55,13)' },
  { id: 'smartMoney', name: 'Smart Money Tracker', description: 'Standalone SMC system score and debug panel' },
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
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-white">Select Oscillators</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
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

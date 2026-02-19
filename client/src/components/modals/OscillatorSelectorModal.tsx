import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type OscillatorDisplayMode = 'bottom' | 'mini' | 'popout' | 'off';

interface OscillatorSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOscillators: Set<string>;
  poppedOutOscillators: Set<string>;
  onToggleOscillator: (oscillator: string, mode: OscillatorDisplayMode) => void;
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
  poppedOutOscillators,
  onToggleOscillator,
}: OscillatorSelectorModalProps) {
  const getOscillatorMode = (oscId: string): OscillatorDisplayMode => {
    const isSelected = selectedOscillators.has(oscId);
    const isPoppedOut = poppedOutOscillators.has(oscId);
    
    if (!isSelected) {
      return 'off';
    } else if (isPoppedOut) {
      // TODO: In the future, distinguish between 'mini' and 'popout' based on window size or additional state
      // For now, default to 'popout' for all popped out oscillators (both mini and popout buttons will behave the same)
      return 'popout';
    } else {
      return 'bottom';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Select Oscillators</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {OSCILLATORS.map((osc) => {
            const mode = getOscillatorMode(osc.id);
            
            return (
              <div 
                key={osc.id} 
                className="p-4 rounded-lg border border-slate-700 hover:bg-slate-800/50 transition-colors"
              >
                <div className="mb-3">
                  <div className="text-sm font-medium text-white mb-1">{osc.name}</div>
                  <p className="text-xs text-slate-400">{osc.description}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={mode === 'bottom' ? 'default' : 'outline'}
                    onClick={() => onToggleOscillator(osc.id, 'bottom')}
                    className={mode === 'bottom' 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'
                    }
                  >
                    Bottom
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === 'mini' ? 'default' : 'outline'}
                    onClick={() => onToggleOscillator(osc.id, 'mini')}
                    className={mode === 'mini' 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'
                    }
                  >
                    Mini
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === 'popout' ? 'default' : 'outline'}
                    onClick={() => onToggleOscillator(osc.id, 'popout')}
                    className={mode === 'popout' 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'
                    }
                  >
                    Popout
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { OscillatorDisplayMode };

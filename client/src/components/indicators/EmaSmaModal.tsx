import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, X } from 'lucide-react';
import type { MAConfig } from '@/types/chart.types';

interface EmaSmaModalProps {
  isOpen: boolean;
  onClose: () => void;
  emaShow: boolean;
  emaConfigs: MAConfig[];
  emaInputs: Record<string, string>;
  onEmaToggle: (show: boolean) => void;
  onEmaConfigsChange: (configs: MAConfig[]) => void;
  onEmaInputsChange: (inputs: Record<string, string>) => void;
  smaShow: boolean;
  smaConfigs: MAConfig[];
  onSmaToggle: (show: boolean) => void;
  onSmaConfigsChange: (configs: MAConfig[]) => void;
}

const MA_COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899'];
const MA_TIMEFRAMES = [
  { value: 'current', label: 'Current' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1d' },
];

export function EmaSmaModal({
  isOpen,
  onClose,
  emaShow,
  emaConfigs,
  emaInputs,
  onEmaToggle,
  onEmaConfigsChange,
  onEmaInputsChange,
  smaShow,
  smaConfigs,
  onSmaToggle,
  onSmaConfigsChange,
}: EmaSmaModalProps) {
  
  const handleAddEma = () => {
    if (emaConfigs.length >= 6) return;
    const newId = `ema${Date.now()}`;
    const colorIdx = emaConfigs.length % MA_COLORS.length;
    onEmaConfigsChange([...emaConfigs, { 
      id: newId, 
      period: 21, 
      timeframe: 'current', 
      color: MA_COLORS[colorIdx] 
    }]);
    onEmaInputsChange({ ...emaInputs, [newId]: '21' });
  };

  const handleAddSma = () => {
    if (smaConfigs.length >= 6) return;
    const newId = `sma${Date.now()}`;
    const colorIdx = smaConfigs.length % MA_COLORS.length;
    onSmaConfigsChange([...smaConfigs, { 
      id: newId, 
      period: 50, 
      timeframe: 'current', 
      color: MA_COLORS[colorIdx] 
    }]);
  };

  const handleRemoveEma = (id: string) => {
    onEmaConfigsChange(emaConfigs.filter(c => c.id !== id));
    const newInputs = { ...emaInputs };
    delete newInputs[id];
    onEmaInputsChange(newInputs);
  };

  const handleRemoveSma = (id: string) => {
    onSmaConfigsChange(smaConfigs.filter(c => c.id !== id));
  };

  const handleEmaChange = (id: string, field: keyof MAConfig, value: any) => {
    onEmaConfigsChange(emaConfigs.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const handleSmaChange = (id: string, field: keyof MAConfig, value: any) => {
    onSmaConfigsChange(smaConfigs.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 text-white border-slate-700 max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>EMA / SMA Settings</DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure moving average indicators
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* EMA Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold text-amber-400">EMA Lines</Label>
                <Switch checked={emaShow} onCheckedChange={onEmaToggle} />
              </div>
              {emaShow && emaConfigs.length < 6 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAddEma}
                  className="h-7 text-xs text-green-400 hover:text-green-300"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add EMA
                </Button>
              )}
            </div>

            {emaShow && (
              <div className="space-y-2">
                {emaConfigs.map((config) => (
                  <div key={config.id} className="flex items-center gap-2 bg-slate-800/50 rounded p-2">
                    <input
                      type="color"
                      value={config.color}
                      onChange={(e) => handleEmaChange(config.id, 'color', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer"
                    />
                    <input
                      type="number"
                      min="5"
                      max="500"
                      value={emaInputs[config.id] ?? String(config.period)}
                      onChange={(e) => {
                        const val = e.target.value;
                        onEmaInputsChange({ ...emaInputs, [config.id]: val });
                        const num = parseInt(val);
                        if (!isNaN(num) && num >= 5 && num <= 500) {
                          handleEmaChange(config.id, 'period', num);
                        }
                      }}
                      className="w-20 bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600"
                    />
                    <select
                      value={config.timeframe}
                      onChange={(e) => handleEmaChange(config.id, 'timeframe', e.target.value)}
                      className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600"
                    >
                      {MA_TIMEFRAMES.map(tf => (
                        <option key={tf.value} value={tf.value}>{tf.label}</option>
                      ))}
                    </select>
                    {emaConfigs.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveEma(config.id)}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SMA Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold text-amber-400">SMA Lines</Label>
                <Switch checked={smaShow} onCheckedChange={onSmaToggle} />
              </div>
              {smaShow && smaConfigs.length < 6 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAddSma}
                  className="h-7 text-xs text-green-400 hover:text-green-300"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add SMA
                </Button>
              )}
            </div>

            {smaShow && (
              <div className="space-y-2">
                {smaConfigs.map((config) => (
                  <div key={config.id} className="flex items-center gap-2 bg-slate-800/50 rounded p-2">
                    <input
                      type="color"
                      value={config.color}
                      onChange={(e) => handleSmaChange(config.id, 'color', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer"
                    />
                    <input
                      type="number"
                      min="5"
                      max="500"
                      value={config.period}
                      onChange={(e) => {
                        const num = parseInt(e.target.value);
                        if (!isNaN(num) && num >= 5 && num <= 500) {
                          handleSmaChange(config.id, 'period', num);
                        }
                      }}
                      className="w-20 bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600"
                    />
                    <select
                      value={config.timeframe}
                      onChange={(e) => handleSmaChange(config.id, 'timeframe', e.target.value)}
                      className="flex-1 bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600"
                    >
                      {MA_TIMEFRAMES.map(tf => (
                        <option key={tf.value} value={tf.value}>{tf.label}</option>
                      ))}
                    </select>
                    {smaConfigs.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveSma(config.id)}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

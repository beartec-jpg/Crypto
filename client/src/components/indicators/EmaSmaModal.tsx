import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, X } from 'lucide-react';
import type { MAConfig } from '@/types/chart.types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
      color: MA_COLORS[colorIdx],
      lineWidth: 2
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
      color: MA_COLORS[colorIdx],
      lineWidth: 2
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
    
    // Update input field for period changes
    if (field === 'period') {
      onEmaInputsChange({ ...emaInputs, [id]: String(value) });
    }
  };

  const handleSmaChange = (id: string, field: keyof MAConfig, value: any) => {
    onSmaConfigsChange(smaConfigs.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const handlePeriodBlur = (id: string, isEma: boolean) => {
    const value = isEma ? emaInputs[id] : '';
    const numValue = parseInt(value);
    
    if (isNaN(numValue) || numValue < 5 || numValue > 500) {
      // Reset to default if invalid
      if (isEma) {
        onEmaInputsChange({ ...emaInputs, [id]: '21' });
        handleEmaChange(id, 'period', 21);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 text-white border-slate-700 max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>EMA / SMA Settings</DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure up to 6 EMAs and 6 SMAs. Changes apply instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* EMA Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold text-blue-400">EMA Lines</Label>
                <Switch checked={emaShow} onCheckedChange={onEmaToggle} />
              </div>
              {emaShow && emaConfigs.length < 6 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAddEma}
                  className="h-7 text-xs text-green-400 hover:text-green-300 hover:bg-slate-800"
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
                      min="1"
                      max="5"
                      value={config.lineWidth || 2}
                      onChange={(e) => handleEmaChange(config.id, 'lineWidth', parseInt(e.target.value) || 2)}
                      className="w-12 px-1 py-1 bg-slate-700 rounded text-white text-sm text-center"
                      title="Line thickness (1-5)"
                    />
                    <input
                      type="number"
                      min="5"
                      max="500"
                      value={emaInputs[config.id] || config.period}
                      onChange={(e) => {
                        const value = e.target.value;
                        onEmaInputsChange({ ...emaInputs, [config.id]: value });
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 5 && numValue <= 500) {
                          handleEmaChange(config.id, 'period', numValue);
                        }
                      }}
                      onBlur={() => handlePeriodBlur(config.id, true)}
                      className="w-20 px-2 py-1 bg-slate-700 rounded text-white text-sm"
                      placeholder="Period"
                    />
                    <Select
                      value={config.timeframe}
                      onValueChange={(value) => handleEmaChange(config.id, 'timeframe', value)}
                    >
                      <SelectTrigger className="w-28 h-8 bg-slate-700 border-slate-600 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {MA_TIMEFRAMES.map((tf) => (
                          <SelectItem key={tf.value} value={tf.value} className="text-white text-xs">
                            {tf.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-gray-400 flex-1">EMA {config.period}</span>
                    {emaConfigs.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveEma(config.id)}
                        className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-slate-700"
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
                  className="h-7 text-xs text-green-400 hover:text-green-300 hover:bg-slate-800"
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
                      min="1"
                      max="5"
                      value={config.lineWidth || 2}
                      onChange={(e) => handleSmaChange(config.id, 'lineWidth', parseInt(e.target.value) || 2)}
                      className="w-12 px-1 py-1 bg-slate-700 rounded text-white text-sm text-center"
                      title="Line thickness (1-5)"
                    />
                    <input
                      type="number"
                      min="5"
                      max="500"
                      value={config.period}
                      onChange={(e) => {
                        const numValue = parseInt(e.target.value);
                        if (!isNaN(numValue) && numValue >= 5 && numValue <= 500) {
                          handleSmaChange(config.id, 'period', numValue);
                        }
                      }}
                      className="w-20 px-2 py-1 bg-slate-700 rounded text-white text-sm"
                      placeholder="Period"
                    />
                    <Select
                      value={config.timeframe}
                      onValueChange={(value) => handleSmaChange(config.id, 'timeframe', value)}
                    >
                      <SelectTrigger className="w-28 h-8 bg-slate-700 border-slate-600 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {MA_TIMEFRAMES.map((tf) => (
                          <SelectItem key={tf.value} value={tf.value} className="text-white text-xs">
                            {tf.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-gray-400 flex-1">SMA {config.period}</span>
                    {smaConfigs.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveSma(config.id)}
                        className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-slate-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="bg-slate-800/30 rounded p-3 text-xs text-slate-400">
            <p className="mb-1">💡 <strong>Tips:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Period range: 5-500</li>
              <li>Line thickness: 1 (thin) to 5 (thick)</li>
              <li>Multi-timeframe: Display HTF MAs on current chart</li>
              <li>Changes apply immediately</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <Button 
            onClick={onClose} 
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

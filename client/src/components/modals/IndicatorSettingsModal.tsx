import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';

interface IndicatorConfig {
  show: boolean;
  period?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  stdDev?: number;
  [key: string]: any;
}

interface IndicatorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  indicatorType: 'rsi' | 'macd' | 'bollinger' | 'ema' | 'sma' | null;
  config: IndicatorConfig;
  onUpdate: (config: IndicatorConfig) => void;
}

/**
 * Modal for configuring indicator settings
 * Extracted from CryptoIndicators.tsx for Phase 4G-10
 */
export function IndicatorSettingsModal({
  isOpen,
  onClose,
  indicatorType,
  config,
  onUpdate
}: IndicatorSettingsModalProps) {
  const [localConfig, setLocalConfig] = useState(config);

  const handleSave = () => {
    onUpdate(localConfig);
    onClose();
  };

  const getIndicatorFields = () => {
    switch (indicatorType) {
      case 'rsi':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="rsi-period" className="text-white">Period</Label>
              <Input
                id="rsi-period"
                type="number"
                value={localConfig.period || 14}
                onChange={(e) => setLocalConfig({ ...localConfig, period: parseInt(e.target.value) })}
                min={2}
                max={200}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
          </div>
        );

      case 'macd':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="macd-fast" className="text-white">Fast Period</Label>
              <Input
                id="macd-fast"
                type="number"
                value={localConfig.fast || 12}
                onChange={(e) => setLocalConfig({ ...localConfig, fast: parseInt(e.target.value) })}
                min={2}
                max={50}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <div>
              <Label htmlFor="macd-slow" className="text-white">Slow Period</Label>
              <Input
                id="macd-slow"
                type="number"
                value={localConfig.slow || 26}
                onChange={(e) => setLocalConfig({ ...localConfig, slow: parseInt(e.target.value) })}
                min={2}
                max={100}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <div>
              <Label htmlFor="macd-signal" className="text-white">Signal Period</Label>
              <Input
                id="macd-signal"
                type="number"
                value={localConfig.signal || 9}
                onChange={(e) => setLocalConfig({ ...localConfig, signal: parseInt(e.target.value) })}
                min={2}
                max={50}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
          </div>
        );

      case 'bollinger':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="bb-period" className="text-white">Period</Label>
              <Input
                id="bb-period"
                type="number"
                value={localConfig.period || 20}
                onChange={(e) => setLocalConfig({ ...localConfig, period: parseInt(e.target.value) })}
                min={2}
                max={200}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <div>
              <Label htmlFor="bb-stddev" className="text-white">Standard Deviation</Label>
              <Input
                id="bb-stddev"
                type="number"
                step="0.1"
                value={localConfig.stdDev || 2}
                onChange={(e) => setLocalConfig({ ...localConfig, stdDev: parseFloat(e.target.value) })}
                min={0.5}
                max={5}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
          </div>
        );

      case 'ema':
      case 'sma':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="ma-period" className="text-white">Period</Label>
              <Input
                id="ma-period"
                type="number"
                value={localConfig.period || 20}
                onChange={(e) => setLocalConfig({ ...localConfig, period: parseInt(e.target.value) })}
                min={2}
                max={500}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
          </div>
        );

      default:
        return <div className="text-gray-400">No settings available</div>;
    }
  };

  if (!indicatorType) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">
            {indicatorType?.toUpperCase()} Settings
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center justify-between mb-4">
            <Label htmlFor="indicator-enabled" className="text-white">Enabled</Label>
            <Switch
              id="indicator-enabled"
              checked={localConfig.show}
              onCheckedChange={(checked) => setLocalConfig({ ...localConfig, show: checked })}
            />
          </div>

          {getIndicatorFields()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { SqueezeMomentumSettings } from '@/types/squeezeMomentum';

interface SqueezeMomentumSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SqueezeMomentumSettings;
  onSettingsChange: (updates: Partial<SqueezeMomentumSettings>) => void;
  onReset: () => void;
}

export function SqueezeMomentumSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onReset,
}: SqueezeMomentumSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 text-white">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Squeeze Momentum Settings</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              title="Reset to defaults"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Enable */}
          <div className="flex items-center justify-between">
            <Label>Enable Squeeze Momentum</Label>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(enabled) => onSettingsChange({ enabled })}
            />
          </div>

          {/* Calculation Parameters */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Calculation</h3>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>BB/KC Length</Label>
                <span className="text-xs text-slate-400">{settings.length}</span>
              </div>
              <Slider
                value={[settings.length]}
                min={10}
                max={50}
                step={1}
                onValueChange={([length]) => onSettingsChange({ length })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>BB Multiplier</Label>
                <span className="text-xs text-slate-400">{settings.mult.toFixed(1)}</span>
              </div>
              <Slider
                value={[settings.mult * 10]}
                min={10}
                max={30}
                step={1}
                onValueChange={([val]) => onSettingsChange({ mult: val / 10 })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>KC Multiplier</Label>
                <span className="text-xs text-slate-400">{settings.multKC.toFixed(1)}</span>
              </div>
              <Slider
                value={[settings.multKC * 10]}
                min={10}
                max={30}
                step={1}
                onValueChange={([val]) => onSettingsChange({ multKC: val / 10 })}
              />
            </div>
          </div>

          {/* Display Options */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Display</h3>

            <div className="flex items-center justify-between">
              <Label>Show Squeeze Dots</Label>
              <Switch
                checked={settings.showDots}
                onCheckedChange={(showDots) => onSettingsChange({ showDots })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Show Histogram</Label>
              <Switch
                checked={settings.showHistogram}
                onCheckedChange={(showHistogram) => onSettingsChange({ showHistogram })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Show Zero Line</Label>
              <Switch
                checked={settings.showZeroLine}
                onCheckedChange={(showZeroLine) => onSettingsChange({ showZeroLine })}
              />
            </div>
          </div>

          {/* Color Pickers */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Colors</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Squeeze ON</Label>
                <input
                  type="color"
                  value={settings.sqzOnColor}
                  onChange={(e) => onSettingsChange({ sqzOnColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Squeeze OFF</Label>
                <input
                  type="color"
                  value={settings.sqzOffColor}
                  onChange={(e) => onSettingsChange({ sqzOffColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Up Increasing</Label>
                <input
                  type="color"
                  value={settings.momentumUpIncColor}
                  onChange={(e) => onSettingsChange({ momentumUpIncColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Up Decreasing</Label>
                <input
                  type="color"
                  value={settings.momentumUpDecColor}
                  onChange={(e) => onSettingsChange({ momentumUpDecColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Down Increasing</Label>
                <input
                  type="color"
                  value={settings.momentumDownIncColor}
                  onChange={(e) => onSettingsChange({ momentumDownIncColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Down Decreasing</Label>
                <input
                  type="color"
                  value={settings.momentumDownDecColor}
                  onChange={(e) => onSettingsChange({ momentumDownDecColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

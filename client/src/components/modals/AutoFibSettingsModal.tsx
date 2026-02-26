import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { AutoFibSettings } from '@/types/autoFib';

interface AutoFibSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AutoFibSettings;
  onSettingsChange: (updates: Partial<AutoFibSettings>) => void;
}

const FIB_LEVELS = [
  { value: 0.236, label: '23.6%' },
  { value: 0.382, label: '38.2%' },
  { value: 0.5, label: '50%' },
  { value: 0.618, label: '61.8% (Golden)' },
  { value: 0.786, label: '78.6%' },
  { value: 1.0, label: '100%' },
  { value: 1.272, label: '127.2%' },
  { value: 1.618, label: '161.8% (Golden)' },
  { value: 2.0, label: '200%' },
  { value: 2.618, label: '261.8%' },
];

interface SettingRowProps {
  label: string;
  children: React.ReactElement;
}

function SettingRow({ label, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <Label className="text-sm text-slate-300">{label}</Label>
      {children}
    </div>
  );
}

export function AutoFibSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: AutoFibSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Auto-Fibonacci Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Enable */}
          <SettingRow label="Enable Auto-Fibonacci">
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => onSettingsChange({ enabled: checked })}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Lookback */}
          <div className="py-2">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm text-slate-300">Swing Lookback</Label>
              <span className="text-xs text-slate-400">{settings.lookback}</span>
            </div>
            <Slider
              min={5}
              max={50}
              step={1}
              value={[settings.lookback]}
              onValueChange={([v]) => onSettingsChange({ lookback: v })}
            />
          </div>

          {/* Show Retracements */}
          <SettingRow label="Show Retracements (0–100%)">
            <Switch
              checked={settings.showRetracements}
              onCheckedChange={(checked) => onSettingsChange({ showRetracements: checked })}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Show Extensions */}
          <SettingRow label="Show Extensions (>100%)">
            <Switch
              checked={settings.showExtensions}
              onCheckedChange={(checked) => onSettingsChange({ showExtensions: checked })}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Individual Levels */}
          <div className="py-2">
            <Label className="text-sm text-slate-300 mb-2 block">Fib Levels</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {FIB_LEVELS.map(level => (
                <div key={level.value} className="flex items-center gap-2">
                  <Switch
                    checked={settings.enabledLevels.includes(level.value)}
                    onCheckedChange={(checked) => {
                      const updated = checked
                        ? [...settings.enabledLevels, level.value]
                        : settings.enabledLevels.filter(l => l !== level.value);
                      onSettingsChange({ enabledLevels: updated });
                    }}
                    className="data-[state=checked]:bg-blue-600"
                  />
                  <span className="text-sm text-slate-300">{level.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Show Labels */}
          <SettingRow label="Show Labels">
            <Switch
              checked={settings.showLabels}
              onCheckedChange={(checked) => onSettingsChange({ showLabels: checked })}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Extend Right */}
          <SettingRow label="Extend Right">
            <Switch
              checked={settings.extendRight}
              onCheckedChange={(checked) => onSettingsChange({ extendRight: checked })}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Confluence Detection */}
          <SettingRow label="Enable Confluence Detection">
            <Switch
              checked={settings.enableConfluence}
              onCheckedChange={(checked) => onSettingsChange({ enableConfluence: checked })}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>
        </div>
      </DialogContent>
    </Dialog>
  );
}

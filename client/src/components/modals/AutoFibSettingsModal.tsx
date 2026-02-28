import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { AutoFibSettings, FibSetConfig, LabelPosition } from '@/types/autoFib';

interface AutoFibSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AutoFibSettings;
  onSettingsChange: (updates: Partial<AutoFibSettings>) => void;
}

const FIB_LEVELS: Array<{ key: keyof FibSetConfig['levels']; label: string }> = [
  { key: '-61.8', label: '-61.8% (Extension)' },
  { key: '-27.2', label: '-27.2% (Extension)' },
  { key: '0',     label: '0%' },
  { key: '23.6',  label: '23.6%' },
  { key: '38.2',  label: '38.2%' },
  { key: '50',    label: '50%' },
  { key: '61.8',  label: '61.8% (Golden)' },
  { key: '78.6',  label: '78.6%' },
  { key: '100',   label: '100%' },
  { key: '127.2', label: '127.2% (Extension)' },
  { key: '161.8', label: '161.8% (Extension)' },
  { key: '200',   label: '200% (Extension)' },
  { key: '261.8', label: '261.8% (Extension)' },
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

interface FibSetSectionProps {
  title: string;
  config: FibSetConfig;
  color: string;
  onChange: (updates: Partial<FibSetConfig>) => void;
}

function FibSetSection({ title, config, color, onChange }: FibSetSectionProps) {
  function toggleLevel(key: keyof FibSetConfig['levels'], checked: boolean) {
    onChange({ levels: { ...config.levels, [key]: checked } });
  }

  return (
    <div className="border border-slate-700 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold" style={{ color }}>{title}</span>
      </div>

      <SettingRow label="Enable">
        <Switch
          checked={config.enabled}
          onCheckedChange={(checked) => onChange({ enabled: checked })}
          className="data-[state=checked]:bg-blue-600"
        />
      </SettingRow>

      <SettingRow label="Show Retracements (0–100%)">
        <Switch
          checked={config.showRetracements}
          onCheckedChange={(checked) => onChange({ showRetracements: checked })}
          className="data-[state=checked]:bg-blue-600"
        />
      </SettingRow>

      <SettingRow label="Show Extensions (>100%, <0%)">
        <Switch
          checked={config.showExtensions}
          onCheckedChange={(checked) => onChange({ showExtensions: checked })}
          className="data-[state=checked]:bg-blue-600"
        />
      </SettingRow>

      {/* Fib Levels */}
      <div className="py-1">
        <Label className="text-xs text-slate-400 mb-2 block">Fib Levels</Label>
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {FIB_LEVELS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <Switch
                checked={config.levels[key]}
                onCheckedChange={(checked) => toggleLevel(key, checked)}
                className="data-[state=checked]:bg-blue-600 h-4 w-7"
              />
              <span className="text-xs text-slate-300">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Line Color */}
      <div className="flex items-center justify-between py-1">
        <Label className="text-sm text-slate-300">Line Color</Label>
        <input
          type="color"
          value={config.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-8 h-6 rounded cursor-pointer border border-slate-600"
        />
      </div>

      {/* Show Labels */}
      <SettingRow label="Show Labels">
        <Switch
          checked={config.showLabels}
          onCheckedChange={(checked) => onChange({ showLabels: checked })}
          className="data-[state=checked]:bg-blue-600"
        />
      </SettingRow>

      {/* Label Position */}
      <div className="py-1">
        <Label className="text-xs text-slate-400 mb-2 block">Label Position</Label>
        <div className="flex gap-3">
          {(['left', 'right', 'off'] as LabelPosition[]).map((pos) => (
            <label key={pos} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name={`label-pos-${title}`}
                value={pos}
                checked={config.labelPosition === pos}
                onChange={() => onChange({ labelPosition: pos })}
                className="accent-blue-500"
              />
              <span className="text-xs text-slate-300 capitalize">{pos}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Extend Right */}
      <SettingRow label="Extend Right">
        <Switch
          checked={config.extendRight}
          onCheckedChange={(checked) => onChange({ extendRight: checked })}
          className="data-[state=checked]:bg-blue-600"
        />
      </SettingRow>
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
      <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
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

          {/* Swing Lookback */}
          <div className="py-2">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm text-slate-300">Swing Lookback</Label>
              <span className="text-xs text-slate-400">{settings.swingLookback}</span>
            </div>
            <Slider
              min={5}
              max={50}
              step={1}
              value={[settings.swingLookback]}
              onValueChange={([v]) => onSettingsChange({ swingLookback: v })}
            />
          </div>

          <hr className="border-slate-700" />

          {/* Primary Fibonacci */}
          <FibSetSection
            title="🎯 PRIMARY FIBONACCI"
            config={settings.primary}
            color={settings.primary.color}
            onChange={(updates) =>
              onSettingsChange({ primary: { ...settings.primary, ...updates } })
            }
          />

          <hr className="border-slate-700" />

          {/* Secondary Fibonacci */}
          <FibSetSection
            title="🎯 SECONDARY FIBONACCI"
            config={settings.secondary}
            color={settings.secondary.color}
            onChange={(updates) =>
              onSettingsChange({ secondary: { ...settings.secondary, ...updates } })
            }
          />

          <hr className="border-slate-700" />

          {/* Confluence Detection */}
          <SettingRow label="Enable Confluence Detection">
            <Switch
              checked={settings.enableConfluence}
              onCheckedChange={(checked) => onSettingsChange({ enableConfluence: checked })}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {settings.enableConfluence && (
            <div className="py-2">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-sm text-slate-300">Confluence Threshold (%)</Label>
                <span className="text-xs text-slate-400">{settings.confluenceThreshold}%</span>
              </div>
              <Slider
                min={0.1}
                max={2}
                step={0.1}
                value={[settings.confluenceThreshold]}
                onValueChange={([v]) => onSettingsChange({ confluenceThreshold: v })}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VolumeProfileSettings } from '@/types/volumeProfile';

interface VolumeProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VolumeProfileSettings;
  onSettingsChange: (settings: VolumeProfileSettings) => void;
}

interface SettingRowProps {
  label: string;
  children: JSX.Element | null;
}

function SettingRow({ label, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <Label className="text-sm text-slate-300">{label}</Label>
      {children}
    </div>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

function SliderRow({ label, value, min, max, step, displayValue, onChange }: SliderRowProps) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-sm text-slate-300">{label}</Label>
        <span className="text-xs text-slate-400">{displayValue}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

export function VolumeProfileSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: VolumeProfileSettingsModalProps) {
  function update<K extends keyof VolumeProfileSettings>(key: K, value: VolumeProfileSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Volume Profile Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Enable/Disable */}
          <SettingRow label="Enable Volume Profile">
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => update('enabled', v)}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Calculation */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Calculation</p>

            <SliderRow
              label="Row Count"
              value={settings.rowCount}
              min={12}
              max={48}
              step={1}
              displayValue={`${settings.rowCount}`}
              onChange={(v) => update('rowCount', v)}
            />

            <SliderRow
              label="Value Area %"
              value={settings.valueAreaPercent}
              min={60}
              max={80}
              step={1}
              displayValue={`${settings.valueAreaPercent}%`}
              onChange={(v) => update('valueAreaPercent', v)}
            />
          </div>

          {/* Display */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

            <div className="py-2">
              <Label className="text-sm text-slate-300 mb-1 block">Position</Label>
              <div className="flex gap-2 mt-1">
                {(['left', 'right'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => update('side', side)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                      settings.side === side
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {side.charAt(0).toUpperCase() + side.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <SliderRow
              label="Width %"
              value={settings.width}
              min={10}
              max={25}
              step={1}
              displayValue={`${settings.width}%`}
              onChange={(v) => update('width', v)}
            />

            <SettingRow label="Show POC Line">
              <Switch
                checked={settings.showPOC}
                onCheckedChange={(v) => update('showPOC', v)}
                className="data-[state=checked]:bg-yellow-500"
              />
            </SettingRow>

            <SettingRow label="Show Value Area">
              <Switch
                checked={settings.showValueArea}
                onCheckedChange={(v) => update('showValueArea', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <SettingRow label="Color by Delta (Buy/Sell)">
              <Switch
                checked={settings.showDelta}
                onCheckedChange={(v) => update('showDelta', v)}
                className="data-[state=checked]:bg-green-600"
              />
            </SettingRow>

            <SettingRow label="Show Labels">
              <Switch
                checked={settings.showLabels}
                onCheckedChange={(v) => update('showLabels', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <SettingRow label="Update on Pan/Zoom">
              <Switch
                checked={settings.updateOnPan}
                onCheckedChange={(v) => update('updateOnPan', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>
          </div>

          {/* Colors */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colors</p>

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { key: 'pocColor', label: 'POC' },
                  { key: 'vahColor', label: 'VAH' },
                  { key: 'valColor', label: 'VAL' },
                  { key: 'buyColor', label: 'Buy Volume' },
                  { key: 'sellColor', label: 'Sell Volume' },
                ] as { key: keyof VolumeProfileSettings; label: string }[]
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings[key] as string}
                    onChange={(e) => update(key, e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                    aria-label={`${label} color`}
                  />
                  <span className="text-xs text-slate-300">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

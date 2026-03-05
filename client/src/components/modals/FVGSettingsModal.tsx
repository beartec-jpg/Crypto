import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FVGSettings } from '@/types/fvg';

interface FVGSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: FVGSettings;
  onSettingsChange: (settings: FVGSettings) => void;
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

export function FVGSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: FVGSettingsModalProps) {
  function update<K extends keyof FVGSettings>(key: K, value: FVGSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">FVG Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Enable/Disable */}
          <SettingRow label="Enable FVG Detection">
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => update('enabled', v)}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Divider */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Filters</p>

            <SliderRow
              label="Min Gap %"
              value={settings.minGapPercent}
              min={0.1}
              max={5}
              step={0.1}
              displayValue={`${settings.minGapPercent.toFixed(1)}%`}
              onChange={(v) => update('minGapPercent', v)}
            />

            <SliderRow
              label="Max Gap % (0 = off)"
              value={settings.maxGapPercent}
              min={0}
              max={20}
              step={0.5}
              displayValue={settings.maxGapPercent === 0 ? 'Off' : `${settings.maxGapPercent.toFixed(1)}%`}
              onChange={(v) => update('maxGapPercent', v)}
            />

            <SliderRow
              label="Min Volume Ratio"
              value={settings.minVolumeRatio}
              min={1}
              max={3}
              step={0.5}
              displayValue={`${settings.minVolumeRatio.toFixed(1)}x`}
              onChange={(v) => update('minVolumeRatio', v)}
            />

            <SliderRow
              label="Max Age (candles)"
              value={settings.maxAge}
              min={10}
              max={500}
              step={10}
              displayValue={`${settings.maxAge}`}
              onChange={(v) => update('maxAge', v)}
            />
          </div>

          {/* Display */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

            <SettingRow label="Show Bullish FVGs">
              <Switch
                checked={settings.showBullish}
                onCheckedChange={(v) => update('showBullish', v)}
                className="data-[state=checked]:bg-green-600"
              />
            </SettingRow>

            <SettingRow label="Show Bearish FVGs">
              <Switch
                checked={settings.showBearish}
                onCheckedChange={(v) => update('showBearish', v)}
                className="data-[state=checked]:bg-red-600"
              />
            </SettingRow>

            <SettingRow label="Show Mitigated FVGs">
              <Switch
                checked={settings.showMitigated}
                onCheckedChange={(v) => update('showMitigated', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <SettingRow label="Show CE Line (50%)">
              <Switch
                checked={settings.showCELine}
                onCheckedChange={(v) => update('showCELine', v)}
                className="data-[state=checked]:bg-yellow-600"
              />
            </SettingRow>

            <SettingRow label="Show Labels">
              <Switch
                checked={settings.showLabels}
                onCheckedChange={(v) => update('showLabels', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <SettingRow label="Extend Right">
              <Switch
                checked={settings.extendRight}
                onCheckedChange={(v) => update('extendRight', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>
          </div>

          {/* Advanced */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Advanced</p>

            <SettingRow label="Detect Inverse FVG (IFVG)">
              <Switch
                checked={settings.detectIFVG}
                onCheckedChange={(v) => update('detectIFVG', v)}
                className="data-[state=checked]:bg-purple-600"
              />
            </SettingRow>
          </div>

          {/* Colors */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colors</p>

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { key: 'bullishColor', label: 'Bullish' },
                  { key: 'bearishColor', label: 'Bearish' },
                  { key: 'mitigatedColor', label: 'Mitigated' },
                  { key: 'ifvgColor', label: 'IFVG' },
                  { key: 'ceLineColor', label: 'CE Line' },
                ] as { key: keyof FVGSettings; label: string }[]
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

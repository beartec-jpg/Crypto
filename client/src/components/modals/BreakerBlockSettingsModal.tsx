import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import type { BreakerBlockSettings } from '@/types/breakerBlock';

interface BreakerBlockSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BreakerBlockSettings;
  onSettingsChange: (settings: BreakerBlockSettings) => void;
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

export function BreakerBlockSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: BreakerBlockSettingsModalProps) {
  function update<K extends keyof BreakerBlockSettings>(key: K, value: BreakerBlockSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Breaker Block Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Enable/Disable */}
          <SettingRow label="Enable Breaker Blocks">
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => update('enabled', v)}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Display */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

            <SettingRow label="Show Bullish Breakers">
              <Switch
                checked={settings.showBullish}
                onCheckedChange={(v) => update('showBullish', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <SettingRow label="Show Bearish Breakers">
              <Switch
                checked={settings.showBearish}
                onCheckedChange={(v) => update('showBearish', v)}
                className="data-[state=checked]:bg-orange-500"
              />
            </SettingRow>

            <SettingRow label="Show Mitigated">
              <Switch
                checked={settings.showMitigated}
                onCheckedChange={(v) => update('showMitigated', v)}
                className="data-[state=checked]:bg-slate-500"
              />
            </SettingRow>

            <SettingRow label="Show Labels (BB ↑ / BB ↓)">
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

          {/* Filters */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Filters</p>

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

          {/* Stripes */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Stripe Pattern</p>

            <SliderRow
              label="Stripe Spacing (px)"
              value={settings.stripeSpacing}
              min={4}
              max={20}
              step={1}
              displayValue={`${settings.stripeSpacing}px`}
              onChange={(v) => update('stripeSpacing', v)}
            />

            <SliderRow
              label="Stripe Width (px)"
              value={settings.stripeWidth}
              min={0.5}
              max={3}
              step={0.5}
              displayValue={`${settings.stripeWidth}px`}
              onChange={(v) => update('stripeWidth', v)}
            />

            <SliderRow
              label="Zone Opacity"
              value={settings.zoneOpacity}
              min={0.05}
              max={0.5}
              step={0.05}
              displayValue={`${Math.round(settings.zoneOpacity * 100)}%`}
              onChange={(v) => update('zoneOpacity', v)}
            />
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
                ] as { key: keyof BreakerBlockSettings; label: string }[]
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

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SuperTrendSettings, SuperTrendConfig, SuperTrendType } from '@/types/supertrend';

interface SuperTrendSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SuperTrendSettings;
  onSettingsChange: (type: SuperTrendType, updates: Partial<SuperTrendConfig>) => void;
}

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

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue?: string;
  onChange: (value: number) => void;
}

function SliderRow({ label, value, min, max, step, displayValue, onChange }: SliderRowProps) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-sm text-slate-300">{label}</Label>
        <span className="text-xs text-slate-400">{displayValue ?? value}</span>
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

interface TypeTabProps {
  config: SuperTrendConfig;
  showAdxSettings: boolean;
  showEmaSettings: boolean;
  onChange: (updates: Partial<SuperTrendConfig>) => void;
}

function TypeTab({ config, showAdxSettings, showEmaSettings, onChange }: TypeTabProps) {
  return (
    <div className="space-y-1 py-2">
      <SettingRow label="Enable">
        <Switch
          checked={config.enabled}
          onCheckedChange={(v) => onChange({ enabled: v })}
          className="data-[state=checked]:bg-blue-600"
        />
      </SettingRow>

      <div className="border-t border-slate-700 pt-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Parameters</p>

        <SliderRow
          label="ATR Period"
          value={config.period}
          min={5}
          max={50}
          step={1}
          onChange={(v) => onChange({ period: v })}
        />

        <SliderRow
          label="Multiplier"
          value={config.multiplier}
          min={0.5}
          max={10}
          step={0.1}
          displayValue={config.multiplier.toFixed(1)}
          onChange={(v) => onChange({ multiplier: v })}
        />

        {showAdxSettings && (
          <>
            <SliderRow
              label="ADX Period"
              value={config.adxPeriod}
              min={5}
              max={50}
              step={1}
              onChange={(v) => onChange({ adxPeriod: v })}
            />
            <SliderRow
              label="ADX Threshold"
              value={config.adxThreshold}
              min={10}
              max={60}
              step={1}
              onChange={(v) => onChange({ adxThreshold: v })}
            />
          </>
        )}

        {showEmaSettings && (
          <SliderRow
            label="EMA Period"
            value={config.emaPeriod}
            min={5}
            max={100}
            step={1}
            onChange={(v) => onChange({ emaPeriod: v })}
          />
        )}
      </div>

      <div className="border-t border-slate-700 pt-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Display</p>

        <SettingRow label="Show Line">
          <Switch
            checked={config.showLine}
            onCheckedChange={(v) => onChange({ showLine: v })}
            className="data-[state=checked]:bg-blue-600"
          />
        </SettingRow>

        <SettingRow label="Show Signals">
          <Switch
            checked={config.showSignals}
            onCheckedChange={(v) => onChange({ showSignals: v })}
            className="data-[state=checked]:bg-blue-600"
          />
        </SettingRow>

        <SliderRow
          label="Line Width"
          value={config.lineWidth}
          min={1}
          max={5}
          step={1}
          onChange={(v) => onChange({ lineWidth: v })}
        />
      </div>

      <div className="border-t border-slate-700 pt-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colors</p>
        <div className="space-y-2">
          {(
            [
              { key: 'bullishColor', label: 'Bullish' },
              { key: 'bearishColor', label: 'Bearish' },
              { key: 'signalColor', label: 'Signal' },
            ] as { key: keyof SuperTrendConfig; label: string }[]
          ).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={config[key] as string}
                onChange={(e) => onChange({ [key]: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                aria-label={`${label} color`}
              />
              <span className="text-xs text-slate-300">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SuperTrendSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: SuperTrendSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">SuperTrend Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="standard" className="mt-2">
          <TabsList className="w-full bg-slate-800 border border-slate-700 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger
              value="standard"
              className="flex-1 data-[state=active]:bg-slate-700 text-xs"
            >
              Standard
            </TabsTrigger>
            <TabsTrigger
              value="adx"
              className="flex-1 data-[state=active]:bg-slate-700 text-xs"
            >
              ADX
            </TabsTrigger>
            <TabsTrigger
              value="keltner"
              className="flex-1 data-[state=active]:bg-slate-700 text-xs"
            >
              Keltner
            </TabsTrigger>
          </TabsList>

          <TabsContent value="standard" className="space-y-1 py-1">
            <TypeTab
              config={settings.standard}
              showAdxSettings={false}
              showEmaSettings={false}
              onChange={(updates) => onSettingsChange('standard', updates)}
            />
          </TabsContent>

          <TabsContent value="adx" className="space-y-1 py-1">
            <TypeTab
              config={settings.adx}
              showAdxSettings={true}
              showEmaSettings={false}
              onChange={(updates) => onSettingsChange('adx', updates)}
            />
          </TabsContent>

          <TabsContent value="keltner" className="space-y-1 py-1">
            <TypeTab
              config={settings.keltner}
              showAdxSettings={false}
              showEmaSettings={true}
              onChange={(updates) => onSettingsChange('keltner', updates)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

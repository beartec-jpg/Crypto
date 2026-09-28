import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X } from 'lucide-react';
import { useTideZoneSettings } from '@/hooks/useTideZoneSettings';
import {
  TIDE_PRESETS,
  isTidePreset,
  type TideTimeframe,
  type TideTimeframeSettings,
  type TideZoneSettings,
} from '@/types/tideZoneSettings';

interface TideZoneSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TideZoneSettings;
  /** Display toggles and colours (shared). */
  onSettingsChange: (updates: Partial<Omit<TideZoneSettings, 'byTimeframe'>>) => void;
  /** Per-timeframe values. */
  onTimeframeChange: (tf: TideTimeframe, updates: Partial<TideTimeframeSettings>) => void;
  onResetTimeframe: (tf: TideTimeframe) => void;
  /** Tab to open on (the chart's timeframe when it is 1h/4h). */
  initialTimeframe?: TideTimeframe | null;
}

function NumRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-xs text-slate-300">{label}</Label>
          {hint && <div className="text-[10px] text-slate-500 leading-snug">{hint}</div>}
        </div>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : min}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-20 bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600 text-right"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 accent-violet-500 cursor-pointer"
      />
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-slate-300">{label}</Label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 rounded border border-slate-600 bg-slate-800"
      />
    </div>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-slate-300">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-violet-600" />
    </div>
  );
}

function TimeframeFields({
  tf,
  values,
  onChange,
  onReset,
}: {
  tf: TideTimeframe;
  values: TideTimeframeSettings;
  onChange: (updates: Partial<TideTimeframeSettings>) => void;
  onReset: () => void;
}) {
  const preset = TIDE_PRESETS[tf];
  const atPreset = isTidePreset(values, tf);
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-500 leading-snug">
        {tf} preset: EMA {preset.emaPeriod} · N {preset.pivotN} · below {preset.belowScore} · Tide-in EMA{' '}
        {preset.exitEmaPeriod} peak N {preset.exitPivotN} · stop{' '}
        {preset.stopKind === 'atr' ? `pivot − ${preset.stopAtrMult} ATR` : `pivot − ${(preset.stopPct * 100).toFixed(1)}%`}
        {atPreset ? ' (active)' : ' — edited'}
      </p>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">Tide out</div>
      <NumRow
        label="Smoothing EMA"
        hint="EMA of the Tide score (sky line)"
        value={values.emaPeriod}
        min={2}
        max={34}
        step={1}
        onChange={(emaPeriod) => onChange({ emaPeriod })}
      />
      <NumRow
        label="Pivot N"
        hint="Bars either side for price wick pivots and Tide-EMA pivots. A signal prints N bars after its low."
        value={values.pivotN}
        min={2}
        max={21}
        step={1}
        onChange={(pivotN) => onChange({ pivotN })}
      />
      <NumRow
        label="Threshold (below score)"
        hint="Both Tide-EMA troughs must be under this (0 = off)"
        value={values.belowScore}
        min={-80}
        max={0}
        step={1}
        onChange={(belowScore) => onChange({ belowScore })}
      />
      <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">Tide in (exit)</div>
      <NumRow
        label="Peak EMA"
        hint="Exit on a confirmed peak of this EMA of the score"
        value={values.exitEmaPeriod}
        min={2}
        max={34}
        step={1}
        onChange={(exitEmaPeriod) => onChange({ exitEmaPeriod })}
      />
      <NumRow
        label="Peak pivot N"
        value={values.exitPivotN}
        min={2}
        max={21}
        step={1}
        onChange={(exitPivotN) => onChange({ exitPivotN })}
      />
      <div className="text-[10px] font-semibold uppercase tracking-wide text-red-300">Stop</div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-slate-300">Stop under pivot low</Label>
        <select
          value={values.stopKind}
          onChange={(e) => onChange({ stopKind: e.target.value === 'pct' ? 'pct' : 'atr' })}
          className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
        >
          <option value="atr">ATR buffer</option>
          <option value="pct">% buffer</option>
        </select>
      </div>
      {values.stopKind === 'atr' ? (
        <NumRow
          label="ATR(14) multiple"
          value={values.stopAtrMult}
          min={0}
          max={3}
          step={0.1}
          onChange={(stopAtrMult) => onChange({ stopAtrMult })}
        />
      ) : (
        <NumRow
          label="Buffer %"
          value={Math.round(values.stopPct * 1000) / 10}
          min={0}
          max={5}
          step={0.1}
          onChange={(pct) => onChange({ stopPct: pct / 100 })}
        />
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full border-slate-600 text-slate-300"
        onClick={onReset}
        disabled={atPreset}
      >
        Reset {tf} to preset
      </Button>
    </div>
  );
}

export function TideZoneSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onTimeframeChange,
  onResetTimeframe,
  initialTimeframe,
}: TideZoneSettingsModalProps) {
  const [tab, setTab] = useState<TideTimeframe>(initialTimeframe ?? '4h');
  useEffect(() => {
    if (isOpen && initialTimeframe) setTab(initialTimeframe);
  }, [isOpen, initialTimeframe]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-sm p-0 gap-0 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="px-4 py-3 border-b border-slate-700 flex flex-row items-center justify-between">
          <DialogTitle className="text-sm font-semibold">Tide settings</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-slate-400 leading-snug">
            Tide runs on 1h and 4h charts only, each with its own values. Tide out = price lower low vs
            Tide-EMA higher low, printed once on the bar it confirms and never removed. Tide out + = RSI(14)
            went under 30 between the low and that bar. Tide in = the exit.
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v === '1h' ? '1h' : '4h')}>
            <TabsList className="grid w-full grid-cols-2 bg-slate-800">
              <TabsTrigger value="1h">1h</TabsTrigger>
              <TabsTrigger value="4h">4h</TabsTrigger>
            </TabsList>
            {(['1h', '4h'] as const).map((tf) => (
              <TabsContent key={tf} value={tf} className="pt-2">
                <TimeframeFields
                  tf={tf}
                  values={settings.byTimeframe[tf]}
                  onChange={(u) => onTimeframeChange(tf, u)}
                  onReset={() => onResetTimeframe(tf)}
                />
              </TabsContent>
            ))}
          </Tabs>

          <div className="border-t border-slate-700 pt-3 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Show (1h and 4h)</div>
            <SwitchRow label="Tide out / Tide out +" checked={settings.showTideOut} onChange={(showTideOut) => onSettingsChange({ showTideOut })} />
            <SwitchRow label="Tide in (exit)" checked={settings.showTideIn} onChange={(showTideIn) => onSettingsChange({ showTideIn })} />
            <SwitchRow label="Stop lines" checked={settings.showStops} onChange={(showStops) => onSettingsChange({ showStops })} />
            <SwitchRow label="Absorb boxes (watch, repaints)" checked={settings.showAbsorb} onChange={(showAbsorb) => onSettingsChange({ showAbsorb })} />
            <ColorRow label="Tide out" value={settings.tideOutColor} onChange={(tideOutColor) => onSettingsChange({ tideOutColor })} />
            <ColorRow label="Tide out +" value={settings.tideOutPlusColor} onChange={(tideOutPlusColor) => onSettingsChange({ tideOutPlusColor })} />
            <ColorRow label="Tide in" value={settings.tideInColor} onChange={(tideInColor) => onSettingsChange({ tideInColor })} />
            <ColorRow label="Stop" value={settings.stopColor} onChange={(stopColor) => onSettingsChange({ stopColor })} />
            {settings.showAbsorb && (
              <ColorRow label="Absorb" value={settings.absorbColor} onChange={(absorbColor) => onSettingsChange({ absorbColor })} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Modal wired to the shared Tide settings store. */
export function ConnectedTideZoneSettingsModal({
  isOpen,
  onClose,
  timeframe,
}: {
  isOpen: boolean;
  onClose: () => void;
  timeframe?: TideTimeframe | null;
}) {
  const { settings, updateSettings, updateTimeframe, resetTimeframe } = useTideZoneSettings();
  return (
    <TideZoneSettingsModal
      isOpen={isOpen}
      onClose={onClose}
      settings={settings}
      onSettingsChange={updateSettings}
      onTimeframeChange={updateTimeframe}
      onResetTimeframe={resetTimeframe}
      initialTimeframe={timeframe}
    />
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { TideZoneSettings } from '@/types/tideZoneSettings';

interface TideZoneSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TideZoneSettings;
  onSettingsChange: (updates: Partial<TideZoneSettings>) => void;
  onReset?: () => void;
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

export function TideZoneSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onReset,
}: TideZoneSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-sm p-0 gap-0 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="px-4 py-3 border-b border-slate-700 flex flex-row items-center justify-between">
          <DialogTitle className="text-sm font-semibold">Tide prints</DialogTitle>
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
            Zigzag N sizes both the price wick swings and the Tide EMA swings.
            DIV = price lower pivot vs EMA higher pivot. Absorb = price flat/down
            while Tide EMA is rising. Watches, not buys.
          </p>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-300">Show DIV</Label>
            <Switch
              checked={settings.showDiv}
              onCheckedChange={(showDiv) => onSettingsChange({ showDiv })}
              className="data-[state=checked]:bg-violet-600"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-300">Show Absorb</Label>
            <Switch
              checked={settings.showAbsorb}
              onCheckedChange={(showAbsorb) => onSettingsChange({ showAbsorb })}
              className="data-[state=checked]:bg-cyan-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-300">DIV color</Label>
            <input
              type="color"
              value={settings.divColor}
              onChange={(e) => onSettingsChange({ divColor: e.target.value })}
              className="h-7 w-10 rounded border border-slate-600 bg-slate-800"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-300">Absorb color</Label>
            <input
              type="color"
              value={settings.absorbColor}
              onChange={(e) => onSettingsChange({ absorbColor: e.target.value })}
              className="h-7 w-10 rounded border border-slate-600 bg-slate-800"
            />
          </div>

          <NumRow
            label="Hist EMA"
            hint="Sky line on the Tide pane"
            value={settings.emaPeriod}
            min={2}
            max={34}
            step={1}
            onChange={(emaPeriod) => onSettingsChange({ emaPeriod })}
          />
          <NumRow
            label="Zigzag length N"
            hint="N bars either side on price and on Tide EMA. This is the only size control."
            value={settings.confirmBars}
            min={2}
            max={21}
            step={1}
            onChange={(confirmBars) => onSettingsChange({ confirmBars })}
          />
          <NumRow
            label="Below score"
            hint="DIV EMA pivots must be under this (0 = off). Absorb does not use this."
            value={settings.belowScore}
            min={-80}
            max={0}
            step={1}
            onChange={(belowScore) => onSettingsChange({ belowScore })}
          />
          <NumRow
            label="Keep last N"
            value={settings.keep}
            min={2}
            max={24}
            step={1}
            onChange={(keep) => onSettingsChange({ keep })}
          />

          {onReset && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-slate-600 text-slate-300"
              onClick={onReset}
            >
              Reset defaults
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

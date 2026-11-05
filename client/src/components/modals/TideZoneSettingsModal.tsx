// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTideZoneSettings } from '@/hooks/useTideZoneSettings';
import {
  TIDE_EMA_MAX,
  TIDE_EMA_MIN,
  TIDE_IN_MIN,
  TIDE_OUT_MAX,
  type TideCrossDriver,
} from '@/types/tideZoneSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function SliderRow({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-xs text-slate-300">
            {label}
          </Label>
          <div className="text-[10px] leading-snug text-slate-500">{hint}</div>
        </div>
        <span className="w-12 text-right font-mono text-xs tabular-nums text-slate-100" data-testid={`${id}-value`}>
          {value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="h-1.5 w-full cursor-pointer accent-sky-500"
      />
    </div>
  );
}

/** Tide Zone settings: 4 sliders and one Short/Long toggle. Nothing else is adjustable. */
export function TideZoneSettingsModal({ isOpen, onClose }: Props) {
  const { settings, update, reset } = useTideZoneSettings();

  const pick = (crossEma: TideCrossDriver) => update({ crossEma });

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm border-slate-700 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-sm">Tide Zone settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <SliderRow
            id="tide-ema-short"
            label="EMA short"
            hint="Fast EMA of the histogram (1 to 100)."
            value={settings.emaShort}
            min={TIDE_EMA_MIN}
            max={TIDE_EMA_MAX}
            onChange={(emaShort) => update({ emaShort })}
          />
          <SliderRow
            id="tide-ema-long"
            label="EMA long"
            hint="Slow EMA of the histogram (1 to 100)."
            value={settings.emaLong}
            min={TIDE_EMA_MIN}
            max={TIDE_EMA_MAX}
            onChange={(emaLong) => update({ emaLong })}
          />
          <SliderRow
            id="tide-in-level"
            label="Tide in level"
            hint="Tide in only counts when the cross happens at or below this score (0 to -80)."
            value={settings.tideInLevel}
            min={TIDE_IN_MIN}
            max={0}
            onChange={(tideInLevel) => update({ tideInLevel })}
          />
          <SliderRow
            id="tide-out-level"
            label="Tide out level"
            hint="Tide out only counts when the cross happens at or above this score (0 to 80)."
            value={settings.tideOutLevel}
            min={0}
            max={TIDE_OUT_MAX}
            onChange={(tideOutLevel) => update({ tideOutLevel })}
          />
          <div className="space-y-1">
            <Label className="text-xs text-slate-300">EMA that drives the cross</Label>
            <div className="text-[10px] leading-snug text-slate-500">
              Tide in / out fire when this EMA crosses the histogram. Both EMAs stay on the chart.
            </div>
            <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="EMA that drives the cross">
              {(['short', 'long'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={settings.crossEma === d}
                  onClick={() => pick(d)}
                  className={`rounded border px-2 py-1 text-xs font-medium ${
                    settings.crossEma === d
                      ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                      : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {d === 'short' ? 'Short' : 'Long'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={reset} className="text-xs text-slate-400">
              Reset
            </Button>
            <Button size="sm" onClick={onClose} className="text-xs">
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

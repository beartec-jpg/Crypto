import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { VolumeEmaLineStyle, VolumeEmaSettings } from '@/types/volumeEma';

interface VolumeEmaSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VolumeEmaSettings;
  onSettingsChange: (updates: Partial<VolumeEmaSettings>) => void;
  onReset?: () => void;
}

const WIDTHS = [1, 2, 3, 4];
const STYLES: Array<{ value: VolumeEmaLineStyle; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

function NumRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  testId?: string;
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
          data-testid={testId}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 accent-cyan-500 cursor-pointer"
      />
    </div>
  );
}

export function VolumeEmaSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onReset,
}: VolumeEmaSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-slate-100 p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-slate-700 flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-sm font-semibold text-slate-100">
            Volume EMA
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-white"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm font-medium text-slate-100">Enable</div>
              <div className="text-[11px] text-slate-400">
                Rel-vol path on the price scale
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(enabled) => onSettingsChange({ enabled })}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>

          <div className={`space-y-3 ${settings.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            {/* Look */}
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 pt-1">
              Look
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-slate-300">Line color</Label>
              <input
                type="color"
                value={settings.color}
                onChange={(e) => onSettingsChange({ color: e.target.value })}
                className="w-8 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
                data-testid="input-volume-ema-color"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-slate-300">Thickness</Label>
              <select
                value={settings.lineWidth}
                onChange={(e) => onSettingsChange({ lineWidth: Number(e.target.value) })}
                className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="select-volume-ema-width"
              >
                {WIDTHS.map((w) => (
                  <option key={w} value={w}>
                    {w}px
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-slate-300">Line style</Label>
              <select
                value={settings.lineStyle}
                onChange={(e) =>
                  onSettingsChange({ lineStyle: e.target.value as VolumeEmaLineStyle })
                }
                className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="select-volume-ema-style"
              >
                {STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-xs text-slate-300">Curved path</Label>
                <div className="text-[10px] text-slate-500">Softer corners on the line</div>
              </div>
              <Switch
                checked={settings.curved}
                onCheckedChange={(curved) => onSettingsChange({ curved })}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>

            {/* Math tuning */}
            <div className="border-t border-slate-700 pt-3 space-y-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Math — tune live
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                  Buy = above high + pad · Sell = below low − pad · pad =
                  (wick clear + mag × k) × ATR. Play with these, then we lock
                  defaults.
                </p>
              </div>

              <NumRow
                label="Push strength (k)"
                hint="Higher = further past the wick on 2×/4× vol"
                value={settings.k}
                min={0.25}
                max={6}
                step={0.05}
                onChange={(k) => onSettingsChange({ k })}
                testId="input-volume-ema-k"
              />

              <NumRow
                label="Wick clear (ATR)"
                hint="Base pad beyond high/low when elevated"
                value={settings.wickClearAtr}
                min={0}
                max={4}
                step={0.05}
                onChange={(wickClearAtr) => onSettingsChange({ wickClearAtr })}
                testId="input-volume-ema-wick-clear"
              />

              <NumRow
                label="Smooth period"
                hint="Double-EMA; higher = less jagged"
                value={settings.smoothPeriod}
                min={1}
                max={30}
                step={1}
                onChange={(smoothPeriod) =>
                  onSettingsChange({ smoothPeriod: Math.round(smoothPeriod) })
                }
                testId="input-volume-ema-smooth"
              />

              <NumRow
                label="Volume EMA period"
                hint="Baseline average volume window"
                value={settings.volumeEmaPeriod}
                min={5}
                max={100}
                step={1}
                onChange={(volumeEmaPeriod) =>
                  onSettingsChange({ volumeEmaPeriod: Math.round(volumeEmaPeriod) })
                }
              />

              <NumRow
                label="ATR period"
                hint="Scales how far “pad” is in price"
                value={settings.atrPeriod}
                min={5}
                max={50}
                step={1}
                onChange={(atrPeriod) =>
                  onSettingsChange({ atrPeriod: Math.round(atrPeriod) })
                }
              />

              <NumRow
                label="Clamp (log2 cap)"
                hint="Max magnitude; 4 ≈ 16× volume"
                value={settings.clampSigmas}
                min={1}
                max={8}
                step={0.5}
                onChange={(clampSigmas) => onSettingsChange({ clampSigmas })}
              />

              <NumRow
                label="Spike ratio"
                hint="Triangles when vol ≥ this × EMA"
                value={settings.spikeRatio}
                min={1.2}
                max={5}
                step={0.1}
                onChange={(spikeRatio) => onSettingsChange({ spikeRatio })}
              />

              <NumRow
                label="Spike marker pad (ATR)"
                hint="How far triangles sit past the wick"
                value={settings.spikeOffsetAtr}
                min={0.2}
                max={3}
                step={0.05}
                onChange={(spikeOffsetAtr) => onSettingsChange({ spikeOffsetAtr })}
              />
            </div>

            <div className="border-t border-slate-700 pt-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-xs text-slate-300">Spike markers</Label>
                  <div className="text-[10px] text-slate-500">Buy / sell triangles at spike ratio</div>
                </div>
                <Switch
                  checked={settings.showSpikes}
                  onCheckedChange={(showSpikes) => onSettingsChange({ showSpikes })}
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>

              <div
                className={`space-y-2 ${settings.showSpikes ? '' : 'opacity-40 pointer-events-none'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-slate-300">Buy spike color</Label>
                  <input
                    type="color"
                    value={settings.buySpikeColor}
                    onChange={(e) => onSettingsChange({ buySpikeColor: e.target.value })}
                    className="w-8 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-slate-300">Sell spike color</Label>
                  <input
                    type="color"
                    value={settings.sellSpikeColor}
                    onChange={(e) => onSettingsChange({ sellSpikeColor: e.target.value })}
                    className="w-8 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {onReset && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
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

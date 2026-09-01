import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { SwoopLineStyle, SwoopSettings } from '@/types/swoop';

interface SwoopSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SwoopSettings;
  onSettingsChange: (updates: Partial<SwoopSettings>) => void;
  onReset?: () => void;
}

const WIDTHS = [1, 2, 3, 4];
const STYLES: Array<{ value: SwoopLineStyle; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

export function SwoopSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onReset,
}: SwoopSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-sm p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-slate-700 flex flex-row items-center justify-between">
          <DialogTitle className="text-sm font-semibold">Structure book</DialogTitle>
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
            Visible-range zigzag. Classifies the envelope as Swoop (curved LH
            deceleration), equal compression (LH+HL triangle), down compression
            (LH+LL wedge), or channel (flat). Fan is last-gap angle plus Δ-fit.
          </p>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-300">Show forecast fan</Label>
            <Switch
              checked={settings.showFan}
              onCheckedChange={(showFan) => onSettingsChange({ showFan })}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-300">Show HUD</Label>
            <Switch
              checked={settings.showHud}
              onCheckedChange={(showHud) => onSettingsChange({ showHud })}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-300">Pivot labels</Label>
            <Switch
              checked={settings.showPivotLabels !== false}
              onCheckedChange={(showPivotLabels) => onSettingsChange({ showPivotLabels })}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-slate-300">Pivot length</Label>
            <select
              value={settings.swingLength}
              onChange={(e) => onSettingsChange({ swingLength: Number(e.target.value) })}
              className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
            >
              {[3, 5, 8, 10, 12, 16, 20, 24, 32, 48].map((n) => (
                <option key={n} value={n}>
                  {n} bars
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-slate-300">Min pivot size</Label>
            <select
              value={settings.minPivotPct ?? 1}
              onChange={(e) => onSettingsChange({ minPivotPct: Number(e.target.value) })}
              className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
            >
              {[0, 0.5, 1, 1.5, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'Off' : `${n}%`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-slate-300">Arm after lower highs</Label>
            <select
              value={settings.minLowerHighs}
              onChange={(e) => onSettingsChange({ minLowerHighs: Number(e.target.value) })}
              className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-slate-300">Top line</Label>
            <input
              type="color"
              value={settings.topColor}
              onChange={(e) => onSettingsChange({ topColor: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-slate-300">Bottom line</Label>
            <input
              type="color"
              value={settings.bottomColor}
              onChange={(e) => onSettingsChange({ bottomColor: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-slate-300">Fan</Label>
            <input
              type="color"
              value={settings.fanColor}
              onChange={(e) => onSettingsChange({ fanColor: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-slate-300">Width</Label>
            <select
              value={settings.lineWidth}
              onChange={(e) => onSettingsChange({ lineWidth: Number(e.target.value) })}
              className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
            >
              {WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-slate-300">Style</Label>
            <select
              value={settings.lineStyle}
              onChange={(e) => onSettingsChange({ lineStyle: e.target.value as SwoopLineStyle })}
              className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
            >
              {STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="w-full text-xs text-slate-300 hover:text-white hover:bg-slate-800"
            >
              Reset defaults
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

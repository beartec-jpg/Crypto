import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type {
  AutoTrendlineLineStyle,
  AutoTrendlineSettings,
  AutoTrendlineTierId,
  AutoTrendlineTierSettings,
} from '@/types/autoTrendline';

interface AutoTrendlineSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AutoTrendlineSettings;
  onSettingsChange: (updates: Partial<AutoTrendlineSettings>) => void;
  onTierChange: (tier: AutoTrendlineTierId, updates: Partial<AutoTrendlineTierSettings>) => void;
  onReset?: () => void;
}

const TIER_META: Array<{
  id: AutoTrendlineTierId;
  title: string;
  blurb: string;
}> = [
  {
    id: 'macro',
    title: 'Macro',
    blurb: 'Full chart · large wick pivots · longest high-touch lines',
  },
  {
    id: 'mid',
    title: 'Mid',
    blurb: 'Middle lookback · balanced pivots',
  },
  {
    id: 'ltf',
    title: 'LTF',
    blurb: 'Recent structure · tight pivots',
  },
];

const WIDTHS = [1, 2, 3, 4];
const STYLES: Array<{ value: AutoTrendlineLineStyle; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

function TierSection({
  title,
  blurb,
  config,
  onChange,
}: {
  title: string;
  blurb: string;
  config: AutoTrendlineTierSettings;
  onChange: (updates: Partial<AutoTrendlineTierSettings>) => void;
}) {
  return (
    <div className="border border-slate-700 rounded-lg p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <div className="text-[11px] text-slate-400 leading-snug">{blurb}</div>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
          className="shrink-0 data-[state=checked]:bg-blue-600"
        />
      </div>

      <div className={`space-y-2 ${config.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-slate-300">Support color</Label>
          <input
            type="color"
            value={config.supportColor}
            onChange={(e) => onChange({ supportColor: e.target.value })}
            className="w-8 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-slate-300">Resistance color</Label>
          <input
            type="color"
            value={config.resistanceColor}
            onChange={(e) => onChange({ resistanceColor: e.target.value })}
            className="w-8 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-slate-300">Width</Label>
          <select
            value={config.lineWidth}
            onChange={(e) => onChange({ lineWidth: Number(e.target.value) })}
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
            value={config.lineStyle}
            onChange={(e) => onChange({ lineStyle: e.target.value as AutoTrendlineLineStyle })}
            className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
          >
            {STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div>
            <Label className="text-xs text-slate-300">Extend right</Label>
            <div className="text-[10px] text-slate-500">Project past last touch to chart edge</div>
          </div>
          <Switch
            checked={config.extendRight}
            onCheckedChange={(extendRight) => onChange({ extendRight })}
            className="shrink-0 data-[state=checked]:bg-blue-600"
          />
        </div>
      </div>
    </div>
  );
}

export function AutoTrendlineSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onTierChange,
  onReset,
}: AutoTrendlineSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-slate-100 p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-slate-700 flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-sm font-semibold text-slate-100">
            Auto Trendlines
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

        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm font-medium text-slate-100">Master enable</div>
              <div className="text-[11px] text-slate-400">
                Tools toggle · each tier can still be off below
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(enabled) => onSettingsChange({ enabled })}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Lines are fitted to wick highs (resistance) and wick lows (support), scoring for the
            most touches and longest clean span — not forced from the first bar on the chart.
          </p>

          {TIER_META.map(({ id, title, blurb }) => (
            <TierSection
              key={id}
              title={title}
              blurb={blurb}
              config={settings[id]}
              onChange={(updates) => onTierChange(id, updates)}
            />
          ))}

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

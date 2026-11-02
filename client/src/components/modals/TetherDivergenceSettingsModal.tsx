import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useTetherDivergenceSettings } from '@/hooks/useTetherDivergenceSettings';
import { USDT_DOMINANCE_QUERY_KEY, type UsdtDominanceResponse } from '@/hooks/useTetherDivergence';
import type { TetherDivergenceSettings, TetherDivergenceTimeframe, TetherMarkerOnCross } from '@/types/tetherDivergenceSettings';

interface TetherDivergenceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TetherDivergenceSettings;
  onSettingsChange: (updates: Partial<TetherDivergenceSettings>) => void;
  onReset: () => void;
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
        className="w-full h-1.5 accent-sky-500 cursor-pointer"
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

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <Label className="text-xs text-slate-300">{label}</Label>
        {hint && <div className="text-[10px] text-slate-500 leading-snug">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-sky-600" />
    </div>
  );
}

export function TetherDivergenceSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onReset,
}: TetherDivergenceSettingsModalProps) {
  const { data } = useQuery<UsdtDominanceResponse>({
    queryKey: USDT_DOMINANCE_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/crypto/usdt-dominance');
      if (!res.ok) throw new Error('USDT.D');
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    enabled: isOpen,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-sm p-0 gap-0 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="px-4 py-3 border-b border-slate-700 flex flex-row items-center justify-between">
          <DialogTitle className="text-sm font-semibold">Tether Divergence</DialogTitle>
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
            Bottoms validated out-of-sample (~3x lift, BTC/XRP, coincident not leading). Tops NOT
            validated.
          </p>

          <div className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1.5">
            <span className="text-[10px] text-slate-400 truncate">
              Source: {data?.source ?? 'loading…'}
            </span>
            {data?.approximate && (
              <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                approximate
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-300">Timeframe</Label>
            <select
              value={settings.timeframe}
              onChange={(e) =>
                onSettingsChange({ timeframe: e.target.value === '1W' ? '1W' : '1D' } satisfies { timeframe: TetherDivergenceTimeframe })
              }
              className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
            >
              <option value="1D">Daily</option>
              <option value="1W">Weekly (UTC Monday)</option>
            </select>
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">USDT.D stretch</div>
          <NumRow label="USDT.D RSI length" value={settings.usdtRsiLen} min={2} max={50} step={1} onChange={(usdtRsiLen) => onSettingsChange({ usdtRsiLen })} />
          <NumRow label="EMA length" value={settings.emaLen} min={2} max={50} step={1} onChange={(emaLen) => onSettingsChange({ emaLen })} />
          <NumRow label="BB length" value={settings.bbLen} min={2} max={50} step={1} onChange={(bbLen) => onSettingsChange({ bbLen })} />
          <NumRow label="BB multiplier" value={settings.bbMult} min={0.5} max={5} step={0.1} onChange={(bbMult) => onSettingsChange({ bbMult })} />
          <NumRow
            label="EMA distance for 100"
            hint="% above EMA that maps to a component score of 100"
            value={settings.emaDistFullPct}
            min={0.5}
            max={20}
            step={0.1}
            onChange={(emaDistFullPct) => onSettingsChange({ emaDistFullPct })}
          />
          <NumRow label="Weight RSI" value={settings.wRsi} min={0} max={5} step={0.1} onChange={(wRsi) => onSettingsChange({ wRsi })} />
          <NumRow label="Weight EMA" value={settings.wEma} min={0} max={5} step={0.1} onChange={(wEma) => onSettingsChange({ wEma })} />
          <NumRow label="Weight BB" value={settings.wBb} min={0} max={5} step={0.1} onChange={(wBb) => onSettingsChange({ wBb })} />

          <div className="text-[10px] font-semibold uppercase tracking-wide text-pink-300">Coin + blend</div>
          <NumRow label="Coin RSI length" value={settings.coinRsiLen} min={2} max={50} step={1} onChange={(coinRsiLen) => onSettingsChange({ coinRsiLen })} />
          <NumRow label="Weight stretch" value={settings.wStretch} min={0} max={5} step={0.1} onChange={(wStretch) => onSettingsChange({ wStretch })} />
          <NumRow label="Weight coin oversold" value={settings.wCoin} min={0} max={5} step={0.1} onChange={(wCoin) => onSettingsChange({ wCoin })} />

          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Bands</div>
          <NumRow label="Bottom zone ≥" value={settings.bottomThreshold} min={50} max={100} step={1} onChange={(bottomThreshold) => onSettingsChange({ bottomThreshold })} />
          <NumRow label="Watch ≥" value={settings.watchThreshold} min={0} max={100} step={1} onChange={(watchThreshold) => onSettingsChange({ watchThreshold })} />

          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gap shade</div>
          <NumRow label="USDT.D RSI min" hint="Near the top of USDT.D RSI" value={settings.gapUsdtMin} min={50} max={100} step={1} onChange={(gapUsdtMin) => onSettingsChange({ gapUsdtMin })} />
          <NumRow label="Coin RSI max" hint="Near the bottom of coin RSI" value={settings.gapCoinMax} min={0} max={50} step={1} onChange={(gapCoinMax) => onSettingsChange({ gapCoinMax })} />

          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Markers</div>
          <SwitchRow label="Show price markers" checked={settings.showMarkers} onChange={(showMarkers) => onSettingsChange({ showMarkers })} />
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-300">Mark cross up through</Label>
            <select
              value={settings.markerOnCross}
              onChange={(e) =>
                onSettingsChange({
                  markerOnCross: e.target.value === 'watch' ? 'watch' : 'bottom',
                } satisfies { markerOnCross: TetherMarkerOnCross })
              }
              className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600"
            >
              <option value="bottom">Bottom zone</option>
              <option value="watch">Watch</option>
            </select>
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-wide text-red-300">Top zone (unvalidated)</div>
          <SwitchRow
            label="Show top-zone mirror"
            hint="Off by default — tops were not validated"
            checked={settings.topMirror}
            onChange={(topMirror) => onSettingsChange({ topMirror })}
          />
          <NumRow label="Top threshold" value={settings.topThreshold} min={50} max={100} step={1} onChange={(topThreshold) => onSettingsChange({ topThreshold })} />

          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Colours</div>
          <ColorRow label="Bottom" value={settings.bottomColor} onChange={(bottomColor) => onSettingsChange({ bottomColor })} />
          <ColorRow label="Watch" value={settings.watchColor} onChange={(watchColor) => onSettingsChange({ watchColor })} />
          <ColorRow label="Neutral" value={settings.neutralColor} onChange={(neutralColor) => onSettingsChange({ neutralColor })} />
          <ColorRow label="USDT.D RSI" value={settings.usdtRsiColor} onChange={(usdtRsiColor) => onSettingsChange({ usdtRsiColor })} />
          <ColorRow label="Coin RSI" value={settings.coinRsiColor} onChange={(coinRsiColor) => onSettingsChange({ coinRsiColor })} />
          <ColorRow label="Gap shade" value={settings.gapColor} onChange={(gapColor) => onSettingsChange({ gapColor })} />
          <ColorRow label="Top mirror" value={settings.topColor} onChange={(topColor) => onSettingsChange({ topColor })} />

          <Button variant="outline" size="sm" className="w-full border-slate-600 text-slate-300" onClick={onReset}>
            Reset to defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectedTetherDivergenceSettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { settings, updateSettings, resetToDefaults, setModalOpen } = useTetherDivergenceSettings();
  useEffect(() => {
    setModalOpen(isOpen);
  }, [isOpen, setModalOpen]);
  return (
    <TetherDivergenceSettingsModal
      isOpen={isOpen}
      onClose={() => {
        setModalOpen(false);
        onClose();
      }}
      settings={settings}
      onSettingsChange={updateSettings}
      onReset={resetToDefaults}
    />
  );
}

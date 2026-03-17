import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CoinglassRange, LiquidityHeatmapSettings } from '@/types/liquidityHeatmap';
import { COINGLASS_RANGES } from '@/types/liquidityHeatmap';
import { getRangeLabel } from '@/lib/liquidityTimeframeMapping';

interface LiquidityHeatmapSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LiquidityHeatmapSettings;
  onSettingsChange: (settings: LiquidityHeatmapSettings) => void;
  effectiveRange: CoinglassRange;
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

const EXCHANGES = ['Binance', 'OKX', 'Bybit', 'dYdX', 'BitMEX'];

export function LiquidityHeatmapSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  effectiveRange,
}: LiquidityHeatmapSettingsModalProps) {
  function update<K extends keyof LiquidityHeatmapSettings>(key: K, value: LiquidityHeatmapSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Liquidity Heatmap Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Enable/Disable */}
          <SettingRow label="Enable Liquidity Heatmap">
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => update('enabled', v)}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Data Source */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Data Source</p>

            <div className="py-2">
              <Label className="text-sm text-slate-300 mb-1 block">Exchange</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {EXCHANGES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => update('exchange', ex)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                      settings.exchange === ex
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <SettingRow label="Sync to Chart Timeframe">
              <Switch
                checked={settings.syncToChartTimeframe}
                onCheckedChange={(v) => update('syncToChartTimeframe', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <div className="py-2">
              <div className="flex items-center justify-between mb-1">
                <Label className={`text-sm ${settings.syncToChartTimeframe ? 'text-slate-500' : 'text-slate-300'}`}>
                  Range
                </Label>
                {settings.syncToChartTimeframe && (
                  <span className="text-xs text-blue-400 font-semibold">
                    Auto: {getRangeLabel(effectiveRange)}
                  </span>
                )}
              </div>
              <select
                value={settings.range}
                onChange={(e) => update('range', e.target.value as CoinglassRange)}
                disabled={settings.syncToChartTimeframe}
                className={`w-full rounded px-3 py-1.5 text-sm border border-slate-600 bg-slate-800 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  settings.syncToChartTimeframe ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                {COINGLASS_RANGES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Display */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

            <SettingRow label="Show Heatmap Overlay">
              <Switch
                checked={settings.showHeatmap}
                onCheckedChange={(v) => update('showHeatmap', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <SettingRow label="Show Liquidation Levels">
              <Switch
                checked={settings.showLiquidationLevels}
                onCheckedChange={(v) => update('showLiquidationLevels', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <SettingRow label="Show Range Indicator">
              <Switch
                checked={settings.showRangeIndicator}
                onCheckedChange={(v) => update('showRangeIndicator', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <SliderRow
              label="Opacity"
              value={settings.opacity}
              min={10}
              max={100}
              step={5}
              displayValue={`${settings.opacity}%`}
              onChange={(v) => update('opacity', v)}
            />
          </div>

          {/* Colors */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colors</p>

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { key: 'longLiquidationColor', label: 'Long Liquidations' },
                  { key: 'shortLiquidationColor', label: 'Short Liquidations' },
                ] as { key: keyof LiquidityHeatmapSettings; label: string }[]
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

          {/* Behavior */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Behavior</p>

            <SettingRow label="Auto-Refresh">
              <Switch
                checked={settings.autoRefresh}
                onCheckedChange={(v) => update('autoRefresh', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            {settings.autoRefresh && (
              <SliderRow
                label="Refresh Interval"
                value={settings.refreshInterval}
                min={60}
                max={300}
                step={30}
                displayValue={`${settings.refreshInterval}s`}
                onChange={(v) => update('refreshInterval', v)}
              />
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-700">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
          <DialogTitle className="text-white">Predictive Liquidation Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Enable/Disable */}
          <SettingRow label="Enable Predictive Liquidation Profile">
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
              <div className="mt-1 inline-flex items-center rounded bg-blue-600/20 border border-blue-500/40 px-2.5 py-1 text-xs font-semibold text-blue-300">
                Aggregated (Binance + fallback sources)
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

            <div className="py-2">
              <Label className="text-sm text-slate-300 mb-1 block">Position</Label>
              <div className="flex gap-2 mt-1">
                {(['left', 'right'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => update('position', pos)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                      settings.position === pos
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">If Predictive Liquidation and Volume Profile are set to the same side, they combine (entwined).</p>
            </div>
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
                min={15}
                max={180}
                step={15}
                displayValue={`${settings.refreshInterval}s`}
                onChange={(v) => update('refreshInterval', v)}
              />
            )}

            <div className="pt-2 border-t border-slate-800 mt-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Scoring Weights</p>
              <SliderRow
                label="Liq Flow"
                value={settings.liqFlowWeight}
                min={0}
                max={1}
                step={0.01}
                displayValue={settings.liqFlowWeight.toFixed(2)}
                onChange={(v) => update('liqFlowWeight', v)}
              />
              <SliderRow
                label="Funding + L/S Bias"
                value={settings.biasWeight}
                min={0}
                max={1}
                step={0.01}
                displayValue={settings.biasWeight.toFixed(2)}
                onChange={(v) => update('biasWeight', v)}
              />
            </div>
          </div>

          {/* Predictor */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pivot Predictor</p>

            <SettingRow label="Enable Pivot + Volume Predictor">
              <Switch
                checked={settings.usePivotVolumePrediction}
                onCheckedChange={(v) => update('usePivotVolumePrediction', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            {settings.usePivotVolumePrediction && (
              <>
                <SettingRow label="Auto-Tune by Effective Range">
                  <Switch
                    checked={settings.autoTunePredictionByRange}
                    onCheckedChange={(v) => update('autoTunePredictionByRange', v)}
                    className="data-[state=checked]:bg-blue-600"
                  />
                </SettingRow>

                <SliderRow
                  label="Pivot Lookback"
                  value={settings.pivotLookback}
                  min={2}
                  max={12}
                  step={1}
                  displayValue={`${settings.pivotLookback} bars`}
                  onChange={(v) => update('pivotLookback', Math.round(v))}
                />

                <SliderRow
                  label="Min Confidence"
                  value={settings.predictionMinConfidence}
                  min={0}
                  max={100}
                  step={1}
                  displayValue={`${settings.predictionMinConfidence}%`}
                  onChange={(v) => update('predictionMinConfidence', Math.round(v))}
                />

                <SliderRow
                  label="Top Prediction Points"
                  value={settings.predictionTopNPoints}
                  min={3}
                  max={30}
                  step={1}
                  displayValue={String(settings.predictionTopNPoints)}
                  onChange={(v) => update('predictionTopNPoints', Math.round(v))}
                />

                <SliderRow
                  label="Price Grouping Threshold"
                  value={settings.predictionPriceThresholdPct}
                  min={0.1}
                  max={2}
                  step={0.1}
                  displayValue={`${settings.predictionPriceThresholdPct.toFixed(1)}%`}
                  onChange={(v) => update('predictionPriceThresholdPct', Number(v.toFixed(1)))}
                />
              </>
            )}
          </div>

          {/* Developer */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Developer</p>

            <SettingRow label="Show Debug Panel">
              <Switch
                checked={settings.showDebugPanel}
                onCheckedChange={(v) => update('showDebugPanel', v)}
                className="data-[state=checked]:bg-amber-500"
              />
            </SettingRow>
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

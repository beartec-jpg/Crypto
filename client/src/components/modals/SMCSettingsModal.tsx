import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { FVGSettings } from '@/types/fvg';
import type { OrderBlockSettings } from '@/types/orderBlock';

interface SMCSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fvgSettings: FVGSettings;
  onFVGSettingsChange: (settings: FVGSettings) => void;
  obSettings: OrderBlockSettings;
  onOBSettingsChange: (settings: OrderBlockSettings) => void;
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

export function SMCSettingsModal({
  isOpen,
  onClose,
  fvgSettings,
  onFVGSettingsChange,
  obSettings,
  onOBSettingsChange,
}: SMCSettingsModalProps) {
  function updateFVG<K extends keyof FVGSettings>(key: K, value: FVGSettings[K]) {
    onFVGSettingsChange({ ...fvgSettings, [key]: value });
  }

  function updateOB<K extends keyof OrderBlockSettings>(key: K, value: OrderBlockSettings[K]) {
    onOBSettingsChange({ ...obSettings, [key]: value });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">SMC Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="fvg" className="mt-2">
          <TabsList className="w-full bg-slate-800 border border-slate-700">
            <TabsTrigger value="fvg" className="flex-1 data-[state=active]:bg-slate-700">FVG</TabsTrigger>
            <TabsTrigger value="orderblock" className="flex-1 data-[state=active]:bg-slate-700">Order Blocks</TabsTrigger>
          </TabsList>

          {/* FVG Tab */}
          <TabsContent value="fvg" className="space-y-4 py-2">
            <SettingRow label="Enable FVG Detection">
              <Switch
                checked={fvgSettings.enabled}
                onCheckedChange={(v) => updateFVG('enabled', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Filters</p>

              <SliderRow
                label="Min Gap %"
                value={fvgSettings.minGapPercent}
                min={0.1}
                max={5}
                step={0.1}
                displayValue={`${fvgSettings.minGapPercent.toFixed(1)}%`}
                onChange={(v) => updateFVG('minGapPercent', v)}
              />

              <SliderRow
                label="Max Gap % (0 = off)"
                value={fvgSettings.maxGapPercent}
                min={0}
                max={20}
                step={0.5}
                displayValue={fvgSettings.maxGapPercent === 0 ? 'Off' : `${fvgSettings.maxGapPercent.toFixed(1)}%`}
                onChange={(v) => updateFVG('maxGapPercent', v)}
              />

              <SliderRow
                label="Min Volume Ratio"
                value={fvgSettings.minVolumeRatio}
                min={1}
                max={3}
                step={0.5}
                displayValue={`${fvgSettings.minVolumeRatio.toFixed(1)}x`}
                onChange={(v) => updateFVG('minVolumeRatio', v)}
              />

              <SliderRow
                label="Max Age (candles)"
                value={fvgSettings.maxAge}
                min={10}
                max={500}
                step={10}
                displayValue={`${fvgSettings.maxAge}`}
                onChange={(v) => updateFVG('maxAge', v)}
              />
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

              <SettingRow label="Show Bullish FVGs">
                <Switch
                  checked={fvgSettings.showBullish}
                  onCheckedChange={(v) => updateFVG('showBullish', v)}
                  className="data-[state=checked]:bg-green-600"
                />
              </SettingRow>

              <SettingRow label="Show Bearish FVGs">
                <Switch
                  checked={fvgSettings.showBearish}
                  onCheckedChange={(v) => updateFVG('showBearish', v)}
                  className="data-[state=checked]:bg-red-600"
                />
              </SettingRow>

              <SettingRow label="Show Mitigated FVGs">
                <Switch
                  checked={fvgSettings.showMitigated}
                  onCheckedChange={(v) => updateFVG('showMitigated', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SettingRow label="Show CE Line (50%)">
                <Switch
                  checked={fvgSettings.showCELine}
                  onCheckedChange={(v) => updateFVG('showCELine', v)}
                  className="data-[state=checked]:bg-yellow-600"
                />
              </SettingRow>

              <SettingRow label="Show Labels">
                <Switch
                  checked={fvgSettings.showLabels}
                  onCheckedChange={(v) => updateFVG('showLabels', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SettingRow label="Extend Right">
                <Switch
                  checked={fvgSettings.extendRight}
                  onCheckedChange={(v) => updateFVG('extendRight', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Advanced</p>

              <SettingRow label="Detect Inverse FVG (IFVG)">
                <Switch
                  checked={fvgSettings.detectIFVG}
                  onCheckedChange={(v) => updateFVG('detectIFVG', v)}
                  className="data-[state=checked]:bg-purple-600"
                />
              </SettingRow>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colors</p>

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'bullishColor', label: 'Bullish' },
                    { key: 'bearishColor', label: 'Bearish' },
                    { key: 'mitigatedColor', label: 'Mitigated' },
                    { key: 'ifvgColor', label: 'IFVG' },
                    { key: 'ceLineColor', label: 'CE Line' },
                  ] as { key: keyof FVGSettings; label: string }[]
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={fvgSettings[key] as string}
                      onChange={(e) => updateFVG(key, e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                      aria-label={`${label} color`}
                    />
                    <span className="text-xs text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Order Blocks Tab */}
          <TabsContent value="orderblock" className="space-y-4 py-2">
            <SettingRow label="Enable Order Block Detection">
              <Switch
                checked={obSettings.enabled}
                onCheckedChange={(v) => updateOB('enabled', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Detection</p>

              <SliderRow
                label="Min Displacement Candles"
                value={obSettings.minDisplacementCandles}
                min={1}
                max={5}
                step={1}
                displayValue={`${obSettings.minDisplacementCandles}`}
                onChange={(v) => updateOB('minDisplacementCandles', v)}
              />

              <SliderRow
                label="Min Displacement %"
                value={obSettings.minDisplacementPercent}
                min={0.5}
                max={5}
                step={0.5}
                displayValue={`${obSettings.minDisplacementPercent.toFixed(1)}%`}
                onChange={(v) => updateOB('minDisplacementPercent', v)}
              />

              <SliderRow
                label="Min Body %"
                value={obSettings.minBodyPercent}
                min={30}
                max={70}
                step={5}
                displayValue={`${obSettings.minBodyPercent}%`}
                onChange={(v) => updateOB('minBodyPercent', v)}
              />

              <SliderRow
                label="Max Age (candles)"
                value={obSettings.maxAge}
                min={50}
                max={500}
                step={25}
                displayValue={`${obSettings.maxAge}`}
                onChange={(v) => updateOB('maxAge', v)}
              />

              <SettingRow label="Require FVG">
                <Switch
                  checked={obSettings.requireFVG}
                  onCheckedChange={(v) => updateOB('requireFVG', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SettingRow label="Require BOS">
                <Switch
                  checked={obSettings.requireBOS}
                  onCheckedChange={(v) => updateOB('requireBOS', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

              <SettingRow label="Show Bullish OBs">
                <Switch
                  checked={obSettings.showBullish}
                  onCheckedChange={(v) => updateOB('showBullish', v)}
                  className="data-[state=checked]:bg-green-600"
                />
              </SettingRow>

              <SettingRow label="Show Bearish OBs">
                <Switch
                  checked={obSettings.showBearish}
                  onCheckedChange={(v) => updateOB('showBearish', v)}
                  className="data-[state=checked]:bg-red-600"
                />
              </SettingRow>

              <SettingRow label="Show Mitigated OBs">
                <Switch
                  checked={obSettings.showMitigated}
                  onCheckedChange={(v) => updateOB('showMitigated', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SettingRow label="Show Extreme OB Zone">
                <Switch
                  checked={obSettings.showExtremeOB}
                  onCheckedChange={(v) => updateOB('showExtremeOB', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SettingRow label="Show Labels">
                <Switch
                  checked={obSettings.showLabels}
                  onCheckedChange={(v) => updateOB('showLabels', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SettingRow label="Extend Right">
                <Switch
                  checked={obSettings.extendRight}
                  onCheckedChange={(v) => updateOB('extendRight', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confluence</p>

              <SettingRow label="Highlight FVG Confluence">
                <Switch
                  checked={obSettings.highlightFVGConfluence}
                  onCheckedChange={(v) => updateOB('highlightFVGConfluence', v)}
                  className="data-[state=checked]:bg-yellow-600"
                />
              </SettingRow>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Opacity</p>

              <SliderRow
                label="Zone Opacity"
                value={obSettings.zoneOpacity}
                min={0.05}
                max={0.5}
                step={0.05}
                displayValue={`${Math.round(obSettings.zoneOpacity * 100)}%`}
                onChange={(v) => updateOB('zoneOpacity', v)}
              />

              <SliderRow
                label="Extreme Zone Opacity"
                value={obSettings.extremeOpacity}
                min={0.1}
                max={0.7}
                step={0.05}
                displayValue={`${Math.round(obSettings.extremeOpacity * 100)}%`}
                onChange={(v) => updateOB('extremeOpacity', v)}
              />
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colors</p>

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'bullishColor', label: 'Bullish' },
                    { key: 'bearishColor', label: 'Bearish' },
                    { key: 'bullishExtremeColor', label: 'Bullish Extreme' },
                    { key: 'bearishExtremeColor', label: 'Bearish Extreme' },
                    { key: 'mitigatedColor', label: 'Mitigated' },
                    { key: 'confluenceColor', label: 'Confluence' },
                  ] as { key: keyof OrderBlockSettings; label: string }[]
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={obSettings[key] as string}
                      onChange={(e) => updateOB(key, e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                      aria-label={`${label} color`}
                    />
                    <span className="text-xs text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

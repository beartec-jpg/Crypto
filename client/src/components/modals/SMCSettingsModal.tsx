import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { FVGSettings } from '@/types/fvg';
import type { OrderBlockSettings } from '@/types/orderBlock';
import type { BOSSettings } from '@/types/structureBreak';
import type { LiquiditySettings, PDZoneSettings, PDRangeSource } from '@/types/liquidity';

interface SMCSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fvgSettings: FVGSettings;
  onFVGSettingsChange: (settings: FVGSettings) => void;
  obSettings: OrderBlockSettings;
  onOBSettingsChange: (settings: OrderBlockSettings) => void;
  bosSettings: BOSSettings;
  onBOSSettingsChange: (settings: BOSSettings) => void;
  liquiditySettings: LiquiditySettings;
  onLiquiditySettingsChange: (settings: LiquiditySettings) => void;
  pdZoneSettings: PDZoneSettings;
  onPDZoneSettingsChange: (settings: PDZoneSettings) => void;
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
  bosSettings,
  onBOSSettingsChange,
  liquiditySettings,
  onLiquiditySettingsChange,
  pdZoneSettings,
  onPDZoneSettingsChange,
}: SMCSettingsModalProps) {
  function updateFVG<K extends keyof FVGSettings>(key: K, value: FVGSettings[K]) {
    onFVGSettingsChange({ ...fvgSettings, [key]: value });
  }

  function updateOB<K extends keyof OrderBlockSettings>(key: K, value: OrderBlockSettings[K]) {
    onOBSettingsChange({ ...obSettings, [key]: value });
  }

  function updateBOS<K extends keyof BOSSettings>(key: K, value: BOSSettings[K]) {
    onBOSSettingsChange({ ...bosSettings, [key]: value });
  }

  function updateLiquidity<K extends keyof LiquiditySettings>(key: K, value: LiquiditySettings[K]) {
    onLiquiditySettingsChange({ ...liquiditySettings, [key]: value });
  }

  function updatePDZone<K extends keyof PDZoneSettings>(key: K, value: PDZoneSettings[K]) {
    onPDZoneSettingsChange({ ...pdZoneSettings, [key]: value });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">SMC Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="fvg" className="mt-2">
          <TabsList className="w-full bg-slate-800 border border-slate-700 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="fvg" className="flex-1 data-[state=active]:bg-slate-700 text-xs">FVG</TabsTrigger>
            <TabsTrigger value="orderblock" className="flex-1 data-[state=active]:bg-slate-700 text-xs">OB</TabsTrigger>
            <TabsTrigger value="bos" className="flex-1 data-[state=active]:bg-slate-700 text-xs">BOS/CHoCH</TabsTrigger>
            <TabsTrigger value="liquidity" className="flex-1 data-[state=active]:bg-slate-700 text-xs">Liquidity</TabsTrigger>
            <TabsTrigger value="pdzone" className="flex-1 data-[state=active]:bg-slate-700 text-xs">P/D Zones</TabsTrigger>
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

          {/* BOS/CHoCH Tab */}
          <TabsContent value="bos" className="space-y-4 py-2">
            <SettingRow label="Enable BOS/CHoCH Detection">
              <Switch
                checked={bosSettings.enabled}
                onCheckedChange={(v) => updateBOS('enabled', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Swing Detection</p>

              <SliderRow
                label="Swing Lookback"
                value={bosSettings.swingLookback}
                min={3}
                max={20}
                step={1}
                displayValue={`${bosSettings.swingLookback}`}
                onChange={(v) => updateBOS('swingLookback', v)}
              />

              <SettingRow label="Require Close Through Level">
                <Switch
                  checked={bosSettings.requireClose}
                  onCheckedChange={(v) => updateBOS('requireClose', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

              <SettingRow label="Show BOS (Continuation)">
                <Switch
                  checked={bosSettings.showBOS}
                  onCheckedChange={(v) => updateBOS('showBOS', v)}
                  className="data-[state=checked]:bg-green-600"
                />
              </SettingRow>

              <SettingRow label="Show CHoCH (Reversal)">
                <Switch
                  checked={bosSettings.showCHoCH}
                  onCheckedChange={(v) => updateBOS('showCHoCH', v)}
                  className="data-[state=checked]:bg-cyan-600"
                />
              </SettingRow>

              <SettingRow label="Show Swing Points (HH/HL/LH/LL)">
                <Switch
                  checked={bosSettings.showSwingPoints}
                  onCheckedChange={(v) => updateBOS('showSwingPoints', v)}
                  className="data-[state=checked]:bg-purple-600"
                />
              </SettingRow>

              <SettingRow label="Show Labels">
                <Switch
                  checked={bosSettings.showLabels}
                  onCheckedChange={(v) => updateBOS('showLabels', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SettingRow label="Draw Lines">
                <Switch
                  checked={bosSettings.drawLines}
                  onCheckedChange={(v) => updateBOS('drawLines', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SettingRow label="Extend Lines">
                <Switch
                  checked={bosSettings.extendLines}
                  onCheckedChange={(v) => updateBOS('extendLines', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Filters</p>

              <SliderRow
                label="Max Age (candles)"
                value={bosSettings.maxAge}
                min={50}
                max={500}
                step={25}
                displayValue={`${bosSettings.maxAge}`}
                onChange={(v) => updateBOS('maxAge', v)}
              />

              <SettingRow label="Hide Swept (Wick Only)">
                <Switch
                  checked={bosSettings.hideSwept}
                  onCheckedChange={(v) => updateBOS('hideSwept', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colors</p>

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'bullishBOSColor', label: 'Bullish BOS' },
                    { key: 'bearishBOSColor', label: 'Bearish BOS' },
                    { key: 'bullishCHoCHColor', label: 'Bullish CHoCH' },
                    { key: 'bearishCHoCHColor', label: 'Bearish CHoCH' },
                    { key: 'swingHighColor', label: 'Swing High' },
                    { key: 'swingLowColor', label: 'Swing Low' },
                  ] as { key: keyof BOSSettings; label: string }[]
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bosSettings[key] as string}
                      onChange={(e) => updateBOS(key, e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                      aria-label={`${label} color`}
                    />
                    <span className="text-xs text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Liquidity Tab */}
          <TabsContent value="liquidity" className="space-y-4 py-2">
            <SettingRow label="Enable Liquidity Zones">
              <Switch
                checked={liquiditySettings.enabled}
                onCheckedChange={(v) => updateLiquidity('enabled', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Detection</p>

              <SliderRow
                label="Equal Threshold %"
                value={liquiditySettings.equalThreshold}
                min={0.05}
                max={1}
                step={0.05}
                displayValue={`${liquiditySettings.equalThreshold.toFixed(2)}%`}
                onChange={(v) => updateLiquidity('equalThreshold', v)}
              />

              <SliderRow
                label="Min Touches"
                value={liquiditySettings.minTouches}
                min={2}
                max={6}
                step={1}
                displayValue={`${liquiditySettings.minTouches}`}
                onChange={(v) => updateLiquidity('minTouches', v)}
              />
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

              <SettingRow label="Show Equal Highs (SSL)">
                <Switch
                  checked={liquiditySettings.showHighs}
                  onCheckedChange={(v) => updateLiquidity('showHighs', v)}
                  className="data-[state=checked]:bg-red-600"
                />
              </SettingRow>

              <SettingRow label="Show Equal Lows (BSL)">
                <Switch
                  checked={liquiditySettings.showLows}
                  onCheckedChange={(v) => updateLiquidity('showLows', v)}
                  className="data-[state=checked]:bg-green-600"
                />
              </SettingRow>

              <SettingRow label="Keep Swept Zones (History)">
                <Switch
                  checked={liquiditySettings.showSwept}
                  onCheckedChange={(v) => updateLiquidity('showSwept', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SettingRow label="Extend Lines Right">
                <Switch
                  checked={liquiditySettings.extendLines}
                  onCheckedChange={(v) => updateLiquidity('extendLines', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colors</p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'lineColor', label: 'Active Zone' },
                    { key: 'sweptColor', label: 'Swept Zone' },
                    { key: 'sweepMarkerColor', label: '⚡ Sweep Marker' },
                  ] as { key: keyof LiquiditySettings; label: string }[]
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={liquiditySettings[key] as string}
                      onChange={(e) => updateLiquidity(key, e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                      aria-label={`${label} color`}
                    />
                    <span className="text-xs text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* P/D Zones Tab */}
          <TabsContent value="pdzone" className="space-y-4 py-2">
            <SettingRow label="Enable P/D Zones">
              <Switch
                checked={pdZoneSettings.enabled}
                onCheckedChange={(v) => updatePDZone('enabled', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Range Source</p>
              <div className="flex gap-2 flex-wrap">
                {(
                  [
                    { value: 'swing', label: 'Auto Swing' },
                    { value: 'day', label: 'Prev Day' },
                    { value: 'week', label: 'Prev Week' },
                  ] as { value: PDRangeSource; label: string }[]
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => updatePDZone('rangeSource', value)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      pdZoneSettings.rangeSource === value
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {pdZoneSettings.rangeSource === 'swing' && 'Uses last 100 candles swing high/low'}
                {pdZoneSettings.rangeSource === 'day' && 'Uses previous calendar day (UTC) high/low — great for HTF on LTF'}
                {pdZoneSettings.rangeSource === 'week' && 'Uses previous calendar week (UTC, Mon–Sun) high/low'}
              </p>
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

              <SettingRow label="Show Premium Zone (Upper 50%)">
                <Switch
                  checked={pdZoneSettings.showPremium}
                  onCheckedChange={(v) => updatePDZone('showPremium', v)}
                  className="data-[state=checked]:bg-red-600"
                />
              </SettingRow>

              <SettingRow label="Show Discount Zone (Lower 50%)">
                <Switch
                  checked={pdZoneSettings.showDiscount}
                  onCheckedChange={(v) => updatePDZone('showDiscount', v)}
                  className="data-[state=checked]:bg-green-600"
                />
              </SettingRow>

              <SettingRow label="Show Equilibrium Line (50%)">
                <Switch
                  checked={pdZoneSettings.showEquilibrium}
                  onCheckedChange={(v) => updatePDZone('showEquilibrium', v)}
                  className="data-[state=checked]:bg-yellow-600"
                />
              </SettingRow>

              <SettingRow label="Show Labels">
                <Switch
                  checked={pdZoneSettings.showLabels}
                  onCheckedChange={(v) => updatePDZone('showLabels', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </SettingRow>

              <SliderRow
                label="Zone Opacity"
                value={pdZoneSettings.opacity}
                min={0.05}
                max={0.4}
                step={0.05}
                displayValue={`${Math.round(pdZoneSettings.opacity * 100)}%`}
                onChange={(v) => updatePDZone('opacity', v)}
              />
            </div>

            <div className="border-t border-slate-700 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colors</p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'premiumColor', label: 'Premium (Sell)' },
                    { key: 'discountColor', label: 'Discount (Buy)' },
                    { key: 'equilibriumColor', label: 'Equilibrium' },
                  ] as { key: keyof PDZoneSettings; label: string }[]
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={pdZoneSettings[key] as string}
                      onChange={(e) => updatePDZone(key, e.target.value)}
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

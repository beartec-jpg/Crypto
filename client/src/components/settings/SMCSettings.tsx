import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save } from 'lucide-react';

interface SMCSettingsProps {
  isPaidTier: boolean;
  indicators: any;
  handleSMCToolToggle: (name: string, isActive: boolean, setter: (value: boolean) => void) => void;
  cvdSpikeEnabled: boolean;
  setCvdSpikeEnabled: (value: boolean) => void;
  cvdSpikeLevel1Input: string;
  setCvdSpikeLevel1Input: (value: string) => void;
  cvdSpikeLevel1: number;
  setCvdSpikeLevel1: (value: number) => void;
  cvdSpikeLevel2Input: string;
  setCvdSpikeLevel2Input: (value: string) => void;
  cvdSpikeLevel2: number;
  setCvdSpikeLevel2: (value: number) => void;
  cvdSpikeLevel3Input: string;
  setCvdSpikeLevel3Input: (value: string) => void;
  cvdSpikeLevel3: number;
  setCvdSpikeLevel3: (value: number) => void;
  fvgVolumeThreshold: number;
  setFvgVolumeThreshold: (value: number) => void;
  chartBosSwingLengthInput: string;
  setChartBosSwingLengthInput: (value: string) => void;
  chartBosSwingLength: number;
  setChartBosSwingLength: (value: number) => void;
  chartChochSwingLengthInput: string;
  setChartChochSwingLengthInput: (value: string) => void;
  chartChochSwingLength: number;
  setChartChochSwingLength: (value: number) => void;
  stratLiquidityGrab: boolean;
  setStratLiquidityGrab: (value: boolean) => void;
  chartLiquiditySweepSwingLengthInput: string;
  setChartLiquiditySweepSwingLengthInput: (value: string) => void;
  chartLiquiditySweepSwingLength: number;
  setChartLiquiditySweepSwingLength: (value: number) => void;
  interval: string;
  saveToTimeframe: () => void;
  makeTimeframeDefault: () => void;
}

export function SMCSettings({
  isPaidTier,
  indicators,
  handleSMCToolToggle,
  cvdSpikeEnabled,
  setCvdSpikeEnabled,
  cvdSpikeLevel1Input,
  setCvdSpikeLevel1Input,
  cvdSpikeLevel1,
  setCvdSpikeLevel1,
  cvdSpikeLevel2Input,
  setCvdSpikeLevel2Input,
  cvdSpikeLevel2,
  setCvdSpikeLevel2,
  cvdSpikeLevel3Input,
  setCvdSpikeLevel3Input,
  cvdSpikeLevel3,
  setCvdSpikeLevel3,
  fvgVolumeThreshold,
  setFvgVolumeThreshold,
  chartBosSwingLengthInput,
  setChartBosSwingLengthInput,
  chartBosSwingLength,
  setChartBosSwingLength,
  chartChochSwingLengthInput,
  setChartChochSwingLengthInput,
  chartChochSwingLength,
  setChartChochSwingLength,
  stratLiquidityGrab,
  setStratLiquidityGrab,
  chartLiquiditySweepSwingLengthInput,
  setChartLiquiditySweepSwingLengthInput,
  chartLiquiditySweepSwingLength,
  setChartLiquiditySweepSwingLength,
  interval,
  saveToTimeframe,
  makeTimeframeDefault,
}: SMCSettingsProps) {
  return (
    <div className="space-y-3">
      {/* Tier restriction notice */}
      {!isPaidTier && (
        <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg px-3 py-2 text-xs text-amber-200">
          SMC tools require a paid subscription. <a href="/plans" className="underline text-amber-400">Upgrade for all SMC tools</a>
        </div>
      )}
      {/* Main toggles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.smc.showFVG} onCheckedChange={() => handleSMCToolToggle('FVG', indicators.smc.showFVG, indicators.smc.setShowFVG)} id="show-fvg" data-testid="switch-fvg" disabled={!isPaidTier && !indicators.smc.showFVG} />
          <Label htmlFor="show-fvg" className="text-sm text-white cursor-pointer">FVG {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.smc.showBOS} onCheckedChange={() => handleSMCToolToggle('BOS', indicators.smc.showBOS, indicators.smc.setShowBOS)} id="show-bos" data-testid="switch-bos" disabled={!isPaidTier && !indicators.smc.showBOS} />
          <Label htmlFor="show-bos" className="text-sm text-white cursor-pointer">BOS {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.smc.showCHoCH} onCheckedChange={() => handleSMCToolToggle('CHoCH', indicators.smc.showCHoCH, indicators.smc.setShowCHoCH)} id="show-choch" data-testid="switch-choch" disabled={!isPaidTier && !indicators.smc.showCHoCH} />
          <Label htmlFor="show-choch" className="text-sm text-white cursor-pointer">CHoCH {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.smc.showSwingPivots} onCheckedChange={() => handleSMCToolToggle('Swing Pivots', indicators.smc.showSwingPivots, indicators.smc.setShowSwingPivots)} id="show-pivots" data-testid="switch-pivots" disabled={!isPaidTier && !indicators.smc.showSwingPivots} />
          <Label htmlFor="show-pivots" className="text-sm text-white cursor-pointer">Swing Pivots {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={stratLiquidityGrab} onCheckedChange={() => handleSMCToolToggle('Liquidity Sweeps', stratLiquidityGrab, setStratLiquidityGrab)} id="show-liquidity" data-testid="switch-liquidity" disabled={!isPaidTier && !stratLiquidityGrab} />
          <Label htmlFor="show-liquidity" className="text-sm text-white cursor-pointer">Liquidity Sweeps {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.smc.showOrderBlocks} onCheckedChange={() => handleSMCToolToggle('Order Blocks', indicators.smc.showOrderBlocks, indicators.smc.setShowOrderBlocks)} id="show-order-blocks" data-testid="switch-order-blocks" disabled={!isPaidTier && !indicators.smc.showOrderBlocks} />
          <Label htmlFor="show-order-blocks" className="text-sm text-white cursor-pointer">Order Blocks {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.smc.showChartLabels} onCheckedChange={() => handleSMCToolToggle('Chart Labels', indicators.smc.showChartLabels, indicators.smc.setShowChartLabels)} id="show-labels" data-testid="switch-labels" disabled={!isPaidTier && !indicators.smc.showChartLabels} />
          <Label htmlFor="show-labels" className="text-sm text-white cursor-pointer">Chart Labels {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={cvdSpikeEnabled} onCheckedChange={() => handleSMCToolToggle('CVD Spikes', cvdSpikeEnabled, setCvdSpikeEnabled)} id="cvd-spike" data-testid="switch-cvd-spike" disabled={!isPaidTier && !cvdSpikeEnabled} />
          <Label htmlFor="cvd-spike" className="text-sm text-white cursor-pointer">CVD Spikes {!isPaidTier && '🔒'}</Label>
        </div>
      </div>
      
      {/* CVD Spike Level Settings */}
      {cvdSpikeEnabled && (
        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-blue-400 mb-2">CVD Spike Levels (% of avg delta)</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1">
              <Label className="text-xs text-gray-300">Lvl 1 ▲</Label>
              <input
                type="number"
                min="100"
                max="500"
                value={cvdSpikeLevel1Input}
                onChange={(e) => {
                  setCvdSpikeLevel1Input(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 100) setCvdSpikeLevel1(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 text-center"
                data-testid="input-cvd-spike-level1"
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <Label className="text-xs text-gray-300">Lvl 2 ▲²</Label>
              <input
                type="number"
                min="100"
                max="1000"
                value={cvdSpikeLevel2Input}
                onChange={(e) => {
                  setCvdSpikeLevel2Input(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 100) setCvdSpikeLevel2(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 text-center"
                data-testid="input-cvd-spike-level2"
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <Label className="text-xs text-gray-300">Lvl 3 ▲³</Label>
              <input
                type="number"
                min="100"
                max="2000"
                value={cvdSpikeLevel3Input}
                onChange={(e) => {
                  setCvdSpikeLevel3Input(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 100) setCvdSpikeLevel3(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 text-center"
                data-testid="input-cvd-spike-level3"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* FVG Settings */}
      {indicators.smc.showFVG && (
        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-blue-400 mb-2">FVG Settings</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">High Value Only</Label>
              <Switch checked={indicators.smc.showHighValueOnly} onCheckedChange={indicators.smc.setShowHighValueOnly} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Volume Threshold</Label>
              <input
                type="number"
                min="1"
                max="3"
                step="0.1"
                value={fvgVolumeThreshold}
                onChange={(e) => setFvgVolumeThreshold(parseFloat(e.target.value))}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* BOS Settings */}
      {indicators.smc.showBOS && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">BOS Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Swing Length</Label>
            <input
              type="number"
              min="5"
              max="30"
              value={chartBosSwingLengthInput}
              onChange={(e) => {
                setChartBosSwingLengthInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) setChartBosSwingLength(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-bos-swing-length"
            />
          </div>
        </div>
      )}
      
      {/* CHoCH Settings */}
      {indicators.smc.showCHoCH && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">CHoCH Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Swing Length</Label>
            <input
              type="number"
              min="5"
              max="30"
              value={chartChochSwingLengthInput}
              onChange={(e) => {
                setChartChochSwingLengthInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) setChartChochSwingLength(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
            />
          </div>
        </div>
      )}
      
      {/* Swing Pivots Settings */}
      {indicators.smc.showSwingPivots && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Swing Pivot Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Swing Length</Label>
            <input
              type="number"
              min="1"
              max="50"
              value={indicators.smc.swingPivotLengthInput}
              onChange={(e) => {
                indicators.smc.setSwingPivotLengthInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1) indicators.smc.setSwingPivotLength(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
            />
          </div>
        </div>
      )}
      
      {/* Liquidity Sweeps Settings */}
      {stratLiquidityGrab && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Liquidity Sweep Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Swing Length</Label>
            <input
              type="number"
              min="5"
              max="50"
              value={chartLiquiditySweepSwingLengthInput}
              onChange={(e) => {
                setChartLiquiditySweepSwingLengthInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) setChartLiquiditySweepSwingLength(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
            />
          </div>
        </div>
      )}
      
      {/* Order Blocks Settings */}
      {indicators.smc.showOrderBlocks && (
        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-blue-400 mb-2">Order Blocks Settings</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-gray-300">Swing Length</Label>
              <input
                type="number"
                min="5"
                max="50"
                value={indicators.smc.obSwingLengthInput}
                onChange={(e) => {
                  indicators.smc.setObSwingLengthInput(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 5) indicators.smc.setObSwingLength(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-ob-swing-length"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-gray-300">Lookback</Label>
              <input
                type="number"
                min="20"
                max="200"
                step="10"
                value={indicators.smc.orderBlockLengthInput}
                onChange={(e) => {
                  indicators.smc.setOrderBlockLengthInput(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 20) indicators.smc.setOrderBlockLength(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-ob-lookback"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">Swing length for block detection | Lookback limits how far to search</p>
        </div>
      )}
      
      
      <div className="text-xs text-gray-400 bg-slate-800/50 rounded-lg p-2">
        <p><strong>Order Blocks:</strong> Institutional support/resistance zones</p>
      </div>
      
      {/* Save Buttons */}
      <div className="pt-2 border-t border-slate-700 flex gap-2">
        <Button
          onClick={saveToTimeframe}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
          data-testid="button-save-smc-to-timeframe"
        >
          <Save className="w-3 h-3 mr-1" />
          Save to {interval}
        </Button>
        <Button
          onClick={makeTimeframeDefault}
          variant="outline"
          className="bg-slate-700 hover:bg-slate-600 text-white text-xs h-8 px-2"
          data-testid="button-make-smc-default"
        >
          ⭐
        </Button>
      </div>
    </div>
  );
}

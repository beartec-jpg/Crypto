import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save } from 'lucide-react';

interface OscillatorSettingsProps {
  isPaidTier: boolean;
  indicators: any;
  handleOscillatorToggle: (name: string, isActive: boolean, setter: (value: boolean) => void) => void;
  setLocation: (path: string) => void;
  interval: string;
  saveToTimeframe: () => void;
  makeTimeframeDefault: () => void;
}

export function OscillatorSettings({
  isPaidTier,
  indicators,
  handleOscillatorToggle,
  setLocation,
  interval,
  saveToTimeframe,
  makeTimeframeDefault,
}: OscillatorSettingsProps) {
  return (
    <div className="space-y-3">
      {/* Free tier notice */}
      {!isPaidTier && (
        <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-2 text-xs text-amber-200">
          Free tier: RSI & MACD only, 1 active at a time. <span className="text-amber-400 cursor-pointer hover:underline" onClick={() => setLocation('/crypto/subscribe')}>Upgrade for all oscillators</span>
        </div>
      )}
      
      {/* Sync Scale Toggle */}
      <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2">
        <div className="flex items-center gap-2">
          <Switch 
            checked={indicators.syncOscillatorScale} 
            onCheckedChange={indicators.setSyncOscillatorScale}
            id="sync-oscillator-scale" 
            data-testid="switch-sync-oscillator-scale" 
          />
          <Label htmlFor="sync-oscillator-scale" className="text-xs text-white cursor-pointer">
            Sync Time Scale with Main Chart
          </Label>
        </div>
        <span className="text-xs text-gray-500">Match visible range</span>
      </div>
      
      {/* Main toggles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="flex items-center gap-2">
          <Switch checked={indicators.rsi.show} onCheckedChange={() => handleOscillatorToggle('RSI', indicators.rsi.show, indicators.rsi.setShow)} id="show-rsi" data-testid="switch-rsi" />
          <Label htmlFor="show-rsi" className="text-sm text-white cursor-pointer">RSI</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.stochRSI.show} onCheckedChange={() => handleOscillatorToggle('Stochastic RSI', indicators.stochRSI.show, indicators.stochRSI.setShow)} id="show-stoch-rsi" data-testid="switch-stoch-rsi" disabled={!isPaidTier && !indicators.stochRSI.show} />
          <Label htmlFor="show-stoch-rsi" className="text-sm text-white cursor-pointer">Stochastic RSI {!isPaidTier && '🔒'}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={indicators.macd.show} onCheckedChange={() => handleOscillatorToggle('MACD', indicators.macd.show, indicators.macd.setShow)} id="show-macd" data-testid="switch-macd" />
          <Label htmlFor="show-macd" className="text-sm text-white cursor-pointer">MACD</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.obv.show} onCheckedChange={() => handleOscillatorToggle('OBV', indicators.obv.show, indicators.obv.setShow)} id="show-obv" data-testid="switch-obv" disabled={!isPaidTier && !indicators.obv.show} />
          <Label htmlFor="show-obv" className="text-sm text-white cursor-pointer">OBV {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.mfi.show} onCheckedChange={() => handleOscillatorToggle('MFI', indicators.mfi.show, indicators.mfi.setShow)} id="show-mfi" data-testid="switch-mfi" disabled={!isPaidTier && !indicators.mfi.show} />
          <Label htmlFor="show-mfi" className="text-sm text-white cursor-pointer">MFI {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.williamsR.show} onCheckedChange={() => handleOscillatorToggle('Williams %R', indicators.williamsR.show, indicators.williamsR.setShow)} id="show-williams-r" data-testid="switch-williams-r" disabled={!isPaidTier && !indicators.williamsR.show} />
          <Label htmlFor="show-williams-r" className="text-sm text-white cursor-pointer">Williams %R {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.cci.show} onCheckedChange={() => handleOscillatorToggle('CCI', indicators.cci.show, indicators.cci.setShow)} id="show-cci" data-testid="switch-cci" disabled={!isPaidTier && !indicators.cci.show} />
          <Label htmlFor="show-cci" className="text-sm text-white cursor-pointer">CCI {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.adx.show} onCheckedChange={() => handleOscillatorToggle('ADX', indicators.adx.show, indicators.adx.setShow)} id="show-adx" data-testid="switch-adx" disabled={!isPaidTier && !indicators.adx.show} />
          <Label htmlFor="show-adx" className="text-sm text-white cursor-pointer">ADX {!isPaidTier && '🔒'}</Label>
        </div>
      </div>
      
      {/* RSI Settings */}
      {indicators.rsi.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">RSI Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Period</Label>
            <input
              type="number"
              min="5"
              max="50"
              value={indicators.rsi.periodInput}
              onChange={(e) => {
                indicators.rsi.setPeriodInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) indicators.rsi.setPeriod(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-rsi-period"
            />
          </div>
        </div>
      )}
      
      {/* MACD Settings */}
      {indicators.macd.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">MACD Settings</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Fast Period</Label>
              <input
                type="number"
                min="5"
                max="50"
                value={indicators.macd.fastInput}
                onChange={(e) => {
                  indicators.macd.setFastInput(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 5) indicators.macd.setFast(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-macd-fast"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Slow Period</Label>
              <input
                type="number"
                min="10"
                max="100"
                value={indicators.macd.slowInput}
                onChange={(e) => {
                  indicators.macd.setSlowInput(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 10) indicators.macd.setSlow(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-macd-slow"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Signal Period</Label>
              <input
                type="number"
                min="5"
                max="50"
                value={indicators.macd.signalInput}
                onChange={(e) => {
                  indicators.macd.setSignalInput(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 5) indicators.macd.setSignal(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-macd-signal"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* MFI Settings */}
      {indicators.mfi.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">MFI Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Period</Label>
            <input
              type="number"
              min="5"
              max="50"
              value={indicators.mfi.periodInput}
              onChange={(e) => {
                indicators.mfi.setPeriodInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) indicators.mfi.setPeriod(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-mfi-period"
            />
          </div>
        </div>
      )}
      
      {/* Stochastic RSI Settings */}
      {indicators.stochRSI.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Stochastic RSI Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Period</Label>
            <input
              type="number"
              min="5"
              max="50"
              value={indicators.stochRSI.periodInput}
              onChange={(e) => {
                indicators.stochRSI.setPeriodInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) indicators.stochRSI.setPeriod(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-stoch-rsi-period"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">More sensitive version of RSI</p>
        </div>
      )}
      
      {/* Williams %R Settings */}
      {indicators.williamsR.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Williams %R Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Period</Label>
            <input
              type="number"
              min="5"
              max="50"
              value={indicators.williamsR.periodInput}
              onChange={(e) => {
                indicators.williamsR.setPeriodInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) indicators.williamsR.setPeriod(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-williams-r-period"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Momentum oscillator (-100 to 0)</p>
        </div>
      )}
      
      {/* CCI Settings */}
      {indicators.cci.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">CCI Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Period</Label>
            <input
              type="number"
              min="5"
              max="50"
              value={indicators.cci.periodInput}
              onChange={(e) => {
                indicators.cci.setPeriodInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) indicators.cci.setPeriod(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-cci-period"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Overbought/oversold with ±100 levels</p>
        </div>
      )}
      
      {/* ADX Settings */}
      {indicators.adx.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">ADX Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Period</Label>
            <input
              type="number"
              min="5"
              max="50"
              value={indicators.adx.periodInput}
              onChange={(e) => {
                indicators.adx.setPeriodInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) indicators.adx.setPeriod(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-adx-period"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Trend strength indicator (not direction)</p>
        </div>
      )}
      
      {/* Save Buttons */}
      <div className="pt-2 border-t border-slate-700 flex gap-2">
        <Button
          onClick={saveToTimeframe}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
          data-testid="button-save-oscillator-to-timeframe"
        >
          <Save className="w-3 h-3 mr-1" />
          Save to {interval}
        </Button>
        <Button
          onClick={makeTimeframeDefault}
          variant="outline"
          className="bg-slate-700 hover:bg-slate-600 text-white text-xs h-8 px-2"
          data-testid="button-make-oscillator-default"
        >
          ⭐
        </Button>
      </div>
    </div>
  );
}

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save } from 'lucide-react';
import { useShowOwnerOnlyTools } from '@/hooks/useShowOwnerOnlyTools';

const MA_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
const MA_TIMEFRAMES = [
  { value: 'current', label: 'Current' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

interface TrendSettingsProps {
  isPaidTier: boolean;
  indicators: any;
  handleTrendToolToggle: (name: string, isActive: boolean, setter: (value: boolean) => void) => void;
  interval: string;
  saveToTimeframe: () => void;
  makeTimeframeDefault: () => void;
}

export function TrendSettings({
  isPaidTier,
  indicators,
  handleTrendToolToggle,
  interval,
  saveToTimeframe,
  makeTimeframeDefault,
}: TrendSettingsProps) {
  const showOwnerOnlyTools = useShowOwnerOnlyTools();
  return (
    <div className="space-y-3">
      {/* Tier restriction notice */}
      {!isPaidTier && (
        <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg px-3 py-2 text-xs text-blue-200">
          Free tier: EMA & SMA only. <a href="/plans" className="underline text-blue-400">Upgrade for all trend tools</a>
        </div>
      )}
      {/* Main toggles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="flex items-center gap-2">
          <Switch checked={indicators.ema.show} onCheckedChange={() => handleTrendToolToggle('EMA', indicators.ema.show, indicators.ema.setShow)} id="show-ema" data-testid="switch-ema" />
          <Label htmlFor="show-ema" className="text-sm text-white cursor-pointer">EMA</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={indicators.sma.show} onCheckedChange={() => handleTrendToolToggle('SMA', indicators.sma.show, indicators.sma.setShow)} id="show-sma" data-testid="switch-sma" />
          <Label htmlFor="show-sma" className="text-sm text-white cursor-pointer">SMA</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.bb.show} onCheckedChange={() => handleTrendToolToggle('Bollinger Bands', indicators.bb.show, indicators.bb.setShow)} id="show-bb" data-testid="switch-bollinger-bands" disabled={!isPaidTier && !indicators.bb.show} />
          <Label htmlFor="show-bb" className="text-sm text-white cursor-pointer">Bollinger Bands {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.supertrend.show} onCheckedChange={() => handleTrendToolToggle('Supertrend', indicators.supertrend.show, indicators.supertrend.setShow)} id="show-supertrend" data-testid="switch-supertrend" disabled={!isPaidTier && !indicators.supertrend.show} />
          <Label htmlFor="show-supertrend" className="text-sm text-white cursor-pointer">Supertrend {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.parabolicSAR.show} onCheckedChange={() => handleTrendToolToggle('Parabolic SAR', indicators.parabolicSAR.show, indicators.parabolicSAR.setShow)} id="show-sar" data-testid="switch-sar" disabled={!isPaidTier && !indicators.parabolicSAR.show} />
          <Label htmlFor="show-sar" className="text-sm text-white cursor-pointer">Parabolic SAR {!isPaidTier && '🔒'}</Label>
        </div>
        {showOwnerOnlyTools && (
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={indicators.smc.showAutoTrendlines} onCheckedChange={() => handleTrendToolToggle('Auto Trendlines', indicators.smc.showAutoTrendlines, indicators.smc.setShowAutoTrendlines)} id="show-trendlines" data-testid="switch-trendlines" disabled={!isPaidTier && !indicators.smc.showAutoTrendlines} />
          <Label htmlFor="show-trendlines" className="text-sm text-white cursor-pointer">Auto Trendlines {!isPaidTier && '🔒'}</Label>
        </div>
        )}
      </div>
      
      {/* EMA Settings - Dynamic List */}
      {indicators.ema.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs font-semibold text-blue-400">EMA Lines</div>
            {indicators.ema.configs.length < 6 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs text-green-400 hover:text-green-300"
                onClick={() => {
                  const newId = `ema${Date.now()}`;
                  const colorIdx = indicators.ema.configs.length % MA_COLORS.length;
                  indicators.ema.setConfigs([...indicators.ema.configs, { id: newId, period: 50, timeframe: 'current', color: MA_COLORS[colorIdx] }]);
                  indicators.ema.setInputs((prev: any) => ({ ...prev, [newId]: '50' }));
                }}
              >
                + Add EMA
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {indicators.ema.configs.map((config: any, idx: number) => (
              <div key={config.id} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={indicators.ema.inputs[config.id] ?? String(config.period)}
                  onChange={(e) => {
                    const inputVal = e.target.value;
                    indicators.ema.setInputs((prev: any) => ({ ...prev, [config.id]: inputVal }));
                    const val = parseInt(inputVal);
                    if (!isNaN(val) && val >= 5 && val <= 500) {
                      indicators.ema.setConfigs(indicators.ema.configs.map((c: any) => c.id === config.id ? { ...c, period: val } : c));
                    }
                  }}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value);
                    if (isNaN(val) || val < 5) {
                      indicators.ema.setInputs((prev: any) => ({ ...prev, [config.id]: String(config.period) }));
                    }
                  }}
                  className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                />
                <select
                  value={config.timeframe}
                  onChange={(e) => indicators.ema.setConfigs(indicators.ema.configs.map((c: any) => c.id === config.id ? { ...c, timeframe: e.target.value } : c))}
                  className="bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                >
                  {MA_TIMEFRAMES.map(tf => (
                    <option key={tf.value} value={tf.value}>{tf.label}</option>
                  ))}
                </select>
                {indicators.ema.configs.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                    onClick={() => indicators.ema.setConfigs(indicators.ema.configs.filter((c: any) => c.id !== config.id))}
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Bollinger Bands Settings */}
      {indicators.bb.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Bollinger Bands Settings</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Period</Label>
              <input
                type="number"
                min="5"
                max="100"
                value={indicators.bb.periodInput}
                onChange={(e) => {
                  indicators.bb.setPeriodInput(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 5) indicators.bb.setPeriod(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-bb-period"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Std Dev</Label>
              <input
                type="number"
                min="0.5"
                max="4"
                step="0.1"
                value={indicators.bb.stdDevInput}
                onChange={(e) => {
                  indicators.bb.setStdDevInput(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0.5) indicators.bb.setStdDev(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-bb-stddev"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Auto Trendlines Settings */}
      {showOwnerOnlyTools && indicators.smc.showAutoTrendlines && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Auto Trendline Settings</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Min Touches</Label>
              <input
                type="number"
                min="3"
                max="5"
                value={indicators.smc.trendlineMinTouchesInput}
                onChange={(e) => {
                  indicators.smc.setTrendlineMinTouchesInput(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 3) indicators.smc.setTrendlineMinTouches(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Tolerance %</Label>
              <input
                type="number"
                min="0.1"
                max="1.0"
                step="0.1"
                value={indicators.smc.trendlineToleranceInput}
                onChange={(e) => {
                  indicators.smc.setTrendlineToleranceInput(e.target.value);
                  const val = parseFloat(e.target.value) / 100;
                  if (!isNaN(val) && val >= 0.001) indicators.smc.setTrendlineTolerance(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Pivot Length</Label>
              <input
                type="number"
                min="5"
                max="20"
                value={indicators.smc.trendlinePivotLengthInput}
                onChange={(e) => {
                  indicators.smc.setTrendlinePivotLengthInput(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 5) indicators.smc.setTrendlinePivotLength(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* SMA Settings - Dynamic List */}
      {indicators.sma.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs font-semibold text-amber-400">SMA Lines</div>
            {indicators.sma.configs.length < 6 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs text-green-400 hover:text-green-300"
                onClick={() => {
                  const newId = `sma${Date.now()}`;
                  const colorIdx = indicators.sma.configs.length % MA_COLORS.length;
                  indicators.sma.setConfigs([...indicators.sma.configs, { id: newId, period: 50, timeframe: 'current', color: MA_COLORS[colorIdx] }]);
                }}
              >
                + Add SMA
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {indicators.sma.configs.map((config: any, idx: number) => (
              <div key={config.id} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
                <input
                  type="number"
                  min="5"
                  max="500"
                  value={config.period}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 5) {
                      indicators.sma.setConfigs(indicators.sma.configs.map((c: any) => c.id === config.id ? { ...c, period: val } : c));
                    }
                  }}
                  className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                />
                <select
                  value={config.timeframe}
                  onChange={(e) => indicators.sma.setConfigs(indicators.sma.configs.map((c: any) => c.id === config.id ? { ...c, timeframe: e.target.value } : c))}
                  className="bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                >
                  {MA_TIMEFRAMES.map(tf => (
                    <option key={tf.value} value={tf.value}>{tf.label}</option>
                  ))}
                </select>
                {indicators.sma.configs.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                    onClick={() => indicators.sma.setConfigs(indicators.sma.configs.filter((c: any) => c.id !== config.id))}
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Supertrend Settings */}
      {indicators.supertrend.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Supertrend Settings</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">ATR Period</Label>
              <input
                type="number"
                min="5"
                max="50"
                value={indicators.supertrend.periodInput}
                onChange={(e) => {
                  indicators.supertrend.setPeriodInput(e.target.value);
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 5) indicators.supertrend.setPeriod(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-supertrend-period"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Multiplier</Label>
              <input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={indicators.supertrend.multiplierInput}
                onChange={(e) => {
                  indicators.supertrend.setMultiplierInput(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 1) indicators.supertrend.setMultiplier(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-supertrend-multiplier"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">Clear buy/sell signals based on ATR</p>
        </div>
      )}
      
      {/* Parabolic SAR Settings */}
      {indicators.parabolicSAR.show && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Parabolic SAR Settings</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Step</Label>
              <input
                type="number"
                min="0.01"
                max="0.1"
                step="0.01"
                value={indicators.parabolicSAR.stepInput}
                onChange={(e) => {
                  indicators.parabolicSAR.setStepInput(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0.01) indicators.parabolicSAR.setStep(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-sar-step"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Max</Label>
              <input
                type="number"
                min="0.1"
                max="0.5"
                step="0.05"
                value={indicators.parabolicSAR.maxInput}
                onChange={(e) => {
                  indicators.parabolicSAR.setMaxInput(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0.1) indicators.parabolicSAR.setMax(val);
                }}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                data-testid="input-sar-max"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">Trailing stop indicator</p>
        </div>
      )}
      
      <div className="text-xs text-gray-400 bg-slate-800/50 rounded-lg p-2">
        <p><strong>SMA:</strong> Simple Moving Average - smooth trend indicator</p>
        <p><strong>Supertrend:</strong> Buy/sell signals based on ATR volatility</p>
        <p><strong>Ichimoku:</strong> Comprehensive trend system with support/resistance cloud</p>
        <p><strong>Parabolic SAR:</strong> Trailing stop and reversal indicator</p>
      </div>
      
      {/* Save Buttons */}
      <div className="pt-2 border-t border-slate-700 flex gap-2">
        <Button
          onClick={saveToTimeframe}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
          data-testid="button-save-trend-to-timeframe"
        >
          <Save className="w-3 h-3 mr-1" />
          Save to {interval}
        </Button>
        <Button
          onClick={makeTimeframeDefault}
          variant="outline"
          className="bg-slate-700 hover:bg-slate-600 text-white text-xs h-8 px-2"
          data-testid="button-make-trend-default"
        >
          ⭐
        </Button>
      </div>
    </div>
  );
}

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save } from 'lucide-react';

interface VWAPSettingsProps {
  indicators: any;
  interval: string;
  saveToTimeframe: () => void;
  makeTimeframeDefault: () => void;
}

export function VWAPSettings({
  indicators,
  interval,
  saveToTimeframe,
  makeTimeframeDefault,
}: VWAPSettingsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={indicators.vwap.showDaily} onCheckedChange={indicators.vwap.setShowDaily} id="show-vwap-daily" data-testid="switch-vwap-daily" />
          <Label htmlFor="show-vwap-daily" className="text-sm text-white cursor-pointer">Daily</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={indicators.vwap.showWeekly} onCheckedChange={indicators.vwap.setShowWeekly} id="show-vwap-weekly" data-testid="switch-vwap-weekly" />
          <Label htmlFor="show-vwap-weekly" className="text-sm text-white cursor-pointer">Weekly</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={indicators.vwap.showMonthly} onCheckedChange={indicators.vwap.setShowMonthly} id="show-vwap-monthly" data-testid="switch-vwap-monthly" />
          <Label htmlFor="show-vwap-monthly" className="text-sm text-white cursor-pointer">Monthly</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={indicators.vwap.showRolling} onCheckedChange={indicators.vwap.setShowRolling} id="show-vwap-rolling" data-testid="switch-vwap-rolling" />
          <Label htmlFor="show-vwap-rolling" className="text-sm text-white cursor-pointer">Rolling VWAP</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={indicators.vwapTools.showBands} onCheckedChange={indicators.vwapTools.setShowBands} id="show-vwap-bands" data-testid="switch-vwap-bands" />
          <Label htmlFor="show-vwap-bands" className="text-sm text-white cursor-pointer">VWAP Bands</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={indicators.vwapTools.showSession} onCheckedChange={indicators.vwapTools.setShowSession} id="show-session-vwap" data-testid="switch-session-vwap" />
          <Label htmlFor="show-session-vwap" className="text-sm text-white cursor-pointer">Session VWAP</Label>
        </div>
      </div>
      
      {/* Rolling VWAP Settings */}
      {indicators.vwap.showRolling && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Rolling VWAP Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Rolling Period (bars)</Label>
            <input
              type="number"
              min="5"
              max="200"
              value={indicators.vwap.rollingPeriodInput}
              onChange={(e) => {
                indicators.vwap.setRollingPeriodInput(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) indicators.vwap.setRollingPeriod(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-vwap-rolling-period"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">VWAP calculated over the last N candles</p>
        </div>
      )}
      
      {/* VWAP Bands Settings */}
      {indicators.vwapTools.showBands && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">VWAP Bands Settings</div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Std Dev</Label>
            <input
              type="number"
              min="0.5"
              max="4"
              step="0.5"
              value={indicators.vwapTools.bandsStdDevInput}
              onChange={(e) => {
                indicators.vwapTools.setBandsStdDevInput(e.target.value);
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val >= 0.5) indicators.vwapTools.setBandsStdDev(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-vwap-bands-stddev"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Standard deviation bands around VWAP</p>
        </div>
      )}
      
      <div className="text-xs text-gray-400 bg-slate-800/50 rounded-lg p-2">
        <p><strong>VWAP:</strong> Volume Weighted Average Price - Institutional trading benchmark</p>
        <p><strong>VWAP Bands:</strong> Standard deviation bands around VWAP (like Bollinger for VWAP)</p>
        <p><strong>Session VWAP:</strong> Separate VWAPs for Asia/London/NY trading sessions</p>
      </div>
      
      {/* Save Buttons */}
      <div className="pt-2 border-t border-slate-700 flex gap-2">
        <Button
          onClick={saveToTimeframe}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
          data-testid="button-save-vwap-to-timeframe"
        >
          <Save className="w-3 h-3 mr-1" />
          Save to {interval}
        </Button>
        <Button
          onClick={makeTimeframeDefault}
          variant="outline"
          className="bg-slate-700 hover:bg-slate-600 text-white text-xs h-8 px-2"
          data-testid="button-make-vwap-default"
        >
          ⭐
        </Button>
      </div>
    </div>
  );
}

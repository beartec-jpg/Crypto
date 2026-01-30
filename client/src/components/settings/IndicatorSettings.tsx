import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface IndicatorConfig {
  show: boolean;
  period?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
}

interface IndicatorSettingsProps {
  indicators: {
    ema: IndicatorConfig & { fastPeriod: number; slowPeriod: number };
    sma: IndicatorConfig & { period: number };
    rsi: IndicatorConfig & { period: number };
    macd: IndicatorConfig & { fastPeriod: number; slowPeriod: number; signalPeriod: number };
  };
  onToggle: (indicator: string, value: boolean) => void;
  onPeriodChange: (indicator: string, field: string, value: number) => void;
}

export function IndicatorSettings({ 
  indicators, 
  onToggle, 
  onPeriodChange 
}: IndicatorSettingsProps) {
  return (
    <div className="space-y-4">
      {/* EMA Settings */}
      <div className="p-3 bg-[#0e0e0e] rounded border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-white">EMA (Exponential Moving Average)</Label>
          <Switch
            checked={indicators.ema.show}
            onCheckedChange={(checked) => onToggle('ema', checked)}
          />
        </div>
        {indicators.ema.show && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-gray-400">Fast Period</Label>
              <Input
                type="number"
                value={indicators.ema.fastPeriod}
                onChange={(e) => onPeriodChange('ema', 'fastPeriod', parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Slow Period</Label>
              <Input
                type="number"
                value={indicators.ema.slowPeriod}
                onChange={(e) => onPeriodChange('ema', 'slowPeriod', parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>

      {/* SMA Settings */}
      <div className="p-3 bg-[#0e0e0e] rounded border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-white">SMA (Simple Moving Average)</Label>
          <Switch
            checked={indicators.sma.show}
            onCheckedChange={(checked) => onToggle('sma', checked)}
          />
        </div>
        {indicators.sma.show && (
          <div>
            <Label className="text-xs text-gray-400">Period</Label>
            <Input
              type="number"
              value={indicators.sma.period}
              onChange={(e) => onPeriodChange('sma', 'period', parseInt(e.target.value))}
              className="mt-1"
            />
          </div>
        )}
      </div>

      {/* RSI Settings */}
      <div className="p-3 bg-[#0e0e0e] rounded border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-white">RSI (Relative Strength Index)</Label>
          <Switch
            checked={indicators.rsi.show}
            onCheckedChange={(checked) => onToggle('rsi', checked)}
          />
        </div>
        {indicators.rsi.show && (
          <div>
            <Label className="text-xs text-gray-400">Period</Label>
            <Input
              type="number"
              value={indicators.rsi.period}
              onChange={(e) => onPeriodChange('rsi', 'period', parseInt(e.target.value))}
              className="mt-1"
            />
          </div>
        )}
      </div>

      {/* MACD Settings */}
      <div className="p-3 bg-[#0e0e0e] rounded border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-white">MACD</Label>
          <Switch
            checked={indicators.macd.show}
            onCheckedChange={(checked) => onToggle('macd', checked)}
          />
        </div>
        {indicators.macd.show && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-gray-400">Fast Period</Label>
              <Input
                type="number"
                value={indicators.macd.fastPeriod}
                onChange={(e) => onPeriodChange('macd', 'fastPeriod', parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Slow Period</Label>
              <Input
                type="number"
                value={indicators.macd.slowPeriod}
                onChange={(e) => onPeriodChange('macd', 'slowPeriod', parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Signal Period</Label>
              <Input
                type="number"
                value={indicators.macd.signalPeriod}
                onChange={(e) => onPeriodChange('macd', 'signalPeriod', parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

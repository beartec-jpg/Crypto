import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings } from 'lucide-react';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorState {
  rsi: { show: boolean; period: number; setShow: (val: boolean) => void };
  macd: { show: boolean; fast: number; slow: number; signal: number; setShow: (val: boolean) => void };
  stochRSI: { show: boolean; period: number; setShow: (val: boolean) => void };
  obv: { show: boolean; setShow: (val: boolean) => void };
  mfi: { show: boolean; period: number; setShow: (val: boolean) => void };
  williamsR: { show: boolean; period: number; setShow: (val: boolean) => void };
  cci: { show: boolean; period: number; setShow: (val: boolean) => void };
  adx: { show: boolean; period: number; setShow: (val: boolean) => void };
  tideZone?: { show: boolean; setShow: (val: boolean) => void };
}

interface OscillatorPanelProps {
  candles: CandleData[];
  indicators: IndicatorState;
  onToggleIndicator: (indicator: string, value: boolean, setter: (val: boolean) => void) => void;
  onOpenSettings?: (indicator: string) => void;
  isPaidTier?: boolean;
}

/**
 * Panel component for oscillator controls and display
 * Provides toggle switches for each oscillator with settings access
 * Extracted from CryptoIndicators.tsx for Phase 4G-10
 */
export function OscillatorPanel({
  candles,
  indicators,
  onToggleIndicator,
  onOpenSettings,
  isPaidTier = false
}: OscillatorPanelProps) {
  const oscillators = [
    { name: 'RSI', key: 'rsi', free: true },
    { name: 'MACD', key: 'macd', free: true },
    { name: 'Stochastic RSI', key: 'stochRSI', free: false },
    { name: 'OBV', key: 'obv', free: false },
    { name: 'MFI', key: 'mfi', free: false },
    { name: 'Williams %R', key: 'williamsR', free: false },
    { name: 'CCI', key: 'cci', free: false },
    { name: 'ADX', key: 'adx', free: false },
    { name: 'Tide Zone', key: 'tideZone', free: false },
  ] as const;

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-lg">Oscillators</CardTitle>
        {!isPaidTier && (
          <p className="text-xs text-amber-400">
            Free tier: RSI & MACD only, 1 active at a time
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {oscillators.map(({ name, key, free }) => {
          const indicator = indicators[key];
          if (!indicator) return null;
          const isLocked = !free && !isPaidTier;

          return (
            <div
              key={key}
              className={`flex items-center justify-between p-2 rounded-lg bg-slate-800/50 ${
                isLocked ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={indicator.show}
                  onCheckedChange={() =>
                    onToggleIndicator(name, indicator.show, indicator.setShow)
                  }
                  disabled={isLocked && !indicator.show}
                  id={`oscillator-${key}`}
                />
                <Label
                  htmlFor={`oscillator-${key}`}
                  className="text-sm text-white cursor-pointer"
                >
                  {name} {isLocked && '🔒'}
                </Label>
              </div>

              {indicator.show && onOpenSettings && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenSettings(key)}
                  className="h-8 w-8 p-0"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';

export interface OscillatorModalConfig {
  enabled?: boolean;
  period?: number;
  fast?: number;
  slow?: number;
  signal?: number;
}

interface OscillatorSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOscillators: Set<string>;
  onToggleOscillator: (oscillator: string, enabled: boolean) => void;
  oscillatorConfigs?: Record<string, OscillatorModalConfig>;
  onUpdateOscillatorConfig?: (oscillator: string, config: OscillatorModalConfig) => void;
}

const OSCILLATORS = [
  { id: 'rsi', name: 'RSI', description: 'Relative Strength Index (14)' },
  { id: 'macd', name: 'MACD', description: 'Moving Average Convergence Divergence' },
  { id: 'waddah', name: 'Waddah Explosion', description: 'MACD momentum + volatility explosion' },
  { id: 'cmf', name: 'CMF', description: 'Chaikin Money Flow (20)' },
  { id: 'volume', name: 'Volume', description: 'Trading Volume vs Average' },
  { id: 'stochRsi', name: 'Stoch RSI', description: 'Stochastic RSI (14,14,3,3)' },
  { id: 'tsi', name: 'TSI', description: 'True Strength Index (25,13,7)' },
  { id: 'williamsR', name: 'Williams %R', description: 'Williams Percent Range (14)' },
  { id: 'cci', name: 'CCI', description: 'Commodity Channel Index (20)' },
  { id: 'adx', name: 'ADX', description: 'Average Directional Index (14)' },
  { id: 'obv', name: 'OBV', description: 'On Balance Volume' },
  { id: 'mfi', name: 'MFI', description: 'Money Flow Index (14)' },
  { id: 'klinger', name: 'Klinger', description: 'Klinger Oscillator (34,55,13)' },
  { id: 'smartMoney', name: 'Smart Money Tracker', description: 'Standalone SMC system score and debug panel' },
  { id: 'smcTrendEngine', name: 'SMC Trend Engine', description: 'Trend-focused SMC score and debug panel' },
];

export function OscillatorSelectorModal({
  isOpen,
  onClose,
  selectedOscillators,
  onToggleOscillator,
  oscillatorConfigs,
  onUpdateOscillatorConfig,
}: OscillatorSelectorModalProps) {
  const [editingOscillator, setEditingOscillator] = useState<string | null>(null);
  const [draftConfig, setDraftConfig] = useState<OscillatorModalConfig>({});

  const editingMeta = useMemo(
    () => OSCILLATORS.find(osc => osc.id === editingOscillator) ?? null,
    [editingOscillator],
  );

  const openSettings = (oscillatorId: string) => {
    const existing = oscillatorConfigs?.[oscillatorId] ?? {};
    const isEnabled = existing.enabled ?? selectedOscillators.has(oscillatorId);

    setEditingOscillator(oscillatorId);
    setDraftConfig({
      enabled: isEnabled,
      period: existing.period,
      fast: existing.fast,
      slow: existing.slow,
      signal: existing.signal,
    });
  };

  const saveSettings = () => {
    if (!editingOscillator) return;

    const enabled = draftConfig.enabled ?? selectedOscillators.has(editingOscillator);
    onToggleOscillator(editingOscillator, enabled);
    onUpdateOscillatorConfig?.(editingOscillator, {
      enabled,
      period: draftConfig.period,
      fast: draftConfig.fast,
      slow: draftConfig.slow,
      signal: draftConfig.signal,
    });

    setEditingOscillator(null);
  };

  const closeSettings = () => {
    setEditingOscillator(null);
  };

  const showPeriodField =
    editingOscillator === 'rsi' ||
    editingOscillator === 'stochRsi' ||
    editingOscillator === 'mfi' ||
    editingOscillator === 'williamsR' ||
    editingOscillator === 'cci' ||
    editingOscillator === 'adx';

  const showMacdFields = editingOscillator === 'macd';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700 text-white">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="text-white">Oscillator Settings</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto pr-1">
            {OSCILLATORS.map((osc) => {
              const isEnabled = selectedOscillators.has(osc.id);

              return (
                <div
                  key={osc.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-slate-700 hover:bg-slate-800/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => openSettings(osc.id)}
                    className="text-left min-w-0 flex-1"
                  >
                    <div className="text-sm font-medium text-white flex items-center gap-2">
                      {osc.name}
                      <Settings className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-400">{osc.description}</p>
                  </button>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => onToggleOscillator(osc.id, checked)}
                    className="data-[state=checked]:bg-blue-600"
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 text-center">
            Click an oscillator name to open its configuration modal.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOscillator} onOpenChange={(open) => !open && closeSettings()}>
        <DialogContent className="sm:max-w-[380px] bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingMeta?.name ?? 'Oscillator'} Settings
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-200">Enabled</Label>
              <Switch
                checked={draftConfig.enabled ?? false}
                onCheckedChange={(checked) => setDraftConfig(prev => ({ ...prev, enabled: checked }))}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>

            {showPeriodField && (
              <div className="space-y-2">
                <Label className="text-slate-200">Period</Label>
                <Input
                  type="number"
                  min={2}
                  max={300}
                  value={draftConfig.period ?? 14}
                  onChange={(e) => {
                    const period = parseInt(e.target.value, 10);
                    if (Number.isFinite(period)) {
                      setDraftConfig(prev => ({ ...prev, period }));
                    }
                  }}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            )}

            {showMacdFields && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-slate-200">Fast</Label>
                  <Input
                    type="number"
                    min={2}
                    max={100}
                    value={draftConfig.fast ?? 12}
                    onChange={(e) => {
                      const fast = parseInt(e.target.value, 10);
                      if (Number.isFinite(fast)) {
                        setDraftConfig(prev => ({ ...prev, fast }));
                      }
                    }}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">Slow</Label>
                  <Input
                    type="number"
                    min={2}
                    max={200}
                    value={draftConfig.slow ?? 26}
                    onChange={(e) => {
                      const slow = parseInt(e.target.value, 10);
                      if (Number.isFinite(slow)) {
                        setDraftConfig(prev => ({ ...prev, slow }));
                      }
                    }}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">Signal</Label>
                  <Input
                    type="number"
                    min={2}
                    max={100}
                    value={draftConfig.signal ?? 9}
                    onChange={(e) => {
                      const signal = parseInt(e.target.value, 10);
                      if (Number.isFinite(signal)) {
                        setDraftConfig(prev => ({ ...prev, signal }));
                      }
                    }}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>
            )}

            {!showPeriodField && !showMacdFields && (
              <p className="text-sm text-slate-400">
                This oscillator currently has no numeric parameters yet. Use Enabled to show or hide it.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeSettings} className="border-slate-700 text-slate-200">
              Cancel
            </Button>
            <Button onClick={saveSettings} className="bg-blue-600 hover:bg-blue-700">
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

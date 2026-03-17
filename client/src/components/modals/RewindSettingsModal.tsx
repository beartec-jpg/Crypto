import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RewindSettings } from '@/types/rewind';
import { PLAYBACK_SPEEDS } from '@/types/rewind';

interface RewindSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: RewindSettings;
  onSettingsChange: (settings: RewindSettings) => void;
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

export function RewindSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: RewindSettingsModalProps) {
  function update<K extends keyof RewindSettings>(key: K, value: RewindSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Chart Rewind Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Enable/Disable */}
          <SettingRow label="Enable Chart Rewind">
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => update('enabled', v)}
              className="data-[state=checked]:bg-blue-600"
            />
          </SettingRow>

          {/* Playback */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Playback</p>

            <div className="py-2">
              <Label className="text-sm text-slate-300 mb-2 block">Playback Speed</Label>
              <div className="flex gap-2 mt-1">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => update('playbackSpeed', speed)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                      settings.playbackSpeed === speed
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            <SettingRow label="Auto-Play on Enable">
              <Switch
                checked={settings.autoPlay}
                onCheckedChange={(v) => update('autoPlay', v)}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>
          </div>

          {/* Display */}
          <div className="border-t border-slate-700 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display</p>

            <SettingRow label="Show Playback Controls">
              <Switch
                checked={settings.showControls}
                onCheckedChange={(v) => update('showControls', v)}
                className="data-[state=checked]:bg-blue-600"
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

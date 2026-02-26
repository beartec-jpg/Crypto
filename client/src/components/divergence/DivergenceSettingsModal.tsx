import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DivergenceSettings } from '@/hooks/useDivergenceSettings';

interface DivergenceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DivergenceSettings;
  onSettingsChange: (settings: Partial<DivergenceSettings>) => void;
}

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="min-w-0 mr-3">
        <Label className="text-sm text-slate-300">{label}</Label>
        {description && (
          <p className="text-xs text-slate-500 leading-tight">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export function DivergenceSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: DivergenceSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Divergence Scanner Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 py-2">
          {/* Display Format */}
          <div className="border-b border-slate-700 pb-3 mb-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display Format</p>
            <SettingRow
              label="Count Format"
              description="Number: 5  ·  Percentage: 71%"
            >
              <div className="flex items-center gap-1 rounded-md border border-slate-700 p-0.5">
                <button
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    settings.displayFormat === 'number'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => onSettingsChange({ displayFormat: 'number' })}
                >
                  Number
                </button>
                <button
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    settings.displayFormat === 'percentage'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => onSettingsChange({ displayFormat: 'percentage' })}
                >
                  Percent
                </button>
              </div>
            </SettingRow>
          </div>

          {/* Icon & Color Controls */}
          <div className="border-b border-slate-700 pb-3 mb-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Badge Style</p>
            <SettingRow label="Show Emoji Icons" description="🐂 bullish / 🐻 bearish">
              <Switch
                checked={settings.showEmoji}
                onCheckedChange={(v) => onSettingsChange({ showEmoji: v })}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>
            <SettingRow label="Show Color Coding" description="Off uses neutral gray">
              <Switch
                checked={settings.showColors}
                onCheckedChange={(v) => onSettingsChange({ showColors: v })}
                className="data-[state=checked]:bg-blue-600"
              />
            </SettingRow>
          </div>

          {/* History Count */}
          <div className="pt-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">History</p>
            <SettingRow
              label="History Count"
              description="Max recent divergences per type"
            >
              <Select
                value={String(settings.historyCount)}
                onValueChange={(v) =>
                  onSettingsChange({ historyCount: Number(v) as DivergenceSettings['historyCount'] })
                }
              >
                <SelectTrigger className="w-16 h-8 bg-slate-800 border-slate-600 text-slate-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-slate-200 text-xs focus:bg-slate-700">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

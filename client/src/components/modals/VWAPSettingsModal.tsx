import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VWAPState {
  showSession: boolean;
  setShowSession: (v: boolean) => void;
  showDaily: boolean;
  setShowDaily: (v: boolean) => void;
  showWeekly: boolean;
  setShowWeekly: (v: boolean) => void;
  showMonthly: boolean;
  setShowMonthly: (v: boolean) => void;
  showRolling: boolean;
  setShowRolling: (v: boolean) => void;
  rollingPeriod: number;
  setRollingPeriod: (v: number) => void;
  rollingPeriodInput: string;
  setRollingPeriodInput: (v: string) => void;
}

interface VWAPSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vwap: VWAPState;
}

export function VWAPSettingsModal({ isOpen, onClose, vwap }: VWAPSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] bg-slate-900 border-slate-700 text-white">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-white">VWAP Settings</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={vwap.showSession}
                onCheckedChange={vwap.setShowSession}
                id="vwap-modal-session"
                data-testid="switch-vwap-session"
              />
              <Label htmlFor="vwap-modal-session" className="text-sm text-white cursor-pointer">
                Session VWAP
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={vwap.showDaily}
                onCheckedChange={vwap.setShowDaily}
                id="vwap-modal-daily"
                data-testid="switch-vwap-daily"
              />
              <Label htmlFor="vwap-modal-daily" className="text-sm text-white cursor-pointer">
                Daily
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={vwap.showWeekly}
                onCheckedChange={vwap.setShowWeekly}
                id="vwap-modal-weekly"
                data-testid="switch-vwap-weekly"
              />
              <Label htmlFor="vwap-modal-weekly" className="text-sm text-white cursor-pointer">
                Weekly
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={vwap.showMonthly}
                onCheckedChange={vwap.setShowMonthly}
                id="vwap-modal-monthly"
                data-testid="switch-vwap-monthly"
              />
              <Label htmlFor="vwap-modal-monthly" className="text-sm text-white cursor-pointer">
                Monthly
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={vwap.showRolling}
                onCheckedChange={vwap.setShowRolling}
                id="vwap-modal-rolling"
                data-testid="switch-vwap-rolling"
              />
              <Label htmlFor="vwap-modal-rolling" className="text-sm text-white cursor-pointer">
                Rolling VWAP
              </Label>
            </div>
          </div>

          {vwap.showRolling && (
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs font-semibold text-blue-400 mb-2">Rolling VWAP Settings</div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-300">Rolling Period (bars)</Label>
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={vwap.rollingPeriodInput}
                  onChange={(e) => {
                    vwap.setRollingPeriodInput(e.target.value);
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 5 && val <= 200) vwap.setRollingPeriod(val);
                  }}
                  className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                  data-testid="input-vwap-rolling-period"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">VWAP calculated over the last N candles</p>
            </div>
          )}

          <div className="text-xs text-gray-400 bg-slate-800/50 rounded-lg p-2">
            <p><strong>Session VWAP:</strong> Daily VWAP reset each session</p>
            <p><strong>Daily/Weekly/Monthly:</strong> Anchored to period start</p>
            <p><strong>Rolling VWAP:</strong> Moving VWAP over N candles</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

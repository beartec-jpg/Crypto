import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface SMCControlsProps {
  showFVG: boolean;
  showBOS: boolean;
  showCHoCH: boolean;
  showOrderBlocks: boolean;
  onFVGChange: () => void;
  onBOSChange: () => void;
  onCHoCHChange: () => void;
  onOrderBlocksChange: () => void;
  isPaidTier?: boolean;
  showFVGSettings?: boolean;
  showHighValueOnly?: boolean;
  onShowHighValueOnlyChange?: (value: boolean) => void;
  fvgVolumeThreshold?: number;
  onFVGVolumeThresholdChange?: (value: number) => void;
  showBOSSettings?: boolean;
  chartBosSwingLengthInput?: string;
  onChartBosSwingLengthInputChange?: (value: string) => void;
  onChartBosSwingLengthChange?: (value: number) => void;
  showCHoCHSettings?: boolean;
  chartChochSwingLengthInput?: string;
  onChartChochSwingLengthInputChange?: (value: string) => void;
  onChartChochSwingLengthChange?: (value: number) => void;
}

export function SMCControls({
  showFVG,
  showBOS,
  showCHoCH,
  showOrderBlocks,
  onFVGChange,
  onBOSChange,
  onCHoCHChange,
  onOrderBlocksChange,
  isPaidTier = true,
  showFVGSettings = false,
  showHighValueOnly = false,
  onShowHighValueOnlyChange,
  fvgVolumeThreshold = 1.5,
  onFVGVolumeThresholdChange,
  showBOSSettings = false,
  chartBosSwingLengthInput = '5',
  onChartBosSwingLengthInputChange,
  onChartBosSwingLengthChange,
  showCHoCHSettings = false,
  chartChochSwingLengthInput = '20',
  onChartChochSwingLengthInputChange,
  onChartChochSwingLengthChange,
}: SMCControlsProps) {
  return (
    <div className="space-y-4">
      {/* Main toggles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={showFVG} onCheckedChange={onFVGChange} id="show-fvg" data-testid="switch-fvg" disabled={!isPaidTier && !showFVG} />
          <Label htmlFor="show-fvg" className="text-sm text-white cursor-pointer">FVG {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={showBOS} onCheckedChange={onBOSChange} id="show-bos" data-testid="switch-bos" disabled={!isPaidTier && !showBOS} />
          <Label htmlFor="show-bos" className="text-sm text-white cursor-pointer">BOS {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={showCHoCH} onCheckedChange={onCHoCHChange} id="show-choch" data-testid="switch-choch" disabled={!isPaidTier && !showCHoCH} />
          <Label htmlFor="show-choch" className="text-sm text-white cursor-pointer">CHoCH {!isPaidTier && '🔒'}</Label>
        </div>
        <div className={`flex items-center gap-2 ${!isPaidTier ? 'opacity-50' : ''}`}>
          <Switch checked={showOrderBlocks} onCheckedChange={onOrderBlocksChange} id="show-order-blocks" data-testid="switch-order-blocks" disabled={!isPaidTier && !showOrderBlocks} />
          <Label htmlFor="show-order-blocks" className="text-sm text-white cursor-pointer">Order Blocks {!isPaidTier && '🔒'}</Label>
        </div>
      </div>
      
      {/* FVG Settings */}
      {showFVGSettings && (
        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-blue-400 mb-2">FVG Settings</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">High Value Only</Label>
              <Switch checked={showHighValueOnly} onCheckedChange={onShowHighValueOnlyChange} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-300">Volume Threshold</Label>
              <input
                type="number"
                min="1"
                max="3"
                step="0.1"
                value={fvgVolumeThreshold}
                onChange={(e) => onFVGVolumeThresholdChange?.(parseFloat(e.target.value))}
                className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* BOS Settings */}
      {showBOSSettings && (
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
                onChartBosSwingLengthInputChange?.(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) onChartBosSwingLengthChange?.(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
              data-testid="input-bos-swing-length"
            />
          </div>
        </div>
      )}
      
      {/* CHoCH Settings */}
      {showCHoCHSettings && (
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
                onChartChochSwingLengthInputChange?.(e.target.value);
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 5) onChartChochSwingLengthChange?.(val);
              }}
              className="w-16 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
            />
          </div>
        </div>
      )}
    </div>
  );
}

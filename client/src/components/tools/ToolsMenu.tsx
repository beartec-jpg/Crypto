import { useState } from 'react';
import { Wrench, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ToolsMenuProps {
  divergenceScannerEnabled: boolean;
  onToggleDivergenceScanner: (enabled: boolean) => void;
  onOpenDivergenceSettings?: () => void;
  htfBiasEnabled: boolean;
  onToggleHtfBias: () => void;
  vpEnabled: boolean;
  onToggleVolumeProfile: (enabled: boolean) => void;
  onOpenVolumeProfileSettings: () => void;
  liquidityHeatmapEnabled: boolean;
  onToggleLiquidityHeatmap: (enabled: boolean) => void;
  onOpenLiquidityHeatmapSettings: () => void;
  gdsMiniBadgeEnabled: boolean;
  onToggleGdsMiniBadge: (enabled: boolean) => void;
  className?: string;
}

export function ToolsMenu({
  divergenceScannerEnabled,
  onToggleDivergenceScanner,
  onOpenDivergenceSettings,
  htfBiasEnabled,
  onToggleHtfBias,
  vpEnabled,
  onToggleVolumeProfile,
  onOpenVolumeProfileSettings,
  liquidityHeatmapEnabled,
  onToggleLiquidityHeatmap,
  onOpenLiquidityHeatmapSettings,
  gdsMiniBadgeEnabled,
  onToggleGdsMiniBadge,
  className,
}: ToolsMenuProps) {
  const [open, setOpen] = useState(false);

  const hasActiveTools =
    divergenceScannerEnabled ||
    htfBiasEnabled ||
    vpEnabled ||
    liquidityHeatmapEnabled ||
    gdsMiniBadgeEnabled;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative h-9 w-9 transition-all',
            hasActiveTools
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30'
              : 'text-slate-300 hover:text-white hover:bg-slate-800',
            className,
          )}
          title="Tools"
          aria-label="Tools"
        >
          <Wrench className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        className="w-56 p-0 bg-slate-900 border-slate-700 text-slate-100"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800">
          <span className="text-xs font-semibold text-slate-300">Tools</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="h-5 w-5 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="p-2">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide px-1 mb-1">
            Tools
          </div>
          <div className="flex items-center justify-between py-1.5 px-1">
            <div className="min-w-0 mr-3">
              <div className="text-sm font-medium text-slate-100 leading-tight">
                Divergence Scanner
              </div>
              <div className="text-xs text-slate-400 leading-tight">
                Scan all 7 oscillators
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Switch
                checked={divergenceScannerEnabled}
                onCheckedChange={onToggleDivergenceScanner}
                className="shrink-0 data-[state=checked]:bg-blue-600"
              />
              {onOpenDivergenceSettings && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700"
                  title="Divergence Settings"
                  onClick={() => {
                    setOpen(false);
                    onOpenDivergenceSettings();
                  }}
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5 px-1">
            <div className="min-w-0 mr-3">
              <div className="text-sm font-medium text-slate-100 leading-tight">
                HTF Bias
              </div>
              <div className="text-xs text-slate-400 leading-tight">
                Multi-timeframe bias panel
              </div>
            </div>
            <Switch
              checked={htfBiasEnabled}
              onCheckedChange={() => onToggleHtfBias()}
              className="shrink-0 data-[state=checked]:bg-blue-600"
            />
          </div>

          <div className="flex items-center justify-between py-1.5 px-1">
            <div className="min-w-0 mr-3">
              <div className="text-sm font-medium text-slate-100 leading-tight">
                Volume Profile
              </div>
              <div className="text-xs text-slate-400 leading-tight">
                VP settings and visibility
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Switch
                checked={vpEnabled}
                onCheckedChange={onToggleVolumeProfile}
                className="shrink-0 data-[state=checked]:bg-blue-600"
              />
              {
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700"
                  title="Volume Profile Settings"
                  onClick={() => {
                    setOpen(false);
                    onOpenVolumeProfileSettings();
                  }}
                  data-testid="btn-volume-profile-settings"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              }
            </div>
          </div>

          <div className="flex items-center justify-between py-1.5 px-1">
            <div className="min-w-0 mr-3">
              <div className="text-sm font-medium text-slate-100 leading-tight">
                Liquidity Heatmap
              </div>
              <div className="text-xs text-slate-400 leading-tight">
                Liquidation levels and buildup zones
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Switch
                checked={liquidityHeatmapEnabled}
                onCheckedChange={onToggleLiquidityHeatmap}
                className="shrink-0 data-[state=checked]:bg-blue-600"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700"
                title="Liquidity Heatmap Settings"
                onClick={() => {
                  setOpen(false);
                  onOpenLiquidityHeatmapSettings();
                }}
                data-testid="btn-liquidity-heatmap-settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between py-1.5 px-1">
            <div className="min-w-0 mr-3">
              <div className="text-sm font-medium text-slate-100 leading-tight">
                GDS Mini Badge
              </div>
              <div className="text-xs text-slate-400 leading-tight">
                Show Genuine Demand Score on chart
              </div>
            </div>
            <Switch
              checked={gdsMiniBadgeEnabled}
              onCheckedChange={onToggleGdsMiniBadge}
              className="shrink-0 data-[state=checked]:bg-blue-600"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

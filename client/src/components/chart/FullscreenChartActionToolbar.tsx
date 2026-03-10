import type { ChartDrawingTool } from '@/types/drawing';
import { DrawingMenu } from '@/components/drawings/DrawingMenu';
import { IndicatorMenu } from '@/components/indicators/IndicatorMenu';
import { ToolsMenu } from '@/components/tools/ToolsMenu';
import { TradingSystemsMenu } from '@/components/tradingSystems/TradingSystemsMenu';
import type { TradingSystemId } from '@/types/tradingSystems';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConfluenceSnapshot {
  score: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
  updatedAt: number;
}

interface FullscreenChartActionToolbarProps {
  activeTool: ChartDrawingTool;
  onSelectTool: (tool: ChartDrawingTool) => void;

  selectedOscillators: Set<string>;
  onToggleOscillator: (id: string, enabled: boolean) => void;
  onOpenOscillators: () => void;

  emaShow: boolean;
  onEmaToggle: (show: boolean) => void;
  emaConfigs: any;
  smaShow: boolean;
  onSmaToggle: (show: boolean) => void;
  smaConfigs: any;
  vwapShow: boolean;
  onVwapToggle: (show: boolean) => void;
  onOpenVwapSettings: () => void;
  elderImpulseShow: boolean;
  onElderImpulseToggle: (show: boolean) => void;
  onOpenEmaSma: () => void;

  fvgSettings: any;
  onFVGSettingsChange: (value: any) => void;
  obSettings: any;
  onOBSettingsChange: (value: any) => void;
  bosSettings: any;
  onBOSSettingsChange: (value: any) => void;
  liquiditySettings: any;
  onLiquiditySettingsChange: (value: any) => void;
  onOpenSmc: () => void;

  autoFibSettings: any;
  onAutoFibToggle: (enabled: boolean) => void;
  onOpenAutoFib: () => void;

  divergenceScannerEnabled: boolean;
  onToggleDivergenceScanner: (enabled: boolean) => void;
  onOpenDivergenceSettings: () => void;
  superTrendEnabled: boolean;
  onOpenSuperTrendSettings: () => void;

  onToggleDrawingMode: () => void;

  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;

  htfBiasEnabled: boolean;
  onToggleHtfBias: () => void;

  squeezeEnabled: boolean;
  onOpenSqueezeSettings: () => void;

  vpEnabled: boolean;
  onOpenVolumeProfileSettings: () => void;
  gdsMiniBadgeEnabled: boolean;
  onToggleGdsMiniBadge: (enabled: boolean) => void;

  activeSystem: TradingSystemId | null;
  onActivateSystem: (systemId: TradingSystemId) => void;
  onDeactivateSystem: () => void;
  confluenceSnapshot: ConfluenceSnapshot | null;
  onToggleFloatingMonitor: () => void;
}

export function FullscreenChartActionToolbar({
  activeTool,
  onSelectTool,
  selectedOscillators,
  onToggleOscillator,
  onOpenOscillators,
  emaShow,
  onEmaToggle,
  emaConfigs,
  smaShow,
  onSmaToggle,
  smaConfigs,
  vwapShow,
  onVwapToggle,
  onOpenVwapSettings,
  elderImpulseShow,
  onElderImpulseToggle,
  onOpenEmaSma,
  fvgSettings,
  onFVGSettingsChange,
  obSettings,
  onOBSettingsChange,
  bosSettings,
  onBOSSettingsChange,
  liquiditySettings,
  onLiquiditySettingsChange,
  onOpenSmc,
  autoFibSettings,
  onAutoFibToggle,
  onOpenAutoFib,
  divergenceScannerEnabled,
  onToggleDivergenceScanner,
  onOpenDivergenceSettings,
  superTrendEnabled,
  onOpenSuperTrendSettings,
  onToggleDrawingMode,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  htfBiasEnabled,
  onToggleHtfBias,
  squeezeEnabled,
  onOpenSqueezeSettings,
  vpEnabled,
  onOpenVolumeProfileSettings,
  gdsMiniBadgeEnabled,
  onToggleGdsMiniBadge,
  activeSystem,
  onActivateSystem,
  onDeactivateSystem,
  confluenceSnapshot,
  onToggleFloatingMonitor,
}: FullscreenChartActionToolbarProps) {
  return (
    <div className="absolute top-2 left-2 z-30 flex items-center gap-1 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-1 shadow-xl">
      <DrawingMenu activeTool={activeTool} onSelectTool={onSelectTool} />
      <IndicatorMenu
        selectedOscillators={selectedOscillators}
        onToggleOscillator={onToggleOscillator}
        onOpenOscillators={onOpenOscillators}
        emaShow={emaShow}
        onEmaToggle={onEmaToggle}
        emaConfigs={emaConfigs}
        smaShow={smaShow}
        onSmaToggle={onSmaToggle}
        smaConfigs={smaConfigs}
        vwapShow={vwapShow}
        onVwapToggle={onVwapToggle}
        onOpenVwapSettings={onOpenVwapSettings}
        elderImpulseShow={elderImpulseShow}
        onElderImpulseToggle={onElderImpulseToggle}
        onOpenEmaSma={onOpenEmaSma}
        fvgSettings={fvgSettings}
        onFVGSettingsChange={onFVGSettingsChange}
        obSettings={obSettings}
        onOBSettingsChange={onOBSettingsChange}
        bosSettings={bosSettings}
        onBOSSettingsChange={onBOSSettingsChange}
        liquiditySettings={liquiditySettings}
        onLiquiditySettingsChange={onLiquiditySettingsChange}
        onOpenSmc={onOpenSmc}
        autoFibSettings={autoFibSettings}
        onAutoFibToggle={onAutoFibToggle}
        onOpenAutoFib={onOpenAutoFib}
      />
            <ToolsMenu
        divergenceScannerEnabled={divergenceScannerEnabled}
        onToggleDivergenceScanner={onToggleDivergenceScanner}
        onOpenDivergenceSettings={onOpenDivergenceSettings}
        superTrendEnabled={superTrendEnabled}
        onOpenSuperTrendSettings={onOpenSuperTrendSettings}
        htfBiasEnabled={htfBiasEnabled}
        onToggleHtfBias={onToggleHtfBias}
        squeezeEnabled={squeezeEnabled}
        onOpenSqueezeSettings={onOpenSqueezeSettings}
        vpEnabled={vpEnabled}
        onOpenVolumeProfileSettings={onOpenVolumeProfileSettings}
        gdsMiniBadgeEnabled={gdsMiniBadgeEnabled}
        onToggleGdsMiniBadge={onToggleGdsMiniBadge}
      />

      <div className="w-px h-6 bg-slate-700" />

      <TradingSystemsMenu
        activeSystem={activeSystem}
        onActivateSystem={onActivateSystem}
        onDeactivateSystem={onDeactivateSystem}
        confluenceSnapshot={confluenceSnapshot}
        onToggleFloatingMonitor={onToggleFloatingMonitor}
      />

      <div className="w-px h-6 bg-slate-700" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleDrawingMode}
        className={cn(
          'px-2 py-1 text-xs font-semibold transition-all',
          activeTool
            ? 'bg-blue-500 text-white'
            : 'bg-slate-800/90 text-gray-400 hover:bg-slate-700',
        )}
        title={activeTool ? 'Drawing: ON (press D or click to disable)' : 'Drawing: OFF (press D or click to enable)'}
        data-testid="btn-drawing-toggle"
      >
        {activeTool ? 'Drawing: ON' : 'Drawing: OFF'}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onUndo}
        disabled={!canUndo}
        className={cn(
          'p-2 transition-all',
          canUndo
            ? 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
            : 'bg-slate-800/40 text-gray-600 cursor-not-allowed',
        )}
        title="Undo (Ctrl+Z)"
        data-testid="btn-undo"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onRedo}
        disabled={!canRedo}
        className={cn(
          'p-2 transition-all',
          canRedo
            ? 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
            : 'bg-slate-800/40 text-gray-600 cursor-not-allowed',
        )}
        title="Redo (Ctrl+Y)"
        data-testid="btn-redo"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
        </svg>
      </Button>

    </div>
  );
}

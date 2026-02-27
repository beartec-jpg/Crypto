import type { ChartDrawingTool } from '@/types/drawing';
import { DrawingMenu } from '@/components/drawings/DrawingMenu';
import { IndicatorMenu } from '@/components/indicators/IndicatorMenu';
import { ToolsMenu } from '@/components/tools/ToolsMenu';

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
  onOpenEmaSma: () => void;

  fvgSettings: any;
  onFVGSettingsChange: (value: any) => void;
  obSettings: any;
  onOBSettingsChange: (value: any) => void;
  bosSettings: any;
  onBOSSettingsChange: (value: any) => void;
  liquiditySettings: any;
  onLiquiditySettingsChange: (value: any) => void;
  pdZoneSettings: any;
  onPDZoneSettingsChange: (value: any) => void;
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
  onOpenEmaSma,
  fvgSettings,
  onFVGSettingsChange,
  obSettings,
  onOBSettingsChange,
  bosSettings,
  onBOSSettingsChange,
  liquiditySettings,
  onLiquiditySettingsChange,
  pdZoneSettings,
  onPDZoneSettingsChange,
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
        onOpenEmaSma={onOpenEmaSma}
        fvgSettings={fvgSettings}
        onFVGSettingsChange={onFVGSettingsChange}
        obSettings={obSettings}
        onOBSettingsChange={onOBSettingsChange}
        bosSettings={bosSettings}
        onBOSSettingsChange={onBOSSettingsChange}
        liquiditySettings={liquiditySettings}
        onLiquiditySettingsChange={onLiquiditySettingsChange}
        pdZoneSettings={pdZoneSettings}
        onPDZoneSettingsChange={onPDZoneSettingsChange}
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
      />

      <button
        onClick={onToggleDrawingMode}
        className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
          activeTool
            ? 'bg-blue-500 text-white'
            : 'bg-slate-800/90 text-gray-400 hover:bg-slate-700'
        }`}
        title={activeTool ? 'Drawing: ON (press D or click to disable)' : 'Drawing: OFF (press D or click to enable)'}
        data-testid="btn-drawing-toggle"
      >
        {activeTool ? 'Drawing: ON' : 'Drawing: OFF'}
      </button>

      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`p-2 rounded-lg transition-all ${
          canUndo
            ? 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
            : 'bg-slate-800/40 text-gray-600 cursor-not-allowed'
        }`}
        title="Undo (Ctrl+Z)"
        data-testid="btn-undo"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        className={`p-2 rounded-lg transition-all ${
          canRedo
            ? 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
            : 'bg-slate-800/40 text-gray-600 cursor-not-allowed'
        }`}
        title="Redo (Ctrl+Y)"
        data-testid="btn-redo"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
        </svg>
      </button>

      <button
        onClick={onToggleHtfBias}
        className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
          htfBiasEnabled
            ? 'bg-indigo-600 text-white'
            : 'bg-slate-800/90 text-gray-400 hover:bg-slate-700'
        }`}
        title="Toggle HTF Bias Panel"
        data-testid="btn-htf-bias-toggle"
      >
        HTF
      </button>

      <button
        onClick={onOpenSqueezeSettings}
        className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
          squeezeEnabled
            ? 'bg-cyan-600 text-white'
            : 'bg-slate-800/90 text-gray-400 hover:bg-slate-700'
        }`}
        title="Squeeze Momentum (LazyBear)"
        data-testid="btn-squeeze-momentum-toggle"
      >
        Squeeze
      </button>

      <button
        onClick={onOpenVolumeProfileSettings}
        className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
          vpEnabled
            ? 'bg-blue-600 text-white'
            : 'bg-slate-800/90 text-gray-400 hover:bg-slate-700'
        }`}
        title="Volume Profile Settings"
        data-testid="btn-volume-profile"
      >
        VP
      </button>
    </div>
  );
}

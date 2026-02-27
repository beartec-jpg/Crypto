import { useState, useEffect, useRef, useMemo } from 'react';
import { Time } from 'lightweight-charts';
import { useToast } from '@/hooks/use-toast';
import { useDrawingHistory } from '@/hooks/useDrawingHistory';
import { useElliottWaveLabels } from '@/hooks/useElliottWaveLabels';
import { useWaveSelection } from '@/hooks/useWaveSelection';
import { useElliottWaveRendering } from '@/hooks/useElliottWaveRendering';
import { useElliottWaveKeyboardShortcuts } from '@/hooks/useElliottWaveKeyboardShortcuts';
import { useElliottWaveController } from '@/hooks/useElliottWaveController';
import { useFullscreenDrawingActions } from '@/hooks/useFullscreenDrawingActions';
import { useSaveDrawingWithUndo } from '@/hooks/useSaveDrawingWithUndo';
import { useFullscreenChartLifecycle } from '@/hooks/useFullscreenChartLifecycle';
import { useHydratedDrawings } from '@/hooks/useHydratedDrawings';
import { useFullscreenKeyboardShortcuts } from '@/hooks/useFullscreenKeyboardShortcuts';
import { useFullscreenModalHelpers } from '@/hooks/useFullscreenModalHelpers';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';

// New extraction hooks
import { useChartInstance } from '@/hooks/useChartInstance';
import { useDrawingInteraction } from '@/hooks/useDrawingInteraction';
import { useOscillatorPanel } from '@/hooks/useOscillatorPanel';
import { useDrawingPrimitives } from '@/hooks/useDrawingPrimitives';
import { useHTFDataCache } from '@/hooks/useHTFDataCache';

// Existing hooks
import { useCandleData } from '@/hooks/useCandleData';
import { useOscillatorData } from '@/hooks/useOscillatorData';
import { useDrawingsPersistence } from '@/hooks/useDrawingsPersistence';
import { useIndicatorState } from '@/hooks/useIndicatorState';
import { useChartGestures, type GesturePoint } from '@/hooks/useChartGestures';
import { useElliottWave } from '@/hooks/usePredictiveElliottWave';

// New extraction components
import { FullscreenChartToolbar } from '@/components/chart/FullscreenChartToolbar';
import { FullscreenChartActionToolbar } from '@/components/chart/FullscreenChartActionToolbar';
import { FullscreenChartIndicatorLayer } from '@/components/chart/FullscreenChartIndicatorLayer';
import { FullscreenChartModals } from '@/components/chart/FullscreenChartModals';
import { FullscreenChartViewportLayer } from '@/components/chart/FullscreenChartViewportLayer';
import { FullscreenOscillatorLayout } from '@/components/oscillators/FullscreenOscillatorLayout';

import { useSuperTrendSettings } from '@/hooks/useSuperTrendSettings';
import { useSuperTrendCalculation } from '@/hooks/useSuperTrendCalculation';
import { useVolumeProfileSettings } from '@/hooks/useVolumeProfileSettings';
import { useVisibleRange } from '@/hooks/useVisibleRange';
import { useVolumeProfileCalculation } from '@/hooks/useVolumeProfileCalculation';
import { useFVGSettings } from '@/hooks/useFVGSettings';
import { useFVGDetection } from '@/hooks/useFVGDetection';
import { useOrderBlockSettings } from '@/hooks/useOrderBlockSettings';
import { useOrderBlockDetection } from '@/hooks/useOrderBlockDetection';
import { useBreakerBlockSettings } from '@/hooks/useBreakerBlockSettings';
import { useBreakerBlockDetection } from '@/hooks/useBreakerBlockDetection';
import { useBOSSettings } from '@/hooks/useBOSSettings';
import { useBOSDetection } from '@/hooks/useBOSDetection';
import { useLiquiditySettings } from '@/hooks/useLiquiditySettings';
import { useLiquidityDetection } from '@/hooks/useLiquidityDetection';
import { usePDZoneSettings } from '@/hooks/usePDZoneSettings';
import { usePDZoneDetection } from '@/hooks/usePDZoneDetection';
import { useAutoFibSettings } from '@/hooks/useAutoFibSettings';
import { useAutoFibDetection } from '@/hooks/useAutoFibDetection';
import { DrawingRenderer } from '@/components/drawings/DrawingRenderer';
import { calculateEMA } from '@/lib/indicators';
import { useDivergenceScanner } from '@/hooks/useDivergenceScanner';
import { useDivergenceSettings } from '@/hooks/useDivergenceSettings';
import { DEFAULT_OSCILLATOR_CONFIG } from '@/lib/calculations/divergenceCalculations';
import { WaveOverlayStack } from '@/components/elliottWave/WaveOverlayStack';
import { useHTFBias } from '@/hooks/useHTFBias';
import { useHTFBiasSettings } from '@/hooks/useHTFBiasSettings';
import { useSqueezeMomentumSettings } from '@/hooks/useSqueezeMomentumSettings';
import { useSqueezeMomentum } from '@/hooks/useSqueezeMomentum';

// Types and constants
import type { Drawing, ChartDrawingTool } from '@/types/drawing';
import type { DivergencePoint } from '@/types/chart.types';

/** Shorten degree names to concise abbreviations for SVG labels */
const getDegreeAbbreviation = (degree: string): string => {
  const abbrev: Record<string, string> = {
    'Grand Supercycle': 'GSC',
    'Supercycle': 'SC',
    'Cycle': 'Cyc',
    'Primary': 'Prim',
    'Intermediate': 'Int',
    'Minor': 'Min',
    'Minute': 'min',
    'Minuette': 'min.',
    'Sub-Minuette': 'sub',
  };
  return abbrev[degree] ?? degree;
};

interface ChartFullscreenPageProps {
  onClose: () => void;
  initialSymbol: string;
  initialTimeframe: string;
  watchlistTickers: string[];
}

export function ChartFullscreenPage({
  onClose,
  initialSymbol,
  initialTimeframe,
  watchlistTickers,
}: ChartFullscreenPageProps) {
  // Core state
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [activeTool, setActiveTool] = useState<ChartDrawingTool>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  const [activeEdit, setActiveEdit] = useState<{ drawingId: string; pointIndex: number; originalDrawing: Drawing } | null>(null);
  const [autoColorEnabled, setAutoColorEnabled] = useState(true);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [showEmaSmaModal, setShowEmaSmaModal] = useState(false);
  const [showSmcModal, setShowSmcModal] = useState(false);
  const [showAutoFibModal, setShowAutoFibModal] = useState(false);
  const [showSuperTrendModal, setShowSuperTrendModal] = useState(false);
  const [tempDrawing, setTempDrawing] = useState<{ points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null>(null);

  // Incremented whenever the chart pans/zooms so we can recompute the SVG click overlay coords
  const [chartViewVersion, setChartViewVersion] = useState(0);
  // Degree picker state – shown when elliott_wave tool is activated
  const [showDegreePicker, setShowDegreePicker] = useState(false);
  const [selectedWaveDegree, setSelectedWaveDegree] = useState('Minor');
  const [selectedWaveLabel, setSelectedWaveLabel] = useState('1');
  const [selectedWavePatternType, setSelectedWavePatternType] = useState('impulse');

  // Divergence Scanner state
  const [divergenceScannerEnabled, setDivergenceScannerEnabled] = useState(false);
  const [selectedDivergencePoint, setSelectedDivergencePoint] = useState<DivergencePoint | null>(null);
  const [showDivergenceSettings, setShowDivergenceSettings] = useState(false);

  // Squeeze Momentum state
  const [showSqueezeSettings, setShowSqueezeSettings] = useState(false);
  // Volume Profile state
  const [showVPModal, setShowVPModal] = useState(false);

  // Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const activeToolRef = useRef<ChartDrawingTool>(null);
  const autoColorEnabledRef = useRef(autoColorEnabled);
  const onPointCommitRef = useRef<((point: GesturePoint) => void) | null>(null);
  // Hooks - Elliott Wave tool
  const elliottWave = useElliottWave();

  // Hooks - Oscillator panel (needed first for totalHeight)
  const oscillatorPanel = useOscillatorPanel();

  // Hooks - Chart instance
  const { chartRef, candleSeriesRef, isReady: chartReady, fitContent } = useChartInstance({
    containerRef: chartContainerRef,
    totalOscillatorHeight: oscillatorPanel.totalHeight,
    mobileNavHeight: 0, // No mobile nav in fullscreen mode
  });

  // Subscribe to main chart visible range for oscillator sync,
  // and increment chartViewVersion on pan/zoom to repaint the SVG wave click overlay
  const [mainChartVisibleRange, setMainChartVisibleRange] = useState<any>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const handleVisibleRangeChange = () => {
      const range = chartRef.current?.timeScale().getVisibleRange();
      if (range) setMainChartVisibleRange(range);
      setChartViewVersion(v => v + 1);
    };
    chartRef.current.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    return () => {
      chartRef.current?.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    };
  }, [chartRef.current]);

  // Hooks - Data fetching
  const { candles, isLoading, error } = useCandleData({
    symbol,
    timeframe,
    enabled: chartReady,
    refreshInterval: 30000,
  });

  // Hooks - Oscillator data
  const oscillatorData = useOscillatorData(candles);

  // Hooks - Indicators
  const indicators = useIndicatorState();

  // Hooks - FVG detection
  const fvgSettings = useFVGSettings();
  const fvgs = useFVGDetection({ candles, settings: fvgSettings.settings });

  // Hooks - Order Block detection
  const obSettings = useOrderBlockSettings();
  const orderBlocks = useOrderBlockDetection({ candles, settings: obSettings.settings, fvgs });

  // Hooks - Breaker Block detection (derived from existing Order Blocks)
  const bbSettings = useBreakerBlockSettings();
  const breakerBlocks = useBreakerBlockDetection({ candles, orderBlocks, settings: bbSettings.settings });

  // Hooks - BOS/CHoCH detection
  const bosSettings = useBOSSettings();
  const { structureBreaks, swingPoints } = useBOSDetection({
    candles,
    settings: bosSettings.settings,
    fvgs,
    orderBlocks,
  });

  // Hooks - Liquidity Zone detection
  const liquiditySettings = useLiquiditySettings();
  const liquidityZones = useLiquidityDetection({
    candles,
    settings: liquiditySettings.settings,
  });

  // Hooks - Premium/Discount Zone detection
  const pdZoneSettings = usePDZoneSettings();
  const pdZones = usePDZoneDetection({
    candles,
    settings: pdZoneSettings.settings,
  });

  // Hooks - Auto-Fibonacci detection
  const autoFibSettings = useAutoFibSettings();
  const autoFibZones = useAutoFibDetection(candles, autoFibSettings.settings);

  // Hooks - SuperTrend
  const superTrendSettings = useSuperTrendSettings();
  const superTrendData = useSuperTrendCalculation(candles, superTrendSettings.settings);

  // Hooks - Divergence Scanner
  const divergencePoints = useDivergenceScanner(candles, DEFAULT_OSCILLATOR_CONFIG);
  const divSettings = useDivergenceSettings();

  const filteredDivergencePoints = useMemo(() => {
    const count = divSettings.settings.historyCount;
    const bullish = divergencePoints
      .filter(p => p.type === 'bullish')
      .sort((a, b) => (b.time as number) - (a.time as number))
      .slice(0, count);
    const bearish = divergencePoints
      .filter(p => p.type === 'bearish')
      .sort((a, b) => (b.time as number) - (a.time as number))
      .slice(0, count);
    return [...bullish, ...bearish];
  }, [divergencePoints, divSettings.settings.historyCount]);

  // Hooks - HTF data cache
  const { htfDataCache } = useHTFDataCache({
    symbol,
    currentTimeframe: timeframe,
    emaConfigs: indicators.ema.configs,
    enabled: indicators.ema.show,
  });

  // Hooks - HTF Bias Panel
  const htfBiasSettings = useHTFBiasSettings();
  const htfBiasEntries = useHTFBias({
    symbol,
    timeframes: htfBiasSettings.settings.timeframes,
    enabled: htfBiasSettings.settings.enabled,
  });

  // Hooks - Squeeze Momentum
  const sqzSettings = useSqueezeMomentumSettings();
  const sqzData = useSqueezeMomentum(candles, sqzSettings.settings);
  // Hooks - Volume Profile
  const vpSettings = useVolumeProfileSettings();
  const visibleRange = useVisibleRange(vpSettings.settings.updateOnPan ? chartRef.current : null);
  const volumeProfileData = useVolumeProfileCalculation(candles, visibleRange, vpSettings.settings);

  // Hooks - Drawing persistence
  const drawingsPersistence = useDrawingsPersistence(symbol, timeframe);

  const {
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    recordAdd,
    recordDelete,
  } = useDrawingHistory({ drawingsPersistence, setDrawings });

  // Hooks - Toast notifications
  const { toast } = useToast();

  const {
    ewLabels,
    saveEWLabelMutation,
    deleteEWLabelMutation,
  } = useElliottWaveLabels({ symbol, timeframe, toast });

  // Hooks - Drawing interaction
  const drawingInteraction = useDrawingInteraction({
    chartRef,
    candleSeriesRef,
    containerRef: chartContainerRef,
    drawings,
    activeTool,
  });

  const waveSelection = useWaveSelection({
    drawings,
    candles: candles as Array<{ time: number }>,
    drawingInteraction,
  });

  useElliottWaveRendering({
    candleSeriesRef,
    chartRef,
    candles,
    drawings,
    selectedWaveDegree,
    selectedWaveId: waveSelection.selectedWaveId,
    elliottWave,
  });

  const elliottWaveController = useElliottWaveController({
    activeTool,
    elliottWave,
    waveSelection,
    symbol,
    timeframe,
    selectedWaveDegree,
    selectedWaveLabel,
    selectedWavePatternType,
    setShowDegreePicker,
    setSelectedWaveDegree,
    setSelectedWaveLabel,
    setSelectedWavePatternType,
    setActiveTool,
    activeToolRef,
    saveEWLabelMutation,
  });

  const drawingActions = useFullscreenDrawingActions({
    selectedDrawingId: drawingInteraction.selectedDrawingId,
    drawings,
    setDrawings,
    drawingsPersistence,
    deleteEWLabelMutation,
    recordDelete,
    setSelectedDrawingId: drawingInteraction.setSelectedDrawingId,
  });

  useElliottWaveKeyboardShortcuts({
    elliottWave,
    onDeactivateTool: elliottWaveController.deactivateTool,
    toast,
  });

  // Hooks - Drawing primitives (side effect only)
  useDrawingPrimitives({
    chartRef,
    candleSeriesRef,
    drawings,
    selectedDrawingId: drawingInteraction.selectedDrawingId,
    activeEdit,
    visible: drawingsVisible,
  });

  // Extract wave endpoints from all saved drawings for priority snapping
  const waveEndpoints = useMemo(() =>
    drawings
      .filter(d => d.type === 'elliott_wave' && d.points.length > 0)
      .flatMap(d => d.points.map(p => ({ time: p.time, price: p.price }))),
    [drawings]
  );

  // Hooks - Gesture controller
  const gestureController = useChartGestures({
    enabled: activeTool !== null,
    data: candles as unknown as { time: Time; open: number; high: number; low: number; close: number }[],
    onPointCommit: (point) => onPointCommitRef.current?.(point),
    onCrosshairModeChange: () => {},
    autoSnapEnabled: true,
    waveEndpoints,
  });

  useFullscreenChartLifecycle({
    candleSeriesRef,
    chartRef,
    chartContainerRef,
    candles,
    timeframe,
    symbol,
    fitContent,
    handleChartClick: drawingInteraction.handleChartClick as EventListener,
    handleTouchEnd: drawingInteraction.handleTouchEnd as EventListener,
    gestureController,
  });

  useHydratedDrawings({
    persistedDrawings: drawingsPersistence.drawings,
    ewLabels,
    setDrawings,
  });

  // Update refs
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { autoColorEnabledRef.current = autoColorEnabled; }, [autoColorEnabled]);

  const modalHelpers = useFullscreenModalHelpers({
    selectedDrawingId: drawingInteraction.selectedDrawingId,
    drawings,
    setSettingsModalOpen,
  });

  const saveDrawingWithUndo = useSaveDrawingWithUndo({
    saveDrawing: drawingsPersistence.saveDrawing,
    recordAdd,
  });

  useFullscreenKeyboardShortcuts({
    activeTool,
    setActiveTool,
    activeToolRef,
    onSelectTool: elliottWaveController.handleSelectTool,
    onDeleteSelected: drawingActions.handleDeleteDrawing,
    onDeselectAll: () => drawingInteraction.setSelectedDrawingId(null),
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  // Elliott Wave: auto-save the wave immediately when all points are placed and valid
  useEffect(() => {
    if (elliottWave.isComplete && elliottWave.isValid) {
      elliottWaveController.handleElliottWaveSave();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elliottWave.isComplete, elliottWave.isValid]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col h-screen">
      {/* Top Toolbar */}
      <FullscreenChartToolbar
        symbol={symbol}
        onSymbolChange={setSymbol}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        watchlistTickers={watchlistTickers}
        onClose={onClose}
      />

      {/* Chart Area */}
      <div className="flex-1 relative overflow-hidden">
        <FullscreenChartActionToolbar
          activeTool={activeTool}
          onSelectTool={elliottWaveController.handleSelectTool}
          selectedOscillators={oscillatorPanel.selectedOscillators}
          onToggleOscillator={oscillatorPanel.toggleOscillator}
          onOpenOscillators={() => oscillatorPanel.setShowSelector(true)}
          emaShow={indicators.ema.show}
          onEmaToggle={indicators.ema.setShow}
          emaConfigs={indicators.ema.configs}
          smaShow={indicators.sma.show}
          onSmaToggle={indicators.sma.setShow}
          smaConfigs={indicators.sma.configs}
          vwapShow={indicators.vwap.showSession}
          onVwapToggle={indicators.vwap.setShowSession}
          onOpenEmaSma={() => setShowEmaSmaModal(true)}
          fvgSettings={fvgSettings.settings}
          onFVGSettingsChange={fvgSettings.setSettings}
          obSettings={obSettings.settings}
          onOBSettingsChange={obSettings.setSettings}
          bosSettings={bosSettings.settings}
          onBOSSettingsChange={bosSettings.setSettings}
          liquiditySettings={liquiditySettings.settings}
          onLiquiditySettingsChange={liquiditySettings.setSettings}
          pdZoneSettings={pdZoneSettings.settings}
          onPDZoneSettingsChange={pdZoneSettings.setSettings}
          onOpenSmc={() => setShowSmcModal(true)}
          autoFibSettings={autoFibSettings.settings}
          onAutoFibToggle={(enabled) => autoFibSettings.updateSettings({ enabled })}
          onOpenAutoFib={() => setShowAutoFibModal(true)}
          divergenceScannerEnabled={divergenceScannerEnabled}
          onToggleDivergenceScanner={setDivergenceScannerEnabled}
          onOpenDivergenceSettings={() => setShowDivergenceSettings(true)}
          superTrendEnabled={
            superTrendSettings.settings.standard.enabled ||
            superTrendSettings.settings.adx.enabled ||
            superTrendSettings.settings.keltner.enabled
          }
          onOpenSuperTrendSettings={() => setShowSuperTrendModal(true)}
          onToggleDrawingMode={() => {
            if (activeTool) {
              setActiveTool(null);
              activeToolRef.current = null;
            } else {
              setActiveTool('trendline');
              activeToolRef.current = 'trendline';
            }
          }}
          canUndo={canUndo}
          onUndo={handleUndo}
          canRedo={canRedo}
          onRedo={handleRedo}
          htfBiasEnabled={htfBiasSettings.settings.enabled}
          onToggleHtfBias={() => htfBiasSettings.updateSetting('enabled', !htfBiasSettings.settings.enabled)}
          squeezeEnabled={sqzSettings.settings.enabled}
          onOpenSqueezeSettings={() => setShowSqueezeSettings(true)}
          vpEnabled={vpSettings.settings.enabled}
          onOpenVolumeProfileSettings={() => setShowVPModal(true)}
        />

        <FullscreenChartViewportLayer
          miniOscillators={oscillatorPanel.miniOscillators}
          oscillatorData={oscillatorData}
          onCycleMiniMode={oscillatorPanel.cycleMode}
          showHtfBiasPanel={htfBiasSettings.settings.enabled}
          htfBiasEntries={htfBiasEntries}
          isLoading={isLoading}
          errorMessage={error?.message || null}
          chartContainerRef={chartContainerRef}
          chartPercentage={oscillatorPanel.chartPercentage}
          onChartBackgroundClick={!activeTool ? waveSelection.handleDeselect : undefined}
        />
        
        <FullscreenChartIndicatorLayer
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          candles={candles}
          calculateEMA={calculateEMA}
          emaConfigs={indicators.ema.configs}
          showEma={indicators.ema.show}
          emaHTFDataCache={htfDataCache}
          symbol={symbol}
          interval={timeframe}
          fvgs={fvgs}
          fvgSettings={fvgSettings.settings}
          orderBlocks={orderBlocks}
          obSettings={obSettings.settings}
          breakerBlocks={breakerBlocks}
          bbSettings={bbSettings.settings}
          structureBreaks={structureBreaks}
          swingPoints={swingPoints}
          bosSettings={bosSettings.settings}
          liquidityZones={liquidityZones}
          liquiditySettings={liquiditySettings.settings}
          pdZones={pdZones}
          pdZoneSettings={pdZoneSettings.settings}
          autoFibZones={autoFibZones}
          autoFibSettings={autoFibSettings.settings}
          volumeProfileData={volumeProfileData}
          vpSettings={vpSettings.settings}
          showVPModal={showVPModal}
          onCloseVPModal={() => setShowVPModal(false)}
          onVPSettingsChange={vpSettings.setSettings}
          superTrendData={superTrendData}
          superTrendSettings={superTrendSettings.settings}
          divergenceScannerEnabled={divergenceScannerEnabled}
          filteredDivergencePoints={filteredDivergencePoints}
          onSelectDivergencePoint={setSelectedDivergencePoint}
          selectedDivergencePoint={selectedDivergencePoint}
          onCloseDivergencePoint={() => setSelectedDivergencePoint(null)}
          showDivergenceSettings={showDivergenceSettings}
          onCloseDivergenceSettings={() => setShowDivergenceSettings(false)}
          divergenceSettings={divSettings.settings}
          onDivergenceSettingsChange={divSettings.updateSettings}
          showSqueezeSettings={showSqueezeSettings}
          onCloseSqueezeSettings={() => setShowSqueezeSettings(false)}
          squeezeSettings={sqzSettings.settings}
          onSqueezeSettingsChange={sqzSettings.updateSettings}
          onResetSqueezeSettings={sqzSettings.resetSettings}
        />

        {/* Drawing Renderer */}
        <DrawingRenderer
          drawingMode={activeTool ? 'draw' : 'off'}
          activeTool={activeTool}
          activeToolRef={activeToolRef}
          autoColorEnabledRef={autoColorEnabledRef}
          candles={candles}
          tempDrawing={tempDrawing}
          setTempDrawing={setTempDrawing}
          setDrawings={setDrawings}
          saveDrawingMutation={{ mutate: saveDrawingWithUndo }}
          onPointCommitRef={onPointCommitRef}
          onElliottWavePoint={elliottWave.isActive && elliottWave.isDrawing
            ? (p: GesturePoint) => {
                elliottWave.placePoint(p.time as number, p.price, p.snapType);
              }
            : undefined
          }
        />

        <WaveOverlayStack
          elliottWave={elliottWave}
          activeTool={activeTool}
          onDeactivateTool={elliottWaveController.deactivateTool}
          selectedWaveId={waveSelection.selectedWaveId}
          selectedWaveFibs={waveSelection.selectedWaveFibs}
          futurePredictionLines={waveSelection.futurePredictionLines}
          chartViewVersion={chartViewVersion}
          drawings={drawings}
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          onDeselectWave={waveSelection.handleDeselect}
          onWaveClick={waveSelection.handleWaveClick}
          tempDrawing={tempDrawing}
          quickMenuPosition={drawingInteraction.quickMenuPosition}
          selectedDrawingId={drawingInteraction.selectedDrawingId}
          onOpenDrawingSettings={modalHelpers.handleOpenSettings}
          onDeleteDrawing={drawingActions.handleDeleteDrawing}
          onCloseQuickMenu={drawingInteraction.closeQuickMenu}
        />
      </div>
      
      <FullscreenOscillatorLayout
        selectedOscillators={oscillatorPanel.selectedOscillators}
        poppedOutOscillators={oscillatorPanel.poppedOutOscillators}
        miniOscillators={oscillatorPanel.miniOscillators}
        oscillatorData={oscillatorData}
        candles={candles}
        totalOscillatorHeight={oscillatorPanel.totalHeight}
        onPopout={oscillatorPanel.popoutOscillator}
        onCycleMode={oscillatorPanel.cycleMode}
        totalPercentage={oscillatorPanel.totalPercentage}
        perOscillatorPercentage={oscillatorPanel.perOscillatorPercentage}
        mainChartVisibleRange={mainChartVisibleRange}
        sqzData={sqzData}
        sqzSettings={sqzSettings.settings}
      />
      
      <FullscreenChartModals
        selectedDrawingId={drawingInteraction.selectedDrawingId}
        settingsModalOpen={settingsModalOpen}
        onCloseSettings={modalHelpers.handleCloseSettings}
        selectedDrawingForModal={modalHelpers.selectedDrawingForModal}
        onUpdateDrawing={drawingActions.handleUpdateDrawing}
        showSelectionModal={drawingInteraction.showSelectionModal}
        nearbyDrawings={drawingInteraction.nearbyDrawings}
        onSelectFromModal={drawingInteraction.selectFromModal}
        onCloseSelectionModal={drawingInteraction.closeSelectionModal}
        showEmaSmaModal={showEmaSmaModal}
        onCloseEmaSmaModal={() => setShowEmaSmaModal(false)}
        emaShow={indicators.ema.show}
        emaConfigs={indicators.ema.configs}
        emaInputs={indicators.ema.inputs}
        onEmaToggle={indicators.ema.setShow}
        onEmaConfigsChange={indicators.ema.setConfigs}
        onEmaInputsChange={indicators.ema.setInputs}
        smaShow={indicators.sma.show}
        smaConfigs={indicators.sma.configs}
        onSmaToggle={indicators.sma.setShow}
        onSmaConfigsChange={indicators.sma.setConfigs}
        showOscillatorSelector={oscillatorPanel.showSelector}
        onCloseOscillatorSelector={() => oscillatorPanel.setShowSelector(false)}
        selectedOscillators={oscillatorPanel.selectedOscillators}
        onToggleOscillator={oscillatorPanel.toggleOscillator}
        showSmcModal={showSmcModal}
        onCloseSmcModal={() => setShowSmcModal(false)}
        fvgSettings={fvgSettings.settings}
        onFVGSettingsChange={fvgSettings.setSettings}
        obSettings={obSettings.settings}
        onOBSettingsChange={obSettings.setSettings}
        bosSettings={bosSettings.settings}
        onBOSSettingsChange={bosSettings.setSettings}
        liquiditySettings={liquiditySettings.settings}
        onLiquiditySettingsChange={liquiditySettings.setSettings}
        pdZoneSettings={pdZoneSettings.settings}
        onPDZoneSettingsChange={pdZoneSettings.setSettings}
        showDegreePicker={showDegreePicker}
        onDegreeSelect={elliottWaveController.handleDegreeSelect}
        onCloseDegreePicker={() => setShowDegreePicker(false)}
        showAutoFibModal={showAutoFibModal}
        onCloseAutoFibModal={() => setShowAutoFibModal(false)}
        autoFibSettings={autoFibSettings.settings}
        onAutoFibSettingsChange={autoFibSettings.updateSettings}
        showSuperTrendModal={showSuperTrendModal}
        onCloseSuperTrendModal={() => setShowSuperTrendModal(false)}
        superTrendSettings={superTrendSettings.settings}
        onSuperTrendSettingsChange={superTrendSettings.updateConfig}
      />
    </div>
  );
}

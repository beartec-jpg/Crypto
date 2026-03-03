import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Time, createSeriesMarkers, type ISeriesMarkersPluginApi } from 'lightweight-charts';
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
import { useTradingSystem, type TradingSystemCallbacks } from '@/hooks/useTradingSystem';
import { TRADING_SYSTEMS, type TradingSystemId } from '@/types/tradingSystems';
import { useMultiSystemConfluence, type ConfluenceResult } from '@/hooks/useMultiSystemConfluence';
import { FloatingConfluenceMonitor } from '@/components/tradingSystems/FloatingConfluenceMonitor';
import { DraggableSystemInfoBox } from '@/components/tradingSystems/DraggableSystemInfoBox';
import { ActiveSystemMonitor } from '@/components/tradingSystems/ActiveSystemMonitor';
import { scoreSystem, type ScoringInput } from '@/lib/tradingSystemScoring';
import { AlertSettingsDialog } from '@/components/AlertSettingsDialog';
import { DrawingAlertSettings } from '@/components/modals/DrawingAlertSettings';
import { useGDSMarketMetrics } from '@/hooks/indicators/useGDSMarketMetrics';
import { useGenuineDemandScore } from '@/hooks/indicators/useGenuineDemandScore';
import { GDSMiniBadge } from '@/components/indicators/GDSMiniBadge';

// Types and constants
import type { Drawing, ChartDrawingTool } from '@/types/drawing';
import type { DivergencePoint, MAConfig } from '@/types/chart.types';

interface ChartFullscreenPageProps {
  onClose: () => void;
  initialSymbol: string;
  initialTimeframe: string;
  watchlistTickers: string[];
}

const TOTAL_CONFLUENCE_REFRESH_MS = 2 * 60 * 1000;

// All possible oscillator panel IDs (must match OscillatorSelectorModal)
const ALL_OSCILLATOR_IDS = [
  'rsi', 'macd', 'waddah', 'cmf', 'volume', 'stochRsi', 'tsi',
  'williamsR', 'cci', 'adx', 'obv', 'mfi', 'klinger',
];

function calculateSimpleMovingAverage(
  candles: Array<{ close: number }>,
  endIndex: number,
  period: number,
): number | undefined {
  if (endIndex < period - 1 || period <= 0) return undefined;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    sum += candles[i].close;
  }
  return sum / period;
}

function calculateAverageVolume(
  candles: Array<{ volume: number }>,
  endIndex: number,
  period: number,
): number | undefined {
  if (endIndex < period - 1 || period <= 0) return undefined;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    sum += candles[i].volume;
  }
  return sum / period;
}

function calculateSupportResistance(
  candles: Array<{ low: number; high: number }>,
  endIndex: number,
  lookback = 20,
): { supportLevel?: number; resistanceLevel?: number } {
  if (endIndex < 1) return {};
  const start = Math.max(0, endIndex - lookback + 1);
  let supportLevel = candles[start].low;
  let resistanceLevel = candles[start].high;

  for (let i = start + 1; i <= endIndex; i++) {
    supportLevel = Math.min(supportLevel, candles[i].low);
    resistanceLevel = Math.max(resistanceLevel, candles[i].high);
  }

  return { supportLevel, resistanceLevel };
}

/** Thin adapter: converts the new graduated score to the legacy action+reasons format. */
function evaluateTradingSystemSignal(
  input: ScoringInput & { systemId: TradingSystemId; divergencePoints?: DivergencePoint[] },
) {
  const evaluation = scoreSystem(input.systemId, {
    ...input,
    divergencePoints: input.divergencePoints ?? [],
  });

  const buyThreshold = parseInt(
    localStorage.getItem(`tradingSystem_${input.systemId}_buyThreshold`) || '70',
    10,
  );
  const sellThreshold = parseInt(
    localStorage.getItem(`tradingSystem_${input.systemId}_sellThreshold`) || '70',
    10,
  );

  const action: 'OPEN LONG' | 'OPEN SHORT' | 'WAIT' =
    evaluation.score >= buyThreshold
      ? 'OPEN LONG'
      : evaluation.score <= -sellThreshold
        ? 'OPEN SHORT'
        : 'WAIT';

  const signalReasons =
    evaluation.reasoning && evaluation.reasoning.length > 0
      ? evaluation.reasoning
      : evaluation.conditions.filter(c => c.met).length > 0
        ? evaluation.conditions.filter(c => c.met).slice(0, 3).map(c => c.name)
        : ['No strong confluence yet'];

  return { action, signalReasons, evaluation };
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
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [showEmaSmaModal, setShowEmaSmaModal] = useState(false);
  const [showSmcModal, setShowSmcModal] = useState(false);
  const [showAutoFibModal, setShowAutoFibModal] = useState(false);
  const [showSuperTrendModal, setShowSuperTrendModal] = useState(false);
  const [showVwapModal, setShowVwapModal] = useState(false);
  const [tempDrawing, setTempDrawing] = useState<{ points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null>(null);

  // Incremented whenever the chart pans/zooms so we can recompute the SVG click overlay coords
  const [chartViewVersion, setChartViewVersion] = useState(0);
  // Degree picker state – shown when elliott_wave tool is activated
  const [showDegreePicker, setShowDegreePicker] = useState(false);
  const [selectedWaveDegree, setSelectedWaveDegree] = useState('Minor');
  const [selectedWaveLabel, setSelectedWaveLabel] = useState('1');
  const [selectedWavePatternType, setSelectedWavePatternType] = useState('impulse');

  const [divergenceScannerEnabled, setDivergenceScannerEnabled] = useState(false);
  const [selectedDivergencePoint, setSelectedDivergencePoint] = useState<DivergencePoint | null>(null);
  const [showDivergenceSettings, setShowDivergenceSettings] = useState(false);

  // Squeeze Momentum state
  const [showSqueezeSettings, setShowSqueezeSettings] = useState(false);
  // Volume Profile state
  const [showVPModal, setShowVPModal] = useState(false);
  // Alerts state
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [showDrawingAlertSettings, setShowDrawingAlertSettings] = useState(false);
  const [selectedDrawingForAlerts, setSelectedDrawingForAlerts] = useState<Drawing | null>(null);
  const [confluenceSnapshot, setConfluenceSnapshot] = useState<(ConfluenceResult & { updatedAt: number }) | null>(null);
  const [conditionWeightsVersion, setConditionWeightsVersion] = useState(0);

  const [showFloatingConfluence, setShowFloatingConfluence] = useState(() => {
    try {
      const saved = localStorage.getItem('floatingConfluenceVisible');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [showGdsMiniBadge, setShowGdsMiniBadge] = useState(() => {
    try {
      const saved = localStorage.getItem('gdsMiniBadgeVisible');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const activeToolRef = useRef<ChartDrawingTool>(null);
  const autoColorEnabledRef = useRef(true);
  const onPointCommitRef = useRef<((point: GesturePoint) => void) | null>(null);
  const systemSignalMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const systemSignalMarkerHostSeriesRef = useRef<any>(null);
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

  const {
    externalMetrics: gdsExternalMetrics,
    cvdData: gdsCvdData,
    isLoading: isGdsMetricsLoading,
  } = useGDSMarketMetrics({
    symbol,
    timeframe,
    enabled: chartReady,
  });

  const { gds, latestScore } = useGenuineDemandScore({
    candles,
    cvdData: gdsCvdData,
    externalMetrics: gdsExternalMetrics,
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
  const { structureBreaks, swingPoints, sessionSeparators } = useBOSDetection({
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
  const autoFibVisibleRange = useVisibleRange(chartRef.current);
  const autoFibResult = useAutoFibDetection(candles, autoFibVisibleRange, autoFibSettings.settings);

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

  // Hooks - Trading Systems
  const tradingSystemCallbacks: TradingSystemCallbacks = {
    // Oscillators
    setShowRSI: indicators.rsi.setShow,
    setRSIPeriod: indicators.rsi.setPeriod,
    setShowMACD: indicators.macd.setShow,
    setMACDFast: indicators.macd.setFast,
    setMACDSlow: indicators.macd.setSlow,
    setMACDSignal: indicators.macd.setSignal,
    setShowStochRSI: indicators.stochRSI.setShow,
    setStochRSIPeriod: indicators.stochRSI.setPeriod,
    setShowOBV: indicators.obv.setShow,
    setShowMFI: indicators.mfi.setShow,
    setMFIPeriod: indicators.mfi.setPeriod,
    setShowWilliamsR: indicators.williamsR.setShow,
    setShowCCI: indicators.cci.setShow,
    setShowADX: indicators.adx.setShow,
    setADXPeriod: indicators.adx.setPeriod,
    
    // Chart indicators
    setShowEMA: indicators.ema.setShow,
    setShowBollingerBands: indicators.bb.setShow,
    setBBPeriod: indicators.bb.setPeriod,
    setBBStdDev: indicators.bb.setStdDev,
    setElderImpulseEnabled: indicators.elderImpulse.setShow,
    
    // SMC
    setFVGEnabled: (enabled) => fvgSettings.updateSetting('enabled', enabled),
    setOrderBlocksEnabled: (enabled) => obSettings.updateSetting('enabled', enabled),
    setBreakerBlocksEnabled: (enabled) => bbSettings.updateSetting('enabled', enabled),
    setBOSEnabled: (enabled) => bosSettings.updateSetting('enabled', enabled),
    setLiquidityEnabled: (enabled) => liquiditySettings.updateSetting('enabled', enabled),
    setPDZonesEnabled: (enabled) => pdZoneSettings.updateSetting('enabled', enabled),
    setAutoFibEnabled: (enabled) => autoFibSettings.updateSettings({ enabled }),
    
    // Tools
    setSuperTrendEnabled: (enabled) => {
      // Enable standard SuperTrend by default
      superTrendSettings.updateSettings({ standard: { ...superTrendSettings.settings.standard, enabled } });
    },
    setVolumeProfileEnabled: (enabled) => vpSettings.updateSettings({ enabled }),
    setSqueezeEnabled: (enabled) => sqzSettings.updateSettings({ enabled }),
    setDivergenceScannerEnabled: setDivergenceScannerEnabled,
    setHTFBiasEnabled: (enabled) => htfBiasSettings.updateSetting('enabled', enabled),
    setSessionSeparatorsEnabled: (enabled) => bosSettings.updateSetting('showSessions', enabled),
  };
  
  const tradingSystem = useTradingSystem(tradingSystemCallbacks);

  const historicalSystemSignalEvents = useMemo(() => {
    if (!tradingSystem.activeSystem || candles.length < 3) return [];

    const lookbackCandles = Math.min(400, candles.length - 1);
    const startIndex = Math.max(1, candles.length - lookbackCandles);

    const rsiByTime = new Map<number, number>(oscillatorData.rsi.map(point => [Number(point.time), point.value]));
    const macdByTime = new Map<number, number>(oscillatorData.macd.macd.map(point => [Number(point.time), point.value]));
    const signalByTime = new Map<number, number>(oscillatorData.macd.signal.map(point => [Number(point.time), point.value]));
    const superTrendByTime = new Map<number, 'bullish' | 'bearish'>(
      superTrendData.standard.map(point => [Number(point.time), point.trend])
    );
    const sqzByTime = new Map<number, { sqzOff: boolean; value: number }>(
      sqzData.map(point => [Number(point.time), { sqzOff: point.sqzOff, value: point.value }])
    );

    const htfBullish = htfBiasEntries.filter(entry => entry.bias === 'bullish').length;
    const htfBearish = htfBiasEntries.filter(entry => entry.bias === 'bearish').length;

    const events: Array<{
      time: number;
      action: 'OPEN LONG' | 'OPEN SHORT';
      primaryReason: string;
    }> = [];

    let previousAction: 'OPEN LONG' | 'OPEN SHORT' | 'WAIT' = 'WAIT';
    let lastActivationIndex = -1000;
    const minBarsBetweenActivations =
      tradingSystem.activeSystem === 'volume-profile'
        ? 12
        : tradingSystem.activeSystem === 'smart-money'
          ? 16
          : 4;

    for (let index = startIndex; index < candles.length; index++) {
      const currentCandle = candles[index] as { time: number; close: number };
      const prevCandle = candles[index - 1] as { time: number; close: number };
      const currentCandleWithVolume = candles[index] as { volume?: number; low?: number; high?: number; close: number; time: number };
      const currentTime = Number(currentCandle.time);
      const prevTime = Number(prevCandle.time);
      const avgVolume = calculateAverageVolume(candles as Array<{ volume: number }>, index, 20);
      const shortTermMA = calculateSimpleMovingAverage(candles as Array<{ close: number }>, index, 9);
      const longTermMA = calculateSimpleMovingAverage(candles as Array<{ close: number }>, index, 21);
      const { supportLevel, resistanceLevel } = calculateSupportResistance(
        candles as Array<{ low: number; high: number }>,
        index,
        20,
      );

      let latestStructureDirection: 'bullish' | 'bearish' | undefined;
      for (let breakIndex = structureBreaks.length - 1; breakIndex >= 0; breakIndex--) {
        const structureBreak = structureBreaks[breakIndex];
        if (structureBreak.breakTime <= currentTime) {
          latestStructureDirection = structureBreak.direction;
          break;
        }
      }

      const sqzValue = sqzByTime.get(currentTime);
      const evaluation = evaluateTradingSystemSignal({
        systemId: tradingSystem.activeSystem,
        lastRsi: rsiByTime.get(currentTime),
        prevRsi: rsiByTime.get(prevTime),
        macdNow: macdByTime.get(currentTime),
        macdPrev: macdByTime.get(prevTime),
        sigNow: signalByTime.get(currentTime),
        sigPrev: signalByTime.get(prevTime),
        stTrend: superTrendByTime.get(currentTime),
        latestStructureDirection,
        sqzOff: sqzValue?.sqzOff,
        sqzValue: sqzValue?.value,
        htfBullish,
        htfBearish,
        rsi: rsiByTime.get(currentTime),
        currentPrice: currentCandle.close,
        supportLevel,
        resistanceLevel,
        currentVolume: currentCandleWithVolume.volume,
        avgVolume,
        shortTermMA,
        longTermMA,
        latestClose: currentCandle.close,
        previousClose: prevCandle.close,
        divergencePoints,
        currentTime,
        currentCandleIndex: index,
        structureBreaks,
        fvgs: fvgs.map(fvg => ({ high: fvg.top, low: fvg.bottom, filled: fvg.mitigated, type: fvg.type })),
        orderBlocks: orderBlocks.map(ob => ({ high: ob.top, low: ob.bottom, type: ob.type })),
        liquidityZones: liquidityZones.map(lz => ({ price: lz.price, type: lz.type, swept: lz.swept })),
        volumeProfileData: volumeProfileData
          ? { rows: volumeProfileData.rows.map(r => ({ price: r.price, volume: r.volume })), valueAreaHigh: volumeProfileData.vahPrice, valueAreaLow: volumeProfileData.valPrice, poc: volumeProfileData.poc }
          : undefined,
      });

      if (
        evaluation.action !== 'WAIT' &&
        evaluation.action !== previousAction &&
        index - lastActivationIndex >= minBarsBetweenActivations
      ) {
        events.push({
          time: currentTime,
          action: evaluation.action,
          primaryReason: evaluation.signalReasons[0] ?? 'Confluence confirmed',
        });
        lastActivationIndex = index;
      }

      previousAction = evaluation.action;
    }

    return events.slice(-120);
  }, [
    tradingSystem.activeSystem,
    candles,
    oscillatorData,
    superTrendData.standard,
    structureBreaks,
    sqzData,
    htfBiasEntries,
    conditionWeightsVersion,
    divergencePoints,
    fvgs,
    orderBlocks,
    liquidityZones,
    volumeProfileData,
  ]);

  const historicalSystemSignalMarkers = useMemo(() => {
    return historicalSystemSignalEvents.map(event => ({
      time: event.time as Time,
      position: event.action === 'OPEN LONG' ? 'belowBar' as const : 'aboveBar' as const,
      shape: event.action === 'OPEN LONG' ? 'arrowUp' as const : 'arrowDown' as const,
      color: event.action === 'OPEN LONG' ? '#22c55e' : '#ef4444',
      text: event.action === 'OPEN LONG' ? 'LONG' : 'SHORT',
      size: 2,
    }));
  }, [historicalSystemSignalEvents]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;

    if (!candleSeries || !tradingSystem.activeSystem) {
      systemSignalMarkersRef.current?.setMarkers([]);
      return;
    }

    if (!systemSignalMarkersRef.current || systemSignalMarkerHostSeriesRef.current !== candleSeries) {
      systemSignalMarkersRef.current = createSeriesMarkers(candleSeries, []);
      systemSignalMarkerHostSeriesRef.current = candleSeries;
    }

    systemSignalMarkersRef.current.setMarkers(historicalSystemSignalMarkers);
  }, [tradingSystem.activeSystem, historicalSystemSignalMarkers, candleSeriesRef, chartReady]);

  useEffect(() => {
    return () => {
      systemSignalMarkersRef.current?.setMarkers([]);
      systemSignalMarkersRef.current = null;
      systemSignalMarkerHostSeriesRef.current = null;
    };
  }, []);

  const activeSystemDetails = useMemo(() => {
    if (!tradingSystem.activeSystem || candles.length < 2) return null;

    const system = TRADING_SYSTEMS[tradingSystem.activeSystem];
    if (!system) return null;

    const previousCandle = candles[candles.length - 2] as { open: number; close: number };
    const latestCandle = candles[candles.length - 1] as { time: number; close: number };
    const previousDirection = previousCandle.close >= previousCandle.open ? 'Bullish' : 'Bearish';
    const previousDelta = previousCandle.close - previousCandle.open;

    const lastRsi = oscillatorData.rsi[oscillatorData.rsi.length - 1]?.value;
    const prevRsi = oscillatorData.rsi[oscillatorData.rsi.length - 2]?.value;
    const macdNow = oscillatorData.macd.macd[oscillatorData.macd.macd.length - 1]?.value;
    const macdPrev = oscillatorData.macd.macd[oscillatorData.macd.macd.length - 2]?.value;
    const sigNow = oscillatorData.macd.signal[oscillatorData.macd.signal.length - 1]?.value;
    const sigPrev = oscillatorData.macd.signal[oscillatorData.macd.signal.length - 2]?.value;

    const stLatest = superTrendData.standard[superTrendData.standard.length - 1];
    const stTrend = stLatest?.trend;
    const latestStructureBreak = structureBreaks[structureBreaks.length - 1];
    const latestSqz = sqzData[sqzData.length - 1];
    const avgVolume = calculateAverageVolume(candles as Array<{ volume: number }>, candles.length - 1, 20);
    const shortTermMA = calculateSimpleMovingAverage(candles as Array<{ close: number }>, candles.length - 1, 9);
    const longTermMA = calculateSimpleMovingAverage(candles as Array<{ close: number }>, candles.length - 1, 21);
    const { supportLevel, resistanceLevel } = calculateSupportResistance(
      candles as Array<{ low: number; high: number }>,
      candles.length - 1,
      20,
    );

    const htfBullish = htfBiasEntries.filter(e => e.bias === 'bullish').length;
    const htfBearish = htfBiasEntries.filter(e => e.bias === 'bearish').length;

    const evaluatedSignal = evaluateTradingSystemSignal({
      systemId: tradingSystem.activeSystem,
      lastRsi,
      prevRsi,
      macdNow,
      macdPrev,
      sigNow,
      sigPrev,
      stTrend,
      latestStructureDirection: latestStructureBreak?.direction,
      sqzOff: latestSqz?.sqzOff,
      sqzValue: latestSqz?.value,
      htfBullish,
      htfBearish,
      rsi: lastRsi,
      currentPrice: latestCandle.close,
      supportLevel,
      resistanceLevel,
      currentVolume: (latestCandle as { volume?: number }).volume,
      avgVolume,
      shortTermMA,
      longTermMA,
      latestClose: latestCandle.close,
      previousClose: previousCandle.close,
      divergencePoints,
      currentTime: Number(latestCandle.time),
      currentCandleIndex: candles.length - 1,
      structureBreaks,
      fvgs: fvgs.map(fvg => ({ high: fvg.top, low: fvg.bottom, filled: fvg.mitigated, type: fvg.type })),
      orderBlocks: orderBlocks.map(ob => ({ high: ob.top, low: ob.bottom, type: ob.type })),
      liquidityZones: liquidityZones.map(lz => ({ price: lz.price, type: lz.type, swept: lz.swept })),
      volumeProfileData: volumeProfileData
        ? { rows: volumeProfileData.rows.map(r => ({ price: r.price, volume: r.volume })), valueAreaHigh: volumeProfileData.vahPrice, valueAreaLow: volumeProfileData.valPrice, poc: volumeProfileData.poc }
        : undefined,
    });

    return {
      system,
      previousOpen: previousCandle.open,
      previousClose: previousCandle.close,
      previousDirection,
      previousDelta,
      signals: system.alerts?.entry ?? [],
      signalAction: evaluatedSignal.action,
      signalReasons: evaluatedSignal.signalReasons,
      evaluation: { ...evaluatedSignal.evaluation, timestamp: Date.now() },
      historicalSignalCount: historicalSystemSignalEvents.length,
    };
  }, [
    tradingSystem.activeSystem,
    candles,
    oscillatorData,
    superTrendData,
    structureBreaks,
    sqzData,
    htfBiasEntries,
    conditionWeightsVersion,
    historicalSystemSignalEvents.length,
    divergencePoints,
    fvgs,
    orderBlocks,
    liquidityZones,
    volumeProfileData,
  ]);

  const activeSystemSummary = useMemo(() => {
    if (!tradingSystem.activeSystem) return null;

    const system = TRADING_SYSTEMS[tradingSystem.activeSystem];
    if (!system) return null;

    const buySignals = historicalSystemSignalEvents.filter(e => e.action === 'OPEN LONG').length;
    const sellSignals = historicalSystemSignalEvents.filter(e => e.action === 'OPEN SHORT').length;

    return {
      name: system.name,
      historicalSignalCount: historicalSystemSignalEvents.length,
      buySignals,
      sellSignals,
      lookbackCandles: Math.min(400, Math.max(0, candles.length - 1)),
    };
  }, [tradingSystem.activeSystem, historicalSystemSignalEvents, candles.length]);

  const totalConfluenceNow = useMultiSystemConfluence(
    candles,
    oscillatorData,
    superTrendData,
    structureBreaks,
    sqzData,
    htfBiasEntries,
    divergencePoints,
    fvgs.map(fvg => ({ high: fvg.top, low: fvg.bottom, filled: fvg.mitigated, type: fvg.type })),
    orderBlocks.map(ob => ({ high: ob.top, low: ob.bottom, type: ob.type })),
    liquidityZones.map(lz => ({ price: lz.price, type: lz.type, swept: lz.swept })),
    volumeProfileData
      ? { rows: volumeProfileData.rows.map(r => ({ price: r.price, volume: r.volume })), valueAreaHigh: volumeProfileData.vahPrice, valueAreaLow: volumeProfileData.valPrice, poc: volumeProfileData.poc }
      : undefined,
    conditionWeightsVersion,
    autoFibResult,
  );

  const totalConfluenceNowRef = useRef(totalConfluenceNow);

  useEffect(() => {
    totalConfluenceNowRef.current = totalConfluenceNow;
  }, [totalConfluenceNow]);

  useEffect(() => {
    if (!totalConfluenceNow) {
      setConfluenceSnapshot(null);
      return;
    }

    setConfluenceSnapshot({
      ...totalConfluenceNow,
      updatedAt: Date.now(),
    });
  }, [totalConfluenceNow]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const current = totalConfluenceNowRef.current;
      if (!current) return;

      setConfluenceSnapshot({
        ...current,
        updatedAt: Date.now(),
      });
    }, TOTAL_CONFLUENCE_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('floatingConfluenceVisible', JSON.stringify(showFloatingConfluence));
    } catch {
      // ignore
    }
  }, [showFloatingConfluence]);

  useEffect(() => {
    try {
      localStorage.setItem('gdsMiniBadgeVisible', JSON.stringify(showGdsMiniBadge));
    } catch {
      // ignore
    }
  }, [showGdsMiniBadge]);

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

  const modalHelpers = useFullscreenModalHelpers({
    selectedDrawingId: drawingInteraction.selectedDrawingId,
    drawings,
    setSettingsModalOpen,
  });

  // Drawing alerts handler
  const handleOpenDrawingAlerts = useCallback(() => {
    if (!drawingInteraction.selectedDrawingId) return;
    const drawing = drawings.find(d => d.id === drawingInteraction.selectedDrawingId);
    if (!drawing) return;
    // Add symbol and timeframe to drawing for alert modal
    const drawingWithContext = {
      ...drawing,
      drawingType: drawing.type,
      symbol,
      timeframe,
    };
    setSelectedDrawingForAlerts(drawingWithContext as any);
    setShowDrawingAlertSettings(true);
  }, [drawingInteraction.selectedDrawingId, drawings, symbol, timeframe]);

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

  // --- Indicator Persistence ---

  const saveIndicatorDefaults = useCallback(() => {
    try {
      const key = `indicatorDefaults_${symbol}_${timeframe}`;
      const data = {
        indicators: {
          ema: { show: indicators.ema.show, configs: indicators.ema.configs, inputs: indicators.ema.inputs },
          sma: { show: indicators.sma.show, configs: indicators.sma.configs },
          bb: { show: indicators.bb.show, period: indicators.bb.period, stdDev: indicators.bb.stdDev },
          vwap: {
            showSession: indicators.vwap.showSession,
            showDaily: indicators.vwap.showDaily,
            showWeekly: indicators.vwap.showWeekly,
            showMonthly: indicators.vwap.showMonthly,
            showRolling: indicators.vwap.showRolling,
            rollingPeriod: indicators.vwap.rollingPeriod,
          },
          elderImpulse: { show: indicators.elderImpulse.show },
          rsi: { show: indicators.rsi.show, period: indicators.rsi.period },
          macd: { show: indicators.macd.show, fast: indicators.macd.fast, slow: indicators.macd.slow, signal: indicators.macd.signal },
          stochRSI: { show: indicators.stochRSI.show, period: indicators.stochRSI.period },
          obv: { show: indicators.obv.show },
          mfi: { show: indicators.mfi.show, period: indicators.mfi.period },
          williamsR: { show: indicators.williamsR.show, period: indicators.williamsR.period },
          cci: { show: indicators.cci.show, period: indicators.cci.period },
          adx: { show: indicators.adx.show, period: indicators.adx.period },
        },
        oscillatorPanel: {
          selected: Array.from(oscillatorPanel.selectedOscillators),
        },
        divergenceScannerEnabled,
      };
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`💾 Saved indicator defaults for ${symbol}_${timeframe}`);
    } catch {
      // Ignore storage errors (e.g. quota exceeded)
    }
  }, [
    symbol, timeframe,
    indicators.ema.show, indicators.ema.configs, indicators.ema.inputs,
    indicators.sma.show, indicators.sma.configs,
    indicators.bb.show, indicators.bb.period, indicators.bb.stdDev,
    indicators.vwap.showSession, indicators.vwap.showDaily, indicators.vwap.showWeekly,
    indicators.vwap.showMonthly, indicators.vwap.showRolling, indicators.vwap.rollingPeriod,
    indicators.elderImpulse.show,
    indicators.rsi.show, indicators.rsi.period,
    indicators.macd.show, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal,
    indicators.stochRSI.show, indicators.stochRSI.period,
    indicators.obv.show,
    indicators.mfi.show, indicators.mfi.period,
    indicators.williamsR.show, indicators.williamsR.period,
    indicators.cci.show, indicators.cci.period,
    indicators.adx.show, indicators.adx.period,
    oscillatorPanel.selectedOscillators,
    divergenceScannerEnabled,
  ]);

  const loadIndicatorDefaults = useCallback(() => {
    try {
      const key = `indicatorDefaults_${symbol}_${timeframe}`;
      const saved = localStorage.getItem(key);
      if (!saved) return;

      const data = JSON.parse(saved);
      const ind = data.indicators || {};

      // EMA
      if (ind.ema) {
        if (ind.ema.show !== undefined) indicators.ema.setShow(ind.ema.show);
        if (Array.isArray(ind.ema.configs)) {
          indicators.ema.setConfigs(ind.ema.configs);
          const inputs: Record<string, string> = {};
          ind.ema.configs.forEach((c: MAConfig) => { inputs[c.id] = String(c.period); });
          indicators.ema.setInputs(inputs);
        }
      }

      // SMA
      if (ind.sma) {
        if (ind.sma.show !== undefined) indicators.sma.setShow(ind.sma.show);
        if (Array.isArray(ind.sma.configs)) indicators.sma.setConfigs(ind.sma.configs);
      }

      // Bollinger Bands
      if (ind.bb) {
        if (ind.bb.show !== undefined) indicators.bb.setShow(ind.bb.show);
        if (ind.bb.period !== undefined) { indicators.bb.setPeriod(ind.bb.period); indicators.bb.setPeriodInput(String(ind.bb.period)); }
        if (ind.bb.stdDev !== undefined) { indicators.bb.setStdDev(ind.bb.stdDev); indicators.bb.setStdDevInput(String(ind.bb.stdDev)); }
      }

      // VWAP
      if (ind.vwap) {
        if (ind.vwap.showSession !== undefined) indicators.vwap.setShowSession(ind.vwap.showSession);
        if (ind.vwap.showDaily !== undefined) indicators.vwap.setShowDaily(ind.vwap.showDaily);
        if (ind.vwap.showWeekly !== undefined) indicators.vwap.setShowWeekly(ind.vwap.showWeekly);
        if (ind.vwap.showMonthly !== undefined) indicators.vwap.setShowMonthly(ind.vwap.showMonthly);
        if (ind.vwap.showRolling !== undefined) indicators.vwap.setShowRolling(ind.vwap.showRolling);
        if (ind.vwap.rollingPeriod !== undefined) {
          indicators.vwap.setRollingPeriod(ind.vwap.rollingPeriod);
          indicators.vwap.setRollingPeriodInput(String(ind.vwap.rollingPeriod));
        }
      }

      // Elder Impulse
      if (ind.elderImpulse?.show !== undefined) indicators.elderImpulse.setShow(ind.elderImpulse.show);

      // RSI
      if (ind.rsi) {
        if (ind.rsi.show !== undefined) indicators.rsi.setShow(ind.rsi.show);
        if (ind.rsi.period !== undefined) { indicators.rsi.setPeriod(ind.rsi.period); indicators.rsi.setPeriodInput(String(ind.rsi.period)); }
      }

      // MACD
      if (ind.macd) {
        if (ind.macd.show !== undefined) indicators.macd.setShow(ind.macd.show);
        if (ind.macd.fast !== undefined) { indicators.macd.setFast(ind.macd.fast); indicators.macd.setFastInput(String(ind.macd.fast)); }
        if (ind.macd.slow !== undefined) { indicators.macd.setSlow(ind.macd.slow); indicators.macd.setSlowInput(String(ind.macd.slow)); }
        if (ind.macd.signal !== undefined) { indicators.macd.setSignal(ind.macd.signal); indicators.macd.setSignalInput(String(ind.macd.signal)); }
      }

      // Stochastic RSI
      if (ind.stochRSI) {
        if (ind.stochRSI.show !== undefined) indicators.stochRSI.setShow(ind.stochRSI.show);
        if (ind.stochRSI.period !== undefined) { indicators.stochRSI.setPeriod(ind.stochRSI.period); indicators.stochRSI.setPeriodInput(String(ind.stochRSI.period)); }
      }

      // OBV
      if (ind.obv?.show !== undefined) indicators.obv.setShow(ind.obv.show);

      // MFI
      if (ind.mfi) {
        if (ind.mfi.show !== undefined) indicators.mfi.setShow(ind.mfi.show);
        if (ind.mfi.period !== undefined) { indicators.mfi.setPeriod(ind.mfi.period); indicators.mfi.setPeriodInput(String(ind.mfi.period)); }
      }

      // Williams %R
      if (ind.williamsR) {
        if (ind.williamsR.show !== undefined) indicators.williamsR.setShow(ind.williamsR.show);
        if (ind.williamsR.period !== undefined) { indicators.williamsR.setPeriod(ind.williamsR.period); indicators.williamsR.setPeriodInput(String(ind.williamsR.period)); }
      }

      // CCI
      if (ind.cci) {
        if (ind.cci.show !== undefined) indicators.cci.setShow(ind.cci.show);
        if (ind.cci.period !== undefined) { indicators.cci.setPeriod(ind.cci.period); indicators.cci.setPeriodInput(String(ind.cci.period)); }
      }

      // ADX
      if (ind.adx) {
        if (ind.adx.show !== undefined) indicators.adx.setShow(ind.adx.show);
        if (ind.adx.period !== undefined) { indicators.adx.setPeriod(ind.adx.period); indicators.adx.setPeriodInput(String(ind.adx.period)); }
      }

      // Oscillator panel
      if (Array.isArray(data.oscillatorPanel?.selected)) {
        const savedSet = new Set<string>(data.oscillatorPanel.selected);
        ALL_OSCILLATOR_IDS.forEach(id => {
          oscillatorPanel.toggleOscillator(id, savedSet.has(id));
        });
      }

      // Divergence scanner
      if (data.divergenceScannerEnabled !== undefined) setDivergenceScannerEnabled(data.divergenceScannerEnabled);

      console.log(`📂 Loaded indicator defaults for ${symbol}_${timeframe}`);
    } catch (error) {
      console.error('Failed to load indicator defaults:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setters from useState/useCallback are stable; only re-run when symbol or timeframe changes
  }, [symbol, timeframe]);

  // Load indicator defaults when symbol or timeframe changes
  useEffect(() => {
    loadIndicatorDefaults();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadIndicatorDefaults is stable per symbol+timeframe; avoids double-trigger
  }, [symbol, timeframe]);

  // Auto-save indicator defaults after 500ms of inactivity
  useEffect(() => {
    const timer = setTimeout(saveIndicatorDefaults, 500);
    return () => clearTimeout(timer);
  }, [saveIndicatorDefaults]);

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
        onOpenAlerts={() => setShowAlertSettings(true)}
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
          onOpenVwapSettings={() => setShowVwapModal(true)}
          elderImpulseShow={indicators.elderImpulse.show}
          onElderImpulseToggle={indicators.elderImpulse.setShow}
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
          gdsMiniBadgeEnabled={showGdsMiniBadge}
          onToggleGdsMiniBadge={setShowGdsMiniBadge}
          activeSystem={tradingSystem.activeSystem}
          onActivateSystem={tradingSystem.activateSystem}
          onDeactivateSystem={tradingSystem.deactivateSystem}
          confluenceSnapshot={confluenceSnapshot}
          onToggleFloatingMonitor={() => setShowFloatingConfluence((v: boolean) => !v)}
        />

        <FloatingConfluenceMonitor
          confluenceSnapshot={confluenceSnapshot}
          isVisible={showFloatingConfluence}
          onClose={() => setShowFloatingConfluence(false)}
        />

        {activeSystemSummary && (
          <div className="pointer-events-none select-none absolute top-14 right-2 z-[55] rounded-md border border-blue-700/70 bg-slate-900/95 px-2 py-1 text-[11px] font-semibold text-blue-200 shadow-lg backdrop-blur-sm">
            {activeSystemSummary.historicalSignalCount}/{activeSystemSummary.lookbackCandles}
            {activeSystemSummary.buySignals > 0 || activeSystemSummary.sellSignals > 0 ? (
              <span className="ml-1 font-normal text-slate-400">
                ({activeSystemSummary.buySignals}↑ {activeSystemSummary.sellSignals}↓)
              </span>
            ) : null}
          </div>
        )}

        {showGdsMiniBadge && (
          <GDSMiniBadge score={latestScore} gds={gds} isLoading={isGdsMetricsLoading} />
        )}

        {activeSystemDetails && tradingSystem.activeSystem && (
          <ActiveSystemMonitor
            systemId={tradingSystem.activeSystem}
            evaluation={activeSystemDetails.evaluation}
            onClose={tradingSystem.deactivateSystem}
            onWeightsChanged={() => setConditionWeightsVersion(v => v + 1)}
          />
        )}

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
          elderImpulseEnabled={indicators.elderImpulse.show}
          vwapShowSession={indicators.vwap.showSession}
          vwapShowDaily={indicators.vwap.showDaily}
          vwapShowWeekly={indicators.vwap.showWeekly}
          vwapShowMonthly={indicators.vwap.showMonthly}
          vwapShowRolling={indicators.vwap.showRolling}
          vwapRollingPeriod={indicators.vwap.rollingPeriod}
          fvgs={fvgs}
          fvgSettings={fvgSettings.settings}
          orderBlocks={orderBlocks}
          obSettings={obSettings.settings}
          breakerBlocks={breakerBlocks}
          bbSettings={bbSettings.settings}
          structureBreaks={structureBreaks}
          swingPoints={swingPoints}
          sessionSeparators={sessionSeparators}
          bosSettings={bosSettings.settings}
          liquidityZones={liquidityZones}
          liquiditySettings={liquiditySettings.settings}
          pdZones={pdZones}
          pdZoneSettings={pdZoneSettings.settings}
          autoFibResult={autoFibResult}
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
          onOpenDrawingAlerts={handleOpenDrawingAlerts}
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
        showVwapModal={showVwapModal}
        onCloseVwapModal={() => setShowVwapModal(false)}
        vwapState={indicators.vwap}
      />
      
      <AlertSettingsDialog 
        open={showAlertSettings} 
        onOpenChange={setShowAlertSettings} 
      />

      {selectedDrawingForAlerts && (
        <DrawingAlertSettings
          isOpen={showDrawingAlertSettings}
          onClose={() => {
            setShowDrawingAlertSettings(false);
            setSelectedDrawingForAlerts(null);
          }}
          drawing={selectedDrawingForAlerts}
          onUpdate={drawingActions.handleUpdateDrawing}
        />
      )}
    </div>
  );
}

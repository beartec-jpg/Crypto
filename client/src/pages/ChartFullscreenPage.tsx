import { useState, useEffect, useRef, useCallback, useMemo, type MouseEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createSeriesMarkers, type ISeriesMarkersPluginApi, Time } from 'lightweight-charts';
import { queryClient } from '@/lib/queryClient';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { useToast } from '@/hooks/use-toast';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';
import { calcRetracementLevels } from '@/lib/elliottWave/fibCalculator';

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
import { PoppedOutOscillators } from '@/components/oscillators/PoppedOutOscillators';
import { ChartLoadingOverlay } from '@/components/chart/ChartLoadingOverlay';
import { MiniOscillatorSection } from '@/components/oscillators/MiniOscillatorSection';

import { Button } from '@/components/ui/button';
import { EmaSmaModal } from '@/components/indicators';
import { SMCSettingsModal } from '@/components/modals/SMCSettingsModal';
import { FVGRenderer } from '@/components/indicators/FVGRenderer';
import { OrderBlockRenderer } from '@/components/indicators/OrderBlockRenderer';
import { BOSRenderer } from '@/components/indicators/BOSRenderer';
import { LiquidityRenderer } from '@/components/indicators/LiquidityRenderer';
import { PDZoneRenderer } from '@/components/indicators/PDZoneRenderer';
import { useFVGSettings } from '@/hooks/useFVGSettings';
import { useFVGDetection } from '@/hooks/useFVGDetection';
import { useOrderBlockSettings } from '@/hooks/useOrderBlockSettings';
import { useOrderBlockDetection } from '@/hooks/useOrderBlockDetection';
import { useBOSSettings } from '@/hooks/useBOSSettings';
import { useBOSDetection } from '@/hooks/useBOSDetection';
import { useLiquiditySettings } from '@/hooks/useLiquiditySettings';
import { useLiquidityDetection } from '@/hooks/useLiquidityDetection';
import { usePDZoneSettings } from '@/hooks/usePDZoneSettings';
import { usePDZoneDetection } from '@/hooks/usePDZoneDetection';
import { DrawingMenu } from '@/components/drawings/DrawingMenu';
import { DrawingRenderer } from '@/components/drawings/DrawingRenderer';
import { DrawingQuickMenu } from '@/components/drawings/DrawingQuickMenu';
import { DrawingSettingsModal } from '@/components/modals/DrawingSettingsModal';
import { DrawingSelectionModal } from '@/components/drawings/DrawingSelectionModal';
import { MovingAverages } from '@/components/chart/MovingAverages';
import { calculateEMA } from '@/lib/indicators';
import { OscillatorSelectorModal } from '@/components/modals/OscillatorSelectorModal';
import { DockedOscillatorSection } from '@/components/oscillators/DockedOscillatorSection';
import { IndicatorMenu } from '@/components/indicators/IndicatorMenu';
import { ToolsMenu } from '@/components/tools/ToolsMenu';
import { DivergenceRenderer } from '@/components/divergence/DivergenceRenderer';
import { DivergenceBadgePopup } from '@/components/divergence/DivergenceBadgePopup';
import { useDivergenceScanner } from '@/hooks/useDivergenceScanner';
import { DEFAULT_OSCILLATOR_CONFIG } from '@/lib/calculations/divergenceCalculations';
import { PredictiveFibRenderer } from '@/components/elliottWave/PredictiveFibRenderer';
import { ElliottWavePrimitive } from '@/components/chart/primitives/ElliottWavePrimitive';
import { DegreePicker, getDegreeConfiguration } from '@/components/elliottWave/DegreePicker';

// Types and constants
import type { Drawing, ChartDrawingTool } from '@/types/drawing';
import type { DivergencePoint } from '@/types/chart.types';
import {
  TOP_TOOLBAR_HEIGHT,
} from '@/lib/constants/layout';
import { generateFutureWhitespace, FUTURE_BAR_COUNT } from '@/lib/chart/timeUtils';

/** Shape of a projection line returned from /api/crypto/projection-lines */
interface ProjectionLine {
  id: string;
  structureId: string;
  levelLabel: string;
  price: number;
  waveType: string;
  color: string;
}

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

/** Normalize a degree-specific wave label to its canonical position (1-5, A-C, W-Z) */
function getCanonicalWavePosition(label: string): string | null {
  // All impulse position labels across all degrees
  const pos1 = ['1', '(1)', 'I', '(I)', 'i', '(i)'];
  const pos2 = ['2', '(2)', 'II', '(II)', 'ii', '(ii)'];
  const pos3 = ['3', '(3)', 'III', '(III)', 'iii', '(iii)'];
  const pos4 = ['4', '(4)', 'IV', '(IV)', 'iv', '(iv)'];
  const pos5 = ['5', '(5)', 'V', '(V)', 'v', '(v)'];
  // Correction labels
  const posA = ['A', '(A)', 'a', '(a)'];
  const posB = ['B', '(B)', 'b', '(b)'];
  const posC = ['C', '(C)', 'c', '(c)'];

  if (pos1.includes(label)) return '1';
  if (pos2.includes(label)) return '2';
  if (pos3.includes(label)) return '3';
  if (pos4.includes(label)) return '4';
  if (pos5.includes(label)) return '5';
  if (posA.includes(label)) return 'A';
  if (posB.includes(label)) return 'B';
  if (posC.includes(label)) return 'C';
  return null;
}

/** Calculate future prediction fib levels based on the completed wave label */
const calculateFuturePredictions = (
  wave: { points: { price: number; time?: number }[]; style?: { waveLabel?: string; waveType?: string } },
  candleInterval: number = 3600,
): FibLevel[] => {
  const waveLabel = wave.style?.waveLabel;
  const waveType = wave.style?.waveType ?? 'impulse';
  const points = wave.points;
  if (!waveLabel || points.length < 2) return [];

  const canonicalPos = getCanonicalWavePosition(waveLabel);
  if (!canonicalPos) return [];

  const startPrice = points[0].price;
  const endPrice = points[points.length - 1].price;
  const lastPoint = points[points.length - 1];
  const lastTime = typeof lastPoint.time === 'number' ? lastPoint.time : undefined;
  const endTime = lastTime !== undefined ? lastTime + 4 * candleInterval : undefined;
  const lineRange = lastTime !== undefined ? { startTime: lastTime, endTime } : {};

  // Wave 2 complete → show Wave 3 extension targets
  // W3 extends from W2 end in the direction opposite to W2 (continuing the parent trend)
  if (canonicalPos === '2') {
    const refLen = Math.abs(endPrice - startPrice); // W2 total span as reference
    // If W2 went down (endPrice < startPrice), W3 goes up; if W2 went up, W3 goes down
    const direction = endPrice < startPrice ? 1 : -1;
    const w3Ratios = ['leading_diagonal', 'ending_diagonal'].includes(waveType)
      ? [0.618, 0.786, 1.0]
      : [1.618, 2.0, 2.618];
    return w3Ratios.map(ratio => ({
      ratio,
      price: endPrice + direction * refLen * ratio,
      label: `W3 ${(ratio * 100).toFixed(1)}%`,
      isRetrace: false,
      color: '#22c55e',
      ...lineRange,
    }));
  }

  // Wave 3 complete → show Wave 4 retracement levels
  if (canonicalPos === '3') {
    // W4 retraces the full W3 move (startPrice to endPrice)
    const levels = calcRetracementLevels(startPrice, endPrice, [0.236, 0.382, 0.5, 0.618]);
    return levels.map(l => ({ ...l, label: `W4: ${(l.ratio * 100).toFixed(1)}%`, ...lineRange }));
  }

  // Wave 4 complete → show Wave 5 extension targets
  // W5 extends from W4 end in the direction opposite to W4 (continuing the parent trend)
  if (canonicalPos === '4') {
    const refLen = Math.abs(endPrice - startPrice); // W4 total span as reference
    // If W4 went down (endPrice < startPrice), W5 goes up; if W4 went up, W5 goes down
    const direction = endPrice < startPrice ? 1 : -1;
    const w5Ratios = ['leading_diagonal', 'ending_diagonal'].includes(waveType)
      ? [0.618, 1.0]
      : [0.618, 1.0, 1.618];
    return w5Ratios.map(ratio => ({
      ratio,
      price: endPrice + direction * refLen * ratio,
      label: `W5 ${(ratio * 100).toFixed(1)}%`,
      isRetrace: false,
      color: '#22c55e',
      ...lineRange,
    }));
  }

  // Wave 5 complete → show next correction (Wave A) target levels
  if (canonicalPos === '5') {
    const levels = calcRetracementLevels(startPrice, endPrice, [0.382, 0.5, 0.618, 1.0]);
    return levels.map(l => ({ ...l, label: `WA: ${(l.ratio * 100).toFixed(1)}%`, ...lineRange }));
  }

  // Wave A complete → show Wave B retracement levels
  if (canonicalPos === 'A') {
    const isFlatType = waveType === 'flat';
    const bRatios = isFlatType ? [0.9, 1.0, 1.382] : [0.382, 0.5, 0.618, 0.786];
    const levels = calcRetracementLevels(startPrice, endPrice, bRatios);
    return levels.map(l => ({ ...l, label: `WB: ${(l.ratio * 100).toFixed(1)}%`, ...lineRange }));
  }

  // Wave B complete → show Wave C extension targets
  // C travels in the SAME direction as Wave A, which is OPPOSITE to Wave B
  if (canonicalPos === 'B') {
    const refLen = Math.abs(endPrice - startPrice); // Wave B span as reference for Wave C
    // C direction = opposite to B direction (same as A direction)
    const correctionDirection = endPrice > startPrice ? -1 : 1;
    const cRatios = waveType === 'flat' ? [0.618, 1.0, 1.618] : [1.0, 1.272, 1.618];
    return cRatios.map(ratio => ({
      ratio,
      price: endPrice + correctionDirection * refLen * ratio,
      label: `WC: ${(ratio * 100).toFixed(1)}%`,
      isRetrace: false,
      color: '#fb923c',
      ...lineRange,
    }));
  }

  // Wave C complete → show next impulse targets (recovery)
  if (canonicalPos === 'C') {
    const totalCorrLen = Math.abs(endPrice - points[0].price);
    const direction = endPrice < points[0].price ? 1 : -1; // Recovery after correction
    return [0.618, 1.0, 1.618].map(ratio => ({
      ratio,
      price: endPrice + direction * totalCorrLen * ratio,
      label: `Next: ${(ratio * 100).toFixed(1)}%`,
      isRetrace: false,
      color: '#22c55e',
      ...lineRange,
    }));
  }

  return [];
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
  const [tempDrawing, setTempDrawing] = useState<{ points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null>(null);

  // Wave selection state – track which saved EW wave is selected and its fib projections
  const [selectedWaveId, setSelectedWaveId] = useState<string | null>(null);
  const [selectedWaveFibs, setSelectedWaveFibs] = useState<FibLevel[]>([]);
  // Future prediction lines – shown for Wave 3/5/A completions
  const [futurePredictionLines, setFuturePredictionLines] = useState<FibLevel[]>([]);
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

  // Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const activeToolRef = useRef<ChartDrawingTool>(null);
  const autoColorEnabledRef = useRef(autoColorEnabled);
  const onPointCommitRef = useRef<((point: GesturePoint) => void) | null>(null);
  const isInitialDataLoad = useRef(true);
  const seriesMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  // Ref for live Elliott Wave trendline primitive (shown while drawing/complete)
  const liveEWPrimitiveRef = useRef<ElliottWavePrimitive | null>(null);
  // Ref for saved Elliott Wave trendline primitives (rendered on reload)
  const savedEWPrimitivesRef = useRef<Map<string, ElliottWavePrimitive>>(new Map());

  // Hooks - Elliott Wave tool
  const elliottWave = useElliottWave();
  // Ref to access latest elliottWave state inside stable event handlers
  const elliottWaveRef = useRef(elliottWave);
  elliottWaveRef.current = elliottWave;

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

  // Hooks - Divergence Scanner
  const divergencePoints = useDivergenceScanner(candles, DEFAULT_OSCILLATOR_CONFIG);

  // Hooks - HTF data cache
  const { htfDataCache } = useHTFDataCache({
    symbol,
    currentTimeframe: timeframe,
    emaConfigs: indicators.ema.configs,
    enabled: indicators.ema.show,
  });

  // Hooks - Drawing persistence
  const drawingsPersistence = useDrawingsPersistence(symbol, timeframe);

  // Hooks - Toast notifications
  const { toast } = useToast();

  // ── Elliott Wave persistence ────────────────────────────────────────────────

  // Load saved EW wave labels from elliott_wave_labels table
  const { data: ewLabels = [] } = useQuery<any[]>({
    queryKey: ['/api/crypto/elliott-wave/labels', symbol, timeframe],
    queryFn: async () => {
      const res = await authenticatedApiRequest(
        'GET',
        `/api/crypto/elliott-wave/labels?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      );
      return res.json();
    },
  });

  // Save EW wave label
  const saveEWLabelMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authenticatedApiRequest('POST', '/api/crypto/elliott-wave/labels', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Wave saved', description: 'Elliott Wave saved successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/elliott-wave/labels', symbol, timeframe] });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to save wave', description: err?.message, variant: 'destructive' });
    },
  });

  // Delete EW wave label
  const deleteEWLabelMutation = useMutation({
    mutationFn: async (id: string) => {
      await authenticatedApiRequest('DELETE', `/api/crypto/elliott-wave/labels/${id}`);
    },
    onSuccess: () => {
      toast({ title: 'Wave deleted successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/elliott-wave/labels', symbol, timeframe] });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete wave', description: err?.message, variant: 'destructive' });
    },
  });

  // Hooks - Drawing interaction
  const drawingInteraction = useDrawingInteraction({
    chartRef,
    candleSeriesRef,
    containerRef: chartContainerRef,
    drawings,
    activeTool,
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

  // Update chart with candle data
  useEffect(() => {
    if (candleSeriesRef.current && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const futureBars = generateFutureWhitespace(lastCandle.time as number, timeframe, FUTURE_BAR_COUNT);
      const chartData = [
        ...candles.map(c => ({ ...c, time: c.time as Time })),
        ...(futureBars as any[]),
      ];
      if (isInitialDataLoad.current) {
        // First load: set data, add future whitespace, and fit content
        candleSeriesRef.current.setData(chartData);
        fitContent(candles.length);
        chartRef.current?.timeScale().applyOptions({ rightOffset: 50 });
        isInitialDataLoad.current = false;
      } else {
        // Subsequent updates: preserve the visible range
        const currentRange = chartRef.current?.timeScale().getVisibleRange();
        candleSeriesRef.current.setData(chartData);
        if (currentRange) {
          try {
            chartRef.current?.timeScale().setVisibleRange(currentRange);
          } catch (e) { /* ignore if range is now invalid */ }
        }
      }
    }
  }, [candles, candleSeriesRef, fitContent, timeframe]);

  // Attach click handlers
  useEffect(() => {
    const chartElement = chartContainerRef.current;
    if (!chartElement) return;
    
    chartElement.addEventListener('click', drawingInteraction.handleChartClick as EventListener);
    chartElement.addEventListener('touchstart', drawingInteraction.handleChartClick as EventListener, { passive: true });
    chartElement.addEventListener('touchend', drawingInteraction.handleTouchEnd as EventListener);
    
    return () => {
      chartElement.removeEventListener('click', drawingInteraction.handleChartClick as EventListener);
      chartElement.removeEventListener('touchstart', drawingInteraction.handleChartClick as EventListener);
      chartElement.removeEventListener('touchend', drawingInteraction.handleTouchEnd as EventListener);
    };
  }, [drawingInteraction.handleChartClick, drawingInteraction.handleTouchEnd]);

  // Attach gesture controller
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !chartContainerRef.current) return;
    gestureController.attachToChart(chartRef.current, candleSeriesRef.current, chartContainerRef.current);
    return () => gestureController.detachFromChart();
  }, [gestureController, chartRef, candleSeriesRef]);

  // Load drawings from persistence (regular drawings + saved EW wave labels)
  useEffect(() => {
    const regularDrawings = (drawingsPersistence.drawings ?? [])
      .map((d: any): Drawing | null => {
        try {
          if (!d.id) return null;
          // Skip any legacy EW drawings saved to chart_drawings – use ewLabels instead
          const drawingType = d.drawingType || d.drawing_type || d.tool || 'trendline';
          if (drawingType === 'elliott_wave') return null;
          return {
            id: d.id,
            type: drawingType,
            points: d.coordinates?.points || d.points || [],
            style: { color: d.style?.color || '#3b82f6', lineWidth: d.style?.lineWidth || 2, ...d.style },
          };
        } catch (e) { return null; }
      })
      .filter((d): d is Drawing => d !== null && d.points.length > 0);

    const ewDrawings: Drawing[] = (ewLabels ?? [])
      .filter((label: any) => Array.isArray(label.points) && label.points.length > 0)
      .map((label: any): Drawing => ({
        id: label.id,
        type: 'elliott_wave',
        points: label.points.map((p: any) => ({
          time: p.time,
          price: p.price,
          label: p.label,
          isMidAir: p.isMidAir ?? false,
          snapType: p.snapType ?? 'high',
        })),
        style: {
          color: label.metadata?.impulseColor ?? label.metadata?.color ?? '#00CED1',
          lineWidth: 2,
          waveType: label.patternType ?? label.pattern_type ?? 'EW',
          degreeLabel: label.metadata?.degreeLabel ?? label.degree ?? 'Minor',
          waveLabel: label.metadata?.waveLabel ?? '',
          impulseColor: label.metadata?.impulseColor ?? label.metadata?.color ?? '#00CED1',
          zigzagColor: label.metadata?.zigzagColor ?? '#808080',
          showLabel: label.metadata?.showLabel ?? true,
          fontSize: label.metadata?.fontSize ?? '12px',
          showFuturePredictions: label.metadata?.showFuturePredictions ?? true,
        },
      }));

    setDrawings([...regularDrawings, ...ewDrawings]);
  }, [drawingsPersistence.drawings, ewLabels]);

  // Reset initial load flag when symbol/timeframe changes
  useEffect(() => {
    isInitialDataLoad.current = true;
  }, [symbol, timeframe]);

  // Update refs
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { autoColorEnabledRef.current = autoColorEnabled; }, [autoColorEnabled]);

  // Handlers
  const handleSelectTool = useCallback((tool: ChartDrawingTool) => {
    // Toggle Elliott Wave mode when selecting/deselecting the tool
    if (activeTool === 'elliott_wave' && tool !== 'elliott_wave') {
      elliottWave.deactivateMode();
    }
    if (tool === 'elliott_wave' && activeTool !== 'elliott_wave') {
      // Show degree picker first before activating
      setShowDegreePicker(true);
      return;
    }
    // Deselect any selected wave when activating a drawing tool
    setSelectedWaveId(null);
    setSelectedWaveFibs([]);
    setActiveTool(tool);
    activeToolRef.current = tool;
  }, [activeTool, elliottWave]);

  const handleDegreeSelect = useCallback((degree: string, waveLabel: string, patternType: string) => {
    setSelectedWaveDegree(degree);
    setSelectedWaveLabel(waveLabel);
    setSelectedWavePatternType(patternType);
    setShowDegreePicker(false);
    setSelectedWaveId(null);
    setSelectedWaveFibs([]);
    elliottWave.activateMode(patternType, degree, waveLabel);
    setActiveTool('elliott_wave');
    activeToolRef.current = 'elliott_wave';
  }, [elliottWave]);

  const handleOpenSettings = useCallback(() => setSettingsModalOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsModalOpen(false), []);

  const handleDeleteDrawing = useCallback(() => {
    const id = drawingInteraction.selectedDrawingId;
    if (!id) return;
    const drawing = drawings.find(d => d.id === id);
    if (drawing?.type === 'elliott_wave') {
      // EW drawings are stored in elliott_wave_labels, not chart_drawings
      deleteEWLabelMutation.mutate(id);
      setDrawings(prev => prev.filter(d => d.id !== id));
    } else {
      drawingsPersistence.deleteDrawing(id);
      setDrawings(prev => prev.filter(d => d.id !== id));
    }
    drawingInteraction.setSelectedDrawingId(null);
  }, [drawingInteraction, drawings, drawingsPersistence, deleteEWLabelMutation]);

  const handleUpdateDrawing = useCallback((updates: { style: Partial<Drawing['style']> }) => {
    const selectedId = drawingInteraction.selectedDrawingId;
    if (!selectedId || selectedId.startsWith('drawing-')) return;
    const drawing = drawings.find(d => d.id === selectedId);
    setDrawings(prev => prev.map(d => d.id === selectedId ? { ...d, style: { ...d.style, ...updates.style } } : d));
    if (drawing?.type === 'elliott_wave') {
      // EW waves live in elliott_wave_labels, not chart_drawings – use the EW-specific endpoint
      authenticatedApiRequest('PATCH', `/api/crypto/elliott-wave/labels/${selectedId}`, { metadata: updates.style })
        .catch(err => console.warn('[EW] Failed to update wave style:', err));
    } else {
      drawingsPersistence.updateDrawing({ id: selectedId, updates: { style: updates.style } });
    }
  }, [drawingInteraction.selectedDrawingId, drawings, drawingsPersistence]);

  // Elliott Wave: click on a saved wave to show its fibonacci projections
  const handleWaveClick = useCallback(async (waveId: string, e: MouseEvent) => {
    console.log('[DEBUG] Wave clicked:', waveId, 'at', e.clientX, e.clientY);
    e.stopPropagation();

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }

    console.log('[DEBUG] Selected wave ID before:', selectedWaveId);
    console.log('[DEBUG] Setting drawing interaction...');

    // Toggle: clicking the same wave deselects it
    if (selectedWaveId === waveId) {
      setSelectedWaveId(null);
      setSelectedWaveFibs([]);
      drawingInteraction.setSelectedDrawingId(null);
      console.log('[DEBUG] Deselected wave');
      return;
    }

    // Integrate with drawing interaction system for quick menu (settings/delete)
    drawingInteraction.setSelectedDrawingId(waveId);
    drawingInteraction.setQuickMenuPosition({ x: e.clientX, y: e.clientY });
    console.log('[DEBUG] Quick menu position set:', { x: e.clientX, y: e.clientY });

    setSelectedWaveId(waveId);
    setSelectedWaveFibs([]);

    // Calculate fib retracement levels from the wave's own points
    const wave = drawings.find(d => d.id === waveId);
    if (wave && wave.points.length >= 2) {
      const startPrice = wave.points[0].price;
      const endPrice = wave.points[wave.points.length - 1].price;
      const fibs = calcRetracementLevels(startPrice, endPrice, [0.236, 0.382, 0.5, 0.618, 0.786]);
      setSelectedWaveFibs(fibs);
    }

    // Also try to fetch stored projection lines from the API (may supplement the above)
    try {
      const res = await authenticatedApiRequest(
        'GET',
        `/api/crypto/projection-lines?structureId=${encodeURIComponent(waveId)}`,
      );
      const projections: ProjectionLine[] = await res.json();
      if (projections.length > 0) {
        const fibs: FibLevel[] = projections.map(proj => {
          // Parse ratio from label like "W3 100%" or "C 127.2%"
          const match = proj.levelLabel?.match(/([\d.]+)%/);
          const ratio = match ? parseFloat(match[1]) / 100 : 1;
          return {
            ratio,
            price: proj.price,
            label: proj.levelLabel ?? `${(ratio * 100).toFixed(1)}%`,
            isRetrace: false,
          };
        });
        setSelectedWaveFibs(fibs);
      }
    } catch (err) {
      console.warn('[EW] Failed to fetch projection lines:', err);
    }
  }, [selectedWaveId, drawingInteraction, drawings]);

  // Deselect wave when drawing tool is activated or chart area is clicked without a wave
  const handleDeselect = useCallback(() => {
    if (selectedWaveId) {
      setSelectedWaveId(null);
      setSelectedWaveFibs([]);
    }
  }, [selectedWaveId]);

  // Compute future prediction lines for ALL saved waves whenever drawings or candles change
  useEffect(() => {
    const candleInterval =
      candles.length >= 2 ? Math.abs((candles[1].time as number) - (candles[0].time as number)) : 3600;
    const allPredictions: FibLevel[] = [];
    for (const drawing of drawings.filter(d => d.type === 'elliott_wave')) {
      // Respect per-wave showFuturePredictions setting (defaults to true)
      if ((drawing.style as any)?.showFuturePredictions !== false) {
        allPredictions.push(...calculateFuturePredictions(drawing, candleInterval));
      }
    }
    setFuturePredictionLines(allPredictions);
  }, [drawings, candles]);

  // Elliott Wave: save the drawn wave to elliott_wave_labels table
  const handleElliottWaveSave = useCallback(() => {
    if (!elliottWave.canSave) return;
    const degreeConfig = getDegreeConfiguration(selectedWaveDegree);
    saveEWLabelMutation.mutate({
      symbol,
      timeframe,
      degree: selectedWaveDegree.toLowerCase().replace(/\s+/g, '_'),
      patternType: selectedWavePatternType,
      points: elliottWave.points.map(p => ({
        time: p.time,
        price: p.price,
        label: p.label,
        isMidAir: p.isMidAir ?? false,
        snapType: p.snapType ?? 'none',
      })),
      isComplete: true,
      metadata: {
        waveType: selectedWavePatternType,
        color: degreeConfig.impulse.color,
        degreeLabel: selectedWaveDegree,
        waveLabel: selectedWaveLabel,
        impulseColor: degreeConfig.impulse.color,
        zigzagColor: degreeConfig.correction.color,
      },
    });
    elliottWave.deactivateMode();
    setActiveTool(null);
    activeToolRef.current = null;
  }, [elliottWave, symbol, timeframe, saveEWLabelMutation, selectedWaveDegree, selectedWaveLabel, selectedWavePatternType]);

  // Elliott Wave: render placed points as series markers
  useEffect(() => {
    if (!candleSeriesRef.current || !elliottWave.isActive) {
      seriesMarkersRef.current?.setMarkers([]);
      return;
    }
    const points = elliottWave.points;
    if (points.length === 0) {
      seriesMarkersRef.current?.setMarkers([]);
      return;
    }
    if (!seriesMarkersRef.current) {
      seriesMarkersRef.current = createSeriesMarkers(candleSeriesRef.current, []);
    }
    if (candles.length === 0) {
      seriesMarkersRef.current.setMarkers([]);
      return;
    }
    const lastCandleTime = candles[candles.length - 1].time as number;
    const markers = points
      .filter(point => (point.time as number) <= lastCandleTime)
      .map(point => ({
        time: point.time as Time,
        position: 'aboveBar' as 'aboveBar' | 'belowBar',
        color: '#00CED1',
        shape: 'circle' as const,
        size: 2,
      }));
    seriesMarkersRef.current.setMarkers(markers);
    return () => {
      seriesMarkersRef.current?.setMarkers([]);
    };
  }, [elliottWave.points, elliottWave.isActive, candles]);

  // Elliott Wave: render live trendline when wave is drawing or complete
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const points = elliottWave.points;
    const lastCandleTime = candles.length > 0 ? (candles[candles.length - 1].time as number) : undefined;
    const candleInterval = candles.length >= 2 ? (candles[1].time as number) - (candles[0].time as number) : 3600;

    if ((elliottWave.isDrawing || elliottWave.isComplete) && points.length >= 2) {
      const degreeConfig = getDegreeConfiguration(selectedWaveDegree);
      const data = {
        points: points.map(p => ({ time: p.time, price: p.price, label: p.label })),
        waveType: 'impulse',
        color: degreeConfig.impulse.color,
        showPointLabels: true,
        lastCandleTime,
        candleInterval,
        barCount: candles.length,
      };
      if (liveEWPrimitiveRef.current) {
        liveEWPrimitiveRef.current.update(data);
      } else {
        const primitive = new ElliottWavePrimitive(data);
        try {
          series.attachPrimitive(primitive);
          liveEWPrimitiveRef.current = primitive;
        } catch (e) {
          console.error('[EW] Failed to attach live trendline:', e);
        }
      }
    } else {
      if (liveEWPrimitiveRef.current) {
        try { series.detachPrimitive(liveEWPrimitiveRef.current); } catch (e) {
          console.error('[EW] Failed to detach live trendline:', e);
        }
        liveEWPrimitiveRef.current = null;
      }
    }

    return () => {
      if (liveEWPrimitiveRef.current && series) {
        try { series.detachPrimitive(liveEWPrimitiveRef.current); } catch (e) {
          console.error('[EW] Failed to detach live trendline on cleanup:', e);
        }
        liveEWPrimitiveRef.current = null;
      }
    };
  }, [elliottWave.isDrawing, elliottWave.isComplete, elliottWave.points, candleSeriesRef, candles, selectedWaveDegree]);

  // Elliott Wave: auto-save the wave immediately when all points are placed and valid
  useEffect(() => {
    if (elliottWave.isComplete && elliottWave.isValid) {
      handleElliottWaveSave();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elliottWave.isComplete, elliottWave.isValid]);

  // Elliott Wave: render saved elliott_wave drawings as markers + trendlines on reload
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const ewDrawings = drawings.filter(d => d.type === 'elliott_wave');
    const currentIds = new Set(ewDrawings.map(d => d.id));

    // Detach primitives for removed drawings
    savedEWPrimitivesRef.current.forEach((primitive, id) => {
      if (!currentIds.has(id)) {
        try { series.detachPrimitive(primitive); } catch (e) {
          console.error('[EW] Failed to detach saved trendline:', e);
        }
        savedEWPrimitivesRef.current.delete(id);
      }
    });

    // Add/update primitives for current EW drawings
    for (const drawing of ewDrawings) {
      if (drawing.points.length < 2) continue;
      const waveType = drawing.style?.waveType ?? 'EW';
      const color = drawing.style?.color ?? '#00CED1';
      const lastCandleTime = candles.length > 0 ? (candles[candles.length - 1].time as number) : undefined;
      const candleInterval = candles.length >= 2 ? (candles[1].time as number) - (candles[0].time as number) : 3600;
      const data = {
        points: drawing.points.map(p => ({
          time: p.time,
          price: p.price,
          label: p.label,
          isMidAir: p.isMidAir,
        })),
        waveType,
        color,
        showPointLabels: false,
        lastCandleTime,
        candleInterval,
        barCount: candles.length,
        isSelected: drawing.id === selectedWaveId,
      };

      const existing = savedEWPrimitivesRef.current.get(drawing.id);
      if (existing) {
        existing.update(data);
      } else {
        const primitive = new ElliottWavePrimitive(data);
        try {
          series.attachPrimitive(primitive);
          savedEWPrimitivesRef.current.set(drawing.id, primitive);
        } catch (e) {
          console.error('[EW] Failed to attach saved trendline:', e);
        }
      }
    }

    return () => {
      savedEWPrimitivesRef.current.forEach((primitive) => {
        try { series.detachPrimitive(primitive); } catch (e) {
          console.error('[EW] Failed to detach saved trendline on cleanup:', e);
        }
      });
      savedEWPrimitivesRef.current.clear();
    };
  }, [drawings, candleSeriesRef, candles]);

  // Elliott Wave: expand viewport to show future points in saved drawings
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;
    const ewDrawings = drawings.filter(d => d.type === 'elliott_wave');
    const lastCandleTime = candles[candles.length - 1].time as number;
    let maxFutureTime = lastCandleTime;
    for (const drawing of ewDrawings) {
      for (const point of drawing.points) {
        if ((point.time as number) > maxFutureTime) {
          maxFutureTime = point.time as number;
        }
      }
    }
    if (maxFutureTime > lastCandleTime) {
      const timeScale = chartRef.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange && maxFutureTime > (visibleRange.to as number)) {
        timeScale.setVisibleRange({
          from: visibleRange.from,
          to: maxFutureTime as Time,
        });
      }
    }
  }, [drawings, candles]);

  // Elliott Wave: keyboard shortcuts (Backspace=undo, Escape=deactivate)
  useEffect(() => {
    if (!elliottWave.isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const ew = elliottWaveRef.current;
      // Backspace/Delete = undo last point while drawing
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.shiftKey) {
        if (ew.canUndo) {
          ew.undo();
          toast({ title: 'Point removed' });
        }
        e.preventDefault();
      }
      // Escape = deactivate (clear wave and exit tool)
      if (e.key === 'Escape') {
        ew.deactivateMode();
        setActiveTool(null);
        activeToolRef.current = null;
        toast({ title: 'Wave cleared' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [elliottWave.isActive, toast]);

  // Memoized values
  const selectedDrawingForModal = useMemo(() => {
    const id = drawingInteraction.selectedDrawingId;
    if (!id) return null;
    const drawing = drawings.find(d => d.id === id);
    if (!drawing) return null;
    return { ...drawing, points: drawing.points.map(p => ({ time: p.time, value: p.price })) };
  }, [drawingInteraction.selectedDrawingId, drawings]);

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
        {/* Top-left Toolbar: Drawing + Indicator buttons */}
        <div className="absolute top-2 left-2 z-30 flex items-center gap-1 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-1 shadow-xl">
          <DrawingMenu activeTool={activeTool} onSelectTool={handleSelectTool} />
          <IndicatorMenu
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
          />
          <ToolsMenu
            divergenceScannerEnabled={divergenceScannerEnabled}
            onToggleDivergenceScanner={setDivergenceScannerEnabled}
          />
        </div>

        {/* Mini Oscillator Indicators */}
        <MiniOscillatorSection
          miniOscillators={oscillatorPanel.miniOscillators}
          oscillatorData={oscillatorData}
          onCycleMode={oscillatorPanel.cycleMode}
        />
        
        {/* Loading/Error Overlay */}
        <ChartLoadingOverlay isLoading={isLoading} error={error?.message || null} />
        
        {/* Chart Container */}
        <div 
          ref={chartContainerRef} 
          className="absolute inset-x-0 top-0 w-full" 
          style={{ 
            height: `calc(${oscillatorPanel.chartPercentage}vh - ${TOP_TOOLBAR_HEIGHT}px)` 
          }}
          onClick={!activeTool ? handleDeselect : undefined}
        />
        
        {/* Moving Averages */}
        <MovingAverages
          chart={chartRef.current}
          maConfigs={indicators.ema.configs}
          show={indicators.ema.show}
          candles={candles}
          calculateEMA={calculateEMA}
          emaHTFDataCache={htfDataCache}
          symbol={symbol}
          interval={timeframe}
        />
        
        {/* FVG Renderer */}
        <FVGRenderer
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          fvgs={fvgs}
          settings={fvgSettings.settings}
        />

        {/* Order Block Renderer */}
        <OrderBlockRenderer
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          orderBlocks={orderBlocks}
          settings={obSettings.settings}
        />

        {/* BOS/CHoCH Renderer */}
        <BOSRenderer
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          structureBreaks={structureBreaks}
          swingPoints={swingPoints}
          settings={bosSettings.settings}
        />

        {/* Liquidity Zone Renderer */}
        <LiquidityRenderer
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          zones={liquidityZones}
          settings={liquiditySettings.settings}
        />

        {/* Premium/Discount Zone Renderer */}
        <PDZoneRenderer
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          zones={pdZones}
          settings={pdZoneSettings.settings}
        />

        {/* Divergence Scanner – badges overlaid on chart */}
        {divergenceScannerEnabled && (
          <DivergenceRenderer
            chart={chartRef.current}
            candleSeries={candleSeriesRef.current}
            divergencePoints={divergencePoints}
            onBadgeClick={setSelectedDivergencePoint}
          />
        )}

        {/* Divergence Badge Popup – shown when a badge is clicked */}
        {selectedDivergencePoint && (
          <DivergenceBadgePopup
            point={selectedDivergencePoint}
            onClose={() => setSelectedDivergencePoint(null)}
          />
        )}

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
          saveDrawingMutation={{ mutate: drawingsPersistence.saveDrawing }}
          onPointCommitRef={onPointCommitRef}
          onElliottWavePoint={elliottWave.isActive && elliottWave.isDrawing
            ? (p: GesturePoint) => {
                elliottWave.placePoint(p.time as number, p.price, p.snapType);
              }
            : undefined
          }
        />

        {/* Complete Panel – show when done (auto-save in progress) */}
        {elliottWave.isComplete && (
          <div className={`absolute top-14 right-4 z-30 bg-slate-900 border rounded-lg p-3 shadow-xl select-none ${elliottWave.isValid ? 'border-emerald-700' : 'border-red-700'}`}>
            {elliottWave.isValid ? (
              <p className="text-emerald-400 text-sm font-semibold mb-2">
                ✓ Wave Complete – Saving…
              </p>
            ) : (
              <>
                <p className="text-red-400 text-sm font-semibold mb-1">
                  ⚠ Invalid Wave Structure
                </p>
                <ul className="mb-2 space-y-0.5">
                  {elliottWave.validationErrors.map((err, i) => (
                    <li key={i} className="text-red-300 text-xs">{err}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={elliottWave.reset}>
                Reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                elliottWave.deactivateMode();
                setActiveTool(null);
                activeToolRef.current = null;
              }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Validation Error Panel – shown during active drawing */}
        {elliottWave.isDrawing && elliottWave.validationErrors.length > 0 && (
          <div className="absolute top-14 right-4 z-30 bg-slate-900 border border-amber-700 rounded-lg p-3 shadow-xl select-none max-w-xs">
            <p className="text-amber-400 text-xs font-semibold mb-1">⚠ Validation Warnings</p>
            <ul className="space-y-0.5">
              {elliottWave.validationErrors.map((err, i) => (
                <li key={i} className="text-amber-300 text-xs">{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Predictive Fib Level Renderer – ACTIVE DRAWING */}
        {activeTool === 'elliott_wave' && elliottWave.isActive && (
          <PredictiveFibRenderer
            chart={chartRef.current}
            candleSeries={candleSeriesRef.current}
            fibLevels={elliottWave.fibProjections}
            isActive={elliottWave.isActive}
          />
        )}

        {/* Invalidation Level Renderer – red lines for active drawing validation */}
        {activeTool === 'elliott_wave' && elliottWave.isActive && elliottWave.invalidationLevels.length > 0 && (
          <PredictiveFibRenderer
            chart={chartRef.current}
            candleSeries={candleSeriesRef.current}
            fibLevels={elliottWave.invalidationLevels}
            isActive={elliottWave.isActive}
            color="#ef4444"
          />
        )}

        {/* Predictive Fib Level Renderer – SELECTED SAVED WAVE */}
        {selectedWaveId && selectedWaveFibs.length > 0 && (
          <PredictiveFibRenderer
            chart={chartRef.current}
            candleSeries={candleSeriesRef.current}
            fibLevels={selectedWaveFibs}
            isActive={true}
            color="#facc15"
          />
        )}

        {/* Future Prediction Lines – persistent purple dashed lines for next wave targets */}
        {futurePredictionLines.length > 0 && (
          <PredictiveFibRenderer
            chart={chartRef.current}
            candleSeries={candleSeriesRef.current}
            fibLevels={futurePredictionLines}
            isActive={true}
            color="#a855f7"
          />
        )}

        {/* Wave Click Overlay – transparent SVG polygons over each saved EW wave for click detection */}
        {/* chartViewVersion is read to force re-render on pan/zoom */}
        {chartViewVersion >= 0 && (
          <svg
            className="absolute top-0 left-0"
            style={{ width: '100%', height: '100%', zIndex: 15, pointerEvents: 'none' }}
          >
            {/* Background rect – captures clicks on chart background to deselect the active wave */}
            <rect
              x={0}
              y={0}
              width="100%"
              height="100%"
              fill="transparent"
              style={{ pointerEvents: selectedWaveId && !activeTool ? 'auto' : 'none' }}
              onClick={() => handleDeselect()}
            />
            {drawings
              .filter(d => d.type === 'elliott_wave' && d.points.length >= 2)
              .map(wave => {
                if (!chartRef.current || !candleSeriesRef.current) return null;
                const coords = wave.points
                  .map(p => ({
                    x: chartRef.current!.timeScale().timeToCoordinate(p.time as Time) as number | null,
                    y: candleSeriesRef.current!.priceToCoordinate(p.price) as number | null,
                  }))
                  .filter((c): c is { x: number; y: number } => c.x !== null && c.y !== null);
                if (coords.length < 2) return null;
                const first = coords[0];
                const last = coords[coords.length - 1];
                // Build a thick invisible line as the click target
                const dx = last.x - first.x;
                const dy = last.y - first.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len === 0) return null;
                const nx = (-dy / len) * 12;
                const ny = (dx / len) * 12;
                const points = [
                  `${first.x + nx},${first.y + ny}`,
                  `${last.x + nx},${last.y + ny}`,
                  `${last.x - nx},${last.y - ny}`,
                  `${first.x - nx},${first.y - ny}`,
                ].join(' ');
                const isInteractive = !activeTool;
                return (
                  <g key={wave.id}>
                    <polygon
                      points={points}
                      fill="transparent"
                      stroke="transparent"
                      style={{
                        pointerEvents: 'auto',
                        cursor: isInteractive ? 'pointer' : 'default',
                      }}
                      onClick={(e) => {
                        if (!activeTool) {
                          e.stopPropagation();
                          handleWaveClick(wave.id, e.nativeEvent);
                        }
                      }}
                    />
                    {/* Visual indicator line when wave is selected */}
                    {selectedWaveId === wave.id && (
                      <line
                        x1={first.x}
                        y1={first.y}
                        x2={last.x}
                        y2={last.y}
                        stroke="#22c55e"
                        strokeWidth={3}
                        pointerEvents="none"
                        opacity={0.8}
                      />
                    )}

                  </g>
                );
              })}
          </svg>
        )}
        
        {/* Temp Drawing Points SVG */}
        <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 10 }}>
          {tempDrawing && tempDrawing.points.length > 0 && chartRef.current && tempDrawing.points.map((point, i) => {
            const x = chartRef.current?.timeScale().timeToCoordinate(point.time as Time);
            const y = candleSeriesRef.current?.priceToCoordinate(point.price);
            return (
              <circle 
                key={i} 
                cx={x ?? 0} 
                cy={y ?? 0} 
                r={6} 
                fill={point.snapType === 'high' ? '#ef4444' : point.snapType === 'low' ? '#22c55e' : '#3b82f6'} 
                stroke="#fff" 
                strokeWidth={2}
              />
            );
          })}
        </svg>
        
        {/* Drawing Quick Menu */}
        {drawingInteraction.quickMenuPosition && drawingInteraction.selectedDrawingId && (
          <DrawingQuickMenu
            x={drawingInteraction.quickMenuPosition.x}
            y={drawingInteraction.quickMenuPosition.y}
            onSettings={handleOpenSettings}
            onDelete={handleDeleteDrawing}
            onClose={drawingInteraction.closeQuickMenu}
          />
        )}
      </div>
      
      {/* Docked Oscillators */}
      <DockedOscillatorSection
        selectedOscillators={oscillatorPanel.selectedOscillators}
        poppedOutOscillators={oscillatorPanel.poppedOutOscillators}
        miniOscillators={oscillatorPanel.miniOscillators}
        oscillatorData={oscillatorData}
        candles={candles}
        totalOscillatorHeight={oscillatorPanel.totalHeight}
        onPopout={oscillatorPanel.popoutOscillator}
        onCycleMode={oscillatorPanel.cycleMode}
        isFullscreen={true}
        usePercentage={true}
        totalPercentage={oscillatorPanel.totalPercentage}
        perOscillatorPercentage={oscillatorPanel.perOscillatorPercentage}
        mainChartVisibleRange={mainChartVisibleRange}
      />
      
      {/* Popped Out Oscillators */}
      <PoppedOutOscillators
        selectedOscillators={oscillatorPanel.selectedOscillators}
        poppedOutOscillators={oscillatorPanel.poppedOutOscillators}
        oscillatorData={oscillatorData}
        candles={candles}
        onPopout={oscillatorPanel.popoutOscillator}
        onCycleMode={oscillatorPanel.cycleMode}
        mainChartVisibleRange={mainChartVisibleRange}
      />
      
      {/* Modals */}
      {drawingInteraction.selectedDrawingId && (
        <DrawingSettingsModal
          isOpen={settingsModalOpen}
          onClose={handleCloseSettings}
          drawing={selectedDrawingForModal}
          onUpdate={handleUpdateDrawing}
        />
      )}
      
      {drawingInteraction.showSelectionModal && (
        <DrawingSelectionModal
          open={drawingInteraction.showSelectionModal}
          drawings={drawingInteraction.nearbyDrawings}
          onSelect={drawingInteraction.selectFromModal}
          onClose={drawingInteraction.closeSelectionModal}
        />
      )}
      
      <EmaSmaModal
        isOpen={showEmaSmaModal}
        onClose={() => setShowEmaSmaModal(false)}
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
      />
      
      <OscillatorSelectorModal
        isOpen={oscillatorPanel.showSelector}
        onClose={() => oscillatorPanel.setShowSelector(false)}
        selectedOscillators={oscillatorPanel.selectedOscillators}
        onToggleOscillator={oscillatorPanel.toggleOscillator}
      />

      <SMCSettingsModal
        isOpen={showSmcModal}
        onClose={() => setShowSmcModal(false)}
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
      />

      <DegreePicker
        isOpen={showDegreePicker}
        onSelect={handleDegreeSelect}
        onClose={() => setShowDegreePicker(false)}
      />
    </div>
  );
}

import { useState, useEffect, useRef, useCallback, useMemo, type MouseEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createSeriesMarkers, type ISeriesMarkersPluginApi, Time } from 'lightweight-charts';
import { queryClient } from '@/lib/queryClient';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { useToast } from '@/hooks/use-toast';
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
import { useSimpleElliottWave } from '@/hooks/useSimpleElliottWave';

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
import { VerticalDrawingToolbar, DrawingToolbarPreview } from '@/components/drawings/VerticalDrawingToolbar';
import { DrawingRenderer } from '@/components/drawings/DrawingRenderer';
import { DrawingQuickMenu } from '@/components/drawings/DrawingQuickMenu';
import { DrawingSettingsModal } from '@/components/modals/DrawingSettingsModal';
import { DrawingSelectionModal } from '@/components/drawings/DrawingSelectionModal';
import { MovingAverages } from '@/components/chart/MovingAverages';
import { calculateEMA } from '@/lib/indicators';
import { OscillatorSelectorModal } from '@/components/modals/OscillatorSelectorModal';
import { DraggableToolbar } from '@/components/draggable/DraggableToolbar';
import { DockedOscillatorSection } from '@/components/oscillators/DockedOscillatorSection';
import { IndicatorIconToolbar, IndicatorIconToolbarPreview } from '@/components/indicators/IndicatorIconToolbar';
import { WaveTypeSelector } from '@/components/elliottWave/WaveTypeSelector';
import { PredictiveFibRenderer } from '@/components/elliottWave/PredictiveFibRenderer';
import { ElliottWavePrimitive } from '@/components/chart/primitives/ElliottWavePrimitive';

// Types and constants
import type { Drawing, ChartDrawingTool } from '@/types/drawing';
import {
  MOBILE_NAV_HEIGHT,
  TOP_TOOLBAR_HEIGHT,
  DRAWING_TOOLBAR_BOTTOM_MARGIN,
  DRAWING_TOOLBAR_ESTIMATED_HALF_WIDTH,
} from '@/lib/constants/layout';

/** Shape of a projection line returned from /api/crypto/projection-lines */
interface ProjectionLine {
  id: string;
  structureId: string;
  levelLabel: string;
  price: number;
  waveType: string;
  color: string;
}

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
  // Incremented whenever the chart pans/zooms so we can recompute the SVG click overlay coords
  const [chartViewVersion, setChartViewVersion] = useState(0);

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

  // Hooks - Elliott Wave simplified tool
  const elliottWave = useSimpleElliottWave();
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

  // Hooks - Gesture controller
  const gestureController = useChartGestures({
    enabled: activeTool !== null,
    data: candles as unknown as { time: Time; open: number; high: number; low: number; close: number }[],
    onPointCommit: (point) => onPointCommitRef.current?.(point),
    onCrosshairModeChange: () => {},
    autoSnapEnabled: true,
  });

  // Update chart with candle data
  useEffect(() => {
    if (candleSeriesRef.current && candles.length > 0) {
      if (isInitialDataLoad.current) {
        // First load: set data and fit content
        candleSeriesRef.current.setData(candles.map(c => ({ ...c, time: c.time as Time })));
        fitContent(candles.length);
        isInitialDataLoad.current = false;
      } else {
        // Subsequent updates: preserve the visible range
        const currentRange = chartRef.current?.timeScale().getVisibleRange();
        candleSeriesRef.current.setData(candles.map(c => ({ ...c, time: c.time as Time })));
        if (currentRange) {
          try {
            chartRef.current?.timeScale().setVisibleRange(currentRange);
          } catch (e) { /* ignore if range is now invalid */ }
        }
      }
    }
  }, [candles, candleSeriesRef, fitContent]);

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
          color: label.metadata?.color ?? '#00CED1',
          lineWidth: 2,
          waveType: label.patternType ?? label.pattern_type ?? 'EW',
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
      elliottWave.activateMode();
    }
    // Deselect any selected wave when activating a drawing tool
    setSelectedWaveId(null);
    setSelectedWaveFibs([]);
    setActiveTool(tool);
    activeToolRef.current = tool;
  }, [activeTool, elliottWave]);

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
    setDrawings(prev => prev.map(d => d.id === selectedId ? { ...d, style: { ...d.style, ...updates.style } } : d));
    drawingsPersistence.updateDrawing({ id: selectedId, updates: { style: updates.style } });
  }, [drawingInteraction.selectedDrawingId, drawingsPersistence]);

  // Elliott Wave: click on a saved wave to show its fibonacci projections
  const handleWaveClick = useCallback(async (waveId: string, e: MouseEvent) => {
    e.stopPropagation();
    // Toggle: clicking the same wave deselects it
    if (selectedWaveId === waveId) {
      setSelectedWaveId(null);
      setSelectedWaveFibs([]);
      return;
    }
    setSelectedWaveId(waveId);
    setSelectedWaveFibs([]);
    try {
      const res = await authenticatedApiRequest(
        'GET',
        `/api/crypto/projection-lines?structureId=${encodeURIComponent(waveId)}`,
      );
      const projections: ProjectionLine[] = await res.json();
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
    } catch (err) {
      console.warn('[EW] Failed to fetch projection lines:', err);
    }
  }, [selectedWaveId]);

  // Deselect wave when drawing tool is activated or chart area is clicked without a wave
  const handleDeselect = useCallback(() => {
    if (selectedWaveId) {
      setSelectedWaveId(null);
      setSelectedWaveFibs([]);
    }
  }, [selectedWaveId]);

  // Elliott Wave: save the drawn wave to elliott_wave_labels table
  const handleElliottWaveSave = useCallback(() => {
    if (!elliottWave.canSave) return;
    saveEWLabelMutation.mutate({
      symbol,
      timeframe,
      degree: 'intermediate',
      patternType: elliottWave.waveType ?? 'unknown',
      points: elliottWave.points.map(p => ({
        time: p.time,
        price: p.price,
        label: p.label,
        isMidAir: false,
        snapType: 'high',
      })),
      isComplete: true,
      metadata: {
        waveType: elliottWave.waveType,
        color: '#00CED1',
      },
    });
    elliottWave.deactivateMode();
    setActiveTool(null);
    activeToolRef.current = null;
  }, [elliottWave, symbol, timeframe, saveEWLabelMutation]);

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
        text: point.label,
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
    const waveType = elliottWave.waveType;
    const lastCandleTime = candles.length > 0 ? (candles[candles.length - 1].time as number) : undefined;
    const candleInterval = candles.length >= 2 ? (candles[1].time as number) - (candles[0].time as number) : 3600;

    if ((elliottWave.isDrawing || elliottWave.isComplete) && points.length >= 2 && waveType) {
      const data = {
        points: points.map(p => ({ time: p.time, price: p.price, label: p.label })),
        waveType,
        color: '#00CED1',
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
  }, [elliottWave.isDrawing, elliottWave.isComplete, elliottWave.points, elliottWave.waveType, candleSeriesRef, candles]);

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
        showPointLabels: true,
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
        {/* Indicator Icon Toolbar (Draggable) */}
        <DraggableToolbar
          storageKey="indicator-toolbar-position"
          rotationStorageKey="indicator-toolbar-vertical"
          minimizedStorageKey="indicator-toolbar-minimized"
          defaultPosition={() => ({ x: 16, y: 16 })}
          minimizedPreview={<IndicatorIconToolbarPreview />}
        >
          <IndicatorIconToolbar
            onOpenOscillators={() => oscillatorPanel.setShowSelector(true)}
            onOpenEmaSma={() => setShowEmaSmaModal(true)}
            onOpenSmc={() => setShowSmcModal(true)}
          />
        </DraggableToolbar>

        {/* Mini Oscillator Indicators */}
        <MiniOscillatorSection
          miniOscillators={oscillatorPanel.miniOscillators}
          oscillatorData={oscillatorData}
          onCycleMode={oscillatorPanel.cycleMode}
        />

        {/* Drawing Toolbar */}
        <DraggableToolbar
          storageKey="chart-drawing-toolbar-position"
          rotationStorageKey="drawing-toolbar-vertical"
          minimizedStorageKey="drawing-toolbar-minimized"
          defaultPosition={() => ({
            x: window.innerWidth / 2 - DRAWING_TOOLBAR_ESTIMATED_HALF_WIDTH,
            y: window.innerHeight - (oscillatorPanel.selectedOscillators.size > 0
              ? oscillatorPanel.totalHeight + DRAWING_TOOLBAR_BOTTOM_MARGIN
              : DRAWING_TOOLBAR_BOTTOM_MARGIN)
          })}
          minimizedPreview={<DrawingToolbarPreview />}
        >
          <VerticalDrawingToolbar activeTool={activeTool} onSelectTool={handleSelectTool} />
        </DraggableToolbar>
        
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
                elliottWave.placePoint(p.time as number, p.price);
              }
            : undefined
          }
        />

        {/* Elliott Wave – Wave Type Selector */}
        {elliottWave.showSelector && (
          <WaveTypeSelector
            onSelect={elliottWave.selectWaveType}
            onCancel={() => {
              elliottWave.deactivateMode();
              setActiveTool(null);
              activeToolRef.current = null;
            }}
          />
        )}

        {/* Simple Status Panel – show while drawing */}
        {elliottWave.isDrawing && (
          <div className="absolute top-14 right-4 z-30 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl select-none">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-white text-sm font-semibold">
                  {elliottWave.waveType?.toUpperCase()} Wave
                </p>
                <p className="text-slate-400 text-xs">
                  Place point {elliottWave.points.length + 1} of 2
                </p>
              </div>
              <div className="flex gap-2">
                {elliottWave.canUndo && (
                  <Button size="sm" variant="ghost" onClick={elliottWave.undo}>
                    Undo
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => {
                  elliottWave.deactivateMode();
                  setActiveTool(null);
                  activeToolRef.current = null;
                }}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Complete Panel – show when done */}
        {elliottWave.isComplete && (
          <div className="absolute top-14 right-4 z-30 bg-slate-900 border border-emerald-700 rounded-lg p-3 shadow-xl select-none">
            <p className="text-emerald-400 text-sm font-semibold mb-2">
              ✓ {elliottWave.waveType?.toUpperCase()} Complete
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleElliottWaveSave}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={elliottWave.reset}>
                Reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                elliottWave.deactivateMode();
                setActiveTool(null);
                activeToolRef.current = null;
              }}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Predictive Fib Level Renderer – ACTIVE DRAWING */}
        {activeTool === 'elliott_wave' && elliottWave.isActive && (
          <PredictiveFibRenderer
            chart={chartRef.current}
            candleSeries={candleSeriesRef.current}
            fibLevels={elliottWave.projections}
            isActive={elliottWave.isComplete}
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

        {/* Wave Click Overlay – transparent SVG polygons over each saved EW wave for click detection */}
        {/* chartViewVersion is read to force re-render on pan/zoom */}
        {chartViewVersion >= 0 && (
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            style={{ width: '100%', height: '100%', zIndex: 15 }}
          >
            {drawings
              .filter(d => d.type === 'elliott_wave' && d.points.length >= 2)
              .map(wave => {
                if (!chartRef.current || !candleSeriesRef.current) return null;
                const coords = wave.points
                  .map(p => ({
                    x: chartRef.current!.timeScale().timeToCoordinate(p.time as Time),
                    y: candleSeriesRef.current!.priceToCoordinate(p.price),
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
                  <polygon
                    key={wave.id}
                    points={points}
                    fill="transparent"
                    stroke="transparent"
                    style={{ cursor: isInteractive ? 'pointer' : 'default', pointerEvents: isInteractive ? 'auto' : 'none' }}
                    onClick={isInteractive ? (e) => handleWaveClick(wave.id, e) : undefined}
                  />
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
    </div>
  );
}

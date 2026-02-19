import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Time } from 'lightweight-charts';

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

// New extraction components
import { FullscreenChartToolbar } from '@/components/chart/FullscreenChartToolbar';
import { PoppedOutOscillators } from '@/components/oscillators/PoppedOutOscillators';
import { ChartLoadingOverlay } from '@/components/chart/ChartLoadingOverlay';
import { MiniOscillatorSection } from '@/components/oscillators/MiniOscillatorSection';

// Existing components
import { Button } from '@/components/ui/button';
import { VerticalDrawingToolbar } from '@/components/drawings/VerticalDrawingToolbar';
import { DrawingRenderer } from '@/components/drawings/DrawingRenderer';
import { DrawingQuickMenu } from '@/components/drawings/DrawingQuickMenu';
import { DrawingSettingsModal } from '@/components/modals/DrawingSettingsModal';
import { DrawingSelectionModal } from '@/components/drawings/DrawingSelectionModal';
import { IndicatorToolbar, EmaSmaModal } from '@/components/indicators';
import { MovingAverages } from '@/components/chart/MovingAverages';
import { calculateEMA } from '@/lib/indicators';
import { OscillatorSelectorModal } from '@/components/modals/OscillatorSelectorModal';
import { DraggableToolbar } from '@/components/draggable/DraggableToolbar';
import { DockedOscillatorSection } from '@/components/oscillators/DockedOscillatorSection';

// Types and constants
import type { Drawing, ChartDrawingTool } from '@/types/drawing';
import {
  MOBILE_NAV_HEIGHT,
  TOP_TOOLBAR_HEIGHT,
  DRAWING_TOOLBAR_BOTTOM_MARGIN,
  DRAWING_TOOLBAR_ESTIMATED_HALF_WIDTH,
} from '@/lib/constants/layout';

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
  const [tempDrawing, setTempDrawing] = useState<{ points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null>(null);

  // Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const activeToolRef = useRef<ChartDrawingTool>(null);
  const autoColorEnabledRef = useRef(autoColorEnabled);
  const onPointCommitRef = useRef<((point: GesturePoint) => void) | null>(null);

  // Hooks - Oscillator panel (needed first for totalHeight)
  const oscillatorPanel = useOscillatorPanel();

  // Hooks - Chart instance
  const { chartRef, candleSeriesRef, isReady: chartReady, fitContent } = useChartInstance({
    containerRef: chartContainerRef,
    totalOscillatorHeight: oscillatorPanel.totalHeight,
    mobileNavHeight: 0, // No mobile nav in fullscreen mode
  });

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

  // Hooks - HTF data cache
  const { htfDataCache } = useHTFDataCache({
    symbol,
    currentTimeframe: timeframe,
    emaConfigs: indicators.ema.configs,
    enabled: indicators.ema.show,
  });

  // Hooks - Drawing persistence
  const drawingsPersistence = useDrawingsPersistence(symbol, timeframe);

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
      candleSeriesRef.current.setData(candles);
      fitContent(candles.length);
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

  // Load drawings from persistence
  useEffect(() => {
    if (drawingsPersistence.drawings) {
      const loadedDrawings = drawingsPersistence.drawings
        .map((d: any): Drawing | null => {
          try {
            if (!d.id) return null;
            return {
              id: d.id,
              type: d.drawingType || d.drawing_type || d.tool || 'trendline',
              points: d.coordinates?.points || d.points || [],
              style: { color: d.style?.color || '#3b82f6', lineWidth: d.style?.lineWidth || 2, ...d.style },
            };
          } catch (e) { return null; }
        })
        .filter((d): d is Drawing => d !== null && d.points.length > 0);
      setDrawings(loadedDrawings);
    }
  }, [drawingsPersistence.drawings]);

  // Update refs
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { autoColorEnabledRef.current = autoColorEnabled; }, [autoColorEnabled]);

  // Handlers
  const handleSelectTool = useCallback((tool: ChartDrawingTool) => {
    setActiveTool(tool);
    activeToolRef.current = tool;
  }, []);

  const handleOpenSettings = useCallback(() => setSettingsModalOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsModalOpen(false), []);

  const handleDeleteDrawing = useCallback(() => {
    if (drawingInteraction.selectedDrawingId) {
      drawingsPersistence.deleteDrawing(drawingInteraction.selectedDrawingId);
      setDrawings(prev => prev.filter(d => d.id !== drawingInteraction.selectedDrawingId));
      drawingInteraction.setSelectedDrawingId(null);
    }
  }, [drawingInteraction, drawingsPersistence]);

  const handleUpdateDrawing = useCallback((updates: { style: Partial<Drawing['style']> }) => {
    const selectedId = drawingInteraction.selectedDrawingId;
    if (!selectedId || selectedId.startsWith('drawing-')) return;
    setDrawings(prev => prev.map(d => d.id === selectedId ? { ...d, style: { ...d.style, ...updates.style } } : d));
    drawingsPersistence.updateDrawing({ id: selectedId, updates: { style: updates.style } });
  }, [drawingInteraction.selectedDrawingId, drawingsPersistence]);

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
        {/* Indicator & Oscillator Buttons */}
        <div className="absolute top-2 left-2 z-20 flex gap-2">
          <IndicatorToolbar onOpenEmaSma={() => setShowEmaSmaModal(true)} />
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => oscillatorPanel.setShowSelector(true)}
            className="bg-slate-900/95 backdrop-blur-sm border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            Oscillators {oscillatorPanel.selectedOscillators.size > 0 && `(${oscillatorPanel.selectedOscillators.size})`}
          </Button>
        </div>

        {/* Mini Oscillator Indicators */}
        <MiniOscillatorSection
          miniOscillators={oscillatorPanel.miniOscillators}
          oscillatorData={oscillatorData}
          onToggleMode={oscillatorPanel.toggleMini}
        />

        {/* Drawing Toolbar */}
        <DraggableToolbar 
          storageKey="chart-drawing-toolbar-position"
          defaultPosition={() => ({
            x: window.innerWidth / 2 - DRAWING_TOOLBAR_ESTIMATED_HALF_WIDTH,
            y: window.innerHeight - (oscillatorPanel.selectedOscillators.size > 0 
              ? oscillatorPanel.totalHeight + DRAWING_TOOLBAR_BOTTOM_MARGIN
              : DRAWING_TOOLBAR_BOTTOM_MARGIN)
          })}
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
        />
        
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
        isFullscreen={true}
        usePercentage={true}
        totalPercentage={oscillatorPanel.totalPercentage}
        perOscillatorPercentage={oscillatorPanel.perOscillatorPercentage}
      />
      
      {/* Popped Out Oscillators */}
      <PoppedOutOscillators
        selectedOscillators={oscillatorPanel.selectedOscillators}
        poppedOutOscillators={oscillatorPanel.poppedOutOscillators}
        oscillatorData={oscillatorData}
        candles={candles}
        onPopout={oscillatorPanel.popoutOscillator}
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
        poppedOutOscillators={oscillatorPanel.poppedOutOscillators}
        miniOscillators={oscillatorPanel.miniOscillators}
        onToggleOscillator={oscillatorPanel.toggleOscillator}
      />
    </div>
  );
}

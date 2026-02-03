import { useState, useRef, useCallback } from 'react';

interface CrosshairInfo {
  time: number;
  x: number;
  y: number;
}

type ChartTab = 'smc' | 'trend' | 'vwap' | 'oscillators' | null;
type DrawingMode = 'draw' | 'edit' | 'off' | 'select';

interface ChartControls {
  chartReady: boolean;
  setChartReady: (ready: boolean) => void;
  crosshairInfo: CrosshairInfo | null;
  setCrosshairInfo: (info: CrosshairInfo | null) => void;
  visibleCandleCount: number;
  setVisibleCandleCount: (count: number) => void;
  activeTab: ChartTab;
  setActiveTab: (tab: ChartTab) => void;
  chartControlsRef: React.RefObject<HTMLDivElement>;
  drawingMode: DrawingMode;
  setDrawingMode: (mode: DrawingMode) => void;
  toggleDrawingMode: () => void;
}

export function useChartControls(): ChartControls {
  const [chartReady, setChartReady] = useState(false);
  const [crosshairInfo, setCrosshairInfo] = useState<CrosshairInfo | null>(null);
  const [visibleCandleCount, setVisibleCandleCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<ChartTab>(null);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('draw');
  const chartControlsRef = useRef<HTMLDivElement>(null);

  const toggleDrawingMode = useCallback(() => {
    setDrawingMode(prev => prev === 'draw' ? 'off' : 'draw');
  }, []);

  return {
    chartReady,
    setChartReady,
    crosshairInfo,
    setCrosshairInfo,
    visibleCandleCount,
    setVisibleCandleCount,
    activeTab,
    setActiveTab,
    chartControlsRef,
    drawingMode,
    setDrawingMode,
    toggleDrawingMode,
  };
}

import { useEffect } from 'react';
import { IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts';

export type DrawingTool = 
  | 'trendline' 
  | 'horizontal' 
  | 'vertical'
  | 'rectangle'
  | 'ellipse'
  | 'fib_retracement'
  | 'fib_extension'
  | 'channel'
  | 'parallel_channel'
  | 'text'
  | 'arrow';

interface ChartEventsConfig {
  chart: IChartApi | null;
  series: ISeriesApi<any> | null;
  drawingMode: 'off' | 'draw' | 'select';
  activeTool: DrawingTool | null;
  onPointCommit?: (point: { time: number; price: number }) => void;
  onDrawingSelect?: (drawingId: string) => void;
  onContextMenu?: (e: MouseEvent, drawingId?: string) => void;
  onCrosshairMove?: (param: MouseEventParams) => void;
}

export function useChartEvents({
  chart,
  series,
  drawingMode,
  activeTool,
  onPointCommit,
  onDrawingSelect,
  onContextMenu,
  onCrosshairMove,
}: ChartEventsConfig) {
  
  useEffect(() => {
    if (!chart) return;

    const handleClick = (param: MouseEventParams) => {
      if (drawingMode === 'draw' && activeTool && param.point && param.time) {
        const price = series?.coordinateToPrice(param.point.y);
        if (price && typeof param.time === 'number') {
          onPointCommit?.({ time: param.time, price });
        }
      }
    };

    const handleCrosshairMoveInternal = (param: MouseEventParams) => {
      if (onCrosshairMove) {
        onCrosshairMove(param);
      }
    };

    const handleContextMenuInternal = (e: MouseEvent) => {
      e.preventDefault();
      onContextMenu?.(e);
    };

    chart.subscribeClick(handleClick);
    chart.subscribeCrosshairMove(handleCrosshairMoveInternal);
    
    const container = chart.chartElement();
    if (container) {
      container.addEventListener('contextmenu', handleContextMenuInternal);
    }

    return () => {
      chart.unsubscribeClick(handleClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMoveInternal);
      if (container) {
        container.removeEventListener('contextmenu', handleContextMenuInternal);
      }
    };
  }, [chart, series, drawingMode, activeTool, onPointCommit, onDrawingSelect, onContextMenu, onCrosshairMove]);
}

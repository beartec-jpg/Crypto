import { useEffect, useRef } from 'react';
import type { Time } from 'lightweight-charts';
import { generateFutureWhitespace, FUTURE_BAR_COUNT } from '@/lib/chart/timeUtils';

interface UseFullscreenChartLifecycleParams {
  candleSeriesRef: React.MutableRefObject<any>;
  chartRef: React.MutableRefObject<any>;
  chartContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  candles: any[];
  timeframe: string;
  symbol: string;
  fitContent: (barCount?: number) => void;
  handleChartClick: EventListener;
  handleTouchEnd: EventListener;
  gestureController: {
    attachToChart: (chart: any, series: any, container: HTMLElement) => void;
    detachFromChart: () => void;
  };
  rewindPosition: number | null;
}

export function useFullscreenChartLifecycle({
  candleSeriesRef,
  chartRef,
  chartContainerRef,
  candles,
  timeframe,
  symbol,
  fitContent,
  handleChartClick,
  handleTouchEnd,
  gestureController,
  rewindPosition,
}: UseFullscreenChartLifecycleParams) {
  const isInitialDataLoad = useRef(true);

  useEffect(() => {
    if (candleSeriesRef.current && candles.length > 0) {
      // When rewinding, only show candles up to the rewind position (hide future candles)
      const displayCandles = rewindPosition !== null ? candles.slice(0, rewindPosition) : candles;

      const chartData: any[] = displayCandles.map(candle => ({ ...candle, time: candle.time as Time }));

      // Only add future whitespace bars when in live mode (not rewinding)
      if (rewindPosition === null) {
        const lastCandle = candles[candles.length - 1];
        const futureBars = generateFutureWhitespace(lastCandle.time as number, timeframe, FUTURE_BAR_COUNT);
        chartData.push(...(futureBars as any[]));
      }

      if (isInitialDataLoad.current) {
        candleSeriesRef.current.setData(chartData);
        fitContent(candles.length);
        chartRef.current?.timeScale().applyOptions({ rightOffset: 50 });
        isInitialDataLoad.current = false;
      } else {
        const currentRange = chartRef.current?.timeScale().getVisibleRange();
        candleSeriesRef.current.setData(chartData);
        if (currentRange) {
          try {
            chartRef.current?.timeScale().setVisibleRange(currentRange);
          } catch {
          }
        }
      }
    }
  }, [candles, rewindPosition, candleSeriesRef, fitContent, timeframe, chartRef]);

  useEffect(() => {
    const chartElement = chartContainerRef.current;
    if (!chartElement) return;

    chartElement.addEventListener('click', handleChartClick);
    chartElement.addEventListener('touchstart', handleChartClick, { passive: true });
    chartElement.addEventListener('touchend', handleTouchEnd);

    return () => {
      chartElement.removeEventListener('click', handleChartClick);
      chartElement.removeEventListener('touchstart', handleChartClick);
      chartElement.removeEventListener('touchend', handleTouchEnd);
    };
  }, [chartContainerRef, handleChartClick, handleTouchEnd]);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !chartContainerRef.current) return;
    gestureController.attachToChart(chartRef.current, candleSeriesRef.current, chartContainerRef.current);
    return () => gestureController.detachFromChart();
  }, [gestureController, chartRef, candleSeriesRef, chartContainerRef]);

  useEffect(() => {
    isInitialDataLoad.current = true;
  }, [symbol, timeframe]);
}

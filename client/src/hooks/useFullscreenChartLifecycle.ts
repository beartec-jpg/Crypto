import { useEffect, useRef } from 'react';
import type { Time } from 'lightweight-charts';
import { generateFutureWhitespace, getFutureBarCount } from '@/lib/chart/timeUtils';

interface UseFullscreenChartLifecycleParams {
  candleSeriesRef: React.MutableRefObject<any>;
  chartRef: React.MutableRefObject<any>;
  chartContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  candles: any[];
  timeframe: string;
  symbol: string;
  isLoading: boolean;
  fitContent: (barCount?: number, timeframe?: string) => void;
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
  isLoading,
  fitContent,
  handleChartClick,
  handleTouchEnd,
  gestureController,
  rewindPosition,
}: UseFullscreenChartLifecycleParams) {
  const isInitialDataLoad = useRef(true);
  // Track the last symbol+timeframe key so we can detect a pair change even when
  // candles arrive in the same render (cached data) — ensures fitContent() is always
  // called on timeframe/symbol switch rather than inheriting a stale visible range.
  const lastSymbolTimeframeRef = useRef(`${symbol}:${timeframe}`);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    if (candles.length === 0) {
      // Don't blank the chart while fetching – keep the previous bars visible
      // until new data arrives so there is no flash of empty content.
      return;
    }

    // When rewinding, only show candles up to the rewind position (hide future candles)
    const displayCandles = rewindPosition !== null ? candles.slice(0, rewindPosition) : candles;

    const chartData: any[] = displayCandles.map(candle => ({ ...candle, time: candle.time as Time }));

    // Only add future whitespace bars when in live mode (not rewinding)
    if (rewindPosition === null) {
      const lastCandle = candles[candles.length - 1];
      const futureBars = generateFutureWhitespace(lastCandle.time as number, timeframe, getFutureBarCount(timeframe));
      chartData.push(...(futureBars as any[]));
    }

    const currentKey = `${symbol}:${timeframe}`;
    const isNewPair = lastSymbolTimeframeRef.current !== currentKey;

    // Fit content on initial load or any symbol/timeframe change so we never carry
    // over a stale visible range from a different bar density.
    // Only commit the new pair key once we have fresh candles (isLoading=false).
    // While isLoading, we still render whatever data we have but keep the key
    // "pending" so that fitContent() fires again when the actual new candles arrive.
    if (isInitialDataLoad.current || isNewPair) {
      if (!isLoading) {
        // Candles are fresh for this pair — lock in the key so subsequent renders
        // (auto-refresh) go through the else branch (preserve user's scroll position).
        lastSymbolTimeframeRef.current = currentKey;
        isInitialDataLoad.current = false;
      }
      // Re-enable price scale auto-scaling before loading the new symbol's candles.
      // Without this, the price scale stays locked to the previous symbol's range
      // (e.g. BTC's 64000–90000) and the new candles (e.g. VET at ~0.03) render
      // far outside the visible area.
      chartRef.current?.applyOptions({ rightPriceScale: { autoScale: true } });
      candleSeriesRef.current.setData(chartData);
      fitContent(candles.length, timeframe);
      chartRef.current?.timeScale().applyOptions({ rightOffset: 50 });
    } else {
      const currentLogicalRange = chartRef.current?.timeScale().getVisibleLogicalRange();
      candleSeriesRef.current.setData(chartData);
      if (currentLogicalRange) {
        try {
          chartRef.current?.timeScale().setVisibleLogicalRange(currentLogicalRange);
        } catch {
        }
      }
    }
  }, [candles, rewindPosition, candleSeriesRef, fitContent, timeframe, symbol, isLoading, chartRef]);

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
}

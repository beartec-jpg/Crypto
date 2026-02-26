import { useEffect, useRef, forwardRef, Ref, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, IChartApi, CandlestickSeries, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts';
import type { CandleData } from '@/types/chart.types';
import { getDecimalsForPrice } from '@/lib/chart/priceUtils';

interface FutureWhitespaceConfig {
  enabled: boolean;
  getFutureBarCount: (interval: string) => number;
  generateFutureWhitespace: (lastTime: number, interval: string, count: number) => { time: number }[];
}

interface ChartContainerProps {
  data: CandleData[];
  height: number;
  onChartReady?: (chart: IChartApi, candleSeries: ISeriesApi<"Candlestick">) => void;
  isFullscreen: boolean;
  loading?: boolean;
  interval?: string;
  onVisibleRangeChange?: (count: number) => void;
  onCrosshairMove?: (param: MouseEventParams) => void;
  futureWhitespace?: FutureWhitespaceConfig;
}

export const ChartContainer = forwardRef<HTMLDivElement, ChartContainerProps>(function ChartContainer({
  data,
  height,
  onChartReady,
  isFullscreen,
  loading = false,
  interval = '1h',
  onVisibleRangeChange,
  onCrosshairMove,
  futureWhitespace
}, forwardedRef) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const internalRef = forwardedRef || chartContainerRef;
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Resize handler defined outside useEffect to avoid recreating
  const handleResize = useCallback(() => {
    const container = typeof internalRef === 'function' ? null : internalRef.current;
    if (container && chartRef.current) {
      chartRef.current.applyOptions({
        width: container.clientWidth,
      });
    }
  }, [internalRef]);

  useEffect(() => {
    if (data.length === 0 || loading) {
      console.log('Chart init skipped - candles:', data.length, 'loading:', loading);
      return;
    }
    
    // Prevent recreation if chart already exists
    if (chartRef.current) {
      console.log('Chart already exists, skipping recreation');
      return;
    }
    
    // Use setTimeout to ensure DOM is fully rendered
    const timer = setTimeout(() => {
      const container = typeof internalRef === 'function' ? null : internalRef.current;
      if (!container) {
        console.log('Chart container ref not available');
        return;
      }
      
      // Double check chart doesn't exist
      if (chartRef.current) {
        console.log('Chart created during timeout, skipping');
        return;
      }
      
      const containerWidth = container.clientWidth > 0 ? container.clientWidth : 800;
      
      console.log('Creating chart - width:', containerWidth, 'candles:', data.length);
      
      const chart = createChart(container, {
        width: container.clientWidth || 800,
        height: container.clientHeight || 600,
        layout: {
          background: { type: ColorType.Solid, color: '#0f172a' },
          textColor: '#d1d5db',
        },
        grid: {
          vertLines: { color: '#1e293b' },
          horzLines: { color: '#1e293b' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderVisible: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
          autoScale: true,
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderVisible: true,
        },
        handleScroll: isFullscreen,  // ← Disable scroll when NOT fullscreen
        handleScale: isFullscreen,   // ← Disable pinch-to-zoom when NOT fullscreen
        kineticScroll: {
          touch: isFullscreen,       // ← Disable touch scroll when NOT fullscreen
          mouse: isFullscreen,       // ← Disable mouse scroll when NOT fullscreen
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        priceFormat: (() => {
          // Compute precision from representative price (use latest close if available)
          const refPrice = data.length > 0 ? data[data.length - 1].close : 1;
          const decimals = getDecimalsForPrice(refPrice || 1);
          const minMove = decimals > 0 ? parseFloat((1 / Math.pow(10, decimals)).toFixed(decimals)) : 1;
          return { type: 'price' as const, precision: decimals, minMove };
        })(),
      });

      // Prepare chart data with optional future whitespace
      let chartData = data;
      if (futureWhitespace?.enabled && data.length > 0) {
        const lastCandle = data[data.length - 1];
        const futureCount = futureWhitespace.getFutureBarCount(interval);
        const futureBars = futureWhitespace.generateFutureWhitespace(lastCandle.time as number, interval, futureCount);
        chartData = [...data, ...futureBars] as any;
        console.log('Added', futureCount, 'future whitespace bars');
      }

      candleSeries.setData(chartData as any);
      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

      // Fit content then add right-side bar spacing for future drawing area
      chart.timeScale().fitContent();
      // Add significant whitespace on the right to show future area (half chart at zoom out)
      chart.timeScale().applyOptions({
        rightOffset: 150, // Show ~half the chart as future whitespace
      });
      console.log('Chart created successfully');

      // Subscribe to visible range changes to update candle count
      if (onVisibleRangeChange) {
        chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (range) {
            const count = Math.round(range.to - range.from) + 1;
            onVisibleRangeChange(count);
          }
        });
        
        // Set initial visible candle count
        const initialRange = chart.timeScale().getVisibleLogicalRange();
        if (initialRange) {
          onVisibleRangeChange(Math.round(initialRange.to - initialRange.from) + 1);
        }
      }

      // Add crosshair move handler
      if (onCrosshairMove) {
        chart.subscribeCrosshairMove((param) => {
          onCrosshairMove(param);
        });
      }
      
      if (onChartReady) {
        onChartReady(chart, candleSeries);
      }
    }, 100);

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
      }
    };
  }, [data.length, loading, isFullscreen, interval, onVisibleRangeChange, onCrosshairMove, onChartReady, futureWhitespace?.enabled, handleResize]);

  return (
    <div 
      ref={internalRef as React.Ref<HTMLDivElement>}
      style={{ height: `${height}px`, width: '100%' }}
    />
  );
});

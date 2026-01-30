import { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, IChartApi, CandlestickSeries, ISeriesApi } from 'lightweight-charts';
import type { CandleData } from '@/types/chart.types';

interface ChartContainerProps {
  data: CandleData[];
  height: number;
  onChartReady?: (chart: IChartApi, candleSeries: ISeriesApi<"Candlestick">) => void;
  isFullscreen: boolean;
  loading?: boolean;
  interval?: string;
  onVisibleRangeChange?: (count: number) => void;
  onCrosshairMove?: (param: any) => void;
  futureWhitespace?: {
    enabled: boolean;
    getFutureBarCount: (interval: string) => number;
    generateFutureWhitespace: (lastTime: any, interval: string, count: number) => any[];
  };
}

export function ChartContainer({ 
  data, 
  height, 
  onChartReady, 
  isFullscreen,
  loading = false,
  interval = '1h',
  onVisibleRangeChange,
  onCrosshairMove,
  futureWhitespace
}: ChartContainerProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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
      if (!chartContainerRef.current) {
        console.log('Chart container ref not available');
        return;
      }
      
      // Double check chart doesn't exist
      if (chartRef.current) {
        console.log('Chart created during timeout, skipping');
        return;
      }
      
      const container = chartContainerRef.current;
      const containerWidth = container.clientWidth > 0 ? container.clientWidth : 800;
      
      console.log('Creating chart - width:', containerWidth, 'candles:', data.length);
      
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth || 800,
        height: chartContainerRef.current.clientHeight || 600,
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
        priceFormat: {
          type: 'price',
          precision: 6,
          minMove: 0.000001,
        },
      });

      // Prepare chart data with optional future whitespace
      let chartData = data;
      if (futureWhitespace?.enabled && data.length > 0) {
        const lastCandle = data[data.length - 1];
        const futureCount = futureWhitespace.getFutureBarCount(interval);
        const futureBars = futureWhitespace.generateFutureWhitespace(lastCandle.time, interval, futureCount);
        chartData = [...data, ...futureBars];
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

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

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
  }, [data.length, loading, isFullscreen, interval, onVisibleRangeChange, onCrosshairMove, futureWhitespace]);

  return (
    <div 
      ref={chartContainerRef} 
      style={{ height: `${height}px`, width: '100%' }}
    />
  );
}

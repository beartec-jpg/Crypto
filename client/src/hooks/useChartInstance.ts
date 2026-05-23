import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, CandlestickSeries, CrosshairMode } from 'lightweight-charts';
import { formatPriceDynamic } from '@/lib/chart/priceUtils';
import {
  RESIZE_DEBOUNCE_MS,
  MOBILE_NAV_HEIGHT,
  TOP_TOOLBAR_HEIGHT,
} from '@/lib/constants/layout';

function restoreVisibleLogicalRange(chart: IChartApi, fallbackToFit = false) {
  const timeScale = chart.timeScale();
  const savedRange = timeScale.getVisibleLogicalRange();

  requestAnimationFrame(() => {
    try {
      if (
        savedRange &&
        Number.isFinite(savedRange.from) &&
        Number.isFinite(savedRange.to) &&
        savedRange.to > savedRange.from
      ) {
        timeScale.setVisibleLogicalRange(savedRange);
        return;
      }
    } catch {
    }

    if (fallbackToFit) {
      timeScale.fitContent();
    }
  });
}

interface UseChartInstanceOptions {
  containerRef: React.RefObject<HTMLDivElement>;
  totalOscillatorHeight: number;
  topToolbarHeight?: number;
  mobileNavHeight?: number;
}

interface UseChartInstanceReturn {
  chartRef: React.MutableRefObject<IChartApi | null>;
  candleSeriesRef: React.MutableRefObject<ISeriesApi<'Candlestick'> | null>;
  isReady: boolean;
  fitContent: (candleCount?: number) => void;
}

export function useChartInstance({
  containerRef,
  totalOscillatorHeight,
  topToolbarHeight = TOP_TOOLBAR_HEIGHT,
  mobileNavHeight = MOBILE_NAV_HEIGHT,
}: UseChartInstanceOptions): UseChartInstanceReturn {
  const [isReady, setIsReady] = useState(false);
  const [reinitializeKey, setReinitializeKey] = useState(0);
  
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstResizeRef = useRef(true);
  const isRetryingInitRef = useRef(false);

  const fitContent = useCallback((candleCount?: number) => {
    if (chartRef.current) {
      if (candleCount !== undefined && candleCount > 0) {
        // Show all candles from the start with a small right margin (full zoom out).
        // Using setVisibleLogicalRange rather than per-timeframe limited bars ensures
        // the user always sees the complete picture after a timeframe change.
        chartRef.current.timeScale().setVisibleLogicalRange({ from: 0, to: candleCount + 10 });
      } else {
        chartRef.current.timeScale().fitContent();
      }
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      console.warn('[Chart] Container ref not available');
      return;
    }

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = window.innerHeight - topToolbarHeight - mobileNavHeight - totalOscillatorHeight;

    // Validate dimensions before initializing chart
    if (width === 0 || height === 0) {
      console.warn('[Chart] Container has invalid dimensions:', { width, height });
      
      const retryObserver = new ResizeObserver((entries) => {
        const [entry] = entries;
        const { width: newWidth, height: newHeight } = entry.contentRect;
        
        if (newWidth > 0 && newHeight > 0 && !chartRef.current && !isRetryingInitRef.current) {
          console.log('[Chart] Container dimensions now valid, triggering initialization');
          isRetryingInitRef.current = true;
          retryObserver.disconnect();
          setReinitializeKey(prev => prev + 1);
        }
      });
      
      retryObserver.observe(container);
      return () => retryObserver.disconnect();
    }

    isRetryingInitRef.current = false;
    console.log('[Chart] Initializing chart with dimensions:', { width, height });

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#cbd5e1',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      width,
      height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
        autoScale: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceFormat: {
        type: 'custom',
        minMove: 0.00000001,
        formatter: (price: number) => formatPriceDynamic(price),
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    setIsReady(true);
    
    console.log('[Chart] Chart initialized successfully');
    
    requestAnimationFrame(() => {
      chart.timeScale().fitContent();
    });
    
    isFirstResizeRef.current = true;

    const handleResize = () => {
      if (isFirstResizeRef.current) {
        isFirstResizeRef.current = false;
        return;
      }
      
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      resizeTimeoutRef.current = setTimeout(() => {
        if (containerRef.current && chartRef.current) {
          const newWidth = containerRef.current.clientWidth;
          const newHeight = window.innerHeight - topToolbarHeight - mobileNavHeight - totalOscillatorHeight;
          
          if (newWidth > 0 && newHeight > 0) {
            const chart = chartRef.current;
            if (!chart) return;

            // Preserve user's current viewport while resizing.
            const savedLogicalRange = chart.timeScale().getVisibleLogicalRange();
            chartRef.current.applyOptions({ width: newWidth, height: newHeight });

            requestAnimationFrame(() => {
              try {
                if (
                  savedLogicalRange &&
                  Number.isFinite(savedLogicalRange.from) &&
                  Number.isFinite(savedLogicalRange.to) &&
                  savedLogicalRange.to > savedLogicalRange.from
                ) {
                  chart.timeScale().setVisibleLogicalRange(savedLogicalRange);
                  return;
                }
              } catch {
              }

              chart.timeScale().fitContent();
            });
          }
        }
      }, RESIZE_DEBOUNCE_MS);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      setIsReady(false);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeObserver.disconnect();
      if (chartRef.current) {
        console.log('[Chart] Cleaning up chart');
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
      }
    };
  }, [reinitializeKey, topToolbarHeight, mobileNavHeight, containerRef]);

  // Separate effect to resize chart when oscillator height changes (without destroying it)
  useEffect(() => {
    if (!chartRef.current || !containerRef.current) return;
    
    const newHeight = window.innerHeight - topToolbarHeight - mobileNavHeight - totalOscillatorHeight;
    
    if (newHeight > 0) {
      const chart = chartRef.current;
      if (!chart) return;

      chartRef.current.applyOptions({ 
        height: newHeight 
      });

      restoreVisibleLogicalRange(chart, true);
      
      console.log('[Chart] Resized for oscillator change, new height:', newHeight);
    }
  }, [totalOscillatorHeight, topToolbarHeight, mobileNavHeight]);

  return { chartRef, candleSeriesRef, isReady, fitContent };
}

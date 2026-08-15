import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, HistogramSeries, Time } from 'lightweight-charts';

interface VolumePanelProps {
  data: { time: number; value: number; color?: string }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
  height?: number;
}

export function VolumePanel({ 
  data, 
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange,
  height = 120,
}: VolumePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    const chart = createChart(containerRef.current, { 
      width: containerRef.current.clientWidth, 
      height: containerRef.current.clientHeight || height, 
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        visible: true,
      },
      rightPriceScale: {
        borderColor: '#334155',
        scaleMargins: { top: 0.1, bottom: 0 },
      },
      crosshair: {
        mode: 0,
      },
    });

    chartRef.current = chart;
    
    // Notify parent about chart creation
    if (onChartCreated) {
      onChartCreated(chart);
    }
    
    // Sync with main chart if enabled
    if (syncWithMainChart && mainChartVisibleRange) {
      try {
        chart.timeScale().setVisibleRange(mainChartVisibleRange);
      } catch (e) { 
        console.warn('Failed to sync volume chart with main chart:', e);
      }
    }
    
    const volumeSeries = chart.addSeries(HistogramSeries, { 
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
    });
    
    volumeSeries.setData(data.map(d => ({ 
      ...d, 
      time: d.time as Time,
      color: d.color || '#26a69a'
    })));
    
    // Observe container size changes and resize chart accordingly
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height: newHeight } = entry.contentRect;
        if (chartRef.current && width > 0 && newHeight > 0) {
          chartRef.current.applyOptions({ width, height: newHeight });
        }
      }
    });
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, onChartCreated]);

  // Sync time axis with main chart when visible range changes
  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        chartRef.current.timeScale().setVisibleRange(mainChartVisibleRange);
      } catch (e) { /* ignore if range invalid */ }
    }
  }, [mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full h-full" data-testid="chart-volume" />;
}

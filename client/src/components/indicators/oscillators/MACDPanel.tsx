import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, HistogramSeries, Time } from 'lightweight-charts';

interface MACDPanelProps {
  macdData: { time: number; value: number }[];
  signalData: { time: number; value: number }[];
  histogramData: { time: number; value: number; color: string }[];
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
  height?: number;
}

export function MACDPanel({ 
  macdData, 
  signalData, 
  histogramData,
  fastPeriod,
  slowPeriod,
  signalPeriod,
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange,
  height = 200,
}: MACDPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !macdData || macdData.length === 0 || !signalData || !histogramData) return;

    const chart = createChart(containerRef.current, { 
      width: containerRef.current.clientWidth, 
      height: containerRef.current.clientHeight || height, 
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#475569',
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
      } catch (e) { /* ignore */ }
    }
    
    chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2 }).setData(macdData.map(d => ({ ...d, time: d.time as Time })));
    chart.addSeries(LineSeries, { color: '#ef5350', lineWidth: 2 }).setData(signalData.map(d => ({ ...d, time: d.time as Time })));
    chart.addSeries(HistogramSeries, { color: '#26a69a' }).setData(histogramData.map(d => ({ ...d, time: d.time as Time })));
    
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
  }, [macdData, signalData, histogramData, fastPeriod, slowPeriod, signalPeriod, onChartCreated]);

  // Sync time axis with main chart when visible range changes
  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        chartRef.current.timeScale().setVisibleRange(mainChartVisibleRange);
      } catch (e) { /* ignore if range invalid */ }
    }
  }, [mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full h-full" data-testid="chart-macd" />;
}

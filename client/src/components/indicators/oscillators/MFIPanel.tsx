import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time } from 'lightweight-charts';

interface MFIPanelProps {
  data: { time: number; value: number }[];
  period: number;
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function MFIPanel({ 
  data, 
  period, 
  candles, 
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange 
}: MFIPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    
    if (!candles || candles.length === 0) {
      return;
    }
    
    if (!data || data.length === 0) {
      return;
    }

    const chart = createChart(containerRef.current, { 
      width: containerRef.current.clientWidth, 
      height: containerRef.current.clientHeight || 200, 
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
    
    const line = chart.addSeries(LineSeries, { color: '#00bcd4', lineWidth: 2 });
    line.setData(data.map(d => ({ ...d, time: d.time as Time })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (80/20 for MFI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 80 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 20 })));

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
  }, [data, candles, period, onChartCreated]);

  // Sync time axis with main chart when visible range changes
  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        chartRef.current.timeScale().setVisibleRange(mainChartVisibleRange);
      } catch (e) { /* ignore if range invalid */ }
    }
  }, [mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full" style={{ height: '200px' }} data-testid="chart-mfi" />;
}

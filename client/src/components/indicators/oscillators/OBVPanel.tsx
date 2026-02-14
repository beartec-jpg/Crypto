import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time } from 'lightweight-charts';

interface OBVPanelProps {
  data: { time: number; value: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function OBVPanel({ 
  data, 
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange 
}: OBVPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    const chart = createChart(containerRef.current, { 
      width: containerRef.current.clientWidth, 
      height: 200, 
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
    
    chart.addSeries(LineSeries, { color: '#9580ff', lineWidth: 2 }).setData(data.map(d => ({ ...d, time: d.time as Time })));
    
    return () => {
      chart.remove();
    };
  }, [data, onChartCreated, syncWithMainChart, mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full" data-testid="chart-obv" />;
}

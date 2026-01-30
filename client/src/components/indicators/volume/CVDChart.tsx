import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time } from 'lightweight-charts';

interface CVDChartProps {
  data: { time: number; value: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function CVDChart({ 
  data, 
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange 
}: CVDChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

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
    
    const cvdSeries = chart.addSeries(LineSeries, { 
      color: '#2196F3', 
      lineWidth: 2,
      title: 'CVD'
    });
    
    cvdSeries.setData(data.map(d => ({ 
      ...d, 
      time: d.time as Time 
    })));
    
    // Add zero line for reference
    const zeroLine = chart.addSeries(LineSeries, { 
      color: '#666', 
      lineStyle: 1, 
      lineWidth: 1 
    });
    
    if (data.length > 0) {
      zeroLine.setData([
        { time: data[0].time as Time, value: 0 },
        { time: data[data.length - 1].time as Time, value: 0 }
      ]);
    }
    
    return () => {
      chart.remove();
    };
  }, [data, onChartCreated, syncWithMainChart, mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full" data-testid="chart-cvd" />;
}

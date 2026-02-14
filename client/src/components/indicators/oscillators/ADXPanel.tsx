import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time } from 'lightweight-charts';

interface ADXPanelProps {
  data: Array<{ time: number; adx: number; plusDI: number; minusDI: number }>;
  period: number;
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function ADXPanel({ 
  data, 
  period, 
  candles, 
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange 
}: ADXPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !candles || candles.length === 0 || !data || data.length === 0) return;

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
    
    const adxLine = chart.addSeries(LineSeries, { color: '#22c55e', lineWidth: 2, title: 'ADX' });
    const plusDILine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: '+DI' });
    const minusDILine = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 1, title: '-DI' });
    
    adxLine.setData(data.map(d => ({ time: d.time as Time, value: d.adx })));
    plusDILine.setData(data.map(d => ({ time: d.time as Time, value: d.plusDI })));
    minusDILine.setData(data.map(d => ({ time: d.time as Time, value: d.minusDI })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add strength level line (25 is typically considered strong trend)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 25 })));
    
    return () => {
      chart.remove();
    };
  }, [data, candles, period, onChartCreated, syncWithMainChart, mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full" data-testid="chart-adx" />;
}

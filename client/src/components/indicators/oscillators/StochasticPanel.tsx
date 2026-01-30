import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time } from 'lightweight-charts';

interface StochasticPanelProps {
  data: Array<{ time: number; k: number; d: number }>;
  period: number;
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function StochasticPanel({ 
  data, 
  period, 
  candles, 
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange 
}: StochasticPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

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
    
    const kLine = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, title: '%K' });
    const dLine = chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 2, title: '%D' });
    
    kLine.setData(data.map(d => ({ time: d.time as Time, value: d.k })));
    dLine.setData(data.map(d => ({ time: d.time as Time, value: d.d })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (80/20 for Stoch RSI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 80 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 20 })));
    
    return () => {
      chart.remove();
    };
  }, [data, candles, period, onChartCreated, syncWithMainChart, mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full" data-testid="chart-stoch-rsi" />;
}

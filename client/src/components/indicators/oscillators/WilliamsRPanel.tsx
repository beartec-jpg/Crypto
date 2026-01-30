import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time } from 'lightweight-charts';

interface WilliamsRPanelProps {
  data: { time: number; value: number }[];
  period: number;
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function WilliamsRPanel({ 
  data, 
  period, 
  candles, 
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange 
}: WilliamsRPanelProps) {
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
    
    const line = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2 });
    line.setData(data.map(d => ({ ...d, time: d.time as Time })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (-20/-80 for Williams %R)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: -20 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: -80 })));
    
    return () => {
      chart.remove();
    };
  }, [data, candles, period, onChartCreated, syncWithMainChart, mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full" data-testid="chart-williams-r" />;
}

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time } from 'lightweight-charts';

interface CCIPanelProps {
  data: { time: number; value: number }[];
  period: number;
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function CCIPanel({ 
  data, 
  period, 
  candles, 
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange 
}: CCIPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    console.log('[CCIPanel] Received data:', data?.length || 0, 'candles:', candles?.length || 0);
    
    if (!containerRef.current) {
      console.warn('[CCIPanel] Container ref not available');
      return;
    }
    
    if (!candles || candles.length === 0) {
      console.warn('[CCIPanel] No candles data');
      return;
    }
    
    if (!data || data.length === 0) {
      console.warn('[CCIPanel] No CCI data to render');
      return;
    }
    
    console.log('[CCIPanel] Creating chart with', containerRef.current.clientWidth, 'x 200px');

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
    console.log('[CCIPanel] Chart created successfully');
    
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
    
    const line = chart.addSeries(LineSeries, { color: '#ec4899', lineWidth: 2 });
    line.setData(data.map(d => ({ ...d, time: d.time as Time })));
    
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    
    // Add overbought/oversold lines (+100/-100 for CCI)
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 100 })));
    chart.addSeries(LineSeries, { color: '#666', lineStyle: 1, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: -100 })));
    chart.addSeries(LineSeries, { color: '#444', lineStyle: 2, lineWidth: 1 }).setData(candles.map(d => ({ time: d.time as Time, value: 0 })));
    
    return () => {
      chart.remove();
    };
  }, [data, candles, period, onChartCreated, syncWithMainChart, mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full" data-testid="chart-cci" style={{ minHeight: '200px' }} />;
}

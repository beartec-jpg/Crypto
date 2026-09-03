import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, HistogramSeries, Time } from 'lightweight-charts';
import { applyMainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';

interface VolumeChartProps {
  data: { time: number; value: number; color?: string }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function VolumeChart({ 
  data, 
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange 
}: VolumeChartProps) {
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
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        mouseWheel: false,
        pinch: false,
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

    if (syncWithMainChart && mainChartVisibleRange) {
      try {
        applyMainChartVisibleRange(chart, mainChartVisibleRange);
      } catch {
        /* ignore */
      }
    }
    
    return () => {
      chart.remove();
    };
  }, [data, onChartCreated, syncWithMainChart]);

  useEffect(() => {
    if (chartRef.current && syncWithMainChart && mainChartVisibleRange) {
      try {
        applyMainChartVisibleRange(chartRef.current, mainChartVisibleRange);
      } catch {
        /* ignore */
      }
    }
  }, [mainChartVisibleRange, syncWithMainChart]);

  return <div ref={containerRef} className="w-full" data-testid="chart-volume" />;
}

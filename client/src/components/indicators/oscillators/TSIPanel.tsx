import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time } from 'lightweight-charts';
import { applyMainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';

interface TSIPanelProps {
  tsiData: { time: number; value: number }[];
  signalData: { time: number; value: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function TSIPanel({
  tsiData,
  signalData,
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange,
}: TSIPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || tsiData.length === 0) return;

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
    onChartCreated?.(chart);


    chart.addSeries(LineSeries, { color: '#0ea5e9', lineWidth: 2 }).setData(
      tsiData.map(d => ({ ...d, time: d.time as Time })),
    );

    if (signalData.length > 0) {
      chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2 }).setData(
        signalData.map(d => ({ ...d, time: d.time as Time })),
      );
    }

    chart.addSeries(LineSeries, { color: '#64748b', lineStyle: 1, lineWidth: 1 }).setData(
      tsiData.map(d => ({ time: d.time as Time, value: 0 })),
    );

    // Sync viewport after data so empty right margin matches main chart
    if (mainChartVisibleRange) {
      applyMainChartVisibleRange(chart, mainChartVisibleRange);
    }

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (chartRef.current && width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [tsiData, signalData, onChartCreated, syncWithMainChart, mainChartVisibleRange]);

  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        applyMainChartVisibleRange(chartRef.current, mainChartVisibleRange);
      } catch {}
    }
  }, [mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full h-full" data-testid="chart-tsi" />;
}

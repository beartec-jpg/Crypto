import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, HistogramSeries, LineSeries, Time } from 'lightweight-charts';
import { applyMainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';

interface WaddahExplosionPanelProps {
  histogramData: { time: number; value: number; color: string }[];
  explosionData: { time: number; value: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function WaddahExplosionPanel({
  histogramData,
  explosionData,
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange,
}: WaddahExplosionPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || histogramData.length === 0) return;

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


    chart.addSeries(HistogramSeries, { base: 0 }).setData(
      histogramData.map(d => ({ ...d, time: d.time as Time })),
    );

    chart.addSeries(LineSeries, { color: '#facc15', lineWidth: 2 }).setData(
      explosionData.map(d => ({ ...d, time: d.time as Time })),
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
  }, [histogramData, explosionData, onChartCreated, syncWithMainChart, mainChartVisibleRange]);

  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        applyMainChartVisibleRange(chartRef.current, mainChartVisibleRange);
      } catch {}
    }
  }, [mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full h-full" data-testid="chart-waddah" />;
}

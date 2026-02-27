import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, Time } from 'lightweight-charts';

interface KlingerPanelProps {
  klingerData: { time: number; value: number }[];
  signalData: { time: number; value: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}

export function KlingerPanel({
  klingerData,
  signalData,
  onChartCreated,
  syncWithMainChart,
  mainChartVisibleRange,
}: KlingerPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || klingerData.length === 0) return;

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
    onChartCreated?.(chart);

    if (syncWithMainChart && mainChartVisibleRange) {
      try {
        chart.timeScale().setVisibleRange(mainChartVisibleRange);
      } catch {}
    }

    chart.addSeries(LineSeries, { color: '#14b8a6', lineWidth: 2 }).setData(
      klingerData.map(d => ({ ...d, time: d.time as Time })),
    );

    if (signalData.length > 0) {
      chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 2 }).setData(
        signalData.map(d => ({ ...d, time: d.time as Time })),
      );
    }

    chart.addSeries(LineSeries, { color: '#64748b', lineStyle: 1, lineWidth: 1 }).setData(
      klingerData.map(d => ({ time: d.time as Time, value: 0 })),
    );

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
  }, [klingerData, signalData, onChartCreated, syncWithMainChart, mainChartVisibleRange]);

  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        chartRef.current.timeScale().setVisibleRange(mainChartVisibleRange);
      } catch {}
    }
  }, [mainChartVisibleRange]);

  return <div ref={containerRef} className="w-full h-full" data-testid="chart-klinger" />;
}

import { useEffect, useRef } from 'react';
import { createChart, ColorType, HistogramSeries, LineSeries, type IChartApi, type Time } from 'lightweight-charts';
import { applyMainChartVisibleRange, type MainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';
import type { TideZonePoint } from '@/lib/indicators/tideZone';
import { tideZoneColor } from '@/lib/indicators/tideZone';
import { TideZoneHud } from '@/components/indicators/TideZoneHud';

interface TideZonePanelProps {
  data: TideZonePoint[];
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: MainChartVisibleRange;
  height?: number;
  /** Overlay HUD on this pane. Set false when a chart-level HUD is shown instead. */
  showHud?: boolean;
}

export function TideZonePanel({
  data,
  candles,
  onChartCreated,
  mainChartVisibleRange,
  height = 200,
  showHud = true,
}: TideZonePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !candles?.length || !data?.length) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth || containerRef.current.parentElement?.clientWidth || 300,
      height: containerRef.current.clientHeight || containerRef.current.parentElement?.clientHeight || height,
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

    const hist = chart.addSeries(HistogramSeries, { priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
    hist.setData(
      data.map((d) => ({
        time: d.time as Time,
        value: d.score,
        color: tideZoneColor(d.kind, d.score),
      })),
    );

    const mkLine = (value: number, color: string) => {
      chart.addSeries(LineSeries, { color, lineStyle: 1, lineWidth: 1 }).setData(
        candles.map((c) => ({ time: c.time as Time, value })),
      );
    };
    mkLine(40, '#22c55e66');
    mkLine(-40, '#ef444466');
    mkLine(0, '#475569');

    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });

    if (mainChartVisibleRange) {
      applyMainChartVisibleRange(chart, mainChartVisibleRange);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height: newHeight } = entry.contentRect;
        if (chartRef.current && width > 0 && newHeight > 0) {
          chartRef.current.applyOptions({ width, height: newHeight });
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, data, height, mainChartVisibleRange, onChartCreated]);

  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        applyMainChartVisibleRange(chartRef.current, mainChartVisibleRange);
      } catch {
        /* ignore if range invalid */
      }
    }
  }, [mainChartVisibleRange]);

  const last = data.length ? data[data.length - 1] : null;

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {showHud && last && (
        <div className="absolute top-1 left-1 right-12 z-20">
          <TideZoneHud last={last} />
        </div>
      )}
    </div>
  );
}

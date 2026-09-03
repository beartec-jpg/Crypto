import { useEffect, useRef } from 'react';
import { createChart, ColorType, HistogramSeries, LineSeries, type IChartApi, type Time } from 'lightweight-charts';
import { applyMainChartVisibleRange, type MainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';
import type { TideZonePoint } from '@/lib/indicators/tideZone';
import { tideZoneColor, tideZoneLabel } from '@/lib/indicators/tideZone';

interface TideZonePanelProps {
  data: TideZonePoint[];
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: MainChartVisibleRange;
  height?: number;
}

export function TideZonePanel({
  data,
  candles,
  onChartCreated,
  mainChartVisibleRange,
  height = 200,
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
  const readoutColor =
    last?.kind === 'follow_buy'
      ? 'text-emerald-400'
      : last?.kind === 'bounce_buy'
        ? 'text-amber-400'
        : last?.kind === 'sell'
          ? 'text-red-400'
          : 'text-slate-400';

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div ref={containerRef} className="min-h-0 w-full flex-1" />
      {last && (
        <div className="shrink-0 pt-1 px-0.5 text-[10px] leading-tight sm:text-[11px]">
          <span className={`font-semibold ${readoutColor}`}>{tideZoneLabel(last.kind)}</span>
          <span className="text-slate-500"> · {last.score.toFixed(0)}</span>
          <span className="text-slate-400">
            {' '}
            · Tide {(last.tide * 100).toFixed(0)} · Energy {(last.energy * 100).toFixed(0)} · Tape {(last.tape * 100).toFixed(0)}
          </span>
        </div>
      )}
    </div>
  );
}

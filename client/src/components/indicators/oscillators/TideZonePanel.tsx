// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
  ColorType,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import { Settings } from 'lucide-react';
import { applyMainChartVisibleRange, type MainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';
import type { TideZonePoint } from '@/lib/indicators/tideZone';
import { tideZoneColor } from '@/lib/indicators/tideZone';
import {
  computeTideCross,
  freshTideCross,
  inferTideTimeframe,
  type TideTimeframe,
} from '@/lib/indicators/tideSignals';
import { TideZoneHud } from '@/components/indicators/TideZoneHud';
import { TideZoneSettingsModal } from '@/components/modals/TideZoneSettingsModal';
import { useTideZoneSettings } from '@/hooks/useTideZoneSettings';
import { TIDE_IN_COLOR, TIDE_OUT_COLOR, TIDE_SHORT_COLOR, TIDE_LONG_COLOR } from '@/lib/indicators/tideColors';
import { buildTideDescriptor } from '@/lib/tideDescriptor';

interface PanelCandle {
  time: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

interface TideZonePanelProps {
  data: TideZonePoint[];
  candles: PanelCandle[];
  /**
   * Chart timeframe for Tide ('1h' | '4h'); null = Tide is off here (pane stays blank).
   * Omit to infer from candle spacing.
   */
  tideTimeframe?: TideTimeframe | null;
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: MainChartVisibleRange;
  height?: number;
  /** Overlay HUD on this pane. Set false when a chart-level HUD is shown instead. */
  showHud?: boolean;
  /**
   * overlay (default): HUD + EMA control float on the plot (fullscreen / popped-out).
   * stack: wrapping row above the plot so the hist keeps its full height (main indicators card).
   */
  chrome?: 'overlay' | 'stack';
  /** Live status / what-it's-showing / what-to-watch block under the hist. */
  showDescriptor?: boolean;
}

export function TideZonePanel({
  data,
  candles,
  tideTimeframe,
  onChartCreated,
  mainChartVisibleRange,
  height = 200,
  showHud = true,
  chrome = 'overlay',
  showDescriptor = false,
}: TideZonePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { settings } = useTideZoneSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tf = tideTimeframe !== undefined ? tideTimeframe : inferTideTimeframe(candles);
  const active = Boolean(tf && data.length);

  const cross = useMemo(
    () => (active ? computeTideCross(data, settings) : null),
    [active, data, settings],
  );

  useEffect(() => {
    if (!active || !containerRef.current || !candles?.length || !data?.length) return;

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
      chart.addSeries(LineSeries, { color, lineStyle: 1, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(
        candles.map((c) => ({ time: c.time as Time, value })),
      );
    };
    mkLine(40, '#22c55e66');
    mkLine(-40, '#ef444466');
    mkLine(0, '#475569');

    if (cross) {
      const line = (color: string, w: 1 | 2, pts: { time: number; value: number }[], label: boolean) => {
        const l = chart.addSeries(LineSeries, {
          color,
          lineWidth: w,
          priceLineVisible: false,
          lastValueVisible: label,
        });
        l.setData(pts.map((d) => ({ time: d.time as Time, value: d.value })));
        return l;
      };
      const shortDrives = settings.crossEma === 'short';
      const shortLine = line(TIDE_SHORT_COLOR, shortDrives ? 2 : 1, cross.emaShort, shortDrives);
      const longLine = line(TIDE_LONG_COLOR, shortDrives ? 1 : 2, cross.emaLong, !shortDrives);
      const driverLine = shortDrives ? shortLine : longLine;

      const marks: SeriesMarker<Time>[] = cross.signals.map((sg) =>
        sg.kind === 'in'
          ? { time: sg.time as Time, position: 'belowBar', shape: 'arrowUp', color: TIDE_IN_COLOR, text: 'in' }
          : { time: sg.time as Time, position: 'aboveBar', shape: 'arrowDown', color: TIDE_OUT_COLOR, text: 'out' },
      );
      // Markers sit on the driving EMA line, so they land on the cross itself.
      createSeriesMarkers(driverLine, marks);
    }

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
    // mainChartVisibleRange is applied by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, candles, data, height, onChartCreated, cross, settings.crossEma]);

  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        applyMainChartVisibleRange(chartRef.current, mainChartVisibleRange);
      } catch {
        /* ignore if range invalid */
      }
    }
  }, [mainChartVisibleRange]);

  const stacked = chrome === 'stack';
  const last = data.length ? data[data.length - 1] : undefined;
  const drivingSeries = cross ? (settings.crossEma === 'long' ? cross.emaLong : cross.emaShort) : [];
  const emaLast = drivingSeries.length ? drivingSeries[drivingSeries.length - 1].value : undefined;
  const emaPeriod = settings.crossEma === 'long' ? settings.emaLong : settings.emaShort;
  const fresh = cross ? freshTideCross(cross.signals, data)?.kind ?? null : null;
  const descriptor = showDescriptor
    ? buildTideDescriptor(
        active && tf
          ? { last: last ?? null, timeframe: tf, crossEma: settings.crossEma, emaPeriod, emaValue: emaLast, fresh }
          : { last: null, timeframe: tf },
      )
    : null;

  const descriptorBlock = descriptor ? (
    <div className="mt-2 min-w-0 space-y-1.5 border-t border-slate-700/80 pt-2">
      <div className={`break-words text-[11px] font-semibold ${descriptor.color}`}>{descriptor.headline}</div>
      <p className="break-words text-[12px] leading-relaxed text-slate-200">
        <span className="font-medium text-slate-500">What it&apos;s showing now: </span>
        {descriptor.showingNow}
      </p>
      <p className="break-words text-[11px] leading-relaxed text-slate-400">
        <span className="font-medium text-slate-500">What to watch: </span>
        {descriptor.watch}
      </p>
    </div>
  ) : null;

  if (!active || !tf) {
    if (stacked) {
      return (
        <div className="flex w-full min-w-0 flex-col">
          <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span className="min-w-0 break-words">Tide: 1h/4h only</span>
          </div>
          <div className="relative w-full min-w-0 bg-[#1e293b]" style={{ height }} />
          {descriptorBlock}
        </div>
      );
    }
    return (
      <div className="relative h-full min-h-0 w-full bg-[#1e293b]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
            <span>Tide: 1h/4h only</span>
          </div>
        </div>
      </div>
    );
  }

  const hud = showHud && last ? (
    <TideZoneHud
      last={last}
      timeframe={tf}
      fresh={fresh}
      emaShort={cross?.emaShort.length ? { period: settings.emaShort, value: cross.emaShort[cross.emaShort.length - 1].value } : undefined}
      emaLong={cross?.emaLong.length ? { period: settings.emaLong, value: cross.emaLong[cross.emaLong.length - 1].value } : undefined}
      crossEma={settings.crossEma}
      variant={stacked ? 'inline' : 'overlay'}
    />
  ) : null;

  const gear = (
    <button
      type="button"
      aria-label="Tide Zone settings"
      title="Tide Zone settings"
      onClick={(e) => {
        e.stopPropagation();
        setSettingsOpen(true);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded border border-slate-600/70 bg-slate-900/85 text-slate-300 hover:text-white"
    >
      <Settings className="h-3.5 w-3.5" />
    </button>
  );
  const modal = <TideZoneSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />;

  if (stacked) {
    return (
      <div className="flex w-full min-w-0 flex-col">
        <div className="mb-1.5 flex min-w-0 flex-wrap items-start gap-1.5">
          {hud ? <div className="min-w-0 flex-1">{hud}</div> : null}
          {gear}
        </div>
        <div className="relative w-full min-w-0 bg-[#1e293b]" style={{ height }}>
          <div ref={containerRef} className="absolute inset-0" />
        </div>
        {descriptorBlock}
        {modal}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {hud ? <div className="absolute top-1 left-1 right-24 z-20">{hud}</div> : null}
      <div className="absolute top-1 right-14 z-20">{gear}</div>
      {modal}
    </div>
  );
}

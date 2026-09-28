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
import { applyMainChartVisibleRange, type MainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';
import type { TideZonePoint } from '@/lib/indicators/tideZone';
import { emaTideScore, tideZoneColor } from '@/lib/indicators/tideZone';
import { computeTideV2, inferTideTimeframe, type TideCandle, type TideTimeframe } from '@/lib/indicators/tideSignals';
import { TideZoneHud } from '@/components/indicators/TideZoneHud';
import { TideHistEmaControl } from '@/components/indicators/TideHistEmaControl';
import { ConnectedTideZoneSettingsModal } from '@/components/modals/TideZoneSettingsModal';
import { useTideZoneSettings } from '@/hooks/useTideZoneSettings';
import { summarizeTide } from '@/hooks/useTideV2';

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
}

function toTideCandles(candles: PanelCandle[]): TideCandle[] | null {
  const out: TideCandle[] = [];
  for (const c of candles) {
    if (c.open == null || c.high == null || c.low == null || c.close == null) return null;
    out.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
  }
  return out;
}

export function TideZonePanel({
  data,
  candles,
  tideTimeframe,
  onChartCreated,
  mainChartVisibleRange,
  height = 200,
  showHud = true,
}: TideZonePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { settings } = useTideZoneSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tf = tideTimeframe !== undefined ? tideTimeframe : inferTideTimeframe(candles);
  const params = tf ? settings.byTimeframe[tf] : null;
  const active = Boolean(tf && params && data.length);
  const emaPeriod = params?.emaPeriod ?? 8;
  const exitEmaPeriod = params?.exitEmaPeriod ?? 8;

  const tideCandles = useMemo(() => toTideCandles(candles), [candles]);
  const v2 = useMemo(
    () => (active && params && tideCandles ? computeTideV2(tideCandles, data, params) : null),
    [active, params, tideCandles, data],
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
      chart.addSeries(LineSeries, { color, lineStyle: 1, lineWidth: 1 }).setData(
        candles.map((c) => ({ time: c.time as Time, value })),
      );
    };
    mkLine(40, '#22c55e66');
    mkLine(-40, '#ef444466');
    mkLine(0, '#475569');
    if (params && params.belowScore < 0 && params.belowScore !== -40) mkLine(params.belowScore, '#c084fc55');

    const ema = emaTideScore(data, emaPeriod);
    const emaLine = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    emaLine.setData(ema.map((d) => ({ time: d.time as Time, value: d.value })));
    let exitLine = emaLine;
    if (exitEmaPeriod !== emaPeriod) {
      exitLine = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      exitLine.setData(emaTideScore(data, exitEmaPeriod).map((d) => ({ time: d.time as Time, value: d.value })));
    }

    if (v2) {
      const outMarks: SeriesMarker<Time>[] = settings.showTideOut
        ? v2.signals.map((s) => ({
            time: s.confirmTime as Time,
            position: 'belowBar',
            shape: 'arrowUp',
            color: s.rsiPlus ? settings.tideOutPlusColor : settings.tideOutColor,
            text: s.rsiPlus ? 'out+' : 'out',
          }))
        : [];
      const inTimes = [...new Set(v2.trades.flatMap((t) => (t.tideInTime != null ? [t.tideInTime] : [])))];
      const inMarks: SeriesMarker<Time>[] = settings.showTideIn
        ? inTimes.map((time) => ({
            time: time as Time,
            position: 'aboveBar',
            shape: 'arrowDown',
            color: settings.tideInColor,
            text: 'in',
          }))
        : [];
      const byTime = (a: SeriesMarker<Time>, b: SeriesMarker<Time>) => (a.time as number) - (b.time as number);
      if (exitLine === emaLine) {
        createSeriesMarkers(emaLine, [...outMarks, ...inMarks].sort(byTime));
      } else {
        createSeriesMarkers(emaLine, outMarks.sort(byTime));
        createSeriesMarkers(exitLine, inMarks.sort(byTime));
      }
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
  }, [
    active,
    candles,
    data,
    height,
    onChartCreated,
    emaPeriod,
    exitEmaPeriod,
    params,
    v2,
    settings.showTideOut,
    settings.showTideIn,
    settings.tideOutColor,
    settings.tideOutPlusColor,
    settings.tideInColor,
  ]);

  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        applyMainChartVisibleRange(chartRef.current, mainChartVisibleRange);
      } catch {
        /* ignore if range invalid */
      }
    }
  }, [mainChartVisibleRange]);

  if (!active || !tf) {
    return (
      <div className="relative h-full min-h-0 w-full bg-[#1e293b]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>Tide: 1h/4h only</span>
            <TideHistEmaControl timeframe={null} onOpenSettings={() => setSettingsOpen(true)} />
          </div>
        </div>
        <ConnectedTideZoneSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  const last = data[data.length - 1];
  const emaSeries = emaTideScore(data, emaPeriod);
  const emaLast = emaSeries.length ? emaSeries[emaSeries.length - 1].value : undefined;

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute top-1 right-12 z-20">
        <TideHistEmaControl timeframe={tf} onOpenSettings={() => setSettingsOpen(true)} />
      </div>
      <ConnectedTideZoneSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} timeframe={tf} />
      {showHud && last && (
        <div className="absolute top-1 left-1 right-36 z-20">
          <TideZoneHud
            last={last}
            timeframe={tf}
            status={summarizeTide(v2, candles)}
            absorb={data.slice(-3).some((d) => d.tell === 'absorb')}
            distro={data.slice(-3).some((d) => d.tell === 'distro')}
            reacc={data.slice(-3).some((d) => d.tell === 'reacc')}
            emaPeriod={emaPeriod}
            emaValue={emaLast}
          />
        </div>
      )}
    </div>
  );
}

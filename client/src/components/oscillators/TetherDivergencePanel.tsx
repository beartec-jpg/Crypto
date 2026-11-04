import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import { applyMainChartVisibleRange, type MainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';
import { Settings } from 'lucide-react';
import { ConnectedTetherDivergenceSettingsModal } from '@/components/modals/TetherDivergenceSettingsModal';
import { useTetherDivergenceSettings } from '@/hooks/useTetherDivergenceSettings';
import {
  lastDefined,
  tetherZoneColor,
  tetherZoneLabel,
  type TetherDivergenceComputeResult,
} from '@/lib/indicators/tetherDivergence';

interface TetherDivergencePanelProps {
  data: TetherDivergenceComputeResult | null | undefined;
  candles: Array<{ time: number }>;
  approximate?: boolean;
  onChartCreated?: (chart: IChartApi) => void;
  mainChartVisibleRange?: MainChartVisibleRange;
  height?: number;
  showHud?: boolean;
  /** Overrides the empty-state text (loading / unavailable / stablecoin). */
  statusText?: string;
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(56,189,248,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function TetherDivergencePanel({
  data,
  candles,
  approximate = false,
  onChartCreated,
  mainChartVisibleRange,
  height = 200,
  showHud = true,
  statusText,
}: TetherDivergencePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { settings, setModalOpen } = useTetherDivergenceSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const active = Boolean(data && data.times.length && candles.length);

  useEffect(() => {
    if (!active || !containerRef.current || !data) return;

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
        scaleMargins: { top: 0.06, bottom: 0.38 },
      },
    });

    chartRef.current = chart;
    onChartCreated?.(chart);

    const toLine = (values: Array<number | null>, color: string, width: number, title?: string) => {
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: width as 1 | 2 | 3 | 4,
        priceLineVisible: false,
        lastValueVisible: true,
        title,
        priceScaleId: 'right',
      });
      line.setData(
        data.times.flatMap((t, i) =>
          values[i] == null ? [] : [{ time: t as Time, value: values[i] as number }],
        ),
      );
      return line;
    };

    const gapHist = chart.addSeries(HistogramSeries, {
      priceScaleId: 'right',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    gapHist.setData(
      data.times.map((t, i) => ({
        time: t as Time,
        value: data.gap[i] ? 100 : 0,
        color: data.gap[i] ? hexAlpha(settings.gapColor, 0.22) : 'rgba(0,0,0,0)',
      })),
    );

    toLine(data.usdtRsi, settings.usdtRsiColor, 2, 'USDT.D RSI');
    toLine(data.coinRsi, settings.coinRsiColor, 2, 'Coin RSI');

    const mkRef = (value: number, color: string) => {
      chart.addSeries(LineSeries, {
        color,
        lineStyle: 1,
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        priceScaleId: 'right',
      }).setData(candles.map((c) => ({ time: c.time as Time, value })));
    };
    mkRef(70, '#64748b66');
    mkRef(50, '#475569');
    mkRef(30, '#64748b66');

    const scoreHist = chart.addSeries(HistogramSeries, {
      priceScaleId: 'score',
      lastValueVisible: true,
      priceLineVisible: false,
      title: 'Score',
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
    });
    scoreHist.setData(
      data.times.flatMap((t, i) =>
        data.score[i] == null
          ? []
          : [{
              time: t as Time,
              value: data.score[i] as number,
              color: tetherZoneColor(data.zone[i], settings),
            }],
      ),
    );
    chart.priceScale('score').applyOptions({
      scaleMargins: { top: 0.68, bottom: 0.02 },
      borderVisible: false,
      visible: false,
    });

    if (settings.topMirror) {
      const top = chart.addSeries(LineSeries, {
        color: hexAlpha(settings.topColor, 0.35),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        title: 'Top zone (unvalidated)',
        priceScaleId: 'score',
      });
      top.setData(
        data.times.flatMap((t, i) =>
          data.topScore[i] == null ? [] : [{ time: t as Time, value: data.topScore[i] as number }],
        ),
      );
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    candles,
    data,
    height,
    onChartCreated,
    settings.usdtRsiColor,
    settings.coinRsiColor,
    settings.gapColor,
    settings.bottomColor,
    settings.watchColor,
    settings.neutralColor,
    settings.topColor,
    settings.topMirror,
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

  const openSettings = () => {
    setSettingsOpen(true);
    setModalOpen(true);
  };

  if (!active || !data) {
    return (
      <div className="relative h-full min-h-0 w-full bg-[#1e293b]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>{statusText ?? 'Tether Divergence: waiting on daily data'}</span>
            <button type="button" onClick={openSettings} className="text-slate-400 hover:text-white" aria-label="Tether Divergence settings">
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <ConnectedTetherDivergenceSettingsModal isOpen={settingsOpen} onClose={() => { setSettingsOpen(false); setModalOpen(false); }} />
      </div>
    );
  }

  const lastScore = lastDefined(data.score);
  const lastZone = lastDefined(data.zone);
  const lastTop = lastDefined(data.topScore);

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <button
        type="button"
        onClick={openSettings}
        className="absolute top-1 right-2 z-20 text-slate-400 hover:text-white"
        aria-label="Tether Divergence settings"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
      <ConnectedTetherDivergenceSettingsModal
        isOpen={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setModalOpen(false);
        }}
      />
      {showHud && lastScore != null && (
        <div className="absolute top-1 left-1 right-10 z-20 pointer-events-none">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-semibold" style={{ color: tetherZoneColor(lastZone, settings) }}>
              {approximate ? '≈ ' : ''}
              {lastScore.toFixed(0)} {tetherZoneLabel(lastZone)}
            </span>
            {settings.topMirror && lastTop != null && lastTop >= settings.topThreshold && (
              <span className="text-[10px] text-red-400/50">Top zone (unvalidated)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

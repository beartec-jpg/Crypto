import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, HistogramSeries, Time, createSeriesMarkers } from 'lightweight-charts';
import { SqueezeMomentumValue, SqueezeMomentumSettings } from '@/types/squeezeMomentum';

interface SqueezeMomentumPanelProps {
  data: SqueezeMomentumValue[];
  settings: SqueezeMomentumSettings;
  mainChartVisibleRange?: any;
  height?: number;
}

export function SqueezeMomentumPanel({
  data,
  settings,
  mainChartVisibleRange,
  height = 150,
}: SqueezeMomentumPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || height,
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

    const colorMap: Record<SqueezeMomentumValue['color'], string> = {
      cyan: settings.momentumUpIncColor,
      blue: settings.momentumUpDecColor,
      red: settings.momentumDownIncColor,
      yellow: settings.momentumDownDecColor,
    };

    const histogramSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });

    histogramSeries.setData(
      data.map(d => ({
        time: d.time as Time,
        value: d.value,
        color: colorMap[d.color],
      }))
    );

    if (settings.showZeroLine) {
      histogramSeries.createPriceLine({
        price: 0,
        color: settings.zeroLineColor,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
      });
    }

    if (settings.showDots) {
      createSeriesMarkers(
        histogramSeries,
        data.map(d => ({
          time: d.time as Time,
          position: 'inBar' as const,
          color: d.sqzOn ? settings.sqzOnColor : settings.sqzOffColor,
          shape: 'circle' as const,
          size: 1,
        }))
      );
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
  }, [data, settings, height]);

  useEffect(() => {
    if (chartRef.current && mainChartVisibleRange) {
      try {
        chartRef.current.timeScale().setVisibleRange(mainChartVisibleRange);
      } catch (e) { /* ignore if range invalid */ }
    }
  }, [mainChartVisibleRange]);

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-1 left-2 z-10 flex items-center gap-2 text-xs text-slate-400 pointer-events-none">
        <span className="font-semibold text-slate-300">Squeeze Momentum</span>
        {settings.showDots && (
          <>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: settings.sqzOnColor }} />
              <span>ON</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: settings.sqzOffColor }} />
              <span>OFF</span>
            </span>
          </>
        )}
      </div>
      <div ref={containerRef} className="w-full h-full" data-testid="chart-squeeze-momentum" />
    </div>
  );
}

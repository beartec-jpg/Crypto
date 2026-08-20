import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts';

interface HighLowRendererProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  candles: Array<{ time: number; high: number; low: number; close: number }>;
  enabled: boolean;
}

function candleTime(c: { time: number }): number {
  const t = Number(c.time);
  // Chart data is unix seconds; vis range can be seconds or ms
  return t > 1e12 ? t / 1000 : t;
}

export function HighLowRenderer({ chart, candleSeries, candles, enabled }: HighLowRendererProps) {
  const linesRef = useRef<{ high: IPriceLine; low: IPriceLine } | null>(null);

  useEffect(() => {
    const removeLines = () => {
      if (!linesRef.current || !candleSeries) {
        linesRef.current = null;
        return;
      }
      try { candleSeries.removePriceLine(linesRef.current.high); } catch { /* ignore */ }
      try { candleSeries.removePriceLine(linesRef.current.low); } catch { /* ignore */ }
      linesRef.current = null;
    };

    if (!enabled || !chart || !candleSeries || candles.length === 0) {
      removeLines();
      return;
    }

    const timeScale = chart.timeScale();

    const syncLines = () => {
      const visible = timeScale.getVisibleRange();
      if (!visible) return;

      const from = Number(visible.from);
      const to = Number(visible.to);
      const fromSec = from > 1e12 ? from / 1000 : from;
      const toSec = to > 1e12 ? to / 1000 : to;

      const visibleCandles = candles.filter((c) => {
        const t = candleTime(c);
        return t >= fromSec && t <= toSec;
      });
      const slice = visibleCandles.length ? visibleCandles : candles;
      const visibleHigh = Math.max(...slice.map((c) => c.high));
      const visibleLow = Math.min(...slice.map((c) => c.low));
      if (!Number.isFinite(visibleHigh) || !Number.isFinite(visibleLow)) return;

      const currentPrice = candles[candles.length - 1]?.close || 0;
      const highPct = currentPrice > 0 ? ((visibleHigh - currentPrice) / currentPrice * 100).toFixed(2) : '0.00';
      const lowPct = currentPrice > 0 ? ((visibleLow - currentPrice) / currentPrice * 100).toFixed(2) : '0.00';

      const highOpts = {
        price: visibleHigh,
        color: 'rgba(255, 152, 0, 0.85)',
        lineWidth: 2 as const,
        lineStyle: 2 as const,
        axisLabelVisible: true,
        title: `High ${visibleHigh.toFixed(4)} (+${highPct}%)`,
      };
      const lowOpts = {
        price: visibleLow,
        color: 'rgba(0, 230, 118, 0.85)',
        lineWidth: 2 as const,
        lineStyle: 2 as const,
        axisLabelVisible: true,
        title: `Low ${visibleLow.toFixed(4)} (${lowPct}%)`,
      };

      if (linesRef.current) {
        try {
          linesRef.current.high.applyOptions(highOpts);
          linesRef.current.low.applyOptions(lowOpts);
          return;
        } catch {
          removeLines();
        }
      }

      try {
        const high = candleSeries.createPriceLine(highOpts);
        const low = candleSeries.createPriceLine(lowOpts);
        linesRef.current = { high, low };
      } catch (e) {
        console.warn('[HighLow] failed to create price lines', e);
      }
    };

    syncLines();
    timeScale.subscribeVisibleLogicalRangeChange(syncLines);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(syncLines);
      removeLines();
    };
  }, [chart, candleSeries, candles, enabled]);

  return null;
}

import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

interface HighLowRendererProps {
  chart: IChartApi;
  candleSeries: ISeriesApi<'Candlestick'>;
  candles: any[]; // { time: number; open: number; high: number; low: number; close: number; }[]
  enabled: boolean;
}

export function HighLowRenderer({ chart, candleSeries, candles, enabled }: HighLowRendererProps) {
  const highLowRef = useRef<{ highLine: any; lowLine: any; highLabel: any; lowLabel: any } | null>(null);

  useEffect(() => {
    if (!enabled || !chart || candles.length === 0) {
      // Clean up using series.removePriceLine (v5 API)
      if (highLowRef.current && candleSeries) {
        const { highLine, lowLine } = highLowRef.current;
        try { if (highLine) candleSeries.removePriceLine(highLine); } catch (e) { /* ignore */ }
        try { if (lowLine) candleSeries.removePriceLine(lowLine); } catch (e) { /* ignore */ }
        highLowRef.current = null;
      }
      return;
    }

    const timeScale = chart.timeScale();
    const removeLines = () => {
      if (highLowRef.current) {
        const { highLine, lowLine } = highLowRef.current;
        try { if (highLine) candleSeries.removePriceLine(highLine); } catch (e) { /* ignore */ }
        try { if (lowLine) candleSeries.removePriceLine(lowLine); } catch (e) { /* ignore */ }
        highLowRef.current = null;
      }
    };

    const handleVisibleRangeChange = () => {
      const visibleLogicalRange = timeScale.getVisibleLogicalRange();
      if (!visibleLogicalRange || candles.length === 0) return;

      const firstVisibleBar = Math.max(0, Math.floor(visibleLogicalRange.from));
      const lastVisibleBar = Math.min(candles.length - 1, Math.ceil(visibleLogicalRange.to) - 1);

      if (firstVisibleBar > lastVisibleBar) return;

      const visibleCandles = candles.slice(firstVisibleBar, lastVisibleBar + 1);
      const visibleHigh = Math.max(...visibleCandles.map(c => c.high));
      const visibleLow = Math.min(...visibleCandles.map(c => c.low));
      const currentPrice = candles[candles.length - 1]?.close || 0;

      const highPct = currentPrice > 0 ? ((visibleHigh - currentPrice) / currentPrice * 100).toFixed(2) : '0.00';
      const lowPct = currentPrice > 0 ? ((visibleLow - currentPrice) / currentPrice * 100).toFixed(2) : '0.00';

      // Remove old lines before creating new ones
      removeLines();

      // High line & label
      const highLine = candleSeries.createPriceLine({
        price: visibleHigh,
        color: 'rgba(255, 152, 0, 0.8)',
        lineWidth: 2,
        lineStyle: 2,
        title: `High: $${visibleHigh.toFixed(4)} (+${highPct}%)`,
        axisLabelColor: 'rgba(255, 152, 0, 0.9)',
      });

      // Low line & label
      const lowLine = candleSeries.createPriceLine({
        price: visibleLow,
        color: 'rgba(0, 230, 118, 0.8)',
        lineWidth: 2,
        lineStyle: 2,
        title: `Low: $${visibleLow.toFixed(4)} (${lowPct}%)`,
        axisLabelColor: 'rgba(0, 230, 118, 0.9)',
      });

      highLowRef.current = { highLine, lowLine, highLabel: null, lowLabel: null };
    };

    // Initial
    handleVisibleRangeChange();

    // Subscribe to visible range changes so lines update on scroll/zoom
    timeScale.subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      removeLines();
    };
  }, [chart, candleSeries, candles, enabled]);

  return null; // Renders via chart price lines
}

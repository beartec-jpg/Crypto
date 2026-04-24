import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, SeriesMarker } from 'lightweight-charts';

interface HighLowRendererProps {
  chart: IChartApi;
  candleSeries: ISeriesApi<'Candlestick'>;
  candles: any[]; // { time: number; open: number; high: number; low: number; close: number; }[]
  enabled: boolean;
}

export function HighLowRenderer({ chart, candleSeries, candles, enabled }: HighLowRendererProps) {
  const highLowRef = useRef<{ highLine: any; lowLine: any; highLabel: any; lowLabel: any } | null>(null);
  const [currentHighLow, setCurrentHighLow] = useState<{ high: number; low: number; highPct: string; lowPct: string } | null>(null);

  useEffect(() => {
    if (!enabled || !chart || candles.length === 0) {
      // Clean up
      if (highLowRef.current) {
        const { highLine, lowLine, highLabel, lowLabel } = highLowRef.current;
        highLine?.remove();
        lowLine?.remove();
        highLabel?.remove();
        lowLabel?.remove();
        highLowRef.current = null;
      }
      return;
    }

    const timeScale = chart.timeScale();
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

      const highPct = ((visibleHigh - currentPrice) / currentPrice * 100).toFixed(2) + '%';
      const lowPct = ((currentPrice - visibleLow) / currentPrice * 100).toFixed(2) + '%';

      setCurrentHighLow({ high: visibleHigh, low: visibleLow, highPct, lowPct });

      // Remove old
      if (highLowRef.current) {
        const { highLine, lowLine, highLabel, lowLabel } = highLowRef.current;
        highLine?.remove();
        lowLine?.remove();
        highLabel?.remove();
        lowLabel?.remove();
      }

      // High line & label
      const highLine = candleSeries.createPriceLine({
        price: visibleHigh,
        color: 'rgba(255, 152, 0, 0.8)',
        lineWidth: 2,
        lineStyle: 2,
        title: `High: $${visibleHigh.toFixed(4)} (+${highPct})`,
        axisLabelColor: 'rgba(255, 152, 0, 0.9)',
        axisLabelSize: 10,
      });

      // Low line & label
      const lowLine = candleSeries.createPriceLine({
        price: visibleLow,
        color: 'rgba(0, 230, 118, 0.8)',
        lineWidth: 2,
        lineStyle: 2,
        title: `Low: $${visibleLow.toFixed(4)} (${lowPct} to go)`,
        axisLabelColor: 'rgba(0, 230, 118, 0.9)',
        axisLabelSize: 10,
      });

      highLowRef.current = { highLine, lowLine, highLabel: null, lowLabel: null };
    };

    // Initial
    handleVisibleRangeChange();

    // Subscribe
    const handle = timeScale.subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handle);
      if (highLowRef.current) {
        const { highLine, lowLine } = highLowRef.current;
        highLine?.remove();
        lowLine?.remove();
      }
    };
  }, [chart, candleSeries, candles, enabled]);

  return null; // Renders via chart price lines
}

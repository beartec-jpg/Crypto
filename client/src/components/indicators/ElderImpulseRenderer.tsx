import { useEffect, useRef } from 'react';
import { HistogramSeries, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { calculateEMA, calculateMACD } from '@/lib/indicators/momentum';

interface ElderImpulseRendererProps {
  chart: IChartApi | null;
  candles: Array<{ time: number; close: number }>;
  show: boolean;
}

export function ElderImpulseRenderer({ chart, candles, show }: ElderImpulseRendererProps) {
  const seriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!chart) return;

    if (!show) {
      if (seriesRef.current) {
        try {
          chart.removeSeries(seriesRef.current);
        } catch {}
        seriesRef.current = null;
      }
      return;
    }

    if (!candles || candles.length < 30) return;

    if (!seriesRef.current) {
      seriesRef.current = chart.addSeries(HistogramSeries, {
        priceScaleId: 'elder-impulse',
        lastValueVisible: false,
        priceLineVisible: false,
      });

      chart.priceScale('elder-impulse').applyOptions({
        scaleMargins: {
          top: 0.82,
          bottom: 0,
        },
      });
    }

    const closes = candles.map(c => c.close);
    const ema13 = calculateEMA(closes, 13);
    const macd = calculateMACD(
      candles.map(c => ({
        time: c.time,
        open: c.close,
        high: c.close,
        low: c.close,
        close: c.close,
        volume: 1,
      })),
      12,
      26,
      9,
    );

    const emaOffset = closes.length - ema13.length;
    const emaByTime = new Map<number, number>();
    ema13.forEach((value, index) => {
      emaByTime.set(candles[index + emaOffset].time, value);
    });

    const histByTime = new Map<number, number>();
    macd.hist.forEach(point => {
      histByTime.set(point.time, point.value);
    });

    const seriesData: { time: Time; value: number; color: string }[] = [];

    for (let i = 1; i < candles.length; i++) {
      const time = candles[i].time;
      const previousTime = candles[i - 1].time;
      const emaCurrent = emaByTime.get(time);
      const emaPrevious = emaByTime.get(previousTime);
      const histCurrent = histByTime.get(time);
      const histPrevious = histByTime.get(previousTime);

      if (
        emaCurrent === undefined ||
        emaPrevious === undefined ||
        histCurrent === undefined ||
        histPrevious === undefined
      ) {
        continue;
      }

      const emaRising = emaCurrent > emaPrevious;
      const histRising = histCurrent > histPrevious;
      const emaFalling = emaCurrent < emaPrevious;
      const histFalling = histCurrent < histPrevious;

      const color = emaRising && histRising
        ? '#22c55e'
        : emaFalling && histFalling
          ? '#ef4444'
          : '#3b82f6';

      seriesData.push({
        time: time as Time,
        value: 1,
        color,
      });
    }

    seriesRef.current.setData(seriesData);
  }, [chart, candles, show]);

  useEffect(() => {
    return () => {
      if (chart && seriesRef.current) {
        try {
          chart.removeSeries(seriesRef.current);
        } catch {}
        seriesRef.current = null;
      }
    };
  }, [chart]);

  return null;
}

import { useEffect, useRef } from 'react';
import { IChartApi, LineSeries, ISeriesApi, LineWidth } from 'lightweight-charts';
import { BandValue } from '@/lib/indicators';

interface BollingerBandsOverlayProps {
  chart: IChartApi | null;
  bbData: { upper: BandValue[]; middle: BandValue[]; lower: BandValue[] };
  show: boolean;
}

export function BollingerBandsOverlay({ chart, bbData, show }: BollingerBandsOverlayProps) {
  const bbSeriesRefs = useRef<{
    upper?: ISeriesApi<'Line'>;
    middle?: ISeriesApi<'Line'>;
    lower?: ISeriesApi<'Line'>;
  }>({});

  useEffect(() => {
    if (!chart) return;

    const refs = bbSeriesRefs.current;

    // Helper to manage BB lines
    const manageBBLine = (
      key: 'upper' | 'middle' | 'lower',
      show: boolean,
      data: { time: number; value: number }[],
      color: string,
      lineStyle: number = 0,
      lineWidth: LineWidth = 2 as LineWidth
    ) => {
      if (show) {
        if (!refs[key]) {
          try {
            refs[key] = chart.addSeries(LineSeries, {
              color,
              lineWidth,
              lineStyle,
              priceLineVisible: false,
              lastValueVisible: false,
            });
          } catch (e) {
            return;
          }
        }
        try {
          refs[key]!.setData(data as any);
        } catch (e) {
          // Series might be disposed
        }
      } else if (!show && refs[key]) {
        try {
          chart.removeSeries(refs[key]!);
        } catch (e) {
          // Series might already be disposed
        }
        refs[key] = undefined;
      }
    };

    manageBBLine('upper', show, bbData.upper, '#9333ea', 0, 1 as LineWidth);
    manageBBLine('middle', show, bbData.middle, '#9333ea', 2, 1 as LineWidth);
    manageBBLine('lower', show, bbData.lower, '#9333ea', 0, 1 as LineWidth);

    return () => {
      Object.keys(refs).forEach(key => {
        const seriesKey = key as 'upper' | 'middle' | 'lower';
        if (refs[seriesKey]) {
          try {
            chart.removeSeries(refs[seriesKey]!);
          } catch (e) {}
          refs[seriesKey] = undefined;
        }
      });
    };
  }, [chart, bbData, show]);

  return null;
}

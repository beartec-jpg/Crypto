import { useEffect, useRef } from 'react';
import { IChartApi, LineSeries, ISeriesApi, LineType, LineWidth, Time } from 'lightweight-charts';
import {
  calculateVolumeEmaOverlay,
  type VolumeEmaCandle,
  type VolumeEmaOverlayOptions,
} from '@/lib/indicators/volumeEmaOverlay';

/** Single continuous Vol EMA path */
const COLOR_LINE = '#22d3ee';

interface VolumeEmaOverlayProps {
  chart: IChartApi | null;
  candles: VolumeEmaCandle[];
  show: boolean;
  options?: VolumeEmaOverlayOptions;
}

export function VolumeEmaOverlay({ chart, candles, show, options }: VolumeEmaOverlayProps) {
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Create / destroy series with show + chart
  useEffect(() => {
    if (!chart || !show) {
      if (seriesRef.current && chart) {
        try {
          chart.removeSeries(seriesRef.current);
        } catch {
          /* disposed */
        }
        seriesRef.current = null;
      }
      return;
    }

    try {
      if (!seriesRef.current) {
        seriesRef.current = chart.addSeries(LineSeries, {
          color: COLOR_LINE,
          lineWidth: 2 as LineWidth,
          lineType: LineType.Curved,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'Vol EMA',
          crosshairMarkerVisible: true,
        });
      }
    } catch {
      return;
    }

    return () => {
      if (seriesRef.current) {
        try {
          chart.removeSeries(seriesRef.current);
        } catch {
          /* disposed */
        }
        seriesRef.current = null;
      }
    };
  }, [chart, show]);

  // Push data when candles / options change
  useEffect(() => {
    if (!chart || !show || !seriesRef.current) return;

    const points = calculateVolumeEmaOverlay(candles, options);
    try {
      if (points.length === 0) {
        seriesRef.current.setData([]);
        return;
      }
      seriesRef.current.setData(
        points.map((p) => ({
          time: p.time as Time,
          value: p.value,
        })),
      );
    } catch {
      /* disposed */
    }
  }, [chart, show, candles, options]);

  return null;
}

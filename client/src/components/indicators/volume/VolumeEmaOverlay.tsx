import { useEffect, useRef } from 'react';
import {
  IChartApi,
  LineSeries,
  ISeriesApi,
  LineType,
  LineWidth,
  Time,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
} from 'lightweight-charts';
import {
  buildVolumeEmaSpikes,
  calculateVolumeEmaOverlay,
  formatVolumeEmaLabel,
  type VolumeEmaCandle,
  type VolumeEmaOverlayOptions,
} from '@/lib/indicators/volumeEmaOverlay';

/** Single continuous Vol EMA path */
const COLOR_LINE = '#22d3ee';
const COLOR_BUY_SPIKE = '#22c55e';
const COLOR_SELL_SPIKE = '#ef4444';

interface VolumeEmaOverlayProps {
  chart: IChartApi | null;
  candles: VolumeEmaCandle[];
  show: boolean;
  options?: VolumeEmaOverlayOptions;
}

export function VolumeEmaOverlay({ chart, candles, show, options }: VolumeEmaOverlayProps) {
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // Create / destroy series with show + chart
  useEffect(() => {
    if (!chart || !show) {
      if (markersRef.current) {
        try {
          markersRef.current.detach();
        } catch {
          /* disposed */
        }
        markersRef.current = null;
      }
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
      if (!markersRef.current && seriesRef.current) {
        // autoScaleMarkers ensures offset triangles stay visible in the pane
        markersRef.current = createSeriesMarkers(seriesRef.current, [], {
          autoScale: true,
        });
      }
    } catch {
      return;
    }

    return () => {
      if (markersRef.current) {
        try {
          markersRef.current.detach();
        } catch {
          /* disposed */
        }
        markersRef.current = null;
      }
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

  // Push line + spike markers when candles / options change
  useEffect(() => {
    if (!chart || !show || !seriesRef.current) return;

    const points = calculateVolumeEmaOverlay(candles, options);
    const last = points.length > 0 ? points[points.length - 1] : null;
    const label = formatVolumeEmaLabel(last?.ratio);

    try {
      seriesRef.current.applyOptions({ title: label });

      if (points.length === 0) {
        seriesRef.current.setData([]);
        markersRef.current?.setMarkers([]);
        return;
      }

      seriesRef.current.setData(
        points.map((p) => ({
          time: p.time as Time,
          value: p.value,
        })),
      );

      const spikes = buildVolumeEmaSpikes(candles, points, options);

      // Price-positioned markers sit clear of candle wicks (pad via ATR)
      const markers: SeriesMarker<Time>[] = spikes.map((s) => {
        const isBuy = s.direction === 'buy';
        return {
          time: s.time as Time,
          position: 'atPriceMiddle' as const,
          price: s.markerPrice,
          shape: (isBuy ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          color: isBuy ? COLOR_BUY_SPIKE : COLOR_SELL_SPIKE,
          size: 1,
          text: `${s.ratio.toFixed(1)}×`,
        };
      });

      if (markersRef.current) {
        markersRef.current.setMarkers(markers);
      } else {
        markersRef.current = createSeriesMarkers(seriesRef.current, markers, {
          autoScale: true,
        });
      }
    } catch {
      /* disposed */
    }
  }, [chart, show, candles, options]);

  return null;
}

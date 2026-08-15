import { useEffect, useRef } from 'react';
import {
  IChartApi,
  LineSeries,
  ISeriesApi,
  LineType,
  LineStyle,
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
import type { VolumeEmaSettings } from '@/types/volumeEma';
import { DEFAULT_VOLUME_EMA_SETTINGS } from '@/types/volumeEma';

interface VolumeEmaOverlayProps {
  chart: IChartApi | null;
  candles: VolumeEmaCandle[];
  show: boolean;
  /** Display settings (color / width / style). */
  settings?: VolumeEmaSettings;
  /** Math options override (optional). */
  options?: VolumeEmaOverlayOptions;
}

function toLineStyle(style: VolumeEmaSettings['lineStyle']): LineStyle {
  if (style === 'dashed') return LineStyle.Dashed;
  if (style === 'dotted') return LineStyle.Dotted;
  return LineStyle.Solid;
}

export function VolumeEmaOverlay({
  chart,
  candles,
  show,
  settings = DEFAULT_VOLUME_EMA_SETTINGS,
  options,
}: VolumeEmaOverlayProps) {
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
          color: settings.color,
          lineWidth: Math.min(4, Math.max(1, settings.lineWidth)) as LineWidth,
          lineStyle: toLineStyle(settings.lineStyle),
          lineType: settings.curved ? LineType.Curved : LineType.Simple,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'Vol EMA',
          crosshairMarkerVisible: true,
        });
      }
      if (!markersRef.current && seriesRef.current) {
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
    // Recreate when curved changes (lineType is sticky at create for some versions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, show, settings.curved]);

  // Style updates without full teardown
  useEffect(() => {
    if (!seriesRef.current || !show) return;
    try {
      seriesRef.current.applyOptions({
        color: settings.color,
        lineWidth: Math.min(4, Math.max(1, settings.lineWidth)) as LineWidth,
        lineStyle: toLineStyle(settings.lineStyle),
        lineType: settings.curved ? LineType.Curved : LineType.Simple,
      });
    } catch {
      /* disposed */
    }
  }, [
    show,
    settings.color,
    settings.lineWidth,
    settings.lineStyle,
    settings.curved,
  ]);

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

      if (!settings.showSpikes) {
        markersRef.current?.setMarkers([]);
        return;
      }

      const spikes = buildVolumeEmaSpikes(candles, points, options);
      const markers: SeriesMarker<Time>[] = spikes.map((s) => {
        const isBuy = s.direction === 'buy';
        return {
          time: s.time as Time,
          position: 'atPriceMiddle' as const,
          price: s.markerPrice,
          shape: (isBuy ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          color: isBuy ? settings.buySpikeColor : settings.sellSpikeColor,
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
  }, [
    chart,
    show,
    candles,
    options,
    settings.showSpikes,
    settings.buySpikeColor,
    settings.sellSpikeColor,
  ]);

  return null;
}

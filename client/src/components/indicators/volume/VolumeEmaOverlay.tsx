import { useEffect, useRef } from 'react';
import { IChartApi, LineSeries, ISeriesApi, LineWidth, Time } from 'lightweight-charts';
import {
  calculateVolumeEmaOverlay,
  type VolumeEmaCandle,
  type VolumeEmaOverlayOptions,
  type VolumeEmaPoint,
} from '@/lib/indicators/volumeEmaOverlay';

/** Elevated / neutral volume (at or above mid) */
const COLOR_ELEVATED = '#22d3ee';
/** Dry volume (below mid) */
const COLOR_DRY = '#fb923c';

interface VolumeEmaOverlayProps {
  chart: IChartApi | null;
  candles: VolumeEmaCandle[];
  show: boolean;
  options?: VolumeEmaOverlayOptions;
}

type LinePoint = { time: Time; value: number };
type SeriesPoint = LinePoint | { time: Time };

/**
 * Split overlay points into elevated / dry series with whitespace gaps so
 * each regime keeps its own color without connecting across flips.
 */
function splitByRegime(points: VolumeEmaPoint[]): {
  elevated: SeriesPoint[];
  dry: SeriesPoint[];
} {
  const elevated: SeriesPoint[] = [];
  const dry: SeriesPoint[] = [];

  let prevElevated = false;
  let prevDry = false;

  for (const p of points) {
    const t = p.time as Time;
    const isElevated = p.regime !== 'dry'; // neutral rides with elevated (on mid)
    const isDry = p.regime === 'dry';

    if (isElevated) {
      elevated.push({ time: t, value: p.value });
      prevElevated = true;
    } else if (prevElevated) {
      elevated.push({ time: t }); // whitespace break
      prevElevated = false;
    }

    if (isDry) {
      dry.push({ time: t, value: p.value });
      prevDry = true;
    } else if (prevDry) {
      dry.push({ time: t }); // whitespace break
      prevDry = false;
    }
  }

  return { elevated, dry };
}

export function VolumeEmaOverlay({ chart, candles, show, options }: VolumeEmaOverlayProps) {
  const elevatedRef = useRef<ISeriesApi<'Line'> | null>(null);
  const dryRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Create / destroy series with show + chart
  useEffect(() => {
    if (!chart || !show) {
      if (elevatedRef.current && chart) {
        try {
          chart.removeSeries(elevatedRef.current);
        } catch {
          /* disposed */
        }
        elevatedRef.current = null;
      }
      if (dryRef.current && chart) {
        try {
          chart.removeSeries(dryRef.current);
        } catch {
          /* disposed */
        }
        dryRef.current = null;
      }
      return;
    }

    try {
      if (!elevatedRef.current) {
        elevatedRef.current = chart.addSeries(LineSeries, {
          color: COLOR_ELEVATED,
          lineWidth: 2 as LineWidth,
          priceLineVisible: false,
          lastValueVisible: false,
          title: 'Vol EMA',
          crosshairMarkerVisible: true,
        });
      }
      if (!dryRef.current) {
        dryRef.current = chart.addSeries(LineSeries, {
          color: COLOR_DRY,
          lineWidth: 2 as LineWidth,
          priceLineVisible: false,
          lastValueVisible: false,
          title: 'Vol EMA',
          crosshairMarkerVisible: true,
        });
      }
    } catch {
      return;
    }

    return () => {
      if (elevatedRef.current) {
        try {
          chart.removeSeries(elevatedRef.current);
        } catch {
          /* disposed */
        }
        elevatedRef.current = null;
      }
      if (dryRef.current) {
        try {
          chart.removeSeries(dryRef.current);
        } catch {
          /* disposed */
        }
        dryRef.current = null;
      }
    };
  }, [chart, show]);

  // Push data when candles / options change
  useEffect(() => {
    if (!chart || !show || !elevatedRef.current || !dryRef.current) return;

    const points = calculateVolumeEmaOverlay(candles, options);
    if (points.length === 0) {
      try {
        elevatedRef.current.setData([]);
        dryRef.current.setData([]);
      } catch {
        /* disposed */
      }
      return;
    }

    const { elevated, dry } = splitByRegime(points);
    const last = points[points.length - 1];
    const lastIsDry = last.regime === 'dry';
    try {
      elevatedRef.current.setData(elevated as any);
      dryRef.current.setData(dry as any);
      // Only the active regime shows a last-value label on the price scale
      elevatedRef.current.applyOptions({
        lastValueVisible: !lastIsDry,
        title: lastIsDry ? '' : 'Vol EMA',
      });
      dryRef.current.applyOptions({
        lastValueVisible: lastIsDry,
        title: lastIsDry ? 'Vol EMA' : '',
      });
    } catch {
      /* disposed */
    }
  }, [chart, show, candles, options]);

  return null;
}

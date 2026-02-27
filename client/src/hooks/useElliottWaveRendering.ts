import { useEffect, useRef } from 'react';
import { createSeriesMarkers, type ISeriesMarkersPluginApi, type Time } from 'lightweight-charts';
import { ElliottWavePrimitive } from '@/components/chart/primitives/ElliottWavePrimitive';
import { getDegreeConfiguration } from '@/components/elliottWave/DegreePicker';
import type { Drawing } from '@/types/drawing';

interface UseElliottWaveRenderingParams {
  candleSeriesRef: React.MutableRefObject<any>;
  chartRef: React.MutableRefObject<any>;
  candles: any[];
  drawings: Drawing[];
  selectedWaveDegree: string;
  selectedWaveId: string | null;
  elliottWave: {
    isActive: boolean;
    isDrawing: boolean;
    isComplete: boolean;
    points: Array<{ time: number; price: number; label?: string; isMidAir?: boolean }>;
  };
}

export function useElliottWaveRendering({
  candleSeriesRef,
  chartRef,
  candles,
  drawings,
  selectedWaveDegree,
  selectedWaveId,
  elliottWave,
}: UseElliottWaveRenderingParams) {
  const seriesMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const liveEWPrimitiveRef = useRef<ElliottWavePrimitive | null>(null);
  const savedEWPrimitivesRef = useRef<Map<string, ElliottWavePrimitive>>(new Map());

  useEffect(() => {
    if (!candleSeriesRef.current || !elliottWave.isActive) {
      seriesMarkersRef.current?.setMarkers([]);
      return;
    }

    const points = elliottWave.points;
    if (points.length === 0) {
      seriesMarkersRef.current?.setMarkers([]);
      return;
    }

    if (!seriesMarkersRef.current) {
      seriesMarkersRef.current = createSeriesMarkers(candleSeriesRef.current, []);
    }

    if (candles.length === 0) {
      seriesMarkersRef.current.setMarkers([]);
      return;
    }

    const lastCandleTime = candles[candles.length - 1].time as number;
    const markers = points
      .filter(point => (point.time as number) <= lastCandleTime)
      .map(point => ({
        time: point.time as Time,
        position: 'aboveBar' as 'aboveBar' | 'belowBar',
        color: '#00CED1',
        shape: 'circle' as const,
        size: 2,
      }));

    seriesMarkersRef.current.setMarkers(markers);

    return () => {
      seriesMarkersRef.current?.setMarkers([]);
    };
  }, [elliottWave.points, elliottWave.isActive, candles, candleSeriesRef]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const points = elliottWave.points;
    const lastCandleTime = candles.length > 0 ? (candles[candles.length - 1].time as number) : undefined;
    const candleInterval = candles.length >= 2 ? (candles[1].time as number) - (candles[0].time as number) : 3600;

    if ((elliottWave.isDrawing || elliottWave.isComplete) && points.length >= 2) {
      const degreeConfig = getDegreeConfiguration(selectedWaveDegree);
      const data = {
        points: points.map(p => ({ time: p.time, price: p.price, label: p.label })),
        waveType: 'impulse',
        color: degreeConfig.impulse.color,
        showPointLabels: true,
        lastCandleTime,
        candleInterval,
        barCount: candles.length,
      };

      if (liveEWPrimitiveRef.current) {
        liveEWPrimitiveRef.current.update(data);
      } else {
        const primitive = new ElliottWavePrimitive(data);
        try {
          series.attachPrimitive(primitive);
          liveEWPrimitiveRef.current = primitive;
        } catch (error) {
          console.error('[EW] Failed to attach live trendline:', error);
        }
      }
    } else if (liveEWPrimitiveRef.current) {
      try {
        series.detachPrimitive(liveEWPrimitiveRef.current);
      } catch (error) {
        console.error('[EW] Failed to detach live trendline:', error);
      }
      liveEWPrimitiveRef.current = null;
    }

    return () => {
      if (liveEWPrimitiveRef.current && series) {
        try {
          series.detachPrimitive(liveEWPrimitiveRef.current);
        } catch (error) {
          console.error('[EW] Failed to detach live trendline on cleanup:', error);
        }
        liveEWPrimitiveRef.current = null;
      }
    };
  }, [elliottWave.isDrawing, elliottWave.isComplete, elliottWave.points, candleSeriesRef, candles, selectedWaveDegree]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const ewDrawings = drawings.filter(drawing => drawing.type === 'elliott_wave');
    const currentIds = new Set(ewDrawings.map(drawing => drawing.id));

    savedEWPrimitivesRef.current.forEach((primitive, id) => {
      if (!currentIds.has(id)) {
        try {
          series.detachPrimitive(primitive);
        } catch (error) {
          console.error('[EW] Failed to detach saved trendline:', error);
        }
        savedEWPrimitivesRef.current.delete(id);
      }
    });

    for (const drawing of ewDrawings) {
      if (drawing.points.length < 2) continue;

      const waveType = drawing.style?.waveType ?? 'EW';
      const color = drawing.style?.color ?? '#00CED1';
      const lastCandleTime = candles.length > 0 ? (candles[candles.length - 1].time as number) : undefined;
      const candleInterval = candles.length >= 2 ? (candles[1].time as number) - (candles[0].time as number) : 3600;

      const data = {
        points: drawing.points.map(point => ({
          time: point.time,
          price: point.price,
          label: point.label,
          isMidAir: point.isMidAir,
        })),
        waveType,
        color,
        showPointLabels: false,
        lastCandleTime,
        candleInterval,
        barCount: candles.length,
        isSelected: drawing.id === selectedWaveId,
      };

      const existing = savedEWPrimitivesRef.current.get(drawing.id);
      if (existing) {
        existing.update(data);
      } else {
        const primitive = new ElliottWavePrimitive(data);
        try {
          series.attachPrimitive(primitive);
          savedEWPrimitivesRef.current.set(drawing.id, primitive);
        } catch (error) {
          console.error('[EW] Failed to attach saved trendline:', error);
        }
      }
    }

    return () => {
      savedEWPrimitivesRef.current.forEach((primitive) => {
        try {
          series.detachPrimitive(primitive);
        } catch (error) {
          console.error('[EW] Failed to detach saved trendline on cleanup:', error);
        }
      });
      savedEWPrimitivesRef.current.clear();
    };
  }, [drawings, candleSeriesRef, candles, selectedWaveId]);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    const ewDrawings = drawings.filter(drawing => drawing.type === 'elliott_wave');
    const lastCandleTime = candles[candles.length - 1].time as number;
    let maxFutureTime = lastCandleTime;

    for (const drawing of ewDrawings) {
      for (const point of drawing.points) {
        if ((point.time as number) > maxFutureTime) {
          maxFutureTime = point.time as number;
        }
      }
    }

    if (maxFutureTime > lastCandleTime) {
      const timeScale = chartRef.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange && maxFutureTime > (visibleRange.to as number)) {
        timeScale.setVisibleRange({
          from: visibleRange.from,
          to: maxFutureTime as Time,
        });
      }
    }
  }, [chartRef, drawings, candles]);
}

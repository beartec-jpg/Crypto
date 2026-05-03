import { useEffect, useRef } from 'react';
import type { ISeriesMarkersPluginApi, Time } from 'lightweight-charts';
import { ElliottWavePrimitive } from '@/components/chart/primitives/ElliottWavePrimitive';
import { getDegreeConfiguration } from '@/components/elliottWave/DegreePicker';
import type { Drawing } from '@/types/drawing';

// Wave degree hierarchy: lower number = higher (more dominant) degree.
const DEGREE_ORDER_MAP: Record<string, number> = {
  'grand supercycle': 0,
  'grand_supercycle': 0,
  'supercycle': 1,
  'cycle': 2,
  'primary': 3,
  'intermediate': 4,
  'minor': 5,
  'minute': 6,
  'minuette': 7,
  'sub-minuette': 8,
  'subminuette': 8,
  'sub_minuette': 8,
  'undefined': 9,
};

function getDegreeIndex(degreeLabel: string | undefined): number {
  if (!degreeLabel) return 5;
  return DEGREE_ORDER_MAP[degreeLabel.toLowerCase()] ?? 5;
}

/**
 * Compute a stacking offset (in label-height units) for each EW drawing so
 * that labels at the same endpoint don't overlap. Within a group the drawing
 * with the lowest-degree wave is closest to the candle (offset 0) and the
 * highest-degree wave is furthest from the candle (largest offset), matching
 * the convention "higher degree = top for uptrends / bottom for downtrends".
 */
function computeLabelOffsets(ewDrawings: Drawing[], candleInterval: number): Map<string, number> {
  const offsets = new Map<string, number>();
  if (ewDrawings.length === 0) return offsets;

  // Group drawings whose final points share approximately the same time.
  const tolerance = candleInterval * 0.5;
  const groups: string[][] = [];

  for (const drawing of ewDrawings) {
    if (drawing.points.length < 2) {
      offsets.set(drawing.id, 0);
      continue;
    }
    const lastTime = drawing.points[drawing.points.length - 1].time as number;

    let placed = false;
    for (const group of groups) {
      const representative = ewDrawings.find(d => d.id === group[0]);
      if (!representative || representative.points.length < 2) continue;
      const repTime = representative.points[representative.points.length - 1].time as number;
      if (Math.abs(lastTime - repTime) <= tolerance) {
        group.push(drawing.id);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push([drawing.id]);
    }
  }

  for (const group of groups) {
    if (group.length === 1) {
      offsets.set(group[0], 0);
      continue;
    }

    // Sort: lower degree (higher getDegreeIndex value) first → gets offset 0.
    // Higher degree (lower getDegreeIndex value) last → gets the largest offset.
    const sorted = [...group].sort((idA, idB) => {
      const dA = ewDrawings.find(d => d.id === idA);
      const dB = ewDrawings.find(d => d.id === idB);
      const degA = getDegreeIndex((dA?.style as any)?.degreeLabel);
      const degB = getDegreeIndex((dB?.style as any)?.degreeLabel);
      return degB - degA; // descending: Minor (5) before Primary (3) before Cycle (2)
    });

    sorted.forEach((id, index) => offsets.set(id, index));
  }

  return offsets;
}

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
    seriesMarkersRef.current?.setMarkers([]);

    return () => {
      seriesMarkersRef.current?.setMarkers([]);
    };
  }, [elliottWave.points, elliottWave.isActive]);

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
    const lastCandleTime = candles.length > 0 ? (candles[candles.length - 1].time as number) : undefined;
    const candleInterval = candles.length >= 2 ? (candles[1].time as number) - (candles[0].time as number) : 3600;

    // Compute stacking offsets so that labels at the same endpoint don't overlap.
    const labelOffsets = computeLabelOffsets(ewDrawings, candleInterval);

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

      const s = (drawing.style ?? {}) as any;
      const waveType     = s.waveType      ?? 'EW';
      const color        = s.color         ?? '#00CED1';
      const impulseColor = s.impulseColor  ?? color;
      const impulseOpacity = typeof s.impulseOpacity === 'number' ? s.impulseOpacity : 1;
      const impulseWidth = typeof s.impulseWidth === 'number' ? s.impulseWidth : (s.lineWidth ?? 2);
      const impulseStyle = s.impulseStyle  ?? 'solid';
      const zigzagColor  = s.zigzagColor   ?? '#808080';
      const zigzagOpacity = typeof s.zigzagOpacity === 'number' ? s.zigzagOpacity : 1;
      const zigzagStyle  = s.zigzagStyle   ?? 'dashed';
      const fontSize     = s.fontSize      ?? '12px';

      const data = {
        points: drawing.points.map(point => ({
          time: point.time,
          price: point.price,
          label: point.label,
          isMidAir: point.isMidAir,
        })),
        waveType,
        color,
        impulseColor,
        impulseOpacity,
        impulseWidth,
        impulseStyle,
        zigzagColor,
        zigzagOpacity,
        zigzagStyle,
        fontSize,
        showPointLabels: true,
        lastCandleTime,
        candleInterval,
        barCount: candles.length,
        isSelected: drawing.id === selectedWaveId,
        labelOffset: labelOffsets.get(drawing.id) ?? 0,
        customPointLabels: drawing.style.customPointLabels,
        hiddenPointLabels: drawing.style.hiddenPointLabels,
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

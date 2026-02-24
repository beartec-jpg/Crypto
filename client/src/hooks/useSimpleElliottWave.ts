import { useState, useCallback, useRef } from 'react';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';

export type SimpleWaveType = 'impulse' | 'abc' | 'wxy';

/** Number of points required to complete a simple Elliott Wave drawing */
const REQUIRED_POINTS = 2;

export interface WavePoint {
  time: number;
  price: number;
  label: string;
}

const WAVE_LABELS: Record<SimpleWaveType, string[]> = {
  impulse: ['1', '2'],
  abc: ['A', 'B'],
  wxy: ['W', 'X'],
};

const FIB_RATIOS: Record<SimpleWaveType, number[]> = {
  impulse: [0.618, 1.0, 1.618, 2.618],
  abc: [0.618, 1.0, 1.272],
  wxy: [0.618, 1.0, 1.618],
};

export function useSimpleElliottWave() {
  const [isActive, setIsActive] = useState(false);
  const [waveType, setWaveType] = useState<SimpleWaveType | null>(null);
  const [points, setPoints] = useState<WavePoint[]>([]);
  const [projections, setProjections] = useState<FibLevel[]>([]);

  // Use a ref so placePoint always reads latest waveType
  const waveTypeRef = useRef<SimpleWaveType | null>(null);

  const activateMode = useCallback(() => {
    setIsActive(true);
    waveTypeRef.current = null;
    setWaveType(null);
    setPoints([]);
    setProjections([]);
  }, []);

  const deactivateMode = useCallback(() => {
    setIsActive(false);
    waveTypeRef.current = null;
    setWaveType(null);
    setPoints([]);
    setProjections([]);
  }, []);

  const selectWaveType = useCallback((type: SimpleWaveType) => {
    waveTypeRef.current = type;
    setWaveType(type);
    setPoints([]);
    setProjections([]);
  }, []);

  const placePoint = useCallback((time: number, price: number) => {
    const currentWaveType = waveTypeRef.current;
    if (!currentWaveType) return;

    setPoints(prev => {
      const pointIndex = prev.length;
      if (pointIndex >= REQUIRED_POINTS) return prev;

      const labels = WAVE_LABELS[currentWaveType];
      const newPoint: WavePoint = { time, price, label: labels[pointIndex] };
      const newPoints = [...prev, newPoint];

      if (newPoints.length === REQUIRED_POINTS) {
        const p0 = newPoints[0];
        const p1 = newPoints[1];
        const range = Math.abs(p1.price - p0.price);
        const direction = p1.price > p0.price ? 1 : -1;
        const newProjections: FibLevel[] = FIB_RATIOS[currentWaveType].map(ratio => ({
          ratio,
          price: p1.price + range * ratio * direction,
          label: `${(ratio * 100).toFixed(1)}%`,
          isRetrace: false,
        }));
        setProjections(newProjections);
      }

      return newPoints;
    });
  }, []);

  const reset = useCallback(() => {
    setPoints([]);
    setProjections([]);
  }, []);

  const undo = useCallback(() => {
    setPoints(prev => prev.slice(0, -1));
    setProjections([]);
  }, []);

  const isComplete = points.length === REQUIRED_POINTS;
  const isDrawing = isActive && waveType !== null && !isComplete;

  return {
    isActive,
    waveType,
    points,
    projections,
    canSave: isComplete,
    canUndo: points.length > 0,
    showSelector: isActive && !waveType,
    isDrawing,
    isComplete,
    activateMode,
    deactivateMode,
    selectWaveType,
    placePoint,
    reset,
    undo,
  };
}

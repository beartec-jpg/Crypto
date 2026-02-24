/**
 * useElliottWave
 *
 * Simple 6-point impulse Elliott Wave drawing hook.
 *
 * User flow:
 *   1. Activate the tool → isDrawing becomes true immediately
 *   2. User places 6 points (labeled 0–5)
 *   3. Lines connect each point; fibonacci levels appear at key stages
 *   4. After 6 points → isComplete becomes true
 *   5. User can save, reset, or undo
 */

import { useState, useCallback, useMemo } from 'react';
import {
  calcRetracementLevels,
  calcExtensionLevels,
  type FibLevel,
} from '@/lib/elliottWave/fibCalculator';

export type { FibLevel };

const POINT_LABELS = ['0', '1', '2', '3', '4', '5'];
const TOTAL_POINTS = 6;

export interface WavePoint {
  time: number;
  price: number;
  label: string; // "0" | "1" | "2" | "3" | "4" | "5"
  isMidAir?: boolean;
  snapType?: 'high' | 'low' | 'none';
}

export interface UseElliottWaveResult {
  // State
  isActive: boolean;
  isDrawing: boolean;
  isComplete: boolean;
  points: WavePoint[];
  fibProjections: FibLevel[];

  // Actions
  activateMode: () => void;
  deactivateMode: () => void;
  placePoint: (time: number, price: number) => void;
  reset: () => void;
  undo: () => void;

  // UI helpers
  canSave: boolean;
  canUndo: boolean;
}

export function useElliottWave(): UseElliottWaveResult {
  const [isActive, setIsActive] = useState(false);
  const [points, setPoints] = useState<WavePoint[]>([]);

  const activateMode = useCallback(() => {
    setIsActive(true);
    setPoints([]);
  }, []);

  const deactivateMode = useCallback(() => {
    setIsActive(false);
    setPoints([]);
  }, []);

  const placePoint = useCallback((time: number, price: number) => {
    setPoints(prev => {
      if (prev.length >= TOTAL_POINTS) return prev;
      const label = POINT_LABELS[prev.length];
      return [...prev, { time, price, label }];
    });
  }, []);

  const reset = useCallback(() => {
    setPoints([]);
  }, []);

  const undo = useCallback(() => {
    setPoints(prev => prev.slice(0, -1));
  }, []);

  // Fibonacci projection levels shown at appropriate stages
  const fibProjections = useMemo<FibLevel[]>(() => {
    const n = points.length;
    if (n < 3) return [];

    const p = points.map(pt => pt.price);

    if (n === 3) {
      // After point 2: retracement levels for Wave 2 (38.2%–61.8% of Wave 1)
      return calcRetracementLevels(p[0], p[1], [0.236, 0.382, 0.5, 0.618, 0.786]);
    }
    if (n === 4) {
      // After point 3: extension levels for Wave 3 (161.8%–261.8% of Wave 1)
      return calcExtensionLevels(p[2], p[1], [1.0, 1.272, 1.618, 2.0, 2.618]);
    }
    if (n === 5) {
      // After point 4: retracement levels for Wave 4 (23.6%–50% of Wave 3)
      return calcRetracementLevels(p[2], p[3], [0.236, 0.382, 0.5, 0.618]);
    }
    if (n === 6) {
      // After point 5: extension levels for Wave 5
      return calcExtensionLevels(p[4], p[3], [0.618, 1.0, 1.272, 1.618]);
    }
    return [];
  }, [points]);

  const isComplete = points.length === TOTAL_POINTS;
  const isDrawing = isActive && !isComplete;

  return {
    isActive,
    isDrawing,
    isComplete,
    points,
    fibProjections,
    activateMode,
    deactivateMode,
    placePoint,
    reset,
    undo,
    canSave: isComplete,
    canUndo: points.length > 0,
  };
}

// Keep old name as alias for backward compatibility
export const usePredictiveElliottWave = useElliottWave;

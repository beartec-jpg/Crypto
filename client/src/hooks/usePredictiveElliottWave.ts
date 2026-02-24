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
  placePoint: (time: number, price: number, snapType?: 'high' | 'low' | 'none') => void;
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

  const placePoint = useCallback((time: number, price: number, snapType?: 'high' | 'low' | 'none') => {
    setPoints(prev => {
      if (prev.length >= TOTAL_POINTS) return prev;
      const label = POINT_LABELS[prev.length];
      return [...prev, { time, price, label, snapType, isMidAir: snapType === 'none' }];
    });
  }, []);

  const reset = useCallback(() => {
    setPoints([]);
  }, []);

  const undo = useCallback(() => {
    setPoints(prev => prev.slice(0, -1));
  }, []);

  // Fibonacci projection levels shown progressively as points are placed
  const fibProjections = useMemo<FibLevel[]>(() => {
    const n = points.length;
    if (n < 2) return [];

    const p = points.map(pt => pt.price);

    if (n === 2) {
      // After point 1 (W1 done): project W2 retracement targets of the W0→W1 move
      return calcRetracementLevels(p[0], p[1], [0.382, 0.5, 0.618]);
    }
    if (n === 3) {
      // After point 2 (W2 done): project W3 extension from p[2] using W1 magnitude
      // p[2] - (p[1]-p[0]) anchors the base so that (baseEnd - baseStart) == W1 length
      return calcExtensionLevels(p[2] - (p[1] - p[0]), p[2], [1.618, 2.0, 2.618]);
    }
    if (n === 4) {
      // After point 3 (W3 done): project W4 retracement targets of the W2→W3 move
      return calcRetracementLevels(p[2], p[3], [0.236, 0.382, 0.5]);
    }
    if (n === 5) {
      // After point 4 (W4 done): project W5 extension from p[4] using W1 magnitude
      // p[4] - (p[1]-p[0]) anchors the base so that (baseEnd - baseStart) == W1 length
      return calcExtensionLevels(p[4] - (p[1] - p[0]), p[4], [0.618, 1.0, 1.618]);
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

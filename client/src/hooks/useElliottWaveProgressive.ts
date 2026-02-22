/**
 * useElliottWaveProgressive
 *
 * Progressive Elliott Wave drawing hook with auto-detection.
 *
 * User flow:
 *   1. Activate the tool
 *   2. Click points 0 → 1 → 2 → … (up to 6)
 *   3. After each point the hook auto-detects the forming pattern
 *      and shows Fibonacci levels for the *next* expected point
 *   4. After 4 points (0-1-2-3) an ABC correction is detected
 *   5. Continuing to points 4-5 detects an impulse wave
 *   6. Wave degree can be incremented to track nested waves
 */

import { useState, useCallback, useMemo } from 'react';
import {
  detectPattern,
  type ProgressivePoint,
  type PatternDetectionResult,
  type WaveDegree,
} from '@/lib/elliottWave/patternDetector';
import { calcRetracementLevels } from '@/lib/elliottWave/fibCalculator';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';

// Maximum number of points in one wave sequence (6 = points 0-5)
const MAX_POINTS = 6;

// Wave degree labels exposed to UI
export type { WaveDegree };

export interface ProgressiveWavePoint extends ProgressivePoint {
  /** Sequential index in the points array (0-based) */
  index: number;
}

export type ProgressiveMode =
  | 'idle'
  | 'placing' // actively placing points
  | 'complete'; // reached max points or user marked complete

export interface UseElliottWaveProgressiveResult {
  /** Current tool mode */
  mode: ProgressiveMode;

  /** All placed points in order */
  placedPoints: ProgressiveWavePoint[];

  /** Auto-detection + validation result for the current set of points */
  detection: PatternDetectionResult;

  /** Fibonacci levels to display on chart for the next expected point */
  fibLevels: FibLevel[];

  /** Current wave degree (for nested tracking) */
  waveDegree: WaveDegree;

  /** Current wave degree index */
  waveDegreeIndex: number;

  /** Actions */
  activateMode: () => void;
  deactivateMode: () => void;
  placePoint: (time: number, price: number, snappedToHigh: boolean) => void;
  undo: () => void;
  reset: () => void;
  incrementDegree: () => void;
  decrementDegree: () => void;

  /** Status helpers */
  getStatusText: () => string;
  isActive: boolean;
  canUndo: boolean;
  canContinue: boolean;
}

const WAVE_DEGREES: WaveDegree[] = [
  'Subminuette',
  'Minuette',
  'Minute',
  'Minor',
  'Intermediate',
  'Primary',
  'Cycle',
  'Supercycle',
];

// Point labels for 0-5
const POINT_LABELS = ['0', '1', '2', '3', '4', '5'];

export function useElliottWaveProgressive(): UseElliottWaveProgressiveResult {
  const [mode, setMode] = useState<ProgressiveMode>('idle');
  const [placedPoints, setPlacedPoints] = useState<ProgressiveWavePoint[]>([]);
  const [waveDegreeIndex, setWaveDegreeIndex] = useState<number>(3); // Default: 'Minor'

  // Auto-detect pattern based on current points
  const detection = useMemo<PatternDetectionResult>(
    () => detectPattern(placedPoints, waveDegreeIndex),
    [placedPoints, waveDegreeIndex],
  );

  // Fibonacci levels to show on the chart
  const fibLevels = useMemo<FibLevel[]>(() => {
    const n = placedPoints.length;
    if (n < 2) return [];
    // After W1 (2 points) – show retracement levels
    if (n === 2) {
      return calcRetracementLevels(placedPoints[0].price, placedPoints[1].price);
    }
    // Otherwise use levels from the detection result
    return detection.nextPointLevels;
  }, [placedPoints, detection]);

  const waveDegree = WAVE_DEGREES[Math.min(waveDegreeIndex, WAVE_DEGREES.length - 1)];

  // ── Actions ──────────────────────────────────────────────────────────────

  const activateMode = useCallback(() => {
    setMode('placing');
    setPlacedPoints([]);
  }, []);

  const deactivateMode = useCallback(() => {
    setMode('idle');
  }, []);

  const reset = useCallback(() => {
    setMode('placing');
    setPlacedPoints([]);
  }, []);

  const placePoint = useCallback((time: number, price: number, snappedToHigh: boolean) => {
    setPlacedPoints(prev => {
      if (prev.length >= MAX_POINTS) return prev; // ignore extra clicks

      const newPoint: ProgressiveWavePoint = {
        index: prev.length,
        label: POINT_LABELS[prev.length],
        time,
        price,
        snappedToHigh,
      };

      const next = [...prev, newPoint];

      if (next.length >= MAX_POINTS) {
        setMode('complete');
      }

      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setPlacedPoints(prev => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      if (mode === 'complete') setMode('placing');
      return next;
    });
  }, [mode]);

  const incrementDegree = useCallback(() => {
    setWaveDegreeIndex(i => Math.min(i + 1, WAVE_DEGREES.length - 1));
  }, []);

  const decrementDegree = useCallback(() => {
    setWaveDegreeIndex(i => Math.max(i - 1, 0));
  }, []);

  // ── Status helpers ────────────────────────────────────────────────────────

  const getStatusText = useCallback(() => {
    if (mode === 'idle') return 'Elliott Wave tool inactive';
    if (mode === 'complete') return detection.patternLabel;

    const n = placedPoints.length;
    if (n === 0) return 'Click candle high/low to place point 0';
    if (n === MAX_POINTS) return detection.patternLabel;

    return detection.nextPointHint || `Point ${n} placed – click to place point ${n + 1}`;
  }, [mode, placedPoints.length, detection]);

  return {
    mode,
    placedPoints,
    detection,
    fibLevels,
    waveDegree,
    waveDegreeIndex,
    activateMode,
    deactivateMode,
    placePoint,
    undo,
    reset,
    incrementDegree,
    decrementDegree,
    getStatusText,
    isActive: mode !== 'idle',
    canUndo: placedPoints.length > 0,
    canContinue: mode === 'complete',
  };
}

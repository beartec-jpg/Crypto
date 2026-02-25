/**
 * useElliottWave
 *
 * Elliott Wave drawing hook with pattern-aware point counts.
 *
 * User flow:
 *   1. Activate the tool with a patternType → isDrawing becomes true
 *   2. User places N points depending on the pattern (4 for ABC, 6 for impulse/diagonal/triangle)
 *   3. Lines connect each point; fibonacci levels appear at key stages
 *   4. After N points → isComplete becomes true
 *   5. User can save, reset, or undo
 */

import { useState, useCallback, useMemo } from 'react';
import {
  calcRetracementLevels,
  calcExtensionLevels,
  type FibLevel,
} from '@/lib/elliottWave/fibCalculator';

export type { FibLevel };

/** Map a patternType to its ordered point labels (index 0 = origin) */
function getPatternConfig(patternType: string): { labels: string[]; total: number } {
  switch (patternType) {
    case 'zigzag':
    case 'flat':
    case 'combination':
    case 'wxy':
      return { labels: ['0', 'A', 'B', 'C'], total: 4 };
    case 'triangle':
      return { labels: ['0', 'A', 'B', 'C', 'D', 'E'], total: 6 };
    case 'impulse':
    case 'leading_diagonal':
    case 'ending_diagonal':
    case 'truncated':
    default:
      return { labels: ['0', '1', '2', '3', '4', '5'], total: 6 };
  }
}

export interface WavePoint {
  time: number;
  price: number;
  label: string;
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
  patternType: string;

  // Actions
  activateMode: (patternType?: string) => void;
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
  const [currentPatternType, setCurrentPatternType] = useState('impulse');

  const activateMode = useCallback((patternType: string = 'impulse') => {
    setIsActive(true);
    setPoints([]);
    setCurrentPatternType(patternType);
  }, []);

  const deactivateMode = useCallback(() => {
    setIsActive(false);
    setPoints([]);
  }, []);

  const placePoint = useCallback((time: number, price: number, snapType?: 'high' | 'low' | 'none') => {
    setPoints(prev => {
      const config = getPatternConfig(currentPatternType);
      if (prev.length >= config.total) return prev;
      const label = config.labels[prev.length];
      return [...prev, { time, price, label, snapType, isMidAir: snapType === 'none' }];
    });
  }, [currentPatternType]);

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
    const isImpulse = ['impulse', 'leading_diagonal', 'ending_diagonal', 'truncated'].includes(currentPatternType);
    const isCorrection = ['zigzag', 'flat', 'combination', 'wxy'].includes(currentPatternType);

    if (isImpulse) {
      if (n === 2) {
        // After W1: project W2 retracement targets
        return calcRetracementLevels(p[0], p[1], [0.382, 0.5, 0.618]);
      }
      if (n === 3) {
        // After W2: project W3 extension
        return calcExtensionLevels(p[2] - (p[1] - p[0]), p[2], [1.618, 2.0, 2.618]);
      }
      if (n === 4) {
        // After W3: project W4 retracement
        return calcRetracementLevels(p[2], p[3], [0.236, 0.382, 0.5]);
      }
      if (n === 5) {
        // After W4: project W5 extension
        return calcExtensionLevels(p[4] - (p[1] - p[0]), p[4], [0.618, 1.0, 1.618]);
      }
    } else if (isCorrection) {
      if (n === 2) {
        // After Wave A: project Wave B retracement (0.382–1.0 of A)
        return calcRetracementLevels(p[0], p[1], [0.382, 0.5, 0.618, 1.0]);
      }
      if (n === 3) {
        // After Wave B: project Wave C extension (100%–161.8% of A)
        const waveALen = Math.abs(p[1] - p[0]);
        const direction = p[1] > p[0] ? -1 : 1;
        return [1.0, 1.272, 1.618].map(ratio => ({
          ratio,
          price: p[2] + direction * waveALen * ratio,
          label: `${(ratio * 100).toFixed(1)}%`,
          isRetrace: false,
        }));
      }
    }
    return [];
  }, [points, currentPatternType]);

  const config = getPatternConfig(currentPatternType);
  const isComplete = points.length === config.total;
  const isDrawing = isActive && !isComplete;

  return {
    isActive,
    isDrawing,
    isComplete,
    points,
    fibProjections,
    patternType: currentPatternType,
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

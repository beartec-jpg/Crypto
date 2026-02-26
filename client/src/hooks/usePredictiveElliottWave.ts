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
  type FibLevel,
} from '@/lib/elliottWave/fibCalculator';

export type { FibLevel };

/** Wrap a label in degree-appropriate bracket notation */
function wrapDegree(raw: string, degree: string): string {
  switch (degree) {
    case 'Intermediate': return `(${raw})`;
    case 'Primary': return `[${raw}]`;
    default: return raw; // Minor and below: no brackets
  }
}

/** Roman numeral map for impulse wave parent labels at Minor degree */
const WAVE_TO_ROMAN: Record<string, string> = {
  '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v',
};

/** Format the parent wave label with degree notation for the final point hierarchy */
function formatParentLabel(waveLabel: string, degree: string): string {
  switch (degree) {
    case 'Minor':
      return WAVE_TO_ROMAN[waveLabel] ?? waveLabel.toLowerCase();
    default:
      return wrapDegree(waveLabel, degree);
  }
}

/**
 * Map a patternType to its ordered point labels (index 0 = origin).
 * Labels use degree-aware bracket notation and the final point shows
 * the `sub-wave/parent-wave` hierarchical format.
 */
function getPatternConfig(
  patternType: string,
  degree: string = 'Minor',
  waveLabel: string = '1',
): { labels: string[]; total: number } {
  const wrap = (s: string) => wrapDegree(s, degree);
  const parent = formatParentLabel(waveLabel, degree);

  switch (patternType) {
    case 'zigzag':
    case 'flat':
    case 'combination':
    case 'wxy':
      return {
        labels: ['0', wrap('a'), wrap('b'), `${wrap('c')}/${parent}`],
        total: 4,
      };
    case 'triangle':
      return {
        labels: ['0', wrap('a'), wrap('b'), wrap('c'), wrap('d'), `${wrap('e')}/${parent}`],
        total: 6,
      };
    case 'impulse':
    case 'leading_diagonal':
    case 'ending_diagonal':
    case 'truncated':
    default:
      return {
        labels: ['0', wrap('1'), wrap('2'), wrap('3'), wrap('4'), `${wrap('5')}/${parent}`],
        total: 6,
      };
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
  activateMode: (patternType?: string, degree?: string, waveLabel?: string) => void;
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
  const [currentDegree, setCurrentDegree] = useState('Minor');
  const [currentWaveLabel, setCurrentWaveLabel] = useState('1');

  const activateMode = useCallback((patternType: string = 'impulse', degree: string = 'Minor', waveLabel: string = '1') => {
    setIsActive(true);
    setPoints([]);
    setCurrentPatternType(patternType);
    setCurrentDegree(degree);
    setCurrentWaveLabel(waveLabel);
  }, []);

  const deactivateMode = useCallback(() => {
    setIsActive(false);
    setPoints([]);
  }, []);

  const placePoint = useCallback((time: number, price: number, snapType?: 'high' | 'low' | 'none') => {
    setPoints(prev => {
      const config = getPatternConfig(currentPatternType, currentDegree, currentWaveLabel);
      if (prev.length >= config.total) return prev;
      const label = config.labels[prev.length];
      return [...prev, { time, price, label, snapType, isMidAir: snapType === 'none' }];
    });
  }, [currentPatternType, currentDegree, currentWaveLabel]);

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
    const isDiagonal = ['leading_diagonal', 'ending_diagonal'].includes(currentPatternType);
    const isCorrection = ['zigzag', 'flat', 'combination', 'wxy'].includes(currentPatternType);

    if (isImpulse) {
      if (n === 2) {
        // After W1: project W2 retracement targets
        return calcRetracementLevels(p[0], p[1], [0.382, 0.5, 0.618, 0.786]);
      }
      if (n === 3) {
        // After W2: project W3 trend-based extension using W1 length projected from W2
        // Diagonals use shallower 100%/127.2% targets; standard impulse uses 161.8%+
        const w1Length = Math.abs(p[1] - p[0]);
        const direction = p[1] > p[0] ? 1 : -1;
        const w3Ratios = isDiagonal ? [1.0, 1.272] : [1.618, 2.0, 2.618];
        return w3Ratios.map(ratio => ({
          ratio,
          price: p[2] + direction * w1Length * ratio,
          label: `W3 ${(ratio * 100).toFixed(0)}%`,
          isRetrace: false,
          color: '#22c55e',
        }));
      }
      if (n === 4) {
        // After W3: project W4 retracement + invalidation level at W1 peak
        const w4Levels = calcRetracementLevels(p[2], p[3], [0.236, 0.382, 0.5]);
        const invalidation: FibLevel = {
          ratio: 0,
          price: p[1],
          label: 'W4 Invalidation (W1 peak)',
          isRetrace: false,
          color: '#ef4444',
          style: 'solid',
          width: 2,
        };
        return [...w4Levels, invalidation];
      }
      if (n === 5) {
        // After W4: project W5 trend-based extension using combined W1+W3 length
        // Diagonals use shallower 61.8%/100% targets
        const w1Length = Math.abs(p[1] - p[0]);
        const w3Length = Math.abs(p[3] - p[2]);
        const totalLength = w1Length + w3Length;
        const direction = p[1] > p[0] ? 1 : -1;
        const w5Ratios = isDiagonal ? [0.618, 1.0] : [0.618, 1.0, 1.618];
        return w5Ratios.map(ratio => ({
          ratio,
          price: p[4] + direction * totalLength * ratio,
          label: `W5 ${(ratio * 100).toFixed(0)}%`,
          isRetrace: false,
          color: '#22c55e',
        }));
      }
    } else if (isCorrection) {
      if (n === 2) {
        // After Wave A: project Wave B retracement (0.382–1.0 of A)
        return calcRetracementLevels(p[0], p[1], [0.382, 0.5, 0.618, 1.0]);
      }
      if (n === 3) {
        // After Wave B: project Wave C extension (100%–161.8% of A length)
        // C travels in same direction as A from B endpoint
        const waveALen = Math.abs(p[1] - p[0]);
        const correctionDirection = p[1] > p[0] ? 1 : -1;
        return [1.0, 1.272, 1.618].map(ratio => ({
          ratio,
          price: p[2] + correctionDirection * waveALen * ratio,
          label: `Wave C ${(ratio * 100).toFixed(0)}%`,
          isRetrace: false,
          color: '#fb923c',
        }));
      }
    }
    return [];
  }, [points, currentPatternType]);

  const config = getPatternConfig(currentPatternType, currentDegree, currentWaveLabel);
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

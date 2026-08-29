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
  calcTrendBasedExtension,
  calcW5ProjectionLevels,
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
    case 'internal_abc':
      return {
        labels: ['0', 'a', 'b', 'c'],
        total: 4,
      };
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
    case 'undefined_3_numeric':
      return { labels: ['0', '1', '2', '3'], total: 4 };
    case 'undefined_3_alpha':
      return { labels: ['0', 'A', 'B', 'C'], total: 4 };
    case 'undefined_5_numeric':
      return { labels: ['0', '1', '2', '3', '4', '5'], total: 6 };
    case 'undefined_5_alpha':
      return { labels: ['0', 'A', 'B', 'C', 'D', 'E'], total: 6 };
    case 'undefined_3_numeric_measured':
      return { labels: ['0', '1', '2', '3'], total: 4 };
    case 'undefined_3_alpha_measured':
      return { labels: ['0', 'A', 'B', 'C'], total: 4 };
    case 'undefined_5_numeric_measured':
      return { labels: ['0', '1', '2', '3', '4', '5'], total: 6 };
    case 'undefined_5_alpha_measured':
      return { labels: ['0', 'A', 'B', 'C', 'D', 'E'], total: 6 };
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

  // Validation
  validationErrors: string[];
  isValid: boolean;
  invalidationLevels: FibLevel[];

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
    const isMeasured5 = ['undefined_5_numeric_measured', 'undefined_5_alpha_measured'].includes(currentPatternType);
    const isMeasured3 = ['undefined_3_numeric_measured', 'undefined_3_alpha_measured'].includes(currentPatternType);

    if (isMeasured5) {
      if (n === 2) {
        // After point 1: retracement targets of wave 0→1
        return calcRetracementLevels(p[0], p[1], [0.236, 0.382, 0.5, 0.618, 0.786]).map(l => ({
          ...l, label: `Retrace ${(l.ratio * 100).toFixed(1)}%`, color: '#60a5fa',
        }));
      }
      if (n === 3) {
        // After point 2: trend-based extension for wave 3/C from point 2, measured against wave 0→1
        return calcTrendBasedExtension(p[0], p[1], p[2], [1.0, 1.382, 1.618, 2.618]).map(l => ({
          ...l, label: `Ext ${(l.ratio * 100).toFixed(1)}%`, color: '#22c55e',
        }));
      }
      if (n === 4) {
        // After point 3: retracement of wave 2→3 only (not whole move)
        return calcRetracementLevels(p[2], p[3], [0.236, 0.382, 0.5, 0.618, 0.786]).map(l => ({
          ...l, label: `Retrace ${(l.ratio * 100).toFixed(1)}%`, color: '#60a5fa',
        }));
      }
      if (n === 5) {
        return calcW5ProjectionLevels(p[0], p[1], p[2], p[3], p[4]).map(l => ({
          ...l, color: '#22c55e',
        }));
      }
      return [];
    }

    if (isMeasured3) {
      if (n === 2) {
        // After point 1: retracement targets of wave 0→1
        return calcRetracementLevels(p[0], p[1], [0.236, 0.382, 0.5, 0.618, 0.786]).map(l => ({
          ...l, label: `Retrace ${(l.ratio * 100).toFixed(1)}%`, color: '#60a5fa',
        }));
      }
      if (n === 3) {
        // After point 2: trend-based extension for wave C/3 from point 2, measured against wave 0→1
        return calcTrendBasedExtension(p[0], p[1], p[2], [1.0, 1.382, 1.618, 2.618]).map(l => ({
          ...l, label: `Ext ${(l.ratio * 100).toFixed(1)}%`, color: '#22c55e',
        }));
      }
      return [];
    }

    if (isImpulse) {
      if (n === 2) {
        // After W1: project W2 retracement targets
        return calcRetracementLevels(p[0], p[1], [0.382, 0.5, 0.618, 0.786]);
      }
      if (n === 3) {
        // After W2: project W3 trend-based extension using W1 length projected from W2
        // Diagonals: show full range covering both contracting (61.8–100%) and expanding (100–161.8%) targets
        // Standard impulse uses 161.8%+
        const w1Length = Math.abs(p[1] - p[0]);
        const direction = p[1] > p[0] ? 1 : -1;
        const w3Ratios = isDiagonal ? [0.618, 0.786, 1.0, 1.272, 1.618] : [1.618, 2.0, 2.618];
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
        return calcW5ProjectionLevels(
          p[0], p[1], p[2], p[3], p[4],
          currentPatternType,
        ).map(l => ({ ...l, color: '#22c55e' }));
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

  // Real-time wave-specific validation rules
  const { validationErrors, invalidationLevels } = useMemo(() => {
    const errors: string[] = [];
    const levels: FibLevel[] = [];
    const n = points.length;
    if (n < 2) return { validationErrors: errors, invalidationLevels: levels };

    const p = points.map(pt => pt.price);
    const isImpulseType = ['impulse', 'leading_diagonal', 'ending_diagonal', 'truncated'].includes(currentPatternType);
    const isDiagonalType = ['leading_diagonal', 'ending_diagonal'].includes(currentPatternType);
    const isCorrectionType = ['zigzag', 'flat', 'combination', 'wxy'].includes(currentPatternType);

    if (isImpulseType && !isDiagonalType) {
      // W2 retracement check: cannot exceed 100% of W1
      if (n >= 3) {
        const w1Len = Math.abs(p[1] - p[0]);
        const w2Len = Math.abs(p[2] - p[1]);
        const origin = p[0];
        levels.push({
          ratio: 1.0,
          price: origin,
          label: 'W2 max (100% W1)',
          isRetrace: false,
          color: '#ef4444',
          style: 'solid',
          width: 1,
        });
        if (w1Len > 0 && w2Len > w1Len) {
          errors.push('W2 retraced more than 100% of W1 (invalidated)');
        }
      }
      // W4 overlap check: W4 cannot enter W1 territory (below W1 high for uptrend)
      if (n >= 5) {
        const w1Peak = p[1];
        const direction = p[1] > p[0] ? 1 : -1;
        const w4Invalid = direction === 1 ? p[4] < w1Peak : p[4] > w1Peak;
        if (w4Invalid) {
          errors.push('W4 overlaps Wave 1 territory (impulse rule violated)');
        }
      }
      // W3 shortest check: W3 cannot be the shortest impulse wave
      if (n >= 6) {
        const w1Len = Math.abs(p[1] - p[0]);
        const w3Len = Math.abs(p[3] - p[2]);
        const w5Len = Math.abs(p[5] - p[4]);
        if (w3Len < w1Len && w3Len < w5Len) {
          errors.push('Wave 3 is the shortest (impulse rule violated: W3 must not be shortest)');
        }
      }
    }

    if (isDiagonalType) {
      // Determine diagonal type once W3 is placed (n >= 4):
      //   Contracting: W1 > W3 > W5 and W2 > W4 (trendlines converge)
      //   Expanding:   W1 < W3 < W5 and W2 < W4 (trendlines diverge)
      if (n >= 4) {
        const w1Len = Math.abs(p[1] - p[0]);
        const w3Len = Math.abs(p[3] - p[2]);
        const isExpandingDiag = w3Len > w1Len;

        // W4 vs W2 monotonicity
        if (n >= 5) {
          const w2Len = Math.abs(p[2] - p[1]);
          const w4Len = Math.abs(p[4] - p[3]);
          if (isExpandingDiag) {
            if (w4Len <= w2Len) {
              errors.push('W4 must be longer than W2 for an expanding diagonal');
            }
          } else {
            if (w4Len >= w2Len) {
              errors.push('W4 must be shorter than W2 for a contracting diagonal');
            }
          }
        }

        // W5 vs W3 monotonicity
        if (n >= 6) {
          const w5Len = Math.abs(p[5] - p[4]);
          if (isExpandingDiag) {
            if (w5Len <= w3Len) {
              errors.push('W5 must be longer than W3 for an expanding diagonal');
            }
          } else {
            if (w5Len >= w3Len) {
              errors.push('W5 must be shorter than W3 for a contracting diagonal');
            }
          }
        }
      }
      // Invalidation at P0 origin
      if (n >= 2) {
        levels.push({
          ratio: 0,
          price: p[0],
          label: 'Diagonal Invalidation (P0)',
          isRetrace: false,
          color: '#ef4444',
          style: 'solid',
          width: 1,
        });
      }
    }

    if (isCorrectionType) {
      if (n >= 3) {
        const waveALen = Math.abs(p[1] - p[0]);
        const waveBLen = Math.abs(p[2] - p[1]);
        const bRetrace = waveALen > 0 ? waveBLen / waveALen : 0;

        if (currentPatternType === 'zigzag' || currentPatternType === 'wxy' || currentPatternType === 'combination') {
          // Wave B cannot retrace more than 100% of Wave A
          levels.push({
            ratio: 1.0,
            price: p[0],
            label: 'B max (100% of A)',
            isRetrace: false,
            color: '#ef4444',
            style: 'solid',
            width: 1,
          });
          if (bRetrace > 1.0) {
            errors.push('Wave B retraced more than 100% of Wave A (zigzag invalidated)');
          }
        } else if (currentPatternType === 'flat') {
          // Wave B should retrace 90-138.2% of Wave A
          if (bRetrace < 0.9) {
            errors.push(`Wave B retraced only ${(bRetrace * 100).toFixed(1)}% of A (flat requires 90-138.2%)`);
          } else if (bRetrace > 1.382) {
            errors.push('Wave B retraced more than 138.2% of Wave A (flat invalidated)');
          }
        }
      }
    }

    return { validationErrors: errors, invalidationLevels: levels };
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
    validationErrors,
    isValid: validationErrors.length === 0,
    invalidationLevels,
    activateMode,
    deactivateMode,
    placePoint,
    reset,
    undo,
    canSave: isComplete && validationErrors.length === 0,
    canUndo: points.length > 0,
  };
}

// Keep old name as alias for backward compatibility
export const usePredictiveElliottWave = useElliottWave;

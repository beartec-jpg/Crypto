/**
 * Elliott Wave internal structure definitions.
 *
 * Defines the point count, labels, and sub-pattern options for each wave type.
 * Used by the predictive Elliott Wave tool to configure drawing state.
 */

import type { WaveType, SubPattern } from '@/types/drawing';

export type { WaveType, SubPattern };

export interface WaveStructureInfo {
  /** Total number of points to place (including origin point 0) */
  pointCount: number;
  /** Labels for each placed point */
  pointLabels: string[];
  /** Wave category */
  category: 'impulse' | 'corrective' | 'complex';
  /** Human-readable description */
  description: string;
  /** Available sub-patterns for this wave type */
  subPatterns?: SubPattern[];
}

// Shared internal structures
const IMPULSE_POINTS = { pointCount: 6, pointLabels: ['0', '1', '2', '3', '4', '5'] };
const CORRECTION_POINTS = { pointCount: 4, pointLabels: ['0', 'A', 'B', 'C'] };
const TRIANGLE_POINTS = { pointCount: 6, pointLabels: ['0', 'A', 'B', 'C', 'D', 'E'] };

const CORRECTIVE_SUB_PATTERNS: SubPattern[] = [
  'zigzag',
  'flat',
  'expanded_flat',
  'triangle',
  'running_flat',
];

const IMPULSE_SUB_PATTERNS: SubPattern[] = ['impulse', 'leading_diagonal', 'ending_diagonal'];

export const WAVE_STRUCTURES: Record<WaveType, WaveStructureInfo> = {
  W1: {
    ...IMPULSE_POINTS,
    category: 'impulse',
    description: 'Wave 1 – Initial impulse (0-1-2-3-4-5)',
    subPatterns: ['impulse', 'leading_diagonal'],
  },
  W2: {
    ...CORRECTION_POINTS,
    category: 'corrective',
    description: 'Wave 2 – ABC correction of Wave 1',
    subPatterns: CORRECTIVE_SUB_PATTERNS,
  },
  W3: {
    ...IMPULSE_POINTS,
    category: 'impulse',
    description: 'Wave 3 – Strongest impulse (0-1-2-3-4-5)',
    subPatterns: ['impulse'],
  },
  W4: {
    ...CORRECTION_POINTS,
    category: 'corrective',
    description: 'Wave 4 – Correction before Wave 5',
    subPatterns: CORRECTIVE_SUB_PATTERNS,
  },
  W5: {
    ...IMPULSE_POINTS,
    category: 'impulse',
    description: 'Wave 5 – Final impulse (0-1-2-3-4-5)',
    subPatterns: ['impulse', 'ending_diagonal'],
  },
  A: {
    ...IMPULSE_POINTS,
    category: 'corrective',
    description: 'Wave A – First corrective leg',
    subPatterns: IMPULSE_SUB_PATTERNS,
  },
  B: {
    ...CORRECTION_POINTS,
    category: 'corrective',
    description: 'Wave B – Counter-trend correction',
    subPatterns: CORRECTIVE_SUB_PATTERNS,
  },
  C: {
    ...IMPULSE_POINTS,
    category: 'corrective',
    description: 'Wave C – Final corrective leg',
    subPatterns: ['impulse', 'ending_diagonal'],
  },
  W: {
    ...CORRECTION_POINTS,
    category: 'complex',
    description: 'W – First leg of complex correction (ABC)',
  },
  X: {
    ...CORRECTION_POINTS,
    category: 'complex',
    description: 'X – Connector wave in complex correction',
  },
  Y: {
    ...CORRECTION_POINTS,
    category: 'complex',
    description: 'Y – Second leg of complex correction (ABC)',
  },
};

/**
 * Returns the structure info for a wave type, adjusting for sub-pattern overrides.
 */
export function getWaveStructure(
  waveType: WaveType,
  subPattern?: SubPattern,
): WaveStructureInfo {
  const base = WAVE_STRUCTURES[waveType];
  if (subPattern === 'triangle') {
    return {
      ...TRIANGLE_POINTS,
      category: base.category,
      description: `${base.description} (Triangle)`,
    };
  }
  return base;
}

/**
 * Returns the suggested next wave type after completing the given wave.
 */
export function getNextWaveType(current: WaveType): WaveType | null {
  const sequence: Partial<Record<WaveType, WaveType>> = {
    W1: 'W2',
    W2: 'W3',
    W3: 'W4',
    W4: 'W5',
    A: 'B',
    B: 'C',
    W: 'X',
    X: 'Y',
  };
  return sequence[current] ?? null;
}

/**
 * Returns a display label for the wave type.
 */
export function getWaveLabel(waveType: WaveType): string {
  const labels: Record<WaveType, string> = {
    W1: 'Wave 1', W2: 'Wave 2', W3: 'Wave 3', W4: 'Wave 4', W5: 'Wave 5',
    A: 'Wave A', B: 'Wave B', C: 'Wave C',
    W: 'W', X: 'X', Y: 'Y',
  };
  return labels[waveType];
}

/**
 * Returns a display label for a sub-pattern.
 */
export function getSubPatternLabel(subPattern: SubPattern): string {
  const labels: Record<SubPattern, string> = {
    impulse: 'Standard Impulse',
    leading_diagonal: 'Leading Diagonal',
    ending_diagonal: 'Ending Diagonal',
    zigzag: 'Zigzag (ABC)',
    flat: 'Flat (ABC)',
    expanded_flat: 'Expanded Flat',
    triangle: 'Triangle (ABCDE)',
    running_flat: 'Running Flat',
  };
  return labels[subPattern];
}

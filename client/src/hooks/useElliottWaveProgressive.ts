/**
 * useElliottWaveProgressive
 *
 * Progressive Elliott Wave drawing hook with auto-detection and classification.
 *
 * User flow:
 *   1. Activate the tool
 *   2. Click points continuously to build wave structures
 *   3. After each point the hook auto-detects the forming pattern
 *      and shows Fibonacci levels for the *next* expected point
 *   4. After a 3-wave correction (5 points in segment) a classification popup triggers
 *   5. After a 5-wave impulse (6 points in segment) a classification popup triggers
 *   6. User classifies the completed structure (Wave 1-5, A-C, or Standalone)
 *   7. Labels are updated and drawing continues for nested structures
 *   8. User manually saves when ready
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  detectPattern,
  type ProgressivePoint,
  type PatternDetectionResult,
  type WaveDegree,
} from '@/lib/elliottWave/patternDetector';
import { calcRetracementLevels } from '@/lib/elliottWave/fibCalculator';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';

// Wave degree labels exposed to UI
export type { WaveDegree };

/** Wave classification number */
export type WaveNumber = 1 | 2 | 3 | 4 | 5 | 'A' | 'B' | 'C';

/** A completed and classified wave structure */
export interface WaveClassification {
  startIndex: number;
  endIndex: number;
  waveNumber: WaveNumber;
  waveType: 'impulse' | 'correction';
  labels: string[];
}

/** A structure that completed and is awaiting user classification */
export interface PendingClassification {
  structureType: 'impulse' | 'correction';
  startIndex: number;
  endIndex: number;
  /** Suggested waves based on prior context */
  suggestedWaves: WaveNumber[];
}

export interface ProgressiveWavePoint extends ProgressivePoint {
  /** Sequential index in the points array (0-based) */
  index: number;
}

export type ProgressiveMode =
  | 'idle'
  | 'placing'; // actively placing points (unlimited)

export interface UseElliottWaveProgressiveResult {
  /** Current tool mode */
  mode: ProgressiveMode;

  /** All placed points in order */
  placedPoints: ProgressiveWavePoint[];

  /** Auto-detection + validation result for the *current segment* */
  detection: PatternDetectionResult;

  /** Fibonacci levels to display on chart for the next expected point */
  fibLevels: FibLevel[];

  /** Current wave degree (for nested tracking) */
  waveDegree: WaveDegree;

  /** Current wave degree index */
  waveDegreeIndex: number;

  /** Completed wave classifications */
  classifications: WaveClassification[];

  /** Pending classification (popup trigger) */
  pendingClassification: PendingClassification | null;

  /** Index in placedPoints where the current segment begins */
  segmentStartIndex: number;

  /** Actions */
  activateMode: () => void;
  deactivateMode: () => void;
  placePoint: (time: number, price: number, snappedToHigh: boolean) => void;
  undo: () => void;
  reset: () => void;
  incrementDegree: () => void;
  decrementDegree: () => void;

  /** Classify the last completed structure */
  classifyLastStructure: (waveNumber: WaveNumber | 'standalone') => void;
  /** Skip classification (advance segment without labelling) */
  skipClassification: () => void;

  /** Status helpers */
  getStatusText: () => string;
  isActive: boolean;
  canUndo: boolean;
  canContinue: boolean;
  /** True when there are at least 2 placed points (drawing can be saved) */
  canSave: boolean;
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

// Labels applied to sub-wave endpoints when an impulse is classified
const IMPULSE_SUB_LABELS: Record<string, string[]> = {
  '1': ['①₁', '①₂', '①₃', '①₄', '①₅'],
  '3': ['③₁', '③₂', '③₃', '③₄', '③₅'],
  '5': ['⑤₁', '⑤₂', '⑤₃', '⑤₄', '⑤₅'],
  'A': ['Ⓐ₁', 'Ⓐ₂', 'Ⓐ₃', 'Ⓐ₄', 'Ⓐ₅'],
  'C': ['Ⓒ₁', 'Ⓒ₂', 'Ⓒ₃', 'Ⓒ₄', 'Ⓒ₅'],
};

// Labels applied to ABC endpoints when a correction is classified
const CORRECTION_SUB_LABELS: Record<string, string[]> = {
  '2': ['②a', '②b', '②c'],
  '4': ['④a', '④b', '④c'],
  'B': ['Ⓑa', 'Ⓑb', 'Ⓑc'],
};

/** Suggest the most likely next wave based on the last classified one */
function getSuggestedWaves(
  structureType: 'impulse' | 'correction',
  lastClassification: WaveClassification | null,
): WaveNumber[] {
  if (structureType === 'impulse') {
    if (!lastClassification) return [1, 3, 5, 'A', 'C'];
    switch (lastClassification.waveNumber) {
      case 2: return [3];
      case 4: return [5];
      case 'B': return ['C'];
      default: return [1, 3, 5, 'A', 'C'];
    }
  } else {
    if (!lastClassification) return [2, 4, 'B'];
    switch (lastClassification.waveNumber) {
      case 1: return [2];
      case 3: return [4];
      case 5: return ['A'];
      case 'A': return ['B'];
      case 'C': return [2, 4, 'B'];
      default: return [2, 4, 'B'];
    }
  }
}

export function useElliottWaveProgressive(): UseElliottWaveProgressiveResult {
  const [mode, setMode] = useState<ProgressiveMode>('idle');
  const [placedPoints, setPlacedPoints] = useState<ProgressiveWavePoint[]>([]);
  const [waveDegreeIndex, setWaveDegreeIndex] = useState<number>(3); // Default: 'Minor'
  const [segmentStartIndex, setSegmentStartIndex] = useState<number>(0);
  const [classifications, setClassifications] = useState<WaveClassification[]>([]);
  const [pendingClassification, setPendingClassification] = useState<PendingClassification | null>(null);

  // Auto-detect pattern based on the *current segment* only
  const detection = useMemo<PatternDetectionResult>(
    () => detectPattern(placedPoints.slice(segmentStartIndex), waveDegreeIndex),
    [placedPoints, segmentStartIndex, waveDegreeIndex],
  );

  // Fibonacci levels to show on the chart
  const fibLevels = useMemo<FibLevel[]>(() => {
    const segment = placedPoints.slice(segmentStartIndex);
    const n = segment.length;
    if (n < 2) return [];
    if (n === 2) {
      return calcRetracementLevels(segment[0].price, segment[1].price);
    }
    return detection.nextPointLevels;
  }, [placedPoints, segmentStartIndex, detection]);

  const waveDegree = WAVE_DEGREES[Math.min(waveDegreeIndex, WAVE_DEGREES.length - 1)];

  // ── Completion detection ──────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'placing') return;

    const segment = placedPoints.slice(segmentStartIndex);
    const n = segment.length;

    // Don't re-trigger if popup is already showing
    if (pendingClassification !== null) return;

    const lastClass = classifications.length > 0
      ? classifications[classifications.length - 1]
      : null;

    if (n === 5) {
      const p = segment.map(pt => pt.price);
      const isUptrend = p[1] > p[0];
      const w3ExceedsW1 = isUptrend ? p[3] > p[1] : p[3] < p[1];
      if (!w3ExceedsW1) {
        // ABC correction complete
        setPendingClassification({
          structureType: 'correction',
          startIndex: segmentStartIndex,
          endIndex: segmentStartIndex + n - 1,
          suggestedWaves: getSuggestedWaves('correction', lastClass),
        });
      }
    } else if (n === 6) {
      // 5-wave impulse complete
      setPendingClassification({
        structureType: 'impulse',
        startIndex: segmentStartIndex,
        endIndex: segmentStartIndex + n - 1,
        suggestedWaves: getSuggestedWaves('impulse', lastClass),
      });
    }
  }, [placedPoints, segmentStartIndex, pendingClassification, classifications, mode]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const activateMode = useCallback(() => {
    setMode('placing');
    setPlacedPoints([]);
    setSegmentStartIndex(0);
    setClassifications([]);
    setPendingClassification(null);
  }, []);

  const deactivateMode = useCallback(() => {
    setMode('idle');
  }, []);

  const reset = useCallback(() => {
    setMode('placing');
    setPlacedPoints([]);
    setSegmentStartIndex(0);
    setClassifications([]);
    setPendingClassification(null);
  }, []);

  const placePoint = useCallback((time: number, price: number, snappedToHigh: boolean) => {
    setPlacedPoints(prev => {
      const newPoint: ProgressiveWavePoint = {
        index: prev.length,
        // Label is segment-relative (0-based within the current segment)
        label: String(prev.length - segmentStartIndex),
        time,
        price,
        snappedToHigh,
      };
      return [...prev, newPoint];
    });
  }, [segmentStartIndex]);

  const undo = useCallback(() => {
    setPlacedPoints(prev => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
    // Clear popup if undoing while it's shown
    setPendingClassification(null);
  }, []);

  const incrementDegree = useCallback(() => {
    setWaveDegreeIndex(i => Math.min(i + 1, WAVE_DEGREES.length - 1));
  }, []);

  const decrementDegree = useCallback(() => {
    setWaveDegreeIndex(i => Math.max(i - 1, 0));
  }, []);

  /** Classify the last completed structure and apply sub-wave labels */
  const classifyLastStructure = useCallback((waveNumber: WaveNumber | 'standalone') => {
    if (!pendingClassification) return;

    const { structureType, startIndex, endIndex } = pendingClassification;
    const waveKey = String(waveNumber);

    let labels: string[] = [];
    if (waveNumber !== 'standalone') {
      labels = structureType === 'impulse'
        ? (IMPULSE_SUB_LABELS[waveKey] ?? [])
        : (CORRECTION_SUB_LABELS[waveKey] ?? []);
    }

    // Apply labels to the classified points
    if (labels.length > 0) {
      setPlacedPoints(prev => {
        const updated = [...prev];
        if (structureType === 'impulse') {
          // Impulse: label sub-wave endpoints at startIndex+1 … startIndex+5
          for (let i = 0; i < labels.length; i++) {
            const idx = startIndex + 1 + i;
            if (idx <= endIndex && idx < updated.length) {
              updated[idx] = { ...updated[idx], label: labels[i] };
            }
          }
        } else {
          // Correction: label A/B/C endpoints at startIndex+2, +3, +4
          for (let i = 0; i < labels.length; i++) {
            const idx = startIndex + 2 + i;
            if (idx <= endIndex && idx < updated.length) {
              updated[idx] = { ...updated[idx], label: labels[i] };
            }
          }
        }
        return updated;
      });
    }

    if (waveNumber !== 'standalone') {
      const classification: WaveClassification = {
        startIndex,
        endIndex,
        waveNumber,
        waveType: structureType,
        labels,
      };
      setClassifications(prev => [...prev, classification]);
    }

    // Advance segment so next points start from the end of this structure
    setSegmentStartIndex(endIndex);
    setPendingClassification(null);
  }, [pendingClassification]);

  /** Advance the segment without classification */
  const skipClassification = useCallback(() => {
    if (!pendingClassification) return;
    setSegmentStartIndex(pendingClassification.endIndex);
    setPendingClassification(null);
  }, [pendingClassification]);

  // ── Status helpers ────────────────────────────────────────────────────────

  const getStatusText = useCallback(() => {
    if (mode === 'idle') return 'Elliott Wave tool inactive';

    const n = placedPoints.length;
    if (n === 0) return 'Click candle high/low to place point 0';

    if (pendingClassification) {
      return pendingClassification.structureType === 'impulse'
        ? '5-Wave structure complete – classify or continue'
        : '3-Wave correction complete – classify or continue';
    }

    return detection.nextPointHint || `${n} point${n !== 1 ? 's' : ''} placed`;
  }, [mode, placedPoints.length, pendingClassification, detection]);

  return {
    mode,
    placedPoints,
    detection,
    fibLevels,
    waveDegree,
    waveDegreeIndex,
    classifications,
    pendingClassification,
    segmentStartIndex,
    activateMode,
    deactivateMode,
    placePoint,
    undo,
    reset,
    incrementDegree,
    decrementDegree,
    classifyLastStructure,
    skipClassification,
    getStatusText,
    isActive: mode !== 'idle',
    canUndo: placedPoints.length > 0,
    canContinue: false, // kept for interface compatibility; use canSave instead
    canSave: placedPoints.length >= 2,
  };
}

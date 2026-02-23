/**
 * usePredictiveElliottWave
 *
 * Predictive Elliott Wave drawing hook.
 *
 * User flow:
 *   1. Activate the tool → mode becomes 'selecting'
 *   2. WaveTypeSelector popup appears
 *   3. User selects wave type (and optionally sub-pattern) → mode becomes 'drawing'
 *   4. Tool expects `expectedPointCount` points based on the wave type
 *   5. As points are placed, `predictiveFibLevels` shows targets for the next sub-wave
 *   6. After all points are placed → mode becomes 'complete'
 *   7. `suggestedNextWave` is shown; user can call `continueToNextWave()` to chain waves
 *   8. `canPlaceMidAir` is always true – points can be placed anywhere on the chart
 *   9. Points placed without candle snap have `isMidAir = true` (visual distinction)
 */

import { useState, useCallback, useMemo } from 'react';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';
import {
  getWaveStructure,
  getNextWaveType,
} from '@/lib/elliottWave/waveStructures';
import {
  getPredictiveTargets,
  getInProgressPredictiveLevels,
} from '@/lib/elliottWave/waveTargets';
import type { WaveType, SubPattern } from '@/types/drawing';

export type { WaveType, SubPattern };
export type { FibLevel };

export type PredictiveMode = 'idle' | 'selecting' | 'drawing' | 'complete';

export interface PredictiveWavePoint {
  time: number;
  price: number;
  /** Label within the current wave structure (e.g. "0", "1", "A", "B") */
  label: string;
  /** True when the point was placed without snapping to a candle high/low */
  isMidAir: boolean;
  /** True when the point is a predicted target, not a confirmed user placement */
  isPredicted: boolean;
  /** Snap type from gesture controller – drives marker position (above/below bar) */
  snapType?: 'high' | 'low' | 'none';
}

export interface UsePredictiveElliottWaveResult {
  // ── Selection state ────────────────────────────────────────────────────────
  showWaveSelector: boolean;
  selectedWaveType: WaveType | null;
  selectedSubPattern: SubPattern | null;

  // ── Drawing state ──────────────────────────────────────────────────────────
  mode: PredictiveMode;
  placedPoints: PredictiveWavePoint[];
  /** Total expected point count for the selected wave type */
  expectedPointCount: number;

  // ── Predictive features ────────────────────────────────────────────────────
  /** Fibonacci levels showing targets for the next sub-wave WHILE drawing */
  predictiveFibLevels: FibLevel[];
  /** Always true – users can place points anywhere on the chart */
  canPlaceMidAir: boolean;

  // ── Continuation ──────────────────────────────────────────────────────────
  /** Next suggested wave type after completing the current one */
  suggestedNextWave: WaveType | null;
  /** Transition to drawing the next wave (inherits context from completed wave) */
  continueToNextWave: () => void;

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Activate the tool (transitions to 'selecting') */
  activateMode: () => void;
  /** Deactivate and reset the tool */
  deactivateMode: () => void;
  /** Called after user picks a wave type in WaveTypeSelector */
  selectWaveType: (type: WaveType, subPattern?: SubPattern) => void;
  /** Place a point. isMidAir=true when snapType==='none' */
  placePoint: (time: number, price: number, isMidAir: boolean, snapType?: 'high' | 'low' | 'none') => void;
  /** Undo the last placed point */
  undo: () => void;
  /** Reset drawing for the current wave type */
  reset: () => void;

  // ── Status helpers ─────────────────────────────────────────────────────────
  getStatusText: () => string;
  isActive: boolean;
  canUndo: boolean;
  /** True when ≥2 points are placed (drawing can be saved) */
  canSave: boolean;
}

/**
 * Returns the structural label for a point (e.g. "0", "1", "A", "B").
 * The wave type degree label is placed at the trendline endpoint, not on each point.
 */
function buildPointLabel(structureLabel: string): string {
  return structureLabel;
}

export function usePredictiveElliottWave(): UsePredictiveElliottWaveResult {
  const [mode, setMode] = useState<PredictiveMode>('idle');
  const [selectedWaveType, setSelectedWaveType] = useState<WaveType | null>(null);
  const [selectedSubPattern, setSelectedSubPattern] = useState<SubPattern | null>(null);
  const [placedPoints, setPlacedPoints] = useState<PredictiveWavePoint[]>([]);

  // Track prior wave points for inter-wave fib calculations
  const [priorW1Points, setPriorW1Points] = useState<{ time: number; price: number }[]>([]);
  const [priorAPoints, setPriorAPoints] = useState<{ time: number; price: number }[]>([]);

  // Derived: wave structure info
  const waveStructure = useMemo(
    () => selectedWaveType ? getWaveStructure(selectedWaveType, selectedSubPattern ?? undefined) : null,
    [selectedWaveType, selectedSubPattern],
  );

  const expectedPointCount = waveStructure?.pointCount ?? 0;

  // Derived: predictive fib levels
  const predictiveFibLevels = useMemo<FibLevel[]>(() => {
    if (!selectedWaveType || placedPoints.length < 2) return [];

    const rawPoints = placedPoints.map(p => ({ time: p.time, price: p.price }));
    const n = placedPoints.length;

    // When the wave is complete, show targets for the NEXT wave
    if (mode === 'complete') {
      return getPredictiveTargets(
        selectedWaveType,
        rawPoints,
        priorW1Points.length >= 2 ? priorW1Points : undefined,
        priorAPoints.length >= 2 ? priorAPoints : undefined,
      );
    }

    // While drawing, show in-progress targets for the next sub-wave
    if (n < expectedPointCount) {
      return getInProgressPredictiveLevels(selectedWaveType, rawPoints);
    }

    return [];
  }, [selectedWaveType, placedPoints, mode, expectedPointCount, priorW1Points, priorAPoints]);

  // Derived: suggested next wave
  const suggestedNextWave = useMemo<WaveType | null>(
    () => mode === 'complete' && selectedWaveType ? getNextWaveType(selectedWaveType) : null,
    [mode, selectedWaveType],
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const activateMode = useCallback(() => {
    setMode('selecting');
    setPlacedPoints([]);
    setSelectedWaveType(null);
    setSelectedSubPattern(null);
  }, []);

  const deactivateMode = useCallback(() => {
    setMode('idle');
    setPlacedPoints([]);
    setSelectedWaveType(null);
    setSelectedSubPattern(null);
  }, []);

  const selectWaveType = useCallback((type: WaveType, subPattern?: SubPattern) => {
    setSelectedWaveType(type);
    setSelectedSubPattern(subPattern ?? null);
    setPlacedPoints([]);
    setMode('drawing');
  }, []);

  const placePoint = useCallback((time: number, price: number, isMidAir: boolean, snapType?: 'high' | 'low' | 'none') => {
    if (mode !== 'drawing' || !waveStructure) return;

    setPlacedPoints(prev => {
      const pointIndex = prev.length;
      const structureLabel = waveStructure.pointLabels[pointIndex] ?? String(pointIndex);
      const label = selectedWaveType
        ? buildPointLabel(structureLabel)
        : structureLabel;

      const newPoint: PredictiveWavePoint = {
        time,
        price,
        label,
        isMidAir,
        isPredicted: false,
        snapType: snapType ?? (isMidAir ? 'none' : undefined),
      };
      const updated = [...prev, newPoint];

      // Check if the wave is now complete
      if (updated.length >= waveStructure.pointCount) {
        // Save context for subsequent waves
        const rawPoints = updated.map(p => ({ time: p.time, price: p.price }));
        if (selectedWaveType === 'W1') setPriorW1Points(rawPoints);
        if (selectedWaveType === 'A') setPriorAPoints(rawPoints);
        // For complex corrections, save W as prior reference for Y targets
        if (selectedWaveType === 'W') setPriorW1Points(rawPoints);
        // Schedule mode transition after state update
        setTimeout(() => setMode('complete'), 0);
      }

      return updated;
    });
  }, [mode, waveStructure, selectedWaveType]);

  const undo = useCallback(() => {
    setPlacedPoints(prev => prev.slice(0, -1));
    // If we were in 'complete', go back to 'drawing'
    if (mode === 'complete') {
      setMode('drawing');
    }
  }, [mode]);

  const reset = useCallback(() => {
    setPlacedPoints([]);
    setMode('drawing');
  }, []);

  const continueToNextWave = useCallback(() => {
    if (!suggestedNextWave) return;
    // The last point of the current wave becomes the first point of the next
    const lastPoint = placedPoints[placedPoints.length - 1] ?? null;
    const nextStructure = getWaveStructure(suggestedNextWave);

    setSelectedWaveType(suggestedNextWave);
    setSelectedSubPattern(null);

    if (lastPoint) {
      const firstLabel = nextStructure.pointLabels[0] ?? '0';
      const startPoint: PredictiveWavePoint = {
        time: lastPoint.time,
        price: lastPoint.price,
        label: buildPointLabel(firstLabel),
        isMidAir: lastPoint.isMidAir,
        isPredicted: false,
        snapType: lastPoint.snapType,
      };
      setPlacedPoints([startPoint]);
    } else {
      setPlacedPoints([]);
    }

    setMode('drawing');
  }, [suggestedNextWave, placedPoints]);

  // ── Status helpers ────────────────────────────────────────────────────────

  const getStatusText = useCallback(() => {
    switch (mode) {
      case 'idle':
        return 'Elliott Wave tool inactive';
      case 'selecting':
        return 'Select a wave type to begin drawing';
      case 'drawing': {
        const n = placedPoints.length;
        if (!waveStructure) return 'Drawing…';
        const remaining = waveStructure.pointCount - n;
        const nextLabel = waveStructure.pointLabels[n] ?? '?';
        return remaining > 0
          ? `Place point ${nextLabel} (${n}/${waveStructure.pointCount} placed)`
          : 'Wave complete';
      }
      case 'complete':
        return `${selectedWaveType ? getWaveStructure(selectedWaveType).description.split('–')[0].trim() : 'Wave'} complete${suggestedNextWave ? ` – continue with ${suggestedNextWave}?` : ''}`;
      default:
        return '';
    }
  }, [mode, placedPoints.length, waveStructure, selectedWaveType, suggestedNextWave]);

  return {
    showWaveSelector: mode === 'selecting',
    selectedWaveType,
    selectedSubPattern,
    mode,
    placedPoints,
    expectedPointCount,
    predictiveFibLevels,
    canPlaceMidAir: true,
    suggestedNextWave,
    continueToNextWave,
    activateMode,
    deactivateMode,
    selectWaveType,
    placePoint,
    undo,
    reset,
    getStatusText,
    isActive: mode !== 'idle',
    canUndo: placedPoints.length > 0,
    canSave: placedPoints.length >= 2,
  };
}

/**
 * @fileoverview Elliott Wave State
 * @description Type definitions for Elliott Wave state management.
 * Defines the shape of state for wave drawings, degree selection, and predictions.
 *
 * This file is part of the ChartFullscreenPage refactor (Phase 5)
 * [PR #1] Created file structure - Zero functional changes
 */

/**
 * Wave degree labels used in Elliott Wave analysis
 * Will be expanded in PR #2
 */
export type WaveDegree =
  | 'Grand Supercycle'
  | 'Supercycle'
  | 'Cycle'
  | 'Primary'
  | 'Intermediate'
  | 'Minor'
  | 'Minute'
  | 'Minuette'
  | 'Sub-Minuette';

/**
 * Core Elliott Wave state interface
 * Will be populated in PR #2
 */
export interface ElliottWaveState {
  /** The currently selected wave degree */
  selectedDegree: WaveDegree | null;
  // TODO: Add full state shape in PR #2
}

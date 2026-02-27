/**
 * @fileoverview Oscillator State
 * @description Type definitions for oscillator state management.
 * Defines the shape of state for oscillator panels displayed below the main chart.
 *
 * This file is part of the ChartFullscreenPage refactor (Phase 5)
 * [PR #1] Created file structure - Zero functional changes
 */

/**
 * Supported oscillator types
 * Will be expanded in PR #2
 */
export type OscillatorType = 'rsi' | 'macd' | 'stochastic' | 'cci' | string;

/**
 * State for a single oscillator panel
 * Will be populated in PR #2
 */
export interface OscillatorPanelState {
  /** The type of oscillator displayed in this panel */
  type: OscillatorType;
  /** Whether this oscillator panel is visible */
  visible: boolean;
  // TODO: Add full panel state shape in PR #2
}

/**
 * Combined state for all oscillator panels
 * Will be populated in PR #2
 */
export interface OscillatorState {
  /** List of active oscillator panels */
  panels: OscillatorPanelState[];
  // TODO: Add full state shape in PR #2
}

/**
 * @fileoverview Elliott Wave Handlers
 * @description Event handlers for Elliott Wave interactions.
 * Handles wave point placement, degree changes, and wave type selection.
 *
 * This file is part of the ChartFullscreenPage refactor (Phase 5)
 * [PR #1] Created file structure - Zero functional changes
 */

/**
 * Options for Elliott Wave event handler creation
 * Will be populated in PR #2
 */
export interface ElliottWaveHandlerOptions {
  // TODO: Add handler options in PR #2
}

/**
 * Collection of Elliott Wave event handler functions
 * Will be populated in PR #2
 */
export interface ElliottWaveHandlers {
  /** Handler invoked when a wave point is placed on the chart */
  onWavePointPlaced?: (timestamp: number, price: number) => void;
  /** Handler invoked when the wave degree selection changes */
  onDegreeChange?: (degree: string) => void;
  /** Handler invoked when the wave drawing is completed */
  onWaveComplete?: () => void;
  // TODO: Add full handler definitions in PR #2
}

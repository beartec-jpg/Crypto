/**
 * @fileoverview Elliott Wave Persistence
 * @description Save/load logic for Elliott Wave drawings.
 * Handles serialization, deserialization, and backend sync of wave data.
 *
 * This file is part of the ChartFullscreenPage refactor (Phase 5)
 * [PR #1] Created file structure - Zero functional changes
 */

/**
 * Options for the Elliott Wave persistence layer
 * Will be populated in PR #2
 */
export interface ElliottWavePersistenceOptions {
  // TODO: Add persistence options in PR #2
}

/**
 * Result returned after saving an Elliott Wave drawing
 * Will be populated in PR #2
 */
export interface ElliottWaveSaveResult {
  /** Whether the save operation succeeded */
  success: boolean;
  // TODO: Add full result shape in PR #2
}

/**
 * Result returned after loading Elliott Wave drawings
 * Will be populated in PR #2
 */
export interface ElliottWaveLoadResult {
  /** Whether the load operation succeeded */
  success: boolean;
  // TODO: Add full result shape in PR #2
}

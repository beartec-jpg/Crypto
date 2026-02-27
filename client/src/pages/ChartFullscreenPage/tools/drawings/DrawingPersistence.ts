/**
 * @fileoverview Drawing Persistence
 * @description Logic for saving and loading drawings to/from the backend.
 * Handles serialization, deserialization, and sync of drawing data.
 *
 * This file is part of the ChartFullscreenPage refactor (Phase 5)
 * [PR #1] Created file structure - Zero functional changes
 */

/**
 * Options for the drawing persistence layer
 * Will be populated in PR #2
 */
export interface DrawingPersistenceOptions {
  // TODO: Add persistence options in PR #2
}

/**
 * Result returned after a save operation
 * Will be populated in PR #2
 */
export interface DrawingSaveResult {
  /** Whether the save operation succeeded */
  success: boolean;
  // TODO: Add full result shape in PR #2
}

/**
 * Result returned after a load operation
 * Will be populated in PR #2
 */
export interface DrawingLoadResult {
  /** Whether the load operation succeeded */
  success: boolean;
  // TODO: Add full result shape in PR #2
}

/**
 * @fileoverview Drawing State
 * @description Type definitions and interfaces for drawing state management.
 * Defines the shape of drawing-related state used across the drawing tools.
 *
 * This file is part of the ChartFullscreenPage refactor (Phase 5)
 * [PR #1] Created file structure - Zero functional changes
 */

/**
 * Represents the active drawing mode
 * Will be expanded in PR #2
 */
export type DrawingMode = 'none' | 'drawing' | 'editing' | 'deleting';

/**
 * Core drawing state interface
 * Will be populated in PR #2
 */
export interface DrawingState {
  /** The currently active drawing mode */
  mode: DrawingMode;
  // TODO: Add full state shape in PR #2
}

/**
 * Drawing tool selection state
 * Will be populated in PR #2
 */
export interface DrawingToolState {
  /** The currently selected drawing tool identifier */
  selectedTool: string | null;
  // TODO: Add full state shape in PR #2
}

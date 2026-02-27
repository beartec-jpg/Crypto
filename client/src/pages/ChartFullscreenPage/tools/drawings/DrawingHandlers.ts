/**
 * @fileoverview Drawing Handlers
 * @description Event handlers for drawing interactions including mouse events,
 * touch events, and keyboard shortcuts related to drawing operations.
 *
 * This file is part of the ChartFullscreenPage refactor (Phase 5)
 * [PR #1] Created file structure - Zero functional changes
 */

/**
 * Options passed to drawing event handlers
 * Will be populated in PR #2
 */
export interface DrawingHandlerOptions {
  // TODO: Add handler options in PR #2
}

/**
 * Collection of drawing event handler functions
 * Will be populated in PR #2
 */
export interface DrawingHandlers {
  /** Handler for pointer down events on the chart canvas */
  onPointerDown?: (event: PointerEvent) => void;
  /** Handler for pointer move events on the chart canvas */
  onPointerMove?: (event: PointerEvent) => void;
  /** Handler for pointer up events on the chart canvas */
  onPointerUp?: (event: PointerEvent) => void;
  // TODO: Add full handler definitions in PR #2
}

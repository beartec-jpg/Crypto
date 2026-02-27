/**
 * @fileoverview Settings State
 * @description Type definitions for settings state management.
 * Defines the shape of state for all configurable chart settings and modals.
 *
 * This file is part of the ChartFullscreenPage refactor (Phase 5)
 * [PR #1] Created file structure - Zero functional changes
 */

/**
 * State tracking which settings modal is currently open
 * Will be populated in PR #2
 */
export interface ModalOpenState {
  /** Identifier of the currently open modal, or null if none */
  openModal: string | null;
  // TODO: Add full modal open state in PR #2
}

/**
 * Combined settings state for the chart page
 * Will be populated in PR #2
 */
export interface SettingsState {
  /** Modal open/close state */
  modal: ModalOpenState;
  // TODO: Add full settings state shape in PR #2
}

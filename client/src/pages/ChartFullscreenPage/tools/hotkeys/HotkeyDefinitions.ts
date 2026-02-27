/**
 * @fileoverview Hotkey Definitions
 * @description Type definitions and key mappings for chart keyboard shortcuts.
 * Defines the structure for hotkey actions and their key combinations.
 *
 * This file is part of the ChartFullscreenPage refactor (Phase 5)
 * [PR #1] Created file structure - Zero functional changes
 */

/**
 * Represents a keyboard key combination
 * Will be populated in PR #2
 */
export interface KeyCombo {
  /** The primary key (e.g., 'Escape', 'z', 'Delete') */
  key: string;
  /** Whether the Ctrl/Cmd modifier is required */
  ctrl?: boolean;
  /** Whether the Shift modifier is required */
  shift?: boolean;
  /** Whether the Alt modifier is required */
  alt?: boolean;
}

/**
 * A single hotkey action definition
 * Will be populated in PR #2
 */
export interface HotkeyDefinition {
  /** Unique identifier for this hotkey action */
  id: string;
  /** Human-readable description of the action */
  description: string;
  /** The key combination that triggers this action */
  keys: KeyCombo[];
  // TODO: Add handler reference in PR #2
}

/**
 * Map of hotkey IDs to their definitions
 * Will be populated in PR #2
 */
export type HotkeyMap = Record<string, HotkeyDefinition>;

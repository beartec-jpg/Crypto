/**
 * UI-related constants
 * Layout dimensions, margins, padding, and configuration
 * Extracted from CryptoSandbox.tsx for reusability and maintainability
 */

/**
 * Chart margins
 * Space around the main chart area for axes and labels
 */
export const MARGIN = {
  top: 20,
  right: 80,
  bottom: 40,
  left: 20
} as const;

/**
 * Left toolbar width in pixels
 * Width of the drawing tools toolbar
 */
export const LEFT_TOOLBAR_WIDTH = 60;

/**
 * Top controls height in pixels
 * Height of the symbol/interval selector and indicator controls
 */
export const TOP_CONTROLS_HEIGHT = 60;

/**
 * Chart padding
 * Internal padding within the chart area
 */
export const CHART_PADDING = {
  left: 50,
  right: 70,
  top: 20,
  bottom: 20
} as const;

/**
 * Label rendering configuration
 * Settings for label positioning and spacing
 */
export const LABEL_RENDERING_CONFIG = {
  PADDING: 10,
  MIN_DISTANCE_BETWEEN_LABELS: 20,
  ESTIMATED_LABEL_HEIGHT: 16,
} as const;

/**
 * Menu positioning constraints
 * Minimum distances from edges for context menus
 */
export const MENU_CONSTRAINTS = {
  minX: 60,
  minY: 50,
  marginRight: 10,
  defaultMenuWidth: 200
} as const;

/**
 * Layout constants for chart and UI positioning
 * Extracted from ChartFullscreenPage.tsx for reusability
 */

// Touch gesture detection thresholds
export const TOUCH_TAP_THRESHOLD = 150; // ms - max duration for a tap
export const TOUCH_MOVE_THRESHOLD = 10; // pixels - max movement for a tap

// Chart resize debounce delay
export const RESIZE_DEBOUNCE_MS = 100; // ms - debounce delay for resize events

// Oscillator panel height constant
export const OSCILLATOR_PANEL_HEIGHT_PER = 120; // Height per oscillator in pixels

// Navigation and toolbar heights
export const MOBILE_NAV_HEIGHT = 65; // Height of mobile navigation bar at bottom
export const TOP_TOOLBAR_HEIGHT = 80; // Approximate height of top toolbar

// Drawing toolbar positioning constants
export const DRAWING_TOOLBAR_BOTTOM_MARGIN = 16; // Margin above oscillators when active
export const DRAWING_TOOLBAR_DEFAULT_BOTTOM = 80; // Default bottom position (5rem = 80px)
export const DRAWING_TOOLBAR_ESTIMATED_HALF_WIDTH = 150; // Approximate half-width for centering

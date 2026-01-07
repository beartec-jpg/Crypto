/**
 * Interaction-related constants
 * Thresholds and timings for user interactions (touch, click, drag, etc.)
 * Extracted from CryptoSandbox.tsx for reusability and maintainability
 */

/**
 * Touch movement threshold in pixels
 * Movement above this is considered a drag, not a tap
 * Increased for mobile usability
 */
export const TOUCH_THRESHOLD = 35;

/**
 * Click debounce time in milliseconds
 * Ignore clicks within this time of each other
 */
export const CLICK_DEBOUNCE = 100;

/**
 * Maximum tap duration in milliseconds
 * Taps longer than this are not considered tap gestures
 */
export const TAP_MAX_DURATION = 300;

/**
 * Fibonacci level snap threshold in pixels
 * Distance threshold for snapping to Fibonacci levels
 */
export const FIB_SNAP_PIXELS = 20;

/**
 * Magnet snap radius in pixels
 * Distance for magnet snap to candlesticks
 */
export const MAGNET_RADIUS = 30;

/**
 * Chart-relative magnet snap radius
 * Used for hit detection in chart space
 */
export const MAGNET_RADIUS_CHART = 35;

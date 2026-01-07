// Drawing-related constants for CryptoSandbox component

// Symbol and interval lists
export const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'];
export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];

// Touch and interaction thresholds
export const TOUCH_THRESHOLD = 35; // pixels - movement above this is a drag, not a tap (increased for mobile)
export const CLICK_DEBOUNCE = 100; // ms - ignore clicks within this time of each other
export const TAP_MAX_DURATION = 300; // ms - max time for a tap gesture
export const FIB_SNAP_PIXELS = 20; // pixels - threshold for snapping to Fibonacci levels

// Magnet mode
export const MAGNET_RADIUS = 30; // pixels

// Color palette for trendlines
export const TRENDLINE_COLORS = ['#facc15', '#22c55e', '#ef4444', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#ffffff'];

// Fibonacci level type (needs to be here for the constants below)
export type FibLevel = { ratio: number; visible: boolean; showLabel: boolean };

// Default Fibonacci Retracement levels
export const DEFAULT_FIB_LEVELS: FibLevel[] = [
  { ratio: 0, visible: true, showLabel: true },
  { ratio: 0.236, visible: true, showLabel: true },
  { ratio: 0.382, visible: true, showLabel: true },
  { ratio: 0.5, visible: true, showLabel: true },
  { ratio: 0.618, visible: true, showLabel: true },
  { ratio: 0.786, visible: true, showLabel: true },
  { ratio: 1, visible: true, showLabel: true },
  { ratio: 1.272, visible: false, showLabel: true },
  { ratio: 1.618, visible: false, showLabel: true },
  { ratio: 2.618, visible: false, showLabel: true },
];

// Default Trend-Based Fibonacci Extension levels
export const DEFAULT_TRENDFIB_LEVELS: FibLevel[] = [
  { ratio: 0, visible: true, showLabel: true },
  { ratio: 0.236, visible: true, showLabel: true },
  { ratio: 0.382, visible: true, showLabel: true },
  { ratio: 0.5, visible: true, showLabel: true },
  { ratio: 0.618, visible: true, showLabel: true },
  { ratio: 0.786, visible: true, showLabel: true },
  { ratio: 1, visible: true, showLabel: true },
  { ratio: 1.272, visible: true, showLabel: true },
  { ratio: 1.618, visible: true, showLabel: true },
  { ratio: 2.618, visible: false, showLabel: true },
];

// Label rendering configuration
export const LABEL_RENDERING_CONFIG = {
  PADDING: 10,
  MIN_DISTANCE_BETWEEN_LABELS: 20,
  ESTIMATED_LABEL_HEIGHT: 16,
} as const;

/**
 * Drawing-related constants
 * Extracted from CryptoSandbox.tsx for reusability and maintainability
 */

import type { FibLevel, LineStyle } from '@/types/drawing';

/**
 * Available trading symbols
 */
export const SYMBOLS = [
  'BTCUSDT', 
  'ETHUSDT', 
  'SOLUSDT', 
  'XRPUSDT', 
  'ADAUSDT'
] as const;

/**
 * Available time intervals
 */
export const INTERVALS = [
  '1m', 
  '5m', 
  '15m', 
  '1h', 
  '4h', 
  '1d'
] as const;

/**
 * Available drawing tools
 */
export const DRAWING_TOOLS = [
  'trendline',
  'horizontal',
  'channel',
  'fibretracement',
  'trendfib',
  'label',
  'impulse',
  'abc',
  'wxy',
  'abcde',
  'wxyxz',
  'hchannel',
  'schannel',
  'elliottwave'
] as const;

/**
 * Color palette for trendlines and other drawing tools
 */
export const TRENDLINE_COLORS = [
  '#facc15', // yellow
  '#22c55e', // green
  '#ef4444', // red
  '#3b82f6', // blue
  '#a855f7', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#ffffff'  // white
] as const;

/**
 * Available line styles for drawing tools
 */
export const LINE_STYLES: readonly LineStyle[] = [
  'solid', 
  'dashed', 
  'dotted'
] as const;

/**
 * Default Fibonacci retracement levels
 * Standard levels from 0% to 261.8%
 */
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

/**
 * Default Trend-Based Fibonacci Extension levels
 * Used for 3-click trend fib extensions
 */
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

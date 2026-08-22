/**
 * Time-related utility functions for chart rendering
 * Extracted from CryptoIndicators.tsx
 */

// Constant for future bar count - ensures consistent whitespace across all timeframes
export const FUTURE_BAR_COUNT = 300;

/**
 * Utility to generate future whitespace bars for the chart
 * This allows drawing on future dates by providing timestamps beyond the last candle
 */
export const generateFutureWhitespace = (lastCandleTime: number, interval: string, count: number = 50): { time: number }[] => {
  const intervalSeconds: Record<string, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '6h': 21600,
    '8h': 28800,
    '12h': 43200,
    '1d': 86400,
    '3d': 259200,
    '1w': 604800,
    '1M': 2592000,
  };
  
  const seconds = intervalSeconds[interval] || 3600;
  const futureBars: { time: number }[] = [];
  
  for (let i = 1; i <= count; i++) {
    futureBars.push({ time: lastCandleTime + (seconds * i) });
  }
  
  return futureBars;
};

/**
 * Future bars included in the initial viewport.
 * Extra bars from getFutureBarCount() sit off-screen to the right so you can
 * pan into them without the first load zooming out across months of empty axis.
 */
export const getInitialVisibleFutureBarCount = (interval: string): number => {
  const visibleCounts: Record<string, number> = {
    '1m': 500,
    '3m': 500,
    '5m': 500,
    '15m': 400,
    '30m': 300,
    '1h': 500,
    '2h': 300,
    '4h': 200, // ~2 months on screen at 4h (200 bars + rightOffset)
    '6h': 200,
    '8h': 150,
    '12h': 120,
    '1d': 365,
    '3d': 200,
    '1w': 104,
    '1M': 36,
  };
  return visibleCounts[interval] ?? 300;
};

/**
 * Total future whitespace bars on the time axis, including off-screen space.
 * 1h–12h target ~6 months so Elliott Wave projections can be drawn well past
 * the last candle (4h: 1080 bars × 4h ≈ 180 days).
 */
export const getFutureBarCount = (interval: string): number => {
  const futureCounts: Record<string, number> = {
    '1m': 500,
    '3m': 500,
    '5m': 500,
    '15m': 400,
    '30m': 300,
    '1h': 4320, // ~6 months
    '2h': 2160, // ~6 months
    '4h': 1080, // ~6 months
    '6h': 720,  // ~6 months
    '8h': 540,  // ~6 months
    '12h': 360, // ~6 months
    '1d': 365,
    '3d': 200,
    '1w': 104,
    '1M': 36,
  };
  return futureCounts[interval] ?? 300;
};

/**
 * Get table row limit based on timeframe - industry standard lookback periods
 */
export const getTableRowLimit = (interval: string): number => {
  const limits: Record<string, number> = {
    '1m': 60,   // 1 hour of data
    '3m': 40,   // 2 hours
    '5m': 36,   // 3 hours
    '15m': 32,  // 8 hours
    '30m': 24,  // 12 hours
    '1h': 24,   // 1 day
    '2h': 24,   // 2 days
    '4h': 18,   // 3 days
    '6h': 16,   // 4 days
    '8h': 15,   // 5 days
    '12h': 14,  // 1 week
    '1d': 21,   // 3 weeks
    '3d': 14,   // 6 weeks
    '1w': 12,   // 3 months
    '1M': 6,    // 6 months
  };
  return limits[interval] || 24;
};

/**
 * Generate array of values between min and max with specified step
 */
export const generateRangeValues = (min: number, max: number, step: number): number[] => {
  const values: number[] = [];
  for (let v = min; v <= max; v += step) {
    values.push(Number(v.toFixed(2)));
  }
  return values;
};

/**
 * Format timestamp to readable date and time string
 * @param timestampSeconds - Unix timestamp in seconds
 * @param includeTime - Whether to include time component
 * @returns Formatted date string
 */
export const formatTimestamp = (timestampSeconds: number, includeTime: boolean = true): string => {
  const date = new Date(timestampSeconds * 1000);
  
  if (!includeTime) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  
  return date.toLocaleString();
};

/**
 * Format timestamp to time only (HH:MM format)
 * @param timestampSeconds - Unix timestamp in seconds
 * @returns Time string in HH:MM format
 */
export const formatTimeOnly = (timestampSeconds: number): string => {
  const date = new Date(timestampSeconds * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * Format timestamp to date only
 * @param timestampSeconds - Unix timestamp in seconds
 * @returns Date string (e.g., "Jan 15")
 */
export const formatDateOnly = (timestampSeconds: number): string => {
  const date = new Date(timestampSeconds * 1000);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/**
 * Parse interval string to seconds
 * @param interval - Interval string (e.g., "1h", "4h", "1d")
 * @returns Number of seconds in the interval
 */
export const parseInterval = (interval: string): number => {
  const intervalSeconds: Record<string, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '6h': 21600,
    '8h': 28800,
    '12h': 43200,
    '1d': 86400,
    '3d': 259200,
    '1w': 604800,
    '1M': 2592000,
  };
  
  return intervalSeconds[interval] || 3600;
};

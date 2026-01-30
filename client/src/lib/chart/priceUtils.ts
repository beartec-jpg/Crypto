/**
 * Price and ticker formatting utilities
 * Extracted from CryptoIndicators.tsx
 */

/**
 * Helper to format MA label with timeframe suffix
 * Examples: 21 (current), 100D (daily), 21W (weekly), 100h4 (4-hour), 50h1 (hourly), 21m5 (5-min)
 */
export const formatMALabel = (period: number, timeframe: string): string => {
  if (timeframe === 'current') return `${period}`;
  if (timeframe === '1d') return `${period}D`;
  if (timeframe === '1w') return `${period}W`;
  if (timeframe === '1M') return `${period}M`;
  if (timeframe === '4h') return `${period}h4`;
  if (timeframe === '1h') return `${period}h1`;
  if (timeframe === '15m') return `${period}m15`;
  if (timeframe === '5m') return `${period}m5`;
  if (timeframe === '1m') return `${period}m1`;
  return `${period}${timeframe}`;
};

/**
 * Format ticker symbol for display
 */
export const formatTickerDisplay = (ticker: string): string => {
  return ticker.replace('USDT', '/USDT');
};

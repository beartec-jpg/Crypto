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

/**
 * Format price with smart decimal precision
 */
export function formatPrice(price: number, precision?: number): string {
  if (precision !== undefined) {
    return price.toFixed(precision);
  }
  
  // Auto-detect precision based on price magnitude
  if (price >= 1000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(3);
  if (price >= 10) return price.toFixed(4);
  if (price >= 1) return price.toFixed(5);
  return price.toFixed(6);
}

/**
 * Format percentage change with sign
 */
export function formatPercentChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * Format volume with K/M/B suffix
 */
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(2)}B`;
  }
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(2)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(2)}K`;
  }
  return volume.toFixed(2);
}

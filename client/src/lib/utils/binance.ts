/**
 * Binance API utility functions
 * Extracted from multiple files for reusability
 */

/**
 * Convert timeframe to Binance API format
 * Used across ChartFullscreenPage, useSimpleChart, historicalDataCache, TickerTable
 */
export const convertTimeframe = (tf: string): string => {
  const map: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  return map[tf] || '1h';
};

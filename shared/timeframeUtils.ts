/**
 * Shared timeframe hierarchy utilities for cross-timeframe drawing visibility.
 * Used by both client and API to determine which timeframes should be visible
 * when viewing a chart at a given timeframe interval.
 */

/**
 * All supported timeframe intervals ordered from smallest to largest.
 */
export const TIMEFRAME_ORDER: readonly string[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'];

/**
 * Returns the current timeframe and all higher (larger) timeframes.
 * Drawings created on higher timeframes are always visible on lower timeframe charts.
 *
 * Example: getVisibleTimeframes('15m') → ['15m', '1h', '4h', '1d']
 */
export function getVisibleTimeframes(currentTimeframe: string): string[] {
  const index = TIMEFRAME_ORDER.indexOf(currentTimeframe);
  if (index === -1) {
    return [currentTimeframe];
  }
  return TIMEFRAME_ORDER.slice(index);
}

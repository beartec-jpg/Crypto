/**
 * Style and color utility functions for chart elements
 * Extracted from CryptoIndicators.tsx for better modularity
 */

/**
 * Get color based on bullish/bearish status
 */
export function getBullBearColor(isBullish: boolean): string {
  return isBullish ? '#00ff9d' : '#ff3b69';
}

/**
 * Get consistent color for indicator by name
 */
export function getIndicatorColor(name: string): string {
  const colorMap: Record<string, string> = {
    'rsi': '#7c3aed',
    'macd': '#3b82f6',
    'stochastic': '#f59e0b',
    'obv': '#10b981',
    'mfi': '#ec4899',
    'williams': '#06b6d4',
    'cci': '#8b5cf6',
    'adx': '#ef4444',
    'ema': '#3b82f6',
    'sma': '#22c55e',
    'bollinger': '#f59e0b',
    'vwap': '#8b5cf6',
    'supertrend': '#ec4899',
    'parabolic': '#06b6d4'
  };
  
  return colorMap[name.toLowerCase()] || '#64748b'; // Default gray
}

/**
 * Get zone highlight color
 */
export function getZoneColor(zone: 'overbought' | 'oversold' | 'neutral'): string {
  const zoneColors = {
    'overbought': 'rgba(239, 68, 68, 0.1)', // Red with alpha
    'oversold': 'rgba(34, 197, 94, 0.1)', // Green with alpha
    'neutral': 'rgba(100, 116, 139, 0.05)' // Gray with alpha
  };
  
  return zoneColors[zone];
}

/**
 * Get trend color (bullish/bearish)
 */
export function getTrendColor(trend: 'bullish' | 'bearish' | 'neutral'): string {
  const trendColors = {
    'bullish': '#22c55e',
    'bearish': '#ef4444',
    'neutral': '#64748b'
  };
  
  return trendColors[trend];
}

/**
 * Get opacity for active/inactive states
 */
export function getStateOpacity(isActive: boolean): number {
  return isActive ? 1.0 : 0.3;
}

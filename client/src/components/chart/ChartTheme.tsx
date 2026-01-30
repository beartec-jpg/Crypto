/**
 * ChartTheme.tsx
 * Provides chart theme configuration and utilities
 * Extracted from CryptoIndicators.tsx
 */

import { ColorType } from 'lightweight-charts';

export interface ChartThemeConfig {
  layout: {
    background: { type: typeof ColorType.Solid; color: string };
    textColor: string;
  };
  grid: {
    vertLines: { color: string };
    horzLines: { color: string };
  };
}

/**
 * Default dark theme for crypto charts
 * Matches the theme used in CryptoIndicators.tsx
 */
export const darkTheme: ChartThemeConfig = {
  layout: {
    background: { type: ColorType.Solid, color: '#0f172a' },
    textColor: '#d1d5db',
  },
  grid: {
    vertLines: { color: '#1e293b' },
    horzLines: { color: '#1e293b' },
  },
};

/**
 * Light theme for crypto charts (alternative)
 */
export const lightTheme: ChartThemeConfig = {
  layout: {
    background: { type: ColorType.Solid, color: '#ffffff' },
    textColor: '#1e293b',
  },
  grid: {
    vertLines: { color: '#e2e8f0' },
    horzLines: { color: '#e2e8f0' },
  },
};

/**
 * Chart color constants used throughout the application
 * Extracted from CryptoIndicators.tsx
 */
export const CHART_COLORS = {
  // Candlestick colors
  upColor: '#10b981',
  downColor: '#ef4444',
  
  // Moving averages (from MA_COLORS in CryptoIndicators.tsx)
  ma: {
    ema9: '#3b82f6',
    ema21: '#f59e0b',
    ema50: '#8b5cf6',
    ema100: '#ec4899',
    ema200: '#10b981',
  },
  
  // SMC colors
  fvg: {
    bullish: '#10b98133',
    bearish: '#ef444433',
  },
  bos: {
    bullish: '#10b981',
    bearish: '#ef4444',
  },
  choch: {
    bullish: '#fbbf24',
    bearish: '#ec4899',
  },
  
  // Indicators
  supertrend: {
    bullish: '#10b981',
    bearish: '#ef4444',
  },
  bollingerBands: '#9333ea',
  vwap: '#3b82f6',
  sessionVwap: {
    asia: '#f59e0b',
    london: '#3b82f6',
    ny: '#10b981',
  },
  
  // Drawing tools
  trendline: '#3b82f6',
  horizontal: '#f59e0b',
  rectangle: '#10b981',
} as const;

/**
 * Apply theme to chart
 */
export function applyChartTheme(chart: any, theme: ChartThemeConfig): void {
  chart.applyOptions(theme);
}

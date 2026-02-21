/**
 * Liquidity Zone and Premium/Discount Zone type definitions.
 */

export interface LiquidityZone {
  id: string;
  type: 'high' | 'low';
  price: number;           // Representative level price
  touchTimes: number[];    // Timestamps of each equal high/low touch
  touchPrices: number[];   // Exact prices at each touch
  swept: boolean;          // Has price swept (wicked) through then rejected?
  sweepTime?: number;      // Timestamp of the sweep candle
  sweepPrice?: number;     // The wick extreme that swept through the level
  invalidated: boolean;    // Has price closed through the level (invalidated)?
  invalidationTime?: number; // Timestamp of the invalidation candle
}

export type PDRangeSource = 'swing' | 'day' | 'week';

export interface PDZone {
  id: string;
  rangeHigh: number;       // Top of the detected range
  rangeLow: number;        // Bottom of the detected range
  equilibrium: number;     // 50% mid-point
  startTime: number;       // Left edge of zone on chart
  endTime: number;         // Right edge of zone on chart (current candle)
  source: PDRangeSource;
}

export interface LiquiditySettings {
  enabled: boolean;

  // Detection
  equalThreshold: number;  // % tolerance for "equal" highs/lows, default 0.15
  minTouches: number;      // Minimum touches to qualify as a liquidity zone, default 2
  invalidationBuffer: number; // % adjustment for close-outside invalidation, default 0.05

  // Display
  showHighs: boolean;      // Show equal highs (sell-side liquidity)
  showLows: boolean;       // Show equal lows (buy-side liquidity)
  showSwept: boolean;      // Keep history of swept/invalidated zones visible

  // Colors
  lineColor: string;       // Default: '#fbbf24' (amber/yellow — pending)
  sweptColor: string;      // Default: '#22c55e' (green — swept)
  invalidatedColor: string; // Default: '#ef4444' (red — invalidated)
  sweepMarkerColor: string; // Default: '#f97316' (orange, for ⚡ marker)
}

export interface PDZoneSettings {
  enabled: boolean;

  // Range Source
  rangeSource: PDRangeSource; // 'swing' | 'day' | 'week'

  // Display
  showPremium: boolean;       // Upper 50% — selling zone
  showDiscount: boolean;      // Lower 50% — buying zone
  showEquilibrium: boolean;   // 50% equilibrium line
  showLabels: boolean;

  // Style
  opacity: number;            // Fill opacity, default 0.15
  premiumColor: string;       // Default: '#ef4444' (red)
  discountColor: string;      // Default: '#22c55e' (green)
  equilibriumColor: string;   // Default: '#fbbf24' (yellow)
}

export const DEFAULT_LIQUIDITY_SETTINGS: LiquiditySettings = {
  enabled: true,
  equalThreshold: 0.15,
  minTouches: 2,
  invalidationBuffer: 0.05,
  showHighs: true,
  showLows: true,
  showSwept: true,
  lineColor: '#fbbf24',
  sweptColor: '#22c55e',
  invalidatedColor: '#ef4444',
  sweepMarkerColor: '#f97316',
};

export const DEFAULT_PD_ZONE_SETTINGS: PDZoneSettings = {
  enabled: true,
  rangeSource: 'swing',
  showPremium: true,
  showDiscount: true,
  showEquilibrium: true,
  showLabels: true,
  opacity: 0.15,
  premiumColor: '#ef4444',
  discountColor: '#22c55e',
  equilibriumColor: '#fbbf24',
};

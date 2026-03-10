/**
 * Liquidity Zone type definitions.
 */

export interface LiquidityZone {
  id: string;
  type: 'high' | 'low';
  price: number;           // Representative level price
  touchTimes: number[];    // Timestamps of each equal high/low touch
  touchPrices: number[];   // Exact prices at each touch
  swept: boolean;          // Has price swept (wicked) through then rejected?
  sweepPending?: boolean;  // Wick through detected; waiting for close confirmation
  sweepTime?: number;      // Timestamp of the confirmation candle
  sweepPrice?: number;     // The wick extreme that swept through the level
  sweepIndex?: number;     // Candle index of the wick candle
  sweptIndex?: number;     // Candle index of the confirmation candle (used for scoring decay)
  invalidated: boolean;    // Has price closed through the level (invalidated)?
  invalidationTime?: number; // Timestamp of the invalidation candle
  
  // Enhanced sweep metrics (populated by enhancedLiquidityScoring)
  sweepValidationScore?: number; // 0-100: Institutional sweep quality
  isValidSweep?: boolean;        // Passes institutional validation criteria
  sweepConfluence?: number;      // 0-100: Alignment with FVG/OB/BOS
  sweepMomentum?: number;        // 0-100: Reversal speed score
  sweepVolumeConfirmation?: number; // 0-100: Volume on reversal candle
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

  // Sweep confirmation
  confirmationCandles: number; // Candles after wick to confirm sweep, default 3

  // Colors
  lineColor: string;       // Default: '#fbbf24' (amber/yellow — pending)
  sweptColor: string;      // Default: '#22c55e' (green — swept)
  invalidatedColor: string; // Default: '#ef4444' (red — invalidated)
  sweepMarkerColor: string; // Default: '#f97316' (orange, for ⚡ marker)
}

export const DEFAULT_LIQUIDITY_SETTINGS: LiquiditySettings = {
  enabled: true,
  equalThreshold: 0.15,
  minTouches: 2,
  invalidationBuffer: 0.05,
  showHighs: true,
  showLows: true,
  showSwept: true,
  confirmationCandles: 3,
  lineColor: '#fbbf24',
  sweptColor: '#22c55e',
  invalidatedColor: '#ef4444',
  sweepMarkerColor: '#f97316',
};

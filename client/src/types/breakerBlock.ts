/**
 * Breaker Block (BB) type definitions.
 *
 * A Breaker Block is an Order Block that price breaks through cleanly
 * (without mitigation first), causing it to flip to the opposite type.
 * e.g. Bearish OB → price closes above it without trading inside → Bullish Breaker
 */

export interface BreakerBlock {
  id: string;
  /** Flipped type: original bearish OB → bullish breaker, and vice versa */
  type: 'bullish' | 'bearish';

  // Zone bounds (inherited from the original OB)
  top: number;
  bottom: number;

  // Timing
  obTime: number;       // Timestamp of the original OB candle
  breakTime: number;    // Timestamp of the candle that broke through

  // Source OB id
  sourceObId: string;

  // Validity
  mitigated: boolean;
  mitigationTime?: number;

  // Age
  age: number;
}

export interface BreakerBlockSettings {
  enabled: boolean;

  // Display
  showBullish: boolean;
  showBearish: boolean;
  showMitigated: boolean;
  showLabels: boolean;
  extendRight: boolean;

  // Filters
  maxAge: number; // Max candles old

  // Stripe pattern
  stripeSpacing: number;  // px between diagonal stripes
  stripeWidth: number;    // px stripe line width

  // Colors
  bullishColor: string;
  bearishColor: string;
  mitigatedColor: string;

  // Opacity
  zoneOpacity: number;
}

export const DEFAULT_BB_SETTINGS: BreakerBlockSettings = {
  enabled: true,

  showBullish: true,
  showBearish: true,
  showMitigated: false,
  showLabels: true,
  extendRight: true,

  maxAge: 200,

  stripeSpacing: 8,
  stripeWidth: 1,

  bullishColor: '#3b82f6',
  bearishColor: '#f97316',
  mitigatedColor: '#6b7280',

  zoneOpacity: 0.2,
};

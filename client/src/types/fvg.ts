/**
 * Fair Value Gap (FVG) type definitions for the professional FVG detection system.
 */

export interface FVGDetection {
  id: string;
  type: 'bullish' | 'bearish';
  startTime: number;       // Candle 1 time
  endTime: number;         // Candle 3 time
  top: number;             // Upper bound of gap
  bottom: number;          // Lower bound of gap
  ce: number;              // Consequent Encroachment (50% level)
  gapSize: number;         // Absolute size
  gapPercent: number;      // % of price
  volume: number;          // Volume of candle 2 (impulse candle)
  volumeRatio: number;     // Volume vs average (e.g., 1.5x)
  mitigated: boolean;      // Has price returned to fill?
  mitigationPercent: number; // How much of gap is filled (0-100)
  mitigationTime?: number; // When it was mitigated
  age: number;             // Candles since formation
  isInverse: boolean;      // IFVG - flipped from S to R or R to S
}

export interface FVGSettings {
  enabled: boolean;

  // Filters
  minGapPercent: number;   // 0.1 - 5%
  maxGapPercent: number;   // 0 = no max
  minVolumeRatio: number;  // 1 - 3x
  maxAge: number;          // 10 - 500 candles

  // Display
  showBullish: boolean;
  showBearish: boolean;
  showMitigated: boolean;
  showCELine: boolean;
  showLabels: boolean;
  extendRight: boolean;

  // Advanced
  detectIFVG: boolean;

  // Colors
  bullishColor: string;    // Default: #22c55e (green)
  bearishColor: string;    // Default: #ef4444 (red)
  mitigatedColor: string;  // Default: #6b7280 (gray)
  ifvgColor: string;       // Default: #a855f7 (purple)
  ceLineColor: string;     // Default: #fbbf24 (yellow)
}

export const DEFAULT_FVG_SETTINGS: FVGSettings = {
  enabled: true,
  minGapPercent: 0.3,
  maxGapPercent: 0,
  minVolumeRatio: 1.0,
  maxAge: 200,
  showBullish: true,
  showBearish: true,
  showMitigated: false,
  showCELine: true,
  showLabels: false,
  extendRight: true,
  detectIFVG: true,
  bullishColor: '#22c55e',
  bearishColor: '#ef4444',
  mitigatedColor: '#6b7280',
  ifvgColor: '#a855f7',
  ceLineColor: '#fbbf24',
};

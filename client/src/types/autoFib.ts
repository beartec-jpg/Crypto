/**
 * Auto-Fibonacci Detection type definitions.
 */

export interface AutoFibLevel {
  level: number;        // 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.0, 2.618
  price: number;        // Calculated price
  label: string;        // "61.8%"
  isGolden: boolean;    // 0.618 or 1.618
  isExtension: boolean; // > 1.0
}

export interface AutoFibZone {
  id: string;
  swingHigh: { time: number; price: number };
  swingLow: { time: number; price: number };
  direction: 'retracement' | 'extension';
  levels: AutoFibLevel[];
  active: boolean; // Still valid or broken?
}

export interface AutoFibSettings {
  enabled: boolean;
  lookback: number;           // Candles to look back for swings (default: 20)
  showRetracements: boolean;  // Show 0-1.0 levels
  showExtensions: boolean;    // Show 1.272, 1.618, 2.0, 2.618

  // Level toggles
  enabledLevels: number[];    // [0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.0, 2.618]

  // Display
  lineColor: string;          // Default: '#fbbf24'
  goldenColor: string;        // Default: '#FFD700'
  lineWidth: number;          // Default: 1
  showLabels: boolean;        // Default: true
  extendRight: boolean;       // Default: true

  // Confluence
  enableConfluence: boolean;  // Check for SMC overlaps
  confluenceThreshold: number; // % tolerance (default: 0.5%)
}

export const DEFAULT_AUTO_FIB_SETTINGS: AutoFibSettings = {
  enabled: false,
  lookback: 20,
  showRetracements: true,
  showExtensions: true,
  enabledLevels: [0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.0, 2.618],
  lineColor: '#fbbf24',
  goldenColor: '#FFD700',
  lineWidth: 1,
  showLabels: true,
  extendRight: true,
  enableConfluence: true,
  confluenceThreshold: 0.5,
};

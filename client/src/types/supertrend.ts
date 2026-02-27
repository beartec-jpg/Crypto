export type SuperTrendType = 'standard' | 'adx' | 'keltner';

export interface SuperTrendConfig {
  type: SuperTrendType;
  enabled: boolean;
  period: number;           // ATR period (default: 10)
  multiplier: number;       // ATR multiplier (default: 3.0)

  // ADX Filter (for ADX type)
  adxPeriod: number;        // ADX period (default: 14)
  adxThreshold: number;     // Min ADX (default: 25)

  // Keltner (for Keltner type)
  emaPeriod: number;        // EMA period (default: 20)

  // Display
  showLine: boolean;        // Show trailing line
  showSignals: boolean;     // Show buy/sell arrows on flip
  lineWidth: number;        // Default: 2

  // Colors
  bullishColor: string;     // Default: '#22c55e' (green)
  bearishColor: string;     // Default: '#ef4444' (red)
  signalColor: string;      // Default: '#fbbf24' (yellow)
}

export interface SuperTrendSettings {
  standard: SuperTrendConfig;
  adx: SuperTrendConfig;
  keltner: SuperTrendConfig;
}

export const DEFAULT_SUPERTREND_SETTINGS: SuperTrendSettings = {
  standard: {
    type: 'standard',
    enabled: false,
    period: 10,
    multiplier: 3.0,
    adxPeriod: 14,
    adxThreshold: 25,
    emaPeriod: 20,
    showLine: true,
    showSignals: true,
    lineWidth: 2,
    bullishColor: '#22c55e',
    bearishColor: '#ef4444',
    signalColor: '#fbbf24',
  },
  adx: {
    type: 'adx',
    enabled: false,
    period: 10,
    multiplier: 3.0,
    adxPeriod: 14,
    adxThreshold: 25,
    emaPeriod: 20,
    showLine: true,
    showSignals: true,
    lineWidth: 2,
    bullishColor: '#22c55e',
    bearishColor: '#ef4444',
    signalColor: '#fbbf24',
  },
  keltner: {
    type: 'keltner',
    enabled: false,
    period: 10,
    multiplier: 3.0,
    adxPeriod: 14,
    adxThreshold: 25,
    emaPeriod: 20,
    showLine: true,
    showSignals: true,
    lineWidth: 2,
    bullishColor: '#06b6d4',
    bearishColor: '#f97316',
    signalColor: '#fbbf24',
  },
};

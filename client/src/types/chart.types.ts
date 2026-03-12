/**
 * Chart-related type definitions
 * Extracted from CryptoIndicators.tsx for reusability
 */

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VWAPData {
  time: number;
  value: number;
}

// Dynamic Moving Average configuration
export interface MAConfig {
  id: string;
  period: number;
  timeframe: string; // 'current' or specific timeframe like '1h', '4h', '1d'
  color: string;
  lineWidth?: number;
}

/**
 * Represents a divergence signal detected between price and one or more oscillators.
 * count indicates how many of the 7 oscillators confirm the divergence (1-7).
 * Optional SMT fields indicate multi-asset divergence detection.
 * Optional MTF fields carry multi-timeframe cascade scoring information.
 */
export interface DivergencePoint {
  time: number;
  price: number;
  type: 'bullish' | 'bearish';
  count: number;       // number of confirming indicators (1-7)
  indicators: string[]; // names of confirming indicators
  // SMT (multi-asset) divergence fields (optional)
  smtScore?: number; // 0-100, SMT divergence strength
  smtConfidence?: number; // 0-100, SMT confidence
  correlationSymbol?: string; // e.g., 'BTCUSDT' when comparing to BTC
  smtTimeSyncScore?: number; // 0-100, pivot time alignment
  // MTF (multi-timeframe) cascade fields (optional)
  mtfCascadeLevel?: number;        // 0-4, consecutive TF activation count
  mtfCascadeBonus?: number;        // 1.0 | 1.25 | 1.5 | 2.0 multiplier
  mtfActiveTimeframes?: string[];  // e.g. ['15m','1h','4h']
}

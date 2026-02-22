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

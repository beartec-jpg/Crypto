/**
 * Chart-related type definitions
 * Shared types for Binance API and chart data
 */

// Binance API kline structure
export type BinanceKline = [
  number,   // Open time
  string,   // Open
  string,   // High
  string,   // Low
  string,   // Close
  string,   // Volume
  number,   // Close time
  string,   // Quote asset volume
  number,   // Number of trades
  string,   // Taker buy base asset volume
  string,   // Taker buy quote asset volume
  string    // Ignore
];

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CVDDataItem {
  time: string;
  timestamp: number;
  delta: number;
  cumDelta: number;
  isBull: boolean;
  volume: number;
}

// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
/**
 * Candle data type used throughout the application
 */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Market bias type
 */
export type Bias = 'bullish' | 'bearish' | 'neutral';

/**
 * Hook for calculating EMA-based market bias
 * Uses EMA20, EMA50, and EMA100 to determine trend
 */

import { useMemo } from 'react';
import { calculateEMA } from '@/utils/emaCalculations';
import type { Bias } from '@/utils/structureDetection';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Calculate EMA bias based on EMA20, EMA50, and EMA100 alignment
 * @param candles Array of candle data
 * @returns Market bias: 'bullish' (EMA20 > EMA50 > EMA100), 'bearish' (EMA20 < EMA50 < EMA100), or 'neutral'
 */
export function useEMABias(candles: Candle[] | null): Bias {
  return useMemo(() => {
    if (!candles || candles.length < 100) {
      return 'neutral';
    }

    // Extract close prices
    const closePrices = candles.map(c => c.close);
    
    // Calculate EMAs
    const ema20 = calculateEMA(closePrices, 20);
    const ema50 = calculateEMA(closePrices, 50);
    const ema100 = calculateEMA(closePrices, 100);
    
    // Get the last values
    const lastEma20 = ema20[ema20.length - 1];
    const lastEma50 = ema50[ema50.length - 1];
    const lastEma100 = ema100[ema100.length - 1];
    
    // Determine bias based on EMA alignment
    if (lastEma20 > lastEma50 && lastEma50 > lastEma100) {
      return 'bullish';
    } else if (lastEma20 < lastEma50 && lastEma50 < lastEma100) {
      return 'bearish';
    }
    
    return 'neutral';
  }, [candles]);
}

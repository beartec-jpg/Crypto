/**
 * Volume-based indicator calculations
 * Extracted from CryptoIndicators.tsx for better modularity
 */

import type { CandleData } from '@/types/chart.types';

interface TimeValuePair {
  time: number;
  value: number;
}

/**
 * Calculate OBV (On Balance Volume)
 */
export function calculateOBV(bars: CandleData[]): TimeValuePair[] {
  let obv = 0;
  return bars.map((bar, i) => {
    if (i === 0) return { time: bar.time, value: 0 };
    if (bar.close > bars[i-1].close) obv += bar.volume;
    else if (bar.close < bars[i-1].close) obv -= bar.volume;
    return { time: bar.time, value: obv };
  });
}

/**
 * Calculate MFI (Money Flow Index)
 */
export function calculateMFI(candles: CandleData[], period: number = 14): TimeValuePair[] {
  if (candles.length < period + 1) return [];
  const result: TimeValuePair[] = [];
  
  for (let i = period; i < candles.length; i++) {
    let posFlow = 0;
    let negFlow = 0;
    
    for (let j = i - period + 1; j <= i; j++) {
      const typicalPrice = (candles[j].high + candles[j].low + candles[j].close) / 3;
      const rawMoneyFlow = typicalPrice * candles[j].volume;
      
      if (j > 0) {
        const prevTypicalPrice = (candles[j-1].high + candles[j-1].low + candles[j-1].close) / 3;
        if (typicalPrice > prevTypicalPrice) {
          posFlow += rawMoneyFlow;
        } else if (typicalPrice < prevTypicalPrice) {
          negFlow += rawMoneyFlow;
        }
      }
    }
    
    const moneyFlowRatio = negFlow === 0 ? 100 : posFlow / negFlow;
    const mfi = 100 - (100 / (1 + moneyFlowRatio));
    result.push({ time: candles[i].time, value: mfi });
  }
  
  return result;
}

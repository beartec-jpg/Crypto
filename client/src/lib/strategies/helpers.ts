/**
 * Helper functions for trading strategies
 */

import { calculateSwings } from '@/lib/smc/pivots';
import type { CandleData, VWAPData } from '@/types/chart.types';
import type { BOS, CHoCH } from '@/types/smc.types';

/**
 * Calculate BOS (Break of Structure) and CHoCH (Change of Character) events
 */
export function calculateBOSandCHoCH(
  data: CandleData[], 
  swingLength: number = 5
): { bos: BOS[]; choch: CHoCH[] } {
  const swings = calculateSwings(data, swingLength);
  const bosArray: BOS[] = [];
  const chochArray: CHoCH[] = [];
  
  if (swings.length < 3) return { bos: bosArray, choch: chochArray };
  
  const swingHighs: typeof swings = [];
  const swingLows: typeof swings = [];
  let currentTrend: 'bullish' | 'bearish' | null = null;
  
  for (let i = 0; i < swings.length; i++) {
    const swing = swings[i];
    
    if (swing.type === 'high') {
      swingHighs.push(swing);
      
      if (swingHighs.length >= 2) {
        const previousHigh = swingHighs[swingHighs.length - 2];
        
        if (swing.value > previousHigh.value) {
          const breakIdx = data.findIndex((c, idx) => 
            idx > previousHigh.index && idx <= swing.index && c.high > previousHigh.value
          );
          
          if (breakIdx !== -1) {
            const breakCandle = data[breakIdx];
            
            let isLiqGrab = false;
            for (let j = breakIdx + 1; j < Math.min(breakIdx + 5, data.length); j++) {
              if (data[j].close < previousHigh.value) {
                isLiqGrab = true;
                break;
              }
            }
            
            if (currentTrend === 'bearish') {
              chochArray.push({
                swingTime: previousHigh.time,
                swingPrice: previousHigh.value,
                breakTime: breakCandle.time,
                breakIndex: breakIdx,
                type: 'bullish',
                sweptLevel: 'high',
                isLiquidityGrab: isLiqGrab
              });
              currentTrend = 'bullish';
            } else {
              bosArray.push({
                swingTime: previousHigh.time,
                swingPrice: previousHigh.value,
                breakTime: breakCandle.time,
                breakIndex: breakIdx,
                type: 'bullish',
                sweptLevel: 'high',
                isLiquidityGrab: isLiqGrab
              });
              currentTrend = 'bullish';
            }
          }
        }
      }
    } else {
      swingLows.push(swing);
      
      if (swingLows.length >= 2) {
        const previousLow = swingLows[swingLows.length - 2];
        
        if (swing.value < previousLow.value) {
          const breakIdx = data.findIndex((c, idx) => 
            idx > previousLow.index && idx <= swing.index && c.low < previousLow.value
          );
          
          if (breakIdx !== -1) {
            const breakCandle = data[breakIdx];
            
            let isLiqGrab = false;
            for (let j = breakIdx + 1; j < Math.min(breakIdx + 5, data.length); j++) {
              if (data[j].close > previousLow.value) {
                isLiqGrab = true;
                break;
              }
            }
            
            if (currentTrend === 'bullish') {
              chochArray.push({
                swingTime: previousLow.time,
                swingPrice: previousLow.value,
                breakTime: breakCandle.time,
                breakIndex: breakIdx,
                type: 'bearish',
                sweptLevel: 'low',
                isLiquidityGrab: isLiqGrab
              });
              currentTrend = 'bearish';
            } else {
              bosArray.push({
                swingTime: previousLow.time,
                swingPrice: previousLow.value,
                breakTime: breakCandle.time,
                breakIndex: breakIdx,
                type: 'bearish',
                sweptLevel: 'low',
                isLiquidityGrab: isLiqGrab
              });
              currentTrend = 'bearish';
            }
          }
        }
      }
    }
  }
  
  return { bos: bosArray, choch: chochArray };
}

/**
 * Get current ATR (Average True Range) value
 */
export function getCurrentATR(data: CandleData[], period: number = 14): number {
  if (data.length < period) return 0;
  
  const trueRanges: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  const atr = trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
  return atr;
}

/**
 * Find stop loss level based on swing structure
 */
export function findStopLossLevel(
  data: CandleData[], 
  entry: number, 
  direction: 'long' | 'short', 
  swingLength: number
): number {
  const swings = calculateSwings(data, swingLength);
  
  if (direction === 'long') {
    const lows = swings.filter(s => s.type === 'low' && s.value < entry).sort((a, b) => b.value - a.value);
    return lows.length > 0 ? lows[0].value : entry * 0.99;
  } else {
    const highs = swings.filter(s => s.type === 'high' && s.value > entry).sort((a, b) => a.value - b.value);
    return highs.length > 0 ? highs[0].value : entry * 1.01;
  }
}

/**
 * Find next swing levels for TP targets (future pivots)
 */
export function findNextSwingLevels(
  data: CandleData[], 
  currentPrice: number, 
  direction: 'long' | 'short', 
  swingLength: number
): { tp2: number; tp3: number } {
  const swings = calculateSwings(data, swingLength);
  
  if (direction === 'long') {
    const highs = swings.filter(s => s.type === 'high' && s.value > currentPrice).sort((a, b) => a.value - b.value);
    return {
      tp2: highs.length > 0 ? highs[0].value : currentPrice * 1.02,
      tp3: highs.length > 1 ? highs[1].value : currentPrice * 1.03,
    };
  } else {
    const lows = swings.filter(s => s.type === 'low' && s.value < currentPrice).sort((a, b) => b.value - a.value);
    return {
      tp2: lows.length > 0 ? lows[0].value : currentPrice * 0.98,
      tp3: lows.length > 1 ? lows[1].value : currentPrice * 0.97,
    };
  }
}

/**
 * Get closest VWAP value from enabled VWAPs
 */
export function getClosestVWAP(
  currentPrice: number, 
  vwapValues: number[]
): number | null {
  if (vwapValues.length === 0) return null;
  
  return vwapValues.reduce((closest, vwap) => {
    return Math.abs(vwap - currentPrice) < Math.abs(closest - currentPrice) ? vwap : closest;
  });
}

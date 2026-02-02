/**
 * Pivot and Swing Level Calculations
 * 
 * Functions for finding stop loss and take profit levels based on swing structure
 */

import { calculateSwings } from '@/lib/smc/pivots';
import type { CandleData } from '@/types/chart.types';

// Re-export helper functions from strategies
export { findStopLossLevel, findNextSwingLevels } from '@/lib/strategies/helpers';

// ==================== TYPES ====================

export interface SwingLevels {
  tp1: number;
  tp2: number;
  tp3: number;
}

// ==================== FUNCTIONS ====================

/**
 * Find PREVIOUS swing high/low for TP targets (PAST PIVOTS - for quick scalps back to last resistance/support)
 * 
 * CRITICAL: This function includes detailed console logging for debugging
 * 
 * @param data - Candle data
 * @param currentPrice - Current price / entry price
 * @param direction - Trade direction ('long' or 'short')
 * @param customSwingLength - Optional custom swing length (defaults to chartSettings value)
 * @param endIndex - Optional end index for backtest accuracy (when provided, only uses data up to this point)
 * @returns Object with tp1, tp2, tp3 levels
 */
export function findPreviousSwingLevels(
  data: CandleData[],
  currentPrice: number,
  direction: 'long' | 'short',
  customSwingLength?: number,
  endIndex?: number
): SwingLevels {
  const swingLength = customSwingLength ?? 5; // Default to 5 if not provided
  const swingLengthToUse = swingLength;
  
  // DEBUG: Log exactly what swing length we're using
  console.log('🔍 findPreviousSwingLevels CALLED:', {
    receivedSwingLength: customSwingLength,
    actuallyUsing: swingLengthToUse,
    direction: direction.toUpperCase(),
    backtestMode: endIndex !== undefined ? `YES (candle ${endIndex + 1}/${data.length})` : 'NO (live)',
  });
  
  // If endIndex provided, only use data up to that point (for backtest accuracy)
  const dataToUse = endIndex !== undefined ? data.slice(0, endIndex + 1) : data;
  const swings = calculateSwings(dataToUse, swingLengthToUse);
  
  console.log('🔍 Calculated Swings:', {
    totalSwings: swings.length,
    swingLength: swingLengthToUse,
    highs: swings.filter(s => s.type === 'high').length,
    lows: swings.filter(s => s.type === 'low').length,
  });
  
  if (direction === 'long') {
    // Find previous swing highs ABOVE current price (scalp back UP to last resistance)
    const highs = swings
      .filter(s => s.type === 'high' && s.value > currentPrice)
      .sort((a, b) => a.value - b.value); // Ascending: closest above us first
    
    console.log('📊 Previous Swing Levels (LONG):', {
      entry: currentPrice.toFixed(4),
      candlesUsed: endIndex !== undefined ? `${endIndex + 1}/${data.length}` : `${data.length} (live)`,
      swingsAbove: highs.length,
      tp1: highs.length > 0 ? highs[0].value.toFixed(4) : 'NO SWING FOUND',
      tp2: highs.length > 1 ? highs[1].value.toFixed(4) : 'NO SWING FOUND',
      tp3: highs.length > 2 ? highs[2].value.toFixed(4) : 'NO SWING FOUND',
      allSwingHighs: highs.map(h => h.value.toFixed(4)).join(', '),
    });
    
    return {
      tp1: highs.length > 0 ? highs[0].value : currentPrice,
      tp2: highs.length > 1 ? highs[1].value : currentPrice,
      tp3: highs.length > 2 ? highs[2].value : currentPrice,
    };
  } else {
    // Find previous swing lows BELOW current price (scalp back DOWN to last support)
    const lows = swings
      .filter(s => s.type === 'low' && s.value < currentPrice)
      .sort((a, b) => b.value - a.value); // Descending: closest below us first
    
    console.log('📊 Previous Swing Levels (SHORT):', {
      entry: currentPrice.toFixed(4),
      candlesUsed: endIndex !== undefined ? `${endIndex + 1}/${data.length}` : `${data.length} (live)`,
      swingsBelow: lows.length,
      tp1: lows.length > 0 ? lows[0].value.toFixed(4) : 'NO SWING FOUND',
      tp2: lows.length > 1 ? lows[1].value.toFixed(4) : 'NO SWING FOUND',
      tp3: lows.length > 2 ? lows[2].value.toFixed(4) : 'NO SWING FOUND',
      allSwingLows: lows.map(l => l.value.toFixed(4)).join(', '),
    });
    
    return {
      tp1: lows.length > 0 ? lows[0].value : currentPrice,
      tp2: lows.length > 1 ? lows[1].value : currentPrice,
      tp3: lows.length > 2 ? lows[2].value : currentPrice,
    };
  }
}

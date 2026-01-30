/**
 * Color utility functions for chart elements
 * Extracted from CryptoIndicators.tsx
 */

import type { CandleData } from '@/types/chart.types';

/**
 * Determine color based on snap types for auto-color feature
 * For manual mode (magnet off), checks if line is above/below candles
 */
export const getAutoColor = (
  points: {time: number; price: number; snapType?: 'high' | 'low' | 'none'}[], 
  candles: CandleData[]
): string => {
  const snapTypes = points.map(p => p.snapType || 'none');
  const highCount = snapTypes.filter(t => t === 'high').length;
  const lowCount = snapTypes.filter(t => t === 'low').length;
  const noneCount = snapTypes.filter(t => t === 'none').length;
  
  // All highs = resistance = red
  if (highCount === points.length && highCount > 0) return '#ef4444'; // Red
  
  // All lows = support = green
  if (lowCount === points.length && lowCount > 0) return '#22c55e'; // Green
  
  // If all points are free placement (manual mode), check line position relative to candles
  if (noneCount === points.length && points.length >= 2) {
    // For a line, get the price at each point and check against candles in range
    const times = points.map(p => p.time as number).sort((a, b) => a - b);
    const startTime = times[0];
    const endTime = times[times.length - 1];
    
    // Get candles in range
    const candlesInRange = candles.filter(c => {
      const t = c.time as number;
      return t >= startTime && t <= endTime;
    });
    
    if (candlesInRange.length > 0) {
      // For simplicity, use average price of the line
      const avgPrice = points.reduce((sum, p) => sum + p.price, 0) / points.length;
      
      // Check if line is entirely below all lows (support)
      const allLows = candlesInRange.map(c => c.low);
      const minLow = Math.min(...allLows);
      if (avgPrice <= minLow) return '#22c55e'; // Green - support
      
      // Check if line is entirely above all highs (resistance)
      const allHighs = candlesInRange.map(c => c.high);
      const maxHigh = Math.max(...allHighs);
      if (avgPrice >= maxHigh) return '#ef4444'; // Red - resistance
    }
  }
  
  // Mixed highs and lows, or line crosses candles = blue
  return '#3b82f6'; // Blue
};

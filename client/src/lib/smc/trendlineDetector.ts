/**
 * Automatic trendline detection utilities
 * Extracted from CryptoIndicators.tsx for better modularity
 */

import type { CandleData } from '@/types/chart.types';
import { calculateSwings } from './pivots';

export interface Trendline {
  points: Array<{ time: number; price: number; index: number }>;
  slope: number;
  intercept: number;
  type: 'resistance' | 'support';
  strength: number;
  span: number;
}

interface TrendlineWithViolation extends Trendline {
  violationRate: number;
}

/**
 * Detect automatic trendlines from swing points using extremity-first approach
 */
export function detectTrendlines(
  data: CandleData[], 
  minTouches: number = 3, 
  tolerance: number = 0.002, 
  pivotLength: number = 10
): Trendline[] {
  const swings = calculateSwings(data, pivotLength);
  const swingHighs = swings.filter(s => s.type === 'high');
  const swingLows = swings.filter(s => s.type === 'low');
  
  // EXTREMITY-FIRST APPROACH: Always anchor from the absolute extremity
  const findTrendlineFromExtremity = (
    pivots: typeof swings, 
    type: 'resistance' | 'support'
  ): TrendlineWithViolation | null => {
    if (pivots.length < 2) return null;
    
    // Find TOP 3 absolute extremities (highest highs or lowest lows)
    const sortedByExtremity = type === 'resistance'
      ? [...pivots].sort((a, b) => b.value - a.value) // Highest first
      : [...pivots].sort((a, b) => a.value - b.value); // Lowest first
    
    // Use only the top 3 most extreme pivots as anchor points
    const extremeAnchors = sortedByExtremity.slice(0, 3);
    
    // Try building lines between extreme anchors
    const allCandidateLines: TrendlineWithViolation[] = [];
    
    // Try connecting each extreme anchor to other extreme anchors or nearby pivots
    for (const starter of extremeAnchors) {
      // Find pivots after this starter, prioritize other extreme anchors
      const pivotsAfterStarter = pivots.filter(p => p.index > starter.index);
      if (pivotsAfterStarter.length === 0) continue;
      
      // Sort second points: prefer extreme values first (other extremities)
      const sortedSecondPoints = type === 'resistance'
        ? [...pivotsAfterStarter].sort((a, b) => b.value - a.value) // Highest first
        : [...pivotsAfterStarter].sort((a, b) => a.value - b.value); // Lowest first
      
      // Try connecting to the top 5 most extreme second points
      for (const secondPoint of sortedSecondPoints.slice(0, 5)) {
        const slope = (secondPoint.value - starter.value) / (secondPoint.index - starter.index);
        const intercept = starter.value - slope * starter.index;
        
        // Find all pivots that align with this line
        const alignedPoints: Array<{ time: number; price: number; index: number }> = [
          { time: starter.time, price: starter.value, index: starter.index },
          { time: secondPoint.time, price: secondPoint.value, index: secondPoint.index }
        ];
        
        for (const pivot of pivots) {
          if (pivot.index === starter.index || pivot.index === secondPoint.index) continue;
          
          const expectedPrice = slope * pivot.index + intercept;
          const priceDeviation = Math.abs(pivot.value - expectedPrice) / pivot.value;
          
          if (priceDeviation <= tolerance) {
            alignedPoints.push({ time: pivot.time, price: pivot.value, index: pivot.index });
          }
        }
        
        if (alignedPoints.length >= minTouches) {
          alignedPoints.sort((a, b) => a.index - b.index);
          
          // Calculate violation rate for this line
          const firstIdx = alignedPoints[0].index;
          const lastIdx = alignedPoints[alignedPoints.length - 1].index;
          let violations = 0;
          let totalCandles = 0;
          
          for (let i = firstIdx; i <= lastIdx; i++) {
            const candle = data[i];
            const expectedPrice = slope * i + intercept;
            
            if (type === 'resistance') {
              if (candle.close > expectedPrice * 1.01) violations++;
            } else {
              if (candle.close < expectedPrice * 0.99) violations++;
            }
            totalCandles++;
          }
          
          const violationRate = totalCandles > 0 ? violations / totalCandles : 1;
          
          allCandidateLines.push({
            points: alignedPoints,
            slope,
            intercept,
            type,
            strength: alignedPoints.length,
            span: alignedPoints[alignedPoints.length - 1].index - alignedPoints[0].index,
            violationRate
          });
        }
      }
    }
    
    if (allCandidateLines.length === 0) return null;
    
    // Calculate extremity score for each line (higher = touches more extreme points)
    const getExtremityScore = (line: TrendlineWithViolation) => {
      const extremeIndices = new Set(extremeAnchors.map(e => e.index));
      return line.points.filter(p => extremeIndices.has(p.index)).length;
    };
    
    // Pick the BEST line: most extremity touches, then lowest violation rate, then most touches
    return allCandidateLines.reduce((best, current) => {
      const bestExtremity = getExtremityScore(best);
      const currentExtremity = getExtremityScore(current);
      
      // Strongly prefer lines touching more extreme points
      if (currentExtremity > bestExtremity) return current;
      if (bestExtremity > currentExtremity) return best;
      
      // Then prefer cleaner lines (lower violation rate)
      if (current.violationRate < best.violationRate - 0.02) return current;
      if (best.violationRate < current.violationRate - 0.02) return best;
      
      // Then prefer more touches
      if (current.strength > best.strength) return current;
      if (best.strength > current.strength) return best;
      
      // Finally prefer more recent last pivot
      const bestLastPivot = best.points[best.points.length - 1].index;
      const currentLastPivot = current.points[current.points.length - 1].index;
      return currentLastPivot > bestLastPivot ? current : best;
    });
  };
  
  // Validate trendlines - check price respects line through the trend
  const validateTrendline = (line: Trendline): boolean => {
    const firstIdx = line.points[0].index;
    const lastPivotIdx = line.points[line.points.length - 1].index;
    
    let violations = 0;
    let totalCandles = 0;
    
    // Check candles from first pivot to last pivot (not to current price)
    // This validates the trend was respected during its formation
    for (let i = firstIdx; i <= lastPivotIdx; i++) {
      const candle = data[i];
      const expectedPrice = line.slope * i + line.intercept;
      
      // For resistance: VIOLATION = closing significantly ABOVE the line
      // For support: VIOLATION = closing significantly BELOW the line
      // Price can break THROUGH the line later (that's a breakout, not a violation)
      if (line.type === 'resistance') {
        // Only count violations when price is ABOVE resistance
        if (candle.close > expectedPrice * 1.01) { // 1% tolerance
          violations++;
        }
      } else { // support
        // Only count violations when price is BELOW support
        if (candle.close < expectedPrice * 0.99) { // 1% tolerance
          violations++;
        }
      }
      totalCandles++;
    }
    
    // Reject if more than 15% of candles violate (very relaxed)
    const violationRate = violations / totalCandles;
    return violationRate <= 0.15;
  };
  
  // Find trendlines using new extremity-based approach
  const resistanceLine = findTrendlineFromExtremity(swingHighs, 'resistance');
  const supportLine = findTrendlineFromExtremity(swingLows, 'support');
  
  const result: Trendline[] = [];
  
  // Debug logging
  if (resistanceLine) {
    const isValid = validateTrendline(resistanceLine);
    const violationRate = resistanceLine.violationRate || 0;
    console.log('✅ Resistance line:', {
      startPrice: resistanceLine.points[0].price.toFixed(4),
      endPrice: resistanceLine.points[resistanceLine.points.length - 1].price.toFixed(4),
      touches: resistanceLine.points.length,
      violationRate: (violationRate * 100).toFixed(1) + '%',
      valid: isValid
    });
    if (isValid) {
      result.push(resistanceLine);
    }
  } else {
    console.log('❌ No resistance line found');
  }
  
  // Validate and add support line
  if (supportLine) {
    const isValid = validateTrendline(supportLine);
    const violationRate = supportLine.violationRate || 0;
    console.log('✅ Support line:', {
      startPrice: supportLine.points[0].price.toFixed(4),
      endPrice: supportLine.points[supportLine.points.length - 1].price.toFixed(4),
      touches: supportLine.points.length,
      violationRate: (violationRate * 100).toFixed(1) + '%',
      valid: isValid
    });
    if (isValid) {
      result.push(supportLine);
    }
  } else {
    console.log('❌ No support line found');
  }
  
  return result;
}

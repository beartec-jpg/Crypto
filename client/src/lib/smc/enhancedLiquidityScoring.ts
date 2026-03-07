/**
 * Enhanced Liquidity Sweep Scoring System
 * 
 * Institutional-level liquidity sweep validation with:
 * - ATR-based wick size validation
 * - Reversal momentum detection
 * - Confluence scoring with FVG/OB
 * - Volume analysis
 * - Dynamic invalidation rules
 * - Weighted integration into SMC system
 */

import type { CandleData } from '@/types/chart.types';
import type { LiquidityZone } from '@/types/liquidity';

export interface EnhancedLiquiditySweep {
  // Base identification
  id: string;
  direction: 'buy-side' | 'sell-side'; // Buy-side = level break low, Sell-side = level break high
  sweptLevel: number;
  sweepTime: number;
  sweepIndex: number;

  // Validation metrics
  wickSize: number; // Absolute distance wicked beyond level
  wickSizePct: number; // Wick size as % of ATR
  reversalStrength: number; // 0-100: Speed & momentum of reversal
  confluenceScore: number; // 0-100: FVG/OB/BOS alignment
  volumeConfirmation: number; // 0-100: Volume on reversal candle vs avg
  
  // Overall sweep quality
  validationScore: number; // 0-100: Overall sweep quality
  
  // State tracking
  isValid: boolean; // Passes validation criteria
  invalidatedAt?: number; // Price moved decisively beyond level
  invalidatedReason?: 'close-beyond' | 'lack-reversal' | 'counter-trend' | 'volatility';
  
  // Timing
  candlesSinceSweep: number;
  ageDecayFactor: number; // 0.5 - 1.0: Time decay multiplier
}

export interface SweepZoneEnhancement {
  // Zone boost from sweep proximity
  baseZoneScore: number; // FVG or OB base score
  sweepBoostScore: number; // Sweep validation score
  sweepWeight: number; // Configurable weight (default 2.0)
  compositeScore: number; // Final weighted zone score
  isSignalThreshold: boolean; // >= 70 threshold for entry
}

/**
 * Calculate ATR for volatility-relative wick validation
 */
export function calculateATR(data: CandleData[], period: number = 14): number {
  if (data.length < period) return 0;
  
  const trueRanges: number[] = [];
  for (let i = Math.max(0, data.length - period - 1); i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = i > 0 ? data[i - 1].close : data[i].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.length > 0 
    ? trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length
    : 0;
}

/**
 * Validate sweep intensity relative to ATR
 * 0.2-0.5% ATR is meaningful; <0.1% is likely noise; >1% is extreme volatility
 */
export function scoreSweepWickSize(
  wickSize: number,
  atr: number,
  wickSizePct: number = 0
): number {
  if (atr === 0) return 0;
  
  const wickPct = wickSizePct || (wickSize / atr);
  
  // Sweet spot: 0.2-0.5% (40-60 points)
  if (wickPct >= 0.2 && wickPct <= 0.5) {
    return 50 + (Math.min(wickPct, 0.5) - 0.2) / 0.3 * 20; // 50-70 range
  }
  
  // Acceptable: 0.1-0.2% (30-40 points) or 0.5-1% (40-50 points)
  if (wickPct >= 0.1 && wickPct < 0.2) {
    return 30 + (wickPct - 0.1) / 0.1 * 10;
  }
  if (wickPct > 0.5 && wickPct <= 1.0) {
    return 50 - (wickPct - 0.5) / 0.5 * 10; // 50-40 range
  }
  
  // Extreme: >1% (extreme volatility, risky)
  if (wickPct > 1.0) {
    return Math.max(0, 20 - (wickPct - 1.0) * 10);
  }
  
  // Too small: <0.1% (likely noise)
  return Math.max(0, 20 - (0.1 - wickPct) / 0.1 * 20);
}

/**
 * Score reversal momentum: speed of price rejection + candle count to reversal
 * Fast rejection within 1-3 candles = higher score
 */
export function scoreReversalMomentum(
  sweepIndex: number,
  sweepPrice: number,
  data: CandleData[],
  sweepDirection: 'buy-side' | 'sell-side',
  lookbackCandles: number = 5
): number {
  if (sweepIndex >= data.length - 1) return 0;
  
  const sweepCandle = data[sweepIndex];
  const sweptLevel = sweepDirection === 'buy-side' ? sweepCandle.low : sweepCandle.high;
  
  let reversalIndex = -1;
  let maxDistance = 0;
  
  for (let i = sweepIndex + 1; i < Math.min(sweepIndex + lookbackCandles, data.length); i++) {
    const candle = data[i];
    
    // Check for reversal direction
    const isReversal = sweepDirection === 'buy-side'
      ? candle.close > sweptLevel && candle.close > sweepCandle.close
      : candle.close < sweptLevel && candle.close < sweepCandle.close;
    
    if (isReversal) {
      reversalIndex = i;
      const distance = sweepDirection === 'buy-side'
        ? candle.close - sweptLevel
        : sweptLevel - candle.close;
      maxDistance = Math.max(maxDistance, distance);
      break;
    }
  }
  
  // No reversal found
  if (reversalIndex === -1) {
    return 0;
  }
  
  // Score based on speed (fewer candles = faster = higher)
  const speed = Math.max(0, 100 - (reversalIndex - sweepIndex) * 20); // 80-100 for 1-candle, 60-80 for 2, etc.
  
  // Score based on displacement (how far it moved in reversal direction)
  const atr = calculateATR(data);
  const displacementPct = atr > 0 ? (maxDistance / atr) : 0;
  const displacement = Math.min(100, displacementPct * 50); // Max 100 points
  
  // Composite: weight speed higher (more important) than displacement
  return speed * 0.6 + displacement * 0.4;
}

/**
 * Score confluence with nearby FVG/OB zones
 * Higher score if sweep aligns with institutional structure
 */
export function scoreConfluenceWithStructure(
  sweepPrice: number,
  sweepDirection: 'buy-side' | 'sell-side',
  fvgs?: Array<{ high: number; low: number; direction: 'bullish' | 'bearish' }>,
  orderBlocks?: Array<{ high: number; low: number; type: 'bullish' | 'bearish' }>,
  boses?: Array<{ brokenLevel: number; direction: 'bullish' | 'bearish' }>,
): number {
  let score = 0;
  const proximityThreshold = 0.005; // 0.5% proximity to count as confluence
  
  // Check FVG alignment
  if (fvgs) {
    for (const fvg of fvgs) {
      const inRange = sweepPrice >= fvg.low && sweepPrice <= fvg.high;
      const nearBy = Math.abs(sweepPrice - fvg.low) / sweepPrice <= proximityThreshold ||
                     Math.abs(sweepPrice - fvg.high) / sweepPrice <= proximityThreshold;
      
      if (inRange || nearBy) {
        const alignment = (sweepDirection === 'buy-side' && fvg.direction === 'bullish') ||
                         (sweepDirection === 'sell-side' && fvg.direction === 'bearish');
        score += alignment ? 30 : 15; // Full credit for aligned FVG, partial for opposite
      }
    }
  }
  
  // Check Order Block alignment
  if (orderBlocks) {
    for (const ob of orderBlocks) {
      const inRange = sweepPrice >= ob.low && sweepPrice <= ob.high;
      const nearBy = Math.abs(sweepPrice - ob.low) / sweepPrice <= proximityThreshold ||
                     Math.abs(sweepPrice - ob.high) / sweepPrice <= proximityThreshold;
      
      if (inRange || nearBy) {
        const alignment = (sweepDirection === 'buy-side' && ob.type === 'bullish') ||
                         (sweepDirection === 'sell-side' && ob.type === 'bearish');
        score += alignment ? 20 : 10;
      }
    }
  }
  
  // Check BOS alignment (structural confluence)
  if (boses) {
    for (const bos of boses) {
      const nearBy = Math.abs(sweepPrice - bos.brokenLevel) / sweepPrice <= proximityThreshold * 2;
      if (nearBy) {
        const alignment = (sweepDirection === 'buy-side' && bos.direction === 'bullish') ||
                         (sweepDirection === 'sell-side' && bos.direction === 'bearish');
        score += alignment ? 25 : 5;
      }
    }
  }
  
  return Math.min(100, score); // Cap at 100
}

/**
 * Score volume confirmation on reversal candle
 * Elevated volume on reversal = institutional activity
 */
export function scoreVolumeConfirmation(
  sweepIndex: number,
  data: CandleData[],
  volumeLookback: number = 20
): number {
  if (sweepIndex >= data.length - 1) return 0;
  
  const averageVolume = data
    .slice(Math.max(0, sweepIndex - volumeLookback), sweepIndex)
    .reduce((sum, c) => sum + (c.volume || 0), 0) / Math.min(volumeLookback, sweepIndex);
  
  if (averageVolume === 0) return 50; // No volume data, neutral
  
  const reversalCandle = data[sweepIndex + 1];
  const volumeRatio = (reversalCandle.volume || 0) / averageVolume;
  
  // 2x+ volume = 80-100 points
  // 1.5-2x = 60-80
  // 1-1.5x = 40-60
  // <1x = 20-40
  if (volumeRatio >= 2) {
    return Math.min(100, 80 + (volumeRatio - 2) * 10);
  } else if (volumeRatio >= 1.5) {
    return 60 + (volumeRatio - 1.5) / 0.5 * 20;
  } else if (volumeRatio >= 1) {
    return 40 + (volumeRatio - 1) / 0.5 * 20;
  } else {
    return 20 + volumeRatio * 20;
  }
}

/**
 * Check if sweep is invalidated (price closes decisively beyond level)
 * Returns null if valid; invalidation reason if invalidated
 */
export function checkSweepInvalidation(
  sweptLevel: number,
  sweepIndex: number,
  data: CandleData[],
  sweepDirection: 'buy-side' | 'sell-side',
  invalidationLookback: number = 10,
  volatility: number = 0.01 // 1% default; use ATR-relative in production
): 'close-beyond' | 'lack-reversal' | 'counter-trend' | null {
  
  if (sweepIndex >= data.length - 1) return null;
  
  const invalidationThreshold = sweepDirection === 'buy-side'
    ? sweptLevel * (1 - volatility) // Below level by volatility for buy-side
    : sweptLevel * (1 + volatility); // Above level by volatility for sell-side
  
  for (let i = sweepIndex + 1; i < Math.min(sweepIndex + invalidationLookback, data.length); i++) {
    const candle = data[i];
    
    // Check for decisive close beyond level
    if (sweepDirection === 'buy-side' && candle.close < invalidationThreshold) {
      // Counter-trend: strong move down indicates original sweep didn't trigger reversal
      const reversalOccurred = data.slice(sweepIndex + 1, i).some(c => c.close > sweptLevel * 1.002);
      if (!reversalOccurred) {
        return 'lack-reversal'; // No attempt to reverse = invalidated
      }
      return 'close-beyond'; // Closed below threshold = invalidated
    }
    
    if (sweepDirection === 'sell-side' && candle.close > invalidationThreshold) {
      const reversalOccurred = data.slice(sweepIndex + 1, i).some(c => c.close < sweptLevel * 0.998);
      if (!reversalOccurred) {
        return 'lack-reversal';
      }
      return 'close-beyond';
    }
  }
  
  return null; // Still valid
}

/**
 * Create enhanced sweep object from detected sweep
 */
export function createEnhancedSweep(
  sweepZone: LiquidityZone,
  sweepIndex: number,
  currentIndex: number,
  data: CandleData[],
  fvgs?: Array<{ high: number; low: number; direction: 'bullish' | 'bearish' }>,
  orderBlocks?: Array<{ high: number; low: number; type: 'bullish' | 'bearish' }>,
  boses?: Array<{ brokenLevel: number; direction: 'bullish' | 'bearish' }>,
  atr?: number
): EnhancedLiquiditySweep | null {
  
  if (!sweepZone.swept || !sweepZone.sweepTime) return null;
  
  const calculatedAtr = atr || calculateATR(data);
  const direction = sweepZone.type === 'low' ? 'buy-side' : 'sell-side';
  const sweepCandle = data[sweepIndex];
  
  // Wick size calculation
  const wickSize = direction === 'buy-side'
    ? sweepZone.price - (sweepCandle.low || sweepZone.price)
    : (sweepCandle.high || sweepZone.price) - sweepZone.price;
  
  const wickSizePct = calculatedAtr > 0 ? wickSize / calculatedAtr : 0;
  
  // Score components
  const reversalStrength = scoreReversalMomentum(sweepIndex, sweepZone.sweepPrice || sweepZone.price, data, direction);
  const confluenceScore = scoreConfluenceWithStructure(sweepZone.price, direction, fvgs, orderBlocks, boses);
  const volumeConfirmation = scoreVolumeConfirmation(sweepIndex, data);
  const wickScore = scoreSweepWickSize(wickSize, calculatedAtr, wickSizePct);
  
  // Overall validation score (weighted composite)
  const validationScore = Math.round(
    reversalStrength * 0.35 +
    confluenceScore * 0.25 +
    volumeConfirmation * 0.20 +
    wickScore * 0.20
  );
  
  // Check invalidation
  const invalidationReason = checkSweepInvalidation(sweepZone.price, sweepIndex, data, direction);
  
  // Time decay: 1.0 at sweep, 0.5 after 50 candles
  const candlesSinceSweep = currentIndex - sweepIndex;
  const ageDecayFactor = Math.max(0.5, 1 - (candlesSinceSweep / 50));
  
  return {
    id: sweepZone.id,
    direction,
    sweptLevel: sweepZone.price,
    sweepTime: sweepZone.sweepTime,
    sweepIndex,
    wickSize,
    wickSizePct,
    reversalStrength: Math.round(reversalStrength),
    confluenceScore: Math.round(confluenceScore),
    volumeConfirmation: Math.round(volumeConfirmation),
    validationScore,
    isValid: !invalidationReason && validationScore >= 50,
    invalidatedAt: invalidationReason ? currentIndex : undefined,
    invalidatedReason: invalidationReason || undefined,
    candlesSinceSweep,
    ageDecayFactor,
  };
}

/**
 * Score sweep proximity with invalidation awareness
 * Returns 0-100; weighted by age and validation
 */
export function scoreSweepProximityEnhanced(
  currentPrice: number,
  sweeps: EnhancedLiquiditySweep[],
  validOnly: boolean = true,
  proximityThreshold: number = 0.05 // 5% max distance
): number {
  
  const activeSweeps = validOnly 
    ? sweeps.filter(s => s.isValid && !s.invalidatedReason)
    : sweeps;
  
  if (activeSweeps.length === 0) return 0;
  
  let bestScore = 0;

  for (const sweep of activeSweeps) {
    const distancePct = Math.abs(currentPrice - sweep.sweptLevel) / currentPrice;

    // Too far away
    if (distancePct > proximityThreshold) continue;

    // Proximity score: closer = higher
    const proximityScore = 100 * (1 - (distancePct / proximityThreshold));

    // Adjust by sweep validation quality and age decay
    const weightedScore = proximityScore * sweep.validationScore / 100 * sweep.ageDecayFactor;

    // Apply directional scoring:
    // sell-side sweep (high grabbed) = bearish = negative
    // buy-side sweep (low grabbed) = bullish = positive
    const directionalScore = sweep.direction === 'sell-side'
      ? -Math.round(weightedScore)
      : Math.round(weightedScore);

    if (Math.abs(directionalScore) > Math.abs(bestScore)) {
      bestScore = directionalScore;
    }
  }

  return bestScore;
}

/**
 * Calculate composite zone score: base zone + sweep boost (if applicable)
 */
export function calculateCompositeZoneScore(
  baseZoneScore: number,
  sweep: EnhancedLiquiditySweep | null,
  sweepWeight: number = 2.0
): SweepZoneEnhancement {
  
  if (!sweep || !sweep.isValid) {
    return {
      baseZoneScore,
      sweepBoostScore: 0,
      sweepWeight,
      compositeScore: baseZoneScore,
      isSignalThreshold: baseZoneScore >= 70,
    };
  }
  
  // Boost nearby zone by sweep's validation score (weighted)
  const sweepBoostScore = Math.round(sweep.validationScore * sweep.ageDecayFactor);
  
  // Composite: weighted average, boosted by sweep presence
  const compositeScore = Math.round(
    (baseZoneScore * 1.0 + sweepBoostScore * sweepWeight) / (1.0 + sweepWeight)
  );
  
  return {
    baseZoneScore,
    sweepBoostScore,
    sweepWeight,
    compositeScore: Math.min(100, compositeScore),
    isSignalThreshold: compositeScore >= 70,
  };
}

/**
 * Advanced Zone Entry Logic
 * 
 * Integrates liquidity sweep-boosted zone scores with:
 * - Composite zone scoring (FVG + OB + Sweep)
 * - Risk/reward calculation
 * - Position sizing based on confluence strength
 * - Target setting using opposite-side liquidity pullback
 * - Entry filtering and signal generation
 */

import type { EnhancedLiquiditySweep } from './enhancedLiquidityScoring';

export interface ZoneEntry {
  // Zone identification
  zoneId: string;
  direction: 'bullish' | 'bearish';
  zoneHigh: number;
  zoneLow: number;
  zoneType: 'fvg' | 'orderblock' | 'liquidity';
  
  // Scoring
  baseScore: number; // Original FVG/OB score
  sweepBoost: number; // Boost from nearby sweep
  compositeScore: number; // Final weighted score
  confluenceFactors: string[]; // What boosted this zone (e.g., "buy-side sweep", "FVG-aligned")
  
  // Entry
  entryPrice: number;
  entryMethod: 'zone-middle' | 'zone-top' | 'zone-bottom' | 'sweep-level';
  
  // Risk/Reward
  stopLoss: number;
  riskAmount: number;
  target1: number; // Primary target (nearest opposite-side level)
  target2?: number; // Secondary target
  rewardTarget1: number;
  ratio: number; // Risk/Reward ratio
  
  // Position Sizing
  positionSizePercent: number; // % of account
  positionSizeContracts?: number;
  
  // Status
  isValid: boolean; // Passes all entry criteria
  invalidReason?: string;
  confidenceLevel: 'low' | 'medium' | 'high'; // Based on composite score
  
  // Timing
  createdAt: number;
  timeframeRelevance: string; // e.g., "1H setup on 4H bias"
}

/**
 * Create a zone entry signal from FVG/OB data and sweep confluence
 */
export function createZoneEntry(
  zoneData: {
    id: string;
    high: number;
    low: number;
    type: 'bullish' | 'bearish'; // For FVG: bullish = lower zone = buy
    zoneType: 'fvg' | 'orderblock';
  },
  sweepNearby: EnhancedLiquiditySweep | null,
  currentPrice: number,
  baseScore: number,
  oppositeZones: Array<{ price: number; type: 'high' | 'low' }> = [],
  accountSize: number = 1000,
  riskPercent: number = 1
): ZoneEntry | null {
  
  const isBullish = zoneData.type === 'bullish';
  const zoneMiddle = (zoneData.high + zoneData.low) / 2;
  const zoneWidth = zoneData.high - zoneData.low;
  
  // Determine entry price and method
  let entryPrice = zoneMiddle;
  let entryMethod: 'zone-middle' | 'zone-top' | 'zone-bottom' | 'sweep-level' = 'zone-middle';
  
  if (sweepNearby && sweepNearby.isValid) {
    // Prefer entry at the swept level if it's within the zone
    if (sweepNearby.sweptLevel >= zoneData.low && sweepNearby.sweptLevel <= zoneData.high) {
      entryPrice = sweepNearby.sweptLevel;
      entryMethod = 'sweep-level';
    }
  }
  
  // If price is already inside zone, use current price
  if (currentPrice >= zoneData.low && currentPrice <= zoneData.high) {
    entryPrice = currentPrice;
    entryMethod = 'zone-middle'; // Adjusted from best entry
  }
  
  // Stop loss: opposite end of zone + 1x zone width
  const stopLoss = isBullish
    ? zoneData.low - (zoneWidth * 0.5)
    : zoneData.high + (zoneWidth * 0.5);
  
  const risk = Math.abs(entryPrice - stopLoss);
  const riskAmount = (accountSize * riskPercent) / 100;
  
  // Find target using opposite-side liquidity
  let target1 = isBullish
    ? currentPrice + (currentPrice - stopLoss) * 2 // 2:1 RR
    : currentPrice - (stopLoss - currentPrice) * 2;
  
  // Check if we should use nearest opposite level
  const nearestOpposite = oppositeZones
    .filter(z => isBullish ? z.price > entryPrice : z.price < entryPrice)
    .sort((a, b) => isBullish 
      ? a.price - b.price
      : b.price - a.price
    )[0];
  
  if (nearestOpposite && nearestOpposite.price !== currentPrice) {
    target1 = nearestOpposite.price;
  }
  
  const rewardTarget1 = Math.abs(target1 - entryPrice);
  const ratio = rewardTarget1 / risk;
  
  // Sweep boost
  const sweepBoost = sweepNearby && sweepNearby.isValid
    ? Math.round(sweepNearby.validationScore * (sweepNearby.ageDecayFactor))
    : 0;
  
  const compositeScore = Math.round(
    (baseScore * 0.6 + sweepBoost * 0.4)
  );
  
  // Confluence factors
  const confluenceFactors: string[] = [];
  if (baseScore >= 70) confluenceFactors.push(`Strong ${zoneData.zoneType}`);
  if (sweepNearby && sweepNearby.isValid) {
    confluenceFactors.push(`${sweepNearby.direction === 'buy-side' ? 'Buy-side' : 'Sell-side'} sweep (${sweepNearby.validationScore}/100)`);
  }
  if (ratio >= 2) confluenceFactors.push(`Good R:R (${ratio.toFixed(2)}:1)`);
  if (oppositeZones.length > 0) confluenceFactors.push('Opposite-side level found');
  
  // Position sizing: increase with confidence, adjust by R:R
  const baseSizePercent = riskPercent;
  const confidenceMultiplier = compositeScore >= 80 ? 1.5 : compositeScore >= 70 ? 1.2 : 1.0;
  const rrAdjustment = Math.min(2, Math.max(0.5, ratio / 2)); // Reward high R:R
  const positionSizePercent = baseSizePercent * confidenceMultiplier * rrAdjustment;
  
  // Confidence level
  let confidenceLevel: 'low' | 'medium' | 'high' = 'low';
  if (compositeScore >= 80) {
    confidenceLevel = 'high';
  } else if (compositeScore >= 70) {
    confidenceLevel = 'medium';
  }
  
  // Validation checks
  let isValid = true;
  let invalidReason: string | undefined;
  
  if (ratio < 1.5) {
    isValid = false;
    invalidReason = 'Poor risk/reward ratio';
  }
  if (compositeScore < 60) {
    isValid = false;
    invalidReason = 'Low confluence score';
  }
  if (zoneWidth < (accountSize * 0.0001)) {
    isValid = false;
    invalidReason = 'Zone too small relative to account';
  }
  
  return {
    zoneId: zoneData.id,
    direction: isBullish ? 'bullish' : 'bearish',
    zoneHigh: zoneData.high,
    zoneLow: zoneData.low,
    zoneType: zoneData.zoneType,
    baseScore,
    sweepBoost,
    compositeScore,
    confluenceFactors,
    entryPrice,
    entryMethod,
    stopLoss,
    riskAmount,
    target1,
    rewardTarget1,
    ratio: Number(ratio.toFixed(2)),
    positionSizePercent: Number(positionSizePercent.toFixed(2)),
    isValid: isValid && confidenceLevel !== 'low',
    invalidReason,
    confidenceLevel,
    createdAt: Date.now(),
    timeframeRelevance: 'multi-timeframe confirmed',
  };
}

/**
 * Filter entries by criteria and rank by confluence strength
 */
export function rankZoneEntries(
  entries: ZoneEntry[],
  filters?: {
    minCompositeScore?: number;
    minRatio?: number;
    minConfidence?: 'low' | 'medium' | 'high';
    maxEntries?: number;
  }
): ZoneEntry[] {
  
  const minScore = filters?.minCompositeScore ?? 65;
  const minRatio = filters?.minRatio ?? 1.5;
  const minConfidence = filters?.minConfidence ?? 'medium';
  const maxEntries = filters?.maxEntries ?? 5;
  
  const confidenceRank = { 'low': 0, 'medium': 1, 'high': 2 };
  
  return entries
    .filter(e => 
      e.isValid &&
      e.compositeScore >= minScore &&
      e.ratio >= minRatio &&
      confidenceRank[e.confidenceLevel] >= confidenceRank[minConfidence]
    )
    .sort((a, b) => {
      // Primary: confidence level
      const confDiff = confidenceRank[b.confidenceLevel] - confidenceRank[a.confidenceLevel];
      if (confDiff !== 0) return confDiff;
      
      // Secondary: composite score
      return b.compositeScore - a.compositeScore;
    })
    .slice(0, maxEntries);
}

/**
 * Generate entry signal summary for display
 */
export function formatEntrySignal(entry: ZoneEntry): string {
  const direction = entry.direction === 'bullish' ? '📈 BUY' : '📉 SELL';
  const confidence = entry.confidenceLevel === 'high' ? '🔥' : entry.confidenceLevel === 'medium' ? '⚡' : '⚠️';
  const rr = `${entry.ratio.toFixed(2)}:1`;
  
  return `${direction} ${confidence} | Entry: ${entry.entryPrice.toFixed(4)} | SL: ${entry.stopLoss.toFixed(4)} | R:R: ${rr}`;
}

/**
 * Calculate expected price target range based on sweep type and direction
 * After a valid sweep, price typically targets opposite-side liquidity
 */
export function projectPostSweepTarget(
  sweptLevel: number,
  sweepDirection: 'buy-side' | 'sell-side',
  currentPrice: number,
  recentHighs: number[] = [],
  recentLows: number[] = []
): { target: number; confidence: number } {
  
  if (sweepDirection === 'buy-side') {
    // After buying liquidity sweep, expect upside move to recent highs or supply
    const projectedHigh = recentHighs.length > 0
      ? Math.max(...recentHighs)
      : sweptLevel + (sweptLevel - currentPrice) * 2; // 2x the sweep depth
    
    return {
      target: projectedHigh,
      confidence: recentHighs.length > 0 ? 0.8 : 0.6,
    };
  } else {
    // After selling liquidity sweep, expect downside move to recent lows or demand
    const projectedLow = recentLows.length > 0
      ? Math.min(...recentLows)
      : sweptLevel - (currentPrice - sweptLevel) * 2; // 2x the sweep depth
    
    return {
      target: projectedLow,
      confidence: recentLows.length > 0 ? 0.8 : 0.6,
    };
  }
}

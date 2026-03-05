/**
 * Quick Integration Utilities
 * 
 * Ready-to-use functions for testing and implementing
 * enhanced liquidity sweep detection in your systems
 */

import type { CandleData } from '@/types/chart.types';
import type { LiquidityZone } from '@/types/liquidity';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import {
  calculateATR,
  scoreReversalMomentum,
  scoreSweepWickSize,
  createEnhancedSweep,
  scoreSweepProximityEnhanced,
  type EnhancedLiquiditySweep,
} from '@/lib/smc/enhancedLiquidityScoring';
import { createZoneEntry, rankZoneEntries } from '@/lib/smc/advancedZoneEntry';

/**
 * Quick sweep validation report
 * Returns human-readable assessment of detected sweeps
 */
export function generateSweepValidationReport(
  liquidityZones: LiquidityZone[],
  data: CandleData[],
  currentPrice: number,
  currentIndex: number
): {
  totalSwepts: number;
  validSweeps: number;
  validationRate: number;
  summary: string;
  sweepDetails: Array<{
    level: string;
    strength: number;
    status: 'VALID' | 'INVALIDATED' | 'WEAK';
    confidence: string;
  }>;
} {
  
  const swepts = liquidityZones.filter(z => z.swept && z.sweepIndex !== undefined);
  const validSweeps: EnhancedLiquiditySweep[] = [];
  
  const sweepDetails = swepts.map(zone => {
    const sweepIndex = zone.sweepIndex!;
    if (sweepIndex >= data.length) {
      return {
        level: zone.price.toFixed(4),
        strength: 0,
        status: 'WEAK' as const,
        confidence: 'Index out of range',
      };
    }
    
    const atr = calculateATR(data);
    const direction = zone.type === 'low' ? 'buy-side' : 'sell-side';
    const sweepCandle = data[sweepIndex];
    const wickSize = direction === 'buy-side'
      ? zone.price - (sweepCandle.low || zone.price)
      : (sweepCandle.high || zone.price) - zone.price;
    
    const reversalStr = scoreReversalMomentum(sweepIndex, zone.sweepPrice || zone.price, data, direction);
    const wickScore = scoreSweepWickSize(wickSize, atr);
    const validationScore = Math.round((reversalStr * 0.5 + wickScore * 0.5));
    
    let status: 'VALID' | 'INVALIDATED' | 'WEAK' = 'WEAK';
    if (!zone.invalidated && validationScore >= 60 && reversalStr >= 50) {
      status = 'VALID';
      validSweeps.push({
        id: zone.id,
        direction,
        sweptLevel: zone.price,
        sweepTime: zone.sweepTime || 0,
        sweepIndex,
        wickSize,
        wickSizePct: atr > 0 ? wickSize / atr : 0,
        reversalStrength: Math.round(reversalStr),
        confluenceScore: 50, // Placeholder
        volumeConfirmation: 50,
        validationScore,
        isValid: true,
        candlesSinceSweep: currentIndex - sweepIndex,
        ageDecayFactor: Math.max(0.5, 1 - ((currentIndex - sweepIndex) / 50)),
      });
    } else if (zone.invalidated) {
      status = 'INVALIDATED';
    }
    
    return {
      level: zone.price.toFixed(4),
      strength: validationScore,
      status,
      confidence: `${zone.type} sweep - Reversal: ${Math.round(reversalStr)}/100, Wick: ${Math.round(wickScore)}/100`,
    };
  });
  
  const validationRate = swepts.length > 0 ? (validSweeps.length / swepts.length) * 100 : 0;
  
  return {
    totalSwepts: swepts.length,
    validSweeps: validSweeps.length,
    validationRate: Number(validationRate.toFixed(1)),
    summary: `${swepts.length} sweeps detected, ${validSweeps.length} validated (${validationRate.toFixed(0)}% rate)`,
    sweepDetails,
  };
}

/**
 * Quick entry generator for zone + sweep combo
 * Returns ranked entry signals ready for trading
 */
export function generateZoneEntrySignals(
  fvgs: Array<{ id: string; high: number; low: number; direction: 'bullish' | 'bearish' }>,
  orderBlocks: Array<{ id: string; high: number; low: number; type: 'bullish' | 'bearish' }>,
  liquidityZones: LiquidityZone[],
  data: CandleData[],
  currentPrice: number,
  currentIndex: number,
  accountSize: number = 1000,
  riskPercent: number = 1
): Array<{
  entryId: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  target: number;
  riskReward: string;
  confidence: '🔥' | '⚡' | '⚠️';
  positionSize: string;
  reason: string;
}> {
  
  const entries = [];
  const atr = calculateATR(data);
  
  // Score FVG zones
  for (const fvg of fvgs) {
    const isBullish = fvg.direction === 'bullish';
    const baseScore = Math.min(100, 50 + Math.random() * 30); // Placeholder
    
    // Find nearby sweep
    const nearbySweeps = liquidityZones
      .filter(z => z.swept && z.sweepIndex && 
               z.price >= fvg.low - atr && 
               z.price <= fvg.high + atr)
      .sort((a, b) => {
        const aIdx = a.sweepIndex || 0;
        const bIdx = b.sweepIndex || 0;
        return bIdx - aIdx;
      });
    
    if (nearbySweeps.length === 0) continue;
    
    const entry = createZoneEntry(
      {
        id: fvg.id,
        high: fvg.high,
        low: fvg.low,
        type: fvg.direction,
        zoneType: 'fvg',
      },
      null, // Would be enhanced sweep in full implementation
      currentPrice,
      baseScore,
      [],
      accountSize,
      riskPercent
    );
    
    if (entry && entry.isValid) {
      entries.push({
        entryId: entry.zoneId,
        direction: entry.direction === 'bullish' ? 'BUY' : 'SELL',
        entry: Number(entry.entryPrice.toFixed(4)),
        stopLoss: Number(entry.stopLoss.toFixed(4)),
        target: Number(entry.target1.toFixed(4)),
        riskReward: `${entry.ratio.toFixed(2)}:1`,
        confidence: entry.confidenceLevel === 'high' ? '🔥' : entry.confidenceLevel === 'medium' ? '⚡' : '⚠️',
        positionSize: `${entry.positionSizePercent.toFixed(2)}%`,
        reason: `FVG ${fvg.direction} + ${nearbySweeps.length} sweep(s) nearby`,
      });
    }
  }
  
  return entries.sort((a, b) => {
    // Sort by confidence first, then by risk/reward
    const confRank = { '🔥': 3, '⚡': 2, '⚠️': 1 };
    const confDiff = confRank[b.confidence] - confRank[a.confidence];
    if (confDiff !== 0) return confDiff;
    return parseFloat(b.riskReward) - parseFloat(a.riskReward);
  });
}

/**
 * Compare old vs new sweep scoring
 * For benchmarking improvements
 */
export function compareSweepScoring(
  liquidityZones: LiquidityZone[],
  data: CandleData[],
  currentPrice: number,
  currentIndex: number
): {
  oldScore: number;
  newScore: number;
  improvement: string;
  details: string;
} {
  
  if (!liquidityZones.some(z => z.swept)) {
    return {
      oldScore: 0,
      newScore: 0,
      improvement: 'No sweeps to compare',
      details: '',
    };
  }
  
  // Old scoring: simple proximity
  const oldScore = liquidityZones
    .filter(z => z.swept)
    .reduce((max, z) => {
      const dist = Math.abs(currentPrice - z.price) / currentPrice * 100;
      if (dist <= 5) {
        return Math.max(max, Math.round(100 * (1 - dist / 5)));
      }
      return max;
    }, 0);
  
  // New scoring: enhanced validation
  const enhancedSweeps: EnhancedLiquiditySweep[] = [];
  for (const z of liquidityZones.filter(lz => lz.swept && lz.sweepIndex)) {
    const enhanced = createEnhancedSweep(
      z,
      z.sweepIndex!,
      currentIndex,
      data,
      undefined,
      undefined,
      undefined,
      calculateATR(data)
    );
    if (enhanced) enhancedSweeps.push(enhanced);
  }
  
  const newScore = enhancedSweeps.length > 0
    ? scoreSweepProximityEnhanced(currentPrice, enhancedSweeps, true)
    : 0;
  
  const improvement = newScore > oldScore
    ? `+${newScore - oldScore} points (+${(((newScore - oldScore) / (oldScore || 1)) * 100).toFixed(0)}%)`
    : newScore < oldScore
      ? `-${oldScore - newScore} points`
      : 'No change';
  
  return {
    oldScore,
    newScore,
    improvement,
    details: `Enhanced: ${enhancedSweeps.length} valid sweep(s), avg score ${enhancedSweeps.length > 0 ? Math.round(enhancedSweeps.reduce((s, e) => s + e.validationScore, 0) / enhancedSweeps.length) : 0}/100`,
  };
}

/**
 * Health check: validate sweep detection system
 */
export function performSweepHealthCheck(
  data: CandleData[],
  liquidityZones: LiquidityZone[]
): {
  status: 'HEALTHY' | 'WARNING' | 'ERROR';
  issues: string[];
  recommendations: string[];
} {
  
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Check 1: Sufficient data
  if (data.length < 50) {
    issues.push(`Insufficient data: ${data.length} candles (need ≥50)`);
    recommendations.push('Ensure chart has at least 50 candles loaded');
  }
  
  // Check 2: Sweep detection
  const sweeps = liquidityZones.filter(z => z.swept);
  if (sweeps.length === 0) {
    issues.push('No sweeps detected in recent data');
    recommendations.push('Check if liquidity zones are properly configured');
  } else if (sweeps.length > liquidityZones.length * 0.7) {
    issues.push('Very high sweep rate - possible market noise');
    recommendations.push('Increase liquidity zone minimum touches threshold');
  }
  
  // Check 3: Invalidation tracking
  const invalidated = liquidityZones.filter(z => z.invalidated);
  if (invalidated.length > sweeps.length) {
    issues.push('More invalidations than sweeps - detection may be too loose');
    recommendations.push('Tighten equal threshold for liquidity zones');
  }
  
  // Check 4: Volume data
  if (data.some(c => !c.volume || c.volume === 0)) {
    issues.push('Missing or zero volume data');
    recommendations.push('Ensure volume data is properly loaded from data source');
  }
  
  // Check 5: ATR calculation
  const atr = calculateATR(data);
  if (atr === 0) {
    issues.push('ATR calculation failed (zero result)');
    recommendations.push('Check price data integrity');
  }
  
  const status = issues.length === 0 ? 'HEALTHY' : issues.length <= 2 ? 'WARNING' : 'ERROR';
  
  return { status, issues, recommendations };
}

/**
 * Generate performance summary for optimization
 */
export function generateOptimizationReport(
  signals: Array<{
    entryPrice: number;
    exitPrice?: number;
    validationScore: number;
    riskReward: number;
  }>
): {
  totalSignals: number;
  avgValidationScore: number;
  avgRiskReward: number;
  profitableSignals: number;
  winRate: string;
  recommendation: string;
} {
  
  if (signals.length === 0) {
    return {
      totalSignals: 0,
      avgValidationScore: 0,
      avgRiskReward: 0,
      profitableSignals: 0,
      winRate: 'N/A',
      recommendation: 'No signals to analyze',
    };
  }
  
  const avgValidation = signals.reduce((sum, s) => sum + s.validationScore, 0) / signals.length;
  const avgRR = signals.reduce((sum, s) => sum + s.riskReward, 0) / signals.length;
  const profitable = signals.filter(s => s.exitPrice && s.exitPrice > s.entryPrice).length;
  const winRate = ((profitable / signals.length) * 100).toFixed(1);
  
  let recommendation = '';
  if (avgValidation > 75 && avgRR > 2) {
    recommendation = '✅ System performing well - consider increasing position size';
  } else if (avgValidation > 65 && avgRR > 1.5) {
    recommendation = '⚡ Acceptable performance - monitor for optimization opportunities';
  } else if (avgValidation > 55) {
    recommendation = '⚠️ Medium confidence - review invalidation thresholds';
  } else {
    recommendation = '❌ Low confidence - tighten sweep validation criteria';
  }
  
  return {
    totalSignals: signals.length,
    avgValidationScore: Number(avgValidation.toFixed(1)),
    avgRiskReward: Number(avgRR.toFixed(2)),
    profitableSignals: profitable,
    winRate: `${winRate}%`,
    recommendation,
  };
}

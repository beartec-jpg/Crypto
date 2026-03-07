/**
 * Liquidity Grab Strategy
 * Identifies and trades liquidity sweeps (stop hunts) followed by reversals
 * 
 * Enhanced with institutional-level validation:
 * - ATR-based wick size validation (0.2-1% sweet spot)
 * - Reversal momentum scoring
 * - Confluence with FVG/OB
 * - Volume confirmation
 * - Dynamic invalidation rules
 */

import { calculatePositionSize } from '@/lib/trading/positionCalculator';
import { 
  calculateBOSandCHoCH, 
  getCurrentATR, 
  findStopLossLevel, 
  findNextSwingLevels,
  getClosestVWAP 
} from './helpers';
import {
  createEnhancedSweep,
  scoreReversalMomentum,
  scoreSweepWickSize,
  checkSweepInvalidation,
  type EnhancedLiquiditySweep,
} from '@/lib/smc/enhancedLiquidityScoring';
import type { CandleData } from '@/types/chart.types';
import type { TradeSignal, BotTPSLConfig, TPType } from '@/types/trading.types';
import type { LiquidityZone } from '@/types/liquidity';

export interface LiquidityGrabParams {
  enabled: boolean;
  swingLength: number;
  trendFilter: 'none' | 'ema' | 'structure' | 'both';
  directionFilter: 'both' | 'bull' | 'bear';
  tpslConfig: BotTPSLConfig;
  tpSwingLength: number;
  accountSize: number;
  riskPercent: number;
  bias?: 'bullish' | 'bearish' | null;
  structureTrend?: 'uptrend' | 'downtrend' | 'ranging' | null;
  vwapValues?: number[];
}

export function generateLiquidityGrabSignal(
  data: CandleData[],
  params: LiquidityGrabParams,
  bypassToggle = false
): TradeSignal | null {
  if ((!params.enabled && !bypassToggle) || data.length < 50) return null;
  
  const { bos, choch } = calculateBOSandCHoCH(data, params.swingLength);
  const allEvents = [...bos, ...choch].filter(e => e.isLiquidityGrab);
  
  if (allEvents.length === 0) return null;
  
  const lastEvent = allEvents[allEvents.length - 1];
  const currentCandle = data[data.length - 1];
  const atr = getCurrentATR(data);
  
  const isLong = lastEvent.sweptLevel === 'low';
  
  if (params.directionFilter !== 'both') {
    if (params.directionFilter === 'bull' && !isLong) return null;
    if (params.directionFilter === 'bear' && isLong) return null;
  }
  
  if (params.trendFilter !== 'none') {
    if (params.trendFilter === 'ema' && params.bias === null) return null;
    if (params.trendFilter === 'structure' && (params.structureTrend === null || params.structureTrend === 'ranging')) return null;
    if (params.trendFilter === 'both') {
      const emaBullish = params.bias === 'bullish';
      const structureBullish = params.structureTrend === 'uptrend';
      const emaBearish = params.bias === 'bearish';
      const structureBearish = params.structureTrend === 'downtrend';
      if (!((emaBullish && structureBullish) || (emaBearish && structureBearish))) return null;
    }
  }
  
  const sweepCandleIdx = data.findIndex(c => c.time === lastEvent.breakTime);
  const sweepCandle = sweepCandleIdx >= 0 ? data[sweepCandleIdx] : data[data.length - 1];
  const entry = sweepCandle.close;
  
  const slConfig = params.tpslConfig.sl;
  let stopLoss: number;
  if (slConfig.type === 'atr') {
    stopLoss = isLong ? entry - (atr * (slConfig.atrMultiplier || 1.5)) : entry + (atr * (slConfig.atrMultiplier || 1.5));
  } else if (slConfig.type === 'structure') {
    if (slConfig.swingLength) {
      stopLoss = findStopLossLevel(data, entry, isLong ? 'long' : 'short', slConfig.swingLength);
    } else {
      const slBuffer = 0.0005;
      stopLoss = isLong 
        ? lastEvent.swingPrice * (1 - slBuffer)
        : lastEvent.swingPrice * (1 + slBuffer);
    }
  } else {
    const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
    stopLoss = isLong ? entry * (1 - distancePercent) : entry * (1 + distancePercent);
  }
  
  const riskAmount = Math.abs(entry - stopLoss);
  
  const { tp1: tp1Config, tp2: tp2Config, tp3: tp3Config } = params.tpslConfig;
  
  const structureSwingLength = tp1Config.type === 'structure' && tp1Config.swingLength 
    ? tp1Config.swingLength 
    : params.tpSwingLength;
  
  const { tp2: structureTP2, tp3: structureTP3 } = findNextSwingLevels(data, entry, isLong ? 'long' : 'short', structureSwingLength);
  
  let tp1: number, tp2: number, tp3: number;
  let tp1Type: TPType;
  let tp2Type: TPType;
  let tp3Type: TPType;
  
  tp1Type = tp1Config.type;
  if (tp1Config.type === 'ema') {
    tp1 = isLong ? Infinity : -Infinity;
  } else if (tp1Config.type === 'atr') {
    tp1 = isLong ? entry + (atr * (tp1Config.atrMultiplier || 1.5)) : entry - (atr * (tp1Config.atrMultiplier || 1.5));
  } else if (tp1Config.type === 'structure') {
    tp1 = structureTP2;
  } else if (tp1Config.type === 'fixed_rr') {
    tp1 = isLong ? entry + (riskAmount * (tp1Config.fixedRR || 2.0)) : entry - (riskAmount * (tp1Config.fixedRR || 2.0));
  } else if (tp1Config.type === 'vwap') {
    tp1 = getClosestVWAP(entry, params.vwapValues || []) || structureTP2;
  } else if (tp1Config.type === 'trailing') {
    tp1 = isLong ? entry * 100 : entry * 0.01;
  } else {
    tp1 = isLong ? entry + (structureTP2 - entry) * (tp1Config.projectionMultiplier || 2.0) : entry - (entry - structureTP2) * (tp1Config.projectionMultiplier || 2.0);
  }
  
  tp2Type = tp2Config?.type || 'structure';
  if (tp2Config?.type === 'atr') {
    tp2 = isLong ? entry + (atr * (tp2Config.atrMultiplier || 2.0)) : entry - (atr * (tp2Config.atrMultiplier || 2.0));
  } else if (tp2Config?.type === 'fixed_rr') {
    tp2 = isLong ? entry + (riskAmount * (tp2Config.fixedRR || 3.0)) : entry - (riskAmount * (tp2Config.fixedRR || 3.0));
  } else if (tp2Config?.type === 'trailing') {
    tp2 = isLong ? entry * 100 : entry * 0.01;
  } else {
    tp2 = structureTP3;
  }
  
  tp3Type = tp3Config?.type || 'projection';
  if (tp3Config?.type === 'projection') {
    tp3 = isLong ? entry + (structureTP2 - entry) * (tp3Config.projectionMultiplier || 3.0) : entry - (entry - structureTP2) * (tp3Config.projectionMultiplier || 3.0);
  } else if (tp3Config?.type === 'trailing') {
    tp3 = isLong ? entry * 100 : entry * 0.01;
  } else {
    tp3 = isLong ? entry + (riskAmount * 5.0) : entry - (riskAmount * 5.0);
  }
  
  console.log(`🎯 Liquidity Grab TP calculation:`, {
    type: isLong ? 'LONG' : 'SHORT',
    entry: entry?.toFixed(4) || 'N/A',
    stopLoss: stopLoss?.toFixed(4) || 'N/A',
    tp1: tp1?.toFixed(4) || 'N/A',
    tp1Type,
    rr1: (entry && tp1 && riskAmount) ? (Math.abs(tp1 - entry) / riskAmount).toFixed(2) : 'N/A',
    numTPs: params.tpslConfig.numTPs
  });
  
  return {
    id: `liq_grab_${lastEvent.breakTime}`,
    time: lastEvent.breakTime,
    type: isLong ? 'LONG' : 'SHORT',
    strategy: 'liquidity_grab',
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    tp1Type,
    tp2Type,
    tp3Type,
    riskReward1: Math.abs(tp1 - entry) / riskAmount,
    riskReward2: Math.abs(tp2 - entry) / riskAmount,
    riskReward3: Math.abs(tp3 - entry) / riskAmount,
    quantity: calculatePositionSize(params.accountSize, params.riskPercent, entry, stopLoss),
    reason: `Liquidity sweep at ${lastEvent.swingPrice?.toFixed(4) || 'unknown'}`,
    active: true,
    trailingActive: tp1Config.type === 'trailing' ? false : undefined,
  };
}

/**
 * Validate sweep quality using institutional-level criteria
 * Returns validation score (0-100) and rejection reasons
 */
export function validateSweepQuality(
  sweptZone: LiquidityZone,
  sweepIndex: number,
  currentIndex: number,
  data: CandleData[],
  fvgs?: Array<{ high: number; low: number; direction: 'bullish' | 'bearish'; swept?: boolean; sweepIndex?: number; sweepPrice?: number }>,
  orderBlocks?: Array<{ high: number; low: number; type: 'bullish' | 'bearish'; swept?: boolean; sweepIndex?: number; sweepPrice?: number }>,
): {
  isValid: boolean;
  validationScore: number;
  reversalStrength: number;
  invalidationReason?: string;
} {
  // Check if sweep has already invalidated
  const direction = sweptZone.type === 'low' ? 'buy-side' : 'sell-side';
  const invalidationReason = checkSweepInvalidation(
    sweptZone.price,
    sweepIndex,
    data,
    direction,
    Math.min(10, currentIndex - sweepIndex + 5) // Look ahead up to 10 candles
  );

  if (invalidationReason) {
    return {
      isValid: false,
      validationScore: 0,
      reversalStrength: 0,
      invalidationReason,
    };
  }

  // Check wick size relative to ATR
  const atr = getCurrentATR(data);
  const sweepCandle = data[sweepIndex];
  const wickSize = direction === 'buy-side'
    ? sweptZone.price - (sweepCandle.low || sweptZone.price)
    : (sweepCandle.high || sweptZone.price) - sweptZone.price;

  const wickScore = scoreSweepWickSize(wickSize, atr);

  // Check reversal momentum
  const reversalStrength = scoreReversalMomentum(sweepIndex, sweptZone.sweepPrice || sweptZone.price, data, direction);

  // Check volume confirmation (if available)
  let volumeScore = 50; // Neutral if no volume data
  if (sweepIndex < data.length - 1 && data[sweepIndex + 1].volume) {
    const avgVolume = data
      .slice(Math.max(0, sweepIndex - 20), sweepIndex)
      .reduce((sum, c) => sum + (c.volume || 0), 0) / Math.min(20, sweepIndex);

    const volumeRatio = (data[sweepIndex + 1].volume || 0) / (avgVolume || 1);
    volumeScore = Math.min(100, 50 + volumeRatio * 25);
  }

  // Check confluence with FVG/OB (price zone overlap and sweep alignment)
  let confluenceScore = 30; // Base score

  if (fvgs) {
    for (const fvg of fvgs) {
      if (sweptZone.price >= fvg.low && sweptZone.price <= fvg.high) {
        const alignment = (direction === 'buy-side' && fvg.direction === 'bullish') ||
                         (direction === 'sell-side' && fvg.direction === 'bearish');
        confluenceScore += alignment ? 25 : 10;
      }
      // Boost score when FVG sweep is temporally aligned with this liquidity sweep
      if (fvg.swept && fvg.sweepIndex !== undefined && fvg.sweepPrice !== undefined) {
        const timeDiff = Math.abs(sweepIndex - fvg.sweepIndex);
        const priceDiff = Math.abs(sweptZone.price - fvg.sweepPrice) / sweptZone.price;
        if (timeDiff <= 5 && priceDiff <= 0.01) {
          const alignment = (direction === 'buy-side' && fvg.direction === 'bullish') ||
                           (direction === 'sell-side' && fvg.direction === 'bearish');
          confluenceScore += alignment ? 25 : 10;
        }
      }
    }
  }

  if (orderBlocks) {
    for (const ob of orderBlocks) {
      if (sweptZone.price >= ob.low && sweptZone.price <= ob.high) {
        const alignment = (direction === 'buy-side' && ob.type === 'bullish') ||
                         (direction === 'sell-side' && ob.type === 'bearish');
        confluenceScore += alignment ? 20 : 8;
      }
      // Boost score when OB sweep is temporally aligned with this liquidity sweep
      if (ob.swept && ob.sweepIndex !== undefined && ob.sweepPrice !== undefined) {
        const timeDiff = Math.abs(sweepIndex - ob.sweepIndex);
        const priceDiff = Math.abs(sweptZone.price - ob.sweepPrice) / sweptZone.price;
        if (timeDiff <= 5 && priceDiff <= 0.01) {
          const alignment = (direction === 'buy-side' && ob.type === 'bullish') ||
                           (direction === 'sell-side' && ob.type === 'bearish');
          confluenceScore += alignment ? 30 : 15;
        }
      }
    }
  }

  confluenceScore = Math.min(100, confluenceScore);

  // Composite validation score
  const validationScore = Math.round(
    wickScore * 0.2 +
    reversalStrength * 0.35 +
    volumeScore * 0.2 +
    confluenceScore * 0.25
  );

  return {
    isValid: validationScore >= 50 && reversalStrength >= 40,
    validationScore,
    reversalStrength: Math.round(reversalStrength),
  };
}

/**
 * Detect manipulation patterns in sweep clusters
 * Multiple sweeps in a narrow range without clear reversal = choppy/ranging
 */
export function detectChoppyRangeSweeps(
  data: CandleData[],
  detectedSweeps: LiquidityZone[],
  lookbackCandles: number = 20,
): boolean {
  
  if (detectedSweeps.length < 3) return false;

  const recentSweeps = detectedSweeps.filter(s => {
    if (!s.sweepTime) return false;
    const sweptIndex = data.findIndex(c => c.time === s.sweepTime);
    return sweptIndex >= data.length - lookbackCandles;
  });

  if (recentSweeps.length < 3) return false;

  // Check if sweeps are clustered in a range (sign of choppy market)
  const sweepLevels = recentSweeps.map(s => s.price);
  const maxLevel = Math.max(...sweepLevels);
  const minLevel = Math.min(...sweepLevels);
  const range = maxLevel - minLevel;
  const rangePercent = (range / minLevel) * 100;

  // If multiple sweeps within <0.5% range = ranging/choppy
  if (rangePercent < 0.5) {
    return true;
  }

  // Check for opposing direction sweeps in close succession
  let opposingCount = 0;
  for (let i = 1; i < recentSweeps.length; i++) {
    if (recentSweeps[i].type !== recentSweeps[i - 1].type) {
      opposingCount++;
    }
  }

  return opposingCount >= 2; // Multiple direction changes = choppy
}

/**
 * Calculate dynamic volatility-adjusted thresholds for sweep invalidation
 */
export function getDynamicInvalidationThreshold(
  data: CandleData[],
  basePercent: number = 0.01 // 1% default
): number {
  
  const atr = getCurrentATR(data);
  const currentPrice = data[data.length - 1].close;
  
  // Adjust based on ATR volatility
  const atrPercent = (atr / currentPrice) * 100;
  
  if (atrPercent > 2) {
    // High volatility: wider threshold
    return basePercent * 2;
  } else if (atrPercent < 0.5) {
    // Low volatility: tighter threshold
    return basePercent * 0.5;
  }
  
  return basePercent;
}


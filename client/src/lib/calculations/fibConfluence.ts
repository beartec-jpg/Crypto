import type { FibSetResult } from '@/types/autoFib';
import type { FVGDetection } from '@/types/fvg';
import type { OrderBlock } from '@/types/orderBlock';
import type { LiquidityZone } from '@/types/liquidity';

/**
 * Check if a price range overlaps with any fib level within a given tolerance.
 */
export function detectFibConfluence(
  lower: number,
  upper: number,
  fibSets: FibSetResult[],
  threshold: number = 0.5 // % tolerance
): { hasFib: boolean; fibLevel?: string; isGolden?: boolean } {
  for (const fibSet of fibSets) {
    for (const level of fibSet.levels) {
      const fibPrice = level.price;
      const range = upper - lower;
      const tolerance = range * (threshold / 100);

      if (fibPrice >= lower - tolerance && fibPrice <= upper + tolerance) {
        return {
          hasFib: true,
          fibLevel: level.level,
          isGolden: level.isGolden,
        };
      }
    }
  }
  return { hasFib: false };
}

/** Scoring constants for FVG confluence calculation */
const BASE_CONFLUENCE_SCORE = 50;
const FIB_BONUS = 20;
const GOLDEN_RATIO_BONUS = 15;
const ORDER_BLOCK_BONUS = 10;
const LIQUIDITY_BONUS = 10;

/**
 * Calculate confluence score for an FVG (0–100).
 */
export function calculateFVGConfluenceScore(
  fvg: FVGDetection,
  fibSets: FibSetResult[],
  orderBlocks: OrderBlock[],
  liquidityZones: LiquidityZone[]
): number {
  let score = BASE_CONFLUENCE_SCORE;

  // Fib confluence
  const fibConf = detectFibConfluence(fvg.bottom, fvg.top, fibSets);
  if (fibConf.hasFib) {
    score += FIB_BONUS;
    if (fibConf.isGolden) {
      score += GOLDEN_RATIO_BONUS; // Bonus for golden ratio levels
    }
  }

  // Order Block confluence
  const hasOB = orderBlocks.some(
    ob => ob.top >= fvg.bottom && ob.bottom <= fvg.top
  );
  if (hasOB) score += ORDER_BLOCK_BONUS;

  // Liquidity Zone confluence
  const midFvg = (fvg.bottom + fvg.top) / 2;
  const halfGap = (fvg.top - fvg.bottom) / 2;
  const hasLiq = liquidityZones.some(
    liq => Math.abs(liq.price - midFvg) < halfGap
  );
  if (hasLiq) score += LIQUIDITY_BONUS;

  return Math.min(100, score);
}

/**
 * Get display color for an FVG based on its confluence score.
 */
export function getFVGConfluenceColor(
  score: number,
  baseType: 'bullish' | 'bearish'
): string {
  if (score >= 85) return '#FFD700'; // Gold – very high value
  if (score >= 70) return '#FFA500'; // Orange – high value
  if (baseType === 'bullish') return '#22c55e'; // Green – standard bullish
  return '#ef4444'; // Red – standard bearish
}

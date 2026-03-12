/**
 * Confluence Analysis – Maximum Opportunity Zone detection.
 *
 * Analyses multiple technical factors within a locked viewport and scores
 * price levels by how many confluent factors align there. Returns the top
 * opportunity zones sorted by confluence score.
 */

import type { Candle } from '@/types/chart';
import type { FVGDetection } from '@/types/fvg';
import type { OrderBlock } from '@/types/orderBlock';
import type { Breaker } from '@/types/breaker';
import type { StructureBreak } from '@/types/structureBreak';
import type { LiquidityZone } from '@/types/liquidity';
import type { AutoFibResult } from '@/types/autoFib';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ConfluentFactor {
  type: 'fib' | 'fvg' | 'ob' | 'breaker' | 'mss' | 'bos' | 'choch' | 'liquidity';
  value: number; // points contributed
  price: number;
  direction?: 'bullish' | 'bearish';
  label: string;
}

export interface OpportunityZone {
  priceLevel: number;
  confluenceScore: number;
  factors: ConfluentFactor[];
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: 'extreme' | 'high' | 'moderate' | 'low';
  candleIndex: number;
  description: string;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Analyse all technical factors in the visible viewport range and return
 * price zones ordered by confluence score (highest first).
 *
 * Scoring is tied to the Smart Money weight system:
 * - Each factor's contribution = weight × BASE_MULTIPLIER
 * - Factors with weight = 0 (disabled by user) are excluded entirely
 * - Returns 1 zone normally; 2 zones max only when a high-quality
 *   counter-trend zone exists
 */
export function findMaximumOpportunityZones(
  candles: Candle[],
  startIdx: number,
  endIdx: number,
  autoFibResult: AutoFibResult,
  fvgs: FVGDetection[],
  orderBlocks: OrderBlock[],
  breakers: Breaker[],
  structureBreaks: StructureBreak[],
  liquidityZones: LiquidityZone[],
  weights: Record<string, number>,
): OpportunityZone[] {
  if (candles.length === 0 || startIdx >= endIdx) return [];

  const BASE_MULTIPLIER = 10;
  const zones = new Map<number, OpportunityZone>();

  // ── Determine price range of the visible window ──────────────────────────
  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (let i = startIdx; i <= endIdx; i++) {
    priceMin = Math.min(priceMin, candles[i].low);
    priceMax = Math.max(priceMax, candles[i].high);
  }
  if (priceMax <= priceMin) return [];

  // Bucket size = 0.1 % of price range (merges near-identical levels)
  const bucketSize = (priceMax - priceMin) * 0.001;
  const bucket = (price: number) => Math.round(price / bucketSize) * bucketSize;

  const getOrCreate = (price: number, dir: 'bullish' | 'bearish' | 'neutral', candleIdx: number): OpportunityZone => {
    const b = bucket(price);
    if (!zones.has(b)) {
      zones.set(b, {
        priceLevel: b,
        confluenceScore: 0,
        factors: [],
        direction: dir,
        strength: 'low',
        candleIndex: candleIdx,
        description: '',
      });
    }
    return zones.get(b)!;
  };

  const addFactor = (price: number, dir: 'bullish' | 'bearish' | 'neutral', candleIdx: number, factor: ConfluentFactor) => {
    const zone = getOrCreate(price, dir, candleIdx);
    zone.confluenceScore += factor.value;
    zone.factors.push(factor);
    // Prefer a directional classification over neutral
    if (zone.direction === 'neutral' && dir !== 'neutral') {
      zone.direction = dir;
    }
  };

  // ── 1. Fibonacci levels ───────────────────────────────────────────────────
  const fibWeight = weights.autoFibConfluence ?? 0;
  if (fibWeight > 0) {
    const processFibSet = (fibSet: AutoFibResult['primary']) => {
      if (!fibSet) return;
      fibSet.levels.forEach(level => {
        if (level.price < priceMin || level.price > priceMax) return;
        addFactor(level.price, 'neutral', findNearestCandleIndex(candles, startIdx, endIdx, level.price), {
          type: 'fib',
          value: fibWeight * BASE_MULTIPLIER,
          price: level.price,
          label: `Fib ${level.percentage}`,
        });
      });
    };

    processFibSet(autoFibResult.primary);
    processFibSet(autoFibResult.secondary);
  }

  // ── 2. FVGs ───────────────────────────────────────────────────────────────
  const startTime = candles[startIdx].time;
  const endTime = candles[endIdx].time;

  const fvgWeight = weights.fvgProximity ?? 0;
  if (fvgWeight > 0) {
    fvgs
      .filter(fvg => !fvg.mitigated && fvg.startTime >= startTime && fvg.startTime <= endTime)
      .forEach(fvg => {
        const mid = (fvg.top + fvg.bottom) / 2;
        const candleIdx = findNearestCandleIndex(candles, startIdx, endIdx, mid);
        addFactor(mid, fvg.type, candleIdx, {
          type: 'fvg',
          value: fvgWeight * BASE_MULTIPLIER,
          price: mid,
          direction: fvg.type,
          label: `${fvg.type === 'bullish' ? 'Bullish' : 'Bearish'} FVG`,
        });
      });
  }

  // ── 3. Order Blocks ───────────────────────────────────────────────────────
  const obWeight = weights.orderBlockTouch ?? 0;
  if (obWeight > 0) {
    orderBlocks
      .filter(ob => ob.formationIndex >= startIdx && ob.formationIndex <= endIdx && !ob.mitigated)
      .forEach(ob => {
        const mid = (ob.top + ob.bottom) / 2;
        addFactor(mid, ob.type, ob.formationIndex, {
          type: 'ob',
          value: obWeight * BASE_MULTIPLIER,
          price: mid,
          direction: ob.type,
          label: `${ob.type === 'bullish' ? 'Bullish' : 'Bearish'} OB`,
        });
      });
  }

  // ── 4. Breaker Blocks ─────────────────────────────────────────────────────
  const breakerWeight = weights.breakerBlockProximity ?? 0;
  if (breakerWeight > 0) {
    breakers
      .filter(b => !b.mitigated && b.conversionIndex >= startIdx && b.conversionIndex <= endIdx)
      .forEach(b => {
        const mid = (b.top + b.bottom) / 2;
        addFactor(mid, b.type, b.conversionIndex, {
          type: 'breaker',
          value: breakerWeight * BASE_MULTIPLIER,
          price: mid,
          direction: b.type,
          label: `${b.type === 'bullish' ? 'Bullish' : 'Bearish'} Breaker`,
        });
      });
  }

  // ── 5. Structure breaks (MSS / BOS / CHoCH) ───────────────────────────────
  structureBreaks
    .filter(sb => sb.breakIndex >= startIdx && sb.breakIndex <= endIdx)
    .forEach(sb => {
      const pts = sb.type === 'mss' ? 25 : sb.type === 'bos' ? 20 : 15;
      addFactor(sb.brokenLevel, sb.direction, sb.breakIndex, {
        type: sb.type === 'mss' ? 'mss' : sb.type === 'bos' ? 'bos' : 'choch',
        value: pts,
        price: sb.brokenLevel,
        direction: sb.direction,
        label: `${sb.type.toUpperCase()} (${sb.direction})`,
      });
    });

  // ── 6. Liquidity zones ────────────────────────────────────────────────────
  const liquidityWeight = weights.liquiditySweep ?? 0;
  if (liquidityWeight > 0) {
    liquidityZones
      .filter(lz => !lz.swept && !lz.invalidated)
      .forEach(lz => {
        const candleIdx = findNearestCandleIndex(candles, startIdx, endIdx, lz.price);
        addFactor(lz.price, 'neutral', candleIdx, {
          type: 'liquidity',
          value: liquidityWeight * BASE_MULTIPLIER,
          price: lz.price,
          label: `Liquidity ${lz.type === 'high' ? 'High' : 'Low'}`,
        });
      });
  }

  // ── 7. Strength classification & description ──────────────────────────────
  zones.forEach(zone => {
    if (zone.confluenceScore >= 60) zone.strength = 'extreme';
    else if (zone.confluenceScore >= 40) zone.strength = 'high';
    else if (zone.confluenceScore >= 25) zone.strength = 'moderate';
    else zone.strength = 'low';

    const top3 = zone.factors
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map(f => f.label)
      .join(' + ');

    zone.description = `${zone.confluenceScore} pts: ${top3}`;
  });

  // ── 8. Select zones: 1 normally, 2 max if good counter-trend exists ───────
  const sorted = Array.from(zones.values())
    .filter(z => z.confluenceScore >= 20)
    .sort((a, b) => b.confluenceScore - a.confluenceScore);

  if (sorted.length === 0) return [];

  const result: OpportunityZone[] = [sorted[0]];

  // Add a second zone only when it is counter-trend AND high quality
  if (sorted.length >= 2) {
    const second = sorted[1];
    const isCounterTrend =
      second.direction !== 'neutral' &&
      sorted[0].direction !== 'neutral' &&
      second.direction !== sorted[0].direction;
    const isHighQuality =
      second.confluenceScore >= 40 ||
      second.strength === 'high' ||
      second.strength === 'extreme';

    if (isCounterTrend && isHighQuality) {
      result.push(second);
    }
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findNearestCandleIndex(
  candles: Candle[],
  startIdx: number,
  endIdx: number,
  price: number,
): number {
  let nearest = startIdx;
  let minDist = Math.abs(candles[startIdx].close - price);

  for (let i = startIdx + 1; i <= endIdx; i++) {
    const dist = Math.abs(candles[i].close - price);
    if (dist < minDist) {
      minDist = dist;
      nearest = i;
    }
  }

  return nearest;
}

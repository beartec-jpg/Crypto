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
import type { StructureBreak } from '@/types/structureBreak';
import type { LiquidityZone } from '@/types/liquidity';
import type { VolumeProfileData } from '@/types/volumeProfile';
import type { AutoFibResult } from '@/types/autoFib';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ConfluentFactor {
  type: 'fib' | 'fvg' | 'ob' | 'mss' | 'bos' | 'choch' | 'liquidity' | 'vwap' | 'support';
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
 */
export function findMaximumOpportunityZones(
  candles: Candle[],
  startIdx: number,
  endIdx: number,
  autoFibResult: AutoFibResult,
  fvgs: FVGDetection[],
  orderBlocks: OrderBlock[],
  structureBreaks: StructureBreak[],
  liquidityZones: LiquidityZone[],
  volumeProfileData: VolumeProfileData | null,
  htfBias: 'bullish' | 'bearish' | 'neutral',
): OpportunityZone[] {
  if (candles.length === 0 || startIdx >= endIdx) return [];

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
  const importantFibLevels = new Set(['50', '61.8', '78.6']);

  const processFibSet = (fibSet: AutoFibResult['primary']) => {
    if (!fibSet) return;
    fibSet.levels.forEach(level => {
      if (level.price < priceMin || level.price > priceMax) return;
      const points = importantFibLevels.has(level.level) ? 15 : 10;
      addFactor(level.price, 'neutral', findNearestCandleIndex(candles, startIdx, endIdx, level.price), {
        type: 'fib',
        value: points,
        price: level.price,
        label: `Fib ${level.percentage}`,
      });
    });
  };

  processFibSet(autoFibResult.primary);
  processFibSet(autoFibResult.secondary);

  // ── 2. FVGs ───────────────────────────────────────────────────────────────
  const startTime = candles[startIdx].time;
  const endTime = candles[endIdx].time;

  fvgs
    .filter(fvg => !fvg.mitigated && fvg.startTime >= startTime && fvg.startTime <= endTime)
    .forEach(fvg => {
      const mid = (fvg.top + fvg.bottom) / 2;
      const candleIdx = findNearestCandleIndex(candles, startIdx, endIdx, mid);
      addFactor(mid, fvg.type, candleIdx, {
        type: 'fvg',
        value: 15,
        price: mid,
        direction: fvg.type,
        label: `${fvg.type === 'bullish' ? 'Bullish' : 'Bearish'} FVG`,
      });
    });

  // ── 3. Order Blocks ───────────────────────────────────────────────────────
  orderBlocks
    .filter(ob => ob.formationIndex >= startIdx && ob.formationIndex <= endIdx && !ob.mitigated)
    .forEach(ob => {
      const mid = (ob.top + ob.bottom) / 2;
      addFactor(mid, ob.type, ob.formationIndex, {
        type: 'ob',
        value: 20,
        price: mid,
        direction: ob.type,
        label: `${ob.type === 'bullish' ? 'Bullish' : 'Bearish'} OB`,
      });
    });

  // ── 4. Structure breaks (MSS / BOS / CHoCH) ───────────────────────────────
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

  // ── 5. Liquidity zones ────────────────────────────────────────────────────
  liquidityZones
    .filter(lz => !lz.swept && !lz.invalidated)
    .forEach(lz => {
      const candleIdx = findNearestCandleIndex(candles, startIdx, endIdx, lz.price);
      addFactor(lz.price, 'neutral', candleIdx, {
        type: 'liquidity',
        value: 15,
        price: lz.price,
        label: `Liquidity ${lz.type === 'high' ? 'High' : 'Low'}`,
      });
    });

  // ── 6. Volume Profile POC ─────────────────────────────────────────────────
  if (volumeProfileData && volumeProfileData.poc) {
    const candleIdx = findNearestCandleIndex(candles, startIdx, endIdx, volumeProfileData.poc);
    addFactor(volumeProfileData.poc, 'neutral', candleIdx, {
      type: 'vwap',
      value: 12,
      price: volumeProfileData.poc,
      label: 'POC (Volume Point of Control)',
    });
  }

  // ── 7. HTF Bias bonus ─────────────────────────────────────────────────────
  if (htfBias !== 'neutral') {
    zones.forEach(zone => {
      if (zone.direction === htfBias) {
        zone.confluenceScore += 10;
        zone.factors.push({
          type: 'support',
          value: 10,
          price: zone.priceLevel,
          label: 'HTF Bias Aligned',
        });
      }
    });
  }

  // ── 8. Strength classification & description ──────────────────────────────
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

  // ── Return top zones sorted by score (minimum threshold: 20 pts) ──────────
  return Array.from(zones.values())
    .filter(z => z.confluenceScore >= 20)
    .sort((a, b) => b.confluenceScore - a.confluenceScore);
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

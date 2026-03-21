import { useMemo } from 'react';
import type { CandleData } from '@/types/chart.types';
import type { LiquidityLevel, LiquidityHeatmapData } from '@/types/liquidityHeatmap';
import type { VolumeProfileData } from '@/types/volumeProfile';
import { calculateSwings } from '@/lib/smc/pivots';

/**
 * Predicted liquidation point with confluence analysis
 */
export interface PredictedLiquidityPoint {
  price: number;
  direction: 'long' | 'short' | 'neutral'; // Which direction has more liquidity
  confidence: number; // 0-100 confluence score
  components: {
    pivotStrength: number; // Is this a pivot level? 0-100
    volumeConcentration: number; // Volume at this price relative to average, 0-100
    liquidationDensity: number; // Liquidation amount at this price, 0-100
    directionalBias: number; // How skewed is long vs short? 0-100 (50=neutral)
  };
  isPivot: boolean;
  isPOC: boolean; // Point of Control from volume profile
  volumeAtPrice: number;
  liquidationAtPrice: number;
  longLiquidation: number;
  shortLiquidation: number;
}

/**
 * Zones where liquidation is likely to occur
 */
export interface LiquidationZone {
  priceFrom: number;
  priceTo: number;
  direction: 'long' | 'short';
  strength: number; // 0-100
  confluence: string[]; // ['pivot', 'volume', 'liquidation_cluster']
  topPoints: PredictedLiquidityPoint[];
}

interface UseOptions {
  priceThreshold?: number; // Price range to group nearby levels (default: 0.5% of price)
  minConfluenceScore?: number; // Minimum confidence threshold (default: 40)
  topNPoints?: number; // Return top N points (default: 10)
}

/**
 * Unified analysis combining:
 * 1. Pivot detection (swing highs/lows)
 * 2. Volume concentration (POC, value area)
 * 3. Liquidation density (from heatmap data)
 * 
 * Returns predicted liquidation points ranked by confluence strength
 */
export function useLiquidityPivotAnalysis(
  candles: CandleData[],
  volumeProfile: VolumeProfileData | null,
  liquidityHeatmap: LiquidityHeatmapData | null,
  options: UseOptions = {}
): {
  points: PredictedLiquidityPoint[];
  zones: LiquidationZone[];
  directionBias: 'long' | 'short' | 'neutral';
  confidence: number;
} {
  const {
    priceThreshold = undefined, // Will be calculated as % of current price
    minConfluenceScore = 40,
    topNPoints = 10,
  } = options;

  return useMemo(() => {
    if (!liquidityHeatmap?.levels || liquidityHeatmap.levels.length === 0) {
      return { points: [], zones: [], directionBias: 'neutral', confidence: 0 };
    }

    const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
    if (currentPrice <= 0) {
      return { points: [], zones: [], directionBias: 'neutral', confidence: 0 };
    }

    // Calculate dynamic price threshold if not provided
    const threshold = priceThreshold ?? currentPrice * 0.005; // 0.5% of current price

    // ================== STEP 1: DETECT PIVOT LEVELS ==================
    const pivots = calculateSwings(candles, 5); // Find pivots with 5-candle lookback
    const pivotPrices = new Set(pivots.map(p => p.value));
    const pivotMap = new Map(
      pivots.map(p => [
        Math.round(p.value / threshold) * threshold, // Normalize to threshold
        { value: p.value, type: p.type } as const,
      ])
    );

    // ================== STEP 2: BUILD PRICE LEVEL MAP ==================
    // Aggregate liquidation, volume, and pivot info by price level
    const levelMap = new Map<number, {
      price: number;
      liquidations: LiquidityLevel[];
      volumeAtPrice: number;
      pivotType?: 'high' | 'low';
    }>();

    // Add liquidation levels
    for (const liq of liquidityHeatmap.levels) {
      const normalizedPrice = Math.round(liq.price / threshold) * threshold;
      if (!levelMap.has(normalizedPrice)) {
        levelMap.set(normalizedPrice, {
          price: normalizedPrice,
          liquidations: [],
          volumeAtPrice: 0,
        });
      }
      const entry = levelMap.get(normalizedPrice)!;
      entry.liquidations.push(liq);
    }

    // Add volume profile data (POC and nearby high-volume nodes)
    if (volumeProfile?.rows) {
      for (const row of volumeProfile.rows) {
        const normalizedPrice = Math.round(row.price / threshold) * threshold;
        if (!levelMap.has(normalizedPrice)) {
          levelMap.set(normalizedPrice, {
            price: normalizedPrice,
            liquidations: [],
            volumeAtPrice: 0,
          });
        }
        const entry = levelMap.get(normalizedPrice)!;
        entry.volumeAtPrice += row.volume;
      }
    }

    // Add pivot levels
    pivotMap.forEach((pivot, normalizedPrice) => {
      if (!levelMap.has(normalizedPrice)) {
        levelMap.set(normalizedPrice, {
          price: normalizedPrice,
          liquidations: [],
          volumeAtPrice: 0,
        });
      }
      const entry = levelMap.get(normalizedPrice)!;
      entry.pivotType = pivot.type;
    });

    // ================== STEP 3: CALCULATE METRICS ==================
    const totalLiquidity = liquidityHeatmap.levels.reduce(
      (sum, lv) => sum + (lv.longLiquidation || 0) + (lv.shortLiquidation || 0),
      0
    );
    const totalVolume = volumeProfile?.totalVolume ?? 1;
    const avgVolume = totalVolume / (volumeProfile?.rows?.length ?? 1);

    const points: PredictedLiquidityPoint[] = [];

    for (const [, entry] of levelMap) {
      // Sum liquidation at this level
      const longLiq = entry.liquidations.reduce((s, l) => s + (l.longLiquidation || 0), 0);
      const shortLiq = entry.liquidations.reduce((s, l) => s + (l.shortLiquidation || 0), 0);
      const totalLiq = longLiq + shortLiq;

      // Determine direction (which side has more liquidity)
      const direction: 'long' | 'short' | 'neutral' =
        longLiq > shortLiq * 1.2 ? 'long'
        : shortLiq > longLiq * 1.2 ? 'short'
        : 'neutral';

      // -------- COMPONENT 1: Pivot Strength --------
      const isPivot = entry.pivotType !== undefined;
      const pivotStrength = isPivot ? 75 : 0; // High confidence if confirmed pivot

      // -------- COMPONENT 2: Volume Concentration --------
      const volumeConcentration =
        totalVolume > 0
          ? Math.min(100, (entry.volumeAtPrice / (avgVolume * 3)) * 100)
          : 0;

      // -------- COMPONENT 3: Liquidation Density --------
      const liquidationDensity =
        totalLiquidity > 0
          ? Math.min(100, (totalLiq / (totalLiquidity / 100)) * 100)
          : 0;

      // -------- COMPONENT 4: Directional Bias --------
      const directionalBias = totalLiq > 0
        ? Math.abs((longLiq - shortLiq) / totalLiq) * 100
        : 50;

      // -------- OVERALL CONFIDENCE --------
      const weights = {
        pivot: 0.3,
        volume: 0.25,
        liquidation: 0.35,
        direction: 0.1,
      };

      const confidence = Math.round(
        pivotStrength * weights.pivot +
          volumeConcentration * weights.volume +
          liquidationDensity * weights.liquidation +
          Math.min(100, directionalBias) * weights.direction
      );

      const isPOC = volumeProfile?.poc && Math.abs(entry.price - volumeProfile.poc) < threshold * 1.5;

      if (confidence >= minConfluenceScore) {
        points.push({
          price: entry.price,
          direction,
          confidence,
          components: {
            pivotStrength,
            volumeConcentration,
            liquidationDensity,
            directionalBias: Math.min(100, directionalBias),
          },
          isPivot,
          isPOC: isPOC ?? false,
          volumeAtPrice: entry.volumeAtPrice,
          liquidationAtPrice: totalLiq,
          longLiquidation: longLiq,
          shortLiquidation: shortLiq,
        });
      }
    }

    // ================== STEP 4: RANK AND ZONE ==================
    points.sort((a, b) => b.confidence - a.confidence);
    const topPoints = points.slice(0, topNPoints);

    // Group into zones (consecutive levels within threshold * 2)
    const zones: LiquidationZone[] = [];
    let currentZone: PredictedLiquidityPoint[] = [];
    let lastPrice = -Infinity;

    for (const point of topPoints) {
      if (point.price - lastPrice > threshold * 2 && currentZone.length > 0) {
        // Create zone from current group
        zones.push(createZone(currentZone));
        currentZone = [];
      }
      currentZone.push(point);
      lastPrice = point.price;
    }

    if (currentZone.length > 0) {
      zones.push(createZone(currentZone));
    }

    // ================== STEP 5: OVERALL DIRECTION ==================
    const totalLongInTopPoints = topPoints.reduce((s, p) => s + p.longLiquidation, 0);
    const totalShortInTopPoints = topPoints.reduce((s, p) => s + p.shortLiquidation, 0);
    const overallDirection: 'long' | 'short' | 'neutral' =
      totalLongInTopPoints > totalShortInTopPoints * 1.2 ? 'long'
      : totalShortInTopPoints > totalLongInTopPoints * 1.2 ? 'short'
      : 'neutral';

    const overallConfidence = topPoints.length > 0
      ? Math.round(topPoints.reduce((s, p) => s + p.confidence, 0) / topPoints.length)
      : 0;

    return {
      points: topPoints,
      zones,
      directionBias: overallDirection,
      confidence: overallConfidence,
    };
  }, [candles, volumeProfile, liquidityHeatmap, minConfluenceScore, topNPoints, priceThreshold]);
}

/**
 * Helper: Create a zone from grouped points
 */
function createZone(points: PredictedLiquidityPoint[]): LiquidationZone {
  if (points.length === 0) {
    throw new Error('Cannot create zone from empty points');
  }

  const prices = points.map(p => p.price).sort((a, b) => a - b);
  const priceFrom = prices[0];
  const priceTo = prices[prices.length - 1];

  const longTotal = points.reduce((s, p) => s + p.longLiquidation, 0);
  const shortTotal = points.reduce((s, p) => s + p.shortLiquidation, 0);
  const direction: 'long' | 'short' = longTotal > shortTotal ? 'long' : 'short';

  const avgConfidence = Math.round(
    points.reduce((s, p) => s + p.confidence, 0) / points.length
  );

  const confluence: string[] = [];
  if (points.some(p => p.isPivot)) confluence.push('pivot');
  if (points.some(p => p.isPOC)) confluence.push('volume_poc');
  if (points.some(p => p.liquidationAtPrice > 0)) confluence.push('liquidation_cluster');

  return {
    priceFrom,
    priceTo,
    direction,
    strength: avgConfidence,
    confluence,
    topPoints: points,
  };
}

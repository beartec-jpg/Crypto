import type { CoinglassRange, LiquidityHeatmapSettings } from '@/types/liquidityHeatmap';

export interface ResolvedLiquidityPredictorConfig {
  pivotLookback: number;
  minConfluenceScore: number;
  topNPoints: number;
  priceThresholdPercent: number;
}

export function resolveLiquidityPredictorConfig(
  settings: LiquidityHeatmapSettings,
  effectiveRange: CoinglassRange,
): ResolvedLiquidityPredictorConfig {
  let pivotLookback = settings.pivotLookback;
  let minConfluenceScore = settings.predictionMinConfidence;
  let topNPoints = settings.predictionTopNPoints;
  let priceThresholdPercent = settings.predictionPriceThresholdPct;

  if (!settings.autoTunePredictionByRange) {
    return { pivotLookback, minConfluenceScore, topNPoints, priceThresholdPercent };
  }

  if (effectiveRange === '12h' || effectiveRange === '24h') {
    pivotLookback = Math.max(2, pivotLookback - 1);
    minConfluenceScore = Math.max(20, minConfluenceScore - 8);
    topNPoints = Math.min(30, topNPoints + 4);
    priceThresholdPercent = Math.max(0.1, priceThresholdPercent - 0.1);
  } else if (effectiveRange === '90d' || effectiveRange === '180d' || effectiveRange === '1y') {
    pivotLookback = Math.min(20, pivotLookback + 2);
    minConfluenceScore = Math.min(95, minConfluenceScore + 10);
    topNPoints = Math.max(3, topNPoints - 4);
    priceThresholdPercent = Math.min(2, priceThresholdPercent + 0.2);
  }

  return {
    pivotLookback,
    minConfluenceScore,
    topNPoints,
    priceThresholdPercent,
  };
}

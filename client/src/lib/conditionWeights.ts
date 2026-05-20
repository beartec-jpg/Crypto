export type WeightLevel = 0 | 1 | 2 | 3;

export interface ConditionWeight {
  id: string;
  name: string;
  weight: WeightLevel;
  description?: string;
}

export interface WeightedConditionResult {
  id: string;
  name: string;
  score: number;
  weight: WeightLevel;
  weightedScore: number;
  description?: string;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

/**
 * Calculate weighted average score from multiple conditions
 */
export function calculateWeightedScore(
  conditions: Array<{ score: number; weight: WeightLevel }>,
): number {
  const activeConditions = conditions.filter(c => c.weight > 0);
  if (activeConditions.length === 0) return 0;

  const weightedSum = activeConditions.reduce((sum, c) => sum + (c.score * c.weight), 0);
  const totalWeight = activeConditions.reduce((sum, c) => sum + c.weight, 0);
  return Math.round(weightedSum / totalWeight);
}

/**
 * Get condition weights for a trading system from localStorage
 */
export function getConditionWeights(systemId: string): Record<string, WeightLevel> {
  const storage = getStorage();
  if (!storage) return getDefaultWeights(systemId);

  const key = `tradingSystem_${systemId}_weights`;
  const stored = storage.getItem(key);

  if (stored) {
    try {
      return {
        ...getDefaultWeights(systemId),
        ...JSON.parse(stored),
      };
    } catch {
      return getDefaultWeights(systemId);
    }
  }

  return getDefaultWeights(systemId);
}

/**
 * Set weight for a specific condition
 */
export function setConditionWeight(
  systemId: string,
  conditionId: string,
  weight: WeightLevel,
): void {
  const storage = getStorage();
  if (!storage) return;

  const weights = getConditionWeights(systemId);
  weights[conditionId] = weight;

  const key = `tradingSystem_${systemId}_weights`;
  storage.setItem(key, JSON.stringify(weights));
}

/**
 * Reset all weights to default (1)
 */
export function resetWeightsToDefault(systemId: string): void {
  const storage = getStorage();
  if (!storage) return;

  const key = `tradingSystem_${systemId}_weights`;
  storage.setItem(key, JSON.stringify(getDefaultWeights(systemId)));
}

/**
 * Get default weights for a system (all conditions weighted equally at 1)
 */
function getDefaultWeights(systemId: string): Record<string, WeightLevel> {
  if (systemId === 'trend-following') {
    return {
      supertrend: 1,
      macdSignal: 1,
      macdCrossover: 1,
      rsiMomentum: 1,
      priceFollowThrough: 1,
    };
  }

  if (systemId === 'mean-reversion' || systemId === 'meanReversion') {
    return {
      rsi: 1,
      support: 1,
      volume: 1,
      divergence: 1,
      trend: 1,
    };
  }

  if (systemId === 'breakout-momentum') {
    return {
      structureBreak: 1,
      squeezeRelease: 1,
      macdMomentum: 1,
      priceFollowThrough: 1,
    };
  }

  if (systemId === 'smart-money') {
    return {
      fvgProximity: 1,
      orderBlockTouch: 1,
      breakerBlockProximity: 1,
      liquiditySweep: 1,
      divergenceConfluence: 1,
      autoFibConfluence: 1,
    };
  }

  if (systemId === 'smc-trend-engine') {
    return {
      structureTrend: 1,
      htfBiasAlignment: 1,
      orderBlockTrendEntry: 1,
      fvgTrendEntry: 1,
      liquidityReaction: 1,
      autoFibTrendEntry: 1,
      divergenceTrendSupport: 1,
      trendFollowThrough: 1,
    };
  }

  if (systemId === 'momentum-scalper') {
    return {
      macdCrossover: 1,
      histogramExpansion: 1,
      trendDirection: 1,
      macdZeroLine: 1,
      priceAction: 1,
    };
  }

  if (systemId === 'divergence-master') {
    return {
      bullishDivergence: 1,
      bearishDivergence: 1,
      smtDivergence: 1, // Multi-asset divergence with confluence bonus
      divergenceNet: 1, // HTF/timeframe weighted net bias from scanner divergence
      rsiLevel: 1,
      rsiTurn: 1,
      macdTurn: 1,
    };
  }

  if (systemId === 'mtf-confluence') {
    return {
      localTrend: 1,
      structureDirection: 1,
    };
  }

  if (systemId === 'volume-profile') {
    return {
      pocProximity: 1,
      valueAreaBoundary: 1,
      volumeAtPrice: 1,
      rsiMidpoint: 1,
      followThrough: 1,
      zoneBounce: 1,
      macdConfirmation: 1,
      volumeConfirmation: 1,
    };
  }

  return {};
}

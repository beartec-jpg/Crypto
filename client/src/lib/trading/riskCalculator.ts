/**
 * Risk/Reward calculation utilities
 * Extracted from CryptoIndicators.tsx for better modularity
 */

interface BotTPSLConfig {
  tp1: {
    positionPercent: number;
  };
  tp2?: {
    positionPercent: number;
  };
  tp3?: {
    positionPercent: number;
  };
}

/**
 * Calculate weighted risk/reward based on multiple take profit levels
 */
export function calculateWeightedRR(
  config: BotTPSLConfig,
  outcome: string,
  rr1: number,
  rr2: number,
  rr3: number
): number {
  const tp1Pct = config.tp1.positionPercent / 100;
  const tp2Pct = (config.tp2?.positionPercent || 0) / 100;
  const tp3Pct = (config.tp3?.positionPercent || 0) / 100;
  
  // Calculate weighted R based on outcome
  if (outcome === 'SL') return -1;
  if (outcome === 'Breakeven') return 0;
  
  if (outcome === 'TP1') {
    // Only TP1 hit - exit full position there
    return rr1;
  } else if (outcome === 'TP2') {
    // TP1 and TP2 hit - partial exit at TP1, rest at TP2
    return (tp1Pct * rr1) + ((tp2Pct + tp3Pct) * rr2);
  } else if (outcome === 'TP3') {
    // All TPs hit - partial exits at each level
    return (tp1Pct * rr1) + (tp2Pct * rr2) + (tp3Pct * rr3);
  }
  
  return rr1; // Default fallback
}

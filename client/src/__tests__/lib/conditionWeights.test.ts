import { describe, expect, it, beforeEach } from 'vitest';
import {
  calculateWeightedScore,
  getConditionWeights,
  resetWeightsToDefault,
  setConditionWeight,
} from '@/lib/conditionWeights';

describe('conditionWeights', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('calculateWeightedScore', () => {
    it('returns weighted average for active conditions', () => {
      const score = calculateWeightedScore([
        { score: 85, weight: 2 },
        { score: 70, weight: 3 },
        { score: 70, weight: 1 },
        { score: 100, weight: 2 },
      ]);

      expect(score).toBe(81);
    });

    it('ignores disabled conditions (weight 0)', () => {
      const score = calculateWeightedScore([
        { score: 80, weight: 0 },
        { score: -20, weight: 1 },
        { score: 40, weight: 1 },
      ]);

      expect(score).toBe(10);
    });

    it('returns 0 when all conditions are disabled', () => {
      const score = calculateWeightedScore([
        { score: 100, weight: 0 },
        { score: -100, weight: 0 },
      ]);

      expect(score).toBe(0);
    });
  });

  describe('localStorage persistence', () => {
    it('stores and restores per-system condition weights', () => {
      setConditionWeight('mean-reversion', 'rsi', 3);
      setConditionWeight('mean-reversion', 'trend', 0);

      const weights = getConditionWeights('mean-reversion');
      expect(weights.rsi).toBe(3);
      expect(weights.trend).toBe(0);
      expect(weights.support).toBe(1);
    });

    it('resets weights to defaults', () => {
      setConditionWeight('mean-reversion', 'rsi', 3);
      setConditionWeight('mean-reversion', 'support', 0);

      resetWeightsToDefault('mean-reversion');
      const weights = getConditionWeights('mean-reversion');

      expect(weights.rsi).toBe(1);
      expect(weights.support).toBe(1);
      expect(weights.volume).toBe(1);
      expect(weights.divergence).toBe(1);
      expect(weights.trend).toBe(1);
    });
  });

  describe('smart-money defaults', () => {
    it('returns non-zero defaults for all smart-money entry zones', () => {
      const weights = getConditionWeights('smart-money');
      expect(weights.fvgProximity).toBe(1);
      expect(weights.orderBlockTouch).toBe(1);
      expect(weights.breakerBlockProximity).toBe(1);
      expect(weights.liquiditySweep).toBe(1);
      expect(weights.divergenceConfluence).toBe(1);
      expect(weights.autoFibConfluence).toBe(1);
    });
  });

  describe('smc-trend-engine defaults', () => {
    it('returns non-zero defaults for all SMC Trend Engine conditions', () => {
      const weights = getConditionWeights('smc-trend-engine');
      expect(weights.structureTrend).toBe(1);
      expect(weights.htfBiasAlignment).toBe(1);
      expect(weights.orderBlockTrendEntry).toBe(1);
      expect(weights.fvgTrendEntry).toBe(1);
      expect(weights.liquidityReaction).toBe(1);
      expect(weights.autoFibTrendEntry).toBe(1);
      expect(weights.divergenceTrendSupport).toBe(1);
      expect(weights.trendFollowThrough).toBe(1);
    });
  });
});

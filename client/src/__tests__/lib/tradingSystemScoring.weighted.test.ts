import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreSystem } from '@/lib/tradingSystemScoring';
import { resetWeightsToDefault, setConditionWeight } from '@/lib/conditionWeights';

describe('tradingSystemScoring weighted mean-reversion', () => {
  const NOW = new Date('2026-03-01T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    localStorage.clear();
    resetWeightsToDefault('mean-reversion');
  });

  it('matches expected default weighted score scenario', () => {
    const evaluation = scoreSystem('mean-reversion', {
      rsi: 25,
      currentPrice: 100,
      supportLevel: 98,
      resistanceLevel: undefined,
      currentVolume: 250,
      avgVolume: 100,
      divergencePoints: [
        {
          type: 'bullish',
          time: NOW - 2 * 60 * 60 * 1000,
          price: 95,
          count: 2,
          indicators: ['RSI', 'MACD'],
        },
      ],
      shortTermMA: 98,
      longTermMA: 100,
      latestClose: 100,
      previousClose: 99,
      htfBullish: 1,
      htfBearish: 1,
    });

    expect(evaluation.score).toBe(53);
    expect(evaluation.conditions).toHaveLength(5);
    expect(evaluation.conditions.every(c => c.userWeight === 1)).toBe(true);
  });

  it('matches expected custom weighted score and disabled trend condition', () => {
    setConditionWeight('mean-reversion', 'rsi', 2);
    setConditionWeight('mean-reversion', 'support', 3);
    setConditionWeight('mean-reversion', 'volume', 1);
    setConditionWeight('mean-reversion', 'divergence', 2);
    setConditionWeight('mean-reversion', 'trend', 0);

    const evaluation = scoreSystem('mean-reversion', {
      rsi: 25,
      currentPrice: 100,
      supportLevel: 98,
      resistanceLevel: undefined,
      currentVolume: 250,
      avgVolume: 100,
      divergencePoints: [
        {
          type: 'bullish',
          time: NOW - 2 * 60 * 60 * 1000,
          price: 95,
          count: 2,
          indicators: ['RSI', 'MACD'],
        },
      ],
      shortTermMA: 98,
      longTermMA: 100,
      latestClose: 100,
      previousClose: 99,
      htfBullish: 1,
      htfBearish: 1,
    });

    expect(evaluation.score).toBe(81);
    const trend = evaluation.conditions.find(c => c.id === 'trend');
    expect(trend?.userWeight).toBe(0);
    expect(trend?.weightedScore).toBe(0);
  });
});

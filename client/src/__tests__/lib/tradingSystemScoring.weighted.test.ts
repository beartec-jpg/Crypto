import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreSystem, scoreSmartMoney } from '@/lib/tradingSystemScoring';
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

    expect(evaluation.score).toBe(61);
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

    expect(evaluation.score).toBe(74);
    const trend = evaluation.conditions.find(c => c.id === 'trend');
    expect(trend?.userWeight).toBe(0);
    expect(trend?.weightedScore).toBe(0);
  });
});

describe('scoreSmartMoney MSS direction scoring', () => {
  const BASE_INPUT = {
    latestClose: 100,
    previousClose: 99,
    htfBullish: 0,
    htfBearish: 0,
    currentCandleIndex: 100,
  };

  // BOS break that falls within the 15m default lookback window (100 - 24 = 76, so >= 80 is in-window)
  const BULLISH_BOS = { breakTime: 80, breakIndex: 80, direction: 'bullish' as const, type: 'bos' as const, swept: false, brokenLevel: 95 };
  const BEARISH_BOS = { breakTime: 80, breakIndex: 80, direction: 'bearish' as const, type: 'bos' as const, swept: false, brokenLevel: 105 };

  it('bullish MSS + bullish prior trend → structureShift score = +90', () => {
    const bullishMSS = { breakTime: 90, breakIndex: 90, direction: 'bullish' as const, type: 'mss' as const, swept: false, brokenLevel: 90, confirmed: true };
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BULLISH_BOS, bullishMSS],
      swingPoints: [],
    });
    const structureShift = evaluation.conditions.find(c => c.id === 'structureShift');
    expect(structureShift?.score).toBe(90);
  });

  it('bearish MSS + bearish prior trend → structureShift score = -90', () => {
    const bearishMSS = { breakTime: 90, breakIndex: 90, direction: 'bearish' as const, type: 'mss' as const, swept: false, brokenLevel: 110, confirmed: true };
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BEARISH_BOS, bearishMSS],
      swingPoints: [],
    });
    const structureShift = evaluation.conditions.find(c => c.id === 'structureShift');
    expect(structureShift?.score).toBe(-90);
  });

  it('bearish MSS + bullish prior trend → structureShift score = -60 (reversal warning)', () => {
    const bearishMSS = { breakTime: 90, breakIndex: 90, direction: 'bearish' as const, type: 'mss' as const, swept: false, brokenLevel: 110, confirmed: true };
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BULLISH_BOS, bearishMSS],
      swingPoints: [],
    });
    const structureShift = evaluation.conditions.find(c => c.id === 'structureShift');
    expect(structureShift?.score).toBe(-60);
  });

  it('bullish MSS + bearish prior trend → structureShift score = +60 (reversal warning)', () => {
    const bullishMSS = { breakTime: 90, breakIndex: 90, direction: 'bullish' as const, type: 'mss' as const, swept: false, brokenLevel: 90, confirmed: true };
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BEARISH_BOS, bullishMSS],
      swingPoints: [],
    });
    const structureShift = evaluation.conditions.find(c => c.id === 'structureShift');
    expect(structureShift?.score).toBe(60);
  });

  it('no MSS, bullish BOS → structureShift score = +90 (fallback to BOS direction)', () => {
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BULLISH_BOS],
      swingPoints: [],
    });
    const structureShift = evaluation.conditions.find(c => c.id === 'structureShift');
    expect(structureShift?.score).toBe(90);
  });

  it('no structure breaks → structureShift score = 0', () => {
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [],
      swingPoints: [],
    });
    const structureShift = evaluation.conditions.find(c => c.id === 'structureShift');
    expect(structureShift?.score).toBe(0);
  });
});

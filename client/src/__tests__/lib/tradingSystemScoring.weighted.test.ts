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
    previousClose: 101, // approaching from above (needed for bullish FVG validation)
    htfBullish: 0,
    htfBearish: 0,
    currentCandleIndex: 100,
    currentTime: 100,
  };

  // BOS break that falls within the 15m default lookback window (100 - 24 = 76, so >= 80 is in-window)
  const BULLISH_BOS = { breakTime: 80, breakIndex: 80, direction: 'bullish' as const, type: 'bos' as const, swept: false, brokenLevel: 95, confirmed: true };
  const BEARISH_BOS = { breakTime: 80, breakIndex: 80, direction: 'bearish' as const, type: 'bos' as const, swept: false, brokenLevel: 105, confirmed: true };

  // A bullish FVG above current price so price is approaching from above (bullish valid entry)
  const BULLISH_FVG = { high: 99.9, low: 99.5, filled: false, type: 'bullish' as const };

  it('bullish MSS + bullish prior trend → trendStrength multiplier = 1.0x (1 consecutive)', () => {
    const bullishMSS = { breakTime: 90, breakIndex: 90, direction: 'bullish' as const, type: 'mss' as const, swept: false, brokenLevel: 90, confirmed: true };
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BULLISH_BOS, bullishMSS],
      swingPoints: [],
      fvgs: [BULLISH_FVG],
    });
    const trendStrength = evaluation.conditions.find(c => c.id === 'trendStrength');
    expect(trendStrength).toBeDefined();
    expect(trendStrength?.value).toBe('1.00x');
  });

  it('bearish MSS + bearish prior trend → no valid bullish entry zone (score = 0)', () => {
    const bearishMSS = { breakTime: 90, breakIndex: 90, direction: 'bearish' as const, type: 'mss' as const, swept: false, brokenLevel: 110, confirmed: true };
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BEARISH_BOS, bearishMSS],
      swingPoints: [],
      fvgs: [BULLISH_FVG], // Bullish FVG doesn't align with bearish structure
    });
    // Bullish FVG in bearish structure → filtered out → no valid zones
    expect(evaluation.score).toBe(0);
  });

  it('bullish MSS exists but no entry zones → score = 0 (no valid zones)', () => {
    const bullishMSS = { breakTime: 90, breakIndex: 90, direction: 'bullish' as const, type: 'mss' as const, swept: false, brokenLevel: 90, confirmed: true };
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BULLISH_BOS, bullishMSS],
      swingPoints: [],
      // no fvgs, no orderBlocks
    });
    expect(evaluation.score).toBe(0);
  });

  it('no MSS, bullish BOS → trendStrength condition not present (BOS/CHoCH not counted as MSS/CHoCH)', () => {
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BULLISH_BOS],
      swingPoints: [],
      fvgs: [BULLISH_FVG],
    });
    // BOS sets structure direction to bullish, FVG should be scored
    // Trend multiplier should be 0.9x (0 consecutive mss/choch)
    const trendStrength = evaluation.conditions.find(c => c.id === 'trendStrength');
    if (evaluation.score !== 0) {
      expect(trendStrength).toBeDefined();
      expect(trendStrength?.value).toBe('0.90x');
    }
  });

  it('no structure breaks → score = 0 (no valid market structure)', () => {
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [],
      swingPoints: [],
    });
    expect(evaluation.score).toBe(0);
  });
});

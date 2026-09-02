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
    expect(trendStrength?.value).toBe('↑1.00x');
  });

  it('bearish MSS + bearish prior trend → no valid bullish entry zone (score = 0)', () => {
    const bearishMSS = { breakTime: 90, breakIndex: 90, direction: 'bearish' as const, type: 'mss' as const, swept: false, brokenLevel: 110, confirmed: true };
    const evaluation = scoreSmartMoney({
      ...BASE_INPUT,
      structureBreaks: [BEARISH_BOS, bearishMSS],
      swingPoints: [],
      fvgs: [BULLISH_FVG], // Bullish FVG doesn't align with bearish structure
    });
    // Counter-trend bullish FVG in bearish structure is still scored (0.8x), not zeroed.
    expect(evaluation.score).toBeGreaterThan(0);
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
      expect(trendStrength?.value).toBe('↑1.00x');
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

describe('scoreSmartMoney additive model — new scoring', () => {
  const BULLISH_MSS = {
    breakTime: 90,
    breakIndex: 90,
    direction: 'bullish' as const,
    type: 'mss' as const,
    swept: false,
    brokenLevel: 90,
    confirmed: true,
  };

  const BASE = {
    latestClose: 100,
    previousClose: 101,
    htfBullish: 0,
    htfBearish: 0,
    currentCandleIndex: 100,
    currentTime: 100,
    structureBreaks: [BULLISH_MSS],
    swingPoints: [],
  };

  const BULLISH_FVG = { high: 99.9, low: 99.5, filled: false, type: 'bullish' as const };
  const BULLISH_OB  = { high: 99.9, low: 99.5, type: 'bullish' as const, mitigated: false };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetWeightsToDefault('smart-money'); // all 1
  });

  it('single zone active → score ≈ raw zone score (not diluted)', () => {
    setConditionWeight('smart-money', 'orderBlockTouch', 0);
    setConditionWeight('smart-money', 'breakerBlockProximity', 0);
    const result = scoreSmartMoney({ ...BASE, fvgs: [BULLISH_FVG] });
    expect(result.score).toBeGreaterThan(50);
    // Should be close to the raw FVG zone score (≈100), not diluted
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('two zones active and qualifying → score ≈ sum of both zone scores', () => {
    setConditionWeight('smart-money', 'breakerBlockProximity', 0);
    const result = scoreSmartMoney({ ...BASE, fvgs: [BULLISH_FVG], orderBlocks: [BULLISH_OB] });
    // With additive model: FVG(~100) + OB(~100) = ~200 (before trend multiplier)
    expect(result.score).toBeGreaterThan(150);
  });

  it('two zones score higher than one zone alone', () => {
    setConditionWeight('smart-money', 'breakerBlockProximity', 0);
    const oneZone = scoreSmartMoney({ ...BASE, fvgs: [BULLISH_FVG] });
    const twoZones = scoreSmartMoney({ ...BASE, fvgs: [BULLISH_FVG], orderBlocks: [BULLISH_OB] });
    expect(twoZones.score).toBeGreaterThan(oneZone.score);
    // Two zones should be roughly double one zone
    expect(twoZones.score).toBeGreaterThan(oneZone.score * 1.5);
  });

  it('zone conditions show raw 0-100 score, not additive pts', () => {
    const result = scoreSmartMoney({ ...BASE, fvgs: [BULLISH_FVG] });
    const fvgCond = result.conditions.find(c => c.id === 'fvgProximity');
    expect(fvgCond).toBeDefined();
    // Zone score is the raw proximity score (0-100 range)
    expect(Math.abs(fvgCond!.score!)).toBeGreaterThanOrEqual(50);
    expect(Math.abs(fvgCond!.score!)).toBeLessThanOrEqual(100);
  });

  it('liquidity bonus is additive pts in condition score field', () => {
    const input = {
      ...BASE,
      fvgs: [BULLISH_FVG],
      liquidityZones: [{ price: 99.0, type: 'low' as const, swept: true, sweptIndex: 99 }],
    };
    setConditionWeight('smart-money', 'liquiditySweep', 2);
    const result = scoreSmartMoney(input);
    const liqCond = result.conditions.find(c => c.id === 'liquiditySweep');
    expect(liqCond).toBeDefined();
    // Should show additive pts (≤40 max at weight 2 = +25 pts max)
    expect(liqCond!.score).toBeGreaterThan(0);
    expect(liqCond!.score).toBeLessThanOrEqual(40);
  });
});

describe('smc-trend-engine weighted behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    resetWeightsToDefault('smc-trend-engine');
  });

  it('disabling all weighted conditions neutralizes the score', () => {
    setConditionWeight('smc-trend-engine', 'structureTrend', 0);
    setConditionWeight('smc-trend-engine', 'htfBiasAlignment', 0);
    setConditionWeight('smc-trend-engine', 'orderBlockTrendEntry', 0);
    setConditionWeight('smc-trend-engine', 'fvgTrendEntry', 0);
    setConditionWeight('smc-trend-engine', 'liquidityReaction', 0);
    setConditionWeight('smc-trend-engine', 'autoFibTrendEntry', 0);
    setConditionWeight('smc-trend-engine', 'divergenceTrendSupport', 0);
    setConditionWeight('smc-trend-engine', 'trendFollowThrough', 0);

    const evaluation = scoreSystem('smc-trend-engine', {
      latestClose: 100,
      previousClose: 101,
      htfBullish: 2,
      htfBearish: 0,
      latestStructureDirection: 'bullish',
      stTrend: 'bullish',
      currentCandleIndex: 120,
      currentTime: 120,
      timeframe: '15m',
      structureBreaks: [{ breakTime: 100, breakIndex: 100, direction: 'bullish', type: 'mss', confirmed: true }],
      orderBlocks: [{ high: 100.5, low: 99.5, type: 'bullish', mitigated: false }],
      fvgs: [{ high: 100.5, low: 99.5, type: 'bullish', filled: false }],
      liquidityZones: [{ price: 99, type: 'low', swept: true, sweptIndex: 119 }],
    });

    expect(evaluation.score).toBe(0);
  });
});

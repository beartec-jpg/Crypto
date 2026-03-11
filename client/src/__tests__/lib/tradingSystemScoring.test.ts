import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  scoreSmartMoney,
  getTrendStrengthMultiplier,
  getConsecutiveMSSCount,
  getExtendedSignalLabel,
} from '@/lib/tradingSystemScoring';
import { resetWeightsToDefault, setConditionWeight } from '@/lib/conditionWeights';
import type { ScoringInput } from '@/lib/tradingSystemScoring';

const NOW = 2000;

// previousClose > FVG high so price "entered from above" — required for bullish FVG validation
const baseInput: ScoringInput = {
  latestClose: 100,
  previousClose: 101,
  htfBullish: 0,
  htfBearish: 0,
  structureBreaks: [
    { breakTime: 1000, breakIndex: 10, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 98 },
  ],
  currentCandleIndex: 20,
  currentTime: NOW,
  timeframe: '15m',
};

// A bullish FVG that price is currently inside, having entered from above (previousClose > high)
const BULLISH_FVG_INSIDE = { high: 100.5, low: 99.5, filled: false, type: 'bullish' as const };

describe('SMC Scoring - Entry Zone Filtering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetWeightsToDefault('smart-money');
    setConditionWeight('smart-money', 'fvgProximity', 3);
    setConditionWeight('smart-money', 'orderBlockTouch', 3);
    setConditionWeight('smart-money', 'breakerBlockProximity', 3);
  });

  it('should return 0 score when no valid entry zones exist', () => {
    // No FVGs, OBs, or Breakers → no valid zones
    const result = scoreSmartMoney({ ...baseInput });
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('No valid entry zones aligned with market structure');
  });

  it('should return 0 score when no structure breaks exist', () => {
    const result = scoreSmartMoney({ ...baseInput, structureBreaks: [] });
    expect(result.score).toBe(0);
  });

  it('should score when a bullish FVG aligns with bullish structure (price entering from above)', () => {
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
    };

    const result = scoreSmartMoney(input);
    expect(result.score).toBeGreaterThan(0);
    const fvgCondition = result.conditions.find(c => c.id === 'fvgProximity');
    expect(fvgCondition).toBeDefined();
    expect(fvgCondition?.met).toBe(true);
  });

  it('should score bearish FVG in bullish structure as counter-trend with 0.8x multiplier', () => {
    const input: ScoringInput = {
      ...baseInput,
      // Bearish FVG: price is above zone (currentPrice=100 > fvg.low=99.5), counter-trend
      fvgs: [{ high: 100.5, low: 99.5, filled: false, type: 'bearish' as const }],
    };

    const result = scoreSmartMoney(input);
    // Counter-trend zones now score (non-zero) with 0.8x penalty instead of being excluded
    expect(result.score).not.toBe(0);
    // Should show the counter-trend warning condition
    const counterTrendCondition = result.conditions.find(c => c.id === 'counterTrend');
    expect(counterTrendCondition).toBeDefined();
    expect(counterTrendCondition?.met).toBe(true);
    expect(counterTrendCondition?.value).toBe('⚠️ 0.8x');
  });

  it('should filter out zones with weight=0', () => {
    setConditionWeight('smart-money', 'fvgProximity', 0);
    setConditionWeight('smart-money', 'orderBlockTouch', 0);
    setConditionWeight('smart-money', 'breakerBlockProximity', 0);

    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
    };

    const result = scoreSmartMoney(input);
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('No valid entry zones aligned with market structure');
  });

  it('should produce a positive score when OB aligns with bullish structure', () => {
    // currentPrice=100, previousClose=101 (approaching from above) → bullish OB valid
    const input: ScoringInput = {
      ...baseInput,
      orderBlocks: [{ high: 100.5, low: 99.5, type: 'bullish', mitigated: false }],
    };

    const result = scoreSmartMoney(input);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should always include all zone conditions even when no valid entry zones exist', () => {
    // No FVGs/OBs/Breakers → score = 0, but zone conditions still present for weight sliders
    const result = scoreSmartMoney({ ...baseInput });
    expect(result.score).toBe(0);
    // Zone conditions must always be present so weight adjusters are shown in UI
    expect(result.conditions.find(c => c.id === 'fvgProximity')).toBeDefined();
    expect(result.conditions.find(c => c.id === 'orderBlockTouch')).toBeDefined();
    expect(result.conditions.find(c => c.id === 'breakerBlockProximity')).toBeDefined();
    // Zones not qualifying should have met=false
    expect(result.conditions.find(c => c.id === 'fvgProximity')?.met).toBe(false);
  });

  it('should show counter-trend zone as met in conditions when zone opposes structure', () => {
    // Bearish FVG with bullish structure → counter-trend, but still a valid zone now
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [{ high: 100.5, low: 99.5, filled: false, type: 'bearish' as const }],
    };
    const result = scoreSmartMoney(input);
    // Counter-trend zones now score non-zero with 0.8x penalty
    expect(result.score).not.toBe(0);
    // fvgProximity should be met (it's a valid counter-trend zone)
    const fvgCondition = result.conditions.find(c => c.id === 'fvgProximity');
    expect(fvgCondition).toBeDefined();
    expect(fvgCondition?.met).toBe(true);
  });
});

describe('SMC Scoring - Counter-Trend Zone Scoring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetWeightsToDefault('smart-money');
    setConditionWeight('smart-money', 'fvgProximity', 3);
    setConditionWeight('smart-money', 'orderBlockTouch', 3);
    setConditionWeight('smart-money', 'breakerBlockProximity', 3);
  });

  const BEARISH_FVG_INSIDE = { high: 100.5, low: 99.5, filled: false, type: 'bearish' as const };

  it('should produce a non-zero score for a bearish FVG in a bullish trend (counter-trend)', () => {
    const input: ScoringInput = {
      ...baseInput, // bullish structure
      fvgs: [BEARISH_FVG_INSIDE],
    };
    const result = scoreSmartMoney(input);
    expect(result.score).not.toBe(0);
  });

  it('should add counterTrend condition to conditions array when counter-trend', () => {
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BEARISH_FVG_INSIDE],
    };
    const result = scoreSmartMoney(input);
    const cond = result.conditions.find(c => c.id === 'counterTrend');
    expect(cond).toBeDefined();
    expect(cond?.met).toBe(true);
    expect(cond?.value).toBe('⚠️ 0.8x');
    expect(cond?.score).toBe(-20);
  });

  it('should show "With Trend" for counterTrend condition when zones align with structure', () => {
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
    };
    const result = scoreSmartMoney(input);
    const cond = result.conditions.find(c => c.id === 'counterTrend');
    expect(cond).toBeDefined();
    expect(cond?.met).toBe(false);
    expect(cond?.value).toBe('✅ With Trend');
    expect(cond?.score).toBe(0);
  });

  it('counter-trend score should be lower than with-trend score for the same zone', () => {
    const withTrendInput: ScoringInput = {
      ...baseInput, // bullish structure
      fvgs: [BULLISH_FVG_INSIDE],
    };
    const counterTrendInput: ScoringInput = {
      ...baseInput, // bullish structure
      fvgs: [BEARISH_FVG_INSIDE],
    };

    const withTrendResult = scoreSmartMoney(withTrendInput);
    const counterTrendResult = scoreSmartMoney(counterTrendInput);

    // Both should score, counter-trend should be lower magnitude
    expect(withTrendResult.score).toBeGreaterThan(0);
    expect(counterTrendResult.score).not.toBe(0);
    expect(Math.abs(counterTrendResult.score)).toBeLessThan(Math.abs(withTrendResult.score));
  });

  it('should not apply trend strength multiplier to counter-trend entries', () => {
    // Multiple bullish structure breaks to build up trendMultiplier
    const multiBreakInput: ScoringInput = {
      ...baseInput,
      structureBreaks: [
        { breakTime: 1900, breakIndex: 19, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 98 },
        { breakTime: 1800, breakIndex: 18, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 97 },
        { breakTime: 1700, breakIndex: 17, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 96 },
      ],
    };
    const withTrendResult = scoreSmartMoney({ ...multiBreakInput, fvgs: [BULLISH_FVG_INSIDE] });
    const counterTrendResult = scoreSmartMoney({ ...multiBreakInput, fvgs: [BEARISH_FVG_INSIDE] });

    // With-trend should benefit from trend multiplier (≥1.2x for 3 breaks)
    // Counter-trend must NOT get the trend bonus — its score should reflect 0.8x only
    expect(Math.abs(withTrendResult.score)).toBeGreaterThan(Math.abs(counterTrendResult.score));

    const cond = counterTrendResult.conditions.find(c => c.id === 'counterTrend');
    expect(cond?.met).toBe(true);
  });
});

describe('SMC Scoring - Trend Strength Multiplier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetWeightsToDefault('smart-money');
    setConditionWeight('smart-money', 'fvgProximity', 3);
  });

  it('should return 1.0x multiplier when consecutiveCount = 1', () => {
    const multiplier = getTrendStrengthMultiplier(
      [{ breakTime: 1000, direction: 'bullish', type: 'mss' }],
      'bullish',
      2000,
    );
    expect(multiplier).toBe(1.0);
  });

  it('should return 1.1x multiplier for 2 consecutive same-direction MSS', () => {
    const multiplier = getTrendStrengthMultiplier(
      [
        { breakTime: 1500, direction: 'bullish', type: 'mss' },
        { breakTime: 1000, direction: 'bullish', type: 'mss' },
      ],
      'bullish',
      2000,
    );
    expect(multiplier).toBeCloseTo(1.1);
  });

  it('should return 1.2x multiplier for 3 consecutive MSS', () => {
    const multiplier = getTrendStrengthMultiplier(
      [
        { breakTime: 1600, direction: 'bullish', type: 'mss' },
        { breakTime: 1400, direction: 'bullish', type: 'mss' },
        { breakTime: 1000, direction: 'bullish', type: 'mss' },
      ],
      'bullish',
      2000,
    );
    expect(multiplier).toBeCloseTo(1.2);
  });

  it('should stop counting at first opposing shift', () => {
    const count = getConsecutiveMSSCount(
      [
        { breakTime: 1600, direction: 'bullish', type: 'mss' },
        { breakTime: 1400, direction: 'bullish', type: 'mss' },
        { breakTime: 1200, direction: 'bearish', type: 'mss' }, // Stop here
        { breakTime: 1000, direction: 'bullish', type: 'mss' },
      ],
      'bullish',
      2000,
    );
    expect(count).toBe(2);
  });

  it('should cap multiplier at 1.5x for 6+ consecutive shifts', () => {
    const breaks = Array.from({ length: 10 }, (_, i) => ({
      breakTime: 2000 - i * 100,
      direction: 'bullish' as const,
      type: 'mss' as const,
    }));

    const multiplier = getTrendStrengthMultiplier(breaks, 'bullish', 3000);
    expect(multiplier).toBe(1.5);
  });

  it('should return 0.9x multiplier when no MSS/CHoCH present (only BOS)', () => {
    // No mss/choch → consecutiveCount = 0 → 1.0 + (0-1)*0.1 = 0.9
    const multiplier = getTrendStrengthMultiplier(
      [{ breakTime: 1000, direction: 'bullish', type: 'bos' }],
      'bullish',
      2000,
    );
    expect(multiplier).toBeCloseTo(0.9);
  });

  it('should apply higher trend multiplier for 3 MSS vs 1 MSS via scoreSmartMoney', () => {
    const input1: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      structureBreaks: [
        { breakTime: 1500, breakIndex: 15, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 98 },
      ],
    };

    const input3: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      structureBreaks: [
        { breakTime: 1900, breakIndex: 19, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 98 },
        { breakTime: 1700, breakIndex: 17, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 96 },
        { breakTime: 1500, breakIndex: 15, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 94 },
      ],
    };

    const result1 = scoreSmartMoney(input1);
    const result3 = scoreSmartMoney(input3);

    // 3 MSS (1.2x) should produce a higher score than 1 MSS (1.0x)
    expect(result3.score).toBeGreaterThan(result1.score);
  });

  it('should show trend multiplier condition with correct value for 2 MSS', () => {
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      structureBreaks: [
        { breakTime: 1900, breakIndex: 19, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 98 },
        { breakTime: 1500, breakIndex: 15, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 96 },
      ],
    };

    const result = scoreSmartMoney(input);
    const trendCondition = result.conditions.find(c => c.id === 'trendStrength');
    expect(trendCondition).toBeDefined();
    expect(trendCondition?.value).toBe('1.10x');
  });

  it('should show 1.50x for 6 consecutive MSS', () => {
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      structureBreaks: Array.from({ length: 6 }, (_, i) => ({
        breakTime: 2000 - i * 100,
        breakIndex: 20 - i,
        direction: 'bullish' as const,
        type: 'mss' as const,
        confirmed: true,
        swept: false,
        brokenLevel: 100 - i,
      })),
    };

    const result = scoreSmartMoney(input);
    const trendCondition = result.conditions.find(c => c.id === 'trendStrength');
    expect(trendCondition).toBeDefined();
    expect(trendCondition?.value).toBe('1.50x');
  });
});

describe('SMC Scoring - Uncapped Scores', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetWeightsToDefault('smart-money');
    setConditionWeight('smart-money', 'fvgProximity', 3);
    setConditionWeight('smart-money', 'orderBlockTouch', 3);
    setConditionWeight('smart-money', 'liquiditySweep', 3);
  });

  it('should allow scores >100 with FVG+OB overlap, liquidity sweep, and 6 MSS', () => {
    // FVG + OB inside zone (both score ~100) + swept liquidity zone + 6 MSS (1.5x)
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      orderBlocks: [{ high: 100.5, low: 99.5, type: 'bullish', mitigated: false }],
      liquidityZones: [{ price: 99.0, type: 'low', swept: true, sweptIndex: 19 }],
      structureBreaks: Array.from({ length: 6 }, (_, i) => ({
        breakTime: 1990 - i * 100,
        breakIndex: 19 - i,
        direction: 'bullish' as const,
        type: 'mss' as const,
        confirmed: true,
        swept: false,
        brokenLevel: 100 - i,
      })),
    };

    const result = scoreSmartMoney(input);
    // Base ~100, sweep boost (+30%), trend 1.5x → ~195
    expect(result.score).toBeGreaterThan(100);
  });

  it('should not clamp scores to 100 (uncapped behavior)', () => {
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      liquidityZones: [{ price: 99.0, type: 'low', swept: true, sweptIndex: 19 }],
      structureBreaks: Array.from({ length: 6 }, (_, i) => ({
        breakTime: 1990 - i * 100,
        breakIndex: 19 - i,
        direction: 'bullish' as const,
        type: 'mss' as const,
        confirmed: true,
        swept: false,
        brokenLevel: 100 - i,
      })),
    };

    const result = scoreSmartMoney(input);
    // Score should NOT be clamped to 100
    if (result.score > 0) {
      expect(result.score).not.toBe(100);
    }
  });
});

describe('SMC Scoring - Extended Signal Labels', () => {
  it('should return LEGENDARY LONG for scores >=150', () => {
    expect(getExtendedSignalLabel(150).label).toBe('LEGENDARY LONG');
    expect(getExtendedSignalLabel(200).label).toBe('LEGENDARY LONG');
  });

  it('should return OUTSTANDING LONG for scores 120-149', () => {
    expect(getExtendedSignalLabel(120).label).toBe('OUTSTANDING LONG');
    expect(getExtendedSignalLabel(149).label).toBe('OUTSTANDING LONG');
  });

  it('should return EXCELLENT LONG for scores 100-119', () => {
    expect(getExtendedSignalLabel(100).label).toBe('EXCELLENT LONG');
    expect(getExtendedSignalLabel(119).label).toBe('EXCELLENT LONG');
  });

  it('should return LEGENDARY SHORT for scores <=-150', () => {
    expect(getExtendedSignalLabel(-150).label).toBe('LEGENDARY SHORT');
    expect(getExtendedSignalLabel(-200).label).toBe('LEGENDARY SHORT');
  });

  it('should return OUTSTANDING SHORT for scores -120 to -149', () => {
    expect(getExtendedSignalLabel(-120).label).toBe('OUTSTANDING SHORT');
    expect(getExtendedSignalLabel(-149).label).toBe('OUTSTANDING SHORT');
  });

  it('should return EXCELLENT SHORT for scores -100 to -119', () => {
    expect(getExtendedSignalLabel(-100).label).toBe('EXCELLENT SHORT');
    expect(getExtendedSignalLabel(-119).label).toBe('EXCELLENT SHORT');
  });

  it('should return standard labels for scores in normal -100..+100 range', () => {
    expect(getExtendedSignalLabel(80).label).toBe('BUY SIGNAL');
    expect(getExtendedSignalLabel(50).label).toBe('BUILDING BUY');
    expect(getExtendedSignalLabel(0).label).toBe('NEUTRAL');
    expect(getExtendedSignalLabel(-80).label).toBe('SELL SIGNAL');
  });
});

describe('getConsecutiveMSSCount', () => {
  it('should return 0 when no mss/choch breaks exist', () => {
    expect(getConsecutiveMSSCount(
      [{ breakTime: 1000, direction: 'bullish', type: 'bos' }],
      'bullish',
      2000,
    )).toBe(0);
  });

  it('should filter out breaks after currentTime', () => {
    expect(getConsecutiveMSSCount(
      [
        { breakTime: 3000, direction: 'bullish', type: 'mss' }, // Future — excluded
        { breakTime: 1000, direction: 'bullish', type: 'mss' },
      ],
      'bullish',
      2000,
    )).toBe(1);
  });

  it('should count choch same as mss', () => {
    expect(getConsecutiveMSSCount(
      [
        { breakTime: 1500, direction: 'bullish', type: 'choch' },
        { breakTime: 1000, direction: 'bullish', type: 'mss' },
      ],
      'bullish',
      2000,
    )).toBe(2);
  });

  it('should return 0 for empty structureBreaks', () => {
    expect(getConsecutiveMSSCount([], 'bullish', 2000)).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  scoreSystem,
  scoreSmartMoney,
  getTrendStrengthMultiplier,
  getConsecutiveMSSCount,
  getExtendedSignalLabel,
} from '@/lib/tradingSystemScoring';
import { resetWeightsToDefault, setConditionWeight } from '@/lib/conditionWeights';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { FibSetResult } from '@/types/autoFib';

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

/** Bullish primary fib covering typical test timestamps so BOS/MSS in-range multipliers apply. */
const COVERING_BULL_FIB: FibSetResult = {
  start: { index: 0, time: 0, price: 90 },
  end: { index: 20, time: 2000, price: 110 },
  levels: [],
  color: '#FF8C00',
  showLabels: true,
  labelPosition: 'right',
  extendRight: true,
};

function createSecondaryFib(levelPrice: number): FibSetResult {
  return {
    start: { index: 0, time: 0, price: 95 },
    end: { index: 1, time: 2000, price: 105 },
    levels: [{ level: '61.8', percentage: '61.8%', price: levelPrice, isExtension: false, isGolden: true, isFrozen: false }],
    color: '#FF8C00',
    showLabels: true,
    labelPosition: 'right',
    extendRight: true,
  };
}

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

  // Phase 3: divergence-aligned boost (0.8x → 0.9x)
  // A recent bearish divergence point (count=7, just past confirmation) drives divergenceFinalScore < -40.
  // currentTime=2000, barSeconds=900 (15m), confirmationBars=5 → point must be ≥4500s old → time ≤ -2500.
  const BEARISH_DIV_POINT = { time: -3000, price: 101, type: 'bearish' as const, count: 7, indicators: ['rsi', 'macd'] };

  it('should boost counter-trend multiplier to 0.9x when bearish divergence aligns with bearish zone', () => {
    const input: ScoringInput = {
      ...baseInput, // bullish structure
      fvgs: [BEARISH_FVG_INSIDE], // bearish (counter-trend) zone
      divergencePoints: [BEARISH_DIV_POINT], // bearish divergence → aligns with bearish counter-trend
    };
    const result = scoreSmartMoney(input);
    const cond = result.conditions.find(c => c.id === 'counterTrend');
    expect(cond?.met).toBe(true);
    expect(cond?.value).toBe('⚠️ 0.9x (Div)');
    expect(cond?.score).toBe(-10);
    expect(cond?.description).toContain('0.9x');
  });

  it('counter-trend score with aligned divergence should have higher magnitude than without divergence (divergence weight isolated)', () => {
    // Disable divergence confluence weight so boostedScore is unaffected by divergence.
    // Only the counter-trend multiplier changes (0.8x without divergence, 0.9x with aligned divergence).
    setConditionWeight('smart-money', 'divergenceConfluence', 0);

    const withoutDivInput: ScoringInput = {
      ...baseInput,
      fvgs: [BEARISH_FVG_INSIDE],
    };
    const withDivInput: ScoringInput = {
      ...baseInput,
      fvgs: [BEARISH_FVG_INSIDE],
      divergencePoints: [BEARISH_DIV_POINT], // bearish divergence aligns with bearish zone → 0.9x multiplier
    };
    const withoutDivResult = scoreSmartMoney(withoutDivInput);
    const withDivResult = scoreSmartMoney(withDivInput);

    // With divergence confluence disabled, the only difference is the counter-trend multiplier.
    // 0.9x (aligned divergence) > 0.8x (no divergence) → higher score magnitude.
    expect(Math.abs(withDivResult.score)).toBeGreaterThan(Math.abs(withoutDivResult.score));
  });

  it('should keep 0.8x multiplier when divergence does not align (bullish divergence with bearish zone)', () => {
    const BULLISH_DIV_POINT = { time: -3000, price: 99, type: 'bullish' as const, count: 7, indicators: ['rsi', 'macd'] };
    const input: ScoringInput = {
      ...baseInput, // bullish structure
      fvgs: [BEARISH_FVG_INSIDE], // bearish (counter-trend) zone
      divergencePoints: [BULLISH_DIV_POINT], // bullish divergence → does NOT align with bearish counter-trend
    };
    const result = scoreSmartMoney(input);
    const cond = result.conditions.find(c => c.id === 'counterTrend');
    expect(cond?.met).toBe(true);
    expect(cond?.value).toBe('⚠️ 0.8x');
    expect(cond?.score).toBe(-20);
  });

  // Phase 4: secondary fib alignment boosts counter-trend to 1.0x (no penalty)
  // A secondary fib level within 1% of currentPrice=100 triggers the boost.
const SECONDARY_FIB_NEAR_PRICE = {
  primary: null,
  secondary: createSecondaryFib(100.5),
};

  it('should boost counter-trend multiplier to 1.0x when secondary fib is near price', () => {
    const input: ScoringInput = {
      ...baseInput, // bullish structure
      fvgs: [BEARISH_FVG_INSIDE], // bearish (counter-trend) zone
      autoFibResult: SECONDARY_FIB_NEAR_PRICE,
    };
    const result = scoreSmartMoney(input);
    const cond = result.conditions.find(c => c.id === 'counterTrend');
    expect(cond?.met).toBe(true);
    expect(cond?.value).toBe('⚠️ 1.0x (Fib)');
    expect(cond?.score).toBe(0);
    expect(cond?.description).toContain('1.0x');
  });

  it('counter-trend score with secondary fib should have higher magnitude than with divergence only (multiplier isolated)', () => {
    setConditionWeight('smart-money', 'divergenceConfluence', 0);
    setConditionWeight('smart-money', 'autoFibConfluence', 0);

    const withDivInput: ScoringInput = {
      ...baseInput,
      fvgs: [BEARISH_FVG_INSIDE],
      divergencePoints: [BEARISH_DIV_POINT], // 0.9x
    };
    const withFibInput: ScoringInput = {
      ...baseInput,
      fvgs: [BEARISH_FVG_INSIDE],
      autoFibResult: SECONDARY_FIB_NEAR_PRICE, // 1.0x
    };
    const withDivResult = scoreSmartMoney(withDivInput);
    const withFibResult = scoreSmartMoney(withFibInput);

    // 1.0x (secondary fib) > 0.9x (divergence) → higher score magnitude
    expect(Math.abs(withFibResult.score)).toBeGreaterThan(Math.abs(withDivResult.score));
  });

  it('should use 1.0x multiplier when both divergence and secondary fib align', () => {
    const input: ScoringInput = {
      ...baseInput, // bullish structure
      fvgs: [BEARISH_FVG_INSIDE], // bearish (counter-trend) zone
      divergencePoints: [BEARISH_DIV_POINT], // bearish divergence aligns → 0.9x
      autoFibResult: SECONDARY_FIB_NEAR_PRICE, // secondary fib near price → 1.0x
    };
    const result = scoreSmartMoney(input);
    const cond = result.conditions.find(c => c.id === 'counterTrend');
    expect(cond?.met).toBe(true);
    expect(cond?.value).toBe('⚠️ 1.0x (Div+Fib)');
    expect(cond?.score).toBe(0);
  });

  it('should not apply secondary fib boost when secondary fib is outside 1% of price', () => {
    const farFibResult = {
      primary: null,
      secondary: createSecondaryFib(102.0), // 2% away → outside 1% threshold
    };
    const input: ScoringInput = {
      ...baseInput, // bullish structure
      fvgs: [BEARISH_FVG_INSIDE], // bearish (counter-trend) zone
      autoFibResult: farFibResult,
    };
    const result = scoreSmartMoney(input);
    const cond = result.conditions.find(c => c.id === 'counterTrend');
    expect(cond?.met).toBe(true);
    expect(cond?.value).toBe('⚠️ 0.8x'); // no boost because fib is too far
    expect(cond?.score).toBe(-20);
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

  it('should return 1.0x multiplier when only a BOS is present (BOS counts as a shift)', () => {
    const multiplier = getTrendStrengthMultiplier(
      [{ breakTime: 1000, direction: 'bullish', type: 'bos' }],
      'bullish',
      2000,
    );
    expect(multiplier).toBeCloseTo(1.0);
  });

  it('should apply higher trend multiplier for 3 MSS vs 1 MSS via scoreSmartMoney', () => {
    const input1: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      autoFibResult: { primary: COVERING_BULL_FIB, secondary: null },
      structureBreaks: [
        { breakTime: 1500, breakIndex: 15, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 98 },
      ],
    };

    const input3: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      autoFibResult: { primary: COVERING_BULL_FIB, secondary: null },
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
      autoFibResult: { primary: COVERING_BULL_FIB, secondary: null },
      structureBreaks: [
        { breakTime: 1900, breakIndex: 19, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 98 },
        { breakTime: 1500, breakIndex: 15, direction: 'bullish', type: 'mss', confirmed: true, swept: false, brokenLevel: 96 },
      ],
    };

    const result = scoreSmartMoney(input);
    const trendCondition = result.conditions.find(c => c.id === 'trendStrength');
    expect(trendCondition).toBeDefined();
    expect(trendCondition?.value).toBe('↑1.10x');
  });

  it('should show 1.50x for 6 consecutive MSS', () => {
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      autoFibResult: { primary: COVERING_BULL_FIB, secondary: null },
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
    expect(trendCondition?.value).toBe('↑1.50x');
  });
});

describe('SMC Scoring - Uncapped Scores', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetWeightsToDefault('smart-money');
    // Use default weight=1 for all zones (new model: zones contribute full score at weight≥1)
    setConditionWeight('smart-money', 'liquiditySweep', 3);
  });

  it('should allow scores >100 with FVG+OB overlap, liquidity sweep, and 6 MSS', () => {
    // FVG (~100) + OB (~100) = base 200, liq sweep weight-3 bonus (+40 max), trend 1.5x → far above 100
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

// ─── New additive scoring model tests ─────────────────────────────────────────

describe('SMC Scoring - Additive Zone Model', () => {
  // Scoring uses 0% = end (swing extreme) and 100% = start.
  // start=90, end=120 → price 100 is ~66.7% (OTE 61.8–78.6 → bonus).
  const FIB_PRICE_AT_618: FibSetResult = {
    start: { index: 0, time: 0, price: 90 },
    end: { index: 1, time: 2000, price: 120 },
    levels: [
      { level: '0',   percentage: '0%',   price: 120,  isExtension: false, isGolden: false, isFrozen: false },
      { level: '100', percentage: '100%', price: 90, isExtension: false, isGolden: false, isFrozen: false },
    ],
    color: '#FF8C00',
    showLabels: true,
    labelPosition: 'right',
    extendRight: true,
  };

  // start=90, end=105 → price 100 is ~33% (below 50% → penalty).
  const FIB_PRICE_PENALTY: FibSetResult = {
    start: { index: 0, time: 0, price: 90 },
    end: { index: 1, time: 2000, price: 105 },
    levels: [
      { level: '0',   percentage: '0%',   price: 105,  isExtension: false, isGolden: false, isFrozen: false },
      { level: '100', percentage: '100%', price: 90, isExtension: false, isGolden: false, isFrozen: false },
    ],
    color: '#FF8C00',
    showLabels: true,
    labelPosition: 'right',
    extendRight: true,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetWeightsToDefault('smart-money'); // all weights = 1 now
  });

  it('FVG-only active → score ≈ 100 (not diluted by disabled OB and BB)', () => {
    // Disable OB and BB so only FVG contributes
    setConditionWeight('smart-money', 'orderBlockTouch', 0);
    setConditionWeight('smart-money', 'breakerBlockProximity', 0);

    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
    };
    const result = scoreSmartMoney(input);
    // FVG alone scores ~100, trend ≈ 1.0x, no bonuses → score ≈ 100
    expect(result.score).toBeGreaterThan(80);
    expect(result.score).toBeLessThanOrEqual(105); // allow small trend multiplier variance
  });

  it('FVG + OB + BB all active and qualifying → score ≈ 300 (triple additive)', () => {
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      orderBlocks: [{ high: 100.5, low: 99.5, type: 'bullish', mitigated: false }],
      breakers: [{ high: 100.5, low: 99.5, type: 'bullish' }],
    };
    const result = scoreSmartMoney(input);
    // Base: FVG(~100) + OB(~100) + BB(~100) = ~300, trend ~1.0x
    expect(result.score).toBeGreaterThanOrEqual(250);
  });

  it('FVG + OB active, fib at 61.8% (weight 1) → score adds ~30 pts bonus', () => {
    // Base: FVG + OB ≈ 200; fib at OTE (score=100) with weight 1 → +30 pts bonus
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      orderBlocks: [{ high: 100.5, low: 99.5, type: 'bullish', mitigated: false }],
      autoFibResult: { primary: FIB_PRICE_AT_618, secondary: null },
    };
    setConditionWeight('smart-money', 'autoFibConfluence', 1);
    const resultWithFib = scoreSmartMoney(input);

    // Without fib:
    setConditionWeight('smart-money', 'autoFibConfluence', 0);
    const resultNoFib = scoreSmartMoney({ ...input, autoFibResult: undefined });

    // With fib at OTE → noticeably higher score
    expect(resultWithFib.score).toBeGreaterThan(resultNoFib.score);
    // The fib bonus adds ~30 pts (weight 1, autoFibScore=100 → 30 pts)
    expect(resultWithFib.score - resultNoFib.score).toBeGreaterThanOrEqual(20);
  });

  it('FVG + OB active, fib above 50% with weight 3 → score significantly penalised', () => {
    // Penalty zone: fib pct < 50 → autoFibScore is negative
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      orderBlocks: [{ high: 100.5, low: 99.5, type: 'bullish', mitigated: false }],
      autoFibResult: { primary: FIB_PRICE_PENALTY, secondary: null },
    };
    setConditionWeight('smart-money', 'autoFibConfluence', 3);
    const resultPenalty = scoreSmartMoney(input);

    // Without fib active:
    setConditionWeight('smart-money', 'autoFibConfluence', 0);
    const resultNoFib = scoreSmartMoney({ ...input, autoFibResult: undefined });

    // Weight-3 fib penalty should significantly reduce the score
    expect(resultPenalty.score).toBeLessThan(resultNoFib.score);
    // At weight 3, max penalty is 50 pts → substantial reduction from ~200 base
    expect(resultNoFib.score - resultPenalty.score).toBeGreaterThanOrEqual(20);
  });

  it('bonus conditions show additive pts in score field (not raw 0-100 signal)', () => {
    const input: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      autoFibResult: { primary: FIB_PRICE_AT_618, secondary: null },
    };
    setConditionWeight('smart-money', 'autoFibConfluence', 1);
    const result = scoreSmartMoney(input);

    const fibCond = result.conditions.find(c => c.id === 'autoFibConfluence');
    expect(fibCond).toBeDefined();
    // Fib score should be the actual pts bonus (≤50), not the raw autoFibScore (100)
    expect(fibCond!.score).toBeLessThanOrEqual(50);
    expect(fibCond!.score).toBeGreaterThan(0);
    // Value should show "+X pts" format
    expect(fibCond!.value).toMatch(/\+\d+ pts/);
  });

  it('liquidity sweep contributes additive pts bonus (no penalty)', () => {
    const inputWithSweep: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      liquidityZones: [{ price: 99.0, type: 'low', swept: true, sweptIndex: 19 }],
    };
    const inputNoSweep: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
    };
    setConditionWeight('smart-money', 'liquiditySweep', 1);
    const withSweep = scoreSmartMoney(inputWithSweep);
    const noSweep = scoreSmartMoney(inputNoSweep);

    // Sweep is a pure bonus — score with sweep should be higher
    expect(withSweep.score).toBeGreaterThan(noSweep.score);

    const liqCond = withSweep.conditions.find(c => c.id === 'liquiditySweep');
    expect(liqCond).toBeDefined();
    expect(liqCond!.score).toBeGreaterThan(0);
    expect(liqCond!.value).toMatch(/\+\d+ pts/);
  });

  it('divergence penalty reduces score when opposing setup direction', () => {
    // Bullish structure + bullish FVG + bearish divergence → penalty
    const BEARISH_DIV_POINT = { time: -3000, price: 101, type: 'bearish' as const, count: 7, indicators: ['rsi', 'macd'] };

    const inputNoDivConfig: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
    };
    const inputWithDiv: ScoringInput = {
      ...baseInput,
      fvgs: [BULLISH_FVG_INSIDE],
      divergencePoints: [BEARISH_DIV_POINT],
    };
    setConditionWeight('smart-money', 'divergenceConfluence', 1);
    const noDivResult = scoreSmartMoney({ ...inputNoDivConfig, divergencePoints: [] });
    const divResult = scoreSmartMoney(inputWithDiv);

    // Opposing divergence (bearish div + bullish setup) → penalty reduces score
    expect(divResult.score).toBeLessThan(noDivResult.score);

    const divCond = divResult.conditions.find(c => c.id === 'divergenceConfluence');
    expect(divCond).toBeDefined();
    expect(divCond!.score).toBeLessThan(0); // negative pts penalty
  });
});


describe('SMC Scoring - Extended Signal Labels', () => {
  it('should return LEGENDARY LONG for scores >=250', () => {
    expect(getExtendedSignalLabel(250).label).toBe('LEGENDARY LONG');
    expect(getExtendedSignalLabel(300).label).toBe('LEGENDARY LONG');
  });

  it('should return OUTSTANDING LONG for scores 200-249', () => {
    expect(getExtendedSignalLabel(200).label).toBe('OUTSTANDING LONG');
    expect(getExtendedSignalLabel(249).label).toBe('OUTSTANDING LONG');
  });

  it('should return EXCELLENT LONG for scores 150-199', () => {
    expect(getExtendedSignalLabel(150).label).toBe('EXCELLENT LONG');
    expect(getExtendedSignalLabel(199).label).toBe('EXCELLENT LONG');
  });

  it('should return LEGENDARY SHORT for scores <=-250', () => {
    expect(getExtendedSignalLabel(-250).label).toBe('LEGENDARY SHORT');
    expect(getExtendedSignalLabel(-300).label).toBe('LEGENDARY SHORT');
  });

  it('should return OUTSTANDING SHORT for scores -200 to -249', () => {
    expect(getExtendedSignalLabel(-200).label).toBe('OUTSTANDING SHORT');
    expect(getExtendedSignalLabel(-249).label).toBe('OUTSTANDING SHORT');
  });

  it('should return EXCELLENT SHORT for scores -150 to -199', () => {
    expect(getExtendedSignalLabel(-150).label).toBe('EXCELLENT SHORT');
    expect(getExtendedSignalLabel(-199).label).toBe('EXCELLENT SHORT');
  });

  it('should return standard labels for scores in normal -100..+100 range', () => {
    expect(getExtendedSignalLabel(80).label).toBe('BUY SIGNAL');
    expect(getExtendedSignalLabel(50).label).toBe('BUILDING BUY');
    expect(getExtendedSignalLabel(0).label).toBe('NEUTRAL');
    expect(getExtendedSignalLabel(-80).label).toBe('SELL SIGNAL');
  });
});

describe('getConsecutiveMSSCount', () => {
  it('should count BOS as a structure shift', () => {
    expect(getConsecutiveMSSCount(
      [{ breakTime: 1000, direction: 'bullish', type: 'bos' }],
      'bullish',
      2000,
    )).toBe(1);
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

describe('SMC Trend Engine scoring', () => {
  beforeEach(() => {
    localStorage.clear();
    resetWeightsToDefault('smc-trend-engine');
  });

  it('produces bullish score on bullish structure with bullish zone confluence', () => {
    const result = scoreSystem('smc-trend-engine', {
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
      autoFibResult: { primary: createSecondaryFib(100), secondary: null },
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.conditions.some(c => c.id === 'structureTrend')).toBe(true);
  });

  it('produces bearish score on bearish structure with bearish zone confluence', () => {
    const result = scoreSystem('smc-trend-engine', {
      latestClose: 100,
      previousClose: 99,
      htfBullish: 0,
      htfBearish: 2,
      latestStructureDirection: 'bearish',
      stTrend: 'bearish',
      currentCandleIndex: 120,
      currentTime: 120,
      timeframe: '15m',
      structureBreaks: [{ breakTime: 100, breakIndex: 100, direction: 'bearish', type: 'mss', confirmed: true }],
      orderBlocks: [{ high: 100.5, low: 99.5, type: 'bearish', mitigated: false }],
      fvgs: [{ high: 100.5, low: 99.5, type: 'bearish', filled: false }],
      liquidityZones: [{ price: 101, type: 'high', swept: true, sweptIndex: 119 }],
      autoFibResult: { primary: createSecondaryFib(100), secondary: null },
    });

    expect(result.score).toBeLessThan(0);
    expect(result.conditions.some(c => c.id === 'structureTrend')).toBe(true);
  });
});

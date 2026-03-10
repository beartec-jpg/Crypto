/**
 * SMC Single-Source-of-Truth Contract Tests
 *
 * 1. Conditions array is never empty — even when score is 0 (no market structure).
 * 2. scoreBreakerBlockProximity only reads from input.breakers[]; OB breaker fields are ignored.
 * 3. buildSmcZoneInputs produces identical output for fullscreen and backtest paths
 *    given the same raw data.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  scoreSmartMoney,
  buildSmcZoneInputs,
  type ScoringInput,
  type RawSmcFVG,
  type RawSmcOrderBlock,
  type RawSmcBreaker,
  type RawSmcLiquidityZone,
} from '@/lib/tradingSystemScoring';
import { resetWeightsToDefault } from '@/lib/conditionWeights';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE: ScoringInput = {
  latestClose: 100,
  previousClose: 101,
  htfBullish: 0,
  htfBearish: 0,
  currentCandleIndex: 20,
  currentTime: 2000,
  timeframe: '15m',
};

// ── 1. Conditions never empty when score = 0 ─────────────────────────────────

describe('SMC Contract — conditions always populated', () => {
  beforeEach(() => {
    resetWeightsToDefault('smart-money');
  });

  it('conditions array is non-empty when structureBreaks is empty (score = 0)', () => {
    const result = scoreSmartMoney({ ...BASE, structureBreaks: [] });

    expect(result.score).toBe(0);
    expect(result.conditions.length).toBeGreaterThan(0);
    expect(result.conditions.every(c => c.met === false)).toBe(true);
  });

  it('conditions array is non-empty when structureBreaks is undefined (score = 0)', () => {
    const result = scoreSmartMoney({ ...BASE, structureBreaks: undefined });

    expect(result.score).toBe(0);
    expect(result.conditions.length).toBeGreaterThan(0);
    expect(result.conditions.every(c => c.met === false)).toBe(true);
  });

  it('conditions include every canonical SMC id when score is 0', () => {
    const result = scoreSmartMoney({ ...BASE, structureBreaks: [] });

    const ids = result.conditions.map(c => c.id);
    expect(ids).toContain('trendStrength');
    expect(ids).toContain('orderBlockTouch');
    expect(ids).toContain('fvgProximity');
    expect(ids).toContain('breakerBlockProximity');
    expect(ids).toContain('liquiditySweep');
    expect(ids).toContain('divergenceConfluence');
    expect(ids).toContain('autoFibConfluence');
  });

  it('reasoning says "No valid market structure detected" when structureBreaks is empty', () => {
    const result = scoreSmartMoney({ ...BASE, structureBreaks: [] });

    expect(result.reasoning).toContain('No valid market structure detected');
  });
});

// ── 2. Breaker scoring reads only from input.breakers[] ──────────────────────

describe('SMC Contract — breaker scoring source parity', () => {
  beforeEach(() => {
    resetWeightsToDefault('smart-money');
  });

  const BULLISH_STRUCTURE: ScoringInput['structureBreaks'] = [
    { breakTime: 1000, breakIndex: 10, direction: 'bullish', type: 'mss', confirmed: true },
  ];

  it('scoreBreakerBlockProximity scores when input.breakers[] contains an active breaker', () => {
    const input: ScoringInput = {
      ...BASE,
      previousClose: 101,
      structureBreaks: BULLISH_STRUCTURE,
      // Bullish breaker zone that price (100) is inside → should score
      breakers: [{ high: 100.5, low: 99.5, type: 'bullish', mitigated: false }],
    };

    const result = scoreSmartMoney(input);
    const breakerCondition = result.conditions.find(c => c.id === 'breakerBlockProximity');
    expect(breakerCondition).toBeDefined();
    expect(breakerCondition!.score).toBeGreaterThan(0);
  });

  it('OB objects without a corresponding input.breakers entry do not contribute to breakerBlockProximity', () => {
    // An OB at the same price range — but nothing in input.breakers[]
    const inputWithOBOnly: ScoringInput = {
      ...BASE,
      previousClose: 101,
      structureBreaks: BULLISH_STRUCTURE,
      orderBlocks: [{ high: 100.5, low: 99.5, type: 'bullish', mitigated: false }],
      breakers: [],   // empty — no breakers
    };

    const result = scoreSmartMoney(inputWithOBOnly);
    const breakerCondition = result.conditions.find(c => c.id === 'breakerBlockProximity');
    expect(breakerCondition).toBeDefined();
    expect(breakerCondition!.score).toBe(0);
  });

  it('breaker score is 0 when input.breakers is undefined regardless of orderBlocks', () => {
    const input: ScoringInput = {
      ...BASE,
      previousClose: 101,
      structureBreaks: BULLISH_STRUCTURE,
      orderBlocks: [{ high: 100.5, low: 99.5, type: 'bullish', mitigated: false }],
      breakers: undefined,
    };

    const result = scoreSmartMoney(input);
    const breakerCondition = result.conditions.find(c => c.id === 'breakerBlockProximity');
    expect(breakerCondition!.score).toBe(0);
  });
});

// ── 3. buildSmcZoneInputs — fullscreen / backtest parity ─────────────────────

describe('SMC Contract — buildSmcZoneInputs parity', () => {
  const RAW_FVGS: RawSmcFVG[] = [
    { top: 101, bottom: 99, mitigated: false, type: 'bullish', endTime: 1000 },
    { top: 105, bottom: 103, mitigated: true, type: 'bearish', endTime: 2000 },
  ];
  const RAW_OBS: RawSmcOrderBlock[] = [
    { top: 100.5, bottom: 99.5, type: 'bullish', time: 500, mitigated: false },
    { top: 110, bottom: 108, type: 'bearish', time: 1500, mitigated: true, mitigationTime: 1800 },
  ];
  const RAW_BREAKERS: RawSmcBreaker[] = [
    { top: 102, bottom: 100, type: 'bullish', mitigated: false, conversionTime: 800, conversionIndex: 8, conversionPrice: 101 },
    { top: 107, bottom: 105, type: 'bearish', mitigated: true, conversionTime: 1600, mitigationTime: 1900, conversionIndex: 16, conversionPrice: 106 },
  ];
  const RAW_LZS: RawSmcLiquidityZone[] = [
    { price: 95, type: 'low', swept: true, touchTimes: [400], sweepPrice: 94.5, sweepIndex: 10, sweptIndex: 11 },
    { price: 115, type: 'high', swept: false, touchTimes: [1200] },
  ];

  it('fullscreen path (no currentTime) includes all items with sweep metadata preserved', () => {
    const result = buildSmcZoneInputs(RAW_FVGS, RAW_OBS, RAW_BREAKERS, RAW_LZS);

    expect(result.fvgs).toHaveLength(2);
    expect(result.orderBlocks).toHaveLength(2);
    expect(result.breakers).toHaveLength(2);
    expect(result.liquidityZones).toHaveLength(2);

    // Sweep metadata preserved
    expect(result.liquidityZones![0].sweepPrice).toBe(94.5);
    expect(result.liquidityZones![0].sweepIndex).toBe(10);
    expect(result.liquidityZones![0].sweptIndex).toBe(11);

    // top/bottom → high/low mapping
    expect(result.fvgs![0]).toMatchObject({ high: 101, low: 99, filled: false, type: 'bullish' });
    expect(result.orderBlocks![0]).toMatchObject({ high: 100.5, low: 99.5, type: 'bullish' });
    expect(result.breakers![0]).toMatchObject({ high: 102, low: 100, type: 'bullish', conversionIndex: 8, conversionPrice: 101 });
  });

  it('backtest path (with currentTime) filters items by time and matches manual mapping', () => {
    const currentTime = 1000;

    const result = buildSmcZoneInputs(RAW_FVGS, RAW_OBS, RAW_BREAKERS, RAW_LZS, currentTime);

    // FVGs: only endTime <= 1000 → first only
    expect(result.fvgs).toHaveLength(1);
    expect(result.fvgs![0]).toMatchObject({ high: 101, low: 99, filled: false, type: 'bullish' });

    // OBs: only time <= 1000 → first only
    expect(result.orderBlocks).toHaveLength(1);
    expect(result.orderBlocks![0]).toMatchObject({ high: 100.5, low: 99.5, type: 'bullish', mitigated: false });

    // Breakers: only conversionTime <= 1000 → first only
    expect(result.breakers).toHaveLength(1);
    expect(result.breakers![0]).toMatchObject({ high: 102, low: 100, type: 'bullish', mitigated: false });

    // LiquidityZones: touchTimes last <= 1000 → first only (touchTimes[0]=400)
    expect(result.liquidityZones).toHaveLength(1);
    expect(result.liquidityZones![0].sweepPrice).toBe(94.5);
    expect(result.liquidityZones![0].sweepIndex).toBe(10);
    expect(result.liquidityZones![0].sweptIndex).toBe(11);
  });

  it('fullscreen and backtest paths produce the same output when currentTime is after all items', () => {
    const futureTime = 99999;

    const fullscreen = buildSmcZoneInputs(RAW_FVGS, RAW_OBS, RAW_BREAKERS, RAW_LZS);
    const backtest = buildSmcZoneInputs(RAW_FVGS, RAW_OBS, RAW_BREAKERS, RAW_LZS, futureTime);

    expect(backtest.fvgs).toEqual(fullscreen.fvgs);
    expect(backtest.orderBlocks).toEqual(fullscreen.orderBlocks);
    expect(backtest.breakers).toEqual(fullscreen.breakers);
    expect(backtest.liquidityZones).toEqual(fullscreen.liquidityZones);
  });

  it('mitigated OB is not mitigated if mitigationTime is in the future', () => {
    const currentTime = 1000; // before mitigationTime=1800
    const result = buildSmcZoneInputs(RAW_FVGS, RAW_OBS, RAW_BREAKERS, RAW_LZS, currentTime);

    // Second OB has time=1500 > currentTime=1000 → filtered out entirely
    // First OB has time=500, mitigated=false → included as non-mitigated
    expect(result.orderBlocks).toHaveLength(1);
    expect(result.orderBlocks![0].mitigated).toBe(false);
  });

  it('mitigated OB is reported mitigated once mitigationTime has passed', () => {
    const currentTime = 2000; // after mitigationTime=1800
    const result = buildSmcZoneInputs(RAW_FVGS, RAW_OBS, RAW_BREAKERS, RAW_LZS, currentTime);

    // Both OBs are in range now; second OB's mitigationTime=1800 <= 2000
    const bearishOB = result.orderBlocks!.find(ob => ob.type === 'bearish');
    expect(bearishOB).toBeDefined();
    expect(bearishOB!.mitigated).toBe(true);
  });
});

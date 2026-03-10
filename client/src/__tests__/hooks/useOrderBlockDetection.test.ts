import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOrderBlockDetection } from '@/hooks/useOrderBlockDetection';
import { DEFAULT_OB_SETTINGS } from '@/types/orderBlock';
import type { Candle } from '@/types/candle';
import type { OrderBlock } from '@/types/orderBlock';
import type { Breaker } from '@/types/breaker';

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return {
    time,
    open,
    high,
    low,
    close,
    volume: 1000,
  };
}

describe('useOrderBlockDetection', () => {
  it('mitigates OB when price closes on the wrong side (simple mitigation)', () => {
    const candles: Candle[] = [
      // OB candle (bearish) -> candidate bullish OB zone: top=101, bottom=98
      candle(1000, 100, 101, 98, 99),
      // Bullish displacement to validate OB formation
      candle(1060, 99, 102, 99, 101),
      // Neutral progression
      candle(1120, 101, 102, 100, 101),
      // Candle closes below bottom -> simple mitigation (not a pass-through)
      candle(1180, 99.5, 100, 96, 97.0),
    ];

    const settings = {
      ...DEFAULT_OB_SETTINGS,
      minDisplacementCandles: 1,
      minDisplacementPercent: 0.5,
      minBodyPercent: 10,
      maxAge: 500,
    };

    const { result } = renderHook(() =>
      useOrderBlockDetection({
        candles,
        settings,
        fvgs: [],
      }),
    );

    const { orderBlocks } = result.current;
    const bullishObs = orderBlocks.filter((ob: OrderBlock) => ob.type === 'bullish');
    expect(bullishObs.length).toBeGreaterThan(0);

    const ob = bullishObs[0];
    expect(ob.mitigated).toBe(true);
    expect(ob.mitigationPercent).toBe(100);
    expect(ob.mitigationTime).toBe(1180);
  });

  it('mitigates and clears sweep markers after a swept OB later closes beyond invalidation boundary', () => {
    const candles: Candle[] = [
      // OB candle (bearish) -> candidate bullish OB zone: top=101, bottom=98
      candle(1000, 100, 101, 98, 99),
      // Bullish displacement to validate OB formation
      candle(1060, 99, 102, 99, 101),
      // Neutral progression
      candle(1120, 101, 102, 100, 101),
      // Full zone pass-through: open=101.5 > top=101, close=97.6 < bottom=98 (potential sweep/break)
      candle(1180, 101.5, 103, 97, 97.6),
      // Confirmation candle closes back inside -> marks sweep
      candle(1240, 98.2, 99.2, 97.9, 98.4),
      // Later close-through beyond invalidation boundary (open <= bottom avoids re-pass-through path)
      candle(1300, 97.9, 98.1, 96.8, 97.0),
    ];

    const settings = {
      ...DEFAULT_OB_SETTINGS,
      minDisplacementCandles: 1,
      minDisplacementPercent: 0.5,
      minBodyPercent: 10,
      maxAge: 500,
    };

    const { result } = renderHook(() =>
      useOrderBlockDetection({
        candles,
        settings,
        fvgs: [],
      }),
    );

    const { orderBlocks } = result.current;
    const bullishObs = orderBlocks.filter((ob: OrderBlock) => ob.type === 'bullish');
    expect(bullishObs.length).toBeGreaterThan(0);

    const ob = bullishObs[0];
    expect(ob.mitigated).toBe(true);
    expect(ob.mitigationPercent).toBe(100);
    expect(ob.mitigationTime).toBe(1300);

    // Sweep state should be cleared because the sweep failed and OB was invalidated.
    expect(ob.swept).toBe(false);
    expect(ob.sweepTime).toBeUndefined();
    expect(ob.sweepPrice).toBeUndefined();
    expect(ob.sweepIndex).toBeUndefined();
  });

  it('creates a separate breaker entity when OB is passed through with confirmation', () => {
    const candles: Candle[] = [
      // OB candle (bearish) -> candidate bullish OB
      candle(2000, 100, 101, 98, 99),
      // Bullish displacement
      candle(2060, 99, 102, 99, 101),
      // Full zone pass-through: open=101.5 > top=101, close=97.6 < bottom=98
      candle(2120, 101.5, 103, 97, 97.6),
      // Confirmation candles stay below bottom -> convert to breaker
      candle(2180, 97.7, 97.9, 96.9, 97.2),
      candle(2240, 97.3, 97.8, 96.8, 97.1),
      candle(2300, 97.2, 97.6, 96.7, 97.0),
    ];

    const settings = {
      ...DEFAULT_OB_SETTINGS,
      minDisplacementCandles: 1,
      minDisplacementPercent: 0.5,
      minBodyPercent: 10,
      maxAge: 500,
    };

    const { result } = renderHook(() =>
      useOrderBlockDetection({
        candles,
        settings,
        fvgs: [],
      }),
    );

    const { orderBlocks, breakers } = result.current;

    // OB should be mitigated (dead)
    const bullishObs = orderBlocks.filter((ob: OrderBlock) => ob.type === 'bullish');
    expect(bullishObs.length).toBeGreaterThan(0);
    const ob = bullishObs[0];
    expect(ob.mitigated).toBe(true);

    // A separate bearish breaker should be created
    expect(breakers.length).toBeGreaterThan(0);
    const breaker = breakers.find((b: Breaker) => b.sourceOBId === ob.id);
    expect(breaker).toBeDefined();
    expect(breaker!.type).toBe('bearish');
    expect(breaker!.conversionTime).toBe(2120);
    expect(breaker!.conversionPrice).toBeCloseTo(97.6, 6);
    expect(breaker!.mitigated).toBe(false);
  });

  it('mitigates breaker independently when price closes back through it', () => {
    const candles: Candle[] = [
      // OB candle (bearish) -> candidate bullish OB
      candle(2000, 100, 101, 98, 99),
      // Bullish displacement
      candle(2060, 99, 102, 99, 101),
      // Full zone pass-through: open=101.5 > top=101, close=97.6 < bottom=98
      candle(2120, 101.5, 103, 97, 97.6),
      // Confirmation candles stay outside -> breaker confirmed
      candle(2180, 97.7, 97.9, 96.9, 97.2),
      candle(2240, 97.3, 97.8, 96.8, 97.1),
      candle(2300, 97.2, 97.6, 96.7, 97.0),
      // Price closes above top of zone -> bearish breaker mitigated
      candle(2360, 99.0, 102, 98.5, 101.5),
    ];

    const settings = {
      ...DEFAULT_OB_SETTINGS,
      minDisplacementCandles: 1,
      minDisplacementPercent: 0.5,
      minBodyPercent: 10,
      maxAge: 500,
    };

    const { result } = renderHook(() =>
      useOrderBlockDetection({
        candles,
        settings,
        fvgs: [],
      }),
    );

    const { breakers } = result.current;
    expect(breakers.length).toBeGreaterThan(0);
    const breaker = breakers[0];
    expect(breaker.type).toBe('bearish');
    expect(breaker.mitigated).toBe(true);
    expect(breaker.mitigationTime).toBe(2360);
  });

  it('mitigates and clears sweep markers for bearish OB after post-sweep close above invalidation boundary', () => {
    const candles: Candle[] = [
      // OB candle (bullish) -> candidate bearish OB zone: top=103, bottom=100
      candle(3000, 101, 103, 100, 102),
      // Bearish displacement to validate OB formation
      candle(3060, 102, 102.2, 99.2, 99.8),
      // Neutral progression
      candle(3120, 99.8, 100.5, 99.4, 100),
      // Full zone pass-through above OB top: open=99.0 < bottom=100, close=103.4 > top=103 (potential sweep/break)
      candle(3180, 99.0, 103.5, 98.8, 103.4),
      // Confirmation candle closes back inside -> marks sweep
      candle(3240, 102.8, 103, 101.7, 102.6),
      // Later close-through above invalidation boundary (open >= top avoids re-pass-through path)
      candle(3300, 103.2, 104, 103.1, 103.7),
    ];

    const settings = {
      ...DEFAULT_OB_SETTINGS,
      minDisplacementCandles: 1,
      minDisplacementPercent: 0.5,
      minBodyPercent: 10,
      maxAge: 500,
    };

    const { result } = renderHook(() =>
      useOrderBlockDetection({
        candles,
        settings,
        fvgs: [],
      }),
    );

    const { orderBlocks } = result.current;
    const bearishObs = orderBlocks.filter((ob: OrderBlock) => ob.type === 'bearish');
    expect(bearishObs.length).toBeGreaterThan(0);

    const ob = bearishObs[0];
    expect(ob.mitigated).toBe(true);
    expect(ob.mitigationPercent).toBe(100);
    expect(ob.mitigationTime).toBe(3300);

    // Sweep state should be cleared because the sweep failed and OB was invalidated.
    expect(ob.swept).toBe(false);
    expect(ob.sweepTime).toBeUndefined();
    expect(ob.sweepPrice).toBeUndefined();
    expect(ob.sweepIndex).toBeUndefined();
  });
});

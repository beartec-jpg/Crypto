import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOrderBlockDetection } from '@/hooks/useOrderBlockDetection';
import { DEFAULT_OB_SETTINGS } from '@/types/orderBlock';
import type { Candle } from '@/types/candle';
import type { OrderBlock } from '@/types/orderBlock';

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

    const bullishObs = result.current.filter((ob: OrderBlock) => ob.type === 'bullish');
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
    expect(ob.breaker).toBe(false);
  });

  it('preserves clean breaker conversion when there is no prior sweep', () => {
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

    const bullishObs = result.current.filter((ob: OrderBlock) => ob.type === 'bullish');
    expect(bullishObs.length).toBeGreaterThan(0);

    const ob = bullishObs[0];
    expect(ob.breaker).toBe(true);
    expect(ob.breakerType).toBe('bearish');
    expect(ob.conversionTime).toBe(2120);
    expect(ob.conversionPrice).toBeCloseTo(97.6, 6);

    // No prior sweep in this clean-break path.
    expect(ob.swept).toBe(false);
    expect(ob.mitigated).toBe(false);
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

    const bearishObs = result.current.filter((ob: OrderBlock) => ob.type === 'bearish');
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
    expect(ob.breaker).toBe(false);
  });
});

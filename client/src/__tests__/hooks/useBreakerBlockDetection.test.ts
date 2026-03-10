import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBreakerBlockDetection } from '@/hooks/useBreakerBlockDetection';
import { DEFAULT_BB_SETTINGS } from '@/types/breakerBlock';
import type { Candle } from '@/types/candle';
import type { OrderBlock } from '@/types/orderBlock';

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close, volume: 1000 };
}

/** Minimal unmitigated OrderBlock for testing */
function ob(
  id: string,
  type: 'bullish' | 'bearish',
  time: number,
  top: number,
  bottom: number,
): OrderBlock {
  return {
    id,
    type,
    time,
    top,
    bottom,
    extremeTop: top,
    extremeBottom: bottom,
    formationIndex: 0,
    age: 0,
    causedFVG: false,
    causedBOS: false,
    displacementStrength: 2,
    mitigated: false,
    mitigationPercent: 0,
    hasFVGConfluence: false,
    volume: 1000,
    volumeRatio: 1,
  } as OrderBlock;
}

const settings = { ...DEFAULT_BB_SETTINGS, enabled: true, maxAge: 500 };

describe('useBreakerBlockDetection – mitigation uses close-through, not wick-into', () => {
  /**
   * Bearish OB (supply zone top=103, bottom=100) → bullish breaker
   * once price closes above the top (without first trading inside the zone).
   *
   * Mitigation of the bullish breaker should require price to close BELOW
   * the bottom (100), not just wick through it.
   */
  it('bullish breaker (from bearish OB) is NOT mitigated by a wick below the bottom', () => {
    const orderBlocks = [ob('ob-bear', 'bearish', 1000, 103, 100)];

    const candles: Candle[] = [
      // The OB candle itself
      candle(1000, 102, 103, 100, 101),
      // Break candle: stays above the zone (low >= top), closes above top → creates bullish breaker
      candle(1060, 104, 105, 103.5, 104.5),
      // Wick below bottom but CLOSES inside the zone → must NOT mitigate
      candle(1120, 101, 102, 99, 101.5),
    ];

    const { result } = renderHook(() =>
      useBreakerBlockDetection({ candles, orderBlocks, settings }),
    );

    expect(result.current).toHaveLength(1);
    const bb = result.current[0];
    expect(bb.type).toBe('bullish');
    expect(bb.mitigated).toBe(false);
    expect(bb.mitigationTime).toBeUndefined();
  });

  it('bullish breaker (from bearish OB) IS mitigated when price closes BELOW the bottom', () => {
    const orderBlocks = [ob('ob-bear', 'bearish', 1000, 103, 100)];

    const candles: Candle[] = [
      candle(1000, 102, 103, 100, 101),
      // Break above zone → bullish breaker
      candle(1060, 104, 105, 103.5, 104.5),
      // Close below bottom → mitigates the breaker
      candle(1120, 100.5, 101, 98.5, 99.5),
    ];

    const { result } = renderHook(() =>
      useBreakerBlockDetection({ candles, orderBlocks, settings }),
    );

    expect(result.current).toHaveLength(1);
    const bb = result.current[0];
    expect(bb.type).toBe('bullish');
    expect(bb.mitigated).toBe(true);
    expect(bb.mitigationTime).toBe(1120);
  });

  /**
   * Bullish OB (demand zone top=103, bottom=100) → bearish breaker
   * once price closes below the bottom (without first trading inside the zone).
   *
   * Mitigation of the bearish breaker should require price to close ABOVE
   * the top (103), not just wick through it.
   */
  it('bearish breaker (from bullish OB) is NOT mitigated by a wick above the top', () => {
    const orderBlocks = [ob('ob-bull', 'bullish', 2000, 103, 100)];

    const candles: Candle[] = [
      // The OB candle itself
      candle(2000, 101, 103, 100, 102),
      // Break below zone: high <= bottom (100), closes below bottom → creates bearish breaker
      candle(2060, 99.5, 100, 97, 98),
      // Wick above top but CLOSES inside the zone → must NOT mitigate
      candle(2120, 101, 104, 100.5, 101.5),
    ];

    const { result } = renderHook(() =>
      useBreakerBlockDetection({ candles, orderBlocks, settings }),
    );

    expect(result.current).toHaveLength(1);
    const bb = result.current[0];
    expect(bb.type).toBe('bearish');
    expect(bb.mitigated).toBe(false);
    expect(bb.mitigationTime).toBeUndefined();
  });

  it('bearish breaker (from bullish OB) IS mitigated when price closes ABOVE the top', () => {
    const orderBlocks = [ob('ob-bull', 'bullish', 2000, 103, 100)];

    const candles: Candle[] = [
      candle(2000, 101, 103, 100, 102),
      // Break below zone → bearish breaker
      candle(2060, 99.5, 100, 97, 98),
      // Close above top → mitigates the breaker
      candle(2120, 102, 105, 101.5, 103.5),
    ];

    const { result } = renderHook(() =>
      useBreakerBlockDetection({ candles, orderBlocks, settings }),
    );

    expect(result.current).toHaveLength(1);
    const bb = result.current[0];
    expect(bb.type).toBe('bearish');
    expect(bb.mitigated).toBe(true);
    expect(bb.mitigationTime).toBe(2120);
  });

  it('does not create a breaker block if price traded inside the zone before the break', () => {
    const orderBlocks = [ob('ob-bull', 'bullish', 3000, 103, 100)];

    const candles: Candle[] = [
      candle(3000, 101, 103, 100, 102),
      // Trades inside zone (low < top, high > bottom) → sets tradedInside = true
      candle(3060, 101.5, 102.5, 99.5, 101),
      // Now closes below bottom, but tradedInside is already true → no break
      candle(3120, 99.5, 100, 97, 98),
    ];

    const { result } = renderHook(() =>
      useBreakerBlockDetection({ candles, orderBlocks, settings }),
    );

    expect(result.current).toHaveLength(0);
  });

  it('returns no breaker blocks when settings.enabled is false', () => {
    const orderBlocks = [ob('ob-bear', 'bearish', 4000, 103, 100)];

    const candles: Candle[] = [
      candle(4000, 102, 103, 100, 101),
      candle(4060, 104, 105, 103.5, 104.5),
    ];

    const disabledSettings = { ...settings, enabled: false };

    const { result } = renderHook(() =>
      useBreakerBlockDetection({ candles, orderBlocks, settings: disabledSettings }),
    );

    expect(result.current).toHaveLength(0);
  });

  it('ignores already-mitigated order blocks', () => {
    const mitigatedOb = { ...ob('ob-bear', 'bearish', 5000, 103, 100), mitigated: true };

    const candles: Candle[] = [
      candle(5000, 102, 103, 100, 101),
      candle(5060, 104, 105, 103.5, 104.5),
    ];

    const { result } = renderHook(() =>
      useBreakerBlockDetection({ candles, orderBlocks: [mitigatedOb], settings }),
    );

    expect(result.current).toHaveLength(0);
  });
});

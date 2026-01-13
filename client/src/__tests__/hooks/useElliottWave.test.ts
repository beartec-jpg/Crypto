import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElliottWave } from '@/hooks/useElliottWave';

describe('useElliottWave', () => {
  it('should initialize with idle mode and isActive false', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    
    expect(result.current.mode).toBe('idle');
    expect(result.current.isActive).toBe(false);
    expect(result.current.placedPoints).toEqual([]);
    expect(result.current.simulatedCandles).toEqual([]);
    expect(result.current.fibLevels).toEqual([]);
  });

  it('should activate mode and set isActive to true', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    
    act(() => {
      result.current.activateMode();
    });
    
    expect(result.current.mode).toBe('placing_w0');
    expect(result.current.isActive).toBe(true);
    expect(result.current.getStatusText()).toBe('Ready to place W0 - Click candle high/low');
  });

  it('should place W0 point and transition to placing_w1 mode', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    
    act(() => {
      result.current.activateMode();
    });
    
    act(() => {
      result.current.placePoint(1000000, 50000, true, 'candle');
    });
    
    expect(result.current.mode).toBe('placing_w1');
    expect(result.current.placedPoints).toHaveLength(1);
    expect(result.current.placedPoints[0]).toMatchObject({
      time: 1000000,
      price: 50000,
      snappedToHigh: true,
      label: 'W0'
    });
  });

  it('should place W1 point and generate Fibonacci levels', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
    });
    
    expect(result.current.mode).toBe('placing_w2');
    expect(result.current.placedPoints).toHaveLength(2);
    expect(result.current.fibLevels).toHaveLength(5); // 5 Fibonacci ratios
    expect(result.current.fibLevels.map(l => l.ratio)).toEqual([0.236, 0.382, 0.5, 0.618, 0.786]);
  });

  it('should place W2 on fib level and generate simulated candles', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      result.current.placePoint(3000000, 52500, false, 'fib'); // W2 on fib level
    });
    
    expect(result.current.mode).toBe('complete');
    expect(result.current.placedPoints).toHaveLength(3);
    expect(result.current.simulatedCandles.length).toBeGreaterThan(0);
  });

  it('should not generate simulated candles when W2 is placed on real candle', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      result.current.placePoint(3000000, 52500, false, 'candle'); // W2 on candle
    });
    
    expect(result.current.mode).toBe('complete');
    expect(result.current.placedPoints).toHaveLength(3);
    expect(result.current.simulatedCandles).toHaveLength(0);
  });

  it('should reset to initial state', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle');
      result.current.placePoint(2000000, 55000, true, 'candle');
    });
    
    expect(result.current.placedPoints).toHaveLength(2);
    
    act(() => {
      result.current.reset();
    });
    
    expect(result.current.mode).toBe('placing_w0');
    expect(result.current.placedPoints).toEqual([]);
    expect(result.current.fibLevels).toEqual([]);
  });

  it('should undo last point placement', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
    });
    
    expect(result.current.placedPoints).toHaveLength(2);
    expect(result.current.mode).toBe('placing_w2');
    expect(result.current.fibLevels.length).toBeGreaterThan(0);
    
    act(() => {
      result.current.undo();
    });
    
    expect(result.current.placedPoints).toHaveLength(1);
    expect(result.current.mode).toBe('placing_w1');
    expect(result.current.fibLevels).toEqual([]);
  });

  it('should deactivate mode and return to idle', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    
    act(() => {
      result.current.activateMode();
    });
    
    expect(result.current.isActive).toBe(true);
    
    act(() => {
      result.current.deactivateMode();
    });
    
    expect(result.current.mode).toBe('idle');
    expect(result.current.isActive).toBe(false);
  });

  it('should generate fewer candles for shorter W1→W2 time spans', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    const oneHourMs = 60 * 60 * 1000;
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      // W2 is 10 hours away from W1 - should generate ~10 candles
      result.current.placePoint(2000000 + (10 * oneHourMs), 52500, false, 'fib');
    });
    
    expect(result.current.mode).toBe('complete');
    expect(result.current.simulatedCandles.length).toBeGreaterThanOrEqual(10);
    expect(result.current.simulatedCandles.length).toBeLessThan(20);
  });

  it('should generate more candles for longer W1→W2 time spans', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    const oneHourMs = 60 * 60 * 1000;
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      // W2 is 100 hours away from W1 - should generate ~100 candles
      result.current.placePoint(2000000 + (100 * oneHourMs), 52500, false, 'fib');
    });
    
    expect(result.current.mode).toBe('complete');
    expect(result.current.simulatedCandles.length).toBeGreaterThanOrEqual(80);
    expect(result.current.simulatedCandles.length).toBeLessThanOrEqual(100);
  });

  it('should maintain ABC proportions regardless of candle count', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    const oneHourMs = 60 * 60 * 1000;
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      result.current.placePoint(2000000 + (50 * oneHourMs), 52500, false, 'fib');
    });
    
    const candles = result.current.simulatedCandles;
    expect(candles.length).toBeGreaterThan(0);
    
    // Find the labeled candles
    const waveAEndIndex = candles.findIndex(c => c.label === 'W2.A');
    const waveBEndIndex = candles.findIndex(c => c.label === 'W2.B');
    const waveCEndIndex = candles.findIndex(c => c.label === 'W2.C');
    
    expect(waveAEndIndex).toBeGreaterThan(-1);
    expect(waveBEndIndex).toBeGreaterThan(waveAEndIndex);
    expect(waveCEndIndex).toBe(candles.length - 1);
    
    // For flat pattern (50% retracement): Wave A should be roughly 30% of total
    const waveAPercent = (waveAEndIndex + 1) / candles.length;
    expect(waveAPercent).toBeGreaterThanOrEqual(0.25);
    expect(waveAPercent).toBeLessThan(0.40);
    
    // Wave B should be roughly 35% of total (flat pattern)
    const waveBPercent = (waveBEndIndex - waveAEndIndex) / candles.length;
    expect(waveBPercent).toBeGreaterThan(0.25);
    expect(waveBPercent).toBeLessThan(0.45);
  });

  it('should generate zigzag pattern for retracement below 50%', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    const oneHourMs = 60 * 60 * 1000;
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      // W2 at 38.2% retracement (should trigger zigzag)
      const w2Price = 55000 - (55000 - 50000) * 0.382;
      result.current.placePoint(2000000 + (50 * oneHourMs), w2Price, false, 'fib');
    });
    
    const candles = result.current.simulatedCandles;
    expect(candles.length).toBeGreaterThan(0);
    
    // Find the labeled candles
    const waveAEndIndex = candles.findIndex(c => c.label === 'W2.A');
    const waveBEndIndex = candles.findIndex(c => c.label === 'W2.B');
    
    // For zigzag pattern: Wave A should be roughly 40% of total
    const waveAPercent = (waveAEndIndex + 1) / candles.length;
    expect(waveAPercent).toBeGreaterThan(0.35);
    expect(waveAPercent).toBeLessThan(0.48);
    
    // Wave B should be roughly 20% of total (zigzag pattern - stays low)
    const waveBPercent = (waveBEndIndex - waveAEndIndex) / candles.length;
    expect(waveBPercent).toBeGreaterThan(0.15);
    expect(waveBPercent).toBeLessThan(0.28);
  });

  it('should generate flat pattern for retracement at or above 50%', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    const oneHourMs = 60 * 60 * 1000;
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      // W2 at 61.8% retracement (should trigger flat)
      const w2Price = 55000 - (55000 - 50000) * 0.618;
      result.current.placePoint(2000000 + (50 * oneHourMs), w2Price, false, 'fib');
    });
    
    const candles = result.current.simulatedCandles;
    expect(candles.length).toBeGreaterThan(0);
    
    // Find the labeled candles
    const waveAEndIndex = candles.findIndex(c => c.label === 'W2.A');
    const waveBEndIndex = candles.findIndex(c => c.label === 'W2.B');
    
    // For flat pattern: Wave A should be roughly 30% of total
    const waveAPercent = (waveAEndIndex + 1) / candles.length;
    expect(waveAPercent).toBeGreaterThanOrEqual(0.25);
    expect(waveAPercent).toBeLessThan(0.38);
    
    // Wave B should be roughly 35% of total (flat pattern - comes back high)
    const waveBPercent = (waveBEndIndex - waveAEndIndex) / candles.length;
    expect(waveBPercent).toBeGreaterThan(0.28);
    expect(waveBPercent).toBeLessThan(0.42);
  });

  it('should generate candles with proper OHLC values', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    const oneHourMs = 60 * 60 * 1000;
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      result.current.placePoint(2000000 + (50 * oneHourMs), 52500, false, 'fib');
    });
    
    const candles = result.current.simulatedCandles;
    
    // Every candle should have valid OHLC values
    for (const candle of candles) {
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      expect(candle.open).toBeGreaterThan(0);
      expect(candle.close).toBeGreaterThan(0);
      expect(candle.high).toBeGreaterThan(0);
      expect(candle.low).toBeGreaterThan(0);
    }
  });

  it('should generate candles with varying body sizes', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    const oneHourMs = 60 * 60 * 1000;
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      result.current.placePoint(2000000 + (50 * oneHourMs), 52500, false, 'fib');
    });
    
    const candles = result.current.simulatedCandles;
    
    // Calculate body sizes
    const bodySizes = candles.map(c => Math.abs(c.close - c.open));
    
    // There should be variation in body sizes (not all the same)
    const uniqueSizes = new Set(bodySizes.map(s => Math.round(s * 1000000)));
    expect(uniqueSizes.size).toBeGreaterThan(candles.length * 0.5); // At least 50% unique sizes
  });

  it('should include mix of bullish and bearish candles', () => {
    const { result } = renderHook(() => useElliottWave({ timeframe: '1h' }));
    const oneHourMs = 60 * 60 * 1000;
    
    act(() => {
      result.current.activateMode();
      result.current.placePoint(1000000, 50000, false, 'candle'); // W0
      result.current.placePoint(2000000, 55000, true, 'candle'); // W1
      result.current.placePoint(2000000 + (50 * oneHourMs), 52500, false, 'fib');
    });
    
    const candles = result.current.simulatedCandles;
    
    // Count bullish and bearish candles
    const bullishCount = candles.filter(c => c.close > c.open).length;
    const bearishCount = candles.filter(c => c.close < c.open).length;
    
    // Both types should exist
    expect(bullishCount).toBeGreaterThan(0);
    expect(bearishCount).toBeGreaterThan(0);
    
    // Neither should dominate completely (allow some flexibility)
    expect(bullishCount).toBeGreaterThan(candles.length * 0.1);
    expect(bearishCount).toBeGreaterThan(candles.length * 0.1);
  });
});

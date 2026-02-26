import { describe, it, expect } from 'vitest';
import { calculateSqueezeMomentum } from '@/lib/indicators/squeezeMomentum';
import type { CandleData } from '@/types/chart.types';

function makeCandles(count: number, basePrice = 100, volatility = 2): CandleData[] {
  return Array.from({ length: count }, (_, i) => ({
    time: 1000 + i * 60,
    open: basePrice,
    high: basePrice + volatility,
    low: basePrice - volatility,
    close: basePrice + (i % 3 === 0 ? 1 : -1),
    volume: 1000,
  }));
}

describe('calculateSqueezeMomentum', () => {
  it('returns empty array when not enough candles', () => {
    const result = calculateSqueezeMomentum(makeCandles(10), 20, 2.0, 20, 1.5);
    expect(result).toEqual([]);
  });

  it('returns results for sufficient candle data', () => {
    const result = calculateSqueezeMomentum(makeCandles(60), 20, 2.0, 20, 1.5);
    expect(result.length).toBeGreaterThan(0);
  });

  it('each result has required fields', () => {
    const result = calculateSqueezeMomentum(makeCandles(60), 20, 2.0, 20, 1.5);
    for (const r of result) {
      expect(typeof r.time).toBe('number');
      expect(typeof r.value).toBe('number');
      expect(typeof r.sqzOn).toBe('boolean');
      expect(typeof r.sqzOff).toBe('boolean');
      expect(['cyan', 'blue', 'red', 'yellow']).toContain(r.color);
    }
  });

  it('sqzOn and sqzOff are not both true simultaneously', () => {
    const result = calculateSqueezeMomentum(makeCandles(60), 20, 2.0, 20, 1.5);
    for (const r of result) {
      expect(r.sqzOn && r.sqzOff).toBe(false);
    }
  });

  it('assigns cyan color when momentum is positive and increasing', () => {
    // Create candles with steadily rising closes to produce increasing positive momentum
    const candles: CandleData[] = Array.from({ length: 60 }, (_, i) => ({
      time: 1000 + i * 60,
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101 + i,
      volume: 1000,
    }));
    const result = calculateSqueezeMomentum(candles, 20, 2.0, 20, 1.5);
    expect(result.length).toBeGreaterThan(0);
    // At least some bars should be cyan (positive and increasing)
    const hasCyan = result.some(r => r.color === 'cyan');
    expect(hasCyan).toBe(true);
  });

  it('uses custom parameters correctly', () => {
    const result10 = calculateSqueezeMomentum(makeCandles(60), 10, 2.0, 10, 1.5);
    const result20 = calculateSqueezeMomentum(makeCandles(60), 20, 2.0, 20, 1.5);
    // Different lengths should produce different result counts
    expect(result10.length).toBeGreaterThan(result20.length);
  });
});

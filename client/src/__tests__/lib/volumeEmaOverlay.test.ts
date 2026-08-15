import { describe, it, expect } from 'vitest';
import {
  calculateVolumeEmaOverlay,
  DEFAULT_VOLUME_EMA_OPTIONS,
  type VolumeEmaCandle,
} from '@/lib/indicators/volumeEmaOverlay';

function makeCandles(
  count: number,
  opts: { basePrice?: number; baseVol?: number; volFn?: (i: number) => number } = {},
): VolumeEmaCandle[] {
  const basePrice = opts.basePrice ?? 100;
  const baseVol = opts.baseVol ?? 1000;
  return Array.from({ length: count }, (_, i) => {
    const mid = basePrice + Math.sin(i / 5) * 2;
    const range = 2;
    return {
      time: 1_700_000_000 + i * 60,
      high: mid + range / 2,
      low: mid - range / 2,
      close: mid,
      volume: opts.volFn ? opts.volFn(i) : baseVol,
    };
  });
}

describe('calculateVolumeEmaOverlay', () => {
  it('returns empty when not enough candles for EMA + ATR', () => {
    expect(calculateVolumeEmaOverlay(makeCandles(10))).toEqual([]);
  });

  it('emits points once warm-up is complete', () => {
    // Need max(volEmaPeriod, atrPeriod+1) ≈ 20 bars min; use 60 for stable ATR
    const result = calculateVolumeEmaOverlay(makeCandles(60));
    expect(result.length).toBeGreaterThan(0);
    // First point should start around index max(19, 14) = 19
    expect(result.length).toBeLessThanOrEqual(60 - 19);
  });

  it('sits at mid when volume equals its EMA (flat volume)', () => {
    const candles = makeCandles(80, { baseVol: 5000 });
    const result = calculateVolumeEmaOverlay(candles);
    expect(result.length).toBeGreaterThan(10);

    // After warm-up on constant volume, ratio ≈ 1 → logRatio ≈ 0 → value ≈ mid
    for (const p of result.slice(-20)) {
      expect(p.ratio).toBeCloseTo(1, 5);
      expect(p.logRatio).toBeCloseTo(0, 5);
      expect(p.value).toBeCloseTo(p.mid, 5);
      expect(p.regime).toBe('neutral');
    }
  });

  it('plots above mid on volume spikes and below on dry volume', () => {
    const candles = makeCandles(80, {
      volFn: (i) => {
        if (i === 70) return 50_000; // spike ~10x
        if (i === 71) return 50; // dry
        return 1000;
      },
    });
    const result = calculateVolumeEmaOverlay(candles);
    const byTime = new Map(result.map((p) => [p.time, p]));

    const spike = byTime.get(candles[70].time);
    const dry = byTime.get(candles[71].time);
    expect(spike).toBeDefined();
    expect(dry).toBeDefined();
    expect(spike!.value).toBeGreaterThan(spike!.mid);
    expect(spike!.regime).toBe('elevated');
    expect(dry!.value).toBeLessThan(dry!.mid);
    expect(dry!.regime).toBe('dry');
  });

  it('clamps extreme ratios to ±clampSigmas', () => {
    // One-bar mega spike still lifts EMA(vol), so raw log2(r) is finite (~3–4).
    // Use a tight clamp so we assert the clamp path, not the raw log.
    const candles = makeCandles(80, {
      volFn: (i) => (i === 75 ? 1e12 : 1000),
    });
    const clampSigmas = 2;
    const result = calculateVolumeEmaOverlay(candles, { clampSigmas, k: 1 });
    const spike = result.find((p) => p.time === candles[75].time);
    expect(spike).toBeDefined();
    expect(spike!.logRatio).toBe(clampSigmas);
    expect(spike!.logRatio).toBeLessThanOrEqual(clampSigmas);
    expect(spike!.logRatio).toBeGreaterThanOrEqual(-clampSigmas);
    // At clamp: offset = clampSigmas * k * ATR
    expect(spike!.value).toBeCloseTo(spike!.mid + clampSigmas * spike!.atr, 5);
  });

  it('respects k multiplier', () => {
    const candles = makeCandles(80, {
      volFn: (i) => (i === 70 ? 4000 : 1000), // 4x ≈ log2 = 2
    });
    const k1 = calculateVolumeEmaOverlay(candles, { k: 1 });
    const k2 = calculateVolumeEmaOverlay(candles, { k: 2 });
    const p1 = k1.find((p) => p.time === candles[70].time)!;
    const p2 = k2.find((p) => p.time === candles[70].time)!;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    const off1 = p1.value - p1.mid;
    const off2 = p2.value - p2.mid;
    expect(off2 / off1).toBeCloseTo(2, 4);
  });

  it('uses defaults matching v1 spec', () => {
    expect(DEFAULT_VOLUME_EMA_OPTIONS).toEqual({
      volumeEmaPeriod: 20,
      atrPeriod: 14,
      k: 1,
      clampSigmas: 4,
    });
  });
});

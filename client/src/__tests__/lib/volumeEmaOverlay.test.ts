import { describe, it, expect } from 'vitest';
import {
  buildVolumeEmaSpikes,
  calculateVolumeEmaOverlay,
  DEFAULT_VOLUME_EMA_OPTIONS,
  elevatedLogMagnitude,
  formatVolumeEmaLabel,
  padBeyondWick,
  rollingSma,
  signedVolume,
  type VolumeEmaCandle,
} from '@/lib/indicators/volumeEmaOverlay';

function makeCandles(
  count: number,
  opts: {
    basePrice?: number;
    baseVol?: number;
    volFn?: (i: number) => number;
    biasFn?: (i: number) => 'bull' | 'bear';
  } = {},
): VolumeEmaCandle[] {
  const basePrice = opts.basePrice ?? 100;
  const baseVol = opts.baseVol ?? 1000;
  return Array.from({ length: count }, (_, i) => {
    const mid = basePrice + Math.sin(i / 5) * 2;
    const range = 2;
    const close = mid;
    const bias = opts.biasFn?.(i) ?? 'bull';
    const open = bias === 'bull' ? close - 0.3 : close + 0.3;
    return {
      time: 1_700_000_000 + i * 60,
      open,
      high: mid + range / 2,
      low: mid - range / 2,
      close,
      volume: opts.volFn ? opts.volFn(i) : baseVol,
    };
  });
}

describe('signedVolume', () => {
  it('is positive on bullish bars and negative on bearish', () => {
    const bull: VolumeEmaCandle = {
      time: 1,
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 1000,
    };
    const bear: VolumeEmaCandle = {
      time: 2,
      open: 11,
      high: 12,
      low: 9,
      close: 10,
      volume: 1000,
    };
    expect(signedVolume(bull)).toBeGreaterThan(0);
    expect(signedVolume(bear)).toBeLessThan(0);
  });
});

describe('rollingSma', () => {
  it('averages the last N values', () => {
    const sma = rollingSma([1, 2, 3, 4, 5], 3);
    expect(sma[0]).toBeCloseTo(1, 8);
    expect(sma[1]).toBeCloseTo(1.5, 8);
    expect(sma[2]).toBeCloseTo(2, 8); // (1+2+3)/3
    expect(sma[4]).toBeCloseTo(4, 8); // (3+4+5)/3
  });
});

describe('elevatedLogMagnitude / padBeyondWick', () => {
  it('log magnitude scales with ratio', () => {
    expect(elevatedLogMagnitude(1, 4)).toBe(0);
    expect(elevatedLogMagnitude(2, 4)).toBeCloseTo(1, 8);
    expect(elevatedLogMagnitude(4, 4)).toBeCloseTo(2, 8);
  });

  it('pad grows with magnitude', () => {
    expect(padBeyondWick(0, 10, 2, 0.9)).toBe(0);
    expect(padBeyondWick(2, 10, 2, 0.9)).toBeGreaterThan(padBeyondWick(1, 10, 2, 0.9));
  });
});

describe('calculateVolumeEmaOverlay (delta + lookback)', () => {
  it('returns empty when not enough candles', () => {
    expect(calculateVolumeEmaOverlay(makeCandles(10))).toEqual([]);
  });

  it('emits points once warm-up is complete', () => {
    const result = calculateVolumeEmaOverlay(makeCandles(60));
    expect(result.length).toBeGreaterThan(0);
  });

  it('drifts above mid under sustained buy volume', () => {
    const candles = makeCandles(100, {
      volFn: () => 2000,
      biasFn: () => 'bull',
    });
    const result = calculateVolumeEmaOverlay(candles, { lookback: 10, k: 1.5 });
    const last = result[result.length - 1];
    expect(last.value).toBeGreaterThan(last.mid);
    expect(last.regime).toBe('buy');
    expect(last.logRatio).toBeGreaterThan(0);
  });

  it('drifts below mid under sustained sell volume', () => {
    const candles = makeCandles(100, {
      volFn: () => 2000,
      biasFn: () => 'bear',
    });
    const result = calculateVolumeEmaOverlay(candles, { lookback: 10, k: 1.5 });
    const last = result[result.length - 1];
    expect(last.value).toBeLessThan(last.mid);
    expect(last.regime).toBe('sell');
    expect(last.logRatio).toBeLessThan(0);
  });

  it('longer lookback is smoother than short lookback on alternating flow', () => {
    const candles = makeCandles(120, {
      volFn: () => 3000,
      biasFn: (i) => (i % 2 === 0 ? 'bull' : 'bear'),
    });
    const short = calculateVolumeEmaOverlay(candles, { lookback: 3, k: 1.25 });
    const long = calculateVolumeEmaOverlay(candles, { lookback: 20, k: 1.25 });

    const pathJitter = (pts: typeof short) => {
      let s = 0;
      for (let i = 1; i < pts.length; i++) {
        s += Math.abs(pts[i].value - pts[i - 1].value);
      }
      return s;
    };

    expect(pathJitter(long)).toBeLessThan(pathJitter(short));
  });

  it('accepts legacy smoothPeriod as lookback alias', () => {
    const candles = makeCandles(80, { volFn: () => 2000, biasFn: () => 'bull' });
    const a = calculateVolumeEmaOverlay(candles, { lookback: 12 });
    const b = calculateVolumeEmaOverlay(candles, { smoothPeriod: 12 });
    expect(a.length).toBe(b.length);
    expect(a[a.length - 1].value).toBeCloseTo(b[b.length - 1].value, 8);
  });

  it('flags spikes on absolute volume while path stays delta-based', () => {
    const candles = makeCandles(80, {
      volFn: (i) => (i === 70 ? 50_000 : 1000),
      biasFn: (i) => (i === 70 ? 'bull' : i % 2 === 0 ? 'bull' : 'bear'),
    });
    const result = calculateVolumeEmaOverlay(candles, {
      lookback: 10,
      spikeRatio: 2,
    });
    const spike = result.find((p) => p.time === candles[70].time)!;
    expect(spike.spike).toBe('buy');
    expect(spike.ratio).toBeGreaterThanOrEqual(2);
    const spikes = buildVolumeEmaSpikes(candles, result, { spikeOffsetAtr: 0.85 });
    expect(spikes.some((s) => s.time === candles[70].time && s.direction === 'buy')).toBe(true);
  });

  it('formats label with delta strength', () => {
    expect(formatVolumeEmaLabel(1.4, 0.85)).toContain('Δ');
    expect(formatVolumeEmaLabel(null, null)).toBe('Vol EMA');
  });

  it('uses locked-in math defaults', () => {
    expect(DEFAULT_VOLUME_EMA_OPTIONS).toEqual({
      volumeEmaPeriod: 5,
      atrPeriod: 10,
      k: 2.7,
      wickClearAtr: 2,
      clampSigmas: 5.5,
      lookback: 52,
      spikeRatio: 3,
      spikeOffsetAtr: 3,
    });
  });
});

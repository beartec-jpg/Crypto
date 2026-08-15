import { describe, it, expect } from 'vitest';
import {
  buildVolumeEmaSpikes,
  calculateVolumeEmaOverlay,
  DEFAULT_VOLUME_EMA_OPTIONS,
  elevatedLogMagnitude,
  formatVolumeEmaLabel,
  padBeyondWick,
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

describe('calculateVolumeEmaOverlay (delta path)', () => {
  it('returns empty when not enough candles', () => {
    expect(calculateVolumeEmaOverlay(makeCandles(10))).toEqual([]);
  });

  it('emits points once warm-up is complete', () => {
    const result = calculateVolumeEmaOverlay(makeCandles(60));
    expect(result.length).toBeGreaterThan(0);
  });

  it('sits near mid when volume is flat and balanced', () => {
    // Alternating tiny body pressure cancels under smooth
    const candles = makeCandles(100, {
      baseVol: 5000,
      biasFn: (i) => (i % 2 === 0 ? 'bull' : 'bear'),
    });
    const result = calculateVolumeEmaOverlay(candles, { smoothPeriod: 14, k: 1.25 });
    const tail = result.slice(-15);
    for (const p of tail) {
      // Net delta near 0 → small offset vs mid
      expect(Math.abs(p.offset)).toBeLessThan(p.atr * 2.5);
    }
  });

  it('drifts above mid under sustained buy volume (no candle flip)', () => {
    const candles = makeCandles(100, {
      volFn: () => 2000,
      biasFn: () => 'bull',
    });
    const result = calculateVolumeEmaOverlay(candles, { smoothPeriod: 8, k: 1.5 });
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
    const result = calculateVolumeEmaOverlay(candles, { smoothPeriod: 8, k: 1.5 });
    const last = result[result.length - 1];
    expect(last.value).toBeLessThan(last.mid);
    expect(last.regime).toBe('sell');
    expect(last.logRatio).toBeLessThan(0);
  });

  it('does not flip full amplitude on alternating single candles', () => {
    // Strong alternating colors — path should stay smoother than raw signs
    const candles = makeCandles(120, {
      volFn: () => 3000,
      biasFn: (i) => (i % 2 === 0 ? 'bull' : 'bear'),
    });
    const smooth = calculateVolumeEmaOverlay(candles, { smoothPeriod: 14, k: 1.25 });
    // Count how many consecutive pairs reverse sign of offset
    let flips = 0;
    for (let i = 1; i < smooth.length; i++) {
      if (smooth[i].offset * smooth[i - 1].offset < 0) flips++;
    }
    // Raw alternating would flip nearly every bar; delta path should flip far less
    expect(flips).toBeLessThan(smooth.length * 0.35);
  });

  it('flags spikes on absolute volume while path stays delta-based', () => {
    const candles = makeCandles(80, {
      volFn: (i) => (i === 70 ? 50_000 : 1000),
      biasFn: (i) => (i === 70 ? 'bull' : i % 2 === 0 ? 'bull' : 'bear'),
    });
    const result = calculateVolumeEmaOverlay(candles, {
      smoothPeriod: 10,
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
    expect(formatVolumeEmaLabel(1.4, 0.85)).toContain('1.40×');
    expect(formatVolumeEmaLabel(null, null)).toBe('Vol EMA');
  });

  it('uses delta-mode defaults', () => {
    expect(DEFAULT_VOLUME_EMA_OPTIONS).toEqual({
      volumeEmaPeriod: 20,
      atrPeriod: 14,
      k: 1.25,
      wickClearAtr: 0.35,
      clampSigmas: 3,
      smoothPeriod: 14,
      spikeRatio: 2,
      spikeOffsetAtr: 0.85,
    });
  });
});

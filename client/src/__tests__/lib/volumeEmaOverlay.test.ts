import { describe, it, expect } from 'vitest';
import {
  buildVolumeEmaSpikes,
  calculateVolumeEmaOverlay,
  DEFAULT_VOLUME_EMA_OPTIONS,
  elevatedLogMagnitude,
  padBeyondWick,
  formatVolumeEmaLabel,
  type VolumeEmaCandle,
} from '@/lib/indicators/volumeEmaOverlay';

function makeCandles(
  count: number,
  opts: {
    basePrice?: number;
    baseVol?: number;
    volFn?: (i: number) => number;
    /** open relative to close: 'bull' close>open, 'bear' close<open */
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

describe('elevatedLogMagnitude', () => {
  it('is 0 at or below average volume', () => {
    expect(elevatedLogMagnitude(1, 4)).toBe(0);
    expect(elevatedLogMagnitude(0.5, 4)).toBe(0);
    expect(elevatedLogMagnitude(0.1, 4)).toBe(0);
  });

  it('scales with log2 for elevated multiples', () => {
    expect(elevatedLogMagnitude(2, 4)).toBeCloseTo(1, 8); // 2× → 1
    expect(elevatedLogMagnitude(4, 4)).toBeCloseTo(2, 8); // 4× → 2
    expect(elevatedLogMagnitude(8, 4)).toBeCloseTo(3, 8); // 8× → 3
  });

  it('clamps at clampSigmas', () => {
    expect(elevatedLogMagnitude(1e12, 2)).toBe(2);
  });
});

describe('padBeyondWick', () => {
  it('is 0 when magnitude is 0', () => {
    expect(padBeyondWick(0, 10, 2, 0.9)).toBe(0);
  });

  it('grows with magnitude so 4× pads more past the wick than 2×', () => {
    const atr = 10;
    const pad2x = padBeyondWick(1, atr, 2, 0.9);
    const pad4x = padBeyondWick(2, atr, 2, 0.9);
    expect(pad2x).toBeCloseTo((0.9 + 2) * atr, 5);
    expect(pad4x).toBeCloseTo((0.9 + 4) * atr, 5);
    expect(pad4x).toBeGreaterThan(pad2x);
  });
});

describe('calculateVolumeEmaOverlay', () => {
  it('returns empty when not enough candles for EMA + ATR', () => {
    expect(calculateVolumeEmaOverlay(makeCandles(10))).toEqual([]);
  });

  it('emits points once warm-up is complete', () => {
    const result = calculateVolumeEmaOverlay(makeCandles(60));
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(60 - 19);
  });

  it('sits at mid when volume equals its EMA (flat volume)', () => {
    const candles = makeCandles(80, { baseVol: 5000 });
    const result = calculateVolumeEmaOverlay(candles);
    expect(result.length).toBeGreaterThan(10);

    for (const p of result.slice(-20)) {
      expect(p.ratio).toBeCloseTo(1, 5);
      expect(p.logRatio).toBeCloseTo(0, 5);
      expect(p.offset).toBeCloseTo(0, 5);
      expect(p.value).toBeCloseTo(p.mid, 5);
      expect(p.regime).toBe('neutral');
      expect(p.spike).toBeNull();
    }
  });

  it('tracks back to mid on low volume', () => {
    const candles = makeCandles(100, {
      volFn: (i) => (i >= 70 && i <= 90 ? 50 : 1000), // dry stretch
      biasFn: () => 'bull',
    });
    const result = calculateVolumeEmaOverlay(candles, { smoothPeriod: 1 });
    const dry = result.find((p) => p.time === candles[80].time)!;
    expect(dry).toBeDefined();
    expect(dry.ratio).toBeLessThan(1);
    expect(dry.logRatio).toBe(0);
    expect(dry.value).toBeCloseTo(dry.mid, 5);
    expect(dry.regime).toBe('neutral');
  });

  it('moves above mid on high buy volume and below mid on high sell volume', () => {
    const candles = makeCandles(100, {
      volFn: (i) => {
        if (i >= 70 && i <= 76) return 4000; // ~4× → log2 ≈ 2
        if (i >= 85 && i <= 91) return 4000;
        return 1000;
      },
      biasFn: (i) => (i >= 70 && i <= 76 ? 'bull' : i >= 85 && i <= 91 ? 'bear' : 'bull'),
    });
    const result = calculateVolumeEmaOverlay(candles, { smoothPeriod: 1 });
    const byTime = new Map(result.map((p) => [p.time, p]));

    const buy = byTime.get(candles[73].time)!;
    const sell = byTime.get(candles[88].time)!;
    expect(buy.value).toBeGreaterThan(buy.mid);
    expect(buy.regime).toBe('buy');
    expect(buy.logRatio).toBeGreaterThan(0);
    expect(sell.value).toBeLessThan(sell.mid);
    expect(sell.regime).toBe('sell');
    expect(sell.logRatio).toBeLessThan(0);
  });

  it('moves further away as multiple increases (2× vs 4×)', () => {
    // Two separate series so EMA base stays near 1000 for each spike bar
    const candles2x = makeCandles(80, {
      volFn: (i) => (i === 70 ? 2000 : 1000),
      biasFn: () => 'bull',
    });
    const candles4x = makeCandles(80, {
      volFn: (i) => (i === 70 ? 4000 : 1000),
      biasFn: () => 'bull',
    });
    const p2 = calculateVolumeEmaOverlay(candles2x, { smoothPeriod: 1 }).find(
      (p) => p.time === candles2x[70].time,
    )!;
    const p4 = calculateVolumeEmaOverlay(candles4x, { smoothPeriod: 1 }).find(
      (p) => p.time === candles4x[70].time,
    )!;
    expect(p2).toBeDefined();
    expect(p4).toBeDefined();
    // 4× should sit further above mid than 2×
    expect(p4.offset).toBeGreaterThan(p2.offset);
    expect(p4.offset / p2.offset).toBeCloseTo(2, 0); // roughly double distance
  });

  it('clamps extreme elevated ratios and still clears wicks', () => {
    const candles = makeCandles(80, {
      volFn: (i) => (i === 75 ? 1e12 : 1000),
      biasFn: () => 'bull',
    });
    const clampSigmas = 2;
    const k = 1.75;
    const wickClearAtr = 0.65;
    const result = calculateVolumeEmaOverlay(candles, {
      clampSigmas,
      k,
      wickClearAtr,
      smoothPeriod: 1,
    });
    const spike = result.find((p) => p.time === candles[75].time);
    expect(spike).toBeDefined();
    expect(spike!.logRatio).toBe(clampSigmas);
    const expectedDist = (wickClearAtr + clampSigmas * k) * spike!.atr;
    expect(spike!.value).toBeCloseTo(spike!.mid + expectedDist, 5);
    // Above the high of the bar
    expect(spike!.value).toBeGreaterThan(candles[75].high);
  });

  it('places 4× sell volume well below the candle wick', () => {
    const candles = makeCandles(80, {
      volFn: (i) => (i === 70 ? 4000 : 1000),
      biasFn: () => 'bear',
    });
    const result = calculateVolumeEmaOverlay(candles, { smoothPeriod: 1 });
    const sell = result.find((p) => p.time === candles[70].time)!;
    expect(sell).toBeDefined();
    expect(sell.ratio).toBeGreaterThan(3);
    expect(sell.value).toBeLessThan(candles[70].low);
    // Comfortable clearance past the low (not hugging the wick)
    expect(candles[70].low - sell.value).toBeGreaterThan(sell.atr * 0.5);
  });

  it('respects k multiplier', () => {
    const candles = makeCandles(80, {
      volFn: (i) => (i === 70 ? 4000 : 1000),
      biasFn: () => 'bull',
    });
    const k1 = calculateVolumeEmaOverlay(candles, { k: 1, smoothPeriod: 1 });
    const k2 = calculateVolumeEmaOverlay(candles, { k: 2, smoothPeriod: 1 });
    const p1 = k1.find((p) => p.time === candles[70].time)!;
    const p2 = k2.find((p) => p.time === candles[70].time)!;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    const off1 = p1.value - p1.mid;
    const off2 = p2.value - p2.mid;
    expect(off2 / off1).toBeCloseTo(2, 4);
  });

  it('smoothPeriod damps single-bar volume spikes vs unsmoothed', () => {
    const candles = makeCandles(80, {
      volFn: (i) => (i === 70 ? 50_000 : 1000),
      biasFn: () => 'bull',
    });
    const raw = calculateVolumeEmaOverlay(candles, { smoothPeriod: 1 });
    const smooth = calculateVolumeEmaOverlay(candles, { smoothPeriod: 10 });
    const r = raw.find((p) => p.time === candles[70].time)!;
    const s = smooth.find((p) => p.time === candles[70].time)!;
    expect(r).toBeDefined();
    expect(s).toBeDefined();
    expect(Math.abs(s.offset)).toBeLessThan(Math.abs(r.offset));
  });

  it('default double-smooth is smoother than period-1 path', () => {
    const candles = makeCandles(100, {
      volFn: (i) => 1000 + (i % 3) * 800 + (i % 7 === 0 ? 5000 : 0),
      biasFn: (i) => (i % 2 === 0 ? 'bull' : 'bear'),
    });
    const jagged = calculateVolumeEmaOverlay(candles, { smoothPeriod: 1 });
    const smooth = calculateVolumeEmaOverlay(candles); // defaults
    const pathJitter = (pts: typeof jagged) => {
      let s = 0;
      for (let i = 1; i < pts.length; i++) {
        s += Math.abs(pts[i].value - pts[i - 1].value);
      }
      return s;
    };
    expect(pathJitter(smooth)).toBeLessThan(pathJitter(jagged));
  });

  it('flags buy/sell spikes at ≥2× volume EMA', () => {
    const candles = makeCandles(80, {
      volFn: (i) => (i === 70 || i === 71 ? 50_000 : 1000),
      biasFn: (i) => (i === 70 ? 'bull' : i === 71 ? 'bear' : 'bull'),
    });
    const result = calculateVolumeEmaOverlay(candles, { smoothPeriod: 1, spikeRatio: 2 });
    const buy = result.find((p) => p.time === candles[70].time)!;
    const sell = result.find((p) => p.time === candles[71].time)!;
    expect(buy.spike).toBe('buy');
    expect(buy.ratio).toBeGreaterThanOrEqual(2);
    expect(buy.value).toBeGreaterThan(buy.mid);
    expect(sell.spike).toBe('sell');
    expect(sell.ratio).toBeGreaterThanOrEqual(2);
    expect(sell.value).toBeLessThan(sell.mid);
  });

  it('places spike markers clear of the candle range', () => {
    const candles = makeCandles(80, {
      volFn: (i) => (i === 70 || i === 71 ? 50_000 : 1000),
      biasFn: (i) => (i === 70 ? 'bull' : 'bear'),
    });
    const points = calculateVolumeEmaOverlay(candles, { spikeRatio: 2 });
    const spikes = buildVolumeEmaSpikes(candles, points, { spikeOffsetAtr: 0.85 });
    expect(spikes.length).toBeGreaterThanOrEqual(2);

    const buy = spikes.find((s) => s.time === candles[70].time)!;
    const sell = spikes.find((s) => s.time === candles[71].time)!;
    expect(buy.direction).toBe('buy');
    expect(sell.direction).toBe('sell');
    expect(buy.markerPrice).toBeLessThan(candles[70].low);
    expect(sell.markerPrice).toBeGreaterThan(candles[71].high);
  });

  it('formats the Vol EMA label with the ratio reading', () => {
    expect(formatVolumeEmaLabel(1.42)).toBe('Vol EMA 1.42×');
    expect(formatVolumeEmaLabel(12.5)).toBe('Vol EMA 12.5×');
    expect(formatVolumeEmaLabel(null)).toBe('Vol EMA');
  });

  it('uses defaults matching v1 spec', () => {
    expect(DEFAULT_VOLUME_EMA_OPTIONS).toEqual({
      volumeEmaPeriod: 20,
      atrPeriod: 14,
      k: 1.75,
      wickClearAtr: 0.65,
      clampSigmas: 4,
      smoothPeriod: 10,
      spikeRatio: 2,
      spikeOffsetAtr: 0.85,
    });
  });
});

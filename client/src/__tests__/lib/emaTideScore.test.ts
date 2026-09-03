import { describe, it, expect } from 'vitest';
import { emaTideScore, findTideAccumZones, zigzagByLength, zigzagPrice, type TideZonePoint } from '@/lib/indicators/tideZone';

function pt(time: number, score: number): TideZonePoint {
  return {
    time,
    score,
    tide: 0.5,
    energy: 0.5,
    tape: 0.5,
    kind: 'neutral',
    tell: null,
  };
}

describe('emaTideScore', () => {
  it('lags a one-bar spike so early flips are damped', () => {
    const data = [pt(1, 0), pt(2, 0), pt(3, 80), pt(4, 0), pt(5, 0)];
    const ema = emaTideScore(data, 8);
    expect(ema).toHaveLength(5);
    expect(ema[2].value).toBeLessThan(80);
    expect(ema[2].value).toBeGreaterThan(0);
    expect(ema[4].value).toBeLessThan(ema[2].value);
  });

  it('returns empty for empty input', () => {
    expect(emaTideScore([], 8)).toEqual([]);
  });
});

describe('findTideAccumZones', () => {
  it('marks price LL + hist HL as confirmed accum', () => {
    const n = 40;
    const data: TideZonePoint[] = [];
    const candles: { time: number; low: number }[] = [];
    for (let i = 0; i < n; i++) {
      let score = 0;
      if (i <= 10) score = -5 * i;
      else if (i <= 18) score = -50 + 6 * (i - 10);
      else if (i <= 26) score = -2 + -3 * (i - 18);
      else score = -26 + 4 * (i - 26);
      data.push(pt(i + 1, score));
      let low = 100;
      if (i === 10) low = 50;
      else if (i === 9 || i === 11) low = 55;
      else if (i === 26) low = 40;
      else if (i === 25 || i === 27) low = 45;
      candles.push({ time: i + 1, low });
    }
    const zones = findTideAccumZones(candles, data, 1, 2);
    const confirmed = zones.filter((z) => z.status === 'confirmed');
    expect(confirmed.length).toBeGreaterThanOrEqual(1);
    expect(confirmed[0].price2).toBeLessThan(confirmed[0].price1);
    expect((confirmed[0].ema2 ?? 0) > (confirmed[0].ema1 ?? 0)).toBe(true);
    expect(confirmed[0].ema1).toBeLessThan(-10);
    expect(confirmed[0].ema2).toBeLessThan(-10);
    expect(confirmed[0].kind).toBe('div');
  });

  it('ignores wiggles on the neutral line', () => {
    const n = 40;
    const data: TideZonePoint[] = [];
    const candles: { time: number; low: number }[] = [];
    for (let i = 0; i < n; i++) {
      const score = i === 10 ? -4 : i === 26 ? -2 : 1;
      data.push(pt(i + 1, score));
      candles.push({ time: i + 1, low: i === 26 ? 90 : i === 10 ? 100 : 102 });
    }
    const zones = findTideAccumZones(candles, data, 1, 2);
    expect(zones.filter((z) => z.status === 'confirmed')).toHaveLength(0);
  });
});

describe('zigzagByLength', () => {
  it('alternates high and low on a two-leg dip', () => {
    const series: { time: number; value: number }[] = [];
    for (let i = 0; i < 30; i++) {
      let v = 0;
      if (i <= 8) v = -i;
      else if (i <= 16) v = -8 + (i - 8);
      else v = 0 - (i - 16);
      series.push({ time: i + 1, value: v });
    }
    const zz = zigzagByLength(series, 3);
    const types = zz.map((z) => z.type);
    for (let i = 1; i < types.length; i++) {
      expect(types[i]).not.toBe(types[i - 1]);
    }
    expect(zz.some((z) => z.type === 'low')).toBe(true);
    expect(zz.some((z) => z.type === 'high')).toBe(true);
  });

  it('builds a separate price zigzag from wicks', () => {
    const candles = [];
    for (let i = 0; i < 30; i++) {
      const low = i === 8 ? 10 : i === 22 ? 8 : 20;
      const high = i === 15 ? 40 : 22;
      candles.push({ time: i + 1, low, high });
    }
    const zz = zigzagPrice(candles, 3);
    const lows = zz.filter((z) => z.type === 'low');
    expect(lows.length).toBeGreaterThanOrEqual(2);
    expect(lows.some((z) => z.value === 10)).toBe(true);
    expect(lows.some((z) => z.value === 8)).toBe(true);
  });

  it('larger N produces fewer price zigzag lows', () => {
    const candles: { time: number; low: number; high: number }[] = [];
    for (let i = 0; i < 80; i++) {
      const wave = Math.sin(i / 3);
      candles.push({ time: i + 1, low: 100 + wave * 10, high: 110 + wave * 10 });
    }
    const short = zigzagPrice(candles, 3).filter((z) => z.type === 'low');
    const long = zigzagPrice(candles, 12).filter((z) => z.type === 'low');
    expect(long.length).toBeLessThan(short.length);
  });
});

import { describe, it, expect } from 'vitest';
import { analyzeSwoopGaps, barDelta, detectSwoopBuy, detectSwoopExit, wilderRsi } from '@/lib/indicators/swoopGapAnalysis';
import type { SwoopCandle } from '@/lib/indicators/swoop';
import type { SwoopSegment } from '@/types/swoop';

function c(i: number, o: number, h: number, l: number, cl: number, volume: number): SwoopCandle {
  return { time: 1_700_000_000 + i * 3600, open: o, high: h, low: l, close: cl, volume };
}

describe('barDelta', () => {
  it('is positive when the close is near the high', () => {
    expect(barDelta(c(0, 10, 12, 9, 11.8, 100))).toBeGreaterThan(0);
  });
  it('is negative when the close is near the low', () => {
    expect(barDelta(c(0, 10, 12, 9, 9.2, 100))).toBeLessThan(0);
  });
});

describe('wilderRsi', () => {
  it('rises when closes grind up', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 10 + i * 0.2);
    const rsi = wilderRsi(closes, 14);
    expect(rsi[29]).toBeGreaterThan(60);
  });
});

describe('analyzeSwoopGaps', () => {
  it('flags absorption when CVD rises while the high is still lower', () => {
    const candles: SwoopCandle[] = [];
    for (let i = 0; i < 40; i++) {
      // Grind down in price but close near the high (buyers absorbing)
      const high = 20 - i * 0.05;
      const low = high - 0.4;
      candles.push(c(i, low + 0.1, high, low, high - 0.05, 200));
    }
    const seg: SwoopSegment = {
      start: { index: 5, time: candles[5].time, price: candles[5].high },
      end: { index: 30, time: candles[30].time, price: candles[30].high },
      slope: (candles[30].high - candles[5].high) / 25,
      lengthBars: 25,
    };
    const stats = analyzeSwoopGaps(candles, [seg], []);
    expect(stats).toHaveLength(1);
    expect(stats[0].cvdChange).toBeGreaterThan(0);
    expect(stats[0].priceChangePct).toBeLessThan(0);
    expect(['absorption', 'divergence', 'demand']).toContain(stats[0].status);
    expect(stats[0].flags).toContain('cvd_vs_price');
    expect(stats[0].score).toBeGreaterThan(20);
  });

  it('marks markdown when price and CVD both fall', () => {
    const candles: SwoopCandle[] = [];
    for (let i = 0; i < 30; i++) {
      const high = 20 - i * 0.2;
      const low = high - 0.5;
      candles.push(c(i, high - 0.05, high, low, low + 0.05, 150));
    }
    const seg: SwoopSegment = {
      start: { index: 2, time: candles[2].time, price: candles[2].high },
      end: { index: 25, time: candles[25].time, price: candles[25].high },
      slope: (candles[25].high - candles[2].high) / 23,
      lengthBars: 23,
    };
    const stats = analyzeSwoopGaps(candles, [seg], []);
    expect(stats[0].cvdChange).toBeLessThan(0);
    expect(stats[0].status).toBe('markdown');
  });

  it('does not call selling when RSI holds and volume dries even if CVD falls', () => {
    const candles: SwoopCandle[] = [];
    for (let i = 0; i < 50; i++) {
      const high = 20 - i * 0.04;
      const low = high - 0.3;
      const vol = i < 20 ? 400 : 80;
      candles.push(c(i, low + 0.05, high, low, high - 0.02, vol));
    }
    const s1: SwoopSegment = {
      start: { index: 5, time: candles[5].time, price: candles[5].high },
      end: { index: 18, time: candles[18].time, price: candles[18].high },
      slope: (candles[18].high - candles[5].high) / 13,
      lengthBars: 13,
    };
    const s2: SwoopSegment = {
      start: { index: 18, time: candles[18].time, price: candles[18].high },
      end: { index: 40, time: candles[40].time, price: candles[40].high },
      slope: (candles[40].high - candles[18].high) / 22,
      lengthBars: 22,
    };
    const stats = analyzeSwoopGaps(candles, [s1, s2], []);
    expect(stats[1].status).not.toBe('markdown');
    expect(stats[1].flags.some((f) => f === 'vol_dry' || f === 'rsi_hold' || f === 'rsi_div')).toBe(true);
  });

  it('arms a BUY when RSI/vol tells fire and close breaks the last LH', () => {
    const highs = [
      { index: 10, time: 10, price: 1.02 },
      { index: 40, time: 40, price: 1.019 },
    ];
    const topStats = [
      {
        side: 'top' as const,
        gapIndex: 0,
        startTime: 10,
        endTime: 40,
        startPrice: 1.02,
        endPrice: 1.019,
        status: 'coil' as const,
        score: 60,
        priceChangePct: -0.001,
        slope: -0.00003,
        cvdChange: -1,
        volume: 100,
        volumeRatio: 0.4,
        avgRange: 0.01,
        rsiDelta: 2,
        rsiEnd: 55,
        stochEnd: 65,
        upVolShare: 0.4,
        bars: 30,
        flags: ['rsi_div', 'vol_dry', 'range_shrink', 'equal_high', 'flattening'],
        meanClose: 1.01,
        downVol: 60,
      },
    ];
    const armed = detectSwoopBuy('swoop', highs, topStats, 1.019, 50);
    expect(armed?.armed).toBe(true);
    expect(armed?.triggered).toBe(false);
    const fired = detectSwoopBuy('swoop', highs, topStats, 1.022, 51);
    expect(fired?.triggered).toBe(true);
    expect(fired?.tells).toEqual(expect.arrayContaining(['RSI vs LH', 'vol dry', 'squeeze', 'LH flat']));
  });

  it('arms an oversold-reclaim BUY when last LH is flushed and close reclaims it', () => {
    const highs = [
      { index: 10, time: 10, price: 1.186 },
      { index: 40, time: 40, price: 1.158 },
    ];
    const topStats = [
      {
        side: 'top' as const,
        gapIndex: 0,
        startTime: 10,
        endTime: 40,
        startPrice: 1.186,
        endPrice: 1.158,
        status: 'markdown' as const,
        score: 12,
        priceChangePct: -0.024,
        slope: -0.001,
        cvdChange: -10,
        volume: 200,
        volumeRatio: 1.2,
        avgRange: 0.02,
        rsiDelta: -8,
        rsiEnd: 46,
        stochEnd: 8.5,
        upVolShare: 0.4,
        bars: 30,
        flags: ['oversold', 'stoch_os'],
        meanClose: 1.14,
        downVol: 120,
      },
    ];
    const armed = detectSwoopBuy('swoop', highs, topStats, 1.15, 50);
    expect(armed?.armed).toBe(true);
    expect(armed?.triggered).toBe(false);
    expect(armed?.reason).toMatch(/oversold reclaim/);
    const fired = detectSwoopBuy('down_compression', highs, topStats, 1.17, 51);
    expect(fired?.triggered).toBe(true);
    expect(fired?.reason).toMatch(/oversold reclaim/);
  });

  it('prefers completing-swoop over oversold reclaim when both could apply', () => {
    const highs = [
      { index: 10, time: 10, price: 1.08 },
      { index: 40, time: 40, price: 1.05 },
    ];
    const topStats = [
      {
        side: 'top' as const,
        gapIndex: 0,
        startTime: 10,
        endTime: 40,
        startPrice: 1.02,
        endPrice: 1.019,
        status: 'coil' as const,
        score: 60,
        priceChangePct: -0.001,
        slope: -0.00003,
        cvdChange: -1,
        volume: 100,
        volumeRatio: 0.4,
        avgRange: 0.01,
        rsiDelta: 2,
        rsiEnd: 48,
        stochEnd: 18,
        upVolShare: 0.4,
        bars: 30,
        flags: ['rsi_div', 'vol_dry', 'range_shrink', 'equal_high', 'flattening', 'oversold', 'stoch_os'],
        meanClose: 1.01,
        downVol: 60,
      },
    ];
    const fired = detectSwoopBuy('swoop', highs, topStats, 1.053, 51);
    expect(fired?.triggered).toBe(true);
    expect(fired?.reason).not.toMatch(/oversold reclaim/);
    expect(fired?.tells).toEqual(expect.arrayContaining(['RSI vs LH', 'vol dry']));
  });

  it('does not arm BUY on a channel', () => {
    const highs = [
      { index: 10, time: 10, price: 1.186 },
      { index: 40, time: 40, price: 1.158 },
    ];
    const topStats = [
      {
        side: 'top' as const,
        gapIndex: 0,
        startTime: 10,
        endTime: 40,
        startPrice: 1.186,
        endPrice: 1.158,
        status: 'markdown' as const,
        score: 12,
        priceChangePct: -0.024,
        slope: -0.001,
        cvdChange: -10,
        volume: 200,
        volumeRatio: 1.2,
        avgRange: 0.02,
        rsiDelta: -8,
        rsiEnd: 46,
        stochEnd: 8.5,
        upVolShare: 0.4,
        bars: 30,
        flags: ['oversold', 'stoch_os'],
        meanClose: 1.14,
        downVol: 120,
      },
    ];
    expect(detectSwoopBuy('channel', highs, topStats, 1.17, 51)).toBeNull();
  });

  it('does not arm completing without last-gap squeeze or test', () => {
    const highs = [
      { index: 10, time: 10, price: 1.02 },
      { index: 40, time: 40, price: 1.019 },
    ];
    const topStats = [
      {
        side: 'top' as const,
        gapIndex: 0,
        startTime: 10,
        endTime: 40,
        startPrice: 1.02,
        endPrice: 1.019,
        status: 'coil' as const,
        score: 60,
        priceChangePct: -0.001,
        slope: -0.00003,
        cvdChange: -1,
        volume: 100,
        volumeRatio: 0.4,
        avgRange: 0.01,
        rsiDelta: 2,
        rsiEnd: 55,
        stochEnd: 65,
        upVolShare: 0.4,
        bars: 30,
        flags: ['rsi_div', 'vol_dry', 'equal_high', 'flattening'],
        meanClose: 1.01,
        downVol: 60,
      },
    ];
    const r = detectSwoopBuy('swoop', highs, topStats, 1.022, 51);
    expect(r?.armed).toBe(false);
    expect(r?.triggered).toBe(false);
    const live = detectSwoopBuy('swoop', highs, topStats, 1.022, 51, true);
    expect(live?.armed).toBe(true);
    expect(live?.triggered).toBe(true);
    expect(live?.tells).toEqual(expect.arrayContaining(['release']));
  });

  it('arms completing when last gap is a low-vol test even without range_shrink', () => {
    const highs = [
      { index: 10, time: 10, price: 1.02 },
      { index: 40, time: 40, price: 1.019 },
    ];
    const topStats = [
      {
        side: 'top' as const,
        gapIndex: 0,
        startTime: 10,
        endTime: 40,
        startPrice: 1.02,
        endPrice: 1.019,
        status: 'test' as const,
        score: 40,
        priceChangePct: -0.001,
        slope: -0.00003,
        cvdChange: -1,
        volume: 80,
        volumeRatio: 0.4,
        avgRange: 0.01,
        rsiDelta: 0.2,
        rsiEnd: 55,
        stochEnd: 65,
        upVolShare: 0.4,
        bars: 30,
        flags: ['rsi_hold', 'vol_dry', 'flattening'],
        meanClose: 1.01,
        downVol: 50,
      },
    ];
    const fired = detectSwoopBuy('swoop', highs, topStats, 1.022, 51);
    expect(fired?.armed).toBe(true);
    expect(fired?.triggered).toBe(true);
    expect(fired?.tells).toEqual(expect.arrayContaining(['RSI vs LH', 'vol dry', 'test']));
  });

  it('does not arm completing on a markdown last gap; oversold reclaim still can', () => {
    const highs = [
      { index: 10, time: 10, price: 1.08 },
      { index: 40, time: 40, price: 1.05 },
    ];
    const completingOnMarkdown = {
      side: 'top' as const,
      gapIndex: 0,
      startTime: 10,
      endTime: 40,
      startPrice: 1.08,
      endPrice: 1.05,
      status: 'markdown' as const,
      score: 20,
      priceChangePct: -0.028,
      slope: -0.001,
      cvdChange: -10,
      volume: 200,
      volumeRatio: 0.4,
      avgRange: 0.02,
      rsiDelta: 2,
      rsiEnd: 55,
      stochEnd: 65,
      upVolShare: 0.4,
      bars: 30,
      flags: ['rsi_div', 'vol_dry', 'range_shrink', 'flattening'],
      meanClose: 1.04,
      downVol: 120,
    };
    const blocked = detectSwoopBuy('swoop', highs, [completingOnMarkdown], 1.053, 51);
    expect(blocked?.armed).toBe(false);
    expect(blocked?.reason).toBe('markdown');

    const flushed = { ...completingOnMarkdown, rsiEnd: 46, stochEnd: 8.5, flags: ['rsi_div', 'vol_dry', 'range_shrink', 'oversold', 'stoch_os'] };
    const reclaim = detectSwoopBuy('swoop', highs, [flushed], 1.053, 51);
    expect(reclaim?.armed).toBe(true);
    expect(reclaim?.reason).toMatch(/oversold reclaim/);
  });
});

describe('detectSwoopExit', () => {
  const buy = {
    armed: true,
    triggered: true,
    time: 50,
    price: 1.02,
    reason: 'vol dry + squeeze',
    tells: ['vol dry', 'squeeze'],
  };
  const lastH = { index: 20, time: 20, price: 1.02 };

  it('does not arm until BUY has triggered', () => {
    const candles = Array.from({ length: 40 }, (_, i) => c(i, 1, 1.01, 0.99, 1, 100));
    expect(detectSwoopExit(candles, lastH, { ...buy, triggered: false })).toBeNull();
    expect(detectSwoopExit(candles, lastH, null)).toBeNull();
  });

  it('exits when close falls back through the last LH', () => {
    const candles = Array.from({ length: 40 }, (_, i) => {
      const px = i < 25 ? 1.04 : 1.01;
      return c(i, px, px + 0.005, px - 0.005, i === 39 ? 1.018 : px, 100);
    });
    candles[39] = c(39, 1.02, 1.022, 1.015, 1.016, 100);
    const sell = detectSwoopExit(candles, lastH, buy);
    expect(sell?.triggered).toBe(true);
    expect(sell?.kind).toBe('fail');
    expect(sell?.reason).toMatch(/last LH/);
  });

  it('waits while the long is still above the last LH without exhaustion', () => {
    const candles = Array.from({ length: 40 }, (_, i) => c(i, 1.03, 1.035, 1.025, 1.03, 100));
    const sell = detectSwoopExit(candles, lastH, buy);
    expect(sell?.armed).toBe(true);
    expect(sell?.triggered).toBe(false);
    expect(sell?.reason).toMatch(/wait exhaustion/);
  });
});

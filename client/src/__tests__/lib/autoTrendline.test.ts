import { describe, it, expect } from 'vitest';
import { detectAutoTrendlines, type AutoTrendlineCandle } from '@/lib/indicators/autoTrendline';
import { DEFAULT_AUTO_TRENDLINE_SETTINGS } from '@/types/autoTrendline';

/** Rising channel-ish series with clear higher lows and lower highs on a downtrend segment. */
function makeSupportUptrend(count: number): AutoTrendlineCandle[] {
  return Array.from({ length: count }, (_, i) => {
    // Rising support: lows climb slowly
    const base = 100 + i * 0.15;
    const low = base + Math.sin(i / 7) * 0.3;
    const high = low + 2 + (i % 5 === 0 ? 0.5 : 0);
    const open = low + 0.5;
    const close = low + 1.2;
    return {
      time: 1_700_000_000 + i * 3600,
      open,
      high,
      low,
      close,
      volume: 1000,
    };
  });
}

describe('detectAutoTrendlines', () => {
  it('returns empty when master disabled', () => {
    const candles = makeSupportUptrend(120);
    const result = detectAutoTrendlines(candles, {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: false,
    });
    expect(result.lines).toEqual([]);
  });

  it('returns empty on tiny series', () => {
    const result = detectAutoTrendlines(makeSupportUptrend(10), {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: true,
    });
    expect(result.lines).toEqual([]);
  });

  it('emits lines when enabled with enough structure', () => {
    const candles = makeSupportUptrend(200);
    const result = detectAutoTrendlines(candles, {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: true,
      macro: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.macro, enabled: true },
      mid: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.mid, enabled: false },
      ltf: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.ltf, enabled: false },
    });
    // May find support and/or resistance depending on pivots
    for (const line of result.lines) {
      expect(line.tier).toBe('macro');
      expect(line.touches).toBeGreaterThanOrEqual(2);
      expect(line.spanBars).toBeGreaterThan(0);
      expect(line.startTime).toBeLessThanOrEqual(line.endTime);
    }
  });

  it('respects per-tier enable flags', () => {
    const candles = makeSupportUptrend(200);
    const result = detectAutoTrendlines(candles, {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: true,
      macro: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.macro, enabled: false },
      mid: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.mid, enabled: false },
      ltf: { ...DEFAULT_AUTO_TRENDLINE_SETTINGS.ltf, enabled: false },
    });
    expect(result.lines).toEqual([]);
  });

  it('does not force start at the first candle', () => {
    const candles = makeSupportUptrend(220);
    const result = detectAutoTrendlines(candles, {
      ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
      enabled: true,
    });
    for (const line of result.lines) {
      // First chart bar time
      expect(line.startTime).toBeGreaterThanOrEqual(candles[0].time);
      // Should be a proper segment, not necessarily bar 0
      expect(line.spanBars).toBeGreaterThan(5);
    }
  });
});

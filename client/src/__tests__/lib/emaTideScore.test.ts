import { describe, it, expect } from 'vitest';
import { emaTideScore, type TideZonePoint } from '@/lib/indicators/tideZone';

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

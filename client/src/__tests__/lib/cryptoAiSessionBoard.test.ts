import { describe, expect, it } from 'vitest';

import {
  buildSessionBoardSections,
  mapSnapshotsBySession,
  parseKlinesToCandles,
} from '@/lib/cryptoAiSessionBoard';
import {
  encodeCryptoAiPairInterval,
  getCryptoAiCycleSession,
  isCryptoAiCacheFresh,
  normalizeCryptoAiPair,
} from '@shared/cryptoAiConfig';

describe('crypto AI pair config', () => {
  it('normalizes invalid stored timeframe pairs back to the launch default', () => {
    expect(normalizeCryptoAiPair('4h', '15m')).toEqual({
      higherTimeframe: '1d',
      lowerTimeframe: '15m',
    });
  });

  it('encodes valid pair cache intervals', () => {
    expect(encodeCryptoAiPairInterval('1w', '1h')).toBe('1w_1h');
  });

  it('marks cache rows fresh inside the current session cycle', () => {
    const now = new Date('2026-07-16T14:00:00.000Z');
    expect(getCryptoAiCycleSession(now)).toBe('new_york');
    expect(isCryptoAiCacheFresh('2026-07-16T13:05:00.000Z', now)).toBe(true);
    expect(isCryptoAiCacheFresh('2026-07-16T05:55:00.000Z', now)).toBe(false);
  });
});

describe('crypto AI session board helpers', () => {
  it('maps the latest snapshot per session', () => {
    const snapshots = [
      { session: 'asia', label: 'Asia', generatedAt: '2026-07-16T23:00:00.000Z', higherTimeframe: '1d', lowerTimeframe: '15m', multiTFInsights: null },
      { session: 'asia', label: 'Asia', generatedAt: '2026-07-15T23:00:00.000Z', higherTimeframe: '1d', lowerTimeframe: '15m', multiTFInsights: null },
      { session: 'london', label: 'London', generatedAt: '2026-07-16T06:00:00.000Z', higherTimeframe: '1d', lowerTimeframe: '15m', multiTFInsights: null },
    ];

    const mapped = mapSnapshotsBySession(snapshots);
    expect(mapped.asia?.generatedAt).toBe('2026-07-16T23:00:00.000Z');
    expect(mapped.london?.generatedAt).toBe('2026-07-16T06:00:00.000Z');
    expect(mapped.new_york).toBeNull();
  });

  it('builds three board sections from lower-timeframe candles', () => {
    const base = Date.UTC(2026, 6, 16, 0, 0, 0, 0);
    const klines = Array.from({ length: 96 }, (_, index) => {
      const openTime = base + index * 15 * 60 * 1000;
      const open = 100 + index * 0.1;
      const close = open + (index % 2 === 0 ? 0.05 : -0.03);
      return [openTime, `${open}`, `${open + 0.2}`, `${open - 0.2}`, `${close}`, `${1000 + index}`];
    });

    const candles = parseKlinesToCandles(klines);
    const sections = buildSessionBoardSections(candles, [], new Date('2026-07-16T18:00:00.000Z'));

    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.session)).toEqual(['asia', 'london', 'new_york']);
    expect(sections.every((section) => typeof section.metrics.handoff === 'string')).toBe(true);
  });
});

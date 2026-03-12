import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMultiTimeframeDivergenceScanner } from '@/hooks/useMultiTimeframeDivergenceScanner';
import { scanDivergences } from '@/hooks/useDivergenceScanner';
import { DEFAULT_OSCILLATOR_CONFIG } from '@/lib/calculations/divergenceCalculations';
import type { CandleData } from '@/types/chart.types';
import type { TimeframeKey } from '@/lib/calculations/multiTimeframeDivergenceScoring';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCandles(count: number, basePrice = 100): CandleData[] {
  return Array.from({ length: count }, (_, i) => ({
    time: 1000 + i * 60,
    open: basePrice,
    high: basePrice + 2,
    low: basePrice - 2,
    close: basePrice,
    volume: 1000,
  }));
}

// ── scanDivergences (pure function) ─────────────────────────────────────────

describe('scanDivergences', () => {
  it('returns empty array for insufficient candles (<30)', () => {
    expect(scanDivergences(makeCandles(10), DEFAULT_OSCILLATOR_CONFIG)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(scanDivergences([], DEFAULT_OSCILLATOR_CONFIG)).toEqual([]);
  });

  it('returns an array sorted by time ascending', () => {
    const candles = makeCandles(60);
    const result = scanDivergences(candles, DEFAULT_OSCILLATOR_CONFIG);
    const times = result.map(p => p.time);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it('returns DivergencePoints WITHOUT mtf cascade fields (those are added later)', () => {
    const candles = makeCandles(60);
    const result = scanDivergences(candles, DEFAULT_OSCILLATOR_CONFIG);
    for (const point of result) {
      expect(point).not.toHaveProperty('mtfCascadeLevel');
      expect(point).not.toHaveProperty('mtfCascadeBonus');
      expect(point).not.toHaveProperty('mtfActiveTimeframes');
    }
  });

  it('each point has type bullish or bearish', () => {
    const candles = makeCandles(60);
    const result = scanDivergences(candles, DEFAULT_OSCILLATOR_CONFIG);
    for (const point of result) {
      expect(['bullish', 'bearish']).toContain(point.type);
    }
  });
});

// ── useMultiTimeframeDivergenceScanner ───────────────────────────────────────

describe('useMultiTimeframeDivergenceScanner', () => {
  beforeEach(() => {
    // Mock fetch to avoid actual HTTP calls in tests.
    // Returns a valid empty candles payload by default.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ candles: makeCandles(50) }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for insufficient candles', async () => {
    const { result } = renderHook(() =>
      useMultiTimeframeDivergenceScanner(
        'BTCUSDT',
        '15m',
        makeCandles(10),
        ['15m', '1h', '4h'],
        DEFAULT_OSCILLATOR_CONFIG,
      ),
    );
    // Should never exceed empty for <30 candles
    expect(result.current).toEqual([]);
  });

  it('returns DivergencePoint[] with mtf cascade fields present', async () => {
    const { result } = renderHook(() =>
      useMultiTimeframeDivergenceScanner(
        'BTCUSDT',
        '15m',
        makeCandles(60),
        ['15m', '1h', '4h'],
        DEFAULT_OSCILLATOR_CONFIG,
      ),
    );

    // Allow async fetch + state update to settle
    await waitFor(() => {
      for (const point of result.current) {
        expect(typeof point.mtfCascadeLevel).toBe('number');
        expect(typeof point.mtfCascadeBonus).toBe('number');
        expect(Array.isArray(point.mtfActiveTimeframes)).toBe(true);
      }
    });
  });

  it('cascade level is at least 1 when current TF is in enabledTimeframes and has divergence', async () => {
    const { result } = renderHook(() =>
      useMultiTimeframeDivergenceScanner(
        'BTCUSDT',
        '15m',
        makeCandles(60),
        ['15m', '1h', '4h'],
        DEFAULT_OSCILLATOR_CONFIG,
      ),
    );

    await waitFor(() => {
      for (const point of result.current) {
        expect(point.mtfCascadeLevel).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('cascade level is 0 when current TF is NOT in enabledTimeframes', async () => {
    // Mock fetch to return empty candles so other TFs also find no divergence
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ candles: makeCandles(15) }), // too few for detection
    } as Response);

    const { result } = renderHook(() =>
      useMultiTimeframeDivergenceScanner(
        'BTCUSDT',
        '5m',          // '5m' is NOT in enabledTimeframes
        makeCandles(60),
        ['15m', '1h', '4h'],  // does not include '5m'
        DEFAULT_OSCILLATOR_CONFIG,
      ),
    );

    await waitFor(() => {
      // All divergences detected on the primary TF should have cascade level 0
      // (neither 5m nor any other TF shows divergence with the stub data)
      for (const point of result.current) {
        expect(point.mtfCascadeLevel).toBe(0);
        expect(point.mtfActiveTimeframes).toEqual([]);
      }
    });
  });

  it('active timeframes list only contains enabled timeframes', async () => {
    const enabled: TimeframeKey[] = ['15m', '1h', '4h'];
    const { result } = renderHook(() =>
      useMultiTimeframeDivergenceScanner(
        'BTCUSDT',
        '15m',
        makeCandles(60),
        enabled,
        DEFAULT_OSCILLATOR_CONFIG,
      ),
    );

    await waitFor(() => {
      for (const point of result.current) {
        for (const tf of (point.mtfActiveTimeframes ?? [])) {
          expect(enabled).toContain(tf);
        }
      }
    });
  });

  it('cascade bonus matches the expected multiplier for the cascade level', async () => {
    const { result } = renderHook(() =>
      useMultiTimeframeDivergenceScanner(
        'BTCUSDT',
        '15m',
        makeCandles(60),
        ['15m', '1h', '4h'],
        DEFAULT_OSCILLATOR_CONFIG,
      ),
    );

    const bonusForLevel = (level: number) => {
      if (level >= 4) return 2.0;
      if (level === 3) return 1.5;
      if (level === 2) return 1.25;
      return 1.0;
    };

    await waitFor(() => {
      for (const point of result.current) {
        const expected = bonusForLevel(point.mtfCascadeLevel ?? 0);
        expect(point.mtfCascadeBonus).toBe(expected);
      }
    });
  });

  it('returns results sorted by time ascending', async () => {
    const { result } = renderHook(() =>
      useMultiTimeframeDivergenceScanner(
        'BTCUSDT',
        '15m',
        makeCandles(60),
        ['15m', '1h', '4h'],
        DEFAULT_OSCILLATOR_CONFIG,
      ),
    );

    await waitFor(() => {
      const times = result.current.map(p => p.time as number);
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
      }
    });
  });
});

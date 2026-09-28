import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { calculateTideZone, type TideZoneCandle } from '@/lib/indicators/tideZone';
import { computeTideV2, type TideV2Result } from '@/lib/indicators/tideSignals';
import { buildTideOverlay, summarizeTide, useTideV2 } from '@/hooks/useTideV2';
import { DEFAULT_TIDE_ZONE_SETTINGS, TIDE_PRESETS } from '@/types/tideZoneSettings';
import fx4h from '../lib/fixtures/tide_btc_4h.json';

const candles: TideZoneCandle[] = (fx4h as { candles: number[][] }).candles.map(([time, open, high, low, close, volume]) => ({
  time,
  open,
  high,
  low,
  close,
  volume,
}));

describe('useTideV2', () => {
  it('returns nothing off 1h/4h or when Tide is not enabled', () => {
    const tideZone = calculateTideZone(candles);
    const base = { candles, tideZone, settings: DEFAULT_TIDE_ZONE_SETTINGS, seriesKey: 'BTCUSDT_15m' };
    expect(renderHook(() => useTideV2({ ...base, timeframe: null, enabled: true })).result.current).toBeNull();
    expect(renderHook(() => useTideV2({ ...base, timeframe: '4h', enabled: false })).result.current).toBeNull();
  });

  it('keeps signals already shown when the loaded window shifts', () => {
    const tideZone = calculateTideZone(candles);
    const { result, rerender } = renderHook((props: { c: TideZoneCandle[] }) =>
      useTideV2({
        candles: props.c,
        tideZone: calculateTideZone(props.c),
        timeframe: '4h',
        settings: DEFAULT_TIDE_ZONE_SETTINGS,
        seriesKey: 'BTCUSDT_4h',
        enabled: true,
      }),
    { initialProps: { c: candles } });
    const first = result.current!.signals.map((s) => s.confirmTime);
    expect(first.length).toBeGreaterThan(0);
    // Start the window just before the first signal's first low: its bars are still loaded, but
    // Tide needs ~70 bars of warm-up, so a fresh pass on this window can no longer see it.
    const s0 = result.current!.signals[0];
    const cut = candles.findIndex((c) => c.time >= s0.pivot1Time) - 5;
    const shifted = candles.slice(cut);
    const fresh = computeTideV2(shifted, calculateTideZone(shifted), TIDE_PRESETS['4h'], { warmupBars: 0 });
    expect(fresh.signals.map((s) => s.confirmTime)).not.toContain(s0.confirmTime);
    rerender({ c: shifted });
    const after = result.current!.signals.map((s) => s.confirmTime);
    for (const t of first) expect(after).toContain(t);
    // and it is still drawn (its bar is loaded)
    const ov = buildTideOverlay(shifted, result.current, DEFAULT_TIDE_ZONE_SETTINGS);
    expect(ov.tideOut.map((m) => m.time)).toContain(s0.confirmTime);
    expect(tideZone.length).toBeGreaterThan(0);
  });
});

describe('buildTideOverlay / summarizeTide', () => {
  const res = computeTideV2(candles, calculateTideZone(candles), TIDE_PRESETS['4h'], { nowSec: 4_102_444_800, warmupBars: 0 });

  it('marks Tide out (+) under the confirmation bar, Tide in above the exit bar, stop lines per signal', () => {
    const ov = buildTideOverlay(candles, res, DEFAULT_TIDE_ZONE_SETTINGS);
    expect(ov.tideOut).toHaveLength(res.signals.length);
    const bar = new Map(candles.map((c) => [c.time, c]));
    for (const m of ov.tideOut) expect(m.barLow).toBe(bar.get(m.time)!.low);
    expect(ov.tideOut.some((m) => m.plus)).toBe(true);
    expect(ov.tideIn.length).toBeGreaterThan(0);
    for (const m of ov.tideIn) expect(m.barHigh).toBe(bar.get(m.time)!.high);
    expect(ov.stops).toHaveLength(res.trades.length);
    for (const s of ov.stops) expect(s.endTime).toBeGreaterThanOrEqual(s.startTime);
  });

  it('respects the show toggles', () => {
    const ov = buildTideOverlay(candles, res, { showTideOut: false, showTideIn: false, showStops: false });
    expect(ov.tideOut).toEqual([]);
    expect(ov.tideIn).toEqual([]);
    expect(ov.stops).toEqual([]);
    expect(buildTideOverlay(candles, null, DEFAULT_TIDE_ZONE_SETTINGS).tideOut).toEqual([]);
  });

  it('summarizes a fresh print and the open stop', () => {
    const sig = res.signals[res.signals.length - 1];
    const upTo = candles.filter((c) => c.time <= sig.confirmTime);
    const fake: TideV2Result = { ...res, signals: [sig], trades: [{ signal: sig, entryTime: null, entryPrice: null, stop: 123, outcome: 'open', tideInTime: null, exitTime: null, endTime: sig.confirmTime }] };
    const st = summarizeTide(fake, upTo);
    expect(st.fresh).toBe(sig.rsiPlus ? 'out_plus' : 'out');
    expect(st.activeStop).toBe(123);
    expect(summarizeTide(null, candles)).toEqual({ fresh: null, activeStop: null, openCount: 0 });
  });
});

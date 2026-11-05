import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useManualTrades } from '@/hooks/useManualTrades';

const H = 3600;
const c = (i: number, low: number, high: number) => ({ time: i * H, low, high, close: (low + high) / 2 });

describe('useManualTrades', () => {
  beforeEach(() => localStorage.clear());

  it('keeps an open trade open across a refresh and closes it on the TP bar', () => {
    const candles1 = [c(10, 99, 101), c(11, 98, 104)];
    const { result, unmount } = renderHook(() => useManualTrades('BTCUSDT', '1h', candles1, 'BTCUSDT_1h'));
    act(() => { result.current.addTrade('LONG', 100, 95, 115, 10 * H); });
    expect(result.current.trades[0].outcome).toBeUndefined();
    unmount();

    // "Refresh": new hook instance, first render has stale candles from another chart.
    const stale = [c(10, 1, 1000), c(11, 1, 1000)];
    const later = [c(8, 99, 101), c(9, 99, 101), ...candles1, c(12, 97, 110), c(13, 100, 116), c(14, 50, 200)];
    const { result: r2, rerender } = renderHook(
      ({ cs, key }) => useManualTrades('BTCUSDT', '1h', cs, key),
      { initialProps: { cs: stale, key: 'ETHUSDT_1h' } },
    );
    expect(r2.current.trades[0].outcome).toBeUndefined();
    rerender({ cs: later, key: 'BTCUSDT_1h' });
    expect(r2.current.trades[0].outcome).toBe('win');
    expect(r2.current.trades[0].closeTime).toBe(13 * H);
  });

  it('does not let another symbol close a trade', () => {
    const { result, rerender } = renderHook(
      ({ sym, cs }) => useManualTrades(sym, '1h', cs, `${sym}_1h`),
      { initialProps: { sym: 'BTCUSDT', cs: [c(10, 99, 101)] } },
    );
    act(() => { result.current.addTrade('LONG', 100, 95, 115, 10 * H); });
    rerender({ sym: 'ETHUSDT', cs: [c(10, 1, 1000), c(11, 1, 1000)] });
    rerender({ sym: 'BTCUSDT', cs: [c(10, 99, 101), c(11, 99, 102)] });
    expect(result.current.trades[0].outcome).toBeUndefined();
  });
});

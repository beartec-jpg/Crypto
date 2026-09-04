import { describe, it, expect, vi } from 'vitest';
import { applyMainChartVisibleRange } from '@/lib/chart/syncOscillatorTimeScale';
import type { IChartApi } from 'lightweight-charts';

function mockChart() {
  const setVisibleRange = vi.fn();
  const setVisibleLogicalRange = vi.fn();
  const chart = {
    timeScale: () => ({ setVisibleRange, setVisibleLogicalRange }),
  } as unknown as IChartApi;
  return { chart, setVisibleRange, setVisibleLogicalRange };
}

describe('applyMainChartVisibleRange', () => {
  it('prefers logical range so whitespace past the last bar is kept', () => {
    const { chart, setVisibleRange, setVisibleLogicalRange } = mockChart();
    const ok = applyMainChartVisibleRange(chart, {
      time: { from: 1000 as never, to: 2000 as never },
      logical: { from: 80, to: 140 },
      key: 'BTCUSDT_1h',
    });
    expect(ok).toBe(true);
    expect(setVisibleLogicalRange).toHaveBeenCalledWith({ from: 80, to: 140 });
    expect(setVisibleRange).not.toHaveBeenCalled();
  });

  it('falls back to time when logical looks like a leftover dense TF', () => {
    const { chart, setVisibleRange, setVisibleLogicalRange } = mockChart();
    const ok = applyMainChartVisibleRange(chart, {
      time: { from: 1000 as never, to: 2000 as never },
      logical: { from: 28_000, to: 30_000 },
      key: 'BTCUSDT_1h',
    });
    expect(ok).toBe(true);
    expect(setVisibleLogicalRange).not.toHaveBeenCalled();
    expect(setVisibleRange).toHaveBeenCalledWith({ from: 1000, to: 2000 });
  });

  it('skips apply when candlesKey does not match', () => {
    const { chart, setVisibleRange, setVisibleLogicalRange } = mockChart();
    const ok = applyMainChartVisibleRange(
      chart,
      {
        time: { from: 1000 as never, to: 2000 as never },
        logical: { from: 80, to: 140 },
        key: 'BTCUSDT_15m',
      },
      'BTCUSDT_1h',
    );
    expect(ok).toBe(false);
    expect(setVisibleLogicalRange).not.toHaveBeenCalled();
    expect(setVisibleRange).not.toHaveBeenCalled();
  });

  it('uses time for legacy { from, to } snapshots', () => {
    const { chart, setVisibleRange, setVisibleLogicalRange } = mockChart();
    const ok = applyMainChartVisibleRange(chart, {
      from: 1000 as never,
      to: 2000 as never,
    });
    expect(ok).toBe(true);
    expect(setVisibleRange).toHaveBeenCalledWith({ from: 1000, to: 2000 });
    expect(setVisibleLogicalRange).not.toHaveBeenCalled();
  });
});

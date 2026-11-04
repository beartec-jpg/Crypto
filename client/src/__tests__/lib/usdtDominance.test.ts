import { describe, expect, it } from 'vitest';
import {
  buildProxyDominance,
  dropFormingUtcDay,
  exactDominanceFromCaps,
  mergeBasketByUtcDay,
  PIN_RELATIVE_TOLERANCE,
  snapMarketChartToUtcDays,
  snapshotsToBarDays,
  utcDayOpenSec,
  type BasketRow,
} from '../../../../api/_lib/usdtDominance';

const DAY = Date.UTC(2024, 5, 1); // 2024-06-01 00:00 UTC in ms
const DAY_SEC = DAY / 1000;

function chart(days: number, startMs: number, value: (i: number) => number): Array<[number, number]> {
  return Array.from({ length: days }, (_, i) => [startMs + i * 86400000, value(i)]);
}

describe('utcDayOpenSec / snapMarketChartToUtcDays', () => {
  it('snaps millisecond timestamps to UTC day open seconds', () => {
    expect(utcDayOpenSec(DAY + 15 * 3600000)).toBe(DAY_SEC);
    expect(utcDayOpenSec(DAY_SEC + 100)).toBe(DAY_SEC);
    const snapped = snapMarketChartToUtcDays([
      [DAY + 3600000, 10],
      [DAY + 80000000, 12],
      [DAY + 86400000 + 1000, 20],
    ]);
    expect(snapped).toEqual([
      { time: DAY_SEC, value: 12 },
      { time: DAY_SEC + 86400, value: 20 },
    ]);
  });
});

describe('snapshotsToBarDays (CoinGecko 00:00 snapshot = previous day close)', () => {
  it('shifts back one day, drops the live point and never emits the forming day', () => {
    const now = DAY + 86400000 * 3 + 6 * 3600000; // 06:00 on day D+3
    const out = snapshotsToBarDays([
      [DAY, 1], // close of D-1
      [DAY + 86400000, 2], // close of D
      [DAY + 2 * 86400000, 3], // close of D+1
      [DAY + 3 * 86400000, 4], // close of D+2 (today's 00:00 snapshot)
      [now, 999], // live point, must be ignored
    ]);
    expect(out).toEqual([
      { time: DAY_SEC - 86400, value: 1 },
      { time: DAY_SEC, value: 2 },
      { time: DAY_SEC + 86400, value: 3 },
      { time: DAY_SEC + 2 * 86400, value: 4 },
    ]);
    // today's bar (D+3) is forming: absent even without dropFormingUtcDay
    expect(dropFormingUtcDay(out, now / 1000)).toEqual(out);
    expect(out.some((p) => p.value === 999)).toBe(false);
  });
});

describe('dropFormingUtcDay', () => {
  it('drops today and keeps prior UTC days', () => {
    const today = Date.UTC(2024, 5, 10) / 1000;
    const series = [
      { time: today - 2 * 86400, value: 5 },
      { time: today - 86400, value: 6 },
      { time: today, value: 7 },
    ];
    const dropped = dropFormingUtcDay(series, today + 3600);
    expect(dropped.map((p) => p.time)).toEqual([today - 2 * 86400, today - 86400]);
  });
});

describe('mergeBasketByUtcDay', () => {
  it('keeps only days present in all 7 series and sums the basket', () => {
    const ids = ['bitcoin', 'ethereum', 'tether', 'ripple', 'binancecoin', 'solana', 'usd-coin'];
    const seriesById: Record<string, Array<[number, number]>> = {};
    for (const id of ids) {
      seriesById[id] = chart(5, DAY, () => 100);
    }
    seriesById.bitcoin = chart(5, DAY, (i) => (i === 2 ? 100 : 100));
    seriesById.ripple = chart(4, DAY, () => 100);
    const rows = mergeBasketByUtcDay(seriesById, ids);
    expect(rows).toHaveLength(4);
    expect(rows[0].time).toBe(DAY_SEC - 86400); // 00:00 snapshot of D = close of D-1
    expect(rows[0].basketTotal).toBe(700);
    expect(rows[0].usdtMcap).toBe(100);
  });
});

describe('buildProxyDominance', () => {
  const rows: BasketRow[] = [
    { time: DAY_SEC, basketTotal: 50, usdtMcap: 5 },
    { time: DAY_SEC + 86400, basketTotal: 100, usdtMcap: 8 },
  ];

  it('scales the basket to global total and pins when within 15%', () => {
    const globalTotalNow = 200;
    const exact = 4.2;
    const series = buildProxyDominance(rows, globalTotalNow, exact);
    expect(series).toHaveLength(2);
    expect(series[1].value).toBeCloseTo(exact, 10);
    const unscaledLast = (8 / ((100 * 200) / 100)) * 100;
    expect(unscaledLast).toBeCloseTo(4, 10);
    expect(Math.abs(unscaledLast - exact) / exact).toBeLessThan(PIN_RELATIVE_TOLERANCE);
  });

  it('leaves the series unscaled when the pin difference is >= 15%', () => {
    const series = buildProxyDominance(rows, 200, 20);
    const last = (8 / 200) * 100;
    expect(series[1].value).toBeCloseTo(last, 10);
    expect(series[1].value).not.toBe(20);
  });
});

describe('exactDominanceFromCaps', () => {
  it('joins by UTC day and computes USDT.D percent', () => {
    const usdt = [
      { time: DAY_SEC, value: 10 },
      { time: DAY_SEC + 86400, value: 12 },
    ];
    const total = [
      { time: DAY_SEC, value: 100 },
      { time: DAY_SEC + 86400, value: 200 },
    ];
    expect(exactDominanceFromCaps(usdt, total)).toEqual([
      { time: DAY_SEC, value: 10 },
      { time: DAY_SEC + 86400, value: 6 },
    ]);
  });
});

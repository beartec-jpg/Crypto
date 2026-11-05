import { describe, it, expect } from 'vitest';
import { scanManualTrade, candlesApplyToTrade, tradeBoxEndTime } from '@/lib/manualTradeScan';
import type { ManualTrade } from '@/lib/chartPrimitives/TradePrimitive';

const H = 3600;
const base: ManualTrade = {
  id: 't1', symbol: 'BTCUSDT', timeframe: '1h', direction: 'LONG',
  entryPrice: 100, slPrice: 95, tpPrice: 115, entryTime: 10 * H, entryHit: true,
};
const c = (i: number, low: number, high: number) => ({ time: i * H, low, high, close: (low + high) / 2 });

describe('scanManualTrade', () => {
  it('keeps an open trade open while price stays between SL and TP', () => {
    const candles = [c(10, 99, 101), c(11, 98, 104), c(12, 97, 110)];
    const r = scanManualTrade(base, candles);
    expect(r.outcome).toBeUndefined();
    expect(tradeBoxEndTime(r, candles[2].time)).toBe(12 * H);
  });

  it('closes at the TP bar and stops widening there', () => {
    const candles = [c(10, 99, 101), c(11, 98, 116), c(12, 90, 130)];
    const r = scanManualTrade(base, candles);
    expect(r.outcome).toBe('win');
    expect(r.closeTime).toBe(11 * H);
    expect(tradeBoxEndTime(r, 12 * H)).toBe(11 * H);
  });

  it('closes at the SL bar', () => {
    const r = scanManualTrade(base, [c(10, 99, 101), c(11, 94, 101)]);
    expect(r.outcome).toBe('loss');
    expect(r.closeTime).toBe(11 * H);
  });

  it('gives the same result after a refresh (fresh scan from stored entry time, extra history prepended)', () => {
    const live = [c(10, 99, 101), c(11, 98, 104)];
    const afterRefresh = [c(5, 50, 200), c(6, 50, 200), ...live, c(12, 96, 114)];
    // older candles before entry must not close the trade
    const r = scanManualTrade(base, afterRefresh);
    expect(r.outcome).toBeUndefined();
    expect(tradeBoxEndTime(r, 12 * H)).toBe(12 * H);
  });

  it('re-evaluates a still-forming last candle when its high grows to TP', () => {
    const first = scanManualTrade(base, [c(10, 99, 101), c(11, 99, 105)], 10 * H);
    expect(first.outcome).toBeUndefined();
    const second = scanManualTrade(first, [c(10, 99, 101), c(11, 99, 116)], 11 * H);
    expect(second.outcome).toBe('win');
    expect(second.closeTime).toBe(11 * H);
  });

  it('does not evaluate SL/TP until a pending entry fills', () => {
    const pending = { ...base, entryHit: false, entryPrice: 100, slPrice: 90 };
    const r = scanManualTrade(pending, [c(10, 101, 120), c(11, 99, 105)]);
    expect(r.outcome).toBeUndefined();
    expect(r.entryHit).toBe(true);
  });

  it('handles SHORT trades', () => {
    const s: ManualTrade = { ...base, direction: 'SHORT', slPrice: 105, tpPrice: 90 };
    expect(scanManualTrade(s, [c(10, 99, 101), c(11, 89, 101)]).outcome).toBe('win');
    expect(scanManualTrade(s, [c(10, 99, 101), c(11, 99, 106)]).outcome).toBe('loss');
  });
});

describe('candlesApplyToTrade', () => {
  it('ignores candles from another symbol or timeframe', () => {
    expect(candlesApplyToTrade(base, 'ETHUSDT', '1h', 'ETHUSDT_1h')).toBe(false);
    expect(candlesApplyToTrade(base, 'BTCUSDT', '4h', 'BTCUSDT_4h')).toBe(false);
    expect(candlesApplyToTrade(base, 'BTCUSDT', '1h', 'BTCUSDT_1h')).toBe(true);
  });
  it('ignores stale candles still mounted from the previous chart', () => {
    expect(candlesApplyToTrade(base, 'BTCUSDT', '1h', 'ETHUSDT_1h')).toBe(false);
  });
  it('lets legacy trades without a timeframe use any timeframe of their symbol', () => {
    expect(candlesApplyToTrade({ ...base, timeframe: '' }, 'BTCUSDT', '4h', 'BTCUSDT_4h')).toBe(true);
  });
});

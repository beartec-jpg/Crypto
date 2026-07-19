import { describe, expect, it } from 'vitest';
import { getOpenTradeXEnd, MIN_OPEN_TRADE_WIDTH, OPEN_TRADE_RIGHT_PADDING } from '@/lib/chartPrimitives/TradePrimitive';

describe('getOpenTradeXEnd', () => {
  it('extends open trades beyond the current candle when current time is available', () => {
    expect(getOpenTradeXEnd(100, 180, 240)).toBe(180 + OPEN_TRADE_RIGHT_PADDING);
  });

  it('falls back to the chart edge when current time cannot be resolved', () => {
    expect(getOpenTradeXEnd(100, null, 320)).toBe(320);
  });

  it('never collapses behind the entry candle when current time is stale', () => {
    expect(getOpenTradeXEnd(250, 200, 180)).toBe(250 + MIN_OPEN_TRADE_WIDTH);
  });
});

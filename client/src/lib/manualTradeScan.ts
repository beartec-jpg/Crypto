// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import type { ManualTrade } from '@/lib/chartPrimitives/TradePrimitive';

export interface ScanCandle { time: number; high: number; low: number; close: number }

/**
 * Re-scan a trade against candles starting from the candle whose time is
 * >= `fromTime`. Time-based (never index-based), so the result is identical
 * whether the candles were loaded fresh after a page refresh, had history
 * prepended, or the last (still-forming) candle was updated in place.
 *
 * Returns the updated trade plus the time of the last candle that was fully
 * evaluated. Callers should re-scan from that same time next tick (inclusive)
 * because the last candle may still be forming and its high/low can grow.
 */
export function scanManualTrade(
  trade: ManualTrade,
  candles: ScanCandle[],
  fromTime: number = trade.entryTime,
): ManualTrade {
  if (trade.outcome || candles.length === 0) return trade;

  // Legacy trades persisted before entryHit existed are treated as filled.
  let entryFilled = trade.entryHit ?? true;
  const start = Math.max(fromTime, trade.entryTime);

  for (const c of candles) {
    if (c.time < start) continue;

    // Historical trade with a user-set close: stop (manual) once past it.
    if (trade.closeTime && c.time > trade.closeTime) {
      return { ...trade, entryHit: entryFilled, outcome: 'manual' };
    }

    if (!entryFilled) {
      if (trade.direction === 'LONG' ? c.low <= trade.entryPrice : c.high >= trade.entryPrice) {
        entryFilled = true;
      } else {
        continue;
      }
    }

    if (trade.direction === 'LONG') {
      if (c.low <= trade.slPrice) return { ...trade, entryHit: true, outcome: 'loss', closeTime: c.time };
      if (c.high >= trade.tpPrice) return { ...trade, entryHit: true, outcome: 'win', closeTime: c.time };
    } else {
      if (c.high >= trade.slPrice) return { ...trade, entryHit: true, outcome: 'loss', closeTime: c.time };
      if (c.low <= trade.tpPrice) return { ...trade, entryHit: true, outcome: 'win', closeTime: c.time };
    }
  }

  if (entryFilled && !trade.entryHit) return { ...trade, entryHit: true };
  return trade;
}

/**
 * Should these candles be used to evaluate this trade? Only when they are the
 * trade's own symbol (and timeframe, for trades that record one) AND the
 * candle set really is for the current symbol/timeframe (candlesKey guards the
 * one-render window after a refresh/switch where `candles` still holds the
 * previous chart's data).
 */
export function candlesApplyToTrade(
  trade: ManualTrade,
  symbol: string,
  timeframe: string,
  candlesKey?: string,
): boolean {
  if (candlesKey !== undefined && candlesKey !== `${symbol}_${timeframe}`) return false;
  if (trade.symbol !== symbol) return false;
  if (trade.timeframe && trade.timeframe !== timeframe) return false;
  return true;
}

/**
 * Right edge (unix time) of a trade box: the SL/TP/exit bar for closed
 * trades, otherwise the latest candle so an open box keeps widening.
 */
export function tradeBoxEndTime(trade: ManualTrade, latestCandleTime: number): number {
  if (trade.closeTime) return trade.closeTime;
  return Math.max(trade.entryTime, latestCandleTime || 0);
}

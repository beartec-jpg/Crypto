// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { useState, useEffect, useCallback, useRef } from 'react';
import type { ManualTrade } from '@/lib/chartPrimitives/TradePrimitive';
import { scanManualTrade, candlesApplyToTrade } from '@/lib/manualTradeScan';

const STORAGE_KEY = 'manual_trades_v1';

function loadTrades(): ManualTrade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ManualTrade[];
  } catch {
    return [];
  }
}

function saveTrades(trades: ManualTrade[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch {
    // ignore quota errors
  }
}

export function useManualTrades(
  symbol: string,
  timeframe: string,
  candles: Array<{ time: number; high: number; low: number; close: number }>,
  /** `${symbol}_${timeframe}` of the data in `candles`; skips scans while stale data from a previous chart is still mounted. */
  candlesKey?: string,
) {
  const [trades, setTrades] = useState<ManualTrade[]>(() => loadTrades());

  // Time of the last candle evaluated per trade. Time-based (not array index)
  // so a refresh, history prepend or rewind never skips or mis-reads candles.
  // The last candle is re-evaluated each tick because it may still be forming.
  const lastCheckedTimeRef = useRef<Map<string, number>>(new Map());

  // Keep a stable ref to the latest candles so addTrade can access them without
  // being listed as a dependency (which would recreate the callback on every tick).
  const candlesRef = useRef(candles);
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  const candlesKeyRef = useRef(candlesKey);
  useEffect(() => { candlesKeyRef.current = candlesKey; }, [candlesKey]);

  // Persist on change
  useEffect(() => {
    saveTrades(trades);
  }, [trades]);

  // Check open trades for this chart's symbol/timeframe against its candles.
  useEffect(() => {
    if (candles.length === 0) return;
    const lastTime = candles[candles.length - 1].time;

    setTrades(prev => {
      let changed = false;
      const updated = prev.map(trade => {
        if (trade.outcome) return trade; // already closed
        if (!candlesApplyToTrade(trade, symbol, timeframe, candlesKey)) return trade;
        const from = lastCheckedTimeRef.current.get(trade.id) ?? trade.entryTime;
        const scanned = scanManualTrade(trade, candles, from);
        lastCheckedTimeRef.current.set(trade.id, Math.max(from, lastTime));
        if (scanned !== trade) changed = true;
        return scanned;
      });
      return changed ? updated : prev;
    });
  }, [candles, symbol, timeframe, candlesKey]);

  const addTrade = useCallback((
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    slPrice: number,
    tpPrice: number,
    entryTime: number,
    closeTime?: number,
  ) => {
    let trade: ManualTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      symbol,
      timeframe,
      direction,
      entryPrice,
      slPrice,
      tpPrice,
      entryTime,
      ...(closeTime !== undefined ? { closeTime } : {}),
    };
    // Immediately scan the new trade against current candles so that historical
    // trades added while candles are already loaded get a win/loss outcome right
    // away (the candle-change effect won't fire in that situation).
    const currentCandles = candlesRef.current;
    if (currentCandles.length > 0 && candlesApplyToTrade(trade, symbol, timeframe, candlesKeyRef.current)) {
      trade = scanManualTrade(trade, currentCandles);
      lastCheckedTimeRef.current.set(trade.id, Math.max(trade.entryTime, currentCandles[currentCandles.length - 1].time));
    }
    setTrades(prev => [...prev, trade]);
  }, [symbol, timeframe]);

  const exitTrade = useCallback((id: string, exitTime: number) => {
    setTrades(prev => prev.map(t =>
      t.id === id && !t.outcome
        ? { ...t, closeTime: exitTime, outcome: 'manual' as const }
        : t,
    ));
  }, []);

  const deleteTrade = useCallback((id: string) => {
    lastCheckedTimeRef.current.delete(id);
    setTrades(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateTrade = useCallback((id: string, updates: Partial<Pick<ManualTrade, 'slPrice' | 'tpPrice'>>) => {
    setTrades(prev => prev.map(t => {
      if (t.id !== id || t.outcome) return t;
      const updated = { ...t, ...updates };
      // Re-scan from the entry candle with the new SL/TP levels
      lastCheckedTimeRef.current.delete(id);
      return updated;
    }));
  }, []);

  const symbolTrades = trades.filter(t => t.symbol === symbol);

  return { trades: symbolTrades, addTrade, exitTrade, deleteTrade, updateTrade };
}

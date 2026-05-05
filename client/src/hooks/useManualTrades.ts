import { useState, useEffect, useCallback, useRef } from 'react';
import type { ManualTrade } from '@/lib/chartPrimitives/TradePrimitive';

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

/**
 * Scan a single open trade against candles starting at startIdx.
 * Returns [updatedTrade, lastScannedIndex].
 */
function scanTrade(
  trade: ManualTrade,
  candles: Array<{ time: number; high: number; low: number; close: number }>,
  startIdx: number,
): [ManualTrade, number] {
  if (candles.length === 0) return [trade, 0];
  for (let i = startIdx; i < candles.length; i++) {
    const c = candles[i];

    // For historical/manual trades with a pre-set closeTime: allow the exact
    // closeTime candle through to the TP/SL checks below first.  Only stop
    // (mark as manual) when we step *past* that candle.
    if (trade.closeTime && c.time > trade.closeTime) {
      return [{ ...trade, outcome: 'manual' as const }, i];
    }

    if (trade.direction === 'LONG') {
      if (c.low <= trade.slPrice) return [{ ...trade, outcome: 'loss' as const, closeTime: c.time }, i];
      if (c.high >= trade.tpPrice) return [{ ...trade, outcome: 'win' as const, closeTime: c.time }, i];
    } else {
      if (c.high >= trade.slPrice) return [{ ...trade, outcome: 'loss' as const, closeTime: c.time }, i];
      if (c.low <= trade.tpPrice) return [{ ...trade, outcome: 'win' as const, closeTime: c.time }, i];
    }
  }
  return [trade, candles.length - 1];
}

export function useManualTrades(symbol: string, timeframe: string, candles: Array<{ time: number; high: number; low: number; close: number }>) {
  const [trades, setTrades] = useState<ManualTrade[]>(() => loadTrades());

  // Track the last candle index checked per trade to avoid rescanning already-processed candles.
  const lastCheckedCandleRef = useRef<Map<string, number>>(new Map());

  // Keep a stable ref to the latest candles so addTrade can access them without
  // being listed as a dependency (which would recreate the callback on every tick).
  const candlesRef = useRef(candles);
  useEffect(() => { candlesRef.current = candles; }, [candles]);

  // Persist on change
  useEffect(() => {
    saveTrades(trades);
  }, [trades]);

  // Check open trades against new candles only (from last checked index onward)
  useEffect(() => {
    if (candles.length === 0) return;

    setTrades(prev => {
      let changed = false;
      const updated = prev.map(trade => {
        if (trade.outcome) return trade; // already closed

        // Start scanning from after the last checked candle (or from entry, if first check)
        const lastIdx = lastCheckedCandleRef.current.get(trade.id) ?? -1;
        const startIdx = lastIdx >= 0
          ? lastIdx + 1
          : candles.findIndex(c => c.time >= trade.entryTime);
        if (startIdx < 0) return trade;

        const [scannedTrade, lastScanned] = scanTrade(trade, candles, startIdx);
        lastCheckedCandleRef.current.set(trade.id, lastScanned);
        if (scannedTrade !== trade) changed = true;
        return scannedTrade;
      });
      return changed ? updated : prev;
    });
  }, [candles]);

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
    if (currentCandles.length > 0) {
      const startIdx = currentCandles.findIndex(c => c.time >= trade.entryTime);
      if (startIdx >= 0) {
        const [scannedTrade, lastIdx] = scanTrade(trade, currentCandles, startIdx);
        trade = scannedTrade;
        lastCheckedCandleRef.current.set(trade.id, lastIdx);
      }
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
    lastCheckedCandleRef.current.delete(id);
    setTrades(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateTrade = useCallback((id: string, updates: Partial<Pick<ManualTrade, 'slPrice' | 'tpPrice'>>) => {
    setTrades(prev => prev.map(t => {
      if (t.id !== id || t.outcome) return t;
      const updated = { ...t, ...updates };
      // Re-scan from the entry candle with the new SL/TP levels
      lastCheckedCandleRef.current.delete(id);
      return updated;
    }));
  }, []);

  const symbolTrades = trades.filter(t => t.symbol === symbol);

  return { trades: symbolTrades, addTrade, exitTrade, deleteTrade, updateTrade };
}

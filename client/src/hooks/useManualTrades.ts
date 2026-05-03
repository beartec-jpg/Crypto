import { useState, useEffect, useCallback } from 'react';
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

export function useManualTrades(symbol: string, candles: Array<{ time: number; high: number; low: number; close: number }>) {
  const [trades, setTrades] = useState<ManualTrade[]>(() => loadTrades());

  // Persist on change
  useEffect(() => {
    saveTrades(trades);
  }, [trades]);

  // Check open trades against latest candle for TP/SL hits
  useEffect(() => {
    if (candles.length === 0) return;

    setTrades(prev => {
      let changed = false;
      const updated = prev.map(trade => {
        if (trade.outcome) return trade; // already closed

        // Scan all candles from entryTime onward for TP/SL hit
        const entryCandleIdx = candles.findIndex(c => c.time >= trade.entryTime);
        if (entryCandleIdx < 0) return trade;

        for (let i = entryCandleIdx; i < candles.length; i++) {
          const c = candles[i];
          if (trade.direction === 'LONG') {
            if (c.low <= trade.slPrice) {
              changed = true;
              return { ...trade, outcome: 'loss' as const, closeTime: c.time };
            }
            if (c.high >= trade.tpPrice) {
              changed = true;
              return { ...trade, outcome: 'win' as const, closeTime: c.time };
            }
          } else {
            if (c.high >= trade.slPrice) {
              changed = true;
              return { ...trade, outcome: 'loss' as const, closeTime: c.time };
            }
            if (c.low <= trade.tpPrice) {
              changed = true;
              return { ...trade, outcome: 'win' as const, closeTime: c.time };
            }
          }
        }
        return trade;
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
  ) => {
    const trade: ManualTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      symbol,
      direction,
      entryPrice,
      slPrice,
      tpPrice,
      entryTime,
    };
    setTrades(prev => [...prev, trade]);
  }, [symbol]);

  const deleteTrade = useCallback((id: string) => {
    setTrades(prev => prev.filter(t => t.id !== id));
  }, []);

  const symbolTrades = trades.filter(t => t.symbol === symbol);

  return { trades: symbolTrades, addTrade, deleteTrade };
}

import { useState, useCallback } from 'react';
import type { TradeSignal, BacktestResults, Position as TradingPosition } from '@/types/trading.types';

/**
 * Trading-related types
 */
export interface Position {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  stopLoss: number;
  targets: { price: number; filled: boolean }[];
  openTime: number;
}

/**
 * Hook for managing trading state in CryptoIndicators
 * Extracted from CryptoIndicators.tsx for Phase 4G-10
 */
export function useTradingState() {
  const [position, setPosition] = useState<Position | null>(null);
  const [tradeSignals, setTradeSignals] = useState<TradeSignal[]>([]);
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);
  const [backtesting, setBacktesting] = useState(false);

  const openPosition = useCallback((setup: {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    targets: number[];
    size: number;
  }) => {
    const newPosition: Position = {
      id: `pos-${Date.now()}`,
      symbol: setup.symbol,
      direction: setup.direction,
      entryPrice: setup.entryPrice,
      currentPrice: setup.entryPrice,
      size: setup.size,
      stopLoss: setup.stopLoss,
      targets: setup.targets.map(price => ({ price, filled: false })),
      openTime: Date.now()
    };
    setPosition(newPosition);
  }, []);

  const closePosition = useCallback(() => {
    setPosition(null);
  }, []);

  const updatePosition = useCallback((updates: Partial<Position>) => {
    setPosition(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  const addTradeSignal = useCallback((signal: TradeSignal) => {
    setTradeSignals(prev => [...prev, signal]);
  }, []);

  const clearTradeSignals = useCallback(() => {
    setTradeSignals([]);
  }, []);

  const startBacktest = useCallback(() => {
    setBacktesting(true);
    setBacktestResults(null);
  }, []);

  const completeBacktest = useCallback((results: BacktestResults) => {
    setBacktestResults(results);
    setBacktesting(false);
  }, []);

  const clearBacktest = useCallback(() => {
    setBacktestResults(null);
    setBacktesting(false);
  }, []);

  return {
    // State
    position,
    tradeSignals,
    backtestResults,
    backtesting,
    
    // Actions
    openPosition,
    closePosition,
    updatePosition,
    addTradeSignal,
    clearTradeSignals,
    startBacktest,
    completeBacktest,
    clearBacktest,
    
    // Setters (for direct access if needed)
    setPosition,
    setTradeSignals,
    setBacktestResults,
    setBacktesting
  };
}

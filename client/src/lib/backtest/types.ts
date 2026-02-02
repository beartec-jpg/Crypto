/**
 * Backtest-specific type definitions
 * Phase 4: Extracted from CryptoIndicators.tsx
 */

import type { BacktestTrade, BacktestResults, BotTPSLConfig } from '@/types/trading.types';

/**
 * Parameter ranges for auto-backtest
 */
export interface ParameterRange {
  min: number;
  max: number;
  step: number;
}

export interface ParameterRanges {
  // Entry parameters
  swingLength: ParameterRange;
  wickRatio: ParameterRange;
  confirmCandles: ParameterRange;
  
  // TP1 parameters
  tp1RR: ParameterRange;
  tp1SwingLength: ParameterRange;
  tp1TrailingSwing: ParameterRange;
  tp1EMAFast: ParameterRange;
  tp1EMASlow: ParameterRange;
  
  // TP2 parameters
  tp2RR: ParameterRange;
  tp2SwingLength: ParameterRange;
  tp2TrailingSwing: ParameterRange;
  tp2EMAFast: ParameterRange;
  tp2EMASlow: ParameterRange;
  
  // TP3 parameters
  tp3RR: ParameterRange;
  tp3SwingLength: ParameterRange;
  tp3TrailingSwing: ParameterRange;
  tp3EMAFast: ParameterRange;
  tp3EMASlow: ParameterRange;
  
  // SL parameters
  slATR: ParameterRange;
  slSwingLength: ParameterRange;
  slFixedDistance: ParameterRange;
}

/**
 * Test options for auto-backtest
 */
export interface TestOptions {
  // Strategy parameters
  trendFilters: ('ema' | 'structure' | 'both' | 'none')[];
  directions: ('both' | 'long' | 'short')[];
  useWickFilter: boolean;
  useConfirmCandles: boolean;
  
  // TP1 options
  tp1: {
    structure: boolean;
    trailing: boolean;
    ema: boolean;
    fixedRR: boolean;
  };
  
  // TP2 options
  tp2: {
    structure: boolean;
    trailing: boolean;
    ema: boolean;
    fixedRR: boolean;
  };
  
  // TP3 options
  tp3: {
    structure: boolean;
    trailing: boolean;
    ema: boolean;
    fixedRR: boolean;
  };
  
  // SL options
  sl: {
    atr: boolean;
    structure: boolean;
    fixedDistance: boolean;
  };
}

/**
 * Auto-backtest configuration
 */
export interface AutoBacktestConfig {
  // Data
  candles: any[]; // CandleData[]
  
  // Parameter ranges to test
  ranges: ParameterRanges;
  
  // Which parameters to test
  parameterTests: TestOptions;
  
  // Current strategy settings
  strategySettings: {
    numTPs: 1 | 2 | 3;
    tp1PositionPercent: number;
    tp2PositionPercent: number;
    tp3PositionPercent: number;
    accountSize: number;
    riskPercent: number;
  };
  
  // Signal generator function
  generateSignal: (data: any[], backtestMode: boolean, overrides: any) => any | null;
  
  // Trade simulator function  
  simulateTrade: (signal: any, signalIndex: number, candles: any[]) => BacktestTrade | null;
  
  // Progress callback
  onProgress?: (progress: number) => void;
}

/**
 * Auto-backtest result
 * Re-export from trading.types for convenience
 */
export interface AutoBacktestResult {
  config: BotTPSLConfig;
  results: BacktestResults;
  configDescription: string;
  swingLength: number;
  wickRatio: number;
  confirmCandles: number;
  useWickFilter: boolean;
  useConfirmCandles: boolean;
  trendFilter: 'ema' | 'structure' | 'both' | 'none';
  allowedDirections: 'both' | 'long' | 'short';
}

/**
 * Sort metrics for backtest results
 */
export type SortMetric = 'profit' | 'winRate' | 'trades' | 'avgRR' | 'profitFactor' | 'maxDrawdown';

/**
 * Backtest metrics
 */
export interface BacktestMetrics {
  totalProfit: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRR: number;
  maxDrawdown: number;
  profitFactor: number;
}

/**
 * Backtest filter criteria
 */
export interface BacktestFilter {
  minTrades?: number;
  minWinRate?: number;
  minProfit?: number;
  minAvgRR?: number;
  maxDrawdown?: number;
}

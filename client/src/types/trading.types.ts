/**
 * Trading-related type definitions
 * Extracted from CryptoIndicators.tsx for reusability
 */

// Bot-specific TP/SL Configuration Types
export type TPType = 'structure' | 'trailing' | 'atr' | 'fixed_rr' | 'vwap' | 'ema' | 'projection';
export type SLType = 'structure' | 'fixed' | 'atr' | 'fixed_distance';

export interface TradeSignal {
  id: string;
  time: number;
  type: 'LONG' | 'SHORT';
  strategy: 'liquidity_grab' | 'choch_fvg' | 'vwap_rejection' | 'structure_break' | 'rs_flip' | 'bos_trend' | 'ema_trading';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Type: TPType;
  tp2Type: TPType;
  tp3Type: TPType;
  tp1Config?: TPConfig; // Full TP1 configuration (for exit modes and EMA settings)
  tp2Config?: TPConfig; // Full TP2 configuration
  tp3Config?: TPConfig; // Full TP3 configuration
  riskReward1: number;
  riskReward2: number;
  riskReward3: number;
  quantity: number;
  reason: string;
  active: boolean;
  trailingActive?: boolean; // Track if trailing TP is activated
  entryEMAState?: 'fast_above_slow' | 'fast_below_slow'; // Track EMA relationship at entry for crossover detection
}

export interface Position {
  type: 'long' | 'short';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  quantity: number;
  signalId: string;
}

export interface MarketAlert {
  id: string;
  time: number;
  type: 'BOS' | 'CHoCH' | 'Liquidity Sweep' | 'FVG' | 'FVG Entry' | 'VWAP Bounce' | 'VWAP Cross' | 'Trendline Breakout' | 'Trendline Rejection' | 'CVD Spike' | 'Volume Spike' | 'Level 2 Spike' | 'Oscillator Divergence' | 'Oscillator Crossover' | 'OBV Divergence' | 'OBV Trend' | 'OBV Spike' | 'BB Upper Touch' | 'BB Lower Touch' | 'BB Breakout' | 'BB Middle Cross';
  direction: 'bullish' | 'bearish';
  price: number;
  description: string;
  level?: number; // For divergence levels 1-5
  indicators?: string[]; // For multi-indicator divergences
}

export interface BacktestTrade {
  id: string;
  entryTime: number;
  exitTime: number;
  direction: 'long' | 'short';
  strategy: string;
  entry: number;
  exit: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  outcome: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'Breakeven' | 'EMA Exit' | 'VWAP Exit';
  rr: number;
  profitLoss: number;
  winner: boolean;
}

export interface BacktestResults {
  trades: BacktestTrade[];
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  avgRR: number;
  totalPL: number;
  profitFactor: number;
  accountSize: number;
  riskPerTrade: number;
  avgPositionSize: number;
  finalBalance: number;
  returnPercent: number;
}

export interface TPConfig {
  type: TPType;
  atrMultiplier?: number;        // For ATR-based
  fixedRR?: number;              // For fixed R:R
  vwapPeriod?: 'session' | 'daily' | 'weekly' | 'monthly' | 'rolling10' | 'rolling20' | 'rolling50'; // For VWAP exit
  vwapOffset?: number;           // % offset from VWAP
  vwapExitMode?: 'touch' | 'cross'; // VWAP exit mode: touch = price touches VWAP, cross = price crosses VWAP
  projectionMultiplier?: number; // For projection-based
  emaFast?: number;              // For EMA exit (fast period) - strategy-specific
  emaSlow?: number;              // For EMA exit (slow period) - strategy-specific
  emaExitMode?: 'touch' | 'crossover'; // EMA exit mode: touch = price touches EMA, crossover = EMAs cross each other
  swingLength?: number;          // For structure-based TP
  trailingSwingLength?: number;  // For trailing TP - which swing to trail
  positionPercent: number;       // % of position to close at this TP
}

export interface SLConfig {
  type: SLType;
  atrMultiplier?: number;        // For ATR-based
  fixedDistance?: number;        // For fixed distance
  swingLength?: number;          // For structure-based SL swing length
  useNearestSwing?: boolean;     // For structure-based
}

export interface BotTPSLConfig {
  numTPs: 1 | 2 | 3;
  tp1: TPConfig;
  tp2?: TPConfig;
  tp3?: TPConfig;
  sl: SLConfig;
}

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

export interface AutoBacktestTestParams {
  testTP1Types: TPType[];
  testTP2Types: TPType[];
  testTP3Types: TPType[];
  testSLTypes: SLType[];
  testATRMultipliers: number[];
  testRRRatios: number[];
  testProjectionMultipliers: number[];
}

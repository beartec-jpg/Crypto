/**
 * Backtest helper utilities
 * Phase 4: Extracted from CryptoIndicators.tsx
 */

import type { AutoBacktestResult, SortMetric, BacktestFilter, BacktestMetrics } from './types';
import type { BacktestTrade } from '@/types/trading.types';

/**
 * Sort backtest results by specified metric
 * 
 * @param results - Array of backtest results
 * @param sortBy - Metric to sort by
 * @param ascending - Sort in ascending order (default: false)
 * @returns Sorted array of results
 */
export function sortBacktestResults(
  results: AutoBacktestResult[],
  sortBy: SortMetric = 'profit',
  ascending: boolean = false
): AutoBacktestResult[] {
  const sorted = [...results];
  
  sorted.sort((a, b) => {
    let aValue: number;
    let bValue: number;
    
    switch (sortBy) {
      case 'profit':
        aValue = a.results.totalPL;
        bValue = b.results.totalPL;
        break;
      case 'winRate':
        aValue = a.results.winRate;
        bValue = b.results.winRate;
        break;
      case 'trades':
        aValue = a.results.totalTrades;
        bValue = b.results.totalTrades;
        break;
      case 'avgRR':
        aValue = a.results.avgRR;
        bValue = b.results.avgRR;
        break;
      case 'profitFactor':
        aValue = a.results.profitFactor;
        bValue = b.results.profitFactor;
        break;
      case 'maxDrawdown':
        // For drawdown, lower is better (note: this metric not in current BacktestResults)
        // Placeholder implementation
        aValue = 0;
        bValue = 0;
        break;
      default:
        aValue = a.results.totalPL;
        bValue = b.results.totalPL;
    }
    
    return ascending ? aValue - bValue : bValue - aValue;
  });
  
  return sorted;
}

/**
 * Filter backtest results by minimum criteria
 * 
 * @param results - Array of backtest results
 * @param filter - Filter criteria
 * @returns Filtered array of results
 */
export function filterBacktestResults(
  results: AutoBacktestResult[],
  filter: BacktestFilter
): AutoBacktestResult[] {
  return results.filter(result => {
    if (filter.minTrades !== undefined && result.results.totalTrades < filter.minTrades) {
      return false;
    }
    if (filter.minWinRate !== undefined && result.results.winRate < filter.minWinRate) {
      return false;
    }
    if (filter.minProfit !== undefined && result.results.totalPL < filter.minProfit) {
      return false;
    }
    if (filter.minAvgRR !== undefined && result.results.avgRR < filter.minAvgRR) {
      return false;
    }
    // maxDrawdown not currently available in BacktestResults
    // if (filter.maxDrawdown !== undefined && result.results.maxDrawdown > filter.maxDrawdown) {
    //   return false;
    // }
    return true;
  });
}

/**
 * Calculate aggregate metrics from trade array
 * 
 * @param trades - Array of backtest trades
 * @returns Calculated metrics
 */
export function calculateBacktestMetrics(trades: BacktestTrade[]): BacktestMetrics {
  const wins = trades.filter(t => t.winner).length;
  const losses = trades.filter(t => !t.winner).length;
  const totalTrades = trades.length;
  
  const totalProfit = trades.reduce((sum, t) => sum + t.profitLoss, 0);
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgRR = totalTrades > 0 ? trades.reduce((sum, t) => sum + t.rr, 0) / totalTrades : 0;
  
  // Calculate profit factor
  const grossProfit = trades.filter(t => t.winner).reduce((sum, t) => sum + t.profitLoss, 0);
  const grossLoss = Math.abs(trades.filter(t => !t.winner).reduce((sum, t) => sum + t.profitLoss, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  
  // Max drawdown calculation (simplified - would need equity curve for accurate calculation)
  // For now, return 0 as placeholder
  const maxDrawdown = 0;
  
  return {
    totalProfit,
    totalTrades,
    wins,
    losses,
    winRate,
    avgRR,
    maxDrawdown,
    profitFactor,
  };
}

/**
 * Format backtest result for display
 * 
 * @param result - Backtest result
 * @returns Formatted strings for each metric
 */
export function formatBacktestResult(result: AutoBacktestResult): {
  profit: string;
  winRate: string;
  avgRR: string;
  trades: string;
  profitFactor: string;
  maxDrawdown: string;
} {
  return {
    profit: `$${result.results.totalPL.toFixed(2)}`,
    winRate: `${result.results.winRate.toFixed(1)}%`,
    avgRR: result.results.avgRR.toFixed(2),
    trades: result.results.totalTrades.toString(),
    profitFactor: result.results.profitFactor.toFixed(2),
    maxDrawdown: 'N/A', // Not currently calculated
  };
}

/**
 * Validate parameter ranges are sensible
 * 
 * @param ranges - Parameter ranges to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateParameterRanges(ranges: any): string[] {
  const errors: string[] = [];
  
  // Helper to validate a single range
  const validateRange = (name: string, range: { min: number; max: number; step: number }) => {
    if (range.step <= 0) {
      errors.push(`${name}: step must be greater than 0`);
    }
    if (range.min > range.max) {
      errors.push(`${name}: min must be less than or equal to max`);
    }
    if (range.min < 0) {
      errors.push(`${name}: min must be non-negative`);
    }
  };
  
  // Validate all ranges
  if (ranges.swingLength) validateRange('Swing Length', ranges.swingLength);
  if (ranges.wickRatio) validateRange('Wick Ratio', ranges.wickRatio);
  if (ranges.confirmCandles) validateRange('Confirm Candles', ranges.confirmCandles);
  
  if (ranges.tp1RR) validateRange('TP1 R:R', ranges.tp1RR);
  if (ranges.tp1SwingLength) validateRange('TP1 Swing Length', ranges.tp1SwingLength);
  if (ranges.tp1TrailingSwing) validateRange('TP1 Trailing Swing', ranges.tp1TrailingSwing);
  if (ranges.tp1EMAFast) validateRange('TP1 EMA Fast', ranges.tp1EMAFast);
  if (ranges.tp1EMASlow) validateRange('TP1 EMA Slow', ranges.tp1EMASlow);
  
  if (ranges.tp2RR) validateRange('TP2 R:R', ranges.tp2RR);
  if (ranges.tp2SwingLength) validateRange('TP2 Swing Length', ranges.tp2SwingLength);
  if (ranges.tp2TrailingSwing) validateRange('TP2 Trailing Swing', ranges.tp2TrailingSwing);
  if (ranges.tp2EMAFast) validateRange('TP2 EMA Fast', ranges.tp2EMAFast);
  if (ranges.tp2EMASlow) validateRange('TP2 EMA Slow', ranges.tp2EMASlow);
  
  if (ranges.tp3RR) validateRange('TP3 R:R', ranges.tp3RR);
  if (ranges.tp3SwingLength) validateRange('TP3 Swing Length', ranges.tp3SwingLength);
  if (ranges.tp3TrailingSwing) validateRange('TP3 Trailing Swing', ranges.tp3TrailingSwing);
  if (ranges.tp3EMAFast) validateRange('TP3 EMA Fast', ranges.tp3EMAFast);
  if (ranges.tp3EMASlow) validateRange('TP3 EMA Slow', ranges.tp3EMASlow);
  
  if (ranges.slATR) validateRange('SL ATR', ranges.slATR);
  if (ranges.slSwingLength) validateRange('SL Swing Length', ranges.slSwingLength);
  if (ranges.slFixedDistance) validateRange('SL Fixed Distance', ranges.slFixedDistance);
  
  return errors;
}

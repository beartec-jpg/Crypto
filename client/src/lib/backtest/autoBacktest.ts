/**
 * Auto-backtest runner
 * Phase 4: Extracted from CryptoIndicators.tsx
 */

import type { AutoBacktestConfig, AutoBacktestResult } from './types';
import type { BacktestResults, BacktestTrade, TradeSignal } from '@/types/trading.types';
import { generateParameterCombinations } from './parameterGenerator';
import { sortBacktestResults } from './backtestHelpers';

/**
 * Run auto-backtest with all parameter combinations
 * 
 * Main auto-backtest orchestration function that:
 * - Generates all parameter combinations
 * - Runs backtest for each combination
 * - Tracks progress with callback
 * - Returns sorted results
 * - Handles errors and duration tracking
 * 
 * @param config - Auto-backtest configuration
 * @returns Array of backtest results sorted by total profit
 */
export async function runAutoBacktest(
  config: AutoBacktestConfig
): Promise<AutoBacktestResult[]> {
  const { candles, ranges, parameterTests, strategySettings, generateSignal, simulateTrade, onProgress } = config;
  
  // Validate minimum data
  if (candles.length < 100) {
    throw new Error('Need at least 100 candles for backtest');
  }
  
  const startTime = performance.now();
  
  // Generate all parameter combinations
  const combinations = generateParameterCombinations(ranges, parameterTests, {
    numTPs: strategySettings.numTPs,
    tp1PositionPercent: strategySettings.tp1PositionPercent,
    tp2PositionPercent: strategySettings.tp2PositionPercent,
    tp3PositionPercent: strategySettings.tp3PositionPercent,
  });
  
  const results: AutoBacktestResult[] = [];
  
  console.log(`🚀 Starting auto-backtest with ${combinations.length} configurations...`);
  
  // Test each combination
  for (let i = 0; i < combinations.length; i++) {
    const testConfig = combinations[i];
    
    // Update progress
    if (onProgress) {
      const progress = Math.round((i / combinations.length) * 100);
      onProgress(progress);
    }
    
    // Run a backtest for this config
    const allSignals: TradeSignal[] = [];
    const completedTrades: BacktestTrade[] = [];
    let lastTradeExitTime = 0;
    
    // Simulate trades for this configuration
    for (let j = 50; j < candles.length - 10; j++) {
      const currentTime = candles[j].time;
      if (currentTime < lastTradeExitTime) continue;
      
      const dataSlice = candles.slice(0, j + 1);
      
      // Generate signal with test configuration
      const signal = generateSignal(dataSlice, true, {
        swingLength: testConfig.swingLength,
        wickRatio: testConfig.wickRatio,
        confirmCandles: testConfig.confirmCandles,
        useWickFilter: testConfig.useWickFilter,
        useConfirmCandles: testConfig.useConfirmCandles,
        trendFilter: testConfig.trendFilter,
        directionFilter: testConfig.direction,
        tpslConfig: testConfig
      });
      
      if (signal && !allSignals.some(s => s.id === signal.id)) {
        allSignals.push(signal);
        const trade = simulateTrade(signal, j, candles);
        if (trade) {
          completedTrades.push(trade);
          lastTradeExitTime = trade.exitTime;
        }
      }
    }
    
    // Calculate results
    const winners = completedTrades.filter(t => t.winner).length;
    const losers = completedTrades.filter(t => !t.winner).length;
    const totalPL = completedTrades.reduce((sum, t) => sum + t.profitLoss, 0);
    const avgRR = completedTrades.length > 0 
      ? completedTrades.reduce((sum, t) => sum + t.rr, 0) / completedTrades.length 
      : 0;
    const winRate = completedTrades.length > 0 
      ? (winners / completedTrades.length) * 100 
      : 0;
    
    const grossProfit = completedTrades.filter(t => t.winner).reduce((sum, t) => sum + t.profitLoss, 0);
    const grossLoss = Math.abs(completedTrades.filter(t => !t.winner).reduce((sum, t) => sum + t.profitLoss, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    
    const finalBalance = strategySettings.accountSize + totalPL;
    const returnPercent = ((finalBalance - strategySettings.accountSize) / strategySettings.accountSize) * 100;
    
    const backtestResults: BacktestResults = {
      trades: completedTrades,
      totalTrades: completedTrades.length,
      winners,
      losers,
      winRate,
      avgRR,
      totalPL,
      profitFactor,
      accountSize: strategySettings.accountSize,
      riskPerTrade: strategySettings.riskPercent,
      avgPositionSize: 0,
      finalBalance,
      returnPercent
    };
    
    // Create description - only show configured TPs
    let desc = `Swing:${testConfig.swingLength}`;
    if (testConfig.useWickFilter) desc += ` | Wick:${testConfig.wickRatio}%`;
    if (testConfig.useConfirmCandles) desc += ` | Confirm:${testConfig.confirmCandles}`;
    desc += ` | Trend:${testConfig.trendFilter} | Dir:${testConfig.direction}`;
    desc += ` | TP1:${testConfig.tp1.type}`;
    if (testConfig.tp1.type === 'atr') desc += `(${testConfig.tp1.atrMultiplier}x)`;
    if (testConfig.tp1.type === 'fixed_rr') desc += `(${testConfig.tp1.fixedRR}:1)`;
    if (testConfig.tp1.type === 'structure') desc += `(sw${testConfig.tp1.swingLength})`;
    
    if (testConfig.numTPs >= 2 && testConfig.tp2) {
      desc += ` | TP2:${testConfig.tp2.type}`;
      if (testConfig.tp2.type === 'atr') desc += `(${testConfig.tp2.atrMultiplier}x)`;
      if (testConfig.tp2.type === 'fixed_rr') desc += `(${testConfig.tp2.fixedRR}:1)`;
      if (testConfig.tp2.type === 'structure') desc += `(sw${testConfig.tp2.swingLength})`;
    }
    
    if (testConfig.numTPs === 3 && testConfig.tp3) {
      desc += ` | TP3:${testConfig.tp3.type}`;
      if (testConfig.tp3.type === 'atr') desc += `(${testConfig.tp3.atrMultiplier}x)`;
      if (testConfig.tp3.type === 'structure') desc += `(sw${testConfig.tp3.swingLength})`;
    }
    
    desc += ` | SL:${testConfig.sl.type}`;
    if (testConfig.sl.type === 'atr') desc += `(${testConfig.sl.atrMultiplier}x)`;
    if (testConfig.sl.type === 'structure') desc += `(sw${testConfig.sl.swingLength})`;
    if (testConfig.sl.type === 'fixed_distance') desc += `(${testConfig.sl.distancePercent}%)`;
    
    results.push({
      config: testConfig,
      results: backtestResults,
      configDescription: desc,
      swingLength: testConfig.swingLength,
      wickRatio: testConfig.wickRatio || 100,
      confirmCandles: testConfig.confirmCandles || 0,
      useWickFilter: testConfig.useWickFilter || false,
      useConfirmCandles: testConfig.useConfirmCandles || false,
      trendFilter: testConfig.trendFilter,
      allowedDirections: testConfig.direction
    });
    
    // Allow UI to update
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // Sort by total profit (default)
  const sortedResults = sortBacktestResults(results, 'profit', false);
  
  // Track duration
  const duration = performance.now() - startTime;
  
  // Final progress update
  if (onProgress) {
    onProgress(100);
  }
  
  console.log('✅ Auto-backtest complete!', {
    totalConfigs: sortedResults.length,
    bestProfit: sortedResults[0]?.results.totalPL.toFixed(2),
    bestConfig: sortedResults[0]?.configDescription,
    duration: `${(duration / 1000).toFixed(1)}s`
  });
  
  return sortedResults;
}

/**
 * Trade simulation logic extracted from CryptoIndicators.tsx
 * Handles backtest trade simulation with TP/SL logic, EMA/VWAP exits, and trailing stops
 */

import type { CandleData, VWAPData } from '@/types/chart.types';
import type { TradeSignal, BacktestTrade, BotTPSLConfig } from '@/types/trading.types';
import { calculateEMA } from '@/lib/indicators/momentum';
import { calculateSwings } from '@/lib/smc/pivots';

/**
 * Helper to calculate periodic VWAP (daily, weekly, monthly)
 */
function calculatePeriodicVWAP(data: CandleData[], period: string, currentOnly: boolean): VWAPData[] {
  if (data.length === 0) return [];
  const result: VWAPData[] = [];
  
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  let lastPeriodStart = 0;
  
  // Helper to check if next candle is in a different period
  const isNextPeriodBoundary = (currentIdx: number, currentDate: Date): boolean => {
    if (currentIdx >= data.length - 1) return true;
    
    const nextDate = new Date(data[currentIdx + 1].time * 1000);
    
    if (period === 'daily') {
      return nextDate.getUTCDate() !== currentDate.getUTCDate();
    } else if (period === 'weekly') {
      const getWeekNumber = (d: Date) => {
        const firstDayOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getUTCDay() + 1) / 7);
      };
      return getWeekNumber(nextDate) !== getWeekNumber(currentDate);
    } else if (period === 'monthly') {
      return nextDate.getUTCMonth() !== currentDate.getUTCMonth();
    }
    return false;
  };
  
  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    const date = new Date(candle.time * 1000);
    
    let shouldReset = false;
    if (period === 'daily') {
      const prevDate = i > 0 ? new Date(data[i - 1].time * 1000) : null;
      shouldReset = prevDate && date.getUTCDate() !== prevDate.getUTCDate();
    } else if (period === 'weekly') {
      const getWeekNumber = (d: Date) => {
        const firstDayOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getUTCDay() + 1) / 7);
      };
      const prevDate = i > 0 ? new Date(data[i - 1].time * 1000) : null;
      shouldReset = prevDate && getWeekNumber(date) !== getWeekNumber(prevDate);
    } else if (period === 'monthly') {
      const prevDate = i > 0 ? new Date(data[i - 1].time * 1000) : null;
      shouldReset = prevDate && date.getUTCMonth() !== prevDate.getUTCMonth();
    }
    
    if (shouldReset) {
      cumulativePV = 0;
      cumulativeVolume = 0;
      lastPeriodStart = i;
    }
    
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    
    const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typicalPrice;
    
    if (currentOnly) {
      if (isNextPeriodBoundary(i, date)) {
        for (let j = lastPeriodStart; j <= i; j++) {
          result.push({ time: data[j].time, value: vwap });
        }
      }
    } else {
      result.push({ time: candle.time, value: vwap });
    }
  }
  
  return result;
}

/**
 * Helper to calculate rolling VWAP
 */
function calculateRollingVWAP(data: CandleData[], count: number): VWAPData[] {
  const result: VWAPData[] = [];
  for (let i = count - 1; i < data.length; i++) {
    const window = data.slice(i - count + 1, i + 1);
    let cumulativePV = 0;
    let cumulativeVolume = 0;
    
    for (const candle of window) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativePV += typicalPrice * candle.volume;
      cumulativeVolume += candle.volume;
    }
    
    const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : 0;
    result.push({ time: data[i].time, value: vwap });
  }
  
  return result;
}

/**
 * Helper to calculate weighted R:R based on TP config
 */
function calculateWeightedRR(
  config: BotTPSLConfig,
  exitType: 'TP1' | 'TP2' | 'TP3',
  rr1: number,
  rr2: number,
  rr3: number
): number {
  const numTPs = config.numTPs;
  
  if (numTPs === 1) return rr1;
  if (numTPs === 2) {
    const tp1Percent = config.tp1.positionPercent / 100;
    const tp2Percent = config.tp2!.positionPercent / 100;
    if (exitType === 'TP1') return rr1 * tp1Percent;
    if (exitType === 'TP2') return rr1 * tp1Percent + rr2 * tp2Percent;
  }
  if (numTPs === 3) {
    const tp1Percent = config.tp1.positionPercent / 100;
    const tp2Percent = config.tp2!.positionPercent / 100;
    const tp3Percent = config.tp3!.positionPercent / 100;
    if (exitType === 'TP1') return rr1 * tp1Percent;
    if (exitType === 'TP2') return rr1 * tp1Percent + rr2 * tp2Percent;
    if (exitType === 'TP3') return rr1 * tp1Percent + rr2 * tp2Percent + rr3 * tp3Percent;
  }
  
  return rr1;
}

/**
 * Get config for a specific strategy
 */
function getConfigForStrategy(
  strategy: string,
  configs: {
    liqGrabTPSL: BotTPSLConfig;
    bosTPSL: BotTPSLConfig;
    chochTPSL: BotTPSLConfig;
    vwapTPSL: BotTPSLConfig;
    rsFlipTPSL: BotTPSLConfig;
    emaTradingTPSL: BotTPSLConfig;
  }
): BotTPSLConfig {
  if (strategy === 'liquidity_grab') return configs.liqGrabTPSL;
  if (strategy === 'bos_trend') return configs.bosTPSL;
  if (strategy === 'choch_fvg') return configs.chochTPSL;
  if (strategy === 'vwap_rejection') return configs.vwapTPSL;
  if (strategy === 'rs_flip') return configs.rsFlipTPSL;
  if (strategy === 'ema_trading') return configs.emaTradingTPSL;
  return configs.liqGrabTPSL;
}

export interface SimulateTradeOptions {
  vwapType?: string;
  commissionRate?: number;
  slippageBps?: number;
  liqGrabTPSL: BotTPSLConfig;
  bosTPSL: BotTPSLConfig;
  chochTPSL: BotTPSLConfig;
  vwapTPSL: BotTPSLConfig;
  rsFlipTPSL: BotTPSLConfig;
  emaTradingTPSL: BotTPSLConfig;
  chochTPSwingLength: number;
  liqGrabTPSwingLength: number;
}

/**
 * Simulate a trade from signal to exit
 * Returns BacktestTrade with outcome or null if trade doesn't close
 */
export function simulateTrade(
  signal: TradeSignal,
  startIdx: number,
  data: CandleData[],
  options: SimulateTradeOptions
): BacktestTrade | null {
  const {
    vwapType = 'weekly',
    commissionRate = 0.001,
    slippageBps = 0.0005,
    liqGrabTPSL,
    bosTPSL,
    chochTPSL,
    vwapTPSL,
    rsFlipTPSL,
    emaTradingTPSL,
    chochTPSwingLength,
    liqGrabTPSwingLength,
  } = options;

  const isLong = signal.type === 'LONG';
  
  let currentStopLoss = signal.stopLoss;
  let tp1Hit = false;
  
  // Check if any TP is set to EMA exit or VWAP exit
  const hasEMAExit = signal.tp1Type === 'ema' || signal.tp2Type === 'ema' || signal.tp3Type === 'ema';
  const hasVWAPExit = signal.tp1Type === 'vwap' || signal.tp2Type === 'vwap' || signal.tp3Type === 'vwap';
  
  // Calculate EMAs if needed for EMA exit - use TP config settings
  let emaFast: number[] = [];
  let emaSlow: number[] = [];
  let emaExitMode: 'touch' | 'crossover' = 'crossover'; // Default
  if (hasEMAExit) {
    const closes = data.map(c => c.close);
    // Get EMA settings from the first TP that has EMA exit configured
    let emaFastPeriodToUse = 10; // Default
    let emaSlowPeriodToUse = 40; // Default
    
    if (signal.tp1Type === 'ema' && signal.tp1Config) {
      emaFastPeriodToUse = signal.tp1Config.emaFast || 10;
      emaSlowPeriodToUse = signal.tp1Config.emaSlow || 40;
      emaExitMode = signal.tp1Config.emaExitMode || 'crossover';
    } else if (signal.tp2Type === 'ema' && signal.tp2Config) {
      emaFastPeriodToUse = signal.tp2Config.emaFast || 10;
      emaSlowPeriodToUse = signal.tp2Config.emaSlow || 40;
      emaExitMode = signal.tp2Config.emaExitMode || 'crossover';
    } else if (signal.tp3Type === 'ema' && signal.tp3Config) {
      emaFastPeriodToUse = signal.tp3Config.emaFast || 10;
      emaSlowPeriodToUse = signal.tp3Config.emaSlow || 40;
      emaExitMode = signal.tp3Config.emaExitMode || 'crossover';
    }
    
    emaFast = calculateEMA(closes, emaFastPeriodToUse);
    emaSlow = calculateEMA(closes, emaSlowPeriodToUse);
  }
  
  // Calculate VWAP if needed for VWAP exit
  let vwapValues: VWAPData[] = [];
  if (hasVWAPExit) {
    // Use the strategy's VWAP type setting
    if (signal.strategy === 'vwap_rejection') {
      if (vwapType === 'daily') vwapValues = calculatePeriodicVWAP(data, 'daily', true);
      else if (vwapType === 'weekly') vwapValues = calculatePeriodicVWAP(data, 'weekly', true);
      else if (vwapType === 'monthly') vwapValues = calculatePeriodicVWAP(data, 'monthly', true);
      else if (vwapType === 'rolling10') vwapValues = calculateRollingVWAP(data, 10);
      else if (vwapType === 'rolling20') vwapValues = calculateRollingVWAP(data, 20);
      else if (vwapType === 'rolling50') vwapValues = calculateRollingVWAP(data, 50);
      else vwapValues = calculatePeriodicVWAP(data, 'weekly', true); // default
    } else {
      // For other strategies, default to weekly VWAP
      vwapValues = calculatePeriodicVWAP(data, 'weekly', true);
    }
  }
  
  // Search forward from the signal to find which level hits first
  for (let i = startIdx + 1; i < data.length; i++) {
    const candle = data[i];
    
    if (isLong) {
      // Check SL first (more conservative)
      if (candle.low <= currentStopLoss) {
        const rawPL = (currentStopLoss - signal.entry) * signal.quantity;
        const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(currentStopLoss * commissionRate)) * signal.quantity;
        const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(currentStopLoss * slippageBps)) * signal.quantity;
        const netPL = rawPL - commission - slippage;
        
        return {
          id: signal.id,
          entryTime: signal.time,
          exitTime: candle.time,
          direction: 'long',
          strategy: signal.strategy,
          entry: signal.entry,
          exit: currentStopLoss,
          stopLoss: signal.stopLoss,
          tp1: signal.tp1,
          tp2: signal.tp2,
          tp3: signal.tp3,
          outcome: tp1Hit ? 'Breakeven' : 'SL',
          rr: tp1Hit ? 0 : -1,
          profitLoss: netPL,
          winner: tp1Hit ? (netPL >= 0) : false,
        };
      }
      
      // Check for EMA Exit - supports both Touch and Crossover modes
      if (hasEMAExit && i > 0 && emaFast.length > i && emaSlow.length > i) {
        let shouldExit = false;
        
        if (emaExitMode === 'crossover') {
          // CROSSOVER MODE: Directional exit - LONG only exits on bearish crossover
          const prevFast = emaFast[i - 1];
          const prevSlow = emaSlow[i - 1];
          const currFast = emaFast[i];
          const currSlow = emaSlow[i];
          
          const prevState = prevFast >= prevSlow ? 'fast_above_slow' : 'fast_below_slow';
          const currState = currFast >= currSlow ? 'fast_above_slow' : 'fast_below_slow';
          
          // LONG: Only exit on bearish crossover (fast crosses below slow)
          if (signal.entryEMAState) {
            const crossedOver = (prevState === signal.entryEMAState) && (currState !== signal.entryEMAState);
            const isBearishCross = currState === 'fast_below_slow';
            shouldExit = crossedOver && isBearishCross;
          }
        } else {
          // TOUCH MODE: LONG exits when price touches or crosses below slow EMA
          const slowEMA = emaSlow[i];
          const prevClose = data[i - 1].close;
          
          // Was above, now at or below slow EMA
          shouldExit = prevClose > slowEMA && candle.close <= slowEMA;
        }
        
        if (shouldExit) {
          const exitPrice = candle.close;
          const rawPL = (exitPrice - signal.entry) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(exitPrice * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(exitPrice * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'long',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: exitPrice,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: 'EMA Exit',
            rr: (exitPrice - signal.entry) / (signal.entry - signal.stopLoss),
            profitLoss: netPL,
            winner: netPL > 0,
          };
        }
      }
      
      // Check for VWAP Exit - LONG exits when price crosses below VWAP
      if (hasVWAPExit && i > 0 && vwapValues.length > i) {
        const prevVWAP = vwapValues[i - 1]?.value;
        const currVWAP = vwapValues[i]?.value;
        const prevClose = data[i - 1].close;
        const currClose = candle.close;
        
        if (prevVWAP && currVWAP) {
          // LONG exit: price crosses below VWAP (was above, now below)
          const wasAboveVWAP = prevClose > prevVWAP;
          const nowBelowVWAP = currClose < currVWAP;
          
          if (wasAboveVWAP && nowBelowVWAP) {
            const exitPrice = candle.close;
            const rawPL = (exitPrice - signal.entry) * signal.quantity;
            const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(exitPrice * commissionRate)) * signal.quantity;
            const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(exitPrice * slippageBps)) * signal.quantity;
            const netPL = rawPL - commission - slippage;
            
            return {
              id: signal.id,
              entryTime: signal.time,
              exitTime: candle.time,
              direction: 'long',
              strategy: signal.strategy,
              entry: signal.entry,
              exit: exitPrice,
              stopLoss: signal.stopLoss,
              tp1: signal.tp1,
              tp2: signal.tp2,
              tp3: signal.tp3,
              outcome: 'VWAP Exit',
              rr: (exitPrice - signal.entry) / (signal.entry - signal.stopLoss),
              profitLoss: netPL,
              winner: netPL > 0,
            };
          }
        }
      }
      
      // Get bot config to check numTPs
      let numTPs = 3;
      if (signal.strategy === 'liquidity_grab') numTPs = liqGrabTPSL.numTPs;
      else if (signal.strategy === 'bos_trend') numTPs = bosTPSL.numTPs;
      else if (signal.strategy === 'choch_fvg') numTPs = chochTPSL.numTPs;
      else if (signal.strategy === 'vwap_rejection') numTPs = vwapTPSL.numTPs;
      
      // TRAILING TP LOGIC FOR LONGS
      if (signal.tp1Type === 'trailing' && signal.strategy === 'choch_fvg') {
        const isInProfit = candle.close > signal.entry;
        const dataUpToNow = data.slice(0, i + 1);
        
        if (signal.trailingActive === false) {
          // Trailing not activated yet - check if we should activate it
          if (isInProfit) {
            const swings = calculateSwings(dataUpToNow, chochTPSwingLength);
            // Find pivot lows below current price (potential exit points)
            const pivotLows = swings.filter(s => 
              s.type === 'low' && 
              s.value < candle.close &&
              s.value > signal.entry && // Must be in profit zone
              s.index < i // Must have formed before current candle
            ).sort((a, b) => b.value - a.value); // Highest pivot first
            
            if (pivotLows.length > 0) {
              // Activate trailing at the nearest pivot low
              signal.tp1 = pivotLows[0].value;
              signal.tp2 = signal.tp1;
              signal.tp3 = signal.tp1;
              signal.trailingActive = true;
              
              console.log('✅ LONG Trailing TP Activated:', {
                entry: signal.entry.toFixed(4),
                currentPrice: candle.close.toFixed(4),
                trailingTP: signal.tp1.toFixed(4),
                pivotTime: new Date(pivotLows[0].time * 1000).toLocaleString(),
              });
            }
          }
        } else {
          // Trailing already active - update to new pivots if they form
          const swings = calculateSwings(dataUpToNow, chochTPSwingLength);
          const pivotLows = swings.filter(s => 
            s.type === 'low' && 
            s.value > signal.tp1 && // Must be higher than current TP
            s.value < candle.close && // Must be below current price
            s.index < i // Must have formed before current candle
          ).sort((a, b) => b.value - a.value); // Highest pivot first
          
          if (pivotLows.length > 0) {
            signal.tp1 = pivotLows[0].value;
            signal.tp2 = signal.tp1;
            signal.tp3 = signal.tp1;
            
            console.log('📈 LONG Trailing TP Updated:', {
              newTP: signal.tp1.toFixed(4),
              currentPrice: candle.close.toFixed(4),
              pivotTime: new Date(pivotLows[0].time * 1000).toLocaleString(),
            });
          }
        }
      }
      
      // TRAILING TP LOGIC FOR LIQUIDITY GRAB LONGS
      if (signal.tp1Type === 'trailing' && signal.strategy === 'liquidity_grab') {
        const isInProfit = candle.close > signal.entry;
        const dataUpToNow = data.slice(0, i + 1);
        
        if (signal.trailingActive === false) {
          // Trailing not activated yet - check if we should activate it
          if (isInProfit) {
            const swings = calculateSwings(dataUpToNow, liqGrabTPSwingLength);
            // Find pivot lows below current price (potential exit points)
            const pivotLows = swings.filter(s => 
              s.type === 'low' && 
              s.value < candle.close &&
              s.value > signal.entry && // Must be in profit zone
              s.index < i // Must have formed before current candle
            ).sort((a, b) => b.value - a.value); // Highest pivot first
            
            if (pivotLows.length > 0) {
              // Activate trailing at the nearest pivot low
              signal.tp1 = pivotLows[0].value;
              signal.tp2 = signal.tp1;
              signal.tp3 = signal.tp1;
              signal.trailingActive = true;
              
              console.log('✅ LIQUIDITY GRAB LONG Trailing TP Activated:', {
                entry: signal.entry.toFixed(4),
                currentPrice: candle.close.toFixed(4),
                trailingTP: signal.tp1.toFixed(4),
                pivotTime: new Date(pivotLows[0].time * 1000).toLocaleString(),
              });
            }
          }
        } else {
          // Trailing already active - update to new pivots if they form
          const swings = calculateSwings(dataUpToNow, liqGrabTPSwingLength);
          const pivotLows = swings.filter(s => 
            s.type === 'low' && 
            s.value > signal.tp1 && // Must be higher than current TP
            s.value < candle.close && // Must be below current price
            s.index < i // Must have formed before current candle
          ).sort((a, b) => b.value - a.value); // Highest pivot first
          
          if (pivotLows.length > 0) {
            signal.tp1 = pivotLows[0].value;
            signal.tp2 = signal.tp1;
            signal.tp3 = signal.tp1;
            
            console.log('📈 LIQUIDITY GRAB LONG Trailing TP Updated:', {
              newTP: signal.tp1.toFixed(4),
              currentPrice: candle.close.toFixed(4),
              pivotTime: new Date(pivotLows[0].time * 1000).toLocaleString(),
            });
          }
        }
      }
      
      // Check TPs in order: TP1, then TP2, then TP3
      // Exit at first configured TP hit
      if (!tp1Hit && candle.high >= signal.tp1) {
        if (numTPs === 1) {
          // Only 1 TP configured - exit full position at TP1
          const rawPL = (signal.tp1 - signal.entry) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp1 * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp1 * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          const weightedRR = calculateWeightedRR(getConfigForStrategy(signal.strategy, { liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, rsFlipTPSL, emaTradingTPSL }), 'TP1', signal.riskReward1, signal.riskReward2, signal.riskReward3);
          
          console.log('💰 LONG TP1 Hit:', {
            strategy: signal.strategy,
            entry: signal.entry,
            exit: signal.tp1,
            quantity: signal.quantity,
            rawPL,
            commission,
            slippage,
            netPL,
            calculation: `(${signal.tp1} - ${signal.entry}) * ${signal.quantity} = ${rawPL}`
          });
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'long',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: signal.tp1,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: 'TP1',
            rr: weightedRR,
            profitLoss: netPL,
            winner: true,
          };
        } else {
          // Multiple TPs - move SL to entry and continue
          tp1Hit = true;
          currentStopLoss = signal.entry;
          continue;
        }
      }
      
      if (tp1Hit && numTPs >= 2 && candle.high >= signal.tp2) {
        if (numTPs === 2) {
          // Only 2 TPs configured - exit remaining position at TP2
          const rawPL = (signal.tp2 - signal.entry) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp2 * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp2 * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          const weightedRR = calculateWeightedRR(getConfigForStrategy(signal.strategy, { liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, rsFlipTPSL, emaTradingTPSL }), 'TP2', signal.riskReward1, signal.riskReward2, signal.riskReward3);
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'long',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: signal.tp2,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: 'TP2',
            rr: weightedRR,
            profitLoss: netPL,
            winner: true,
          };
        }
      }
      
      if (tp1Hit && numTPs >= 3 && candle.high >= signal.tp3) {
        const rawPL = (signal.tp3 - signal.entry) * signal.quantity;
        const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp3 * commissionRate)) * signal.quantity;
        const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp3 * slippageBps)) * signal.quantity;
        const netPL = rawPL - commission - slippage;
        const weightedRR = calculateWeightedRR(getConfigForStrategy(signal.strategy, { liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, rsFlipTPSL, emaTradingTPSL }), 'TP3', signal.riskReward1, signal.riskReward2, signal.riskReward3);
        
        return {
          id: signal.id,
          entryTime: signal.time,
          exitTime: candle.time,
          direction: 'long',
          strategy: signal.strategy,
          entry: signal.entry,
          exit: signal.tp3,
          stopLoss: signal.stopLoss,
          tp1: signal.tp1,
          tp2: signal.tp2,
          tp3: signal.tp3,
          outcome: 'TP3',
          rr: weightedRR,
          profitLoss: netPL,
          winner: true,
        };
      }
    } else {
      // SHORT trade
      if (candle.high >= currentStopLoss) {
        const rawPL = (signal.entry - currentStopLoss) * signal.quantity;
        const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(currentStopLoss * commissionRate)) * signal.quantity;
        const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(currentStopLoss * slippageBps)) * signal.quantity;
        const netPL = rawPL - commission - slippage;
        
        return {
          id: signal.id,
          entryTime: signal.time,
          exitTime: candle.time,
          direction: 'short',
          strategy: signal.strategy,
          entry: signal.entry,
          exit: currentStopLoss,
          stopLoss: signal.stopLoss,
          tp1: signal.tp1,
          tp2: signal.tp2,
          tp3: signal.tp3,
          outcome: tp1Hit ? 'Breakeven' : 'SL',
          rr: tp1Hit ? 0 : -1,
          profitLoss: netPL,
          winner: tp1Hit ? (netPL >= 0) : false,
        };
      }
      
      // Check for EMA Exit - supports both Touch and Crossover modes
      if (hasEMAExit && i > 0 && emaFast.length > i && emaSlow.length > i) {
        let shouldExit = false;
        
        if (emaExitMode === 'crossover') {
          // CROSSOVER MODE: Directional exit - SHORT only exits on bullish crossover
          const prevFast = emaFast[i - 1];
          const prevSlow = emaSlow[i - 1];
          const currFast = emaFast[i];
          const currSlow = emaSlow[i];
          
          const prevState = prevFast >= prevSlow ? 'fast_above_slow' : 'fast_below_slow';
          const currState = currFast >= currSlow ? 'fast_above_slow' : 'fast_below_slow';
          
          // SHORT: Only exit on bullish crossover (fast crosses above slow)
          if (signal.entryEMAState) {
            const crossedOver = (prevState === signal.entryEMAState) && (currState !== signal.entryEMAState);
            const isBullishCross = currState === 'fast_above_slow';
            shouldExit = crossedOver && isBullishCross;
          }
        } else {
          // TOUCH MODE: SHORT exits when price touches or crosses above slow EMA
          const slowEMA = emaSlow[i];
          const prevClose = data[i - 1].close;
          
          // Was below, now at or above slow EMA
          shouldExit = prevClose < slowEMA && candle.close >= slowEMA;
        }
        
        if (shouldExit) {
          const exitPrice = candle.close;
          const rawPL = (signal.entry - exitPrice) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(exitPrice * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(exitPrice * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'short',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: exitPrice,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: 'EMA Exit',
            rr: (signal.entry - exitPrice) / (signal.stopLoss - signal.entry),
            profitLoss: netPL,
            winner: netPL > 0,
          };
        }
      }
      
      // Check for VWAP Exit - SHORT exits when price crosses above VWAP
      if (hasVWAPExit && i > 0 && vwapValues.length > i) {
        const prevVWAP = vwapValues[i - 1]?.value;
        const currVWAP = vwapValues[i]?.value;
        const prevClose = data[i - 1].close;
        const currClose = candle.close;
        
        if (prevVWAP && currVWAP) {
          // SHORT exit: price crosses above VWAP (was below, now above)
          const wasBelowVWAP = prevClose < prevVWAP;
          const nowAboveVWAP = currClose > currVWAP;
          
          if (wasBelowVWAP && nowAboveVWAP) {
            const exitPrice = candle.close;
            const rawPL = (signal.entry - exitPrice) * signal.quantity;
            const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(exitPrice * commissionRate)) * signal.quantity;
            const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(exitPrice * slippageBps)) * signal.quantity;
            const netPL = rawPL - commission - slippage;
            
            return {
              id: signal.id,
              entryTime: signal.time,
              exitTime: candle.time,
              direction: 'short',
              strategy: signal.strategy,
              entry: signal.entry,
              exit: exitPrice,
              stopLoss: signal.stopLoss,
              tp1: signal.tp1,
              tp2: signal.tp2,
              tp3: signal.tp3,
              outcome: 'VWAP Exit',
              rr: (signal.entry - exitPrice) / (signal.stopLoss - signal.entry),
              profitLoss: netPL,
              winner: netPL > 0,
            };
          }
        }
      }
      
      // Get bot config to check numTPs (same as LONG side)
      let numTPs = 3;
      if (signal.strategy === 'liquidity_grab') numTPs = liqGrabTPSL.numTPs;
      else if (signal.strategy === 'bos_trend') numTPs = bosTPSL.numTPs;
      else if (signal.strategy === 'choch_fvg') numTPs = chochTPSL.numTPs;
      else if (signal.strategy === 'vwap_rejection') numTPs = vwapTPSL.numTPs;
      
      // TRAILING TP LOGIC FOR SHORTS
      if (signal.tp1Type === 'trailing' && signal.strategy === 'choch_fvg') {
        const isInProfit = candle.close < signal.entry;
        const dataUpToNow = data.slice(0, i + 1);
        
        if (signal.trailingActive === false) {
          // Trailing not activated yet - check if we should activate it
          if (isInProfit) {
            const swings = calculateSwings(dataUpToNow, chochTPSwingLength);
            // Find pivot highs above current price (potential exit points)
            const pivotHighs = swings.filter(s => 
              s.type === 'high' && 
              s.value > candle.close &&
              s.value < signal.entry && // Must be in profit zone
              s.index < i // Must have formed before current candle
            ).sort((a, b) => a.value - b.value); // Lowest pivot first
            
            if (pivotHighs.length > 0) {
              // Activate trailing at the nearest pivot high
              signal.tp1 = pivotHighs[0].value;
              signal.tp2 = signal.tp1;
              signal.tp3 = signal.tp1;
              signal.trailingActive = true;
              
              console.log('✅ SHORT Trailing TP Activated:', {
                entry: signal.entry.toFixed(4),
                currentPrice: candle.close.toFixed(4),
                trailingTP: signal.tp1.toFixed(4),
                pivotTime: new Date(pivotHighs[0].time * 1000).toLocaleString(),
              });
            }
          }
        } else {
          // Trailing already active - update to new pivots if they form
          const swings = calculateSwings(dataUpToNow, chochTPSwingLength);
          const pivotHighs = swings.filter(s => 
            s.type === 'high' && 
            s.value < signal.tp1 && // Must be lower than current TP
            s.value > candle.close && // Must be above current price
            s.index < i // Must have formed before current candle
          ).sort((a, b) => a.value - b.value); // Lowest pivot first
          
          if (pivotHighs.length > 0) {
            signal.tp1 = pivotHighs[0].value;
            signal.tp2 = signal.tp1;
            signal.tp3 = signal.tp1;
            
            console.log('📉 SHORT Trailing TP Updated:', {
              newTP: signal.tp1.toFixed(4),
              currentPrice: candle.close.toFixed(4),
              pivotTime: new Date(pivotHighs[0].time * 1000).toLocaleString(),
            });
          }
        }
      }
      
      // TRAILING TP LOGIC FOR LIQUIDITY GRAB SHORTS
      if (signal.tp1Type === 'trailing' && signal.strategy === 'liquidity_grab') {
        const isInProfit = candle.close < signal.entry;
        const dataUpToNow = data.slice(0, i + 1);
        
        if (signal.trailingActive === false) {
          // Trailing not activated yet - check if we should activate it
          if (isInProfit) {
            const swings = calculateSwings(dataUpToNow, liqGrabTPSwingLength);
            // Find pivot highs above current price (potential exit points)
            const pivotHighs = swings.filter(s => 
              s.type === 'high' && 
              s.value > candle.close &&
              s.value < signal.entry && // Must be in profit zone
              s.index < i // Must have formed before current candle
            ).sort((a, b) => a.value - b.value); // Lowest pivot first
            
            if (pivotHighs.length > 0) {
              // Activate trailing at the nearest pivot high
              signal.tp1 = pivotHighs[0].value;
              signal.tp2 = signal.tp1;
              signal.tp3 = signal.tp1;
              signal.trailingActive = true;
              
              console.log('✅ LIQUIDITY GRAB SHORT Trailing TP Activated:', {
                entry: signal.entry.toFixed(4),
                currentPrice: candle.close.toFixed(4),
                trailingTP: signal.tp1.toFixed(4),
                pivotTime: new Date(pivotHighs[0].time * 1000).toLocaleString(),
              });
            }
          }
        } else {
          // Trailing already active - update to new pivots if they form
          const swings = calculateSwings(dataUpToNow, liqGrabTPSwingLength);
          const pivotHighs = swings.filter(s => 
            s.type === 'high' && 
            s.value < signal.tp1 && // Must be lower than current TP
            s.value > candle.close && // Must be above current price
            s.index < i // Must have formed before current candle
          ).sort((a, b) => a.value - b.value); // Lowest pivot first
          
          if (pivotHighs.length > 0) {
            signal.tp1 = pivotHighs[0].value;
            signal.tp2 = signal.tp1;
            signal.tp3 = signal.tp1;
            
            console.log('📉 LIQUIDITY GRAB SHORT Trailing TP Updated:', {
              newTP: signal.tp1.toFixed(4),
              currentPrice: candle.close.toFixed(4),
              pivotTime: new Date(pivotHighs[0].time * 1000).toLocaleString(),
            });
          }
        }
      }
      
      // Check TPs in order: TP1, then TP2, then TP3
      // Exit at first configured TP hit
      if (!tp1Hit && candle.low <= signal.tp1) {
        if (numTPs === 1) {
          // Only 1 TP configured - exit full position at TP1
          const rawPL = (signal.entry - signal.tp1) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp1 * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp1 * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          const weightedRR = calculateWeightedRR(getConfigForStrategy(signal.strategy, { liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, rsFlipTPSL, emaTradingTPSL }), 'TP1', signal.riskReward1, signal.riskReward2, signal.riskReward3);
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'short',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: signal.tp1,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: 'TP1',
            rr: weightedRR,
            profitLoss: netPL,
            winner: true,
          };
        } else {
          // Multiple TPs - move SL to entry and continue
          tp1Hit = true;
          currentStopLoss = signal.entry;
          continue;
        }
      }
      
      if (tp1Hit && numTPs >= 2 && candle.low <= signal.tp2) {
        if (numTPs === 2) {
          // Only 2 TPs configured - exit remaining position at TP2
          const rawPL = (signal.entry - signal.tp2) * signal.quantity;
          const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp2 * commissionRate)) * signal.quantity;
          const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp2 * slippageBps)) * signal.quantity;
          const netPL = rawPL - commission - slippage;
          const weightedRR = calculateWeightedRR(getConfigForStrategy(signal.strategy, { liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, rsFlipTPSL, emaTradingTPSL }), 'TP2', signal.riskReward1, signal.riskReward2, signal.riskReward3);
          
          return {
            id: signal.id,
            entryTime: signal.time,
            exitTime: candle.time,
            direction: 'short',
            strategy: signal.strategy,
            entry: signal.entry,
            exit: signal.tp2,
            stopLoss: signal.stopLoss,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            outcome: 'TP2',
            rr: weightedRR,
            profitLoss: netPL,
            winner: true,
          };
        }
      }
      
      if (tp1Hit && numTPs >= 3 && candle.low <= signal.tp3) {
        const rawPL = (signal.entry - signal.tp3) * signal.quantity;
        const commission = (Math.abs(signal.entry * commissionRate) + Math.abs(signal.tp3 * commissionRate)) * signal.quantity;
        const slippage = (Math.abs(signal.entry * slippageBps) + Math.abs(signal.tp3 * slippageBps)) * signal.quantity;
        const netPL = rawPL - commission - slippage;
        const weightedRR = calculateWeightedRR(getConfigForStrategy(signal.strategy, { liqGrabTPSL, bosTPSL, chochTPSL, vwapTPSL, rsFlipTPSL, emaTradingTPSL }), 'TP3', signal.riskReward1, signal.riskReward2, signal.riskReward3);
        
        return {
          id: signal.id,
          entryTime: signal.time,
          exitTime: candle.time,
          direction: 'short',
          strategy: signal.strategy,
          entry: signal.entry,
          exit: signal.tp3,
          stopLoss: signal.stopLoss,
          tp1: signal.tp1,
          tp2: signal.tp2,
          tp3: signal.tp3,
          outcome: 'TP3',
          rr: weightedRR,
          profitLoss: netPL,
          winner: true,
        };
      }
    }
  }
  
  return null; // Trade didn't close within available data
}

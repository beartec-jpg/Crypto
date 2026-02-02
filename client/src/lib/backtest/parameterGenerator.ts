/**
 * Parameter generation utilities for auto-backtest
 * Phase 4: Extracted from CryptoIndicators.tsx
 */

import { generateRangeValues } from '@/lib/chart/timeUtils';
import type { ParameterRanges, TestOptions } from './types';

/**
 * Calculate how many values in a range
 * Used for progress estimation
 */
export function getRangeCount(min: number, max: number, step: number): number {
  if (step <= 0 || min > max) return 0;
  return Math.floor((max - min) / step) + 1;
}

/**
 * Generate all possible parameter combinations based on ranges and test options
 * 
 * @param ranges - Parameter ranges to test
 * @param options - Test options (which parameters to test)
 * @param strategySettings - Current strategy configuration
 * @returns Array of parameter configurations to test
 */
export function generateParameterCombinations(
  ranges: ParameterRanges,
  options: TestOptions,
  strategySettings: {
    numTPs: 1 | 2 | 3;
    tp1PositionPercent: number;
    tp2PositionPercent: number;
    tp3PositionPercent: number;
  }
): any[] {
  const combinations: any[] = [];
  
  // Generate arrays from ranges for strategy parameters
  const swingLengthValues = generateRangeValues(ranges.swingLength.min, ranges.swingLength.max, ranges.swingLength.step);
  const wickRatioValues = generateRangeValues(ranges.wickRatio.min, ranges.wickRatio.max, ranges.wickRatio.step);
  const confirmCandlesValues = generateRangeValues(ranges.confirmCandles.min, ranges.confirmCandles.max, ranges.confirmCandles.step);
  
  // TP1 parameter arrays - Liquidity Grab uses: Structure, Trailing, EMA, Fixed R:R
  const tp1StructureSwingValues = options.tp1.structure ? generateRangeValues(ranges.tp1SwingLength.min, ranges.tp1SwingLength.max, ranges.tp1SwingLength.step) : [];
  const tp1TrailingSwingValues = options.tp1.trailing ? generateRangeValues(ranges.tp1TrailingSwing.min, ranges.tp1TrailingSwing.max, ranges.tp1TrailingSwing.step) : [];
  const tp1EMAFastValues = options.tp1.ema ? generateRangeValues(ranges.tp1EMAFast.min, ranges.tp1EMAFast.max, ranges.tp1EMAFast.step) : [];
  const tp1EMASlowValues = options.tp1.ema ? generateRangeValues(ranges.tp1EMASlow.min, ranges.tp1EMASlow.max, ranges.tp1EMASlow.step) : [];
  const tp1RRValues = options.tp1.fixedRR ? generateRangeValues(ranges.tp1RR.min, ranges.tp1RR.max, ranges.tp1RR.step) : [];
  
  // TP2 parameter arrays
  const tp2StructureSwingValues = options.tp2.structure ? generateRangeValues(ranges.tp2SwingLength.min, ranges.tp2SwingLength.max, ranges.tp2SwingLength.step) : [];
  const tp2TrailingSwingValues = options.tp2.trailing ? generateRangeValues(ranges.tp2TrailingSwing.min, ranges.tp2TrailingSwing.max, ranges.tp2TrailingSwing.step) : [];
  const tp2EMAFastValues = options.tp2.ema ? generateRangeValues(ranges.tp2EMAFast.min, ranges.tp2EMAFast.max, ranges.tp2EMAFast.step) : [];
  const tp2EMASlowValues = options.tp2.ema ? generateRangeValues(ranges.tp2EMASlow.min, ranges.tp2EMASlow.max, ranges.tp2EMASlow.step) : [];
  const tp2RRValues = options.tp2.fixedRR ? generateRangeValues(ranges.tp2RR.min, ranges.tp2RR.max, ranges.tp2RR.step) : [];
  
  // TP3 parameter arrays
  const tp3StructureSwingValues = options.tp3.structure ? generateRangeValues(ranges.tp3SwingLength.min, ranges.tp3SwingLength.max, ranges.tp3SwingLength.step) : [];
  const tp3TrailingSwingValues = options.tp3.trailing ? generateRangeValues(ranges.tp3TrailingSwing.min, ranges.tp3TrailingSwing.max, ranges.tp3TrailingSwing.step) : [];
  const tp3EMAFastValues = options.tp3.ema ? generateRangeValues(ranges.tp3EMAFast.min, ranges.tp3EMAFast.max, ranges.tp3EMAFast.step) : [];
  const tp3EMASlowValues = options.tp3.ema ? generateRangeValues(ranges.tp3EMASlow.min, ranges.tp3EMASlow.max, ranges.tp3EMASlow.step) : [];
  const tp3RRValues = options.tp3.fixedRR ? generateRangeValues(ranges.tp3RR.min, ranges.tp3RR.max, ranges.tp3RR.step) : [];
  
  // SL parameter arrays
  const slATRValues = options.sl.atr ? generateRangeValues(ranges.slATR.min, ranges.slATR.max, ranges.slATR.step) : [];
  const slStructureSwingValues = options.sl.structure ? generateRangeValues(ranges.slSwingLength.min, ranges.slSwingLength.max, ranges.slSwingLength.step) : [];
  const slFixedDistanceValues = options.sl.fixedDistance ? generateRangeValues(ranges.slFixedDistance.min, ranges.slFixedDistance.max, ranges.slFixedDistance.step) : [];
  
  // Combine all TP1 types (include positionPercent from current config)
  const tp1Configs: any[] = [];
  tp1StructureSwingValues.forEach(v => tp1Configs.push({ type: 'structure', swingLength: v, positionPercent: strategySettings.tp1PositionPercent }));
  tp1TrailingSwingValues.forEach(v => tp1Configs.push({ type: 'trailing', trailingSwingLength: v, positionPercent: strategySettings.tp1PositionPercent }));
  // For EMA, create combinations of fast and slow
  tp1EMAFastValues.forEach(fast => {
    tp1EMASlowValues.forEach(slow => {
      if (slow > fast) { // Ensure slow > fast
        tp1Configs.push({ type: 'ema', emaFast: fast, emaSlow: slow, positionPercent: strategySettings.tp1PositionPercent });
      }
    });
  });
  tp1RRValues.forEach(v => tp1Configs.push({ type: 'fixed_rr', fixedRR: v, positionPercent: strategySettings.tp1PositionPercent }));
  
  // Combine all TP2 types (include positionPercent from current config)
  const tp2Configs: any[] = [];
  const tp2PositionPercent = strategySettings.tp2PositionPercent;
  tp2StructureSwingValues.forEach(v => tp2Configs.push({ type: 'structure', swingLength: v, positionPercent: tp2PositionPercent }));
  tp2TrailingSwingValues.forEach(v => tp2Configs.push({ type: 'trailing', trailingSwingLength: v, positionPercent: tp2PositionPercent }));
  tp2EMAFastValues.forEach(fast => {
    tp2EMASlowValues.forEach(slow => {
      if (slow > fast) {
        tp2Configs.push({ type: 'ema', emaFast: fast, emaSlow: slow, positionPercent: tp2PositionPercent });
      }
    });
  });
  tp2RRValues.forEach(v => tp2Configs.push({ type: 'fixed_rr', fixedRR: v, positionPercent: tp2PositionPercent }));
  
  // Combine all TP3 types (include positionPercent from current config)
  const tp3Configs: any[] = [];
  const tp3PositionPercent = strategySettings.tp3PositionPercent;
  tp3StructureSwingValues.forEach(v => tp3Configs.push({ type: 'structure', swingLength: v, positionPercent: tp3PositionPercent }));
  tp3TrailingSwingValues.forEach(v => tp3Configs.push({ type: 'trailing', trailingSwingLength: v, positionPercent: tp3PositionPercent }));
  tp3EMAFastValues.forEach(fast => {
    tp3EMASlowValues.forEach(slow => {
      if (slow > fast) {
        tp3Configs.push({ type: 'ema', emaFast: fast, emaSlow: slow, positionPercent: tp3PositionPercent });
      }
    });
  });
  tp3RRValues.forEach(v => tp3Configs.push({ type: 'fixed_rr', fixedRR: v, positionPercent: tp3PositionPercent }));
  
  // Combine all SL types
  const slConfigs: any[] = [];
  slATRValues.forEach(v => slConfigs.push({ type: 'atr', atrMultiplier: v }));
  slStructureSwingValues.forEach(v => slConfigs.push({ type: 'structure', swingLength: v }));
  slFixedDistanceValues.forEach(v => slConfigs.push({ type: 'fixed_distance', distancePercent: v }));
  
  // Boolean filter combinations - only test when checkbox is enabled
  const wickFilterOptions = options.useWickFilter ? [true] : [false];
  const confirmCandlesOptions = options.useConfirmCandles ? [true] : [false];
  
  // Generate all combinations
  for (const trendFilter of options.trendFilters) {
    for (const direction of options.directions) {
      for (const useWickFilter of wickFilterOptions) {
        for (const useConfirmCandles of confirmCandlesOptions) {
          for (const swingLength of swingLengthValues) {
            // Only test different wick ratios when wick filter is enabled
            const wickRatiosToTest = useWickFilter ? wickRatioValues : [100];
            for (const wickRatio of wickRatiosToTest) {
              // Only test different confirm candles when confirm candles is enabled
              const confirmCandlesToTest = useConfirmCandles ? confirmCandlesValues : [0];
              for (const confirmCandles of confirmCandlesToTest) {
                for (const tp1 of tp1Configs.length > 0 ? tp1Configs : [null]) {
                  for (const tp2 of strategySettings.numTPs >= 2 && tp2Configs.length > 0 ? tp2Configs : [null]) {
                    for (const tp3 of strategySettings.numTPs >= 3 && tp3Configs.length > 0 ? tp3Configs : [null]) {
                      for (const sl of slConfigs) {
                        combinations.push({
                          numTPs: strategySettings.numTPs,
                          trendFilter,
                          direction,
                          swingLength,
                          wickRatio,
                          confirmCandles,
                          useWickFilter,
                          useConfirmCandles,
                          tp1,
                          tp2,
                          tp3,
                          sl
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`🧪 Generated ${combinations.length} test combinations`);
  return combinations;
}

/**
 * Calculate total number of combinations for progress estimation
 * 
 * @param ranges - Parameter ranges
 * @param options - Test options
 * @param numTPs - Number of take profits (1, 2, or 3)
 * @returns Estimated total number of combinations
 */
export function calculateTotalCombinations(
  ranges: ParameterRanges,
  options: TestOptions,
  numTPs: 1 | 2 | 3
): number {
  let count = 1;

  // Strategy parameters
  count *= options.trendFilters.length || 1;
  count *= options.directions.length || 1;
  count *= getRangeCount(ranges.swingLength.min, ranges.swingLength.max, ranges.swingLength.step);
  
  // Only test wick ratios when wick filter is enabled
  if (options.useWickFilter) {
    count *= getRangeCount(ranges.wickRatio.min, ranges.wickRatio.max, ranges.wickRatio.step);
  }
  
  // Only test confirm candles when confirm candles is enabled
  if (options.useConfirmCandles) {
    count *= getRangeCount(ranges.confirmCandles.min, ranges.confirmCandles.max, ranges.confirmCandles.step);
  }

  // TP1 parameters (always active if numTPs >= 1)
  if (numTPs >= 1) {
    let tp1Count = 0;
    if (options.tp1.structure) tp1Count += getRangeCount(ranges.tp1SwingLength.min, ranges.tp1SwingLength.max, ranges.tp1SwingLength.step);
    if (options.tp1.trailing) tp1Count += getRangeCount(ranges.tp1TrailingSwing.min, ranges.tp1TrailingSwing.max, ranges.tp1TrailingSwing.step);
    if (options.tp1.ema) tp1Count += getRangeCount(ranges.tp1EMAFast.min, ranges.tp1EMAFast.max, ranges.tp1EMAFast.step) * getRangeCount(ranges.tp1EMASlow.min, ranges.tp1EMASlow.max, ranges.tp1EMASlow.step);
    if (options.tp1.fixedRR) tp1Count += getRangeCount(ranges.tp1RR.min, ranges.tp1RR.max, ranges.tp1RR.step);
    count *= tp1Count || 1;
  }

  // TP2 parameters (only if numTPs >= 2)
  if (numTPs >= 2) {
    let tp2Count = 0;
    if (options.tp2.structure) tp2Count += getRangeCount(ranges.tp2SwingLength.min, ranges.tp2SwingLength.max, ranges.tp2SwingLength.step);
    if (options.tp2.trailing) tp2Count += getRangeCount(ranges.tp2TrailingSwing.min, ranges.tp2TrailingSwing.max, ranges.tp2TrailingSwing.step);
    if (options.tp2.ema) tp2Count += getRangeCount(ranges.tp2EMAFast.min, ranges.tp2EMAFast.max, ranges.tp2EMAFast.step) * getRangeCount(ranges.tp2EMASlow.min, ranges.tp2EMASlow.max, ranges.tp2EMASlow.step);
    if (options.tp2.fixedRR) tp2Count += getRangeCount(ranges.tp2RR.min, ranges.tp2RR.max, ranges.tp2RR.step);
    count *= tp2Count || 1;
  }

  // TP3 parameters (only if numTPs >= 3)
  if (numTPs >= 3) {
    let tp3Count = 0;
    if (options.tp3.structure) tp3Count += getRangeCount(ranges.tp3SwingLength.min, ranges.tp3SwingLength.max, ranges.tp3SwingLength.step);
    if (options.tp3.trailing) tp3Count += getRangeCount(ranges.tp3TrailingSwing.min, ranges.tp3TrailingSwing.max, ranges.tp3TrailingSwing.step);
    if (options.tp3.ema) tp3Count += getRangeCount(ranges.tp3EMAFast.min, ranges.tp3EMAFast.max, ranges.tp3EMAFast.step) * getRangeCount(ranges.tp3EMASlow.min, ranges.tp3EMASlow.max, ranges.tp3EMASlow.step);
    if (options.tp3.fixedRR) tp3Count += getRangeCount(ranges.tp3RR.min, ranges.tp3RR.max, ranges.tp3RR.step);
    count *= tp3Count || 1;
  }

  // SL parameters
  let slCount = 0;
  if (options.sl.atr) slCount += getRangeCount(ranges.slATR.min, ranges.slATR.max, ranges.slATR.step);
  if (options.sl.structure) slCount += getRangeCount(ranges.slSwingLength.min, ranges.slSwingLength.max, ranges.slSwingLength.step);
  if (options.sl.fixedDistance) slCount += getRangeCount(ranges.slFixedDistance.min, ranges.slFixedDistance.max, ranges.slFixedDistance.step);
  count *= slCount || 1;

  return count;
}

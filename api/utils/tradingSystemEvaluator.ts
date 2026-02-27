/**
 * Trading System Condition Evaluator
 * Evaluates trading system entry conditions against current indicator values
 */

export interface IndicatorValues {
  // Oscillators
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  stochK?: number;
  stochD?: number;
  cci?: number;
  adx?: number;
  plusDI?: number;
  minusDI?: number;
  mfi?: number;
  atr?: number;
  
  // Trend Indicators
  ema9?: number;
  ema21?: number;
  ema50?: number;
  ema200?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  
  // SuperTrend
  superTrendDirection?: 'bullish' | 'bearish';
  superTrendPrice?: number;
  superTrendPrevDirection?: 'bullish' | 'bearish';
  
  // Squeeze
  sqzMomentum?: number;
  sqzPrevMomentum?: number;
  sqzState?: 'squeeze' | 'nosqueeze';
  sqzPrevState?: 'squeeze' | 'nosqueeze';
  
  // Volume
  volume?: number;
  avgVolume?: number;
  volumeRatio?: number; // current / average
  
  // Price
  price: number;
  prevPrice?: number;
  
  // VWAP
  vwap?: number;
  htfVwap?: number;
}

export interface TradingSystemConditionResult {
  triggered: boolean;
  triggeredConditions: string[];
  timestamp: number;
}

/**
 * Evaluates a list of trading system conditions against current indicator values
 * 
 * Supported condition formats:
 * - "RSI < 30" / "RSI > 70"
 * - "MACD cross up" / "MACD cross down"
 * - "SuperTrend flip bullish" / "SuperTrend flip bearish"
 * - "ADX > 25"
 * - "Squeeze release" / "Squeeze momentum positive"
 * - "Volume spike 2x"
 * - "EMA 9/21 cross up" / "EMA 9/21 cross down"
 * - "Price > EMA 200"
 * 
 * @param conditions - Array of condition strings to evaluate
 * @param indicators - Current indicator values
 * @param lastIndicatorState - Previous indicator state for detecting crosses/flips
 * @returns Evaluation result with triggered conditions
 */
export function evaluateTradingSystemConditions(
  conditions: string[],
  indicators: IndicatorValues,
  lastIndicatorState?: Partial<IndicatorValues>
): TradingSystemConditionResult {
  const triggeredConditions: string[] = [];
  
  for (const condition of conditions) {
    const normalized = condition.toLowerCase().trim();
    
    try {
      // RSI Conditions
      if (normalized.includes('rsi') && indicators.rsi !== undefined) {
        if (normalized.includes('< 30') || normalized.includes('oversold')) {
          if (indicators.rsi < 30) triggeredConditions.push(condition);
        } else if (normalized.includes('> 70') || normalized.includes('overbought')) {
          if (indicators.rsi > 70) triggeredConditions.push(condition);
        } else if (normalized.includes('> 50')) {
          if (indicators.rsi > 50) triggeredConditions.push(condition);
        } else if (normalized.includes('< 50')) {
          if (indicators.rsi < 50) triggeredConditions.push(condition);
        }
      }
      
      // MACD Conditions
      if (normalized.includes('macd') && normalized.includes('cross')) {
        if (indicators.macd !== undefined && indicators.macdSignal !== undefined &&
            lastIndicatorState?.macd !== undefined && lastIndicatorState?.macdSignal !== undefined) {
          const currentAbove = indicators.macd > indicators.macdSignal;
          const previousAbove = lastIndicatorState.macd > lastIndicatorState.macdSignal;
          
          if (normalized.includes('up') || normalized.includes('bullish')) {
            if (currentAbove && !previousAbove) triggeredConditions.push(condition);
          } else if (normalized.includes('down') || normalized.includes('bearish')) {
            if (!currentAbove && previousAbove) triggeredConditions.push(condition);
          }
        }
      }
      
      // SuperTrend Conditions
      if (normalized.includes('supertrend') && normalized.includes('flip')) {
        if (indicators.superTrendDirection && lastIndicatorState?.superTrendDirection) {
          const flipped = indicators.superTrendDirection !== lastIndicatorState.superTrendDirection;
          
          if (normalized.includes('bullish')) {
            if (flipped && indicators.superTrendDirection === 'bullish') {
              triggeredConditions.push(condition);
            }
          } else if (normalized.includes('bearish')) {
            if (flipped && indicators.superTrendDirection === 'bearish') {
              triggeredConditions.push(condition);
            }
          }
        }
      }
      
      // ADX Conditions
      if (normalized.includes('adx') && indicators.adx !== undefined) {
        if (normalized.includes('> 25')) {
          if (indicators.adx > 25) triggeredConditions.push(condition);
        } else if (normalized.includes('> 20')) {
          if (indicators.adx > 20) triggeredConditions.push(condition);
        } else if (normalized.includes('< 20')) {
          if (indicators.adx < 20) triggeredConditions.push(condition);
        }
        
        // DI Crossover
        if (normalized.includes('+di cross') && indicators.plusDI && indicators.minusDI &&
            lastIndicatorState?.plusDI && lastIndicatorState?.minusDI) {
          const currentPlusAbove = indicators.plusDI > indicators.minusDI;
          const previousPlusAbove = lastIndicatorState.plusDI > lastIndicatorState.minusDI;
          
          if (normalized.includes('up') && currentPlusAbove && !previousPlusAbove) {
            triggeredConditions.push(condition);
          } else if (normalized.includes('down') && !currentPlusAbove && previousPlusAbove) {
            triggeredConditions.push(condition);
          }
        }
      }
      
      // Stochastic Conditions
      if (normalized.includes('stoch') && indicators.stochK !== undefined && indicators.stochD !== undefined) {
        if (normalized.includes('cross') && lastIndicatorState?.stochK && lastIndicatorState?.stochD) {
          const currentKAbove = indicators.stochK > indicators.stochD;
          const previousKAbove = lastIndicatorState.stochK > lastIndicatorState.stochD;
          
          if (normalized.includes('up') && currentKAbove && !previousKAbove) {
            triggeredConditions.push(condition);
          } else if (normalized.includes('down') && !currentKAbove && previousKAbove) {
            triggeredConditions.push(condition);
          }
        } else if (normalized.includes('oversold')) {
          if (indicators.stochK < 20) triggeredConditions.push(condition);
        } else if (normalized.includes('overbought')) {
          if (indicators.stochK > 80) triggeredConditions.push(condition);
        }
      }
      
      // CCI Conditions
      if (normalized.includes('cci') && indicators.cci !== undefined) {
        if (normalized.includes('> 100') || normalized.includes('overbought')) {
          if (indicators.cci > 100) triggeredConditions.push(condition);
        } else if (normalized.includes('< -100') || normalized.includes('oversold')) {
          if (indicators.cci < -100) triggeredConditions.push(condition);
        } else if (normalized.includes('zero cross')) {
          if (lastIndicatorState?.cci !== undefined) {
            const crossedUp = lastIndicatorState.cci < 0 && indicators.cci >= 0;
            const crossedDown = lastIndicatorState.cci > 0 && indicators.cci <= 0;
            if (crossedUp || crossedDown) triggeredConditions.push(condition);
          }
        }
      }
      
      // MFI Conditions
      if (normalized.includes('mfi') && indicators.mfi !== undefined) {
        if (normalized.includes('> 80') || normalized.includes('overbought')) {
          if (indicators.mfi > 80) triggeredConditions.push(condition);
        } else if (normalized.includes('< 20') || normalized.includes('oversold')) {
          if (indicators.mfi < 20) triggeredConditions.push(condition);
        }
      }
      
      // Squeeze Conditions
      if (normalized.includes('squeeze')) {
        if (normalized.includes('release') && indicators.sqzState && lastIndicatorState?.sqzState) {
          if (lastIndicatorState.sqzState === 'squeeze' && indicators.sqzState === 'nosqueeze') {
            triggeredConditions.push(condition);
          }
        } else if (normalized.includes('momentum')) {
          if (indicators.sqzMomentum !== undefined && lastIndicatorState?.sqzMomentum !== undefined) {
            const momentumTurningPositive = lastIndicatorState.sqzMomentum < 0 && indicators.sqzMomentum >= 0;
            const momentumTurningNegative = lastIndicatorState.sqzMomentum > 0 && indicators.sqzMomentum <= 0;
            
            if (normalized.includes('positive') && momentumTurningPositive) {
              triggeredConditions.push(condition);
            } else if (normalized.includes('negative') && momentumTurningNegative) {
              triggeredConditions.push(condition);
            }
          }
        }
      }
      
      // Volume Conditions
      if (normalized.includes('volume spike')) {
        if (indicators.volume && indicators.avgVolume) {
          const ratio = indicators.volume / indicators.avgVolume;
          
          if (normalized.includes('2x') && ratio >= 2) {
            triggeredConditions.push(condition);
          } else if (normalized.includes('3x') && ratio >= 3) {
            triggeredConditions.push(condition);
          } else if (ratio >= 1.5) { // Default spike threshold
            triggeredConditions.push(condition);
          }
        }
      }
      
      // EMA Cross Conditions
      if (normalized.includes('ema') && normalized.includes('cross')) {
        if (normalized.includes('9/21') && indicators.ema9 && indicators.ema21 &&
            lastIndicatorState?.ema9 && lastIndicatorState?.ema21) {
          const current9Above = indicators.ema9 > indicators.ema21;
          const previous9Above = lastIndicatorState.ema9 > lastIndicatorState.ema21;
          
          if (normalized.includes('up') && current9Above && !previous9Above) {
            triggeredConditions.push(condition);
          } else if (normalized.includes('down') && !current9Above && previous9Above) {
            triggeredConditions.push(condition);
          }
        } else if (normalized.includes('20/50') && indicators.sma20 && indicators.sma50 &&
                   lastIndicatorState?.sma20 && lastIndicatorState?.sma50) {
          const current20Above = indicators.sma20 > indicators.sma50;
          const previous20Above = lastIndicatorState.sma20 > lastIndicatorState.sma50;
          
          if (normalized.includes('up') && current20Above && !previous20Above) {
            triggeredConditions.push(condition);
          } else if (normalized.includes('down') && !current20Above && previous20Above) {
            triggeredConditions.push(condition);
          }
        }
      }
      
      // Price vs EMA Conditions
      if (normalized.includes('price >') && normalized.includes('ema')) {
        if (normalized.includes('200') && indicators.ema200) {
          if (indicators.price > indicators.ema200) triggeredConditions.push(condition);
        } else if (normalized.includes('50') && indicators.ema50) {
          if (indicators.price > indicators.ema50) triggeredConditions.push(condition);
        }
      } else if (normalized.includes('price <') && normalized.includes('ema')) {
        if (normalized.includes('200') && indicators.ema200) {
          if (indicators.price < indicators.ema200) triggeredConditions.push(condition);
        } else if (normalized.includes('50') && indicators.ema50) {
          if (indicators.price < indicators.ema50) triggeredConditions.push(condition);
        }
      }
      
      // VWAP Cross Conditions
      if (normalized.includes('vwap') && indicators.vwap) {
        if (normalized.includes('cross') && lastIndicatorState?.prevPrice) {
          const currentAbove = indicators.price > indicators.vwap;
          const previousAbove = lastIndicatorState.prevPrice > indicators.vwap;
          
          if (normalized.includes('up') && currentAbove && !previousAbove) {
            triggeredConditions.push(condition);
          } else if (normalized.includes('down') && !currentAbove && previousAbove) {
            triggeredConditions.push(condition);
          }
        } else if (normalized.includes('above') && indicators.price > indicators.vwap) {
          triggeredConditions.push(condition);
        } else if (normalized.includes('below') && indicators.price < indicators.vwap) {
          triggeredConditions.push(condition);
        }
      }
      
      // ATR Conditions
      if (normalized.includes('atr') && indicators.atr !== undefined) {
        if (normalized.includes('spike') && lastIndicatorState?.atr !== undefined) {
          const atrIncrease = (indicators.atr - lastIndicatorState.atr) / lastIndicatorState.atr;
          if (atrIncrease > 0.3) { // 30% increase
            triggeredConditions.push(condition);
          }
        }
      }
      
    } catch (error) {
      console.error(`Error evaluating condition "${condition}":`, error);
    }
  }
  
  return {
    triggered: triggeredConditions.length > 0,
    triggeredConditions,
    timestamp: Date.now()
  };
}

/**
 * Formats a condition evaluation result into a notification message
 */
export function formatTradingSystemNotification(
  systemName: string,
  symbol: string,
  result: TradingSystemConditionResult,
  price: number
): { title: string; body: string } {
  const direction = systemName.toLowerCase().includes('long') || 
                   result.triggeredConditions.some(c => c.toLowerCase().includes('bullish') || c.toLowerCase().includes('up'))
                   ? '📈 LONG' : '📉 SHORT';
  
  return {
    title: `${direction} ${symbol} - ${systemName}`,
    body: `Entry conditions met:\n${result.triggeredConditions.join('\n')}\nPrice: $${price.toFixed(6)} 🐻‍❄️`
  };
}

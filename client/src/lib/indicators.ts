// Technical Indicator Calculation Utilities
// All indicators work with CandleData[] from the chart component

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorValue {
  time: number;
  value: number;
}

export interface BandValue {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface SupertrendValue {
  time: number;
  supertrend: number;
  direction: 'bullish' | 'bearish'; // bullish = buy signal, bearish = sell signal
}

// ========== REUSABLE UTILITY FUNCTIONS ==========

/**
 * Calculate Average True Range (ATR)
 * Used by: Supertrend, Parabolic SAR
 */
export function calculateATR(candles: CandleData[], period: number): IndicatorValue[] {
  if (candles.length < period + 1) return [];
  
  const trueRanges: number[] = [];
  
  // Calculate True Range for each candle
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Calculate ATR using EMA smoothing
  const atr: IndicatorValue[] = [];
  let atrValue = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  
  atr.push({ time: candles[period].time, value: atrValue });
  
  for (let i = period; i < trueRanges.length; i++) {
    atrValue = (atrValue * (period - 1) + trueRanges[i]) / period;
    atr.push({ time: candles[i + 1].time, value: atrValue });
  }
  
  return atr;
}

/**
 * Calculate Simple Moving Average (SMA)
 * Used by: SMA indicator, many others as helper
 */
export function calculateSMA(data: number[], period: number): number[] {
  if (data.length < period) return [];
  
  const sma: number[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val, 0);
    sma.push(sum / period);
  }
  
  return sma;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * Used by: Many indicators as smoothing
 */
export function calculateEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];
  
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // Start with SMA
  const initialSMA = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  ema.push(initialSMA);
  
  // Calculate EMA
  for (let i = period; i < data.length; i++) {
    const emaValue = (data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(emaValue);
  }
  
  return ema;
}

/**
 * Calculate standard deviation
 * Used by: VWAP Bands, Bollinger Bands
 */
export function calculateStdDev(data: number[], mean: number): number {
  const squaredDiffs = data.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / data.length;
  return Math.sqrt(variance);
}

// ========== TREND INDICATORS ==========

/**
 * Calculate Supertrend Indicator
 * Supertrend = ATR-based trend following indicator with clear buy/sell signals
 * Green line = bullish (buy signal), Red line = bearish (sell signal)
 */
export function calculateSupertrend(
  candles: CandleData[],
  period: number = 10,
  multiplier: number = 3
): SupertrendValue[] {
  if (candles.length < period + 1) return [];
  
  const atr = calculateATR(candles, period);
  if (atr.length === 0) return [];
  
  const result: SupertrendValue[] = [];
  let direction: 'bullish' | 'bearish' = 'bullish';
  let supertrend = 0;
  
  // Calculate basic upper and lower bands
  for (let i = 0; i < atr.length; i++) {
    const candleIndex = i + period;
    const candle = candles[candleIndex];
    const hl2 = (candle.high + candle.low) / 2;
    
    const basicUpperBand = hl2 + multiplier * atr[i].value;
    const basicLowerBand = hl2 - multiplier * atr[i].value;
    
    // Determine final bands and direction
    let finalUpperBand = basicUpperBand;
    let finalLowerBand = basicLowerBand;
    
    if (i > 0) {
      const prevSupertrend = result[i - 1].supertrend;
      
      // Final upper band
      if (basicUpperBand < prevSupertrend || candles[candleIndex - 1].close > prevSupertrend) {
        finalUpperBand = basicUpperBand;
      } else {
        finalUpperBand = prevSupertrend;
      }
      
      // Final lower band
      if (basicLowerBand > prevSupertrend || candles[candleIndex - 1].close < prevSupertrend) {
        finalLowerBand = basicLowerBand;
      } else {
        finalLowerBand = prevSupertrend;
      }
      
      // Determine direction and supertrend value
      if (result[i - 1].direction === 'bullish') {
        if (candle.close <= finalLowerBand) {
          direction = 'bearish';
          supertrend = finalUpperBand;
        } else {
          direction = 'bullish';
          supertrend = finalLowerBand;
        }
      } else {
        if (candle.close >= finalUpperBand) {
          direction = 'bullish';
          supertrend = finalLowerBand;
        } else {
          direction = 'bearish';
          supertrend = finalUpperBand;
        }
      }
    } else {
      // First value
      direction = candle.close <= hl2 ? 'bearish' : 'bullish';
      supertrend = direction === 'bullish' ? finalLowerBand : finalUpperBand;
    }
    
    result.push({
      time: candle.time,
      supertrend,
      direction
    });
  }
  
  return result;
}

/**
 * Calculate VWAP with Standard Deviation Bands
 * Returns upper, middle (VWAP), and lower bands
 */
export function calculateVWAPBands(
  candles: CandleData[],
  stdDevMultiplier: number = 2
): BandValue[] {
  if (candles.length === 0) return [];
  
  const result: BandValue[] = [];
  let cumulativeTPV = 0; // Typical Price * Volume
  let cumulativeVolume = 0;
  const typicalPrices: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    typicalPrices.push(typicalPrice);
    
    cumulativeTPV += typicalPrice * candles[i].volume;
    cumulativeVolume += candles[i].volume;
    
    const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
    
    // Calculate standard deviation of typical prices weighted by volume
    let weightedSumSquares = 0;
    let weightSum = 0;
    
    for (let j = 0; j <= i; j++) {
      const weight = candles[j].volume;
      weightedSumSquares += weight * Math.pow(typicalPrices[j] - vwap, 2);
      weightSum += weight;
    }
    
    const stdDev = weightSum > 0 ? Math.sqrt(weightedSumSquares / weightSum) : 0;
    
    result.push({
      time: candles[i].time,
      upper: vwap + stdDevMultiplier * stdDev,
      middle: vwap,
      lower: vwap - stdDevMultiplier * stdDev
    });
  }
  
  return result;
}

/**
 * Calculate Session VWAP
 * Separate VWAPs for Asia, London, and NY sessions
 * Returns object with asia, london, ny arrays
 */
export function calculateSessionVWAP(candles: CandleData[]): {
  asia: IndicatorValue[];
  london: IndicatorValue[];
  ny: IndicatorValue[];
} {
  const asia: IndicatorValue[] = [];
  const london: IndicatorValue[] = [];
  const ny: IndicatorValue[] = [];
  
  // Session times (UTC)
  // Asia: 00:00 - 09:00 UTC
  // London: 08:00 - 16:30 UTC
  // NY: 13:30 - 20:00 UTC
  
  let asiaCumulativeTPV = 0;
  let asiaCumulativeVolume = 0;
  let londonCumulativeTPV = 0;
  let londonCumulativeVolume = 0;
  let nyCumulativeTPV = 0;
  let nyCumulativeVolume = 0;
  
  let lastAsiaDay = -1;
  let lastLondonDay = -1;
  let lastNYDay = -1;
  
  for (const candle of candles) {
    const date = new Date(candle.time * 1000);
    const hour = date.getUTCHours();
    const day = date.getUTCDate();
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const tpv = typicalPrice * candle.volume;
    
    // Asia session (00:00 - 09:00 UTC)
    if (hour >= 0 && hour < 9) {
      if (day !== lastAsiaDay) {
        // New session, reset
        asiaCumulativeTPV = 0;
        asiaCumulativeVolume = 0;
        lastAsiaDay = day;
      }
      asiaCumulativeTPV += tpv;
      asiaCumulativeVolume += candle.volume;
      const vwap = asiaCumulativeVolume > 0 ? asiaCumulativeTPV / asiaCumulativeVolume : typicalPrice;
      asia.push({ time: candle.time, value: vwap });
    }
    
    // London session (08:00 - 16:30 UTC)
    if (hour >= 8 && hour < 17) {
      if (day !== lastLondonDay) {
        londonCumulativeTPV = 0;
        londonCumulativeVolume = 0;
        lastLondonDay = day;
      }
      londonCumulativeTPV += tpv;
      londonCumulativeVolume += candle.volume;
      const vwap = londonCumulativeVolume > 0 ? londonCumulativeTPV / londonCumulativeVolume : typicalPrice;
      london.push({ time: candle.time, value: vwap });
    }
    
    // NY session (13:30 - 20:00 UTC)
    if (hour >= 13 && hour < 20) {
      if (day !== lastNYDay) {
        nyCumulativeTPV = 0;
        nyCumulativeVolume = 0;
        lastNYDay = day;
      }
      nyCumulativeTPV += tpv;
      nyCumulativeVolume += candle.volume;
      const vwap = nyCumulativeVolume > 0 ? nyCumulativeTPV / nyCumulativeVolume : typicalPrice;
      ny.push({ time: candle.time, value: vwap });
    }
  }
  
  return { asia, london, ny };
}

/**
 * Calculate Anchored VWAP from a specific starting point
 */
export function calculateAnchoredVWAP(
  candles: CandleData[],
  anchorTime: number
): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  
  // Find starting index
  const startIndex = candles.findIndex(c => c.time >= anchorTime);
  if (startIndex === -1) return [];
  
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (let i = startIndex; i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativeTPV += typicalPrice * candles[i].volume;
    cumulativeVolume += candles[i].volume;
    
    const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
    result.push({ time: candles[i].time, value: vwap });
  }
  
  return result;
}

// ========== BATCH 2: SMC INDICATORS ==========

export interface OrderBlock {
  time: number;
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
  strength: number; // 1-3 (based on volume and price movement)
}

/**
 * Detect Order Blocks (SMC) with mitigation logic
 * Order blocks are the last opposite-colored candle before a strong move
 * Mitigated blocks (where price has crossed through) are filtered out
 */
export function calculateOrderBlocks(
  candles: CandleData[],
  minStrength: number = 1.5, // Minimum price move ratio to qualify as strong move
  lookback: number = 100 // How many candles back to look for order blocks
): OrderBlock[] {
  if (candles.length < 5) return [];
  
  const orderBlocks: OrderBlock[] = [];
  
  // Calculate start index based on lookback
  const startIndex = Math.max(3, candles.length - lookback);
  
  for (let i = startIndex; i < candles.length - 1; i++) {
    const current = candles[i];
    const _prev = candles[i - 1];
    const next = candles[i + 1];
    
    // Check for bullish order block (bearish candle before strong bullish move)
    const isBearishCandle = current.close < current.open;
    const nextIsBullish = next.close > next.open;
    const strongBullishMove = (next.high - next.low) > (current.high - current.low) * minStrength;
    
    if (isBearishCandle && nextIsBullish && strongBullishMove) {
      const volumeStrength = current.volume > (candles[i - 1].volume + candles[i - 2].volume) / 2 ? 3 : 2;
      
      // Check for mitigation: bullish block is mitigated if any subsequent candle drops below the block's low
      let isMitigated = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low < current.low) {
          isMitigated = true;
          break;
        }
      }
      
      if (!isMitigated) {
        orderBlocks.push({
          time: current.time,
          high: current.high,
          low: current.low,
          type: 'bullish',
          strength: volumeStrength
        });
      }
    }
    
    // Check for bearish order block (bullish candle before strong bearish move)
    const isBullishCandle = current.close > current.open;
    const nextIsBearish = next.close < next.open;
    const strongBearishMove = (next.high - next.low) > (current.high - current.low) * minStrength;
    
    if (isBullishCandle && nextIsBearish && strongBearishMove) {
      const volumeStrength = current.volume > (candles[i - 1].volume + candles[i - 2].volume) / 2 ? 3 : 2;
      
      // Check for mitigation: bearish block is mitigated if any subsequent candle rises above the block's high
      let isMitigated = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high > current.high) {
          isMitigated = true;
          break;
        }
      }
      
      if (!isMitigated) {
        orderBlocks.push({
          time: current.time,
          high: current.high,
          low: current.low,
          type: 'bearish',
          strength: volumeStrength
        });
      }
    }
  }
  
  return orderBlocks;
}

export interface PremiumDiscount {
  time: number;
  equilibrium: number;
  premium: number;
  discount: number;
  range: number;
}

/**
 * Calculate Premium/Discount Zones (SMC)
 * Based on swing high/low range - shows where price is expensive/cheap
 */
export function calculatePremiumDiscount(
  candles: CandleData[],
  swingLength: number = 20
): PremiumDiscount[] {
  if (candles.length < swingLength) return [];
  
  const result: PremiumDiscount[] = [];
  
  for (let i = swingLength; i < candles.length; i++) {
    const window = candles.slice(i - swingLength, i + 1);
    const high = Math.max(...window.map(c => c.high));
    const low = Math.min(...window.map(c => c.low));
    const range = high - low;
    const equilibrium = (high + low) / 2;
    
    result.push({
      time: candles[i].time,
      equilibrium,
      premium: equilibrium + (range * 0.25), // Top 50% is premium
      discount: equilibrium - (range * 0.25), // Bottom 50% is discount
      range
    });
  }
  
  return result;
}


// ========== BATCH 3: OSCILLATORS & REMAINING TREND TOOLS ==========

export interface IchimokuCloud {
  time: number;
  tenkan: number;
  kijun: number;
  senkouA: number;
  senkouB: number;
  chikou: number;
}

/**
 * Calculate Ichimoku Cloud
 * Japanese trend-following indicator with multiple components
 */
export function calculateIchimoku(
  candles: CandleData[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouBPeriod: number = 52
): IchimokuCloud[] {
  if (candles.length < senkouBPeriod) return [];
  
  const result: IchimokuCloud[] = [];
  
  for (let i = Math.max(kijunPeriod, tenkanPeriod); i < candles.length; i++) {
    // Tenkan-sen (Conversion Line) = (9-period high + 9-period low) / 2
    const tenkanWindow = candles.slice(Math.max(0, i - tenkanPeriod + 1), i + 1);
    const tenkanHigh = Math.max(...tenkanWindow.map(c => c.high));
    const tenkanLow = Math.min(...tenkanWindow.map(c => c.low));
    const tenkan = (tenkanHigh + tenkanLow) / 2;
    
    // Kijun-sen (Base Line) = (26-period high + 26-period low) / 2
    const kijunWindow = candles.slice(Math.max(0, i - kijunPeriod + 1), i + 1);
    const kijunHigh = Math.max(...kijunWindow.map(c => c.high));
    const kijunLow = Math.min(...kijunWindow.map(c => c.low));
    const kijun = (kijunHigh + kijunLow) / 2;
    
    // Senkou Span A (Leading Span A) = (Tenkan + Kijun) / 2, shifted forward 26 periods
    const senkouA = (tenkan + kijun) / 2;
    
    // Senkou Span B (Leading Span B) = (52-period high + 52-period low) / 2, shifted forward 26 periods
    const senkouBWindow = candles.slice(Math.max(0, i - senkouBPeriod + 1), i + 1);
    const senkouBHigh = Math.max(...senkouBWindow.map(c => c.high));
    const senkouBLow = Math.min(...senkouBWindow.map(c => c.low));
    const senkouB = (senkouBHigh + senkouBLow) / 2;
    
    // Chikou Span (Lagging Span) = Close price shifted back 26 periods
    const chikou = candles[i].close;
    
    result.push({
      time: candles[i].time,
      tenkan,
      kijun,
      senkouA,
      senkouB,
      chikou
    });
  }
  
  return result;
}

export interface ParabolicSARValue {
  time: number;
  sar: number;
  isLong: boolean; // true = uptrend, false = downtrend
}

/**
 * Calculate Parabolic SAR (Stop and Reverse)
 * Shows potential trend reversal points
 */
export function calculateParabolicSAR(
  candles: CandleData[],
  step: number = 0.02,
  maxStep: number = 0.2
): ParabolicSARValue[] {
  if (candles.length < 5) return [];
  
  const result: ParabolicSARValue[] = [];
  
  let isLong = candles[1].close > candles[0].close;
  let sar = isLong ? candles[0].low : candles[0].high;
  let ep = isLong ? candles[0].high : candles[0].low; // Extreme Point
  let af = step; // Acceleration Factor
  
  for (let i = 1; i < candles.length; i++) {
    const candle = candles[i];
    
    // Calculate new SAR
    sar = sar + af * (ep - sar);
    
    // Check for reversal
    if (isLong) {
      if (candle.low < sar) {
        isLong = false;
        sar = ep;
        ep = candle.low;
        af = step;
      } else {
        if (candle.high > ep) {
          ep = candle.high;
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      if (candle.high > sar) {
        isLong = true;
        sar = ep;
        ep = candle.high;
        af = step;
      } else {
        if (candle.low < ep) {
          ep = candle.low;
          af = Math.min(af + step, maxStep);
        }
      }
    }
    
    result.push({
      time: candle.time,
      sar,
      isLong
    });
  }
  
  return result;
}

export interface StochasticRSIValue {
  time: number;
  k: number;
  d: number;
}

/**
 * Calculate Stochastic RSI
 * Combines Stochastic and RSI for overbought/oversold signals
 */
export function calculateStochasticRSI(
  candles: CandleData[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14,
  _kSmooth: number = 3,
  dSmooth: number = 3
): StochasticRSIValue[] {
  if (candles.length < rsiPeriod + stochPeriod) return [];
  
  // First calculate RSI
  const closes = candles.map(c => c.close);
  const rsiValues: number[] = [];
  
  for (let i = rsiPeriod; i < closes.length; i++) {
    let gains = 0;
    let losses = 0;
    
    for (let j = i - rsiPeriod + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / rsiPeriod;
    const avgLoss = losses / rsiPeriod;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    rsiValues.push(rsi);
  }
  
  // Calculate Stochastic of RSI
  const stochRSI: StochasticRSIValue[] = [];
  
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const rsiWindow = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const maxRSI = Math.max(...rsiWindow);
    const minRSI = Math.min(...rsiWindow);
    const range = maxRSI - minRSI;
    
    const k = range === 0 ? 0 : ((rsiValues[i] - minRSI) / range) * 100;
    
    stochRSI.push({
      time: candles[i + rsiPeriod].time,
      k,
      d: 0 // Will calculate D line next
    });
  }
  
  // Calculate %D (SMA of %K)
  for (let i = dSmooth - 1; i < stochRSI.length; i++) {
    const kValues = stochRSI.slice(i - dSmooth + 1, i + 1).map(s => s.k);
    const d = kValues.reduce((sum, k) => sum + k, 0) / dSmooth;
    stochRSI[i].d = d;
  }
  
  return stochRSI;
}

export interface WilliamsRValue {
  time: number;
  value: number;
}

/**
 * Calculate Williams %R
 * Momentum indicator similar to Stochastic, shows overbought/oversold
 */
export function calculateWilliamsR(
  candles: CandleData[],
  period: number = 14
): WilliamsRValue[] {
  if (candles.length < period) return [];
  
  const result: WilliamsRValue[] = [];
  
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...window.map(c => c.high));
    const lowestLow = Math.min(...window.map(c => c.low));
    const close = candles[i].close;
    
    const range = highestHigh - lowestLow;
    const williamsR = range === 0 ? 0 : ((highestHigh - close) / range) * -100;
    
    result.push({
      time: candles[i].time,
      value: williamsR
    });
  }
  
  return result;
}

export interface MFIValue {
  time: number;
  value: number;
}

/**
 * Calculate Money Flow Index (MFI)
 * Volume-weighted RSI, shows money flowing in/out
 */
export function calculateMFI(
  candles: CandleData[],
  period: number = 14
): MFIValue[] {
  if (candles.length < period + 1) return [];
  
  const result: MFIValue[] = [];
  
  for (let i = period; i < candles.length; i++) {
    let positiveFlow = 0;
    let negativeFlow = 0;
    
    for (let j = i - period + 1; j <= i; j++) {
      const typicalPrice = (candles[j].high + candles[j].low + candles[j].close) / 3;
      const prevTypicalPrice = (candles[j - 1].high + candles[j - 1].low + candles[j - 1].close) / 3;
      const rawMoneyFlow = typicalPrice * candles[j].volume;
      
      if (typicalPrice > prevTypicalPrice) {
        positiveFlow += rawMoneyFlow;
      } else if (typicalPrice < prevTypicalPrice) {
        negativeFlow += rawMoneyFlow;
      }
    }
    
    const moneyFlowRatio = negativeFlow === 0 ? 100 : positiveFlow / negativeFlow;
    const mfi = 100 - (100 / (1 + moneyFlowRatio));
    
    result.push({
      time: candles[i].time,
      value: mfi
    });
  }
  
  return result;
}

/**
 * Calculate CCI (Commodity Channel Index)
 * Measures current price level relative to an average price level over a period
 */
export function calculateCCI(
  candles: CandleData[],
  period: number = 20
): Array<{ time: number; value: number }> {
  if (candles.length < period) return [];
  
  const result: Array<{ time: number; value: number }> = [];
  const constant = 0.015; // Standard CCI constant
  
  for (let i = period - 1; i < candles.length; i++) {
    // Calculate typical prices for the period
    const typicalPrices: number[] = [];
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      typicalPrices.push(tp);
    }
    
    // Calculate SMA of typical prices
    const sma = typicalPrices.reduce((sum, tp) => sum + tp, 0) / period;
    
    // Calculate mean deviation
    const deviations = typicalPrices.map(tp => Math.abs(tp - sma));
    const meanDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / period;
    
    // Calculate CCI
    const currentTP = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const cci = meanDeviation > 0 ? (currentTP - sma) / (constant * meanDeviation) : 0;
    
    result.push({ time: candles[i].time, value: cci });
  }
  
  return result;
}

export interface ADXValue {
  time: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

/**
 * Calculate ADX (Average Directional Index) with +DI and -DI
 * Measures trend strength (0-100), with directional indicators
 */
export function calculateADX(
  candles: CandleData[],
  period: number = 14
): ADXValue[] {
  if (candles.length < period * 2 + 1) return [];
  
  const result: ADXValue[] = [];
  
  // Step 1: Calculate TR, +DM, -DM for each candle
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    // True Range
    const trValue = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    tr.push(trValue);
    
    // Directional Movement
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Step 2: Calculate first smoothed TR, +DM, -DM (simple average of first period)
  let smoothTR = tr.slice(0, period).reduce((sum, val) => sum + val, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((sum, val) => sum + val, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((sum, val) => sum + val, 0);
  
  // Calculate first +DI, -DI, DX
  let pdi = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
  let mdi = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
  const dxValues: number[] = [];
  const pdiValues: number[] = [];
  const mdiValues: number[] = [];
  
  const diSum = pdi + mdi;
  const dxValue = diSum === 0 ? 0 : (Math.abs(pdi - mdi) / diSum) * 100;
  dxValues.push(dxValue);
  pdiValues.push(pdi);
  mdiValues.push(mdi);
  
  // Step 3: Calculate remaining smoothed values and DX
  for (let i = period; i < tr.length; i++) {
    // Wilder's smoothing
    smoothTR = smoothTR - (smoothTR / period) + tr[i];
    smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDM[i];
    smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDM[i];
    
    pdi = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
    mdi = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
    
    const diSum2 = pdi + mdi;
    const dx = diSum2 === 0 ? 0 : (Math.abs(pdi - mdi) / diSum2) * 100;
    dxValues.push(dx);
    pdiValues.push(pdi);
    mdiValues.push(mdi);
  }
  
  // Step 4: Calculate ADX (smoothed DX)
  if (dxValues.length < period) return [];
  
  let adx = dxValues.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  
  // First ADX value (at index period in dxValues, which is candleIndex period*2)
  // dxValues[0] corresponds to candles[period], so dxValues[period-1] is candles[period*2-1]
  const startIdx = period + (period - 1); // period for TR calc + (period-1) for first ADX
  
  result.push({
    time: candles[startIdx].time,
    adx: adx,
    plusDI: pdiValues[period - 1],
    minusDI: mdiValues[period - 1]
  });
  
  // Subsequent ADX values
  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
    
    const idx = i + period;  // Candle index for this DX value
    if (idx >= candles.length) break;
    
    result.push({
      time: candles[idx].time,
      adx: adx,
      plusDI: pdiValues[i],
      minusDI: mdiValues[i]
    });
  }
  
  return result;
}

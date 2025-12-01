export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface CCIValue {
  time: number;
  value: number;
}

export interface ADXValue {
  time: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

export function calculateCCI(
  candles: CandleData[],
  period: number = 20
): CCIValue[] {
  if (candles.length < period) return [];
  
  const result: CCIValue[] = [];
  const constant = 0.015;
  
  for (let i = period - 1; i < candles.length; i++) {
    const typicalPrices: number[] = [];
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      typicalPrices.push(tp);
    }
    
    const sma = typicalPrices.reduce((sum, tp) => sum + tp, 0) / period;
    const deviations = typicalPrices.map(tp => Math.abs(tp - sma));
    const meanDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / period;
    const currentTP = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const cci = meanDeviation > 0 ? (currentTP - sma) / (constant * meanDeviation) : 0;
    
    result.push({ time: candles[i].time, value: cci });
  }
  
  return result;
}

export function calculateADX(
  candles: CandleData[],
  period: number = 14
): ADXValue[] {
  if (candles.length < period * 2 + 1) return [];
  
  const result: ADXValue[] = [];
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const trValue = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    tr.push(trValue);
    
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  let smoothTR = tr.slice(0, period).reduce((sum, val) => sum + val, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((sum, val) => sum + val, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((sum, val) => sum + val, 0);
  
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
  
  for (let i = period; i < tr.length; i++) {
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
  
  if (dxValues.length < period) return [];
  
  let adx = dxValues.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  const startIdx = period + (period - 1);
  
  result.push({
    time: candles[startIdx].time,
    adx: adx,
    plusDI: pdiValues[period - 1],
    minusDI: mdiValues[period - 1]
  });
  
  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
    const candleIdx = period + i;
    
    result.push({
      time: candles[candleIdx].time,
      adx: adx,
      plusDI: pdiValues[i],
      minusDI: mdiValues[i]
    });
  }
  
  return result;
}

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(data: CandleData[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({
      time: data[i].time,
      value: sum / period
    });
  }
  
  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(data: CandleData[], period: number): IndicatorPoint[] {
  if (data.length < period) return [];
  
  const result: IndicatorPoint[] = [];
  const multiplier = 2 / (period + 1);
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: ema });
  
  for (let i = period; i < data.length; i++) {
    ema = (data[i].close - ema) * multiplier + ema;
    result.push({ time: data[i].time, value: ema });
  }
  
  return result;
}

/**
 * Calculate Relative Strength Index (RSI)
 */
export function calculateRSI(data: CandleData[], period: number = 14): IndicatorPoint[] {
  if (data.length < period + 1) return [];
  
  const result: IndicatorPoint[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;
  
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = 100 - (100 / (1 + rs));
  result.push({ time: data[period].time, value: rsi });
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - (100 / (1 + rs));
    result.push({ time: data[i + 1].time, value: rsi });
  }
  
  return result;
}

/**
 * Calculate MACD
 */
export function calculateMACD(
  data: CandleData[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: IndicatorPoint[]; signal: IndicatorPoint[]; histogram: IndicatorPoint[] } {
  const emaFast = calculateEMA(data, fastPeriod);
  const emaSlow = calculateEMA(data, slowPeriod);
  
  if (emaFast.length === 0 || emaSlow.length === 0) {
    return { macd: [], signal: [], histogram: [] };
  }
  
  const offset = slowPeriod - fastPeriod;
  const macdValues: IndicatorPoint[] = [];
  
  for (let i = 0; i < emaSlow.length; i++) {
    const fastIdx = i + offset;
    if (fastIdx < emaFast.length) {
      macdValues.push({
        time: emaSlow[i].time,
        value: emaFast[fastIdx].value - emaSlow[i].value
      });
    }
  }
  
  if (macdValues.length < signalPeriod) {
    return { macd: macdValues, signal: [], histogram: [] };
  }
  
  const signalData: CandleData[] = macdValues.map(m => ({
    time: m.time, open: m.value, high: m.value, low: m.value, close: m.value, volume: 0
  }));
  
  const signalRaw = calculateEMA(signalData, signalPeriod);
  
  const histogram: IndicatorPoint[] = [];
  const signal: IndicatorPoint[] = [];
  const macd: IndicatorPoint[] = [];
  
  for (let i = 0; i < signalRaw.length; i++) {
    const idx = i + signalPeriod - 1;
    if (idx < macdValues.length) {
      macd.push(macdValues[idx]);
      signal.push(signalRaw[i]);
      histogram.push({
        time: macdValues[idx].time,
        value: macdValues[idx].value - signalRaw[i].value
      });
    }
  }
  
  return { macd, signal, histogram };
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(
  data: CandleData[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: IndicatorPoint[]; middle: IndicatorPoint[]; lower: IndicatorPoint[] } {
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    const sma = sum / period;
    
    let sumSquaredDiff = 0;
    for (let j = 0; j < period; j++) {
      sumSquaredDiff += Math.pow(data[i - j].close - sma, 2);
    }
    const stdDev = Math.sqrt(sumSquaredDiff / period);
    
    middle.push({ time: data[i].time, value: sma });
    upper.push({ time: data[i].time, value: sma + stdDev * stdDevMultiplier });
    lower.push({ time: data[i].time, value: sma - stdDev * stdDevMultiplier });
  }
  
  return { upper, middle, lower };
}

/**
 * Calculate ATR
 */
export function calculateATR(data: CandleData[], period: number = 14): IndicatorPoint[] {
  if (data.length < period) return [];
  
  const result: IndicatorPoint[] = [];
  const trueRanges: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      trueRanges.push(data[i].high - data[i].low);
    } else {
      const highLow = data[i].high - data[i].low;
      const highClose = Math.abs(data[i].high - data[i - 1].close);
      const lowClose = Math.abs(data[i].low - data[i - 1].close);
      trueRanges.push(Math.max(highLow, highClose, lowClose));
    }
  }
  
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i];
  }
  atr /= period;
  result.push({ time: data[period - 1].time, value: atr });
  
  for (let i = period; i < data.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push({ time: data[i].time, value: atr });
  }
  
  return result;
}

/**
 * Calculate VWAP
 */
export function calculateVWAP(data: CandleData[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  
  for (const candle of data) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    
    if (cumulativeVolume > 0) {
      result.push({
        time: candle.time,
        value: cumulativePV / cumulativeVolume
      });
    }
  }
  
  return result;
}

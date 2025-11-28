interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

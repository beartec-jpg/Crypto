/**
 * CHoCH + FVG Strategy
 * Trades FVG retests after price enters from the correct direction
 */

import { calculateSwings } from '@/lib/smc/pivots';
import { calculatePositionSize } from '@/lib/trading/positionCalculator';
import { calculateATR } from '@/lib/indicators/trend';
import { getCurrentATR } from './helpers';
import type { CandleData } from '@/types/chart.types';
import type { FVG, FootprintData } from '@/types/smc.types';
import type { TradeSignal, BotTPSLConfig, TPType } from '@/types/trading.types';

export interface ChochFVGParams {
  enabled: boolean;
  volumeThreshold: number;
  useFVGSizeFilter: boolean;
  fvgMinSizeATR: number;
  tpslConfig: BotTPSLConfig;
  slSwingLength: number;
  tpSwingLength: number;
  accountSize: number;
  riskPercent: number;
  footprintData?: FootprintData[];
  fvgVolumeThreshold: number;
}

function analyzeFVGValue(
  fvg: FVG, 
  candles: CandleData[], 
  footprint: FootprintData[],
  volumeThreshold: number
): { volumeScore: number; deltaScore: number; isHighValue: boolean } {
  let totalVolume = 0;
  let totalDelta = 0;
  let count = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (candle.low <= fvg.upper && candle.high >= fvg.lower) {
      totalVolume += candle.volume;
      
      const fp = footprint.find(f => f.time === candle.time);
      if (fp) {
        totalDelta += Math.abs(fp.delta);
      }
      count++;
    }
  }

  const avgCandleVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
  const volumeScore = count > 0 ? totalVolume / (avgCandleVolume * count) : 0;
  const deltaScore = count > 0 ? totalDelta / count : 0;
  const isHighValue = volumeScore >= volumeThreshold;

  return { volumeScore, deltaScore, isHighValue };
}

function calculateFVGs(
  data: CandleData[], 
  useAtrFilter: boolean, 
  atrFactor: number,
  footprintData: FootprintData[],
  volumeThreshold: number
): FVG[] {
  const atr = calculateATR(data);
  const fvgs: FVG[] = [];
  
  for (let i = 2; i < data.length; i++) {
    let minGap = 0;
    if (useAtrFilter) minGap = atr[i - 2] * atrFactor;
    
    if (data[i].low > data[i - 2].high) {
      const lower = data[i - 2].high;
      const upper = data[i].low;
      if (upper - lower >= minGap) {
        const fvg: FVG = { time: data[i].time, lower, upper, type: 'bullish' };
        const analysis = analyzeFVGValue(fvg, data, footprintData, volumeThreshold);
        fvg.volumeScore = analysis.volumeScore;
        fvg.deltaScore = analysis.deltaScore;
        fvg.isHighValue = analysis.isHighValue;
        fvgs.push(fvg);
      }
    } else if (data[i].high < data[i - 2].low) {
      const lower = data[i].high;
      const upper = data[i - 2].low;
      if (upper - lower >= minGap) {
        const fvg: FVG = { time: data[i].time, lower, upper, type: 'bearish' };
        const analysis = analyzeFVGValue(fvg, data, footprintData, volumeThreshold);
        fvg.volumeScore = analysis.volumeScore;
        fvg.deltaScore = analysis.deltaScore;
        fvg.isHighValue = analysis.isHighValue;
        fvgs.push(fvg);
      }
    }
  }
  return fvgs;
}

function priceInZone(price: number, lower: number, upper: number): boolean {
  return price >= lower && price <= upper;
}

export function generateChochFVGSignal(
  data: CandleData[],
  params: ChochFVGParams
): TradeSignal | null {
  if (!params.enabled || data.length < 50) return null;
  
  const fvgs = calculateFVGs(data, true, 0.5, params.footprintData || [], params.fvgVolumeThreshold);
  const currentCandle = data[data.length - 1];
  const currentPrice = currentCandle.close;
  
  const relevantFVGs = fvgs.filter(fvg => {
    const inZoneCheck = priceInZone(currentPrice, fvg.lower, fvg.upper);
    const validVolume = (fvg.volumeScore || 0) >= params.volumeThreshold;
    
    let significantSize = true;
    if (params.useFVGSizeFilter) {
      const fvgHeight = fvg.upper - fvg.lower;
      const minHeight = getCurrentATR(data) * (params.fvgMinSizeATR / 100);
      significantSize = fvgHeight >= minHeight;
    }
    
    const fvgIndex = data.findIndex(c => c.time === fvg.time);
    if (fvgIndex < 0 || fvgIndex >= data.length - 1) return false;
    
    const prevCandle = data[data.length - 2];
    const enteringFromAbove = prevCandle.close > fvg.upper && currentPrice >= fvg.lower && currentPrice <= fvg.upper;
    const enteringFromBelow = prevCandle.close < fvg.lower && currentPrice >= fvg.lower && currentPrice <= fvg.upper;
    
    const correctEntry = (fvg.type === 'bullish' && enteringFromAbove) || (fvg.type === 'bearish' && enteringFromBelow);
    
    return inZoneCheck && validVolume && significantSize && correctEntry;
  });
  
  if (relevantFVGs.length === 0) return null;
  
  const fvg = relevantFVGs[0];
  const isLong = fvg.type === 'bullish';
  const entry = isLong ? fvg.upper : fvg.lower;
  const atr = getCurrentATR(data);
  
  console.log('✅ FVG Retest Entry:', {
    type: fvg.type.toUpperCase(),
    direction: isLong ? 'LONG' : 'SHORT',
    fvgZone: `${fvg.lower.toFixed(4)} - ${fvg.upper.toFixed(4)}`,
    entry: entry.toFixed(4),
    currentPrice: currentPrice.toFixed(4),
  });
  
  const slConfig = params.tpslConfig.sl;
  let stopLoss: number;
  
  if (slConfig.type === 'structure') {
    const swings = calculateSwings(data, params.slSwingLength);
    const fvgBoundary = isLong ? fvg.lower : fvg.upper;
    
    let nearestPivot: number | null = null;
    for (let i = swings.length - 1; i >= 0; i--) {
      const swing = swings[i];
      if (isLong && swing.type === 'low' && swing.value < fvgBoundary) {
        nearestPivot = swing.value;
        break;
      } else if (!isLong && swing.type === 'high' && swing.value > fvgBoundary) {
        nearestPivot = swing.value;
        break;
      }
    }
    
    stopLoss = nearestPivot !== null ? nearestPivot : (isLong ? fvg.lower * 0.99 : fvg.upper * 1.01);
  } else {
    const distancePercent = (slConfig.fixedDistance || 1.0) / 100;
    const fvgBoundary = isLong ? fvg.lower : fvg.upper;
    stopLoss = isLong ? fvgBoundary * (1 - distancePercent) : fvgBoundary * (1 + distancePercent);
  }
  
  const riskAmount = Math.abs(entry - stopLoss);
  
  const { tp1: tp1Config } = params.tpslConfig;
  let tp1: number;
  let tp1Type: TPType = 'structure';
  
  if (tp1Config.type === 'structure') {
    const swings = calculateSwings(data, params.tpSwingLength);
    const targetPivots = isLong 
      ? swings.filter(s => s.type === 'high' && s.value > entry).sort((a, b) => a.value - b.value)
      : swings.filter(s => s.type === 'low' && s.value < entry).sort((a, b) => b.value - a.value);
    
    tp1 = targetPivots.length > 0 ? targetPivots[0].value : stopLoss;
    
    console.log('📊 Structure TP:', {
      direction: isLong ? 'LONG' : 'SHORT',
      entry: entry.toFixed(4),
      targetPivot: tp1.toFixed(4),
      pivotsFound: targetPivots.length,
    });
  } else {
    tp1 = isLong ? entry * 100 : entry * 0.01;
    tp1Type = 'trailing';
    
    console.log('📊 Trailing TP Initialized:', {
      direction: isLong ? 'LONG' : 'SHORT',
      entry: entry.toFixed(4),
      sl: stopLoss.toFixed(4),
      initialTP: 'Disabled (far away)',
      note: 'Will activate when profitable + swing forms',
    });
  }
  
  return {
    id: `fvg_${fvg.time}_${entry.toFixed(4)}`,
    time: data[data.length - 1].time,
    type: isLong ? 'LONG' : 'SHORT',
    strategy: 'choch_fvg',
    entry,
    stopLoss,
    tp1,
    tp2: tp1,
    tp3: tp1,
    tp1Type,
    tp2Type: tp1Type,
    tp3Type: tp1Type,
    riskReward1: Math.abs(tp1 - entry) / riskAmount,
    riskReward2: Math.abs(tp1 - entry) / riskAmount,
    riskReward3: Math.abs(tp1 - entry) / riskAmount,
    quantity: calculatePositionSize(params.accountSize, params.riskPercent, entry, stopLoss),
    reason: `FVG Retest (${fvg.type})`,
    active: true,
    trailingActive: tp1Config.type === 'trailing' ? false : undefined,
  };
}

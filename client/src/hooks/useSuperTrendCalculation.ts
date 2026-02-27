import { useMemo } from 'react';
import type { Candle } from '@/types/candle';
import type { CandleData } from '@/lib/indicators';
import { calculateATR, calculateEMA } from '@/lib/indicators';
import type { SuperTrendSettings, SuperTrendConfig } from '@/types/supertrend';

export interface SuperTrendPoint {
  time: number;
  value: number;
  trend: 'bullish' | 'bearish';
  signal?: 'buy' | 'sell';
  filtered?: boolean; // for ADX type: true when ADX below threshold
}

export interface SuperTrendData {
  standard: SuperTrendPoint[];
  adx: SuperTrendPoint[];
  keltner: SuperTrendPoint[];
}

function detectFlip(
  result: SuperTrendPoint[],
  currentTrend: 'bullish' | 'bearish',
): 'buy' | 'sell' | undefined {
  if (result.length === 0) return undefined;
  const prev = result[result.length - 1];
  if (prev.trend === 'bearish' && currentTrend === 'bullish') return 'buy';
  if (prev.trend === 'bullish' && currentTrend === 'bearish') return 'sell';
  return undefined;
}

function calculateStandardSuperTrend(
  candles: Candle[],
  config: SuperTrendConfig,
): SuperTrendPoint[] {
  const { period, multiplier } = config;
  const atrValues = calculateATR(candles as unknown as CandleData[], period);

  if (atrValues.length === 0) return [];

  // ATR array starts at index `period` of candles (candles[period])
  const offset = candles.length - atrValues.length;

  let trend: 'bullish' | 'bearish' = 'bullish';
  let upperBandPrev = 0;
  let lowerBandPrev = 0;
  const result: SuperTrendPoint[] = [];

  for (let i = 0; i < atrValues.length; i++) {
    const candleIdx = i + offset;
    const candle = candles[candleIdx];
    const prevCandle = candleIdx > 0 ? candles[candleIdx - 1] : null;
    const atr = atrValues[i].value;
    const hl2 = (candle.high + candle.low) / 2;

    const rawUpper = hl2 + atr * multiplier;
    const rawLower = hl2 - atr * multiplier;

    // Band smoothing (standard SuperTrend logic)
    const upperBand =
      i === 0
        ? rawUpper
        : rawUpper < upperBandPrev || (prevCandle && prevCandle.close > upperBandPrev)
        ? rawUpper
        : upperBandPrev;
    const lowerBand =
      i === 0
        ? rawLower
        : rawLower > lowerBandPrev || (prevCandle && prevCandle.close < lowerBandPrev)
        ? rawLower
        : lowerBandPrev;

    // Determine trend
    if (trend === 'bullish' && candle.close < lowerBand) {
      trend = 'bearish';
    } else if (trend === 'bearish' && candle.close > upperBand) {
      trend = 'bullish';
    }

    const value = trend === 'bullish' ? lowerBand : upperBand;
    const signal = detectFlip(result, trend);

    result.push({ time: candle.time, value, trend, signal });

    upperBandPrev = upperBand;
    lowerBandPrev = lowerBand;
  }

  return result;
}

function calculateADXValues(
  candles: Candle[],
  period: number,
): { value: number; time: number }[] {
  if (candles.length < period * 2 + 1) return [];

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const highLow = candles[i].high - candles[i].low;
    const highClose = Math.abs(candles[i].high - candles[i - 1].close);
    const lowClose = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(highLow, highClose, lowClose));
  }

  if (tr.length < period) return [];

  // Wilder's smoothing initial values
  let smoothTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  for (let i = period; i < tr.length; i++) {
    smoothTR = smoothTR - smoothTR / period + tr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    const plusDI = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
    const minusDI = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return [];

  // ADX = smoothed DX
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: { value: number; time: number }[] = [];

  // First ADX corresponds to candle at index: 1 (TR offset) + period (first smooth) + period (first ADX smooth) - 1
  const startCandleIdx = period + period; // candles[period*2] is the first ADX candle
  result.push({ time: candles[startCandleIdx].time, value: adx });

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
    result.push({ time: candles[startCandleIdx + (i - period) + 1].time, value: adx });
  }

  return result;
}

function calculateADXSuperTrend(
  candles: Candle[],
  config: SuperTrendConfig,
): SuperTrendPoint[] {
  const stValues = calculateStandardSuperTrend(candles, config);
  const adxValues = calculateADXValues(candles, config.adxPeriod);

  if (adxValues.length === 0) return stValues;

  // Build a time-indexed map for ADX values
  const adxMap = new Map<number, number>();
  for (const adx of adxValues) {
    adxMap.set(adx.time, adx.value);
  }

  return stValues.map((st) => {
    const adxValue = adxMap.get(st.time);
    const filtered = adxValue !== undefined && adxValue < config.adxThreshold;
    return {
      ...st,
      signal: filtered ? undefined : st.signal,
      filtered,
    };
  });
}

function calculateKeltnerSuperTrend(
  candles: Candle[],
  config: SuperTrendConfig,
): SuperTrendPoint[] {
  const { period, multiplier, emaPeriod } = config;
  const closes = candles.map((c) => c.close);
  const emaValues = calculateEMA(closes, emaPeriod);
  const atrValues = calculateATR(candles as unknown as CandleData[], period);

  if (emaValues.length === 0 || atrValues.length === 0) return [];

  // EMA starts at index (emaPeriod - 1) of candles
  // ATR starts at index `period` of candles
  const emaOffset = candles.length - emaValues.length; // = emaPeriod - 1
  const atrOffset = candles.length - atrValues.length; // = period

  const startIdx = Math.max(emaOffset, atrOffset);

  let trend: 'bullish' | 'bearish' = 'bullish';
  let upperBandPrev = 0;
  let lowerBandPrev = 0;
  const result: SuperTrendPoint[] = [];

  for (let candleIdx = startIdx; candleIdx < candles.length; candleIdx++) {
    const candle = candles[candleIdx];
    const prevCandle = candleIdx > 0 ? candles[candleIdx - 1] : null;
    const ema = emaValues[candleIdx - emaOffset];
    const atr = atrValues[candleIdx - atrOffset].value;

    const rawUpper = ema + atr * multiplier;
    const rawLower = ema - atr * multiplier;

    const i = candleIdx - startIdx;
    const upperBand =
      i === 0
        ? rawUpper
        : rawUpper < upperBandPrev || (prevCandle && prevCandle.close > upperBandPrev)
        ? rawUpper
        : upperBandPrev;
    const lowerBand =
      i === 0
        ? rawLower
        : rawLower > lowerBandPrev || (prevCandle && prevCandle.close < lowerBandPrev)
        ? rawLower
        : lowerBandPrev;

    if (trend === 'bullish' && candle.close < lowerBand) {
      trend = 'bearish';
    } else if (trend === 'bearish' && candle.close > upperBand) {
      trend = 'bullish';
    }

    const value = trend === 'bullish' ? lowerBand : upperBand;
    const signal = detectFlip(result, trend);

    result.push({ time: candle.time, value, trend, signal });

    upperBandPrev = upperBand;
    lowerBandPrev = lowerBand;
  }

  return result;
}

export function useSuperTrendCalculation(
  candles: Candle[],
  settings: SuperTrendSettings,
): SuperTrendData {
  return useMemo(() => {
    const standard = settings.standard.enabled
      ? calculateStandardSuperTrend(candles, settings.standard)
      : [];

    const adx = settings.adx.enabled
      ? calculateADXSuperTrend(candles, settings.adx)
      : [];

    const keltner = settings.keltner.enabled
      ? calculateKeltnerSuperTrend(candles, settings.keltner)
      : [];

    return { standard, adx, keltner };
  }, [candles, settings]);
}

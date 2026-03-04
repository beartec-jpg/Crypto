import { scoreSystem } from './tradingSystemScoring';
import type { TradingSystemId } from '@/types/tradingSystems';
import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { SuperTrendPoint } from '@/hooks/useSuperTrendCalculation';
import type { DivergencePoint } from '@/types/chart.types';
import type { Candle } from '@/types/chart';

export interface SystemSignal {
  type: 'buy' | 'sell';
  time: number;
  index: number;
  score: number;
  price: number;
}

export interface BacktestResult {
  buySignals: SystemSignal[];
  sellSignals: SystemSignal[];
  totalCandles: number;
}

export interface ViewportBacktestParams {
  systemId: TradingSystemId;
  candles: Candle[];
  startIdx: number;
  endIdx: number;
  oscillatorData: OscillatorData;
  superTrendStandard: SuperTrendPoint[];
  structureBreaks: Array<{
    breakTime: number;
    breakIndex?: number;
    direction: 'bullish' | 'bearish';
    type?: string;
    swept?: boolean;
    brokenLevel?: number;
    confirmed?: boolean;
  }>;
  sqzData: Array<{ time: number; sqzOff: boolean; value: number }>;
  htfBiasEntries: Array<{ bias: 'bullish' | 'bearish' }>;
  divergencePoints: DivergencePoint[];
  fvgs: Array<{ top: number; bottom: number; mitigated: boolean; type: 'bullish' | 'bearish' }>;
  orderBlocks: Array<{ top: number; bottom: number; type: 'bullish' | 'bearish' }>;
  liquidityZones: Array<{ price: number; type: 'high' | 'low'; swept: boolean }>;
  volumeProfileData?: {
    rows: Array<{ price: number; volume: number }>;
    vahPrice?: number;
    valPrice?: number;
    poc?: number;
  } | null;
  swingPoints?: Array<{ type: 'high' | 'low'; price: number; time: number; index: number }>;
}

function calcSMA(candles: Array<{ close: number }>, endIndex: number, period: number): number | undefined {
  if (endIndex < period - 1 || period <= 0) return undefined;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) sum += candles[i].close;
  return sum / period;
}

function calcAvgVolume(candles: Array<{ volume?: number }>, endIndex: number, period: number): number | undefined {
  if (endIndex < period - 1 || period <= 0) return undefined;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    sum += candles[i].volume ?? 0;
  }
  return sum / period;
}

function calcSupportResistance(
  candles: Array<{ low: number; high: number }>,
  endIndex: number,
  lookback = 20,
): { supportLevel?: number; resistanceLevel?: number } {
  if (endIndex < 1) return {};
  const start = Math.max(0, endIndex - lookback + 1);
  let support = candles[start].low;
  let resistance = candles[start].high;
  for (let i = start + 1; i <= endIndex; i++) {
    support = Math.min(support, candles[i].low);
    resistance = Math.max(resistance, candles[i].high);
  }
  return { supportLevel: support, resistanceLevel: resistance };
}

export function runTradingSystemBacktest(params: ViewportBacktestParams): BacktestResult {
  const {
    systemId,
    candles,
    startIdx,
    endIdx,
    oscillatorData,
    superTrendStandard,
    structureBreaks,
    sqzData,
    htfBiasEntries,
    divergencePoints,
    fvgs,
    orderBlocks,
    liquidityZones,
    volumeProfileData,
    swingPoints,
  } = params;

  const buyThreshold = parseInt(
    localStorage.getItem(`tradingSystem_${systemId}_buyThreshold`) || '70',
    10,
  );
  const sellThreshold = parseInt(
    localStorage.getItem(`tradingSystem_${systemId}_sellThreshold`) || '70',
    10,
  );

  const rsiByTime = new Map<number, number>(oscillatorData.rsi.map(p => [Number(p.time), p.value]));
  const macdByTime = new Map<number, number>(oscillatorData.macd.macd.map(p => [Number(p.time), p.value]));
  const signalByTime = new Map<number, number>(oscillatorData.macd.signal.map(p => [Number(p.time), p.value]));
  const superTrendByTime = new Map<number, 'bullish' | 'bearish'>(
    superTrendStandard.map(p => [Number(p.time), p.trend]),
  );
  const sqzByTime = new Map<number, { sqzOff: boolean; value: number }>(
    sqzData.map(p => [Number(p.time), { sqzOff: p.sqzOff, value: p.value }]),
  );

  const htfBullish = htfBiasEntries.filter(e => e.bias === 'bullish').length;
  const htfBearish = htfBiasEntries.filter(e => e.bias === 'bearish').length;

  const mappedFvgs = fvgs.map(fvg => ({ high: fvg.top, low: fvg.bottom, filled: fvg.mitigated, type: fvg.type }));
  const mappedOrderBlocks = orderBlocks.map(ob => ({ high: ob.top, low: ob.bottom, type: ob.type }));
  const mappedLiquidityZones = liquidityZones.map(lz => ({ price: lz.price, type: lz.type, swept: lz.swept }));
  const mappedVolumeProfile = volumeProfileData
    ? {
        rows: volumeProfileData.rows.map(r => ({ price: r.price, volume: r.volume })),
        valueAreaHigh: volumeProfileData.vahPrice,
        valueAreaLow: volumeProfileData.valPrice,
        poc: volumeProfileData.poc,
      }
    : undefined;

  const minBarsBetweenActivations =
    systemId === 'volume-profile' ? 12 : systemId === 'smart-money' ? 16 : 4;

  const buySignals: SystemSignal[] = [];
  const sellSignals: SystemSignal[] = [];

  let previousAction: 'buy' | 'sell' | 'wait' = 'wait';
  let lastActivationIndex = startIdx - 1000;

  const clampedStart = Math.max(1, startIdx);
  const clampedEnd = Math.min(endIdx, candles.length - 1);

  for (let index = clampedStart; index <= clampedEnd; index++) {
    const currentCandle = candles[index];
    const prevCandle = candles[index - 1];
    const currentTime = Number(currentCandle.time);
    const prevTime = Number(prevCandle.time);

    const avgVolume = calcAvgVolume(candles, index, 20);
    const shortTermMA = calcSMA(candles, index, 9);
    const longTermMA = calcSMA(candles, index, 21);
    const { supportLevel, resistanceLevel } = calcSupportResistance(candles, index, 20);

    let latestStructureDirection: 'bullish' | 'bearish' | undefined;
    for (let bi = structureBreaks.length - 1; bi >= 0; bi--) {
      if (structureBreaks[bi].breakTime <= currentTime) {
        latestStructureDirection = structureBreaks[bi].direction;
        break;
      }
    }

    const sqzValue = sqzByTime.get(currentTime);
    const evaluation = scoreSystem(systemId, {
      lastRsi: rsiByTime.get(currentTime),
      prevRsi: rsiByTime.get(prevTime),
      macdNow: macdByTime.get(currentTime),
      macdPrev: macdByTime.get(prevTime),
      sigNow: signalByTime.get(currentTime),
      sigPrev: signalByTime.get(prevTime),
      stTrend: superTrendByTime.get(currentTime),
      latestStructureDirection,
      sqzOff: sqzValue?.sqzOff,
      sqzValue: sqzValue?.value,
      htfBullish,
      htfBearish,
      rsi: rsiByTime.get(currentTime),
      currentPrice: currentCandle.close,
      supportLevel,
      resistanceLevel,
      currentVolume: currentCandle.volume,
      avgVolume,
      shortTermMA,
      longTermMA,
      latestClose: currentCandle.close,
      previousClose: prevCandle.close,
      divergencePoints,
      currentTime,
      currentCandleIndex: index,
      structureBreaks,
      swingPoints,
      fvgs: mappedFvgs,
      orderBlocks: mappedOrderBlocks,
      liquidityZones: mappedLiquidityZones,
      volumeProfileData: mappedVolumeProfile,
    });

    const action: 'buy' | 'sell' | 'wait' =
      evaluation.score >= buyThreshold
        ? 'buy'
        : evaluation.score <= -sellThreshold
          ? 'sell'
          : 'wait';

    if (
      action !== 'wait' &&
      action !== previousAction &&
      index - lastActivationIndex >= minBarsBetweenActivations
    ) {
      const signal: SystemSignal = {
        type: action,
        time: currentTime,
        index,
        score: evaluation.score,
        price: currentCandle.close,
      };
      if (action === 'buy') {
        buySignals.push(signal);
      } else {
        sellSignals.push(signal);
      }
      lastActivationIndex = index;
    }

    previousAction = action;
  }

  return {
    buySignals,
    sellSignals,
    totalCandles: Math.max(0, clampedEnd - clampedStart + 1),
  };
}

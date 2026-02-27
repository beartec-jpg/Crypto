import { useMemo } from 'react';
import { TRADING_SYSTEMS, type TradingSystemId } from '@/types/tradingSystems';
import type { Candle } from '@/types/candle';

interface OscillatorData {
  rsi: Array<{ value: number }>;
  macd: {
    macd: Array<{ value: number }>;
    signal: Array<{ value: number }>;
  };
}

interface SuperTrendData {
  standard: Array<{ trend: 'bullish' | 'bearish' }>;
}

interface StructureBreak {
  breakTime: number;
  direction: 'bullish' | 'bearish';
}

interface SqueezeMomentumPoint {
  sqzOff?: boolean;
  value?: number;
}

interface HTFBiasEntry {
  bias: 'bullish' | 'bearish' | 'neutral';
}

export interface SystemDetail {
  systemId: string;
  systemName: string;
  score: number;
  state: 'bullish' | 'bearish' | 'neutral';
}

export interface ConfluenceResult {
  score: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
  systemDetails: SystemDetail[];
}

function evaluateSystem(
  systemId: TradingSystemId,
  lastRsi: number | undefined,
  prevRsi: number | undefined,
  macdNow: number | undefined,
  macdPrev: number | undefined,
  sigNow: number | undefined,
  sigPrev: number | undefined,
  stTrend: 'bullish' | 'bearish' | undefined,
  latestStructureDirection: 'bullish' | 'bearish' | undefined,
  sqzOff: boolean | undefined,
  sqzValue: number | undefined,
  htfBullish: number,
  htfBearish: number,
  latestClose: number,
  previousClose: number,
): 'OPEN LONG' | 'OPEN SHORT' | 'WAIT' {
  const macdBullCross =
    macdPrev !== undefined && sigPrev !== undefined && macdNow !== undefined && sigNow !== undefined
      ? macdPrev <= sigPrev && macdNow > sigNow
      : false;
  const macdBearCross =
    macdPrev !== undefined && sigPrev !== undefined && macdNow !== undefined && sigNow !== undefined
      ? macdPrev >= sigPrev && macdNow < sigNow
      : false;

  const longReasons: string[] = [];
  const shortReasons: string[] = [];

  switch (systemId) {
    case 'trend-following':
      if (stTrend === 'bullish') longReasons.push('SuperTrend bullish');
      if (stTrend === 'bearish') shortReasons.push('SuperTrend bearish');
      if (macdNow !== undefined && sigNow !== undefined && macdNow > sigNow) longReasons.push('MACD above signal');
      if (macdNow !== undefined && sigNow !== undefined && macdNow < sigNow) shortReasons.push('MACD below signal');
      break;
    case 'mean-reversion':
      if (lastRsi !== undefined && lastRsi <= 30) longReasons.push(`RSI oversold (${lastRsi.toFixed(1)})`);
      if (lastRsi !== undefined && lastRsi >= 70) shortReasons.push(`RSI overbought (${lastRsi.toFixed(1)})`);
      if (lastRsi !== undefined && lastRsi <= 35 && latestClose > previousClose) longReasons.push('Rebound candle confirmed');
      if (lastRsi !== undefined && lastRsi >= 65 && latestClose < previousClose) shortReasons.push('Rejection candle confirmed');
      break;
    case 'breakout-momentum':
      if (latestStructureDirection === 'bullish') longReasons.push('Recent bullish BOS/CHoCH');
      if (latestStructureDirection === 'bearish') shortReasons.push('Recent bearish BOS/CHoCH');
      if (sqzOff && (sqzValue ?? 0) > 0) longReasons.push('Squeeze released up');
      if (sqzOff && (sqzValue ?? 0) < 0) shortReasons.push('Squeeze released down');
      break;
    case 'smart-money':
      if (latestStructureDirection === 'bullish') longReasons.push('SMC structure shift bullish');
      if (latestStructureDirection === 'bearish') shortReasons.push('SMC structure shift bearish');
      if (latestStructureDirection === 'bullish' && latestClose > previousClose) longReasons.push('Follow-through close after shift');
      if (latestStructureDirection === 'bearish' && latestClose < previousClose) shortReasons.push('Follow-through close after shift');
      if (latestStructureDirection === 'bullish' && stTrend === 'bullish') longReasons.push('Trend aligned with bullish shift');
      if (latestStructureDirection === 'bearish' && stTrend === 'bearish') shortReasons.push('Trend aligned with bearish shift');
      if (lastRsi !== undefined && lastRsi > 52) longReasons.push('Bullish momentum confirmation');
      if (lastRsi !== undefined && lastRsi < 48) shortReasons.push('Bearish momentum confirmation');
      break;
    case 'momentum-scalper':
      if (macdBullCross) longReasons.push('MACD bullish crossover');
      if (macdBearCross) shortReasons.push('MACD bearish crossover');
      if (stTrend === 'bullish') longReasons.push('Momentum trend bullish');
      if (stTrend === 'bearish') shortReasons.push('Momentum trend bearish');
      if (macdNow !== undefined && macdNow > 0) longReasons.push('MACD above zero line');
      if (macdNow !== undefined && macdNow < 0) shortReasons.push('MACD below zero line');
      break;
    case 'divergence-master':
      if (macdBullCross) longReasons.push('Bullish momentum shift');
      if (macdBearCross) shortReasons.push('Bearish momentum shift');
      if (lastRsi !== undefined && lastRsi < 40) longReasons.push('RSI weak/discount zone');
      if (lastRsi !== undefined && lastRsi > 60) shortReasons.push('RSI strong/premium zone');
      break;
    case 'mtf-confluence':
      if (htfBullish >= 2) longReasons.push('HTF bias mostly bullish');
      if (htfBearish >= 2) shortReasons.push('HTF bias mostly bearish');
      if (stTrend === 'bullish') longReasons.push('Local trend bullish');
      if (stTrend === 'bearish') shortReasons.push('Local trend bearish');
      break;
    case 'volume-profile':
      if (lastRsi !== undefined && prevRsi !== undefined && prevRsi <= 50 && lastRsi > 50) longReasons.push('RSI crossed above midpoint');
      if (lastRsi !== undefined && prevRsi !== undefined && prevRsi >= 50 && lastRsi < 50) shortReasons.push('RSI crossed below midpoint');
      if (latestClose > previousClose) longReasons.push('Bullish candle follow-through');
      if (latestClose < previousClose) shortReasons.push('Bearish candle follow-through');
      if (lastRsi !== undefined && lastRsi <= 40 && latestClose > previousClose) longReasons.push('Discount zone rebound confirmation');
      if (lastRsi !== undefined && lastRsi >= 60 && latestClose < previousClose) shortReasons.push('Premium zone rejection confirmation');
      break;
    default:
      break;
  }

  const requiredConfluence = systemId === 'smart-money' ? 3 : 2;

  if (longReasons.length >= requiredConfluence) return 'OPEN LONG';
  if (shortReasons.length >= requiredConfluence) return 'OPEN SHORT';
  return 'WAIT';
}

export function useMultiSystemConfluence(
  candles: Candle[],
  oscillatorData: OscillatorData,
  superTrendData: SuperTrendData,
  structureBreaks: StructureBreak[],
  sqzData: SqueezeMomentumPoint[],
  htfBiasEntries: HTFBiasEntry[],
): ConfluenceResult | null {
  return useMemo(() => {
    if (candles.length < 2) return null;

    const previousCandle = candles[candles.length - 2];
    const latestCandle = candles[candles.length - 1];

    const lastRsi = oscillatorData.rsi[oscillatorData.rsi.length - 1]?.value;
    const prevRsi = oscillatorData.rsi[oscillatorData.rsi.length - 2]?.value;
    const macdNow = oscillatorData.macd.macd[oscillatorData.macd.macd.length - 1]?.value;
    const macdPrev = oscillatorData.macd.macd[oscillatorData.macd.macd.length - 2]?.value;
    const sigNow = oscillatorData.macd.signal[oscillatorData.macd.signal.length - 1]?.value;
    const sigPrev = oscillatorData.macd.signal[oscillatorData.macd.signal.length - 2]?.value;
    const stLatest = superTrendData.standard[superTrendData.standard.length - 1];
    const stTrend = stLatest?.trend;
    const latestStructureBreak = structureBreaks[structureBreaks.length - 1];
    const latestSqz = sqzData[sqzData.length - 1];
    const htfBullish = htfBiasEntries.filter(entry => entry.bias === 'bullish').length;
    const htfBearish = htfBiasEntries.filter(entry => entry.bias === 'bearish').length;

    const systemIds = Object.keys(TRADING_SYSTEMS) as TradingSystemId[];
    let longCount = 0;
    let shortCount = 0;
    let neutralCount = 0;
    let scoreSum = 0;
    const systemDetails: SystemDetail[] = [];

    for (const systemId of systemIds) {
      const action = evaluateSystem(
        systemId,
        lastRsi,
        prevRsi,
        macdNow,
        macdPrev,
        sigNow,
        sigPrev,
        stTrend,
        latestStructureBreak?.direction,
        latestSqz?.sqzOff,
        latestSqz?.value,
        htfBullish,
        htfBearish,
        latestCandle.close,
        previousCandle.close,
      );

      const system = TRADING_SYSTEMS[systemId];
      let state: 'bullish' | 'bearish' | 'neutral';
      let score: number;

      if (action === 'OPEN LONG') {
        longCount += 1;
        scoreSum += 1;
        state = 'bullish';
        score = 1;
      } else if (action === 'OPEN SHORT') {
        shortCount += 1;
        scoreSum -= 1;
        state = 'bearish';
        score = -1;
      } else {
        neutralCount += 1;
        state = 'neutral';
        score = 0;
      }

      systemDetails.push({
        systemId,
        systemName: system?.name ?? systemId,
        score,
        state,
      });
    }

    const totalScore = systemIds.length > 0 ? scoreSum / systemIds.length : 0;

    return {
      score: totalScore,
      longCount,
      shortCount,
      neutralCount,
      systemDetails,
    };
  }, [candles, oscillatorData, superTrendData.standard, structureBreaks, sqzData, htfBiasEntries]);
}

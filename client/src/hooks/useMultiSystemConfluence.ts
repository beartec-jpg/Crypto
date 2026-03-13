import { useMemo, useRef, useEffect } from 'react';
import { TRADING_SYSTEMS, type TradingSystemId } from '@/types/tradingSystems';
import { scoreSystem, type ScoringInput } from '@/lib/tradingSystemScoring';
import { detectMarketPattern, type MarketPattern } from '@/lib/confluencePatterns';
import type { Candle } from '@/types/candle';
import type { DivergencePoint } from '@/types/chart.types';
import type { FibSetResult } from '@/types/autoFib';

interface OscillatorData {
  rsi: Array<{ value: number; time?: number | string }>;
  macd: {
    macd: Array<{ value: number; time?: number | string }>;
    signal: Array<{ value: number; time?: number | string }>;
    histogram?: Array<{ value: number; time?: number | string }>;
  };
}

interface SuperTrendData {
  standard: Array<{ trend: 'bullish' | 'bearish' }>;
}

interface StructureBreak {
  breakTime: number;
  breakIndex?: number;
  direction: 'bullish' | 'bearish';
  type?: 'bos' | 'choch' | 'mss';
  swept?: boolean;
  brokenLevel?: number;
}

interface HTFBiasEntry {
  bias: 'bullish' | 'bearish' | 'neutral';
}

export interface SystemDetail {
  systemId: string;
  systemName: string;
  /** Continuous score: -100 to +100 */
  score: number;
  state: 'bullish' | 'bearish' | 'neutral';
  signalLabel: string;
  signalColor: string;
  conditions?: Array<{ name: string; met: boolean; weight: number; value?: string }>;
}

export interface ConfluenceResult {
  /** Average score normalised to -1..+1 */
  score: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
  systemDetails: SystemDetail[];
  /** Top market patterns detected (up to 3), sorted by priority. */
  patterns: MarketPattern[];
}

export function useMultiSystemConfluence(
  candles: Candle[],
  oscillatorData: OscillatorData,
  superTrendData: SuperTrendData,
  structureBreaks: StructureBreak[],
  htfBiasEntries: HTFBiasEntry[],
  divergencePoints?: DivergencePoint[],
  fvgs?: Array<{ high: number; low: number; filled: boolean; type: 'bullish' | 'bearish' }>,
  orderBlocks?: Array<{ high: number; low: number; type: 'bullish' | 'bearish'; mitigated?: boolean }>,
  breakers?: Array<{ high: number; low: number; type: 'bullish' | 'bearish'; mitigated?: boolean; conversionIndex?: number; conversionPrice?: number }>,
  liquidityZones?: Array<{ price: number; type: 'high' | 'low'; swept: boolean; sweepPrice?: number; sweepIndex?: number; sweptIndex?: number }>,
  volumeProfileData?: { rows: Array<{ price: number; volume: number }>; valueAreaHigh?: number; valueAreaLow?: number; poc?: number },
  weightsVersion?: number,
  autoFibResult?: { primary: FibSetResult | null; secondary: FibSetResult | null },
  swingPoints?: Array<{ type: 'high' | 'low'; price: number; time: number; index: number }>,
): ConfluenceResult | null {
  const previousScoreRef = useRef<number | undefined>(undefined);

  const result = useMemo(() => {
    if (candles.length < 2) return null;

    const previousCandle = candles[candles.length - 2];
    const latestCandle = candles[candles.length - 1];

    const lastRsi = oscillatorData.rsi[oscillatorData.rsi.length - 1]?.value;
    const prevRsi = oscillatorData.rsi[oscillatorData.rsi.length - 2]?.value;
    const macdNow = oscillatorData.macd.macd[oscillatorData.macd.macd.length - 1]?.value;
    const macdPrev = oscillatorData.macd.macd[oscillatorData.macd.macd.length - 2]?.value;
    const sigNow = oscillatorData.macd.signal[oscillatorData.macd.signal.length - 1]?.value;
    const sigPrev = oscillatorData.macd.signal[oscillatorData.macd.signal.length - 2]?.value;
    const macdHistogram = oscillatorData.macd.histogram
      ? oscillatorData.macd.histogram[oscillatorData.macd.histogram.length - 1]?.value
      : undefined;
    const prevMacdHistogram = oscillatorData.macd.histogram
      ? oscillatorData.macd.histogram[oscillatorData.macd.histogram.length - 2]?.value
      : undefined;

    const stLatest = superTrendData.standard[superTrendData.standard.length - 1];
    const stTrend = stLatest?.trend;
    const latestStructureBreak = structureBreaks[structureBreaks.length - 1];
    const htfBullish = htfBiasEntries.filter(entry => entry.bias === 'bullish').length;
    const htfBearish = htfBiasEntries.filter(entry => entry.bias === 'bearish').length;

    const currentTime = Number(latestCandle.time);
    const currentPrice = latestCandle.close;
    const supportSlice = candles.slice(Math.max(0, candles.length - 20));
    const supportLevel = supportSlice.length > 0 ? Math.min(...supportSlice.map(c => c.low)) : undefined;
    const resistanceLevel = supportSlice.length > 0 ? Math.max(...supportSlice.map(c => c.high)) : undefined;
    const currentVolume = latestCandle.volume;
    const recentVolume = candles.slice(Math.max(0, candles.length - 20));
    const avgVolume = recentVolume.length > 0
      ? recentVolume.reduce((sum, candle) => sum + candle.volume, 0) / recentVolume.length
      : undefined;
    const shortTermSlice = candles.slice(Math.max(0, candles.length - 9));
    const shortTermMA = shortTermSlice.length === 9
      ? shortTermSlice.reduce((sum, candle) => sum + candle.close, 0) / 9
      : undefined;
    const longTermSlice = candles.slice(Math.max(0, candles.length - 21));
    const longTermMA = longTermSlice.length === 21
      ? longTermSlice.reduce((sum, candle) => sum + candle.close, 0) / 21
      : undefined;

    const scoringInput: ScoringInput = {
      rsi: lastRsi,
      currentPrice,
      supportLevel,
      resistanceLevel,
      currentVolume,
      avgVolume,
      shortTermMA,
      longTermMA,
      lastRsi,
      prevRsi,
      macdNow,
      macdPrev,
      macdHistogram,
      prevMacdHistogram,
      sigNow,
      sigPrev,
      stTrend,
      latestStructureDirection: latestStructureBreak?.direction,
      htfBullish,
      htfBearish,
      latestClose: latestCandle.close,
      previousClose: previousCandle.close,
      divergencePoints: divergencePoints ?? [],
      currentTime,
      currentCandleIndex: candles.length - 1,
      structureBreaks,
      swingPoints,
      fvgs,
      orderBlocks,
      breakers,
      liquidityZones,
      volumeProfileData,
      autoFibResult,
    };

    const systemIds = Object.keys(TRADING_SYSTEMS) as TradingSystemId[];
    let longCount = 0;
    let shortCount = 0;
    let neutralCount = 0;
    let scoreSum = 0;
    const systemDetails: SystemDetail[] = [];

    for (const systemId of systemIds) {
      const evaluation = scoreSystem(systemId, scoringInput);
      const system = TRADING_SYSTEMS[systemId];

      let state: 'bullish' | 'bearish' | 'neutral';
      if (evaluation.score >= 20) {
        state = 'bullish';
        longCount += 1;
      } else if (evaluation.score <= -20) {
        state = 'bearish';
        shortCount += 1;
      } else {
        state = 'neutral';
        neutralCount += 1;
      }

      scoreSum += evaluation.score;

      systemDetails.push({
        systemId,
        systemName: system?.name ?? systemId,
        score: evaluation.score,
        state,
        signalLabel: evaluation.signalLabel,
        signalColor: evaluation.signalColor,
        conditions: evaluation.conditions,
      });
    }

    // Normalise the average -100..+100 score to the legacy -1..+1 range used by FloatingConfluenceMonitor
    // by dividing by 100 after averaging all system scores.
    const avgScore = systemIds.length > 0 ? scoreSum / systemIds.length : 0;
    const totalScore = avgScore / 100;

    const patterns = detectMarketPattern(avgScore, systemDetails, previousScoreRef.current);

    return {
      score: totalScore,
      longCount,
      shortCount,
      neutralCount,
      systemDetails,
      patterns,
    };
  }, [candles, oscillatorData, superTrendData.standard, structureBreaks, htfBiasEntries, divergencePoints, fvgs, orderBlocks, liquidityZones, volumeProfileData, weightsVersion, autoFibResult, swingPoints]);

  useEffect(() => {
    if (result !== null) {
      previousScoreRef.current = result.score * 100;
    }
  }, [result]);

  return result;
}

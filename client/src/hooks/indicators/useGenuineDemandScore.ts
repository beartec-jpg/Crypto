import { useMemo } from 'react';
import type { Candle, CVDDataItem } from '@/types/chart';
import {
  calculateGenuineDemandScore,
  type GDSExternalMetrics,
  type GenuineDemandScoreResult,
} from '@/lib/indicators/genuineDemandScore';

interface UseGenuineDemandScoreOptions {
  candles: Candle[];
  cvdData: CVDDataItem[];
  lookbackBars?: number;
  historyPoints?: number;
  externalMetrics?: GDSExternalMetrics;
}

export interface UseGenuineDemandScoreReturn {
  gds: GenuineDemandScoreResult;
  scoreHistory: number[];
  latestScore: number;
  dataCoverage: {
    activeWeight: number;
    totalWeight: number;
    componentCount: number;
    availableCount: number;
  };
}

const DEFAULT_LOOKBACK = 48;
const DEFAULT_HISTORY_POINTS = 36;

export function useGenuineDemandScore({
  candles,
  cvdData,
  lookbackBars = DEFAULT_LOOKBACK,
  historyPoints = DEFAULT_HISTORY_POINTS,
  externalMetrics,
}: UseGenuineDemandScoreOptions): UseGenuineDemandScoreReturn {
  return useMemo(() => {
    const scoreHistory: number[] = [];
    const startIndex = Math.max(2, candles.length - historyPoints);

    for (let end = startIndex; end <= candles.length; end += 1) {
      const partialCandles = candles.slice(0, end);
      const partialCvd = cvdData.slice(0, Math.min(cvdData.length, end));

      const result = calculateGenuineDemandScore({
        candles: partialCandles,
        cvdData: partialCvd,
        lookbackBars,
        externalMetrics,
      });

      scoreHistory.push(result.score);
    }

    const gds = calculateGenuineDemandScore({
      candles,
      cvdData,
      lookbackBars,
      externalMetrics,
    });

    return {
      gds,
      scoreHistory,
      latestScore: gds.score,
      dataCoverage: {
        activeWeight: gds.activeWeight,
        totalWeight: gds.totalWeight,
        componentCount: gds.components.length,
        availableCount: gds.components.filter((component) => component.isAvailable).length,
      },
    };
  }, [candles, cvdData, lookbackBars, historyPoints, externalMetrics]);
}

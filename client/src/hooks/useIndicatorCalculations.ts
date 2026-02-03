import { useMemo } from 'react';
import type { CandleData } from '@/types/chart.types';
import {
  calculateSessionVWAP,
  calculateParabolicSAR,
  type BandValue,
} from '@/lib/indicators';
import { calculateBollingerBands } from '@/lib/indicators/volatility';

interface IndicatorCalculations {
  sessionVWAP: any[];
  parabolicSAR: any[];
  bollingerBands: BandValue[];
}

interface UseIndicatorCalculationsProps {
  candles: CandleData[];
  bbPeriod: number;
  bbStdDev: number;
}

export function useIndicatorCalculations({
  candles,
  bbPeriod,
  bbStdDev,
}: UseIndicatorCalculationsProps): IndicatorCalculations {
  const sessionVWAP = useMemo(
    () => calculateSessionVWAP(candles),
    [candles]
  );

  const parabolicSAR = useMemo(
    () => calculateParabolicSAR(candles),
    [candles]
  );

  const bollingerBands = useMemo(() => {
    const result = calculateBollingerBands(candles, bbPeriod, bbStdDev);
    return result.upper.map((_, i) => ({
      time: result.upper[i].time,
      upper: result.upper[i].value,
      middle: result.middle[i].value,
      lower: result.lower[i].value,
    }));
  }, [candles, bbPeriod, bbStdDev]);

  return {
    sessionVWAP,
    parabolicSAR,
    bollingerBands,
  };
}

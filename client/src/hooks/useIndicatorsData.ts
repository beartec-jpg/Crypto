import { useMemo } from 'react';
import { useCandleData } from './useCandleData';
import { generateMockCVDData } from '@/utils/mockCVDData';
import type { CVDDataItem } from '@/types/chart';

interface UseIndicatorsDataOptions {
  symbol: string;
  timeframe: string;
}

interface UseIndicatorsDataReturn {
  candles: ReturnType<typeof useCandleData>['candles'];
  cvdData: CVDDataItem[];
  isLoading: boolean;
  error: Error | null;
}

export function useIndicatorsData({
  symbol,
  timeframe,
}: UseIndicatorsDataOptions): UseIndicatorsDataReturn {
  const { candles, isLoading, error } = useCandleData({
    symbol,
    timeframe,
    enabled: true,
    refreshInterval: 10000,
  });

  // Generate mock CVD data when candles update
  const cvdData = useMemo(() => {
    if (candles.length === 0) return [];
    return generateMockCVDData(candles);
  }, [candles]);

  return {
    candles,
    cvdData,
    isLoading,
    error,
  };
}

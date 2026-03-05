/**
 * @fileoverview useSMTDivergence Hook
 * Manages SMT divergence detection for multi-asset analysis
 * Works with existing chart data to find correlated asset information
 */

import { useEffect, useState } from 'react';
import type { CandleData } from '@/types/chart.types';
import {
  findPivotsZigZag,
  getRecentHighs,
  getRecentLows,
  type Pivot,
} from '@/lib/smc/pivots';
import {
  detectSMTDivergence,
  isSmtDivergenceInvalidated,
  scoreSmtDivergenceStrength,
  type SMTDivergenceResult,
} from '@/lib/smc/smtDivergence';
import {
  getCorrelatedSymbol,
  getSMTConfig,
  calculateCorrelation,
  type SMTConfig,
} from '@/lib/smc/smtConfig';

interface UseSMTDivergenceOptions {
  mainSymbol: string;
  mainData: CandleData[];
  correlatedData?: CandleData[]; // If not provided, SMT will be disabled
  enabled?: boolean;
  configOverrides?: Partial<SMTConfig>;
}

interface UseSMTDivergenceReturn {
  correlatedSymbol: string;
  smtResult: SMTDivergenceResult | null;
  mainPivots: Pivot[];
  correlatedPivots: Pivot[];
  isLoading: boolean;
  correlation?: number; // Pearson correlation of recent prices
  score: number; // -100 to +100 for integration into scoring system
}

/**
 * Hook for detecting SMT (Smart Money Technique) divergence
 * Compares swing pivots between a main asset and its correlated pair
 * 
 * @param options - Configuration options
 * @returns SMT analysis result with divergence detection
 */
export function useSMTDivergence(
  options: UseSMTDivergenceOptions,
): UseSMTDivergenceReturn {
  const {
    mainSymbol,
    mainData,
    correlatedData,
    enabled = true,
    configOverrides,
  } = options;

  const config = getSMTConfig(configOverrides);
  const correlatedSymbol = getCorrelatedSymbol(mainSymbol);

  // State
  const [smtResult, setSmtResult] = useState<SMTDivergenceResult | null>(null);
  const [mainPivots, setMainPivots] = useState<Pivot[]>([]);
  const [correlatedPivots, setCorrelatedPivots] = useState<Pivot[]>([]);
  const [correlation, setCorrelation] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  // Main calculation effect
  useEffect(() => {
    if (
      !enabled ||
      !config.enabled ||
      mainData.length < 2 ||
      !correlatedData ||
      correlatedData.length < 2
    ) {
      setSmtResult(null);
      setMainPivots([]);
      setCorrelatedPivots([]);
      setCorrelation(undefined);
      return;
    }

    setIsLoading(true);

    try {
      // Find pivots
      const mainPivs = findPivotsZigZag(
        mainData,
        config.leftBars,
        config.rightBars,
      );
      const corrPivs = findPivotsZigZag(
        correlatedData,
        config.leftBars,
        config.rightBars,
      );

      setMainPivots(mainPivs);
      setCorrelatedPivots(corrPivs);

      // Calculate correlation
      const mainPrices = mainData.slice(-50).map(d => d.close);
      const corrPrices = correlatedData.slice(-50).map(d => d.close);
      const corr = calculateCorrelation(mainPrices, corrPrices);
      setCorrelation(corr);

      // Check if correlation is sufficient
      if (Math.abs(corr) < config.correlationThreshold) {
        setSmtResult({
          type: null,
          score: 0,
          confidence: 0,
          details: `Correlation (${corr.toFixed(2)}) below threshold (${config.correlationThreshold})`,
          isValid: false,
          invalidationReason: 'Insufficient correlation between assets',
        });
        return;
      }

      // Detect divergence
      const divergence = detectSMTDivergence(
        mainPivs,
        corrPivs,
        config.maxTimeGap,
      );

      // Add correlated symbol to result
      divergence.correlatedSymbol = correlatedSymbol;

      // Check for invalidation
      const currentPrice = mainData[mainData.length - 1].close;
      const isInvalidated = isSmtDivergenceInvalidated(
        divergence,
        currentPrice,
        getRecentLows(mainPivs, 2),
        getRecentHighs(mainPivs, 2),
      );

      if (isInvalidated) {
        divergence.isValid = false;
        divergence.invalidationReason = 'Invalidated by price action';
      }

      setSmtResult(divergence);
    } catch (error) {
      console.error('[SMT] Divergence detection error:', error);
      setSmtResult({
        type: null,
        score: 0,
        confidence: 0,
        details: 'Error detecting SMT divergence',
        isValid: false,
      });
    } finally {
      setIsLoading(false);
    }
  }, [mainData, correlatedData, enabled, config, mainSymbol, correlatedSymbol]);

  // Calculate final score for integration
  const score = smtResult ? scoreSmtDivergenceStrength(smtResult) : 0;

  return {
    correlatedSymbol,
    smtResult,
    mainPivots,
    correlatedPivots,
    isLoading,
    correlation,
    score,
  };
}

/**
 * Helper hook to provide correlated data alongside main data
 * This would typically be implemented as a separate data fetching hook
 * that coordinates with your data provider (Binance, CoinGecko, etc.)
 * 
 * For now, returns undefined - implement based on your data infrastructure
 */
export function useFetchCorrelatedData(
  correlatedSymbol: string,
  timeframe: string,
  limit: number = 500,
): CandleData[] | undefined {
  const [data, setData] = useState<CandleData[] | undefined>();

  useEffect(() => {
    // TODO: Implement actual data fetching for correlated symbol
    // This would call your API/WebSocket to get OHLC data for correlatedSymbol
    // For now, we return undefined to gracefully disable SMT

    // Example implementation pattern:
    // const fetchData = async () => {
    //   try {
    //     const response = await fetch(
    //       `/api/crypto/ohlc?symbol=${correlatedSymbol}&timeframe=${timeframe}&limit=${limit}`
    //     );
    //     const result = await response.json();
    //     setData(result.data);
    //   } catch (error) {
    //     console.error('Error fetching correlated data:', error);
    //   }
    // };
    // fetchData();
  }, [correlatedSymbol, timeframe, limit]);

  return data;
}

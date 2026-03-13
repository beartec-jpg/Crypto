/**
 * Hook for calculating oscillator data
 * Extracted from ChartFullscreenPage.tsx for reusability
 */

import { useMemo } from 'react';
import {
  calculateRSI,
  calculateMACD,
  calculateTSI,
  calculateWaddahAttarExplosion,
} from '@/lib/indicators/momentum';
import {
  calculateOBV,
  calculateMFI,
  calculateCMF,
  calculateKlingerOscillator,
} from '@/lib/indicators/volume';
import {
  calculateStochasticRSI,
  calculateWilliamsR,
  calculateCCI,
  calculateADX,
} from '@/lib/indicators';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OscillatorData {
  rsi: Array<{ time: number; value: number }>;
  macd: {
    macd: Array<{ time: number; value: number }>;
    signal: Array<{ time: number; value: number }>;
    hist: Array<{ time: number; value: number; color: string }>;
  };
  volume: Array<{ time: number; value: number; color: string }>;
  avgVolume: number;
  stochRsi: Array<{ time: number; k: number; d: number }>;
  williamsR: Array<{ time: number; value: number }>;
  cci: Array<{ time: number; value: number }>;
  adx: Array<{ time: number; adx: number; plusDI: number; minusDI: number }>;
  obv: Array<{ time: number; value: number }>;
  mfi: Array<{ time: number; value: number }>;
  cmf: Array<{ time: number; value: number }>;
  tsi: {
    tsi: Array<{ time: number; value: number }>;
    signal: Array<{ time: number; value: number }>;
  };
  klinger: {
    klinger: Array<{ time: number; value: number }>;
    signal: Array<{ time: number; value: number }>;
  };
  waddah: {
    histogram: Array<{ time: number; value: number; color: string }>;
    explosion: Array<{ time: number; value: number }>;
  };
}

export interface OscillatorCalculationSettings {
  rsiPeriod?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  stochRsiPeriod?: number;
  mfiPeriod?: number;
  williamsRPeriod?: number;
  cciPeriod?: number;
  adxPeriod?: number;
}

const DEFAULT_SETTINGS: Required<OscillatorCalculationSettings> = {
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  stochRsiPeriod: 14,
  mfiPeriod: 14,
  williamsRPeriod: 14,
  cciPeriod: 20,
  adxPeriod: 14,
};

// Number of candles to use for volume average calculation
const VOLUME_AVERAGE_PERIOD = 20;

/**
 * Calculate oscillator data from candle data
 * @param candles - Array of candlestick data
 * @returns Calculated oscillator data (RSI, MACD, Volume, and more)
 */
export function useOscillatorData(
  candles: CandleData[],
  settings: OscillatorCalculationSettings = DEFAULT_SETTINGS,
): OscillatorData {
  return useMemo(() => {
    const resolved = { ...DEFAULT_SETTINGS, ...settings };

    if (candles.length === 0) {
      return {
        rsi: [],
        macd: { macd: [], signal: [], hist: [] },
        volume: [],
        avgVolume: 0,
        stochRsi: [],
        williamsR: [],
        cci: [],
        adx: [],
        obv: [],
        mfi: [],
        cmf: [],
        tsi: { tsi: [], signal: [] },
        klinger: { klinger: [], signal: [] },
        waddah: { histogram: [], explosion: [] },
      };
    }

    // Calculate RSI
    const rsiData = calculateRSI(candles, resolved.rsiPeriod);

    // Calculate MACD
    const macdData = calculateMACD(candles, resolved.macdFast, resolved.macdSlow, resolved.macdSignal);

    // Calculate average volume for percentage
    const avgVolume = candles.slice(-VOLUME_AVERAGE_PERIOD).reduce((sum, c) => sum + c.volume, 0) / VOLUME_AVERAGE_PERIOD;

    // Format volume data
    const volumeData = candles.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? '#26a69a' : '#ef5350',
    }));

    return {
      rsi: rsiData,
      macd: macdData,
      volume: volumeData,
      avgVolume,
      stochRsi: calculateStochasticRSI(candles, resolved.stochRsiPeriod, resolved.stochRsiPeriod, 3, 3),
      williamsR: calculateWilliamsR(candles, resolved.williamsRPeriod),
      cci: calculateCCI(candles, resolved.cciPeriod),
      adx: calculateADX(candles, resolved.adxPeriod),
      obv: calculateOBV(candles),
      mfi: calculateMFI(candles, resolved.mfiPeriod),
      cmf: calculateCMF(candles, 20),
      tsi: calculateTSI(candles, 25, 13, 7),
      klinger: calculateKlingerOscillator(candles, 34, 55, 13),
      waddah: calculateWaddahAttarExplosion(candles, 150, 20, 2),
    };
  }, [candles, settings]);
}

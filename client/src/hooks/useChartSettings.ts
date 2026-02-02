import { useState, useEffect } from 'react';

/**
 * Hook for managing chart display settings
 * Extracted from CryptoIndicators.tsx for Phase 2
 */

export interface ChartSettings {
  bos: {
    swingLength: number;
    setSwingLength: (val: number) => void;
    swingLengthInput: string;
    setSwingLengthInput: (val: string) => void;
  };
  
  choch: {
    swingLength: number;
    setSwingLength: (val: number) => void;
    swingLengthInput: string;
    setSwingLengthInput: (val: string) => void;
  };
  
  liquiditySweep: {
    swingLength: number;
    setSwingLength: (val: number) => void;
    swingLengthInput: string;
    setSwingLengthInput: (val: string) => void;
  };
  
  legacy: {
    swingLength: number;
    setSwingLength: (val: number) => void;
    swingLengthInput: string;
    setSwingLengthInput: (val: string) => void;
    liqGrabCandles: number;
    setLiqGrabCandles: (val: number) => void;
    liqGrabInput: string;
    setLiqGrabInput: (val: string) => void;
    wickToBodyRatio: number;
    setWickToBodyRatio: (val: number) => void;
    wickRatioInput: string;
    setWickRatioInput: (val: string) => void;
    fvgVolumeThreshold: number;
    setFvgVolumeThreshold: (val: number) => void;
  };
}

export function useChartSettings(): ChartSettings {
  // ========== CHART DISPLAY SETTINGS ==========
  const [chartBosSwingLength, setChartBosSwingLength] = useState(5);
  const [chartBosSwingLengthInput, setChartBosSwingLengthInput] = useState('5');
  const [chartChochSwingLength, setChartChochSwingLength] = useState(20);
  const [chartChochSwingLengthInput, setChartChochSwingLengthInput] = useState('20');
  const [chartLiquiditySweepSwingLength, setChartLiquiditySweepSwingLength] = useState(20);
  const [chartLiquiditySweepSwingLengthInput, setChartLiquiditySweepSwingLengthInput] = useState('20');

  // ========== LEGACY SETTINGS (deprecated but kept for compatibility) ==========
  const [swingLength, setSwingLength] = useState(15);
  const [liqGrabCandles, setLiqGrabCandles] = useState(2);
  const [wickToBodyRatio, setWickToBodyRatio] = useState(150); // Wick must be 150% of body (1.5x)
  const [swingLengthInput, setSwingLengthInput] = useState('15');
  const [liqGrabInput, setLiqGrabInput] = useState('2');
  const [wickRatioInput, setWickRatioInput] = useState('150');
  const [fvgVolumeThreshold, setFvgVolumeThreshold] = useState(1.5); // 1.5x average volume

  // Debounce effects for input-to-value conversions
  useEffect(() => {
    const value = parseFloat(chartBosSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setChartBosSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [chartBosSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(chartChochSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setChartChochSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [chartChochSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(chartLiquiditySweepSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setChartLiquiditySweepSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [chartLiquiditySweepSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(swingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [swingLengthInput]);

  useEffect(() => {
    const value = parseFloat(liqGrabInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setLiqGrabCandles(value), 300);
      return () => clearTimeout(timer);
    }
  }, [liqGrabInput]);

  useEffect(() => {
    const value = parseFloat(wickRatioInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setWickToBodyRatio(value), 300);
      return () => clearTimeout(timer);
    }
  }, [wickRatioInput]);

  return {
    bos: {
      swingLength: chartBosSwingLength,
      setSwingLength: setChartBosSwingLength,
      swingLengthInput: chartBosSwingLengthInput,
      setSwingLengthInput: setChartBosSwingLengthInput,
    },
    choch: {
      swingLength: chartChochSwingLength,
      setSwingLength: setChartChochSwingLength,
      swingLengthInput: chartChochSwingLengthInput,
      setSwingLengthInput: setChartChochSwingLengthInput,
    },
    liquiditySweep: {
      swingLength: chartLiquiditySweepSwingLength,
      setSwingLength: setChartLiquiditySweepSwingLength,
      swingLengthInput: chartLiquiditySweepSwingLengthInput,
      setSwingLengthInput: setChartLiquiditySweepSwingLengthInput,
    },
    legacy: {
      swingLength,
      setSwingLength,
      swingLengthInput,
      setSwingLengthInput,
      liqGrabCandles,
      setLiqGrabCandles,
      liqGrabInput,
      setLiqGrabInput,
      wickToBodyRatio,
      setWickToBodyRatio,
      wickRatioInput,
      setWickRatioInput,
      fvgVolumeThreshold,
      setFvgVolumeThreshold,
    },
  };
}

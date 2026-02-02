import { useState } from 'react';
import { AutoBacktestResult } from '@/types/trading.types';

/**
 * Hook for managing auto-backtest configuration settings
 * Extracted from CryptoIndicators.tsx for Phase 2
 */

export interface BacktestSettings {
  autoTest: {
    mode: boolean;
    setMode: (val: boolean) => void;
    running: boolean;
    setRunning: (val: boolean) => void;
    progress: number;
    setProgress: (val: number) => void;
    results: AutoBacktestResult[];
    setResults: (val: AutoBacktestResult[]) => void;
    durations: {duration: number; combos: number}[];
    setDurations: (val: {duration: number; combos: number}[]) => void;
    sortBy: 'profit' | 'winRate' | 'trades' | 'avgRR';
    setSortBy: (val: 'profit' | 'winRate' | 'trades' | 'avgRR') => void;
  };
  
  parameterTests: {
    tp1: {
      structure: boolean;
      setStructure: (val: boolean) => void;
      trailing: boolean;
      setTrailing: (val: boolean) => void;
      ema: boolean;
      setEma: (val: boolean) => void;
      fixedRR: boolean;
      setFixedRR: (val: boolean) => void;
    };
    tp2: {
      structure: boolean;
      setStructure: (val: boolean) => void;
      trailing: boolean;
      setTrailing: (val: boolean) => void;
      ema: boolean;
      setEma: (val: boolean) => void;
      fixedRR: boolean;
      setFixedRR: (val: boolean) => void;
    };
    tp3: {
      structure: boolean;
      setStructure: (val: boolean) => void;
      trailing: boolean;
      setTrailing: (val: boolean) => void;
      ema: boolean;
      setEma: (val: boolean) => void;
      fixedRR: boolean;
      setFixedRR: (val: boolean) => void;
    };
    sl: {
      atr: boolean;
      setAtr: (val: boolean) => void;
      structure: boolean;
      setStructure: (val: boolean) => void;
      fixedDistance: boolean;
      setFixedDistance: (val: boolean) => void;
    };
    strategy: {
      trendFilters: ('ema' | 'structure' | 'both' | 'none')[];
      setTrendFilters: (val: ('ema' | 'structure' | 'both' | 'none')[]) => void;
      directions: ('bull' | 'bear' | 'both')[];
      setDirections: (val: ('bull' | 'bear' | 'both')[]) => void;
      useWickFilter: boolean;
      setUseWickFilter: (val: boolean) => void;
      useConfirmCandles: boolean;
      setUseConfirmCandles: (val: boolean) => void;
    };
  };
  
  ranges: {
    swingLength: { min: number; max: number; step: number; };
    setSwingLength: (val: { min: number; max: number; step: number; }) => void;
    wickRatio: { min: number; max: number; step: number; };
    setWickRatio: (val: { min: number; max: number; step: number; }) => void;
    confirmCandles: { min: number; max: number; step: number; };
    setConfirmCandles: (val: { min: number; max: number; step: number; }) => void;
    tp1RR: { min: number; max: number; step: number; };
    setTp1RR: (val: { min: number; max: number; step: number; }) => void;
    tp1SwingLength: { min: number; max: number; step: number; };
    setTp1SwingLength: (val: { min: number; max: number; step: number; }) => void;
    tp1TrailingSwing: { min: number; max: number; step: number; };
    setTp1TrailingSwing: (val: { min: number; max: number; step: number; }) => void;
    tp1EMAFast: { min: number; max: number; step: number; };
    setTp1EMAFast: (val: { min: number; max: number; step: number; }) => void;
    tp1EMASlow: { min: number; max: number; step: number; };
    setTp1EMASlow: (val: { min: number; max: number; step: number; }) => void;
    tp2RR: { min: number; max: number; step: number; };
    setTp2RR: (val: { min: number; max: number; step: number; }) => void;
    tp2SwingLength: { min: number; max: number; step: number; };
    setTp2SwingLength: (val: { min: number; max: number; step: number; }) => void;
    tp2TrailingSwing: { min: number; max: number; step: number; };
    setTp2TrailingSwing: (val: { min: number; max: number; step: number; }) => void;
    tp2EMAFast: { min: number; max: number; step: number; };
    setTp2EMAFast: (val: { min: number; max: number; step: number; }) => void;
    tp2EMASlow: { min: number; max: number; step: number; };
    setTp2EMASlow: (val: { min: number; max: number; step: number; }) => void;
    tp3RR: { min: number; max: number; step: number; };
    setTp3RR: (val: { min: number; max: number; step: number; }) => void;
    tp3SwingLength: { min: number; max: number; step: number; };
    setTp3SwingLength: (val: { min: number; max: number; step: number; }) => void;
    tp3TrailingSwing: { min: number; max: number; step: number; };
    setTp3TrailingSwing: (val: { min: number; max: number; step: number; }) => void;
    tp3EMAFast: { min: number; max: number; step: number; };
    setTp3EMAFast: (val: { min: number; max: number; step: number; }) => void;
    tp3EMASlow: { min: number; max: number; step: number; };
    setTp3EMASlow: (val: { min: number; max: number; step: number; }) => void;
    slATR: { min: number; max: number; step: number; };
    setSlATR: (val: { min: number; max: number; step: number; }) => void;
    slSwingLength: { min: number; max: number; step: number; };
    setSlSwingLength: (val: { min: number; max: number; step: number; }) => void;
    slFixedDistance: { min: number; max: number; step: number; };
    setSlFixedDistance: (val: { min: number; max: number; step: number; }) => void;
  };
}

export function useBacktestSettings(): BacktestSettings {
  // ========== AUTO-BACKTEST CORE STATE ==========
  const [liqGrabAutoTestMode, setLiqGrabAutoTestMode] = useState(false);
  const [liqGrabAutoTestRunning, setLiqGrabAutoTestRunning] = useState(false);
  const [liqGrabAutoTestProgress, setLiqGrabAutoTestProgress] = useState(0);
  const [liqGrabAutoTestResults, setLiqGrabAutoTestResults] = useState<AutoBacktestResult[]>([]);
  const [liqGrabAutoTestDurations, setLiqGrabAutoTestDurations] = useState<{duration: number, combos: number}[]>([]);
  const [liqGrabAutoTestSortBy, setLiqGrabAutoTestSortBy] = useState<'profit' | 'winRate' | 'trades' | 'avgRR'>('profit');

  // ========== TP/SL PARAMETER TEST OPTIONS ==========
  const [testTP1Structure, setTestTP1Structure] = useState(true);
  const [testTP1Trailing, setTestTP1Trailing] = useState(false);
  const [testTP1EMA, setTestTP1EMA] = useState(false);
  const [testTP1FixedRR, setTestTP1FixedRR] = useState(true);
  
  const [testTP2Structure, setTestTP2Structure] = useState(true);
  const [testTP2Trailing, setTestTP2Trailing] = useState(false);
  const [testTP2EMA, setTestTP2EMA] = useState(false);
  const [testTP2FixedRR, setTestTP2FixedRR] = useState(false);
  
  const [testTP3Structure, setTestTP3Structure] = useState(true);
  const [testTP3Trailing, setTestTP3Trailing] = useState(false);
  const [testTP3EMA, setTestTP3EMA] = useState(false);
  const [testTP3FixedRR, setTestTP3FixedRR] = useState(false);
  
  const [testSLATR, setTestSLATR] = useState(true);
  const [testSLStructure, setTestSLStructure] = useState(true);
  const [testSLFixedDistance, setTestSLFixedDistance] = useState(false);
  
  // ========== STRATEGY PARAMETER TEST OPTIONS ==========
  const [testTrendFilters, setTestTrendFilters] = useState<('ema' | 'structure' | 'both' | 'none')[]>(['structure', 'both']);
  const [testDirections, setTestDirections] = useState<('bull' | 'bear' | 'both')[]>(['both']);
  const [testUseWickFilter, setTestUseWickFilter] = useState<boolean>(true);
  const [testUseConfirmCandles, setTestUseConfirmCandles] = useState<boolean>(true);
  
  // ========== PARAMETER RANGES ==========
  const [swingLengthRange, setSwingLengthRange] = useState({ min: 10, max: 20, step: 5 });
  const [wickRatioRange, setWickRatioRange] = useState({ min: 100, max: 200, step: 50 });
  const [confirmCandlesRange, setConfirmCandlesRange] = useState({ min: 1, max: 3, step: 1 });
  
  // TP1 Ranges
  const [tp1RRRange, setTp1RRRange] = useState({ min: 1.5, max: 3.0, step: 0.5 });
  const [tp1SwingLengthRange, setTp1SwingLengthRange] = useState({ min: 10, max: 20, step: 5 });
  const [tp1TrailingSwingRange, setTp1TrailingSwingRange] = useState({ min: 3, max: 10, step: 2 });
  const [tp1EMAFastRange, setTp1EMAFastRange] = useState({ min: 10, max: 30, step: 10 });
  const [tp1EMASlowRange, setTp1EMASlowRange] = useState({ min: 50, max: 200, step: 50 });
  
  // TP2 Ranges
  const [tp2RRRange, setTp2RRRange] = useState({ min: 2.0, max: 4.0, step: 0.5 });
  const [tp2SwingLengthRange, setTp2SwingLengthRange] = useState({ min: 15, max: 25, step: 5 });
  const [tp2TrailingSwingRange, setTp2TrailingSwingRange] = useState({ min: 5, max: 15, step: 5 });
  const [tp2EMAFastRange, setTp2EMAFastRange] = useState({ min: 10, max: 30, step: 10 });
  const [tp2EMASlowRange, setTp2EMASlowRange] = useState({ min: 50, max: 200, step: 50 });
  
  // TP3 Ranges
  const [tp3RRRange, setTp3RRRange] = useState({ min: 3.0, max: 5.0, step: 1.0 });
  const [tp3SwingLengthRange, setTp3SwingLengthRange] = useState({ min: 20, max: 30, step: 5 });
  const [tp3TrailingSwingRange, setTp3TrailingSwingRange] = useState({ min: 10, max: 20, step: 5 });
  const [tp3EMAFastRange, setTp3EMAFastRange] = useState({ min: 10, max: 30, step: 10 });
  const [tp3EMASlowRange, setTp3EMASlowRange] = useState({ min: 50, max: 200, step: 50 });
  
  // SL Ranges
  const [slATRRange, setSlATRRange] = useState({ min: 1.0, max: 2.0, step: 0.5 });
  const [slSwingLengthRange, setSlSwingLengthRange] = useState({ min: 3, max: 10, step: 2 });
  const [slFixedDistanceRange, setSlFixedDistanceRange] = useState({ min: 1.0, max: 3.0, step: 0.5 });

  return {
    autoTest: {
      mode: liqGrabAutoTestMode,
      setMode: setLiqGrabAutoTestMode,
      running: liqGrabAutoTestRunning,
      setRunning: setLiqGrabAutoTestRunning,
      progress: liqGrabAutoTestProgress,
      setProgress: setLiqGrabAutoTestProgress,
      results: liqGrabAutoTestResults,
      setResults: setLiqGrabAutoTestResults,
      durations: liqGrabAutoTestDurations,
      setDurations: setLiqGrabAutoTestDurations,
      sortBy: liqGrabAutoTestSortBy,
      setSortBy: setLiqGrabAutoTestSortBy,
    },
    parameterTests: {
      tp1: {
        structure: testTP1Structure,
        setStructure: setTestTP1Structure,
        trailing: testTP1Trailing,
        setTrailing: setTestTP1Trailing,
        ema: testTP1EMA,
        setEma: setTestTP1EMA,
        fixedRR: testTP1FixedRR,
        setFixedRR: setTestTP1FixedRR,
      },
      tp2: {
        structure: testTP2Structure,
        setStructure: setTestTP2Structure,
        trailing: testTP2Trailing,
        setTrailing: setTestTP2Trailing,
        ema: testTP2EMA,
        setEma: setTestTP2EMA,
        fixedRR: testTP2FixedRR,
        setFixedRR: setTestTP2FixedRR,
      },
      tp3: {
        structure: testTP3Structure,
        setStructure: setTestTP3Structure,
        trailing: testTP3Trailing,
        setTrailing: setTestTP3Trailing,
        ema: testTP3EMA,
        setEma: setTestTP3EMA,
        fixedRR: testTP3FixedRR,
        setFixedRR: setTestTP3FixedRR,
      },
      sl: {
        atr: testSLATR,
        setAtr: setTestSLATR,
        structure: testSLStructure,
        setStructure: setTestSLStructure,
        fixedDistance: testSLFixedDistance,
        setFixedDistance: setTestSLFixedDistance,
      },
      strategy: {
        trendFilters: testTrendFilters,
        setTrendFilters: setTestTrendFilters,
        directions: testDirections,
        setDirections: setTestDirections,
        useWickFilter: testUseWickFilter,
        setUseWickFilter: setTestUseWickFilter,
        useConfirmCandles: testUseConfirmCandles,
        setUseConfirmCandles: setTestUseConfirmCandles,
      },
    },
    ranges: {
      swingLength: swingLengthRange,
      setSwingLength: setSwingLengthRange,
      wickRatio: wickRatioRange,
      setWickRatio: setWickRatioRange,
      confirmCandles: confirmCandlesRange,
      setConfirmCandles: setConfirmCandlesRange,
      tp1RR: tp1RRRange,
      setTp1RR: setTp1RRRange,
      tp1SwingLength: tp1SwingLengthRange,
      setTp1SwingLength: setTp1SwingLengthRange,
      tp1TrailingSwing: tp1TrailingSwingRange,
      setTp1TrailingSwing: setTp1TrailingSwingRange,
      tp1EMAFast: tp1EMAFastRange,
      setTp1EMAFast: setTp1EMAFastRange,
      tp1EMASlow: tp1EMASlowRange,
      setTp1EMASlow: setTp1EMASlowRange,
      tp2RR: tp2RRRange,
      setTp2RR: setTp2RRRange,
      tp2SwingLength: tp2SwingLengthRange,
      setTp2SwingLength: setTp2SwingLengthRange,
      tp2TrailingSwing: tp2TrailingSwingRange,
      setTp2TrailingSwing: setTp2TrailingSwingRange,
      tp2EMAFast: tp2EMAFastRange,
      setTp2EMAFast: setTp2EMAFastRange,
      tp2EMASlow: tp2EMASlowRange,
      setTp2EMASlow: setTp2EMASlowRange,
      tp3RR: tp3RRRange,
      setTp3RR: setTp3RRRange,
      tp3SwingLength: tp3SwingLengthRange,
      setTp3SwingLength: setTp3SwingLengthRange,
      tp3TrailingSwing: tp3TrailingSwingRange,
      setTp3TrailingSwing: setTp3TrailingSwingRange,
      tp3EMAFast: tp3EMAFastRange,
      setTp3EMAFast: setTp3EMAFastRange,
      tp3EMASlow: tp3EMASlowRange,
      setTp3EMASlow: setTp3EMASlowRange,
      slATR: slATRRange,
      setSlATR: setSlATRRange,
      slSwingLength: slSwingLengthRange,
      setSlSwingLength: setSlSwingLengthRange,
      slFixedDistance: slFixedDistanceRange,
      setSlFixedDistance: setSlFixedDistanceRange,
    },
  };
}

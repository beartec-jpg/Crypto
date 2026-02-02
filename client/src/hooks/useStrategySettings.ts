import { useState, useEffect } from 'react';
import { BotTPSLConfig } from '@/types/trading.types';

/**
 * Hook for managing all trading strategy settings
 * Extracted from CryptoIndicators.tsx for Phase 2
 */

export interface StrategySettings {
  // Liquidity Grab Strategy
  liquidityGrab: {
    enabled: boolean;
    setEnabled: (val: boolean) => void;
    trendFilter: 'ema' | 'structure' | 'both' | 'none';
    setTrendFilter: (val: 'ema' | 'structure' | 'both' | 'none') => void;
    directionFilter: 'bull' | 'bear' | 'both';
    setDirectionFilter: (val: 'bull' | 'bear' | 'both') => void;
    swingLength: number;
    setSwingLength: (val: number) => void;
    swingLengthInput: string;
    setSwingLengthInput: (val: string) => void;
    tpSwingLength: number;
    setTpSwingLength: (val: number) => void;
    tpSwingLengthInput: string;
    setTpSwingLengthInput: (val: string) => void;
    slSwingLength: number;
    setSlSwingLength: (val: number) => void;
    slSwingLengthInput: string;
    setSlSwingLengthInput: (val: string) => void;
    tpsl: BotTPSLConfig;
    setTpsl: (val: BotTPSLConfig) => void;
  };

  // BOS Structure Strategy
  bosStructure: {
    enabled: boolean;
    setEnabled: (val: boolean) => void;
    trendFilter: 'ema' | 'structure' | 'both' | 'none';
    setTrendFilter: (val: 'ema' | 'structure' | 'both' | 'none') => void;
    directionFilter: 'bull' | 'bear' | 'both';
    setDirectionFilter: (val: 'bull' | 'bear' | 'both') => void;
    swingLength: number;
    setSwingLength: (val: number) => void;
    swingLengthInput: string;
    setSwingLengthInput: (val: string) => void;
    tpSwingLength: number;
    setTpSwingLength: (val: number) => void;
    tpSwingLengthInput: string;
    setTpSwingLengthInput: (val: string) => void;
    slSwingLength: number;
    setSlSwingLength: (val: number) => void;
    slSwingLengthInput: string;
    setSlSwingLengthInput: (val: string) => void;
    tpsl: BotTPSLConfig;
    setTpsl: (val: BotTPSLConfig) => void;
  };

  // CHoCH + FVG Strategy
  chochFvg: {
    enabled: boolean;
    setEnabled: (val: boolean) => void;
    structureType: 'bos' | 'choch' | 'both';
    setStructureType: (val: 'bos' | 'choch' | 'both') => void;
    trendFilter: 'ema' | 'structure' | 'both' | 'none';
    setTrendFilter: (val: 'ema' | 'structure' | 'both' | 'none') => void;
    directionFilter: 'bull' | 'bear' | 'both';
    setDirectionFilter: (val: 'bull' | 'bear' | 'both') => void;
    swingLength: number;
    setSwingLength: (val: number) => void;
    swingLengthInput: string;
    setSwingLengthInput: (val: string) => void;
    fvgVolumeThreshold: number;
    setFvgVolumeThreshold: (val: number) => void;
    tpSwingLength: number;
    setTpSwingLength: (val: number) => void;
    tpSwingLengthInput: string;
    setTpSwingLengthInput: (val: string) => void;
    slSwingLength: number;
    setSlSwingLength: (val: number) => void;
    slSwingLengthInput: string;
    setSlSwingLengthInput: (val: string) => void;
    useFVGSizeFilter: boolean;
    setUseFVGSizeFilter: (val: boolean) => void;
    fvgMinSizeATR: number;
    setFvgMinSizeATR: (val: number) => void;
    tpsl: BotTPSLConfig;
    setTpsl: (val: BotTPSLConfig) => void;
  };

  // VWAP Trading Strategy
  vwapTrading: {
    enabled: boolean;
    setEnabled: (val: boolean) => void;
    trendFilter: 'ema' | 'structure' | 'both' | 'none';
    setTrendFilter: (val: 'ema' | 'structure' | 'both' | 'none') => void;
    directionFilter: 'bull' | 'bear' | 'both';
    setDirectionFilter: (val: 'bull' | 'bear' | 'both') => void;
    type: 'session' | 'daily' | 'weekly' | 'monthly' | 'rolling10' | 'rolling20' | 'rolling50';
    setType: (val: 'session' | 'daily' | 'weekly' | 'monthly' | 'rolling10' | 'rolling20' | 'rolling50') => void;
    threshold: number;
    setThreshold: (val: number) => void;
    thresholdInput: string;
    setThresholdInput: (val: string) => void;
    entryCandles: 'single' | 'double';
    setEntryCandles: (val: 'single' | 'double') => void;
    tpSwingLength: number;
    setTpSwingLength: (val: number) => void;
    tpSwingLengthInput: string;
    setTpSwingLengthInput: (val: string) => void;
    slSwingLength: number;
    setSlSwingLength: (val: number) => void;
    slSwingLengthInput: string;
    setSlSwingLengthInput: (val: string) => void;
    tpsl: BotTPSLConfig;
    setTpsl: (val: BotTPSLConfig) => void;
  };

  // Structure Break Strategy
  structureBreak: {
    enabled: boolean;
    setEnabled: (val: boolean) => void;
    trendFilter: 'ema' | 'structure' | 'both' | 'none';
    setTrendFilter: (val: 'ema' | 'structure' | 'both' | 'none') => void;
    directionFilter: 'bull' | 'bear' | 'both';
    setDirectionFilter: (val: 'bull' | 'bear' | 'both') => void;
  };

  // R/S Flip Strategy
  rsFlip: {
    enabled: boolean;
    setEnabled: (val: boolean) => void;
    trendFilter: 'ema' | 'structure' | 'both' | 'none';
    setTrendFilter: (val: 'ema' | 'structure' | 'both' | 'none') => void;
    directionFilter: 'bull' | 'bear' | 'both';
    setDirectionFilter: (val: 'bull' | 'bear' | 'both') => void;
    retestCandles: number;
    setRetestCandles: (val: number) => void;
    retestCandlesInput: string;
    setRetestCandlesInput: (val: string) => void;
    tpSwingLength: number;
    setTpSwingLength: (val: number) => void;
    tpSwingLengthInput: string;
    setTpSwingLengthInput: (val: string) => void;
    slSwingLength: number;
    setSlSwingLength: (val: number) => void;
    slSwingLengthInput: string;
    setSlSwingLengthInput: (val: string) => void;
    tpsl: BotTPSLConfig;
    setTpsl: (val: BotTPSLConfig) => void;
  };

  // EMA Trading Strategy
  emaTrading: {
    enabled: boolean;
    setEnabled: (val: boolean) => void;
    entryMode: 'bounce' | 'cross' | 'trend_trade';
    setEntryMode: (val: 'bounce' | 'cross' | 'trend_trade') => void;
    singlePeriod: number;
    setSinglePeriod: (val: number) => void;
    singlePeriodInput: string;
    setSinglePeriodInput: (val: string) => void;
    threshold: number;
    setThreshold: (val: number) => void;
    tpSwingLength: number;
    setTpSwingLength: (val: number) => void;
    tpSwingLengthInput: string;
    setTpSwingLengthInput: (val: string) => void;
    slSwingLength: number;
    setSlSwingLength: (val: number) => void;
    slSwingLengthInput: string;
    setSlSwingLengthInput: (val: string) => void;
    trendFilter: 'ema' | 'structure' | 'both' | 'none';
    setTrendFilter: (val: 'ema' | 'structure' | 'both' | 'none') => void;
    directionFilter: 'bull' | 'bear' | 'both';
    setDirectionFilter: (val: 'bull' | 'bear' | 'both') => void;
    tpsl: BotTPSLConfig;
    setTpsl: (val: BotTPSLConfig) => void;
  };

  // Legacy Global Settings
  legacy: {
    trendFilter: 'ema' | 'structure' | 'both';
    setTrendFilter: (val: 'ema' | 'structure' | 'both') => void;
    trendFilterType: 'ema' | 'structure' | 'both' | 'none';
    setTrendFilterType: (val: 'ema' | 'structure' | 'both' | 'none') => void;
    directionFilter: 'bull' | 'bear' | 'both';
    setDirectionFilter: (val: 'bull' | 'bear' | 'both') => void;
  };

  // Risk Management
  risk: {
    accountSize: number;
    setAccountSize: (val: number) => void;
    riskPercent: number;
    setRiskPercent: (val: number) => void;
  };
}

export function useStrategySettings(): StrategySettings {
  // ========== LIQUIDITY GRAB STRATEGY ==========
  const [stratLiquidityGrab, setStratLiquidityGrab] = useState(false);
  const [liqGrabTrendFilter, setLiqGrabTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('structure');
  const [liqGrabDirectionFilter, setLiqGrabDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [liqGrabSwingLength, setLiqGrabSwingLength] = useState(15);
  const [liqGrabSwingLengthInput, setLiqGrabSwingLengthInput] = useState('15');
  const [liqGrabTPSwingLength, setLiqGrabTPSwingLength] = useState(15);
  const [liqGrabTPSwingLengthInput, setLiqGrabTPSwingLengthInput] = useState('15');
  const [liqGrabSLSwingLength, setLiqGrabSLSwingLength] = useState(5);
  const [liqGrabSLSwingLengthInput, setLiqGrabSLSwingLengthInput] = useState('5');
  const [liqGrabTPSL, setLiqGrabTPSL] = useState<BotTPSLConfig>({
    numTPs: 3,
    tp1: { type: 'fixed_rr', fixedRR: 1.5, positionPercent: 50 },
    tp2: { type: 'structure', swingLength: 15, positionPercent: 30 },
    tp3: { type: 'structure', swingLength: 20, positionPercent: 20 },
    sl: { type: 'structure', swingLength: 5 }
  });

  // ========== BOS STRUCTURE STRATEGY ==========
  const [stratBOSTrend, setStratBOSTrend] = useState(false);
  const [bosTrendFilter, setBosTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('none');
  const [bosDirectionFilter, setBosDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [bosSwingLength, setBosSwingLength] = useState(5);
  const [bosSwingLengthInput, setBosSwingLengthInput] = useState('5');
  const [bosTPSwingLength, setBosTPSwingLength] = useState(15);
  const [bosTPSwingLengthInput, setBosTPSwingLengthInput] = useState('15');
  const [bosSLSwingLength, setBosSLSwingLength] = useState(5);
  const [bosSLSwingLengthInput, setBosSLSwingLengthInput] = useState('5');
  const [bosTPSL, setBosTPSL] = useState<BotTPSLConfig>({
    numTPs: 2,
    tp1: { type: 'structure', swingLength: 15, positionPercent: 50 },
    tp2: { type: 'structure', swingLength: 20, positionPercent: 50 },
    sl: { type: 'structure', swingLength: 5 }
  });

  // ========== CHOCH + FVG STRATEGY ==========
  const [stratChochFVG, setStratChochFVG] = useState(false);
  const [chochStructureType, setChochStructureType] = useState<'bos' | 'choch' | 'both'>('bos');
  const [chochTrendFilter, setChochTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('none');
  const [chochDirectionFilter, setChochDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [chochSwingLength, setChochSwingLength] = useState(10);
  const [chochSwingLengthInput, setChochSwingLengthInput] = useState('10');
  const [chochFVGVolumeThreshold, setChochFVGVolumeThreshold] = useState(1.0);
  const [chochTPSwingLength, setChochTPSwingLength] = useState(10);
  const [chochTPSwingLengthInput, setChochTPSwingLengthInput] = useState('10');
  const [chochSLSwingLength, setChochSLSwingLength] = useState(5);
  const [chochSLSwingLengthInput, setChochSLSwingLengthInput] = useState('5');
  const [chochUseFVGSizeFilter, setChochUseFVGSizeFilter] = useState(false);
  const [chochFVGMinSizeATR, setChochFVGMinSizeATR] = useState(10);
  const [chochTPSL, setChochTPSL] = useState<BotTPSLConfig>({
    numTPs: 2,
    tp1: { type: 'structure', swingLength: 10, positionPercent: 50 },
    tp2: { type: 'structure', swingLength: 15, positionPercent: 50 },
    sl: { type: 'structure', swingLength: 5 }
  });

  // ========== VWAP TRADING STRATEGY ==========
  const [stratVWAPRejection, setStratVWAPRejection] = useState(false);
  const [vwapTrendFilter, setVwapTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('structure');
  const [vwapDirectionFilter, setVwapDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [vwapType, setVwapType] = useState<'session' | 'daily' | 'weekly' | 'monthly' | 'rolling10' | 'rolling20' | 'rolling50'>('weekly');
  const [vwapThreshold, setVwapThreshold] = useState(0.3);
  const [vwapThresholdInput, setVwapThresholdInput] = useState('0.3');
  const [vwapEntryCandles, setVwapEntryCandles] = useState<'single' | 'double'>('single');
  const [vwapTPSwingLength, setVwapTPSwingLength] = useState(15);
  const [vwapTPSwingLengthInput, setVwapTPSwingLengthInput] = useState('15');
  const [vwapSLSwingLength, setVwapSLSwingLength] = useState(5);
  const [vwapSLSwingLengthInput, setVwapSLSwingLengthInput] = useState('5');
  const [vwapTPSL, setVwapTPSL] = useState<BotTPSLConfig>({
    numTPs: 2,
    tp1: { type: 'vwap', vwapPeriod: 'weekly', vwapOffset: 0, vwapExitMode: 'touch', positionPercent: 50 },
    tp2: { type: 'structure', swingLength: 15, positionPercent: 50 },
    sl: { type: 'structure', swingLength: 5 }
  });

  // ========== STRUCTURE BREAK STRATEGY ==========
  const [stratStructureBreak, setStratStructureBreak] = useState(false);
  const [structureTrendFilter, setStructureTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('structure');
  const [structureDirectionFilter, setStructureDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');

  // ========== R/S FLIP STRATEGY ==========
  const [stratRSFlip, setStratRSFlip] = useState(false);
  const [rsFlipTrendFilter, setRsFlipTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('none');
  const [rsFlipDirectionFilter, setRsFlipDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [rsFlipRetestCandles, setRsFlipRetestCandles] = useState(20);
  const [rsFlipRetestCandlesInput, setRsFlipRetestCandlesInput] = useState('20');
  const [rsFlipTPSwingLength, setRsFlipTPSwingLength] = useState(15);
  const [rsFlipTPSwingLengthInput, setRsFlipTPSwingLengthInput] = useState('15');
  const [rsFlipSLSwingLength, setRsFlipSLSwingLength] = useState(5);
  const [rsFlipSLSwingLengthInput, setRsFlipSLSwingLengthInput] = useState('5');
  const [rsFlipTPSL, setRsFlipTPSL] = useState<BotTPSLConfig>({
    numTPs: 2,
    tp1: { type: 'structure', swingLength: 15, positionPercent: 50 },
    tp2: { type: 'structure', swingLength: 20, positionPercent: 50 },
    sl: { type: 'structure', swingLength: 5 }
  });

  // ========== EMA TRADING STRATEGY ==========
  const [stratEMATrading, setStratEMATrading] = useState(false);
  const [emaEntryMode, setEmaEntryMode] = useState<'bounce' | 'cross' | 'trend_trade'>('trend_trade');
  const [emaSinglePeriod, setEmaSinglePeriod] = useState(50);
  const [emaSinglePeriodInput, setEmaSinglePeriodInput] = useState('50');
  const [emaThreshold, setEmaThreshold] = useState(0.3);
  const [emaTradingTPSwingLength, setEmaTradingTPSwingLength] = useState(15);
  const [emaTradingTPSwingLengthInput, setEmaTradingTPSwingLengthInput] = useState('15');
  const [emaTradingSLSwingLength, setEmaTradingSLSwingLength] = useState(5);
  const [emaTradingSLSwingLengthInput, setEmaTradingSLSwingLengthInput] = useState('5');
  const [emaTradingTrendFilter, setEmaTradingTrendFilter] = useState<'ema' | 'structure' | 'both' | 'none'>('none');
  const [emaTradingDirectionFilter, setEmaTradingDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');
  const [emaTradingTPSL, setEmaTradingTPSL] = useState<BotTPSLConfig>({
    numTPs: 2,
    tp1: { type: 'ema', emaFast: 20, emaSlow: 50, emaExitMode: 'crossover', positionPercent: 50 },
    tp2: { type: 'structure', swingLength: 15, positionPercent: 50 },
    sl: { type: 'structure', swingLength: 5 }
  });

  // ========== LEGACY GLOBAL SETTINGS ==========
  const [trendFilter, setTrendFilter] = useState<'ema' | 'structure' | 'both'>('structure');
  const [trendFilterType, setTrendFilterType] = useState<'ema' | 'structure' | 'both' | 'none'>('structure');
  const [directionFilter, setDirectionFilter] = useState<'bull' | 'bear' | 'both'>('both');

  // ========== RISK MANAGEMENT ==========
  const [accountSize, setAccountSize] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);

  // Debounce effects for numeric inputs
  useEffect(() => {
    const value = parseFloat(liqGrabSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setLiqGrabSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [liqGrabSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(liqGrabTPSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setLiqGrabTPSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [liqGrabTPSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(liqGrabSLSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setLiqGrabSLSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [liqGrabSLSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(bosSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setBosSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [bosSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(bosTPSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setBosTPSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [bosTPSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(bosSLSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setBosSLSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [bosSLSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(chochSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setChochSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [chochSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(chochTPSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setChochTPSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [chochTPSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(chochSLSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setChochSLSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [chochSLSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(vwapThresholdInput);
    if (!isNaN(value) && value >= 0) {
      const timer = setTimeout(() => setVwapThreshold(value), 300);
      return () => clearTimeout(timer);
    }
  }, [vwapThresholdInput]);

  useEffect(() => {
    const value = parseFloat(vwapTPSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setVwapTPSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [vwapTPSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(vwapSLSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setVwapSLSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [vwapSLSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(rsFlipRetestCandlesInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setRsFlipRetestCandles(value), 300);
      return () => clearTimeout(timer);
    }
  }, [rsFlipRetestCandlesInput]);

  useEffect(() => {
    const value = parseFloat(rsFlipTPSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setRsFlipTPSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [rsFlipTPSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(rsFlipSLSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setRsFlipSLSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [rsFlipSLSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(emaSinglePeriodInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setEmaSinglePeriod(value), 300);
      return () => clearTimeout(timer);
    }
  }, [emaSinglePeriodInput]);

  useEffect(() => {
    const value = parseFloat(emaTradingTPSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setEmaTradingTPSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [emaTradingTPSwingLengthInput]);

  useEffect(() => {
    const value = parseFloat(emaTradingSLSwingLengthInput);
    if (!isNaN(value) && value > 0) {
      const timer = setTimeout(() => setEmaTradingSLSwingLength(value), 300);
      return () => clearTimeout(timer);
    }
  }, [emaTradingSLSwingLengthInput]);

  return {
    liquidityGrab: {
      enabled: stratLiquidityGrab,
      setEnabled: setStratLiquidityGrab,
      trendFilter: liqGrabTrendFilter,
      setTrendFilter: setLiqGrabTrendFilter,
      directionFilter: liqGrabDirectionFilter,
      setDirectionFilter: setLiqGrabDirectionFilter,
      swingLength: liqGrabSwingLength,
      setSwingLength: setLiqGrabSwingLength,
      swingLengthInput: liqGrabSwingLengthInput,
      setSwingLengthInput: setLiqGrabSwingLengthInput,
      tpSwingLength: liqGrabTPSwingLength,
      setTpSwingLength: setLiqGrabTPSwingLength,
      tpSwingLengthInput: liqGrabTPSwingLengthInput,
      setTpSwingLengthInput: setLiqGrabTPSwingLengthInput,
      slSwingLength: liqGrabSLSwingLength,
      setSlSwingLength: setLiqGrabSLSwingLength,
      slSwingLengthInput: liqGrabSLSwingLengthInput,
      setSlSwingLengthInput: setLiqGrabSLSwingLengthInput,
      tpsl: liqGrabTPSL,
      setTpsl: setLiqGrabTPSL,
    },
    bosStructure: {
      enabled: stratBOSTrend,
      setEnabled: setStratBOSTrend,
      trendFilter: bosTrendFilter,
      setTrendFilter: setBosTrendFilter,
      directionFilter: bosDirectionFilter,
      setDirectionFilter: setBosDirectionFilter,
      swingLength: bosSwingLength,
      setSwingLength: setBosSwingLength,
      swingLengthInput: bosSwingLengthInput,
      setSwingLengthInput: setBosSwingLengthInput,
      tpSwingLength: bosTPSwingLength,
      setTpSwingLength: setBosTPSwingLength,
      tpSwingLengthInput: bosTPSwingLengthInput,
      setTpSwingLengthInput: setBosTPSwingLengthInput,
      slSwingLength: bosSLSwingLength,
      setSlSwingLength: setBosSLSwingLength,
      slSwingLengthInput: bosSLSwingLengthInput,
      setSlSwingLengthInput: setBosSLSwingLengthInput,
      tpsl: bosTPSL,
      setTpsl: setBosTPSL,
    },
    chochFvg: {
      enabled: stratChochFVG,
      setEnabled: setStratChochFVG,
      structureType: chochStructureType,
      setStructureType: setChochStructureType,
      trendFilter: chochTrendFilter,
      setTrendFilter: setChochTrendFilter,
      directionFilter: chochDirectionFilter,
      setDirectionFilter: setChochDirectionFilter,
      swingLength: chochSwingLength,
      setSwingLength: setChochSwingLength,
      swingLengthInput: chochSwingLengthInput,
      setSwingLengthInput: setChochSwingLengthInput,
      fvgVolumeThreshold: chochFVGVolumeThreshold,
      setFvgVolumeThreshold: setChochFVGVolumeThreshold,
      tpSwingLength: chochTPSwingLength,
      setTpSwingLength: setChochTPSwingLength,
      tpSwingLengthInput: chochTPSwingLengthInput,
      setTpSwingLengthInput: setChochTPSwingLengthInput,
      slSwingLength: chochSLSwingLength,
      setSlSwingLength: setChochSLSwingLength,
      slSwingLengthInput: chochSLSwingLengthInput,
      setSlSwingLengthInput: setChochSLSwingLengthInput,
      useFVGSizeFilter: chochUseFVGSizeFilter,
      setUseFVGSizeFilter: setChochUseFVGSizeFilter,
      fvgMinSizeATR: chochFVGMinSizeATR,
      setFvgMinSizeATR: setChochFVGMinSizeATR,
      tpsl: chochTPSL,
      setTpsl: setChochTPSL,
    },
    vwapTrading: {
      enabled: stratVWAPRejection,
      setEnabled: setStratVWAPRejection,
      trendFilter: vwapTrendFilter,
      setTrendFilter: setVwapTrendFilter,
      directionFilter: vwapDirectionFilter,
      setDirectionFilter: setVwapDirectionFilter,
      type: vwapType,
      setType: setVwapType,
      threshold: vwapThreshold,
      setThreshold: setVwapThreshold,
      thresholdInput: vwapThresholdInput,
      setThresholdInput: setVwapThresholdInput,
      entryCandles: vwapEntryCandles,
      setEntryCandles: setVwapEntryCandles,
      tpSwingLength: vwapTPSwingLength,
      setTpSwingLength: setVwapTPSwingLength,
      tpSwingLengthInput: vwapTPSwingLengthInput,
      setTpSwingLengthInput: setVwapTPSwingLengthInput,
      slSwingLength: vwapSLSwingLength,
      setSlSwingLength: setVwapSLSwingLength,
      slSwingLengthInput: vwapSLSwingLengthInput,
      setSlSwingLengthInput: setVwapSLSwingLengthInput,
      tpsl: vwapTPSL,
      setTpsl: setVwapTPSL,
    },
    structureBreak: {
      enabled: stratStructureBreak,
      setEnabled: setStratStructureBreak,
      trendFilter: structureTrendFilter,
      setTrendFilter: setStructureTrendFilter,
      directionFilter: structureDirectionFilter,
      setDirectionFilter: setStructureDirectionFilter,
    },
    rsFlip: {
      enabled: stratRSFlip,
      setEnabled: setStratRSFlip,
      trendFilter: rsFlipTrendFilter,
      setTrendFilter: setRsFlipTrendFilter,
      directionFilter: rsFlipDirectionFilter,
      setDirectionFilter: setRsFlipDirectionFilter,
      retestCandles: rsFlipRetestCandles,
      setRetestCandles: setRsFlipRetestCandles,
      retestCandlesInput: rsFlipRetestCandlesInput,
      setRetestCandlesInput: setRsFlipRetestCandlesInput,
      tpSwingLength: rsFlipTPSwingLength,
      setTpSwingLength: setRsFlipTPSwingLength,
      tpSwingLengthInput: rsFlipTPSwingLengthInput,
      setTpSwingLengthInput: setRsFlipTPSwingLengthInput,
      slSwingLength: rsFlipSLSwingLength,
      setSlSwingLength: setRsFlipSLSwingLength,
      slSwingLengthInput: rsFlipSLSwingLengthInput,
      setSlSwingLengthInput: setRsFlipSLSwingLengthInput,
      tpsl: rsFlipTPSL,
      setTpsl: setRsFlipTPSL,
    },
    emaTrading: {
      enabled: stratEMATrading,
      setEnabled: setStratEMATrading,
      entryMode: emaEntryMode,
      setEntryMode: setEmaEntryMode,
      singlePeriod: emaSinglePeriod,
      setSinglePeriod: setEmaSinglePeriod,
      singlePeriodInput: emaSinglePeriodInput,
      setSinglePeriodInput: setEmaSinglePeriodInput,
      threshold: emaThreshold,
      setThreshold: setEmaThreshold,
      tpSwingLength: emaTradingTPSwingLength,
      setTpSwingLength: setEmaTradingTPSwingLength,
      tpSwingLengthInput: emaTradingTPSwingLengthInput,
      setTpSwingLengthInput: setEmaTradingTPSwingLengthInput,
      slSwingLength: emaTradingSLSwingLength,
      setSlSwingLength: setEmaTradingSLSwingLength,
      slSwingLengthInput: emaTradingSLSwingLengthInput,
      setSlSwingLengthInput: setEmaTradingSLSwingLengthInput,
      trendFilter: emaTradingTrendFilter,
      setTrendFilter: setEmaTradingTrendFilter,
      directionFilter: emaTradingDirectionFilter,
      setDirectionFilter: setEmaTradingDirectionFilter,
      tpsl: emaTradingTPSL,
      setTpsl: setEmaTradingTPSL,
    },
    legacy: {
      trendFilter,
      setTrendFilter,
      trendFilterType,
      setTrendFilterType,
      directionFilter,
      setDirectionFilter,
    },
    risk: {
      accountSize,
      setAccountSize,
      riskPercent,
      setRiskPercent,
    },
  };
}

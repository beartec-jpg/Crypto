import { useState } from 'react';
import type { MAConfig } from '@/types/chart.types';

export function useIndicatorState() {
  // VWAP toggles
  const [showVWAPSession, setShowVWAPSession] = useState(false);
  const [showVWAPDaily, setShowVWAPDaily] = useState(false);
  const [showVWAPWeekly, setShowVWAPWeekly] = useState(false);
  const [showVWAPMonthly, setShowVWAPMonthly] = useState(false);
  const [showVWAPRolling, setShowVWAPRolling] = useState(false);
  const [vwapRollingPeriod, setVwapRollingPeriod] = useState(20);
  const [vwapRollingPeriodInput, setVwapRollingPeriodInput] = useState('20');

  // SMC Indicator toggles
  const [showFVG, setShowFVG] = useState(false);
  const [showBOS, setShowBOS] = useState(false);
  const [showCHoCH, setShowCHoCH] = useState(false);
  const [showSwingPivots, setShowSwingPivots] = useState(false);
  const [swingPivotLength, setSwingPivotLength] = useState(10);
  const [swingPivotLengthInput, setSwingPivotLengthInput] = useState('10');
  const [showHighValueOnly, setShowHighValueOnly] = useState(false);
  const [showChartLabels, setShowChartLabels] = useState(false);
  const [showAutoTrendlines, setShowAutoTrendlines] = useState(false);
  const [trendlineMinTouches, setTrendlineMinTouches] = useState(2);
  const [trendlineMinTouchesInput, setTrendlineMinTouchesInput] = useState('2');
  const [trendlineTolerance, setTrendlineTolerance] = useState(0.002); // 0.2% tolerance
  const [trendlineToleranceInput, setTrendlineToleranceInput] = useState('0.2');
  const [trendlinePivotLength, setTrendlinePivotLength] = useState(10);
  const [trendlinePivotLengthInput, setTrendlinePivotLengthInput] = useState('10');
  
  // EMA settings - dynamic list with multi-timeframe support
  const [showEMA, setShowEMA] = useState(false);
  const [emaConfigs, setEmaConfigs] = useState<MAConfig[]>([
    { id: 'ema1', period: 21, timeframe: 'current', color: '#3b82f6' }
  ]);
  const [emaInputs, setEmaInputs] = useState<Record<string, string>>({ ema1: '21' });
  // Legacy state for backwards compatibility with trading strategies
  const emaFastPeriod = emaConfigs[0]?.period || 21;
  const emaSlowPeriod = emaConfigs[1]?.period || 50;
  const [emaFastInput, setEmaFastInput] = useState('10');
  const [emaSlowInput, setEmaSlowInput] = useState('40')

  // SMA settings - dynamic list with multi-timeframe support
const [showSMA, setShowSMA] = useState(false);
const [smaConfigs, setSmaConfigs] = useState<MAConfig[]>([
  { id: 'sma1', period: 50, timeframe: 'current', color: '#8b5cf6' }
]);
// Legacy state for backwards compatibility
const smaFastPeriod = smaConfigs[0]?.period || 20;
const smaSlowPeriod = smaConfigs[1]?.period || 50;
  
  // Oscillator indicators - RSI
  const [showRSI, setShowRSI] = useState(false);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiPeriodInput, setRsiPeriodInput] = useState('14');
  
  // MACD
  const [showMACD, setShowMACD] = useState(false);
  const [macdFast, setMacdFast] = useState(12);
  const [macdFastInput, setMacdFastInput] = useState('12');
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSlowInput, setMacdSlowInput] = useState('26');
  const [macdSignal, setMacdSignal] = useState(9);
  const [macdSignalInput, setMacdSignalInput] = useState('9');
  
  // OBV
  const [showOBV, setShowOBV] = useState(false);
  
  // MFI
  const [showMFI, setShowMFI] = useState(false);
  const [mfiPeriod, setMfiPeriod] = useState(14);
  const [mfiPeriodInput, setMfiPeriodInput] = useState('14');
  
  // Oscillator sync
  const [syncOscillatorScale, setSyncOscillatorScale] = useState(false);
  
  // Bollinger Bands settings
  const [showBB, setShowBB] = useState(false);
  const [bbPeriod, setBbPeriod] = useState(20);
  const [bbPeriodInput, setBbPeriodInput] = useState('20');
  const [bbStdDev, setBbStdDev] = useState(2);
  const [bbStdDevInput, setBbStdDevInput] = useState('2');

  // SMC Controls
  const [showOrderBlocks, setShowOrderBlocks] = useState(false);
  const [obSwingLength, setObSwingLength] = useState(10);
  const [obSwingLengthInput, setObSwingLengthInput] = useState('10');
  const [orderBlockLength, setOrderBlockLength] = useState(100);
  const [orderBlockLengthInput, setOrderBlockLengthInput] = useState('100');
  const [showPremiumDiscount, setShowPremiumDiscount] = useState(false);
  const [pdLookback, setPdLookback] = useState(50);
  const [pdLookbackInput, setPdLookbackInput] = useState('50');
  
  // Trend Tools - SMA with dynamic list and multi-timeframe support
  const [showSMA, setShowSMA] = useState(false);
  const [smaConfigs, setSmaConfigs] = useState<MAConfig[]>([
    { id: 'sma1', period: 50, timeframe: 'current', color: '#8b5cf6' }
  ]);
  // Legacy state for backwards compatibility
  const smaFastPeriod = smaConfigs[0]?.period || 20;
  const smaSlowPeriod = smaConfigs[1]?.period || 50;
  const [smaFastInput, setSmaFastInput] = useState('20');
  const [smaSlowInput, setSmaSlowInput] = useState('50');
  
  // Supertrend
  const [showSupertrend, setShowSupertrend] = useState(false);
  const [supertrendPeriod, setSupertrendPeriod] = useState(10);
  const [supertrendPeriodInput, setSupertrendPeriodInput] = useState('10');
  const [supertrendMultiplier, setSupertrendMultiplier] = useState(3);
  const [supertrendMultiplierInput, setSupertrendMultiplierInput] = useState('3');
  
  // Parabolic SAR
  const [showParabolicSAR, setShowParabolicSAR] = useState(false);
  const [sarStep, setSarStep] = useState(0.02);
  const [sarStepInput, setSarStepInput] = useState('0.02');
  const [sarMax, setSarMax] = useState(0.2);
  const [sarMaxInput, setSarMaxInput] = useState('0.2');
  
  // VWAP Tools
  const [showVWAPBands, setShowVWAPBands] = useState(false);
  const [vwapBandsStdDev, setVwapBandsStdDev] = useState(2);
  const [vwapBandsStdDevInput, setVwapBandsStdDevInput] = useState('2');
  const [showSessionVWAP, setShowSessionVWAP] = useState(false);
  
  // Additional Oscillators - Stochastic RSI
  const [showStochRSI, setShowStochRSI] = useState(false);
  const [stochRSIPeriod, setStochRSIPeriod] = useState(14);
  const [stochRSIPeriodInput, setStochRSIPeriodInput] = useState('14');
  
  // Williams %R
  const [showWilliamsR, setShowWilliamsR] = useState(false);
  const [williamsRPeriod, setWilliamsRPeriod] = useState(14);
  const [williamsRPeriodInput, setWilliamsRPeriodInput] = useState('14');
  
  // CCI
  const [showCCI, setShowCCI] = useState(false);
  const [cciPeriod, setCciPeriod] = useState(20);
  const [cciPeriodInput, setCciPeriodInput] = useState('20');
  
  // ADX
  const [showADX, setShowADX] = useState(false);
  const [adxPeriod, setAdxPeriod] = useState(14);
  const [adxPeriodInput, setAdxPeriodInput] = useState('14');

  return {
    // VWAP
    vwap: {
      showSession: showVWAPSession,
      setShowSession: setShowVWAPSession,
      showDaily: showVWAPDaily,
      setShowDaily: setShowVWAPDaily,
      showWeekly: showVWAPWeekly,
      setShowWeekly: setShowVWAPWeekly,
      showMonthly: showVWAPMonthly,
      setShowMonthly: setShowVWAPMonthly,
      showRolling: showVWAPRolling,
      setShowRolling: setShowVWAPRolling,
      rollingPeriod: vwapRollingPeriod,
      setRollingPeriod: setVwapRollingPeriod,
      rollingPeriodInput: vwapRollingPeriodInput,
      setRollingPeriodInput: setVwapRollingPeriodInput
    },
    
    // SMC
    smc: {
      showFVG,
      setShowFVG,
      showBOS,
      setShowBOS,
      showCHoCH,
      setShowCHoCH,
      showSwingPivots,
      setShowSwingPivots,
      swingPivotLength,
      setSwingPivotLength,
      swingPivotLengthInput,
      setSwingPivotLengthInput,
      showHighValueOnly,
      setShowHighValueOnly,
      showChartLabels,
      setShowChartLabels,
      showAutoTrendlines,
      setShowAutoTrendlines,
      trendlineMinTouches,
      setTrendlineMinTouches,
      trendlineMinTouchesInput,
      setTrendlineMinTouchesInput,
      trendlineTolerance,
      setTrendlineTolerance,
      trendlineToleranceInput,
      setTrendlineToleranceInput,
      trendlinePivotLength,
      setTrendlinePivotLength,
      trendlinePivotLengthInput,
      setTrendlinePivotLengthInput,
      showOrderBlocks,
      setShowOrderBlocks,
      obSwingLength,
      setObSwingLength,
      obSwingLengthInput,
      setObSwingLengthInput,
      orderBlockLength,
      setOrderBlockLength,
      orderBlockLengthInput,
      setOrderBlockLengthInput,
      showPremiumDiscount,
      setShowPremiumDiscount,
      pdLookback,
      setPdLookback,
      pdLookbackInput,
      setPdLookbackInput
    },
    
    // EMA
    ema: {
      show: showEMA,
      setShow: setShowEMA,
      configs: emaConfigs,
      setConfigs: setEmaConfigs,
      inputs: emaInputs,
      setInputs: setEmaInputs,
      fastPeriod: emaFastPeriod,
      slowPeriod: emaSlowPeriod,
      fastInput: emaFastInput,
      setFastInput: setEmaFastInput,
      slowInput: emaSlowInput,
      setSlowInput: setEmaSlowInput
    },

    // SMA
    sma: {
  show: showSMA,
  setShow: setShowSMA,
  configs: smaConfigs,
  setConfigs: setSmaConfigs,
  fastPeriod: smaFastPeriod,
  slowPeriod: smaSlowPeriod,
},
    
    // RSI
    rsi: {
      show: showRSI,
      setShow: setShowRSI,
      period: rsiPeriod,
      setPeriod: setRsiPeriod,
      periodInput: rsiPeriodInput,
      setPeriodInput: setRsiPeriodInput
    },
    
    // MACD
    macd: {
      show: showMACD,
      setShow: setShowMACD,
      fast: macdFast,
      setFast: setMacdFast,
      fastInput: macdFastInput,
      setFastInput: setMacdFastInput,
      slow: macdSlow,
      setSlow: setMacdSlow,
      slowInput: macdSlowInput,
      setSlowInput: setMacdSlowInput,
      signal: macdSignal,
      setSignal: setMacdSignal,
      signalInput: macdSignalInput,
      setSignalInput: setMacdSignalInput
    },
    
    // OBV
    obv: {
      show: showOBV,
      setShow: setShowOBV
    },
    
    // MFI
    mfi: {
      show: showMFI,
      setShow: setShowMFI,
      period: mfiPeriod,
      setPeriod: setMfiPeriod,
      periodInput: mfiPeriodInput,
      setPeriodInput: setMfiPeriodInput
    },
    
    // Stochastic RSI
    stochRSI: {
      show: showStochRSI,
      setShow: setShowStochRSI,
      period: stochRSIPeriod,
      setPeriod: setStochRSIPeriod,
      periodInput: stochRSIPeriodInput,
      setPeriodInput: setStochRSIPeriodInput
    },
    
    // Williams %R
    williamsR: {
      show: showWilliamsR,
      setShow: setShowWilliamsR,
      period: williamsRPeriod,
      setPeriod: setWilliamsRPeriod,
      periodInput: williamsRPeriodInput,
      setPeriodInput: setWilliamsRPeriodInput
    },
    
    // CCI
    cci: {
      show: showCCI,
      setShow: setShowCCI,
      period: cciPeriod,
      setPeriod: setCciPeriod,
      periodInput: cciPeriodInput,
      setPeriodInput: setCciPeriodInput
    },
    
    // ADX
    adx: {
      show: showADX,
      setShow: setShowADX,
      period: adxPeriod,
      setPeriod: setAdxPeriod,
      periodInput: adxPeriodInput,
      setPeriodInput: setAdxPeriodInput
    },
    
    // Bollinger Bands
    bb: {
      show: showBB,
      setShow: setShowBB,
      period: bbPeriod,
      setPeriod: setBbPeriod,
      periodInput: bbPeriodInput,
      setPeriodInput: setBbPeriodInput,
      stdDev: bbStdDev,
      setStdDev: setBbStdDev,
      stdDevInput: bbStdDevInput,
      setStdDevInput: setBbStdDevInput
    },
    
    // SMA
    sma: {
      show: showSMA,
      setShow: setShowSMA,
      configs: smaConfigs,
      setConfigs: setSmaConfigs,
      fastPeriod: smaFastPeriod,
      slowPeriod: smaSlowPeriod,
      fastInput: smaFastInput,
      setFastInput: setSmaFastInput,
      slowInput: smaSlowInput,
      setSlowInput: setSmaSlowInput
    },
    
    // Supertrend
    supertrend: {
      show: showSupertrend,
      setShow: setShowSupertrend,
      period: supertrendPeriod,
      setPeriod: setSupertrendPeriod,
      periodInput: supertrendPeriodInput,
      setPeriodInput: setSupertrendPeriodInput,
      multiplier: supertrendMultiplier,
      setMultiplier: setSupertrendMultiplier,
      multiplierInput: supertrendMultiplierInput,
      setMultiplierInput: setSupertrendMultiplierInput
    },
    
    // Parabolic SAR
    parabolicSAR: {
      show: showParabolicSAR,
      setShow: setShowParabolicSAR,
      step: sarStep,
      setStep: setSarStep,
      stepInput: sarStepInput,
      setStepInput: setSarStepInput,
      max: sarMax,
      setMax: setSarMax,
      maxInput: sarMaxInput,
      setMaxInput: setSarMaxInput
    },
    
    // VWAP Tools
    vwapTools: {
      showBands: showVWAPBands,
      setShowBands: setShowVWAPBands,
      bandsStdDev: vwapBandsStdDev,
      setBandsStdDev: setVwapBandsStdDev,
      bandsStdDevInput: vwapBandsStdDevInput,
      setBandsStdDevInput: setVwapBandsStdDevInput,
      showSession: showSessionVWAP,
      setShowSession: setShowSessionVWAP
    },
    
    // Oscillator sync
    syncOscillatorScale,
    setSyncOscillatorScale
  };
}

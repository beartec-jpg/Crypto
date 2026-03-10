/**
 * Hook to manage trading system activation and configuration
 * Handles applying preset configurations to indicators/oscillators/tools
 */

import { useState, useCallback } from 'react';
import { type TradingSystemId, TRADING_SYSTEMS } from '@/types/tradingSystems';

export interface TradingSystemCallbacks {
  // Oscillator callbacks
  setShowRSI?: (show: boolean) => void;
  setRSIPeriod?: (period: number) => void;
  setShowMACD?: (show: boolean) => void;
  setMACDFast?: (fast: number) => void;
  setMACDSlow?: (slow: number) => void;
  setMACDSignal?: (signal: number) => void;
  setShowStochRSI?: (show: boolean) => void;
  setStochRSIPeriod?: (period: number) => void;
  setShowOBV?: (show: boolean) => void;
  setShowMFI?: (show: boolean) => void;
  setMFIPeriod?: (period: number) => void;
  setShowWilliamsR?: (show: boolean) => void;
  setShowCCI?: (show: boolean) => void;
  setShowADX?: (show: boolean) => void;
  setADXPeriod?: (period: number) => void;
  
  // Chart indicator callbacks
  setShowEMA?: (show: boolean) => void;
  setShowBollingerBands?: (show: boolean) => void;
  setBBPeriod?: (period: number) => void;
  setBBStdDev?: (stdDev: number) => void;
  setElderImpulseEnabled?: (enabled: boolean) => void;
  
  // SMC callbacks
  setFVGEnabled?: (enabled: boolean) => void;
  setOrderBlocksEnabled?: (enabled: boolean) => void;
  setBOSEnabled?: (enabled: boolean) => void;
  setLiquidityEnabled?: (enabled: boolean) => void;
  setAutoFibEnabled?: (enabled: boolean) => void;
  
  // Tool callbacks
  setSuperTrendEnabled?: (enabled: boolean) => void;
  setVolumeProfileEnabled?: (enabled: boolean) => void;
  setSqueezeEnabled?: (enabled: boolean) => void;
  setDivergenceScannerEnabled?: (enabled: boolean) => void;
  setHTFBiasEnabled?: (enabled: boolean) => void;
  setSessionSeparatorsEnabled?: (enabled: boolean) => void;
}

export function useTradingSystem(callbacks: TradingSystemCallbacks) {
  const [activeSystem, setActiveSystem] = useState<TradingSystemId | null>(null);

  const resetSystemManagedFeatures = useCallback(() => {
    // Oscillators
    callbacks.setShowRSI?.(false);
    callbacks.setShowMACD?.(false);
    callbacks.setShowStochRSI?.(false);
    callbacks.setShowOBV?.(false);
    callbacks.setShowMFI?.(false);
    callbacks.setShowWilliamsR?.(false);
    callbacks.setShowCCI?.(false);
    callbacks.setShowADX?.(false);

    // Chart indicators
    callbacks.setShowEMA?.(false);
    callbacks.setShowBollingerBands?.(false);
    callbacks.setElderImpulseEnabled?.(false);

    // SMC
    callbacks.setFVGEnabled?.(false);
    callbacks.setOrderBlocksEnabled?.(false);
    callbacks.setBOSEnabled?.(false);
    callbacks.setLiquidityEnabled?.(false);
    callbacks.setAutoFibEnabled?.(false);

    // Tools
    callbacks.setSuperTrendEnabled?.(false);
    callbacks.setVolumeProfileEnabled?.(false);
    callbacks.setSqueezeEnabled?.(false);
    callbacks.setDivergenceScannerEnabled?.(false);
    callbacks.setHTFBiasEnabled?.(false);
    callbacks.setSessionSeparatorsEnabled?.(false);
  }, [callbacks]);

  const activateSystem = useCallback((systemId: TradingSystemId) => {
    const system = TRADING_SYSTEMS[systemId];
    if (!system) return;

    // Always clear chart globally before applying a system preset
    resetSystemManagedFeatures();

    // Apply oscillator configurations
    if (system.preset.oscillators) {
      const osc = system.preset.oscillators;
      
      if (osc.rsi !== undefined) {
        callbacks.setShowRSI?.(osc.rsi.enabled);
        if (osc.rsi.period) callbacks.setRSIPeriod?.(osc.rsi.period);
      }
      
      if (osc.macd !== undefined) {
        callbacks.setShowMACD?.(osc.macd.enabled);
        if (osc.macd.fast) callbacks.setMACDFast?.(osc.macd.fast);
        if (osc.macd.slow) callbacks.setMACDSlow?.(osc.macd.slow);
        if (osc.macd.signal) callbacks.setMACDSignal?.(osc.macd.signal);
      }
      
      if (osc.stochRSI !== undefined) {
        callbacks.setShowStochRSI?.(osc.stochRSI.enabled);
        if (osc.stochRSI.period) callbacks.setStochRSIPeriod?.(osc.stochRSI.period);
      }
      
      if (osc.obv !== undefined) {
        callbacks.setShowOBV?.(osc.obv.enabled);
      }
      
      if (osc.mfi !== undefined) {
        callbacks.setShowMFI?.(osc.mfi.enabled);
        if (osc.mfi.period) callbacks.setMFIPeriod?.(osc.mfi.period);
      }
      
      if (osc.williamsR !== undefined) {
        callbacks.setShowWilliamsR?.(osc.williamsR.enabled);
      }
      
      if (osc.cci !== undefined) {
        callbacks.setShowCCI?.(osc.cci.enabled);
      }
      
      if (osc.adx !== undefined) {
        callbacks.setShowADX?.(osc.adx.enabled);
        if (osc.adx.period) callbacks.setADXPeriod?.(osc.adx.period);
      }
    }

    // Apply chart indicator configurations
    if (system.preset.indicators) {
      const ind = system.preset.indicators;
      
      if (ind.ema !== undefined) {
        callbacks.setShowEMA?.(ind.ema.enabled);
        // Note: EMA periods are set separately via EMA config
      }
      
      if (ind.bollingerBands !== undefined) {
        callbacks.setShowBollingerBands?.(ind.bollingerBands.enabled);
        if (ind.bollingerBands.period) callbacks.setBBPeriod?.(ind.bollingerBands.period);
        if (ind.bollingerBands.stdDev) callbacks.setBBStdDev?.(ind.bollingerBands.stdDev);
      }
      
      if (ind.elderImpulse !== undefined) {
        callbacks.setElderImpulseEnabled?.(ind.elderImpulse.enabled);
      }
    }

    // Apply SMC configurations
    if (system.preset.smc) {
      const smc = system.preset.smc;
      
      if (smc.fvg !== undefined) {
        callbacks.setFVGEnabled?.(smc.fvg.enabled);
      }
      
      if (smc.orderBlocks !== undefined) {
        callbacks.setOrderBlocksEnabled?.(smc.orderBlocks.enabled);
      }
      
      if (smc.bos !== undefined) {
        callbacks.setBOSEnabled?.(smc.bos.enabled);
      }
      
      if (smc.liquidity !== undefined) {
        callbacks.setLiquidityEnabled?.(smc.liquidity.enabled);
      }
      
      if (smc.autoFib !== undefined) {
        callbacks.setAutoFibEnabled?.(smc.autoFib.enabled);
      }
    }

    // Apply tool configurations
    if (system.preset.tools) {
      const tools = system.preset.tools;
      
      if (tools.superTrend !== undefined) {
        callbacks.setSuperTrendEnabled?.(tools.superTrend.enabled);
      }
      
      if (tools.volumeProfile !== undefined) {
        callbacks.setVolumeProfileEnabled?.(tools.volumeProfile.enabled);
      }
      
      if (tools.squeezeMomentum !== undefined) {
        callbacks.setSqueezeEnabled?.(tools.squeezeMomentum.enabled);
      }
      
      if (tools.divergenceScanner !== undefined) {
        callbacks.setDivergenceScannerEnabled?.(tools.divergenceScanner.enabled);
      }
      
      if (tools.htfBias !== undefined) {
        callbacks.setHTFBiasEnabled?.(tools.htfBias.enabled);
      }
      
      if (tools.sessionSeparators !== undefined) {
        callbacks.setSessionSeparatorsEnabled?.(tools.sessionSeparators.enabled);
      }
    }

    setActiveSystem(systemId);
  }, [callbacks, resetSystemManagedFeatures]);

  const deactivateSystem = useCallback(() => {
    // Always clear chart globally when deactivating
    resetSystemManagedFeatures();
    setActiveSystem(null);
  }, [resetSystemManagedFeatures]);

  return {
    activeSystem,
    activateSystem,
    deactivateSystem,
  };
}

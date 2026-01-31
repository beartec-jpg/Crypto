import { useState } from 'react';
import { SMCSettings } from './SMCSettings';
import { TrendSettings } from './TrendSettings';
import { VWAPSettings } from './VWAPSettings';
import { OscillatorSettings } from './OscillatorSettings';

interface SettingsPanelProps {
  isPaidTier: boolean;
  indicators: any;
  handleSMCToolToggle: (name: string, isActive: boolean, setter: (value: boolean) => void) => void;
  handleTrendToolToggle: (name: string, isActive: boolean, setter: (value: boolean) => void) => void;
  handleOscillatorToggle: (name: string, isActive: boolean, setter: (value: boolean) => void) => void;
  cvdSpikeEnabled: boolean;
  setCvdSpikeEnabled: (value: boolean) => void;
  cvdSpikeLevel1Input: string;
  setCvdSpikeLevel1Input: (value: string) => void;
  cvdSpikeLevel1: number;
  setCvdSpikeLevel1: (value: number) => void;
  cvdSpikeLevel2Input: string;
  setCvdSpikeLevel2Input: (value: string) => void;
  cvdSpikeLevel2: number;
  setCvdSpikeLevel2: (value: number) => void;
  cvdSpikeLevel3Input: string;
  setCvdSpikeLevel3Input: (value: string) => void;
  cvdSpikeLevel3: number;
  setCvdSpikeLevel3: (value: number) => void;
  fvgVolumeThreshold: number;
  setFvgVolumeThreshold: (value: number) => void;
  chartBosSwingLengthInput: string;
  setChartBosSwingLengthInput: (value: string) => void;
  chartBosSwingLength: number;
  setChartBosSwingLength: (value: number) => void;
  chartChochSwingLengthInput: string;
  setChartChochSwingLengthInput: (value: string) => void;
  chartChochSwingLength: number;
  setChartChochSwingLength: (value: number) => void;
  stratLiquidityGrab: boolean;
  setStratLiquidityGrab: (value: boolean) => void;
  chartLiquiditySweepSwingLengthInput: string;
  setChartLiquiditySweepSwingLengthInput: (value: string) => void;
  chartLiquiditySweepSwingLength: number;
  setChartLiquiditySweepSwingLength: (value: number) => void;
  setLocation: (path: string) => void;
  interval: string;
  saveToTimeframe: () => void;
  makeTimeframeDefault: () => void;
  loading: boolean;
  chartControlsTab: string;
  setChartControlsTab: (tab: string) => void;
}

export function SettingsPanel({ 
  isPaidTier,
  indicators,
  handleSMCToolToggle,
  handleTrendToolToggle,
  handleOscillatorToggle,
  cvdSpikeEnabled,
  setCvdSpikeEnabled,
  cvdSpikeLevel1Input,
  setCvdSpikeLevel1Input,
  cvdSpikeLevel1,
  setCvdSpikeLevel1,
  cvdSpikeLevel2Input,
  setCvdSpikeLevel2Input,
  cvdSpikeLevel2,
  setCvdSpikeLevel2,
  cvdSpikeLevel3Input,
  setCvdSpikeLevel3Input,
  cvdSpikeLevel3,
  setCvdSpikeLevel3,
  fvgVolumeThreshold,
  setFvgVolumeThreshold,
  chartBosSwingLengthInput,
  setChartBosSwingLengthInput,
  chartBosSwingLength,
  setChartBosSwingLength,
  chartChochSwingLengthInput,
  setChartChochSwingLengthInput,
  chartChochSwingLength,
  setChartChochSwingLength,
  stratLiquidityGrab,
  setStratLiquidityGrab,
  chartLiquiditySweepSwingLengthInput,
  setChartLiquiditySweepSwingLengthInput,
  chartLiquiditySweepSwingLength,
  setChartLiquiditySweepSwingLength,
  setLocation,
  interval,
  saveToTimeframe,
  makeTimeframeDefault,
  loading,
  chartControlsTab,
  setChartControlsTab
}: SettingsPanelProps) {
  if (loading) return null;
  
  return (
    <div className="mt-4 border-t border-slate-700 pt-4">
      {/* Tab Buttons */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <button
          onClick={() => setChartControlsTab('smc')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            chartControlsTab === 'smc'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
          }`}
          data-testid="tab-smc-controls"
        >
          SMC Controls
        </button>
        <button
          onClick={() => setChartControlsTab('trend')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            chartControlsTab === 'trend'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
          }`}
          data-testid="tab-trend-tools"
        >
          Trend Tools
        </button>
        <button
          onClick={() => setChartControlsTab('vwap')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            chartControlsTab === 'vwap'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
          }`}
          data-testid="tab-vwap"
        >
          VWAP
        </button>
        <button
          onClick={() => setChartControlsTab('oscillators')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            chartControlsTab === 'oscillators'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
          }`}
          data-testid="tab-oscillators"
        >
          OSC
        </button>
      </div>

      {/* Tab Content - Only show when a tab is selected */}
      {chartControlsTab && (
        <div className="bg-slate-900 rounded-lg p-4 min-h-[120px]">
          {/* SMC Controls Tab */}
          {chartControlsTab === 'smc' && (
            <SMCSettings
              isPaidTier={isPaidTier}
              indicators={indicators}
              handleSMCToolToggle={handleSMCToolToggle}
              cvdSpikeEnabled={cvdSpikeEnabled}
              setCvdSpikeEnabled={setCvdSpikeEnabled}
              cvdSpikeLevel1Input={cvdSpikeLevel1Input}
              setCvdSpikeLevel1Input={setCvdSpikeLevel1Input}
              cvdSpikeLevel1={cvdSpikeLevel1}
              setCvdSpikeLevel1={setCvdSpikeLevel1}
              cvdSpikeLevel2Input={cvdSpikeLevel2Input}
              setCvdSpikeLevel2Input={setCvdSpikeLevel2Input}
              cvdSpikeLevel2={cvdSpikeLevel2}
              setCvdSpikeLevel2={setCvdSpikeLevel2}
              cvdSpikeLevel3Input={cvdSpikeLevel3Input}
              setCvdSpikeLevel3Input={setCvdSpikeLevel3Input}
              cvdSpikeLevel3={cvdSpikeLevel3}
              setCvdSpikeLevel3={setCvdSpikeLevel3}
              fvgVolumeThreshold={fvgVolumeThreshold}
              setFvgVolumeThreshold={setFvgVolumeThreshold}
              chartBosSwingLengthInput={chartBosSwingLengthInput}
              setChartBosSwingLengthInput={setChartBosSwingLengthInput}
              chartBosSwingLength={chartBosSwingLength}
              setChartBosSwingLength={setChartBosSwingLength}
              chartChochSwingLengthInput={chartChochSwingLengthInput}
              setChartChochSwingLengthInput={setChartChochSwingLengthInput}
              chartChochSwingLength={chartChochSwingLength}
              setChartChochSwingLength={setChartChochSwingLength}
              stratLiquidityGrab={stratLiquidityGrab}
              setStratLiquidityGrab={setStratLiquidityGrab}
              chartLiquiditySweepSwingLengthInput={chartLiquiditySweepSwingLengthInput}
              setChartLiquiditySweepSwingLengthInput={setChartLiquiditySweepSwingLengthInput}
              chartLiquiditySweepSwingLength={chartLiquiditySweepSwingLength}
              setChartLiquiditySweepSwingLength={setChartLiquiditySweepSwingLength}
              interval={interval}
              saveToTimeframe={saveToTimeframe}
              makeTimeframeDefault={makeTimeframeDefault}
            />
          )}

          {/* Trend Tools Tab */}
          {chartControlsTab === 'trend' && (
            <TrendSettings
              isPaidTier={isPaidTier}
              indicators={indicators}
              handleTrendToolToggle={handleTrendToolToggle}
              interval={interval}
              saveToTimeframe={saveToTimeframe}
              makeTimeframeDefault={makeTimeframeDefault}
            />
          )}

          {/* VWAP Tab */}
          {chartControlsTab === 'vwap' && (
            <VWAPSettings
              indicators={indicators}
              interval={interval}
              saveToTimeframe={saveToTimeframe}
              makeTimeframeDefault={makeTimeframeDefault}
            />
          )}

          {/* Oscillators Tab */}
          {chartControlsTab === 'oscillators' && (
            <OscillatorSettings
              isPaidTier={isPaidTier}
              indicators={indicators}
              handleOscillatorToggle={handleOscillatorToggle}
              setLocation={setLocation}
              interval={interval}
              saveToTimeframe={saveToTimeframe}
              makeTimeframeDefault={makeTimeframeDefault}
            />
          )}
        </div>
      )}
    </div>
  );
}

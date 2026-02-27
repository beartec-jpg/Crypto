import { RSIPanel } from '@/components/indicators/oscillators/RSIPanel';
import { MACDPanel } from '@/components/indicators/oscillators/MACDPanel';
import { VolumePanel } from '@/components/indicators/oscillators/VolumePanel';
import { StochasticPanel } from '@/components/indicators/oscillators/StochasticPanel';
import { WilliamsRPanel } from '@/components/indicators/oscillators/WilliamsRPanel';
import { CCIPanel } from '@/components/indicators/oscillators/CCIPanel';
import { ADXPanel } from '@/components/indicators/oscillators/ADXPanel';
import { OBVPanel } from '@/components/indicators/oscillators/OBVPanel';
import { MFIPanel } from '@/components/indicators/oscillators/MFIPanel';
import { SqueezeMomentumPanel } from '@/components/oscillators/SqueezeMomentumPanel';
import { OSCILLATOR_PANEL_HEIGHT_PER, MOBILE_NAV_HEIGHT, TOP_TOOLBAR_HEIGHT } from '@/lib/constants/layout';
import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { SqueezeMomentumValue, SqueezeMomentumSettings } from '@/types/squeezeMomentum';

interface DockedOscillatorSectionProps {
  selectedOscillators: Set<string>;
  poppedOutOscillators: Set<string>;
  miniOscillators?: Set<string>;
  oscillatorData: OscillatorData;
  candles: { time: number }[];
  totalOscillatorHeight: number;
  onPopout: (oscillatorId: string) => void;
  onCycleMode?: (oscillatorId: string) => void;
  isFullscreen?: boolean;
  // NEW:
  usePercentage?: boolean;
  totalPercentage?: number;
  perOscillatorPercentage?: number;
  mainChartVisibleRange?: any;
  sqzData?: SqueezeMomentumValue[];
  sqzSettings?: SqueezeMomentumSettings;
}

export function DockedOscillatorSection({
  selectedOscillators,
  poppedOutOscillators,
  miniOscillators,
  oscillatorData,
  candles,
  totalOscillatorHeight,
  onPopout,
  onCycleMode,
  isFullscreen = false,
  usePercentage = false,
  totalPercentage = 0,
  perOscillatorPercentage = 0,
  mainChartVisibleRange,
  sqzData,
  sqzSettings,
}: DockedOscillatorSectionProps) {
  const dockedOscillatorsCount = Array.from(selectedOscillators).filter(
    osc => !poppedOutOscillators.has(osc) && !miniOscillators?.has(osc)
  ).length;
  const hasSqueeze = sqzSettings?.enabled && sqzData && sqzData.length > 0;

  if (dockedOscillatorsCount === 0 && !hasSqueeze) return null;

  return (
    <div 
      className="fixed left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40" 
      style={{ 
        bottom: isFullscreen ? 0 : `${MOBILE_NAV_HEIGHT}px`,
        height: usePercentage ? `${totalPercentage}vh` : `${totalOscillatorHeight}px`,
        maxHeight: usePercentage 
          ? `${totalPercentage}vh`
          : `calc(100vh - ${isFullscreen ? 0 : MOBILE_NAV_HEIGHT}px - ${TOP_TOOLBAR_HEIGHT}px)`
      }}
    >
      <div className="bg-slate-900 overflow-y-auto h-full">
        {selectedOscillators.has('rsi') && !poppedOutOscillators.has('rsi') && !miniOscillators?.has('rsi') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('rsi')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>RSI (14)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <RSIPanel data={oscillatorData.rsi} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}
        
        {selectedOscillators.has('macd') && !poppedOutOscillators.has('macd') && !miniOscillators?.has('macd') && (
          <div style={{ height: `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('macd')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>MACD (12, 26, 9)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <MACDPanel 
              macdData={oscillatorData.macd.macd}
              signalData={oscillatorData.macd.signal}
              histogramData={oscillatorData.macd.hist}
              fastPeriod={12}
              slowPeriod={26}
              signalPeriod={9}
              mainChartVisibleRange={mainChartVisibleRange}
            />
          </div>
        )}
        
        {selectedOscillators.has('volume') && !poppedOutOscillators.has('volume') && !miniOscillators?.has('volume') && (
          <div style={{ height: `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('volume')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>Volume</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <VolumePanel data={oscillatorData.volume} mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('stochRsi') && !poppedOutOscillators.has('stochRsi') && !miniOscillators?.has('stochRsi') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('stochRsi')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>Stoch RSI (14,14,3,3)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <StochasticPanel data={oscillatorData.stochRsi} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('williamsR') && !poppedOutOscillators.has('williamsR') && !miniOscillators?.has('williamsR') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('williamsR')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>Williams %R (14)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <WilliamsRPanel data={oscillatorData.williamsR} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('cci') && !poppedOutOscillators.has('cci') && !miniOscillators?.has('cci') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('cci')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>CCI (20)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <CCIPanel data={oscillatorData.cci} period={20} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('adx') && !poppedOutOscillators.has('adx') && !miniOscillators?.has('adx') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('adx')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>ADX (14)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <ADXPanel data={oscillatorData.adx} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('obv') && !poppedOutOscillators.has('obv') && !miniOscillators?.has('obv') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('obv')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>OBV</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <OBVPanel data={oscillatorData.obv} mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('mfi') && !poppedOutOscillators.has('mfi') && !miniOscillators?.has('mfi') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('mfi')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>MFI (14)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <MFIPanel data={oscillatorData.mfi} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {hasSqueeze && sqzData && sqzSettings && (
          <div style={{ height: `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <SqueezeMomentumPanel
              data={sqzData}
              settings={sqzSettings}
              mainChartVisibleRange={mainChartVisibleRange}
            />
          </div>
        )}
      </div>
    </div>
  );
}

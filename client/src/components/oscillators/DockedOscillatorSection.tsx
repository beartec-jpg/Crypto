import { RSIPanel } from '@/components/indicators/oscillators/RSIPanel';
import { MACDPanel } from '@/components/indicators/oscillators/MACDPanel';
import { VolumePanel } from '@/components/indicators/oscillators/VolumePanel';
import { OSCILLATOR_PANEL_HEIGHT_PER, MOBILE_NAV_HEIGHT, TOP_TOOLBAR_HEIGHT } from '@/lib/constants/layout';
import type { OscillatorData } from '@/hooks/useOscillatorData';

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
}: DockedOscillatorSectionProps) {
  const dockedOscillatorsCount = Array.from(selectedOscillators).filter(
    osc => !poppedOutOscillators.has(osc) && !miniOscillators?.has(osc)
  ).length;

  if (dockedOscillatorsCount === 0) return null;

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
        {selectedOscillators.has('rsi') && !poppedOutOscillators.has('rsi') && (
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
      </div>
    </div>
  );
}

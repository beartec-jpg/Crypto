import { Button } from '@/components/ui/button';
import { RSIPanel } from '@/components/indicators/oscillators/RSIPanel';
import { MACDPanel } from '@/components/indicators/oscillators/MACDPanel';
import { VolumePanel } from '@/components/indicators/oscillators/VolumePanel';
import { OSCILLATOR_PANEL_HEIGHT_PER, MOBILE_NAV_HEIGHT, TOP_TOOLBAR_HEIGHT } from '@/lib/constants/layout';
import type { OscillatorData } from '@/hooks/useOscillatorData';

interface DockedOscillatorSectionProps {
  selectedOscillators: Set<string>;
  poppedOutOscillators: Set<string>;
  oscillatorData: OscillatorData;
  candles: { time: number }[];
  totalOscillatorHeight: number;
  onPopout: (oscillatorId: string) => void;
}

export function DockedOscillatorSection({
  selectedOscillators,
  poppedOutOscillators,
  oscillatorData,
  candles,
  totalOscillatorHeight,
  onPopout,
}: DockedOscillatorSectionProps) {
  const dockedOscillatorsCount = Array.from(selectedOscillators).filter(
    osc => !poppedOutOscillators.has(osc)
  ).length;

  if (dockedOscillatorsCount === 0) return null;

  return (
    <div 
      className="fixed left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40" 
      style={{ 
        bottom: `${MOBILE_NAV_HEIGHT}px`,
        height: `${totalOscillatorHeight}px`,
        maxHeight: `calc(100vh - ${MOBILE_NAV_HEIGHT}px - ${TOP_TOOLBAR_HEIGHT}px)`
      }}
    >
      <div className="bg-slate-900 overflow-y-auto h-full">
        {selectedOscillators.has('rsi') && !poppedOutOscillators.has('rsi') && (
          <div style={{ height: `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-400">RSI (14)</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-xs px-2"
                onClick={() => onPopout('rsi')}
              >
                Popout
              </Button>
            </div>
            <RSIPanel data={oscillatorData.rsi} period={14} candles={candles} />
          </div>
        )}
        
        {selectedOscillators.has('macd') && !poppedOutOscillators.has('macd') && (
          <div style={{ height: `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-400">MACD (12, 26, 9)</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-xs px-2"
                onClick={() => onPopout('macd')}
              >
                Popout
              </Button>
            </div>
            <MACDPanel 
              macdData={oscillatorData.macd.macd}
              signalData={oscillatorData.macd.signal}
              histogramData={oscillatorData.macd.hist}
              fastPeriod={12}
              slowPeriod={26}
              signalPeriod={9}
            />
          </div>
        )}
        
        {selectedOscillators.has('volume') && !poppedOutOscillators.has('volume') && (
          <div style={{ height: `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-400">Volume</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-xs px-2"
                onClick={() => onPopout('volume')}
              >
                Popout
              </Button>
            </div>
            <VolumePanel data={oscillatorData.volume} />
          </div>
        )}
      </div>
    </div>
  );
}

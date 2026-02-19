import { DraggableOscillatorWindow } from '@/components/draggable/DraggableOscillatorWindow';
import { RSIPanel } from '@/components/indicators/oscillators/RSIPanel';
import { MACDPanel } from '@/components/indicators/oscillators/MACDPanel';
import { VolumePanel } from '@/components/indicators/oscillators/VolumePanel';
import type { OscillatorData } from '@/hooks/useOscillatorData';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PoppedOutOscillatorsProps {
  selectedOscillators: Set<string>;
  poppedOutOscillators: Set<string>;
  oscillatorData: OscillatorData;
  candles: CandleData[];
  onPopout: (id: string) => void;
  mainChartVisibleRange?: any;
}

const OSCILLATOR_CONFIG = [
  { id: 'rsi', title: 'RSI (14)', storageKey: 'oscillator-rsi', defaultPos: { x: 10, y: 80 } },
  { id: 'macd', title: 'MACD', storageKey: 'oscillator-macd', defaultPos: { x: 10, y: 220 } },
  { id: 'volume', title: 'Volume', storageKey: 'oscillator-volume', defaultPos: { x: 10, y: 360 } },
];

export function PoppedOutOscillators({
  selectedOscillators,
  poppedOutOscillators,
  oscillatorData,
  candles,
  onPopout,
  mainChartVisibleRange,
}: PoppedOutOscillatorsProps) {
  const renderOscillatorContent = (id: string) => {
    switch (id) {
      case 'rsi':
        return <RSIPanel data={oscillatorData.rsi} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />;
      case 'macd':
        return (
          <MACDPanel 
            macdData={oscillatorData.macd.macd}
            signalData={oscillatorData.macd.signal}
            histogramData={oscillatorData.macd.hist}
            fastPeriod={12}
            slowPeriod={26}
            signalPeriod={9}
            mainChartVisibleRange={mainChartVisibleRange}
          />
        );
      case 'volume':
        return <VolumePanel data={oscillatorData.volume} mainChartVisibleRange={mainChartVisibleRange} />;
      default:
        return null;
    }
  };

  return (
    <>
      {OSCILLATOR_CONFIG.map(({ id, title, storageKey, defaultPos }) => {
        if (!poppedOutOscillators.has(id) || !selectedOscillators.has(id)) return null;
        
        return (
          <DraggableOscillatorWindow
            key={id}
            title={title}
            storageKey={storageKey}
            initialPosition={defaultPos}
          >
            {renderOscillatorContent(id)}
          </DraggableOscillatorWindow>
        );
      })}
    </>
  );
}

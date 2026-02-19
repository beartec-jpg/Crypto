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
  { id: 'rsi', title: 'RSI (14)', storageKey: 'oscillator-rsi-position', defaultPos: { x: 100, y: 100 } },
  { id: 'macd', title: 'MACD (12, 26, 9)', storageKey: 'oscillator-macd-position', defaultPos: { x: 150, y: 150 } },
  { id: 'volume', title: 'Volume', storageKey: 'oscillator-volume-position', defaultPos: { x: 200, y: 200 } },
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
            height={200}
          >
            {renderOscillatorContent(id)}
          </DraggableOscillatorWindow>
        );
      })}
    </>
  );
}

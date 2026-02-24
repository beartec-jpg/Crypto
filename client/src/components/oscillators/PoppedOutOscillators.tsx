import { DraggableOscillatorWindow } from '@/components/draggable/DraggableOscillatorWindow';
import { RSIPanel } from '@/components/indicators/oscillators/RSIPanel';
import { MACDPanel } from '@/components/indicators/oscillators/MACDPanel';
import { VolumePanel } from '@/components/indicators/oscillators/VolumePanel';
import { StochasticPanel } from '@/components/indicators/oscillators/StochasticPanel';
import { WilliamsRPanel } from '@/components/indicators/oscillators/WilliamsRPanel';
import { CCIPanel } from '@/components/indicators/oscillators/CCIPanel';
import { ADXPanel } from '@/components/indicators/oscillators/ADXPanel';
import { OBVPanel } from '@/components/indicators/oscillators/OBVPanel';
import { MFIPanel } from '@/components/indicators/oscillators/MFIPanel';
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
  onCycleMode?: (id: string) => void;
  mainChartVisibleRange?: any;
}

const OSCILLATOR_CONFIG = [
  { id: 'rsi', title: 'RSI (14)', storageKey: 'oscillator-rsi', defaultPos: { x: 10, y: 80 } },
  { id: 'macd', title: 'MACD', storageKey: 'oscillator-macd', defaultPos: { x: 10, y: 220 } },
  { id: 'volume', title: 'Volume', storageKey: 'oscillator-volume', defaultPos: { x: 10, y: 360 } },
  { id: 'stochRsi', title: 'Stoch RSI (14,14,3,3)', storageKey: 'oscillator-stochrsi', defaultPos: { x: 10, y: 500 } },
  { id: 'williamsR', title: 'Williams %R (14)', storageKey: 'oscillator-williamsr', defaultPos: { x: 10, y: 640 } },
  { id: 'cci', title: 'CCI (20)', storageKey: 'oscillator-cci', defaultPos: { x: 220, y: 80 } },
  { id: 'adx', title: 'ADX (14)', storageKey: 'oscillator-adx', defaultPos: { x: 220, y: 220 } },
  { id: 'obv', title: 'OBV', storageKey: 'oscillator-obv', defaultPos: { x: 220, y: 360 } },
  { id: 'mfi', title: 'MFI (14)', storageKey: 'oscillator-mfi', defaultPos: { x: 220, y: 500 } },
];

export function PoppedOutOscillators({
  selectedOscillators,
  poppedOutOscillators,
  oscillatorData,
  candles,
  onPopout,
  onCycleMode,
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
      case 'stochRsi':
        return <StochasticPanel data={oscillatorData.stochRsi} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />;
      case 'williamsR':
        return <WilliamsRPanel data={oscillatorData.williamsR} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />;
      case 'cci':
        return <CCIPanel data={oscillatorData.cci} period={20} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />;
      case 'adx':
        return <ADXPanel data={oscillatorData.adx} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />;
      case 'obv':
        return <OBVPanel data={oscillatorData.obv} mainChartVisibleRange={mainChartVisibleRange} />;
      case 'mfi':
        return <MFIPanel data={oscillatorData.mfi} period={14} candles={candles} mainChartVisibleRange={mainChartVisibleRange} />;
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
            onTap={onCycleMode ? () => onCycleMode(id) : undefined}
          >
            {renderOscillatorContent(id)}
          </DraggableOscillatorWindow>
        );
      })}
    </>
  );
}

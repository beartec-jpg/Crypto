import { DockedOscillatorSection } from '@/components/oscillators/DockedOscillatorSection';
import { PoppedOutOscillators } from '@/components/oscillators/PoppedOutOscillators';
import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';
import type { SMCTrendEnginePanelData } from '@/components/trading/SMCTrendEngine/types';
import type { IChartApi } from 'lightweight-charts';

interface FullscreenOscillatorLayoutProps {
  selectedOscillators: Set<string>;
  poppedOutOscillators: Set<string>;
  miniOscillators: Set<string>;
  oscillatorData: OscillatorData;
  candles: any[];
  totalOscillatorHeight: number;
  onPopout: (id: string) => void;
  onCycleMode: (id: string) => void;
  totalPercentage: number;
  perOscillatorPercentage: number;
  mainChartVisibleRange: any;
  mainChart?: IChartApi | null;
  smartMoneyPanelData?: {
    scoringInput: ScoringInput | null;
    evaluation: SystemEvaluation | null;
  };
  smcTrendEnginePanelData?: SMCTrendEnginePanelData;
}

export function FullscreenOscillatorLayout({
  selectedOscillators,
  poppedOutOscillators,
  miniOscillators,
  oscillatorData,
  candles,
  totalOscillatorHeight,
  onPopout,
  onCycleMode,
  totalPercentage,
  perOscillatorPercentage,
  mainChartVisibleRange,
  mainChart,
  smartMoneyPanelData,
  smcTrendEnginePanelData,
}: FullscreenOscillatorLayoutProps) {
  return (
    <>
      <DockedOscillatorSection
        selectedOscillators={selectedOscillators}
        poppedOutOscillators={poppedOutOscillators}
        miniOscillators={miniOscillators}
        oscillatorData={oscillatorData}
        candles={candles}
        totalOscillatorHeight={totalOscillatorHeight}
        onPopout={onPopout}
        onCycleMode={onCycleMode}
        isFullscreen={true}
        usePercentage={true}
        totalPercentage={totalPercentage}
        perOscillatorPercentage={perOscillatorPercentage}
        mainChartVisibleRange={mainChartVisibleRange}
        mainChart={mainChart}
        smartMoneyPanelData={smartMoneyPanelData}
        smcTrendEnginePanelData={smcTrendEnginePanelData}
      />

      <PoppedOutOscillators
        selectedOscillators={selectedOscillators}
        poppedOutOscillators={poppedOutOscillators}
        oscillatorData={oscillatorData}
        candles={candles}
        onPopout={onPopout}
        onCycleMode={onCycleMode}
        mainChartVisibleRange={mainChartVisibleRange}
        smartMoneyPanelData={smartMoneyPanelData}
        smcTrendEnginePanelData={smcTrendEnginePanelData}
      />
    </>
  );
}

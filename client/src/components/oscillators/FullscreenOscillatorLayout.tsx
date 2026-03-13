import { DockedOscillatorSection } from '@/components/oscillators/DockedOscillatorSection';
import { PoppedOutOscillators } from '@/components/oscillators/PoppedOutOscillators';
import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';

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
  smartMoneyPanelData?: {
    scoringInput: ScoringInput | null;
    evaluation: SystemEvaluation | null;
  };
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
  smartMoneyPanelData,
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
        smartMoneyPanelData={smartMoneyPanelData}
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
      />
    </>
  );
}

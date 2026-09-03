import type { RefObject } from 'react';
import { MiniOscillatorSection } from '@/components/oscillators/MiniOscillatorSection';
import { HTFBiasPanel } from '@/components/indicators/HTFBiasPanel';
import { ChartLoadingOverlay } from '@/components/chart/ChartLoadingOverlay';
import { TOP_TOOLBAR_HEIGHT } from '@/lib/constants/layout';
import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';
import type { SMCTrendEnginePanelData } from '@/components/trading/SMCTrendEngine/types';
import { TideZoneHud } from '@/components/indicators/TideZoneHud';

interface FullscreenChartViewportLayerProps {
  miniOscillators: Set<string>;
  selectedOscillators?: Set<string>;
  oscillatorData: OscillatorData;
  onCycleMiniMode: (oscillatorId: string) => void;
  showHtfBiasPanel: boolean;
  htfBiasEntries: any[];
  isLoading: boolean;
  errorMessage: string | null;
  chartContainerRef: RefObject<HTMLDivElement>;
  chartPercentage: number;
  onChartBackgroundClick?: () => void;
  smartMoneyPanelData?: {
    scoringInput: ScoringInput | null;
    evaluation: SystemEvaluation | null;
  };
  smcTrendEnginePanelData?: SMCTrendEnginePanelData;
}

export function FullscreenChartViewportLayer({
  miniOscillators,
  selectedOscillators,
  oscillatorData,
  onCycleMiniMode,
  showHtfBiasPanel,
  htfBiasEntries,
  isLoading,
  errorMessage,
  chartContainerRef,
  chartPercentage,
  onChartBackgroundClick,
  smartMoneyPanelData,
  smcTrendEnginePanelData,
}: FullscreenChartViewportLayerProps) {
  return (
    <>
      <MiniOscillatorSection
        miniOscillators={miniOscillators}
        oscillatorData={oscillatorData}
        onCycleMode={onCycleMiniMode}
        smartMoneyPanelData={smartMoneyPanelData}
        smcTrendEnginePanelData={smcTrendEnginePanelData}
      />

      {showHtfBiasPanel && <HTFBiasPanel entries={htfBiasEntries} />}

      {selectedOscillators?.has('tideZone') && oscillatorData.tideZone.length > 0 && (
        <div className="absolute top-16 left-2 z-20 max-w-[calc(100%-5.5rem)]">
          <TideZoneHud
            last={oscillatorData.tideZone[oscillatorData.tideZone.length - 1]}
            absorb={oscillatorData.tideZone.slice(-3).some((d) => d.tell === 'absorb')}
            distro={oscillatorData.tideZone.slice(-3).some((d) => d.tell === 'distro')}
            reacc={oscillatorData.tideZone.slice(-3).some((d) => d.tell === 'reacc')}
          />
        </div>
      )}

      <ChartLoadingOverlay isLoading={isLoading} error={errorMessage} />

      <div
        ref={chartContainerRef}
        className="absolute inset-x-0 top-0 w-full"
        style={{
          height: `calc(${chartPercentage}vh - ${TOP_TOOLBAR_HEIGHT}px)`,
        }}
        onClick={onChartBackgroundClick}
      />
    </>
  );
}

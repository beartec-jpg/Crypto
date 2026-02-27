import type { RefObject } from 'react';
import { MiniOscillatorSection } from '@/components/oscillators/MiniOscillatorSection';
import { HTFBiasPanel } from '@/components/indicators/HTFBiasPanel';
import { ChartLoadingOverlay } from '@/components/chart/ChartLoadingOverlay';
import { TOP_TOOLBAR_HEIGHT } from '@/lib/constants/layout';
import type { OscillatorData } from '@/hooks/useOscillatorData';

interface FullscreenChartViewportLayerProps {
  miniOscillators: Set<string>;
  oscillatorData: OscillatorData;
  onCycleMiniMode: (oscillatorId: string) => void;
  showHtfBiasPanel: boolean;
  htfBiasEntries: any[];
  isLoading: boolean;
  errorMessage: string | null;
  chartContainerRef: RefObject<HTMLDivElement>;
  chartPercentage: number;
  onChartBackgroundClick?: () => void;
}

export function FullscreenChartViewportLayer({
  miniOscillators,
  oscillatorData,
  onCycleMiniMode,
  showHtfBiasPanel,
  htfBiasEntries,
  isLoading,
  errorMessage,
  chartContainerRef,
  chartPercentage,
  onChartBackgroundClick,
}: FullscreenChartViewportLayerProps) {
  return (
    <>
      <MiniOscillatorSection
        miniOscillators={miniOscillators}
        oscillatorData={oscillatorData}
        onCycleMode={onCycleMiniMode}
      />

      {showHtfBiasPanel && <HTFBiasPanel entries={htfBiasEntries} />}

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

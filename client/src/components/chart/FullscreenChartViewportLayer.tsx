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
import { emaTideScore, findTideDivZones } from '@/lib/indicators/tideZone';
import { useTideZoneSettings } from '@/hooks/useTideZoneSettings';

interface FullscreenChartViewportLayerProps {
  miniOscillators: Set<string>;
  selectedOscillators?: Set<string>;
  oscillatorData: OscillatorData;
  candles?: { time: number; low: number }[];
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
  candles = [],
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
  const { settings: tideSettings } = useTideZoneSettings();
  const tideEmaPeriod = tideSettings.emaPeriod;
  const tideEma = selectedOscillators?.has('tideZone')
    ? emaTideScore(oscillatorData.tideZone, tideEmaPeriod)
    : [];
  const tideEmaLast = tideEma.length ? tideEma[tideEma.length - 1].value : undefined;
  const tideDiv = selectedOscillators?.has('tideZone')
    ? findTideDivZones(candles, oscillatorData.tideZone, tideSettings)
    : [];
  const lastDiv = tideDiv.length ? tideDiv[tideDiv.length - 1] : null;
  const recentTimes = new Set(candles.slice(-4).map((c) => c.time));
  const divLive = Boolean(
    lastDiv && (lastDiv.status === 'forming' || recentTimes.has(lastDiv.t2)),
  );

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
            emaPeriod={tideEmaPeriod}
            emaValue={tideEmaLast}
            div={divLive}
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

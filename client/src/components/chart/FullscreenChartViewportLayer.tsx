import type { RefObject } from 'react';
import { MiniOscillatorSection } from '@/components/oscillators/MiniOscillatorSection';
import { HTFBiasPanel } from '@/components/indicators/HTFBiasPanel';
import { ChartLoadingOverlay } from '@/components/chart/ChartLoadingOverlay';
import { TOP_TOOLBAR_HEIGHT } from '@/lib/constants/layout';
import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';
import type { SMCTrendEnginePanelData } from '@/components/trading/SMCTrendEngine/types';
import { TideOffNote, TideZoneHud } from '@/components/indicators/TideZoneHud';
import { emaTideScore } from '@/lib/indicators/tideZone';
import type { TideV2Result } from '@/lib/indicators/tideSignals';
import { useTideZoneSettings } from '@/hooks/useTideZoneSettings';
import { summarizeTide } from '@/hooks/useTideV2';

interface FullscreenChartViewportLayerProps {
  miniOscillators: Set<string>;
  selectedOscillators?: Set<string>;
  oscillatorData: OscillatorData;
  candles?: { time: number; low: number }[];
  /** Point-in-time Tide v2 result for the main chart (null off 1h/4h). */
  tide?: TideV2Result | null;
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
  tide = null,
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
  const tideOn = Boolean(selectedOscillators?.has('tideZone'));
  const tideTf = oscillatorData.tideTimeframe;
  const tideEmaPeriod = tideTf ? tideSettings.byTimeframe[tideTf].emaPeriod : undefined;
  const tideEma = tideOn && tideEmaPeriod ? emaTideScore(oscillatorData.tideZone, tideEmaPeriod) : [];
  const tideEmaLast = tideEma.length ? tideEma[tideEma.length - 1].value : undefined;
  const tideStatus = tideOn ? summarizeTide(tide, candles) : undefined;

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

      {tideOn && tideTf && oscillatorData.tideZone.length > 0 && (
        <div className="absolute top-16 left-2 z-20 max-w-[calc(100%-5.5rem)]">
          <TideZoneHud
            last={oscillatorData.tideZone[oscillatorData.tideZone.length - 1]}
            timeframe={tideTf}
            status={tideStatus}
            absorb={oscillatorData.tideZone.slice(-3).some((d) => d.tell === 'absorb')}
            distro={oscillatorData.tideZone.slice(-3).some((d) => d.tell === 'distro')}
            reacc={oscillatorData.tideZone.slice(-3).some((d) => d.tell === 'reacc')}
            emaPeriod={tideEmaPeriod}
            emaValue={tideEmaLast}
          />
        </div>
      )}
      {tideOn && !tideTf && candles.length > 0 && (
        <div className="absolute top-16 left-2 z-20">
          <TideOffNote />
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

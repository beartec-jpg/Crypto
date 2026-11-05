// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { useMemo, type RefObject } from 'react';
import { MiniOscillatorSection } from '@/components/oscillators/MiniOscillatorSection';
import { HTFBiasPanel } from '@/components/indicators/HTFBiasPanel';
import { ChartLoadingOverlay } from '@/components/chart/ChartLoadingOverlay';
import { TOP_TOOLBAR_HEIGHT } from '@/lib/constants/layout';
import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';
import type { SMCTrendEnginePanelData } from '@/components/trading/SMCTrendEngine/types';
import { TideOffNote, TideZoneHud } from '@/components/indicators/TideZoneHud';
import { computeTideCross, freshTideCross } from '@/lib/indicators/tideSignals';
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
  const tideOn = Boolean(selectedOscillators?.has('tideZone'));
  const tideTf = oscillatorData.tideTimeframe;
  const tideCross = useMemo(
    () => (tideOn && tideTf && oscillatorData.tideZone.length ? computeTideCross(oscillatorData.tideZone, tideSettings) : null),
    [tideOn, tideTf, oscillatorData.tideZone, tideSettings],
  );
  const lastOf = (xs: { value: number }[]) => (xs.length ? xs[xs.length - 1].value : undefined);
  const shortLast = tideCross ? lastOf(tideCross.emaShort) : undefined;
  const longLast = tideCross ? lastOf(tideCross.emaLong) : undefined;
  const tideFresh = tideCross ? freshTideCross(tideCross.signals, oscillatorData.tideZone)?.kind ?? null : null;

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
            fresh={tideFresh}
            emaShort={shortLast != null ? { period: tideSettings.emaShort, value: shortLast } : undefined}
            emaLong={longLast != null ? { period: tideSettings.emaLong, value: longLast } : undefined}
            crossEma={tideSettings.crossEma}
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

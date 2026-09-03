import { RSIPanel } from '@/components/indicators/oscillators/RSIPanel';
import { MACDPanel } from '@/components/indicators/oscillators/MACDPanel';
import { VolumePanel } from '@/components/indicators/oscillators/VolumePanel';
import { StochasticPanel } from '@/components/indicators/oscillators/StochasticPanel';
import { WilliamsRPanel } from '@/components/indicators/oscillators/WilliamsRPanel';
import { CCIPanel } from '@/components/indicators/oscillators/CCIPanel';
import { ADXPanel } from '@/components/indicators/oscillators/ADXPanel';
import { OBVPanel } from '@/components/indicators/oscillators/OBVPanel';
import { MFIPanel } from '@/components/indicators/oscillators/MFIPanel';
import { WaddahExplosionPanel } from '@/components/indicators/oscillators/WaddahExplosionPanel';
import { CMFPanel } from '@/components/indicators/oscillators/CMFPanel';
import { TSIPanel } from '@/components/indicators/oscillators/TSIPanel';
import { KlingerPanel } from '@/components/indicators/oscillators/KlingerPanel';
import { TideZonePanel } from '@/components/indicators/oscillators/TideZonePanel';
import { SMCDebugTable } from '@/components/tradingSystems/SMCDebugTable';
import { SMCTrendEnginePanel } from '@/components/trading/SMCTrendEngine/SMCTrendEnginePanel';
import { OSCILLATOR_PANEL_HEIGHT_PER, MOBILE_NAV_HEIGHT, TOP_TOOLBAR_HEIGHT } from '@/lib/constants/layout';
import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';
import type { SMCTrendEnginePanelData } from '@/components/trading/SMCTrendEngine/types';

function getSmartMoneyScoreColor(score: number): string {
  if (score >= 60) return 'text-green-400';
  if (score >= 20) return 'text-lime-400';
  if (score > -20) return 'text-slate-300';
  if (score > -60) return 'text-orange-400';
  return 'text-red-400';
}

interface DockedOscillatorSectionProps {
  selectedOscillators: Set<string>;
  poppedOutOscillators: Set<string>;
  miniOscillators?: Set<string>;
  oscillatorData: OscillatorData;
  candles: { time: number }[];
  totalOscillatorHeight: number;
  onPopout: (oscillatorId: string) => void;
  onCycleMode?: (oscillatorId: string) => void;
  isFullscreen?: boolean;
  // NEW:
  usePercentage?: boolean;
  totalPercentage?: number;
  perOscillatorPercentage?: number;
  mainChartVisibleRange?: any;
  smartMoneyPanelData?: {
    scoringInput: ScoringInput | null;
    evaluation: SystemEvaluation | null;
  };
  smcTrendEnginePanelData?: SMCTrendEnginePanelData;
}

export function DockedOscillatorSection({
  selectedOscillators,
  poppedOutOscillators,
  miniOscillators,
  oscillatorData,
  candles,
  totalOscillatorHeight,
  onPopout,
  onCycleMode,
  isFullscreen = false,
  usePercentage = false,
  totalPercentage = 0,
  perOscillatorPercentage = 0,
  mainChartVisibleRange,
  smartMoneyPanelData,
  smcTrendEnginePanelData,
}: DockedOscillatorSectionProps) {
  const dockedOscillatorsCount = Array.from(selectedOscillators).filter(
    osc => !poppedOutOscillators.has(osc) && !miniOscillators?.has(osc)
  ).length;

  if (dockedOscillatorsCount === 0) return null;

  return (
    <div 
      className="fixed left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40" 
      style={{ 
        bottom: isFullscreen ? 0 : `${MOBILE_NAV_HEIGHT}px`,
        height: usePercentage ? `${totalPercentage}vh` : `${totalOscillatorHeight}px`,
        maxHeight: usePercentage 
          ? `${totalPercentage}vh`
          : `calc(100vh - ${isFullscreen ? 0 : MOBILE_NAV_HEIGHT}px - ${TOP_TOOLBAR_HEIGHT}px)`
      }}
    >
      <div className="bg-slate-900 overflow-y-auto h-full">
        {selectedOscillators.has('rsi') && !poppedOutOscillators.has('rsi') && !miniOscillators?.has('rsi') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('rsi')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>RSI (14)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <RSIPanel data={oscillatorData.rsi} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}
        
        {selectedOscillators.has('macd') && !poppedOutOscillators.has('macd') && !miniOscillators?.has('macd') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('macd')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>MACD (12, 26, 9)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <MACDPanel 
              macdData={oscillatorData.macd.macd}
              signalData={oscillatorData.macd.signal}
              histogramData={oscillatorData.macd.hist}
              fastPeriod={12}
              slowPeriod={26}
              signalPeriod={9}
              syncWithMainChart mainChartVisibleRange={mainChartVisibleRange}
            />
          </div>
        )}

        {selectedOscillators.has('waddah') && !poppedOutOscillators.has('waddah') && !miniOscillators?.has('waddah') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('waddah')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>Waddah Explosion</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <WaddahExplosionPanel
              histogramData={oscillatorData.waddah.histogram}
              explosionData={oscillatorData.waddah.explosion}
              syncWithMainChart mainChartVisibleRange={mainChartVisibleRange}
            />
          </div>
        )}

        {selectedOscillators.has('cmf') && !poppedOutOscillators.has('cmf') && !miniOscillators?.has('cmf') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('cmf')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>CMF (20)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <CMFPanel data={oscillatorData.cmf} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}
        
        {selectedOscillators.has('volume') && !poppedOutOscillators.has('volume') && !miniOscillators?.has('volume') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('volume')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>Volume</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <VolumePanel
              data={oscillatorData.volume}
              syncWithMainChart mainChartVisibleRange={mainChartVisibleRange}
            />
          </div>
        )}

        {selectedOscillators.has('stochRsi') && !poppedOutOscillators.has('stochRsi') && !miniOscillators?.has('stochRsi') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('stochRsi')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>Stoch RSI (14,14,3,3)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <StochasticPanel data={oscillatorData.stochRsi} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('tsi') && !poppedOutOscillators.has('tsi') && !miniOscillators?.has('tsi') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('tsi')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>TSI (25,13,7)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <TSIPanel
              tsiData={oscillatorData.tsi.tsi}
              signalData={oscillatorData.tsi.signal}
              syncWithMainChart mainChartVisibleRange={mainChartVisibleRange}
            />
          </div>
        )}

        {selectedOscillators.has('williamsR') && !poppedOutOscillators.has('williamsR') && !miniOscillators?.has('williamsR') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('williamsR')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>Williams %R (14)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <WilliamsRPanel data={oscillatorData.williamsR} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('cci') && !poppedOutOscillators.has('cci') && !miniOscillators?.has('cci') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('cci')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>CCI (20)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <CCIPanel data={oscillatorData.cci} period={20} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('adx') && !poppedOutOscillators.has('adx') && !miniOscillators?.has('adx') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('adx')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>ADX (14)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <ADXPanel data={oscillatorData.adx} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('obv') && !poppedOutOscillators.has('obv') && !miniOscillators?.has('obv') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('obv')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>OBV</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <OBVPanel data={oscillatorData.obv} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('mfi') && !poppedOutOscillators.has('mfi') && !miniOscillators?.has('mfi') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('mfi')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>MFI (14)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <MFIPanel data={oscillatorData.mfi} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />
          </div>
        )}

        {selectedOscillators.has('klinger') && !poppedOutOscillators.has('klinger') && !miniOscillators?.has('klinger') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('klinger')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>Klinger (34,55,13)</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <KlingerPanel
              klingerData={oscillatorData.klinger.klinger}
              signalData={oscillatorData.klinger.signal}
              syncWithMainChart mainChartVisibleRange={mainChartVisibleRange}
            />
          </div>
        )}

        {selectedOscillators.has('smartMoney') && !poppedOutOscillators.has('smartMoney') && !miniOscillators?.has('smartMoney') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('smartMoney')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>Smart Money Tracker</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <div className="h-full w-full overflow-y-auto rounded border border-slate-700 bg-slate-900/70 p-3">
              {!smartMoneyPanelData?.evaluation || !smartMoneyPanelData.scoringInput ? (
                <div className="text-xs text-slate-400">Waiting for SMC data...</div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-200">Smart Money Tracker</div>
                    <div className={`text-sm font-bold ${getSmartMoneyScoreColor(smartMoneyPanelData.evaluation.score ?? 0)}`}>
                      {(smartMoneyPanelData.evaluation.score ?? 0) > 0 ? '+' : ''}{(smartMoneyPanelData.evaluation.score ?? 0).toFixed(0)}
                    </div>
                  </div>

                  <div className="mb-2 h-2 overflow-hidden rounded bg-slate-800">
                    <div
                      className={`h-full transition-all ${(smartMoneyPanelData.evaluation.score ?? 0) >= 20 ? 'bg-green-500' : (smartMoneyPanelData.evaluation.score ?? 0) <= -20 ? 'bg-red-500' : 'bg-slate-500'}`}
                      style={{ width: `${Math.max(0, Math.min(100, ((smartMoneyPanelData.evaluation.score ?? 0) + 100) / 2))}%` }}
                    />
                  </div>

                  <div className="mb-3 text-[11px] text-slate-400">
                    {smartMoneyPanelData.evaluation.signalLabel} • Confidence {Math.round(smartMoneyPanelData.evaluation.confidence)}%
                  </div>

                  <div className="space-y-1">
                    {[...(smartMoneyPanelData.evaluation.conditions ?? [])]
                      .sort((a, b) => Math.abs((b.score ?? b.weightedScore ?? 0)) - Math.abs((a.score ?? a.weightedScore ?? 0)))
                      .slice(0, 5)
                      .map((condition, idx) => {
                        const conditionScore = condition.score ?? condition.weightedScore ?? 0;
                        const conditionColor = conditionScore === 0 ? 'text-slate-400' : conditionScore > 0 ? 'text-green-400' : 'text-red-400';
                        return (
                          <div key={`${condition.name}-${idx}`} className="flex items-center justify-between text-[11px]">
                            <span className="truncate pr-2 text-slate-300">{condition.name}</span>
                            <span className={`font-mono ${conditionColor}`}>
                              {conditionScore > 0 ? '+' : ''}{Math.round(conditionScore)}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  <SMCDebugTable
                    evaluation={smartMoneyPanelData.evaluation}
                    scoringInput={smartMoneyPanelData.scoringInput}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {selectedOscillators.has('tideZone') && !poppedOutOscillators.has('tideZone') && !miniOscillators?.has('tideZone') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2 flex flex-col">
            <div
              onClick={() => onCycleMode?.('tideZone')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none shrink-0"
            >
              <span>Tide Zone</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <div className="min-h-0 flex-1">
              <TideZonePanel data={oscillatorData.tideZone} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />
            </div>
          </div>
        )}

        {selectedOscillators.has('smcTrendEngine') && !poppedOutOscillators.has('smcTrendEngine') && !miniOscillators?.has('smcTrendEngine') && (
          <div style={{ height: usePercentage ? `${perOscillatorPercentage}vh` : `${OSCILLATOR_PANEL_HEIGHT_PER}px` }} className="p-2">
            <div
              onClick={() => onCycleMode?.('smcTrendEngine')}
              className="flex items-center text-xs text-slate-400 mb-1 cursor-pointer hover:text-slate-300 select-none"
            >
              <span>SMC Trend Engine</span>
              <span className="text-slate-600 ml-2">tap to cycle</span>
            </div>
            <div className="h-full w-full overflow-y-auto rounded border border-slate-700 bg-slate-900/70 p-3">
              <SMCTrendEnginePanel panelData={smcTrendEnginePanelData} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

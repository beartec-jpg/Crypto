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
import { WaddahExplosionPanel } from '@/components/indicators/oscillators/WaddahExplosionPanel';
import { CMFPanel } from '@/components/indicators/oscillators/CMFPanel';
import { TSIPanel } from '@/components/indicators/oscillators/TSIPanel';
import { KlingerPanel } from '@/components/indicators/oscillators/KlingerPanel';
import { SMCDebugTable } from '@/components/tradingSystems/SMCDebugTable';
import { SMCTrendEnginePanel } from '@/components/trading/SMCTrendEngine/SMCTrendEnginePanel';
import type { OscillatorData } from '@/hooks/useOscillatorData';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';
import type { SMCTrendEnginePanelData } from '@/components/trading/SMCTrendEngine/types';

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
  smartMoneyPanelData?: {
    scoringInput: ScoringInput | null;
    evaluation: SystemEvaluation | null;
  };
  smcTrendEnginePanelData?: SMCTrendEnginePanelData;
}

function getSmartMoneyScoreColor(score: number): string {
  if (score >= 60) return 'text-green-400';
  if (score >= 20) return 'text-lime-400';
  if (score > -20) return 'text-slate-300';
  if (score > -60) return 'text-orange-400';
  return 'text-red-400';
}

const OSCILLATOR_CONFIG = [
  { id: 'rsi', title: 'RSI (14)', storageKey: 'oscillator-rsi' },
  { id: 'macd', title: 'MACD', storageKey: 'oscillator-macd' },
  { id: 'waddah', title: 'Waddah Explosion', storageKey: 'oscillator-waddah' },
  { id: 'cmf', title: 'CMF (20)', storageKey: 'oscillator-cmf' },
  { id: 'volume', title: 'Volume', storageKey: 'oscillator-volume' },
  { id: 'stochRsi', title: 'Stoch RSI (14,14,3,3)', storageKey: 'oscillator-stochrsi' },
  { id: 'tsi', title: 'TSI (25,13,7)', storageKey: 'oscillator-tsi' },
  { id: 'williamsR', title: 'Williams %R (14)', storageKey: 'oscillator-williamsr' },
  { id: 'cci', title: 'CCI (20)', storageKey: 'oscillator-cci' },
  { id: 'adx', title: 'ADX (14)', storageKey: 'oscillator-adx' },
  { id: 'obv', title: 'OBV', storageKey: 'oscillator-obv' },
  { id: 'mfi', title: 'MFI (14)', storageKey: 'oscillator-mfi' },
  { id: 'klinger', title: 'Klinger (34,55,13)', storageKey: 'oscillator-klinger' },
  { id: 'smartMoney', title: 'Smart Money Tracker', storageKey: 'oscillator-smart-money' },
  { id: 'smcTrendEngine', title: 'SMC Trend Engine', storageKey: 'oscillator-smc-trend-engine' },
];

function getMiddleModePosition(index: number) {
  if (typeof window === 'undefined') return { x: 240, y: 120 };
  const width = 200;
  const x = Math.round((window.innerWidth - width) / 2) + (index % 4) * 22;
  const y = Math.round(window.innerHeight * 0.26) + Math.floor(index / 4) * 26;
  return { x, y };
}

export function PoppedOutOscillators({
  selectedOscillators,
  poppedOutOscillators,
  oscillatorData,
  candles,
  onPopout,
  onCycleMode,
  mainChartVisibleRange,
  smartMoneyPanelData,
  smcTrendEnginePanelData,
}: PoppedOutOscillatorsProps) {
  const renderOscillatorContent = (id: string) => {
    switch (id) {
      case 'rsi':
        return <RSIPanel data={oscillatorData.rsi} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />;
      case 'macd':
        return (
          <MACDPanel 
            macdData={oscillatorData.macd.macd}
            signalData={oscillatorData.macd.signal}
            histogramData={oscillatorData.macd.hist}
            fastPeriod={12}
            slowPeriod={26}
            signalPeriod={9}
            syncWithMainChart mainChartVisibleRange={mainChartVisibleRange}
          />
        );
      case 'waddah':
        return (
          <WaddahExplosionPanel
            histogramData={oscillatorData.waddah.histogram}
            explosionData={oscillatorData.waddah.explosion}
            syncWithMainChart mainChartVisibleRange={mainChartVisibleRange}
          />
        );
      case 'cmf':
        return <CMFPanel data={oscillatorData.cmf} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />;
      case 'volume':
        return <VolumePanel data={oscillatorData.volume} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />;
      case 'stochRsi':
        return <StochasticPanel data={oscillatorData.stochRsi} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />;
      case 'tsi':
        return (
          <TSIPanel
            tsiData={oscillatorData.tsi.tsi}
            signalData={oscillatorData.tsi.signal}
            syncWithMainChart mainChartVisibleRange={mainChartVisibleRange}
          />
        );
      case 'williamsR':
        return <WilliamsRPanel data={oscillatorData.williamsR} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />;
      case 'cci':
        return <CCIPanel data={oscillatorData.cci} period={20} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />;
      case 'adx':
        return <ADXPanel data={oscillatorData.adx} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />;
      case 'obv':
        return <OBVPanel data={oscillatorData.obv} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />;
      case 'mfi':
        return <MFIPanel data={oscillatorData.mfi} period={14} candles={candles} syncWithMainChart mainChartVisibleRange={mainChartVisibleRange} />;
      case 'klinger':
        return (
          <KlingerPanel
            klingerData={oscillatorData.klinger.klinger}
            signalData={oscillatorData.klinger.signal}
            syncWithMainChart mainChartVisibleRange={mainChartVisibleRange}
          />
        );
      case 'smartMoney':
        if (!smartMoneyPanelData?.evaluation || !smartMoneyPanelData.scoringInput) {
          return <div className="h-full w-full rounded border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-400">Waiting for SMC data...</div>;
        }

        return (
          <div className="h-full w-full overflow-y-auto rounded border border-slate-700 bg-slate-900/70 p-3">
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
          </div>
        );
      case 'smcTrendEngine':
        return (
          <div className="h-full w-full overflow-y-auto rounded border border-slate-700 bg-slate-900/70 p-3">
            <SMCTrendEnginePanel panelData={smcTrendEnginePanelData} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {OSCILLATOR_CONFIG.map(({ id, title, storageKey }, index) => {
        if (!poppedOutOscillators.has(id) || !selectedOscillators.has(id)) return null;
        
        return (
          <DraggableOscillatorWindow
            key={id}
            title={title}
            storageKey={storageKey}
            initialPosition={getMiddleModePosition(index)}
            onTap={onCycleMode ? () => onCycleMode(id) : undefined}
          >
            {renderOscillatorContent(id)}
          </DraggableOscillatorWindow>
        );
      })}
    </>
  );
}

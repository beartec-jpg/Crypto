import { OscillatorsPanel } from '@/components/indicators/OscillatorsPanel';
import { GenuineDemandScorePanel } from '@/components/indicators/GenuineDemandScorePanel';
import type { Candle, CVDDataItem } from '@/types/chart';
import type { GDSExternalMetrics } from '@/lib/indicators/genuineDemandScore';

interface IndicatorsSectionProps {
  candles: Candle[];
  cvdData: CVDDataItem[];
  externalMetrics?: GDSExternalMetrics;
  symbol?: string;
  showPatternBacktest?: boolean;
  activeOscillators?: string[];
  onActiveOscillatorsChange?: (oscillators: string[]) => void;
  /** False when watchlist is empty — patterns idle, oscillators not shown as live. */
  watchlistHasTickers?: boolean;
}

export function IndicatorsSection({
  candles,
  cvdData,
  externalMetrics,
  symbol,
  showPatternBacktest = true,
  activeOscillators,
  onActiveOscillatorsChange,
  watchlistHasTickers = true,
}: IndicatorsSectionProps) {
  const live = watchlistHasTickers;

  return (
    <>
      {/* Oscillators first, then multi-pattern underneath */}
      {live && candles.length > 0 && (activeOscillators?.length ?? 0) > 0 && (
        <div className="mt-2.5 bg-slate-900 border border-slate-700 rounded-lg p-4">
          <OscillatorsPanel
            candles={candles}
            activeOscillators={activeOscillators}
            onActiveOscillatorsChange={onActiveOscillatorsChange}
          />
        </div>
      )}

      {live && candles.length > 0 && (activeOscillators?.length ?? 0) === 0 && (
        <div className="mt-2.5 rounded-lg border border-dashed border-slate-700 bg-slate-900/60 px-4 py-6 text-center">
          <p className="text-sm text-slate-300">No oscillators selected</p>
          <p className="mt-1 text-xs text-slate-500">
            Use the Oscillators menu above to enable RSI, MACD, Tide Zone, or others.
          </p>
        </div>
      )}

      <div className="mt-2.5">
        <GenuineDemandScorePanel
          candles={live ? candles : []}
          cvdData={live ? cvdData : []}
          externalMetrics={live ? externalMetrics : undefined}
          symbol={symbol}
          showPatternBacktest={showPatternBacktest && live}
          isActive={live && candles.length > 0}
        />
      </div>
    </>
  );
}

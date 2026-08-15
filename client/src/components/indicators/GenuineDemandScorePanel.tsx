import type { Candle, CVDDataItem } from '@/types/chart';
import { useGenuineDemandScore } from '@/hooks/indicators/useGenuineDemandScore';
import type { GDSExternalMetrics } from '@/lib/indicators/genuineDemandScore';
import { PatternGrid } from '@/components/patterns/PatternGrid';
import { PatternBacktestPanel } from '@/components/patterns/PatternBacktestPanel';

interface GenuineDemandScorePanelProps {
  candles: Candle[];
  cvdData: CVDDataItem[];
  externalMetrics?: GDSExternalMetrics;
  symbol?: string;
  showPatternBacktest?: boolean;
  /** When false (empty watchlist), system is idle and does not look "live". */
  isActive?: boolean;
}

export function GenuineDemandScorePanel({
  candles,
  cvdData,
  externalMetrics,
  symbol,
  showPatternBacktest = true,
  isActive = true,
}: GenuineDemandScorePanelProps) {
  const { gds } = useGenuineDemandScore({
    candles: isActive ? candles : [],
    cvdData: isActive ? cvdData : [],
    externalMetrics: isActive ? externalMetrics : undefined,
  });

  return (
    <div
      className={`mt-6 bg-slate-900 border rounded-lg p-4 ${
        isActive ? 'border-slate-700' : 'border-slate-800 opacity-90'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-lg font-semibold text-white">🧩 Multi-Pattern Detection System</h4>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isActive
              ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-700/50'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
        >
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {!isActive ? (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-4 py-8 text-center">
          <p className="text-sm text-slate-300">Add a ticker to your watchlist to activate pattern detection.</p>
          <p className="mt-1 text-xs text-slate-500">
            The multi-pattern system stays idle until you have at least one symbol.
          </p>
        </div>
      ) : (
        <>
          <PatternGrid patterns={gds.patterns} />
          {showPatternBacktest && (
            <PatternBacktestPanel candles={candles} cvdData={cvdData} symbol={symbol} />
          )}
        </>
      )}
    </div>
  );
}

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
}

export function GenuineDemandScorePanel({
  candles,
  cvdData,
  externalMetrics,
  symbol,
  showPatternBacktest = true,
}: GenuineDemandScorePanelProps) {
  const { gds } = useGenuineDemandScore({
    candles,
    cvdData,
    externalMetrics,
  });

  return (
    <div className="mt-6 bg-slate-900 border border-slate-700 rounded-lg p-4">
      <div className="mb-3">
        <h4 className="text-lg font-semibold text-white">🧩 Multi-Pattern Detection System</h4>
      </div>

      <PatternGrid patterns={gds.patterns} />
      {showPatternBacktest && <PatternBacktestPanel candles={candles} cvdData={cvdData} symbol={symbol} />}
    </div>
  );
}

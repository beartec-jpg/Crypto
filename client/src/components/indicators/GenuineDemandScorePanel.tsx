import type { Candle, CVDDataItem } from '@/types/chart';
import { useGenuineDemandScore } from '@/hooks/indicators/useGenuineDemandScore';
import type { GDSExternalMetrics } from '@/lib/indicators/genuineDemandScore';
import { PatternGrid } from '@/components/patterns/PatternGrid';

interface GenuineDemandScorePanelProps {
  candles: Candle[];
  cvdData: CVDDataItem[];
  externalMetrics?: GDSExternalMetrics;
}

export function GenuineDemandScorePanel({ candles, cvdData, externalMetrics }: GenuineDemandScorePanelProps) {
  const { gds } = useGenuineDemandScore({
    candles,
    cvdData,
    externalMetrics,
  });

  return (
    <div className="mt-6 bg-slate-900 border border-slate-700 rounded-lg p-4">
      <div className="mb-3">
        <h4 className="text-lg font-semibold text-white">🧩 Multi-Pattern Detection System</h4>
        <p className="text-xs text-slate-400 mt-1">6 independent detectors · 48h rolling history · 10m cadence</p>
      </div>

      <PatternGrid patterns={gds.patterns} />
    </div>
  );
}

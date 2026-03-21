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
}

export function IndicatorsSection({
  candles,
  cvdData,
  externalMetrics,
  symbol,
  showPatternBacktest = true,
  activeOscillators,
  onActiveOscillatorsChange,
}: IndicatorsSectionProps) {
  return (
    <>
      {/* Genuine Demand Score Section */}
      {candles.length > 0 && (
        <GenuineDemandScorePanel
          candles={candles}
          cvdData={cvdData}
          externalMetrics={externalMetrics}
          symbol={symbol}
          showPatternBacktest={showPatternBacktest}
        />
      )}

      {/* Oscillators Section */}
      {candles.length > 0 && (
        <div className="mt-2.5 bg-slate-900 border border-slate-700 rounded-lg p-4">
          <OscillatorsPanel
            candles={candles}
            activeOscillators={activeOscillators}
            onActiveOscillatorsChange={onActiveOscillatorsChange}
          />
        </div>
      )}
    </>
  );
}

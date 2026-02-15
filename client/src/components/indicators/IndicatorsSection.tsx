import { OscillatorsPanel } from '@/components/indicators/OscillatorsPanel';
import { CVDTable } from '@/components/indicators/volume/CVDTable';
import type { Candle, CVDDataItem } from '@/types/chart';

interface IndicatorsSectionProps {
  candles: Candle[];
  cvdData: CVDDataItem[];
}

export function IndicatorsSection({ candles, cvdData }: IndicatorsSectionProps) {
  return (
    <>
      {/* Oscillators Section */}
      {candles.length > 0 && (
        <div className="mt-2.5 bg-slate-900 border border-slate-700 rounded-lg p-4">
          <OscillatorsPanel candles={candles} />
        </div>
      )}

      {/* CVD Table Section */}
      {cvdData.length > 0 && (
        <div className="mt-6 bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-semibold text-white">📈 Delta vs CVD</h4>
          </div>
          <CVDTable 
            data={cvdData}
            useMultiExchange={false}
            tableLimit={20}
          />
        </div>
      )}
    </>
  );
}

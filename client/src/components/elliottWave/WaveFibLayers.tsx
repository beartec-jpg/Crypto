import { PredictiveFibRenderer } from '@/components/elliottWave/PredictiveFibRenderer';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';

interface WaveFibLayersProps {
  activeTool: string | null;
  isActive: boolean;
  fibProjections: FibLevel[];
  invalidationLevels: FibLevel[];
  selectedWaveId: string | null;
  selectedWaveFibs: FibLevel[];
  futurePredictionLines: FibLevel[];
  chart: any;
  candleSeries: any;
}

export function WaveFibLayers({
  activeTool,
  isActive,
  fibProjections,
  invalidationLevels,
  selectedWaveId,
  selectedWaveFibs,
  futurePredictionLines,
  chart,
  candleSeries,
}: WaveFibLayersProps) {
  return (
    <>
      {activeTool === 'elliott_wave' && isActive && (
        <PredictiveFibRenderer
          chart={chart}
          candleSeries={candleSeries}
          fibLevels={fibProjections}
          isActive={isActive}
        />
      )}

      {activeTool === 'elliott_wave' && isActive && invalidationLevels.length > 0 && (
        <PredictiveFibRenderer
          chart={chart}
          candleSeries={candleSeries}
          fibLevels={invalidationLevels}
          isActive={isActive}
          color="#ef4444"
        />
      )}

      {selectedWaveId && selectedWaveFibs.length > 0 && (
        <PredictiveFibRenderer
          chart={chart}
          candleSeries={candleSeries}
          fibLevels={selectedWaveFibs}
          isActive={true}
          color="#facc15"
        />
      )}

      {futurePredictionLines.length > 0 && (
        <PredictiveFibRenderer
          chart={chart}
          candleSeries={candleSeries}
          fibLevels={futurePredictionLines}
          isActive={true}
          color="#a855f7"
        />
      )}
    </>
  );
}

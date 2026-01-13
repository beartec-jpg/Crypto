// src/utils/sandboxWaveIntegration.ts
import type { Candle } from './generateWaveEnsemble';
import { generateWaveEnsemble } from './generateWaveEnsemble';

export async function getEnsembleForSandbox(startPrice: number, totalBars: number) {
  const ensemble = await generateWaveEnsemble({
    template: 'impulse5',
    startPrice,
    totalBars,
    samples: 200,
    microTicksPerBar: 80,
    sizeStd: 0.12,
    timeStd: 0.15,
    seed: 42,
    roughness: 0.012,
  });
  return ensemble as { trials: Candle[][]; median: Candle[]; quantileHigh: number[]; quantileLow: number[] };
}

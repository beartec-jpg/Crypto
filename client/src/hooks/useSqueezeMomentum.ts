import { useMemo } from 'react';
import { CandleData } from '@/types/chart.types';
import { calculateSqueezeMomentum } from '@/lib/indicators/squeezeMomentum';
import { SqueezeMomentumSettings, SqueezeMomentumValue } from '@/types/squeezeMomentum';

export function useSqueezeMomentum(
  candles: CandleData[],
  settings: SqueezeMomentumSettings
): SqueezeMomentumValue[] {
  return useMemo(() => {
    if (!settings.enabled || candles.length === 0) return [];

    return calculateSqueezeMomentum(
      candles,
      settings.length,
      settings.mult,
      settings.lengthKC,
      settings.multKC
    );
  }, [candles, settings]);
}

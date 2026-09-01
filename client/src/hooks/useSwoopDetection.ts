import { useMemo } from 'react';
import { detectSwoop, type SwoopCandle, type SwoopVisibleRange } from '@/lib/indicators/swoop';
import type { SwoopResult, SwoopSettings } from '@/types/swoop';

export function useSwoopDetection(
  candles: SwoopCandle[],
  settings: SwoopSettings,
  visibleRange?: SwoopVisibleRange | null,
): SwoopResult {
  return useMemo(
    () => detectSwoop(candles, settings, visibleRange),
    [candles, settings, visibleRange],
  );
}

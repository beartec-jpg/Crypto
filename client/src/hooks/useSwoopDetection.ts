import { useMemo } from 'react';
import { detectSwoop, type SwoopCandle } from '@/lib/indicators/swoop';
import type { SwoopResult, SwoopSettings } from '@/types/swoop';

export function useSwoopDetection(candles: SwoopCandle[], settings: SwoopSettings): SwoopResult {
  return useMemo(() => detectSwoop(candles, settings), [candles, settings]);
}

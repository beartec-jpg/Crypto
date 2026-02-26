import { useMemo } from 'react';
import type { Candle } from '@/types/candle';
import type { OrderBlock } from '@/types/orderBlock';
import type { BreakerBlock, BreakerBlockSettings } from '@/types/breakerBlock';

interface UseBreakerBlockDetectionOptions {
  candles: Candle[];
  orderBlocks: OrderBlock[];
  settings: BreakerBlockSettings;
}

/**
 * Detect Breaker Blocks from existing Order Blocks.
 *
 * An OB becomes a Breaker Block when price closes cleanly on the opposite side
 * of the zone WITHOUT having first been mitigated (i.e. traded back inside the
 * zone before the break). The flipped type is the opposite of the original OB.
 *
 * - Bullish OB (demand zone) becomes a Bearish Breaker when price closes
 *   below the OB bottom without first trading inside the zone.
 * - Bearish OB (supply zone) becomes a Bullish Breaker when price closes
 *   above the OB top without first trading inside the zone.
 */
export function useBreakerBlockDetection({
  candles,
  orderBlocks,
  settings,
}: UseBreakerBlockDetectionOptions): BreakerBlock[] {
  return useMemo(() => {
    if (!settings.enabled || candles.length === 0 || orderBlocks.length === 0) return [];

    const totalCandles = candles.length;
    const result: BreakerBlock[] = [];

    for (const ob of orderBlocks) {
      // Only unmitigated OBs can flip into breaker blocks
      if (ob.mitigated) continue;

      const startIdx = candles.findIndex(c => c.time === ob.time);
      if (startIdx < 0) continue;

      let tradedInside = false;
      let breakTime: number | undefined;

      for (let i = startIdx + 1; i < candles.length; i++) {
        const c = candles[i];

        if (ob.type === 'bullish') {
          // Check if price traded inside the zone before the break
          if (!tradedInside && c.low < ob.top && c.high > ob.bottom) {
            tradedInside = true;
          }
          // Clean break below the zone
          if (!tradedInside && c.close < ob.bottom) {
            breakTime = c.time;
            break;
          }
        } else {
          // bearish OB
          // Check if price traded inside the zone before the break
          if (!tradedInside && c.low < ob.top && c.high > ob.bottom) {
            tradedInside = true;
          }
          // Clean break above the zone
          if (!tradedInside && c.close > ob.top) {
            breakTime = c.time;
            break;
          }
        }
      }

      if (breakTime === undefined) continue;

      // The breaker flips to the opposite type
      const bbType: 'bullish' | 'bearish' = ob.type === 'bullish' ? 'bearish' : 'bullish';

      const breakIdx = candles.findIndex(c => c.time === breakTime);
      const age = totalCandles - 1 - breakIdx;
      if (age > settings.maxAge) continue;

      // Track mitigation of the breaker itself
      let mitigated = false;
      let mitigationTime: number | undefined;

      for (let i = breakIdx + 1; i < candles.length; i++) {
        const c = candles[i];
        if (bbType === 'bullish') {
          // Bullish breaker is mitigated when price trades back inside
          if (c.low < ob.top && c.high > ob.bottom) {
            mitigated = true;
            mitigationTime = c.time;
            break;
          }
        } else {
          // Bearish breaker is mitigated when price trades back inside
          if (c.low < ob.top && c.high > ob.bottom) {
            mitigated = true;
            mitigationTime = c.time;
            break;
          }
        }
      }

      result.push({
        id: `bb-${ob.id}-${breakTime}`,
        type: bbType,
        top: ob.top,
        bottom: ob.bottom,
        obTime: ob.time,
        breakTime,
        sourceObId: ob.id,
        mitigated,
        mitigationTime,
        age,
      });
    }

    return result;
  }, [candles, orderBlocks, settings]);
}

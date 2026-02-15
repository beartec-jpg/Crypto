import type { Candle, CVDDataItem } from '@/types/chart';

const MOCK_DELTA_VOLUME_MULTIPLIER = 0.1; // 10% of volume as delta range

/**
 * Generate mock CVD data from candles for demonstration purposes.
 * TODO: Replace with actual CVD data source in production
 * 
 * @param candles - Array of candle data
 * @returns Array of CVD data items with cumulative delta
 */
export function generateMockCVDData(candles: Candle[]): CVDDataItem[] {
  let cumDelta = 0;

  return candles.map((candle) => {
    // Generate mock delta: random value between -10% and +10% of volume
    const delta = (Math.random() - 0.5) * candle.volume * MOCK_DELTA_VOLUME_MULTIPLIER;
    cumDelta += delta;

    return {
      time: new Date(candle.time * 1000).toLocaleTimeString(),
      timestamp: candle.time,
      delta,
      cumDelta,
      isBull: delta > 0,
      volume: candle.volume,
    };
  });
}

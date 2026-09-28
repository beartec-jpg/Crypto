import { calculateTideZone, type TideZoneCandle, type TideZoneOptions, type TideZonePoint } from '@/lib/indicators/tideZone';
import { resolveTideTimeframe, type TideTimeframe } from '@/lib/indicators/tideSignals';

/** Tide only runs on 1h and 4h charts. Any other interval gets no data (blank pane / HUD). */
export function calculateTideZoneForTimeframe(
  candles: TideZoneCandle[],
  timeframe: string | null | undefined,
  options: TideZoneOptions = {},
): { timeframe: TideTimeframe | null; data: TideZonePoint[] } {
  const tf = resolveTideTimeframe(timeframe, candles);
  if (!tf) return { timeframe: null, data: [] };
  return { timeframe: tf, data: calculateTideZone(candles, options) };
}

import { useMemo } from 'react';
import type { Candle } from '@/types/candle';
import type { PDZone, PDZoneSettings } from '@/types/liquidity';

interface UsePDZoneDetectionOptions {
  candles: Candle[];
  settings: PDZoneSettings;
}

interface RangeData {
  high: number;
  low: number;
  startTime: number;
}

/** Use the last N candles to build a swing range. */
function getSwingRange(candles: Candle[]): RangeData | null {
  if (candles.length < 20) return null;

  const lookback = Math.min(100, candles.length);
  const recent = candles.slice(-lookback);

  let high = -Infinity;
  let low = Infinity;
  let startTime = recent[0].time;

  for (const c of recent) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }

  return { high, low, startTime };
}

/** Use the previous calendar day's high/low (UTC). */
function getDayRange(candles: Candle[]): RangeData | null {
  if (candles.length < 2) return null;

  const lastTime = candles[candles.length - 1].time;
  const todayDate = new Date(lastTime * 1000);
  todayDate.setUTCHours(0, 0, 0, 0);
  const todayStart = todayDate.getTime() / 1000;
  const prevDayStart = todayStart - 86400;

  const prevDayCandles = candles.filter(c => c.time >= prevDayStart && c.time < todayStart);
  if (prevDayCandles.length === 0) return null;

  const high = Math.max(...prevDayCandles.map(c => c.high));
  const low = Math.min(...prevDayCandles.map(c => c.low));

  return { high, low, startTime: prevDayStart };
}

/** Use the previous calendar week's high/low (UTC, week starts Monday). */
function getWeekRange(candles: Candle[]): RangeData | null {
  if (candles.length < 2) return null;

  const lastTime = candles[candles.length - 1].time;
  const nowDate = new Date(lastTime * 1000);

  const dayOfWeek = nowDate.getUTCDay(); // 0=Sun … 6=Sat
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const thisWeekStart = new Date(nowDate);
  thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - daysToMonday);
  thisWeekStart.setUTCHours(0, 0, 0, 0);
  const thisWeekStartSecs = thisWeekStart.getTime() / 1000;
  const prevWeekStartSecs = thisWeekStartSecs - 7 * 86400;

  const prevWeekCandles = candles.filter(
    c => c.time >= prevWeekStartSecs && c.time < thisWeekStartSecs,
  );
  if (prevWeekCandles.length === 0) return null;

  const high = Math.max(...prevWeekCandles.map(c => c.high));
  const low = Math.min(...prevWeekCandles.map(c => c.low));

  return { high, low, startTime: prevWeekStartSecs };
}

/**
 * Detect one Premium/Discount zone based on the configured range source.
 * Returns an array so it fits the general "list of zones" pattern used elsewhere.
 */
export function usePDZoneDetection({
  candles,
  settings,
}: UsePDZoneDetectionOptions): PDZone[] {
  return useMemo(() => {
    if (!settings.enabled || candles.length < 2) return [];

    let rangeData: RangeData | null = null;

    switch (settings.rangeSource) {
      case 'swing':
        rangeData = getSwingRange(candles);
        break;
      case 'day':
        rangeData = getDayRange(candles);
        break;
      case 'week':
        rangeData = getWeekRange(candles);
        break;
    }

    if (!rangeData) return [];

    const { high, low, startTime } = rangeData;
    if (high <= low) return [];

    const equilibrium = (high + low) / 2;
    const endTime = candles[candles.length - 1].time;

    return [
      {
        id: `pd-${settings.rangeSource}-${startTime}`,
        rangeHigh: high,
        rangeLow: low,
        equilibrium,
        startTime,
        endTime,
        source: settings.rangeSource,
      },
    ];
  }, [candles, settings]);
}

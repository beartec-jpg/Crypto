import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Snaps a point to the high or low of the nearest candle
 */
export function snapToCandle(
  time: number,
  price: number,
  candles: CandleData[],
  snapType: 'high' | 'low' | 'none'
): { time: number; price: number; snapType: 'high' | 'low' | 'none' } {
  const candle = candles.find(c => c.time === time);
  
  if (!candle || snapType === 'none') {
    return { time, price, snapType: 'none' };
  }

  if (snapType === 'high') {
    return { time, price: candle.high, snapType: 'high' };
  }

  return { time, price: candle.low, snapType: 'low' };
}

/**
 * Gets the visible candles from the chart's current view
 */
export function getVisibleCandles(
  chart: IChartApi,
  candles: CandleData[]
): CandleData[] {
  const timeScale = chart.timeScale();
  const visibleRange = timeScale.getVisibleLogicalRange();
  
  if (!visibleRange) return candles;

  const from = Math.max(0, Math.floor(visibleRange.from));
  const to = Math.min(candles.length, Math.ceil(visibleRange.to));

  return candles.slice(from, to);
}

/**
 * Converts a price value to a Y coordinate on the chart (requires series)
 */
export function priceToCoordinate(
  series: ISeriesApi<any>,
  price: number
): number | null {
  try {
    return series.priceToCoordinate(price);
  } catch (error) {
    console.error('Failed to convert price to coordinate:', error);
    return null;
  }
}

/**
 * Converts a Y coordinate to a price value on the chart (requires series)
 */
export function coordinateToPrice(
  series: ISeriesApi<any>,
  coordinate: number
): number | null {
  try {
    return series.coordinateToPrice(coordinate);
  } catch (error) {
    console.error('Failed to convert coordinate to price:', error);
    return null;
  }
}

/**
 * Converts a timestamp to an X coordinate on the chart
 */
export function timeToCoordinate(
  chart: IChartApi,
  time: number
): number | null {
  try {
    return chart.timeScale().timeToCoordinate(time as any);
  } catch (error) {
    console.error('Failed to convert time to coordinate:', error);
    return null;
  }
}

/**
 * Converts an X coordinate to a timestamp on the chart
 */
export function coordinateToTime(
  chart: IChartApi,
  coordinate: number
): number | null {
  try {
    const time = chart.timeScale().coordinateToTime(coordinate);
    return time as number;
  } catch (error) {
    console.error('Failed to convert coordinate to time:', error);
    return null;
  }
}

/**
 * Gets the nearest candle to a given timestamp
 */
export function getNearestCandle(
  time: number,
  candles: CandleData[]
): CandleData | null {
  if (candles.length === 0) return null;

  let nearest = candles[0];
  let minDiff = Math.abs(candles[0].time - time);

  for (const candle of candles) {
    const diff = Math.abs(candle.time - time);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = candle;
    }
  }

  return nearest;
}

/**
 * Gets the visible time range from the chart
 */
export function getVisibleTimeRange(
  chart: IChartApi
): { from: number; to: number } | null {
  try {
    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleLogicalRange();
    
    if (!visibleRange) return null;

    // Convert logical range to time range
    const from = timeScale.coordinateToTime(visibleRange.from) as number;
    const to = timeScale.coordinateToTime(visibleRange.to) as number;

    return { from, to };
  } catch (error) {
    console.error('Failed to get visible time range:', error);
    return null;
  }
}

/**
 * Calculates the price range for the visible candles
 */
export function getVisiblePriceRange(
  chart: IChartApi,
  candles: CandleData[]
): { min: number; max: number } | null {
  const visibleCandles = getVisibleCandles(chart, candles);
  
  if (visibleCandles.length === 0) return null;

  let min = visibleCandles[0].low;
  let max = visibleCandles[0].high;

  for (const candle of visibleCandles) {
    if (candle.low < min) min = candle.low;
    if (candle.high > max) max = candle.high;
  }

  return { min, max };
}

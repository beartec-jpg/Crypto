/**
 * Zone helper utilities for trading indicators
 * Used to check candle positions relative to price zones/levels
 */

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Check if a candle touches a price zone (anywhere between lower and upper bounds)
 * @param candle The candle to check
 * @param lowerZone Lower bound of the zone
 * @param upperZone Upper bound of the zone
 * @returns true if candle's high >= lowerZone AND candle's low <= upperZone
 */
export function touchesZone(candle: CandleData, lowerZone: number, upperZone: number): boolean {
  return candle.high >= lowerZone && candle.low <= upperZone;
}

/**
 * Check if a candle is within a price zone (touches or overlaps)
 * Note: This checks if ANY PART of the candle is within the zone (same as touchesZone).
 * In the original code, both functions had identical logic for backwards compatibility
 * with existing trading strategies.
 * @param candle The candle to check
 * @param lowerZone Lower bound of the zone
 * @param upperZone Upper bound of the zone
 * @returns true if candle overlaps with the zone
 */
export function inZone(candle: CandleData, lowerZone: number, upperZone: number): boolean {
  return candle.high >= lowerZone && candle.low <= upperZone;
}

/**
 * Check if a candle is above a price zone
 * @param candle The candle to check
 * @param upperZone Upper bound of the zone
 * @returns true if candle's low is above the zone
 */
export function aboveZone(candle: CandleData, upperZone: number): boolean {
  return candle.low > upperZone;
}

/**
 * Check if a candle is below a price zone
 * @param candle The candle to check
 * @param lowerZone Lower bound of the zone
 * @returns true if candle's high is below the zone
 */
export function belowZone(candle: CandleData, lowerZone: number): boolean {
  return candle.high < lowerZone;
}

/**
 * Check if a price is within a range
 * @param price The price to check
 * @param lower Lower bound
 * @param upper Upper bound
 * @returns true if price is within the range
 */
export function priceInZone(price: number, lower: number, upper: number): boolean {
  return price >= lower && price <= upper;
}

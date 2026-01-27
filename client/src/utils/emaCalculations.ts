/**
 * EMA (Exponential Moving Average) calculation utilities
 * Extracted from CryptoIndicators.tsx for reusability
 */

/**
 * Calculate EMA (Exponential Moving Average) for a dataset
 * @param data Array of numbers to calculate EMA for
 * @param period EMA period
 * @returns Array of EMA values
 */
export function calculateEMA(data: number[], period: number): number[] {
  return data.reduce((acc, val, i) => 
    i === 0 ? [val] : [...acc, val * (2/(period+1)) + acc[i-1] * (1 - 2/(period+1))], 
    [] as number[]
  );
}

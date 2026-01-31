/**
 * Position sizing calculations
 * Extracted from CryptoIndicators.tsx for better modularity
 */

/**
 * Calculate position size based on account size, risk percentage, entry and stop loss
 */
export function calculatePositionSize(
  accountSize: number,
  riskPercent: number,
  entry: number,
  stopLoss: number
): number {
  const positionValue = accountSize * (riskPercent / 100);
  if (entry === 0) return 0;
  return positionValue / entry;
}

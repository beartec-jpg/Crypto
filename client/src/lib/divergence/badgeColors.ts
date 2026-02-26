/**
 * Badge color utilities for divergence confluence strength.
 * Re-exports the canonical implementation from divergenceCalculations.
 */
export { getDivergenceBadgeColor } from '@/lib/calculations/divergenceCalculations';

export function getDivergenceTextColor(_count: number): string {
  return 'text-white'; // All badges have white text
}

/** Shared wall-clock budget for one deep-dive model attempt pair. */
export const DEEP_DIVE_DEADLINE_MS = 270_000;
/**
 * Deep dives have no fallback model, so the primary may use most of the 270s
 * budget; the remaining ~20s covers the job/result writes.
 */
export const DEEP_DIVE_PRIMARY_TIMEOUT_CAP_MS = 250_000;
export const DEEP_DIVE_FALLBACK_SAFETY_MS = 5_000;
export const DEEP_DIVE_MIN_FALLBACK_REMAINING_MS = 10_000;

/** Timeout for the primary xAI call: min(cap, time left until the deadline). */
export function primaryCallTimeoutMs(deadlineAtMs: number, nowMs: number): number {
  const remaining = deadlineAtMs - nowMs;
  if (remaining <= 0) return 0;
  return Math.min(DEEP_DIVE_PRIMARY_TIMEOUT_CAP_MS, remaining);
}

/**
 * Timeout for the fallback call, measured when that call is about to start.
 * Returns null when fewer than 10s remain (skip the call). Otherwise the
 * timeout is the time left minus a 5s margin so the job can still be saved.
 */
export function fallbackCallTimeoutMs(deadlineAtMs: number, nowMs: number): number | null {
  const remaining = deadlineAtMs - nowMs;
  if (remaining < DEEP_DIVE_MIN_FALLBACK_REMAINING_MS) return null;
  return remaining - DEEP_DIVE_FALLBACK_SAFETY_MS;
}

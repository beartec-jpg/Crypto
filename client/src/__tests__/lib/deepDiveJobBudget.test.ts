import { describe, expect, it } from 'vitest';

import {
  DEEP_DIVE_DEADLINE_MS,
  DEEP_DIVE_FALLBACK_SAFETY_MS,
  DEEP_DIVE_PRIMARY_TIMEOUT_CAP_MS,
  fallbackCallTimeoutMs,
  primaryCallTimeoutMs,
} from '../../../../api/_lib/deepDiveJobBudget';

describe('deep dive xAI time budget', () => {
  const start = 1_000_000;
  const deadline = start + DEEP_DIVE_DEADLINE_MS;

  it('pins the shared deadline at 270s', () => {
    expect(DEEP_DIVE_DEADLINE_MS).toBe(270_000);
    expect(DEEP_DIVE_PRIMARY_TIMEOUT_CAP_MS).toBe(200_000);
    expect(DEEP_DIVE_FALLBACK_SAFETY_MS).toBe(5_000);
  });

  it('caps the primary call at 150s and never past the time remaining', () => {
    expect(primaryCallTimeoutMs(deadline, start)).toBe(200_000);
    expect(primaryCallTimeoutMs(deadline, start + 200_000)).toBe(70_000);
    expect(primaryCallTimeoutMs(deadline, deadline)).toBe(0);
    expect(primaryCallTimeoutMs(deadline, deadline + 5_000)).toBe(0);
  });

  it('gives fallback the time left minus a 5s margin', () => {
    const afterFullPrimary = start + 150_000;
    expect(fallbackCallTimeoutMs(deadline, afterFullPrimary)).toBe(115_000);
    expect(fallbackCallTimeoutMs(deadline, start + 1_000)).toBe(264_000);
  });

  it('skips fallback when fewer than 10s remain', () => {
    expect(fallbackCallTimeoutMs(deadline, deadline - 10_000)).toBe(5_000);
    expect(fallbackCallTimeoutMs(deadline, deadline - 9_999)).toBeNull();
    expect(fallbackCallTimeoutMs(deadline, deadline)).toBeNull();
  });
});

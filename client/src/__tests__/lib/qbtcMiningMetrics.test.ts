import { describe, expect, it } from 'vitest';
import { getLaneRoundMetrics, resolveLaneWorkerMetrics } from '@/lib/qbtcMiningMetrics';

describe('qbtcMiningMetrics', () => {
  it('sums lane contributor round metrics safely', () => {
    const metrics = getLaneRoundMetrics([
      { accepted_shares: 3, weighted_shares: 1.25, reward_estimate: 0.015, share_percent: 2.5 },
      { accepted_shares: 7, weighted_shares: 4.75, reward_estimate: 0.085, share_percent: 10.0 },
      { accepted_shares: Number.NaN, weighted_shares: Number.NaN, reward_estimate: Number.NaN, share_percent: Number.NaN },
    ]);

    expect(metrics.acceptedShares).toBe(10);
    expect(metrics.weightedShares).toBeCloseTo(6.0, 8);
    expect(metrics.rewardEstimate).toBeCloseTo(0.1, 8);
    expect(metrics.sharePercent).toBeCloseTo(12.5, 8);
  });

  it('uses worker list length fallback when tier counters are missing', () => {
    const metrics = resolveLaneWorkerMetrics(undefined, undefined, 4);
    expect(metrics).toEqual({ workerCount: 4, connectedMiners: 4 });
  });

  it('prefers tier counters when provided', () => {
    const metrics = resolveLaneWorkerMetrics(8, 5, 2);
    expect(metrics).toEqual({ workerCount: 8, connectedMiners: 5 });
  });
});

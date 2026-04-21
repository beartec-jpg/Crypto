export interface LaneRoundContributorLike {
  accepted_shares?: number;
  weighted_shares?: number;
  reward_estimate?: number;
  share_percent?: number;
}

function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getLaneRoundMetrics(contributors: LaneRoundContributorLike[]) {
  return contributors.reduce(
    (acc, contributor) => {
      acc.acceptedShares += toSafeNumber(contributor.accepted_shares);
      acc.weightedShares += toSafeNumber(contributor.weighted_shares);
      acc.rewardEstimate += toSafeNumber(contributor.reward_estimate);
      acc.sharePercent += toSafeNumber(contributor.share_percent);
      return acc;
    },
    {
      acceptedShares: 0,
      weightedShares: 0,
      rewardEstimate: 0,
      sharePercent: 0,
    },
  );
}

export function resolveLaneWorkerMetrics(
  workerCount: unknown,
  connectedMiners: unknown,
  fallbackWorkersLength: number,
) {
  const fallback = Math.max(0, Math.floor(toSafeNumber(fallbackWorkersLength)));
  const resolvedWorkerCount = Math.max(0, Math.floor(toSafeNumber(workerCount)));
  const resolvedConnected = Math.max(0, Math.floor(toSafeNumber(connectedMiners)));

  return {
    workerCount: resolvedWorkerCount || fallback,
    connectedMiners: resolvedConnected || resolvedWorkerCount || fallback,
  };
}

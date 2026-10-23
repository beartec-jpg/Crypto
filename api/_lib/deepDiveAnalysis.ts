/**
 * Deep-dive "full analysis" helpers. A deep dive must always return a real market read,
 * even when no trade clears the gates. The model returns `marketAnalysis`; trades it
 * proposed that fail our R/R or confluence gates are kept as `nearMissSetups` with the
 * reason, instead of silently disappearing.
 */
export type DeepDiveScenario = { direction: string; trigger: string; target: string; invalidation: string };

export type DeepDiveMarketAnalysis = {
  structure: string;
  liquidity: string;
  momentum: string;
  scenarios: DeepDiveScenario[];
  whatWouldCreateSetup: string;
};

export type NearMissSetup = {
  direction: string;
  entryZone: string;
  riskRewardRatio: number;
  confluenceCount: number;
  reason: string;
};

const str = (v: unknown, max = 800): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normaliseMarketAnalysis(raw: unknown): DeepDiveMarketAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const scenarios = (Array.isArray(r.scenarios) ? r.scenarios : [])
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map((s) => ({
      direction: str(s.direction, 40),
      trigger: str(s.trigger),
      target: str(s.target),
      invalidation: str(s.invalidation),
    }))
    .filter((s) => s.trigger || s.target)
    .slice(0, 4);
  const out: DeepDiveMarketAnalysis = {
    structure: str(r.structure),
    liquidity: str(r.liquidity),
    momentum: str(r.momentum),
    scenarios,
    whatWouldCreateSetup: str(r.whatWouldCreateSetup),
  };
  const hasContent = out.structure || out.liquidity || out.momentum || out.whatWouldCreateSetup || scenarios.length > 0;
  return hasContent ? out : null;
}

export function nearMissReason(
  rr: number,
  confluenceCount: number,
  minRiskReward: number,
  requiredConfluence: number,
): string | null {
  const reasons: string[] = [];
  if (!(rr >= minRiskReward)) reasons.push(`R/R ${(Number.isFinite(rr) ? rr : 0).toFixed(2)} below ${minRiskReward} to TP1`);
  if (!(confluenceCount >= requiredConfluence)) reasons.push(`${confluenceCount} confluence (needs ${requiredConfluence})`);
  return reasons.length ? reasons.join('; ') : null;
}

export function toNearMissSetup(trade: Record<string, any>, rr: number, reason: string): NearMissSetup {
  return {
    direction: str(trade.direction, 20) || 'Setup',
    entryZone: str(trade.triggerZone, 200) || str(trade.entryZone, 200) || str(String(trade.entry ?? ''), 60),
    riskRewardRatio: Number.isFinite(rr) ? parseFloat(rr.toFixed(2)) : 0,
    confluenceCount: Number(trade.confluenceCount ?? 0) || 0,
    reason,
  };
}

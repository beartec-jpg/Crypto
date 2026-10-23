import { getSection, type MultiTFInsights } from '@/lib/cryptoAiTradePlans';

export type DeepDiveAnalysisSection = { title: string; lines: string[] };

export type DeepDiveMarketAnalysisView = {
  structure?: string;
  liquidity?: string;
  momentum?: string;
  scenarios?: Array<{ direction?: string; trigger?: string; target?: string; invalidation?: string }>;
  whatWouldCreateSetup?: string;
};

export type DeepDiveNearMissView = { direction?: string; entryZone?: string; riskRewardRatio?: number; reason?: string };

export type DeepDiveResultLike = {
  multiTFInsights?: MultiTFInsights | null;
  marketAnalysis?: DeepDiveMarketAnalysisView | null;
  nearMissSetups?: DeepDiveNearMissView[] | null;
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Full deep-dive analysis as display sections. Always includes the per-timeframe reads
 * from multiTFInsights (present on every stored result, including older cache rows
 * without marketAnalysis), so a no-trade deep dive never renders as an empty card.
 */
export function buildDeepDiveAnalysisSections(
  data: DeepDiveResultLike | null | undefined,
  higherTimeframe: string,
  lowerTimeframe: string,
): DeepDiveAnalysisSection[] {
  if (!data) return [];
  const sections: DeepDiveAnalysisSection[] = [];
  for (const tf of [higherTimeframe, lowerTimeframe]) {
    const section = getSection(data.multiTFInsights, tf);
    const summary = text(section?.summary);
    if (!summary) continue;
    const bias = text(section?.bias);
    sections.push({ title: `${tf} read${bias ? ` (${bias})` : ''}`, lines: [summary] });
  }
  const ma = data.marketAnalysis;
  if (ma) {
    if (text(ma.structure)) sections.push({ title: 'Structure', lines: [text(ma.structure)] });
    if (text(ma.liquidity)) sections.push({ title: 'Liquidity & zones', lines: [text(ma.liquidity)] });
    if (text(ma.momentum)) sections.push({ title: 'Momentum', lines: [text(ma.momentum)] });
    const scenarios = (Array.isArray(ma.scenarios) ? ma.scenarios : [])
      .map((s) => {
        const parts = [
          text(s?.trigger) && `Trigger: ${text(s?.trigger)}`,
          text(s?.target) && `Target: ${text(s?.target)}`,
          text(s?.invalidation) && `Invalid: ${text(s?.invalidation)}`,
        ].filter(Boolean);
        return parts.length ? `${text(s?.direction) || 'Scenario'}: ${parts.join(' · ')}` : '';
      })
      .filter(Boolean);
    if (scenarios.length) sections.push({ title: 'Scenarios', lines: scenarios });
    if (text(ma.whatWouldCreateSetup)) sections.push({ title: 'What would create a setup', lines: [text(ma.whatWouldCreateSetup)] });
  }
  const misses = (Array.isArray(data.nearMissSetups) ? data.nearMissSetups : [])
    .map((m) => {
      const head = [text(m?.direction), text(m?.entryZone)].filter(Boolean).join(' ');
      const reason = text(m?.reason);
      return head || reason ? `${head || 'Setup'}${reason ? ` (rejected: ${reason})` : ''}` : '';
    })
    .filter(Boolean);
  if (misses.length) sections.push({ title: 'Setups considered but rejected', lines: misses });
  return sections;
}

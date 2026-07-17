export type AnalysisSection = {
  summary?: string;
  bias?: string;
  keyLevels?: string[];
};

export type MultiTFInsights = {
  overallSummary?: string;
  [key: string]: AnalysisSection | string | undefined;
};

export type HtfRelationship = 'with-trend' | 'counter-trend';

export type TradeIdea = {
  grade?: string;
  primaryTF?: string;
  direction?: 'LONG' | 'SHORT';
  entryZone?: string;
  triggerZone?: string;
  triggerCondition?: string;
  htfRelationship?: HtfRelationship;
  entry?: string | number;
  stopLoss?: string | number;
  targets?: Array<string | number>;
  riskRewardRatio?: number;
  confluenceSignals?: string[];
  reasoning?: string;
  slRationale?: string;
  tp1Rationale?: string;
  tp2Rationale?: string;
};

export function getSection(insights: MultiTFInsights | null | undefined, timeframe: string): AnalysisSection | null {
  if (!insights) return null;
  const section = insights[timeframe];
  return section && typeof section === 'object' ? (section as AnalysisSection) : null;
}

export function getOverallSummary(insights: MultiTFInsights | null | undefined): string {
  return typeof insights?.overallSummary === 'string' ? insights.overallSummary : '';
}

export function isPendingTradeIdea(trade: TradeIdea | null | undefined): boolean {
  return Boolean(trade?.triggerZone || trade?.triggerCondition);
}

export function getHtfRelationshipLabel(relationship?: HtfRelationship): string {
  if (relationship === 'counter-trend') return 'Counter-trend';
  return 'With-trend';
}

export function getHtfRelationshipBadgeVariant(relationship?: HtfRelationship): 'default' | 'secondary' {
  return relationship === 'counter-trend' ? 'secondary' : 'default';
}

export function collectWatchLevels(
  insights: MultiTFInsights | null | undefined,
  preferredFrames: string[] = [],
): string[] {
  if (!insights) return [];

  const orderedSections = [
    ...preferredFrames,
    ...Object.keys(insights).filter((key) => key !== 'overallSummary' && !preferredFrames.includes(key)),
  ];

  const levels: string[] = [];
  for (const sectionKey of orderedSections) {
    const section = getSection(insights, sectionKey);
    if (!section?.keyLevels?.length) continue;

    for (const level of section.keyLevels) {
      if (level && !levels.includes(level)) {
        levels.push(level);
      }
    }
  }

  return levels.slice(0, 6);
}

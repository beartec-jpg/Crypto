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
  /** Price between entry and TP1 that proves trade — then lift stop. */
  stopLiftTrigger?: string | number;
  /** New stop after lift (usually entry/BE or small lock-in). */
  stopLiftTo?: string | number;
  stopLiftRationale?: string;
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

/** Parse a price that may include $ / commas / text. */
export function parseTradePrice(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Percent move from entry to target in the trade direction.
 * LONG: (tp - entry) / entry * 100
 * SHORT: (entry - tp) / entry * 100
 */
export function targetMovePercent(
  entry: unknown,
  target: unknown,
  direction?: string | null,
): number | null {
  const e = parseTradePrice(entry);
  const t = parseTradePrice(target);
  if (e == null || t == null || e === 0) return null;
  const dir = String(direction || '').toUpperCase();
  if (dir === 'SHORT') return ((e - t) / e) * 100;
  return ((t - e) / e) * 100;
}

export function formatPercentMove(pct: number | null | undefined, digits = 2): string {
  if (pct == null || !Number.isFinite(pct)) return '';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

/** e.g. "64250 (+3.21%)" */
export function formatTargetWithPercent(
  entry: unknown,
  target: unknown,
  direction?: string | null,
): string {
  const price =
    target === undefined || target === null || target === ''
      ? '—'
      : String(target);
  const pct = targetMovePercent(entry, target, direction);
  const pctStr = formatPercentMove(pct);
  return pctStr ? `${price} (${pctStr})` : price;
}

export function formatTargetsWithPercent(
  entry: unknown,
  targets: Array<string | number> | null | undefined,
  direction?: string | null,
  separator = ' / ',
): string {
  if (!targets?.length) return '—';
  return targets.map((t) => formatTargetWithPercent(entry, t, direction)).join(separator);
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

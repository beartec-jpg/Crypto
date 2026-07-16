export const CRYPTO_AI_HIGHER_TIMEFRAMES = ['1w', '1d'] as const;
export const CRYPTO_AI_LOWER_TIMEFRAMES = ['1h', '15m'] as const;
export const CRYPTO_AI_TIMEFRAMES = ['1w', '1d', '1h', '15m'] as const;

export type CryptoAiHigherTimeframe = (typeof CRYPTO_AI_HIGHER_TIMEFRAMES)[number];
export type CryptoAiLowerTimeframe = (typeof CRYPTO_AI_LOWER_TIMEFRAMES)[number];
export type CryptoAiTimeframe = (typeof CRYPTO_AI_TIMEFRAMES)[number];

export const DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME: CryptoAiHigherTimeframe = '1d';
export const DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME: CryptoAiLowerTimeframe = '15m';

export const CRYPTO_AI_VALID_PAIRS = [
  ['1w', '1h'],
  ['1w', '15m'],
  ['1d', '1h'],
  ['1d', '15m'],
] as const satisfies readonly [CryptoAiHigherTimeframe, CryptoAiLowerTimeframe][];

export const CRYPTO_AI_PAIR_INTERVAL_SEPARATOR = '_';

export type CryptoAiSessionLabel = 'asia' | 'london' | 'new_york';

export type CryptoAiSessionSnapshot = {
  session: CryptoAiSessionLabel;
  label: string;
  generatedAt: string;
  higherTimeframe: CryptoAiHigherTimeframe;
  lowerTimeframe: CryptoAiLowerTimeframe;
  multiTFInsights: unknown;
  estimatedCost?: number;
  tokens?: {
    input?: number;
    output?: number;
  };
};

export const CRYPTO_AI_SESSION_DISPLAY_NAMES: Record<CryptoAiSessionLabel, string> = {
  asia: 'Asia',
  london: 'London',
  new_york: 'New York',
};

const CRYPTO_AI_SCHEDULE = [
  { hour: 23, minute: 0, session: 'asia' as const },
  { hour: 6, minute: 0, session: 'london' as const },
  { hour: 13, minute: 0, session: 'new_york' as const },
];

export function isCryptoAiHigherTimeframe(value: string): value is CryptoAiHigherTimeframe {
  return (CRYPTO_AI_HIGHER_TIMEFRAMES as readonly string[]).includes(value);
}

export function isCryptoAiLowerTimeframe(value: string): value is CryptoAiLowerTimeframe {
  return (CRYPTO_AI_LOWER_TIMEFRAMES as readonly string[]).includes(value);
}

export function isValidCryptoAiPair(
  higherTimeframe: string,
  lowerTimeframe: string,
): boolean {
  return CRYPTO_AI_VALID_PAIRS.some(
    ([higher, lower]) => higher === higherTimeframe && lower === lowerTimeframe,
  );
}

export function normalizeCryptoAiPair(
  higherTimeframe?: string | null,
  lowerTimeframe?: string | null,
): { higherTimeframe: CryptoAiHigherTimeframe; lowerTimeframe: CryptoAiLowerTimeframe } {
  if (
    higherTimeframe &&
    lowerTimeframe &&
    isCryptoAiHigherTimeframe(higherTimeframe) &&
    isCryptoAiLowerTimeframe(lowerTimeframe) &&
    isValidCryptoAiPair(higherTimeframe, lowerTimeframe)
  ) {
    return { higherTimeframe, lowerTimeframe };
  }

  return {
    higherTimeframe: DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME,
    lowerTimeframe: DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME,
  };
}

export function encodeCryptoAiPairInterval(
  higherTimeframe: CryptoAiHigherTimeframe,
  lowerTimeframe: CryptoAiLowerTimeframe,
): string {
  return `${higherTimeframe}${CRYPTO_AI_PAIR_INTERVAL_SEPARATOR}${lowerTimeframe}`;
}

export function getCryptoAiTimeframeMinutes(timeframe: string): number | null {
  const match = timeframe.trim().toLowerCase().match(/^(\d+)(m|h|d|w)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  switch (match[2]) {
    case 'm':
      return value;
    case 'h':
      return value * 60;
    case 'd':
      return value * 60 * 24;
    case 'w':
      return value * 60 * 24 * 7;
    default:
      return null;
  }
}

export function getCryptoAiDeepDiveTtlMinutes(lowerTimeframe: string): number {
  const timeframeMinutes = getCryptoAiTimeframeMinutes(lowerTimeframe)
    ?? getCryptoAiTimeframeMinutes(DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME)
    ?? 15;
  return timeframeMinutes * 2;
}

export function getCryptoAiCycleSession(now: Date = new Date()): CryptoAiSessionLabel {
  return getLatestCryptoAiScheduleRun(now).session;
}

export function getLatestCryptoAiScheduleRun(now: Date = new Date()): {
  session: CryptoAiSessionLabel;
  boundary: Date;
} {
  const candidates = CRYPTO_AI_SCHEDULE.map(({ hour, minute, session }) => {
    const boundary = new Date(now);
    boundary.setUTCHours(hour, minute, 0, 0);
    if (boundary.getTime() > now.getTime()) {
      boundary.setUTCDate(boundary.getUTCDate() - 1);
    }
    return { session, boundary };
  });

  return candidates.reduce((latest, candidate) =>
    candidate.boundary.getTime() > latest.boundary.getTime() ? candidate : latest,
  );
}

export function getSessionDisplayName(session: CryptoAiSessionLabel): string {
  return CRYPTO_AI_SESSION_DISPLAY_NAMES[session];
}

export function isCryptoAiCacheFresh(updatedAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!updatedAt) return false;
  const updatedDate = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) return false;
  const { boundary } = getLatestCryptoAiScheduleRun(now);
  return updatedDate.getTime() >= boundary.getTime();
}

export function isCryptoAiDeepDiveCacheFresh(
  updatedAt: string | Date | null | undefined,
  lowerTimeframe: string,
  now: Date = new Date(),
): boolean {
  if (!updatedAt) return false;
  const updatedDate = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) return false;

  const ageMs = now.getTime() - updatedDate.getTime();
  return ageMs >= 0 && ageMs <= getCryptoAiDeepDiveTtlMinutes(lowerTimeframe) * 60_000;
}

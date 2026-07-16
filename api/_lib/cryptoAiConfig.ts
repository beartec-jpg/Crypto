export const CRYPTO_AI_HIGHER_TIMEFRAMES = ['1w', '1d'] as const;
export const CRYPTO_AI_LOWER_TIMEFRAMES = ['1h', '15m'] as const;
export const DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME = '1d' as const;
export const DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME = '15m' as const;

export type CryptoAiHigherTimeframe = (typeof CRYPTO_AI_HIGHER_TIMEFRAMES)[number];
export type CryptoAiLowerTimeframe = (typeof CRYPTO_AI_LOWER_TIMEFRAMES)[number];
export type CryptoAiSessionLabel = 'asia' | 'london' | 'new_york';

export const CRYPTO_AI_SESSION_DISPLAY_NAMES: Record<CryptoAiSessionLabel, string> = {
  asia: 'Asia',
  london: 'London',
  new_york: 'New York',
};

const CRYPTO_AI_VALID_PAIRS = [
  ['1w', '1h'],
  ['1w', '15m'],
  ['1d', '1h'],
  ['1d', '15m'],
] as const satisfies readonly [CryptoAiHigherTimeframe, CryptoAiLowerTimeframe][];

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

export function isValidCryptoAiPair(higherTimeframe: string, lowerTimeframe: string): boolean {
  return CRYPTO_AI_VALID_PAIRS.some(([higher, lower]) => higher === higherTimeframe && lower === lowerTimeframe);
}

export function normalizeCryptoAiPair(higherTimeframe?: string | null, lowerTimeframe?: string | null) {
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

export function encodeCryptoAiPairInterval(higherTimeframe: CryptoAiHigherTimeframe, lowerTimeframe: CryptoAiLowerTimeframe): string {
  return `${higherTimeframe}_${lowerTimeframe}`;
}

export function getLatestCryptoAiScheduleRun(now: Date = new Date()): { session: CryptoAiSessionLabel; boundary: Date } {
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

export function getCryptoAiCycleSession(now: Date = new Date()): CryptoAiSessionLabel {
  return getLatestCryptoAiScheduleRun(now).session;
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

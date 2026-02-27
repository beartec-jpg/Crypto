/**
 * Session Separators - Calculate Asian/London/NY session opens
 * Useful for spotting liquidity patterns around major market openings
 */

export interface SessionSeparator {
  time: number;
  label: string;
  session: 'asian' | 'london' | 'ny';
}

/**
 * Session open times (UTC):
 * - Asian (Tokyo): 00:00 UTC
 * - London: 08:00 UTC
 * - New York: 13:00 UTC
 */
const SESSION_TIMES_UTC = {
  asian: 0,    // 00:00 UTC
  london: 8,   // 08:00 UTC
  ny: 13,      // 13:00 UTC
};

/**
 * Detect session separator times within the given candle data
 * @param candles Array of candles with time property (unix timestamp in seconds)
 * @param showAsian Whether to include Asian session opens
 * @param showLondon Whether to include London session opens
 * @param showNY Whether to include NY session opens
 * @returns Array of session separator objects
 */
export function calculateSessionSeparators(
  candles: { time: number }[],
  showAsian: boolean = true,
  showLondon: boolean = true,
  showNY: boolean = true
): SessionSeparator[] {
  if (candles.length === 0) return [];

  const separators: SessionSeparator[] = [];
  const seenDays = new Set<string>();

  for (const candle of candles) {
    const date = new Date(candle.time * 1000); // Convert to milliseconds
    const hour = date.getUTCHours();
    const dayKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;

    // Asian Session (00:00 UTC)
    if (showAsian && hour === SESSION_TIMES_UTC.asian) {
      const sessionKey = `${dayKey}-asian`;
      if (!seenDays.has(sessionKey)) {
        separators.push({
          time: candle.time,
          label: 'Asian',
          session: 'asian',
        });
        seenDays.add(sessionKey);
      }
    }

    // London Session (08:00 UTC)
    if (showLondon && hour === SESSION_TIMES_UTC.london) {
      const sessionKey = `${dayKey}-london`;
      if (!seenDays.has(sessionKey)) {
        separators.push({
          time: candle.time,
          label: 'London',
          session: 'london',
        });
        seenDays.add(sessionKey);
      }
    }

    // New York Session (13:00 UTC)
    if (showNY && hour === SESSION_TIMES_UTC.ny) {
      const sessionKey = `${dayKey}-ny`;
      if (!seenDays.has(sessionKey)) {
        separators.push({
          time: candle.time,
          label: 'NY',
          session: 'ny',
        });
        seenDays.add(sessionKey);
      }
    }
  }

  return separators;
}

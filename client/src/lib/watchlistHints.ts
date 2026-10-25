/**
 * Pure helpers for /cryptoindicators onboarding hints (watchlist + chart coachmark).
 * Kept framework-free so they can be unit tested.
 */

export const WATCHLIST_TAP_HINT = 'Tap a ticker to load its chart and indicators below';

export interface PatternPanelIdleCopy {
  title: string;
  detail: string;
}

/** Copy for the inactive Multi-Pattern Detection panel. */
export function patternPanelIdleCopy(
  watchlistHasTickers: boolean,
  hasSelectedTicker: boolean,
): PatternPanelIdleCopy {
  if (!watchlistHasTickers) {
    return {
      title: 'Add a ticker to your watchlist to activate pattern detection.',
      detail: 'The multi-pattern system stays idle until you have at least one symbol.',
    };
  }
  if (!hasSelectedTicker) {
    return {
      title: 'Tap a ticker in your watchlist to activate pattern detection.',
      detail: 'Pick a symbol above to load its chart, indicators and patterns.',
    };
  }
  return {
    title: 'Loading chart data for pattern detection…',
    detail: 'Patterns appear once candles for the selected ticker have loaded.',
  };
}

// ----- Fullscreen chart coachmark -----

export const COACHMARK_COUNT_KEY = 'beartec:chartExpandCoachmark:count';
export const COACHMARK_SESSION_KEY = 'beartec:chartExpandCoachmark:shown';
export const COACHMARK_MAX_SHOWS = 3;
export const COACHMARK_DURATION_MS = 3500;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = window[kind];
    return s ?? null;
  } catch {
    return null;
  }
}

function safeGet(s: StorageLike | null, key: string): string | null {
  try {
    return s ? s.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(s: StorageLike | null, key: string, value: string): void {
  try {
    s?.setItem(key, value);
  } catch {
    /* storage full / blocked: ignore */
  }
}

/** Whether the coachmark should be shown now. Missing storage => don't show (avoid nagging). */
export function shouldShowCoachmark(
  local: StorageLike | null = safeStorage('localStorage'),
  session: StorageLike | null = safeStorage('sessionStorage'),
): boolean {
  if (!local || !session) return false;
  if (safeGet(session, COACHMARK_SESSION_KEY) === '1') return false;
  const count = Number.parseInt(safeGet(local, COACHMARK_COUNT_KEY) ?? '0', 10);
  return !(Number.isFinite(count) && count >= COACHMARK_MAX_SHOWS);
}

/** Record one showing (per-session flag + lifetime counter). */
export function recordCoachmarkShown(
  local: StorageLike | null = safeStorage('localStorage'),
  session: StorageLike | null = safeStorage('sessionStorage'),
): void {
  const raw = Number.parseInt(safeGet(local, COACHMARK_COUNT_KEY) ?? '0', 10);
  const count = Number.isFinite(raw) && raw > 0 ? raw : 0;
  safeSet(local, COACHMARK_COUNT_KEY, String(count + 1));
  safeSet(session, COACHMARK_SESSION_KEY, '1');
}

export const DEEP_DIVE_POLL_INTERVAL_MS = 3_000;
export const DEEP_DIVE_CLIENT_CAP_MS = 6 * 60 * 1000;
export const DEEP_DIVE_CONNECTION_LOST_MESSAGE = 'Connection lost; still working, tap to check';
export const DEEP_DIVE_STILL_WORKING_MESSAGE = 'Still working, tap to check';

const STORAGE_PREFIX = 'cryptoai-deep-job';

export type DeepDiveJobKeyInput = {
  ticker: string;
  mode: string;
  horizon: string;
  higherTimeframe: string;
  lowerTimeframe: string;
};

export type SavedDeepDiveJob = {
  jobId: string;
  startedAt: number;
};

export function deepDiveJobStorageKey(input: DeepDiveJobKeyInput): string {
  return [
    STORAGE_PREFIX,
    input.ticker,
    input.mode,
    input.horizon,
    input.higherTimeframe,
    input.lowerTimeframe,
  ].join('|');
}

export function isDeepDiveClientCapReached(startedAtMs: number, nowMs: number): boolean {
  return nowMs - startedAtMs >= DEEP_DIVE_CLIENT_CAP_MS;
}

export function isDeepDiveConnectionLostError(error: unknown): boolean {
  if (typeof TypeError !== 'undefined' && error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message === 'Failed to fetch' || message.includes('Failed to fetch');
}

export function mapDeepDiveClientError(error: unknown, fallback = 'Deep-dive trade search failed.'): string {
  if (isDeepDiveConnectionLostError(error)) return DEEP_DIVE_CONNECTION_LOST_MESSAGE;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export function isResumableDeepDiveError(message: string): boolean {
  return message === DEEP_DIVE_CONNECTION_LOST_MESSAGE || message === DEEP_DIVE_STILL_WORKING_MESSAGE;
}

export function readSavedDeepDiveJob(key: string): SavedDeepDiveJob | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedDeepDiveJob>;
    if (!parsed || typeof parsed.jobId !== 'string' || !parsed.jobId) return null;
    if (typeof parsed.startedAt !== 'number' || !Number.isFinite(parsed.startedAt)) return null;
    return { jobId: parsed.jobId, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

export function writeSavedDeepDiveJob(key: string, job: SavedDeepDiveJob): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify({ jobId: job.jobId, startedAt: job.startedAt }));
  } catch {
    // Private mode / quota — polling can still continue in memory.
  }
}

export function clearSavedDeepDiveJob(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

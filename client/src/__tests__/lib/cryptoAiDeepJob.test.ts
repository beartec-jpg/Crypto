import { afterEach, describe, expect, it } from 'vitest';

import {
  DEEP_DIVE_CLIENT_CAP_MS,
  DEEP_DIVE_CONNECTION_LOST_MESSAGE,
  DEEP_DIVE_STILL_WORKING_MESSAGE,
  clearSavedDeepDiveJob,
  deepDiveJobStorageKey,
  isDeepDiveClientCapReached,
  isDeepDiveConnectionLostError,
  isResumableDeepDiveError,
  mapDeepDiveClientError,
  readSavedDeepDiveJob,
  writeSavedDeepDiveJob,
} from '@/lib/cryptoAiDeepJob';

const keyInput = {
  ticker: 'BTCUSDT',
  mode: 'smc',
  horizon: 'intraday',
  higherTimeframe: '1d',
  lowerTimeframe: '15m',
};

describe('crypto AI deep-dive job client helpers', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('keys saved jobs by ticker, mode, horizon, and both timeframes', () => {
    const key = deepDiveJobStorageKey(keyInput);
    expect(key).toContain('BTCUSDT');
    expect(key).toContain('smc');
    expect(key).toContain('intraday');
    expect(key).toContain('1d');
    expect(key).toContain('15m');
    expect(deepDiveJobStorageKey({ ...keyInput, horizon: 'swing' })).not.toBe(key);
    expect(deepDiveJobStorageKey({ ...keyInput, mode: 'indicator' })).not.toBe(key);
    expect(deepDiveJobStorageKey({ ...keyInput, lowerTimeframe: '5m' })).not.toBe(key);
  });

  it('round-trips a saved job and clears it', () => {
    const key = deepDiveJobStorageKey(keyInput);
    expect(readSavedDeepDiveJob(key)).toBeNull();
    writeSavedDeepDiveJob(key, { jobId: 'job-1', startedAt: 50 });
    expect(readSavedDeepDiveJob(key)).toEqual({ jobId: 'job-1', startedAt: 50 });
    clearSavedDeepDiveJob(key);
    expect(readSavedDeepDiveJob(key)).toBeNull();
  });

  it('ignores corrupt or incomplete storage values', () => {
    const key = deepDiveJobStorageKey(keyInput);
    localStorage.setItem(key, '{not json');
    expect(readSavedDeepDiveJob(key)).toBeNull();
    localStorage.setItem(key, JSON.stringify({ startedAt: 1 }));
    expect(readSavedDeepDiveJob(key)).toBeNull();
    localStorage.setItem(key, JSON.stringify({ jobId: 'x', startedAt: 'soon' }));
    expect(readSavedDeepDiveJob(key)).toBeNull();
  });

  it('maps network failures to the connection-lost message', () => {
    expect(mapDeepDiveClientError(new TypeError('Failed to fetch'))).toBe(DEEP_DIVE_CONNECTION_LOST_MESSAGE);
    expect(mapDeepDiveClientError(new TypeError('Load failed'))).toBe(DEEP_DIVE_CONNECTION_LOST_MESSAGE);
    expect(mapDeepDiveClientError(new Error('Failed to fetch'))).toBe(DEEP_DIVE_CONNECTION_LOST_MESSAGE);
    expect(isDeepDiveConnectionLostError(new Error('TypeError: Failed to fetch'))).toBe(true);
    expect(mapDeepDiveClientError(new Error('402: no credits'))).toBe('402: no credits');
    expect(mapDeepDiveClientError('nope')).toBe('nope');
    expect(mapDeepDiveClientError(null)).toBe('Deep-dive trade search failed.');
  });

  it('treats connection-lost and still-working copy as resumable', () => {
    expect(isResumableDeepDiveError(DEEP_DIVE_CONNECTION_LOST_MESSAGE)).toBe(true);
    expect(isResumableDeepDiveError(DEEP_DIVE_STILL_WORKING_MESSAGE)).toBe(true);
    expect(isResumableDeepDiveError('402: no credits')).toBe(false);
  });

  it('caps client polling at about 6 minutes from the job start', () => {
    expect(DEEP_DIVE_CLIENT_CAP_MS).toBe(360_000);
    const started = 10_000;
    expect(isDeepDiveClientCapReached(started, started + DEEP_DIVE_CLIENT_CAP_MS - 1)).toBe(false);
    expect(isDeepDiveClientCapReached(started, started + DEEP_DIVE_CLIENT_CAP_MS)).toBe(true);
  });
});

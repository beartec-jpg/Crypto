import { describe, it, expect } from 'vitest';
import {
  patternPanelIdleCopy,
  shouldShowCoachmark,
  recordCoachmarkShown,
  COACHMARK_COUNT_KEY,
  COACHMARK_SESSION_KEY,
  COACHMARK_MAX_SHOWS,
} from '@/lib/watchlistHints';

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('patternPanelIdleCopy', () => {
  it('keeps add-ticker copy for an empty watchlist', () => {
    expect(patternPanelIdleCopy(false, false).title).toMatch(/^Add a ticker/);
  });
  it('asks to tap a ticker when tickers exist but none selected', () => {
    expect(patternPanelIdleCopy(true, false).title).toMatch(/^Tap a ticker in your watchlist/);
  });
  it('shows loading copy when a ticker is selected', () => {
    expect(patternPanelIdleCopy(true, true).title).toMatch(/Loading/);
  });
});

describe('coachmark storage', () => {
  it('shows once per session', () => {
    const l = mem(), s = mem();
    expect(shouldShowCoachmark(l, s)).toBe(true);
    recordCoachmarkShown(l, s);
    expect(s.m.get(COACHMARK_SESSION_KEY)).toBe('1');
    expect(shouldShowCoachmark(l, s)).toBe(false);
  });
  it('caps at max shows across sessions', () => {
    const l = mem();
    for (let i = 0; i < COACHMARK_MAX_SHOWS; i++) {
      const s = mem();
      expect(shouldShowCoachmark(l, s)).toBe(true);
      recordCoachmarkShown(l, s);
    }
    expect(l.m.get(COACHMARK_COUNT_KEY)).toBe(String(COACHMARK_MAX_SHOWS));
    expect(shouldShowCoachmark(l, mem())).toBe(false);
  });
  it('treats garbage counter as zero', () => {
    const l = mem(); l.setItem(COACHMARK_COUNT_KEY, 'abc');
    expect(shouldShowCoachmark(l, mem())).toBe(true);
    recordCoachmarkShown(l, mem());
    expect(l.m.get(COACHMARK_COUNT_KEY)).toBe('1');
  });
  it('does not show and does not throw without storage', () => {
    expect(shouldShowCoachmark(null, null)).toBe(false);
    expect(() => recordCoachmarkShown(null, null)).not.toThrow();
    const throwing = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(() => shouldShowCoachmark(throwing, throwing)).not.toThrow();
    expect(() => recordCoachmarkShown(throwing, throwing)).not.toThrow();
  });
});

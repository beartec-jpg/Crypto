import { useCallback, useEffect, useState } from 'react';

export const TIDE_HIST_EMA_DEFAULT = 8;
export const TIDE_HIST_EMA_MIN = 2;
export const TIDE_HIST_EMA_MAX = 34;
const STORAGE_KEY = 'tide-zone-hist-ema';
const listeners = new Set<(period: number) => void>();

function clampPeriod(n: number): number {
  if (!Number.isFinite(n)) return TIDE_HIST_EMA_DEFAULT;
  return Math.min(TIDE_HIST_EMA_MAX, Math.max(TIDE_HIST_EMA_MIN, Math.round(n)));
}

function readStored(): number {
  if (typeof window === 'undefined') return TIDE_HIST_EMA_DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return TIDE_HIST_EMA_DEFAULT;
    return clampPeriod(Number(raw));
  } catch {
    return TIDE_HIST_EMA_DEFAULT;
  }
}

/** Shared adjustable EMA length for the Tide histogram overlay. */
export function useTideHistEmaPeriod(): [number, (next: number) => void] {
  const [period, setPeriod] = useState(readStored);

  useEffect(() => {
    const onChange = (n: number) => setPeriod(n);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const update = useCallback((next: number) => {
    const period = clampPeriod(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(period));
    } catch {
      /* private mode */
    }
    setPeriod(period);
    listeners.forEach((fn) => fn(period));
  }, []);

  return [period, update];
}

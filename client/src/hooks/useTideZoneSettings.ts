import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_TIDE_ZONE_SETTINGS, type TideZoneSettings } from '@/types/tideZoneSettings';

const STORAGE_KEY = 'tide-zone-settings-v1';
const EMA_LEGACY_KEY = 'tide-zone-hist-ema';
const listeners = new Set<(s: TideZoneSettings) => void>();

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalize(raw: Partial<TideZoneSettings> | null | undefined): TideZoneSettings {
  const d = DEFAULT_TIDE_ZONE_SETTINGS;
  const s = { ...d, ...(raw || {}) };
  return {
    emaPeriod: clamp(s.emaPeriod, 2, 34, d.emaPeriod),
    confirmBars: clamp(Math.round(s.confirmBars), 2, 13, d.confirmBars),
    minGap: clamp(Math.round(s.minGap), 4, 48, d.minGap),
    belowScore: clamp(s.belowScore, -80, 0, d.belowScore),
    emaSep: clamp(s.emaSep, 1, 40, d.emaSep),
    priceLlPct: clamp(s.priceLlPct, 0.0005, 0.05, d.priceLlPct),
    keep: clamp(Math.round(s.keep), 2, 24, d.keep),
    showDiv: s.showDiv !== false,
    showAbsorb: s.showAbsorb !== false,
    divColor: typeof s.divColor === 'string' && s.divColor.startsWith('#') ? s.divColor : d.divColor,
    absorbColor: typeof s.absorbColor === 'string' && s.absorbColor.startsWith('#') ? s.absorbColor : d.absorbColor,
  };
}

function load(): TideZoneSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_TIDE_ZONE_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
    const ema = Number(window.localStorage.getItem(EMA_LEGACY_KEY));
    if (Number.isFinite(ema) && ema > 0) {
      return normalize({ emaPeriod: ema });
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_TIDE_ZONE_SETTINGS };
}

let current = load();

function commit(next: TideZoneSettings) {
  current = normalize(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    window.localStorage.setItem(EMA_LEGACY_KEY, String(current.emaPeriod));
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn(current));
}

export function useTideZoneSettings() {
  const [settings, setSettings] = useState<TideZoneSettings>(current);

  useEffect(() => {
    const onChange = (s: TideZoneSettings) => setSettings(s);
    listeners.add(onChange);
    setSettings(current);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const updateSettings = useCallback((partial: Partial<TideZoneSettings>) => {
    commit({ ...current, ...partial });
  }, []);

  const resetToDefaults = useCallback(() => {
    commit({ ...DEFAULT_TIDE_ZONE_SETTINGS });
  }, []);

  return { settings, updateSettings, resetToDefaults };
}

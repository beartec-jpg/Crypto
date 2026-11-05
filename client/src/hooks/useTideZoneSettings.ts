// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { useCallback, useSyncExternalStore } from 'react';
import {
  TIDE_ZONE_SETTINGS,
  normalizeTideZoneSettings,
  type TideZoneSettings,
} from '@/types/tideZoneSettings';

/**
 * Tide settings live in localStorage (the server oscillator preferences only store favourites).
 * New key: values from older Tide versions (`tide-zone-settings-v2`) are never read.
 */
export const TIDE_SETTINGS_KEY = 'tide-zone-settings-v3';

let cache: TideZoneSettings | null = null;
const listeners = new Set<() => void>();

function load(): TideZoneSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(TIDE_SETTINGS_KEY) : null;
    return raw ? normalizeTideZoneSettings(JSON.parse(raw)) : TIDE_ZONE_SETTINGS;
  } catch {
    return TIDE_ZONE_SETTINGS;
  }
}

function snapshot(): TideZoneSettings {
  if (!cache) cache = load();
  return cache;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TIDE_SETTINGS_KEY) {
      cache = null;
      cb();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** Save (normalized) and notify every mounted Tide view. Exported for tests. */
export function saveTideZoneSettings(next: Partial<TideZoneSettings>): TideZoneSettings {
  const merged = normalizeTideZoneSettings({ ...snapshot(), ...next });
  cache = merged;
  try {
    localStorage.setItem(TIDE_SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    /* storage full/blocked: keep the in-memory value for this session */
  }
  listeners.forEach((l) => l());
  return merged;
}

/** Test helper: drop the in-memory copy so the next read goes to storage. */
export function resetTideZoneSettingsCache(): void {
  cache = null;
}

export function useTideZoneSettings(): {
  settings: TideZoneSettings;
  update: (patch: Partial<TideZoneSettings>) => void;
  reset: () => void;
} {
  const settings = useSyncExternalStore(subscribe, snapshot, () => TIDE_ZONE_SETTINGS);
  const update = useCallback((patch: Partial<TideZoneSettings>) => {
    saveTideZoneSettings(patch);
  }, []);
  const reset = useCallback(() => {
    saveTideZoneSettings(TIDE_ZONE_SETTINGS);
  }, []);
  return { settings, update, reset };
}

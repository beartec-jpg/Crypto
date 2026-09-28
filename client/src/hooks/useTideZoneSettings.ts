import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_TIDE_ZONE_SETTINGS,
  TIDE_PRESETS,
  normalizeTideZoneSettings,
  type TideTimeframe,
  type TideTimeframeSettings,
  type TideZoneSettings,
} from '@/types/tideZoneSettings';

/** v2: per-timeframe (1h / 4h) presets. v1 keys are ignored (no migration needed). */
export const TIDE_SETTINGS_STORAGE_KEY = 'tide-zone-settings-v2';
const listeners = new Set<(s: TideZoneSettings) => void>();

function load(): TideZoneSettings {
  if (typeof window === 'undefined') return normalizeTideZoneSettings(null);
  try {
    const raw = window.localStorage.getItem(TIDE_SETTINGS_STORAGE_KEY);
    if (raw) return normalizeTideZoneSettings(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return normalizeTideZoneSettings(null);
}

let current = load();

function commit(next: TideZoneSettings) {
  current = normalizeTideZoneSettings(next);
  try {
    window.localStorage.setItem(TIDE_SETTINGS_STORAGE_KEY, JSON.stringify(current));
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

  /** Display toggles / colours (shared by 1h and 4h). */
  const updateSettings = useCallback((partial: Partial<Omit<TideZoneSettings, 'byTimeframe'>>) => {
    commit({ ...current, ...partial });
  }, []);

  const updateTimeframe = useCallback((tf: TideTimeframe, partial: Partial<TideTimeframeSettings>) => {
    commit({
      ...current,
      byTimeframe: { ...current.byTimeframe, [tf]: { ...current.byTimeframe[tf], ...partial } },
    });
  }, []);

  const resetTimeframe = useCallback((tf: TideTimeframe) => {
    commit({ ...current, byTimeframe: { ...current.byTimeframe, [tf]: { ...TIDE_PRESETS[tf] } } });
  }, []);

  const resetToDefaults = useCallback(() => {
    commit(normalizeTideZoneSettings(DEFAULT_TIDE_ZONE_SETTINGS));
  }, []);

  return { settings, updateSettings, updateTimeframe, resetTimeframe, resetToDefaults };
}

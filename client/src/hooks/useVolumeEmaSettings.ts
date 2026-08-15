import { useState, useCallback } from 'react';
import {
  DEFAULT_VOLUME_EMA_SETTINGS,
  type VolumeEmaSettings,
} from '@/types/volumeEma';

/**
 * Bump this when locked defaults change so every client reloads the tuned set.
 * v3 = user-specified lock-in (lookback 52, k 2.7, opacity 70, dotted 1px, …).
 */
const STORAGE_KEY = 'volume-ema-settings-v3';
const LEGACY_STORAGE_KEYS = [
  'volume-ema-settings',
  'volume-ema-settings-v2',
];

function loadSettings(): VolumeEmaSettings {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<VolumeEmaSettings> & {
        smoothPeriod?: number;
      };
      const lookback =
        parsed.lookback ??
        parsed.smoothPeriod ??
        DEFAULT_VOLUME_EMA_SETTINGS.lookback;
      const merged: VolumeEmaSettings = {
        ...DEFAULT_VOLUME_EMA_SETTINGS,
        ...parsed,
        lookback,
      };
      return merged;
    }
  } catch {
    /* ignore */
  }

  // First visit / cleared storage: persist the locked defaults immediately
  const defaults = { ...DEFAULT_VOLUME_EMA_SETTINGS };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    /* ignore */
  }
  return defaults;
}

function saveSettings(settings: VolumeEmaSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function useVolumeEmaSettings() {
  const [settings, setSettingsState] = useState<VolumeEmaSettings>(loadSettings);

  const setSettings = useCallback((next: VolumeEmaSettings) => {
    saveSettings(next);
    setSettingsState(next);
  }, []);

  const updateSettings = useCallback((partial: Partial<VolumeEmaSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    const next = { ...DEFAULT_VOLUME_EMA_SETTINGS };
    saveSettings(next);
    setSettingsState(next);
  }, []);

  return { settings, setSettings, updateSettings, resetToDefaults };
}

import { useState, useCallback } from 'react';
import {
  DEFAULT_VOLUME_EMA_SETTINGS,
  type VolumeEmaSettings,
} from '@/types/volumeEma';

/** Bump when locked defaults change so stale localStorage cannot override. */
const STORAGE_KEY = 'volume-ema-settings-v2';
const LEGACY_STORAGE_KEYS = ['volume-ema-settings'];

function loadSettings(): VolumeEmaSettings {
  try {
    // Drop pre-lock-in saves once so everyone gets the tuned defaults
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
      // Migrate legacy smoothPeriod → lookback; always fill missing keys from defaults
      const lookback =
        parsed.lookback ??
        parsed.smoothPeriod ??
        DEFAULT_VOLUME_EMA_SETTINGS.lookback;
      return {
        ...DEFAULT_VOLUME_EMA_SETTINGS,
        ...parsed,
        lookback,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_VOLUME_EMA_SETTINGS };
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

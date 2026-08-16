import { useState, useCallback } from 'react';
import {
  DEFAULT_VOLUME_EMA_SETTINGS,
  LOCKED_VOLUME_EMA_MATH,
  type VolumeEmaSettings,
} from '@/types/volumeEma';

/**
 * Bump this when locked defaults change so every client reloads the tuned set.
 * v6 = enabled off, opacity 85, k 6, bias 4, spike 2 / pad 5; hidden knobs locked.
 */
const STORAGE_KEY = 'volume-ema-settings-v6';
const LEGACY_STORAGE_KEYS = [
  'volume-ema-settings',
  'volume-ema-settings-v2',
  'volume-ema-settings-v3',
  'volume-ema-settings-v4',
  'volume-ema-settings-v5',
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
      const parsed = JSON.parse(stored) as Partial<VolumeEmaSettings>;
      return {
        ...DEFAULT_VOLUME_EMA_SETTINGS,
        ...parsed,
        ...LOCKED_VOLUME_EMA_MATH,
      };
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
      const next = { ...prev, ...partial, ...LOCKED_VOLUME_EMA_MATH };
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

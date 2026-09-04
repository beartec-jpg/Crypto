import { useState, useCallback } from 'react';
import { DEFAULT_SWOOP_SETTINGS, type SwoopSettings } from '@/types/swoop';

const STORAGE_KEY = 'swoop-tool-settings-v2';

function loadSettings(): SwoopSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('swoop-tool-settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SWOOP_SETTINGS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SWOOP_SETTINGS };
}

function saveSettings(settings: SwoopSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function useSwoopSettings() {
  const [settings, setSettingsState] = useState<SwoopSettings>(loadSettings);

  const setSettings = useCallback((next: SwoopSettings) => {
    saveSettings(next);
    setSettingsState(next);
  }, []);

  const updateSettings = useCallback((partial: Partial<SwoopSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    const next = { ...DEFAULT_SWOOP_SETTINGS };
    saveSettings(next);
    setSettingsState(next);
  }, []);

  return { settings, setSettings, updateSettings, resetToDefaults };
}

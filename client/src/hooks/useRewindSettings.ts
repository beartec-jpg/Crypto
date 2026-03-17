import { useState, useCallback } from 'react';
import type { RewindSettings } from '@/types/rewind';
import { DEFAULT_REWIND_SETTINGS } from '@/types/rewind';

const STORAGE_KEY = 'rewind-settings';

function loadSettings(): RewindSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_REWIND_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_REWIND_SETTINGS };
}

function saveSettings(settings: RewindSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseRewindSettingsReturn {
  settings: RewindSettings;
  setSettings: (settings: RewindSettings) => void;
  updateSettings: (partial: Partial<RewindSettings>) => void;
  updateSetting: <K extends keyof RewindSettings>(key: K, value: RewindSettings[K]) => void;
  resetToDefaults: () => void;
}

export function useRewindSettings(): UseRewindSettingsReturn {
  const [settings, setSettingsState] = useState<RewindSettings>(loadSettings);

  const setSettings = useCallback((newSettings: RewindSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSettings = useCallback((partial: Partial<RewindSettings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...partial };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const updateSetting = useCallback(<K extends keyof RewindSettings>(key: K, value: RewindSettings[K]) => {
    setSettingsState((prev) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_REWIND_SETTINGS);
    setSettingsState({ ...DEFAULT_REWIND_SETTINGS });
  }, []);

  return { settings, setSettings, updateSettings, updateSetting, resetToDefaults };
}

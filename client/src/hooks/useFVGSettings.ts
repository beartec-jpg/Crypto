import { useState, useCallback } from 'react';
import type { FVGSettings } from '@/types/fvg';
import { DEFAULT_FVG_SETTINGS } from '@/types/fvg';

const STORAGE_KEY = 'fvg-settings';

function loadSettings(): FVGSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_FVG_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_FVG_SETTINGS };
}

function saveSettings(settings: FVGSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseFVGSettingsReturn {
  settings: FVGSettings;
  setSettings: (settings: FVGSettings) => void;
  updateSetting: <K extends keyof FVGSettings>(key: K, value: FVGSettings[K]) => void;
  resetToDefaults: () => void;
}

export function useFVGSettings(): UseFVGSettingsReturn {
  const [settings, setSettingsState] = useState<FVGSettings>(loadSettings);

  const setSettings = useCallback((newSettings: FVGSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSetting = useCallback(<K extends keyof FVGSettings>(key: K, value: FVGSettings[K]) => {
    setSettingsState((prev: FVGSettings) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_FVG_SETTINGS);
    setSettingsState({ ...DEFAULT_FVG_SETTINGS });
  }, []);

  return { settings, setSettings, updateSetting, resetToDefaults };
}

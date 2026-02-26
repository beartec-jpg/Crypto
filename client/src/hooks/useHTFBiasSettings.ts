import { useState, useCallback } from 'react';
import type { HTFBiasSettings } from '@/types/htfBias';
import { DEFAULT_HTF_BIAS_SETTINGS } from '@/types/htfBias';

const STORAGE_KEY = 'htf-bias-settings';

function loadSettings(): HTFBiasSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_HTF_BIAS_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_HTF_BIAS_SETTINGS };
}

function saveSettings(settings: HTFBiasSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseHTFBiasSettingsReturn {
  settings: HTFBiasSettings;
  setSettings: (settings: HTFBiasSettings) => void;
  updateSetting: <K extends keyof HTFBiasSettings>(key: K, value: HTFBiasSettings[K]) => void;
  resetToDefaults: () => void;
}

export function useHTFBiasSettings(): UseHTFBiasSettingsReturn {
  const [settings, setSettingsState] = useState<HTFBiasSettings>(loadSettings);

  const setSettings = useCallback((newSettings: HTFBiasSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSetting = useCallback(<K extends keyof HTFBiasSettings>(key: K, value: HTFBiasSettings[K]) => {
    setSettingsState((prev: HTFBiasSettings) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_HTF_BIAS_SETTINGS);
    setSettingsState({ ...DEFAULT_HTF_BIAS_SETTINGS });
  }, []);

  return { settings, setSettings, updateSetting, resetToDefaults };
}

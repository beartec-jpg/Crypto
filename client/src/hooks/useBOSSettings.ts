import { useState, useCallback } from 'react';
import type { BOSSettings } from '@/types/structureBreak';
import { DEFAULT_BOS_SETTINGS } from '@/types/structureBreak';

const STORAGE_KEY = 'bos-settings';

function loadSettings(): BOSSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_BOS_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_BOS_SETTINGS };
}

function saveSettings(settings: BOSSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseBOSSettingsReturn {
  settings: BOSSettings;
  setSettings: (settings: BOSSettings) => void;
  updateSetting: <K extends keyof BOSSettings>(key: K, value: BOSSettings[K]) => void;
  resetToDefaults: () => void;
}

export function useBOSSettings(): UseBOSSettingsReturn {
  const [settings, setSettingsState] = useState<BOSSettings>(loadSettings);

  const setSettings = useCallback((newSettings: BOSSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSetting = useCallback(<K extends keyof BOSSettings>(key: K, value: BOSSettings[K]) => {
    setSettingsState((prev: BOSSettings) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_BOS_SETTINGS);
    setSettingsState({ ...DEFAULT_BOS_SETTINGS });
  }, []);

  return { settings, setSettings, updateSetting, resetToDefaults };
}

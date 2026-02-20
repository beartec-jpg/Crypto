import { useState, useCallback } from 'react';
import type { OrderBlockSettings } from '@/types/orderBlock';
import { DEFAULT_OB_SETTINGS } from '@/types/orderBlock';

const STORAGE_KEY = 'ob-settings';

function loadSettings(): OrderBlockSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_OB_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_OB_SETTINGS };
}

function saveSettings(settings: OrderBlockSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseOrderBlockSettingsReturn {
  settings: OrderBlockSettings;
  setSettings: (settings: OrderBlockSettings) => void;
  updateSetting: <K extends keyof OrderBlockSettings>(key: K, value: OrderBlockSettings[K]) => void;
  resetToDefaults: () => void;
}

export function useOrderBlockSettings(): UseOrderBlockSettingsReturn {
  const [settings, setSettingsState] = useState<OrderBlockSettings>(loadSettings);

  const setSettings = useCallback((newSettings: OrderBlockSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSetting = useCallback(<K extends keyof OrderBlockSettings>(key: K, value: OrderBlockSettings[K]) => {
    setSettingsState((prev: OrderBlockSettings) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_OB_SETTINGS);
    setSettingsState({ ...DEFAULT_OB_SETTINGS });
  }, []);

  return { settings, setSettings, updateSetting, resetToDefaults };
}

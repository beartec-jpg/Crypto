import { useState, useCallback } from 'react';
import type { BreakerSettings } from '@/types/breaker';
import { DEFAULT_BREAKER_SETTINGS } from '@/types/breaker';

const STORAGE_KEY = 'breaker-settings';

function loadSettings(): BreakerSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_BREAKER_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_BREAKER_SETTINGS };
}

function saveSettings(settings: BreakerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseBreakerSettingsReturn {
  settings: BreakerSettings;
  setSettings: (settings: BreakerSettings) => void;
  updateSetting: <K extends keyof BreakerSettings>(key: K, value: BreakerSettings[K]) => void;
  resetToDefaults: () => void;
}

export function useBreakerSettings(): UseBreakerSettingsReturn {
  const [settings, setSettingsState] = useState<BreakerSettings>(loadSettings);

  const setSettings = useCallback((newSettings: BreakerSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSetting = useCallback(<K extends keyof BreakerSettings>(key: K, value: BreakerSettings[K]) => {
    setSettingsState((prev: BreakerSettings) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_BREAKER_SETTINGS);
    setSettingsState({ ...DEFAULT_BREAKER_SETTINGS });
  }, []);

  return { settings, setSettings, updateSetting, resetToDefaults };
}

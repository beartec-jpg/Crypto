import { useState, useCallback } from 'react';
import type { BreakerBlockSettings } from '@/types/breakerBlock';
import { DEFAULT_BB_SETTINGS } from '@/types/breakerBlock';

const STORAGE_KEY = 'bb-settings';

function loadSettings(): BreakerBlockSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_BB_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_BB_SETTINGS };
}

function saveSettings(settings: BreakerBlockSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseBreakerBlockSettingsReturn {
  settings: BreakerBlockSettings;
  setSettings: (settings: BreakerBlockSettings) => void;
  updateSetting: <K extends keyof BreakerBlockSettings>(key: K, value: BreakerBlockSettings[K]) => void;
  resetToDefaults: () => void;
}

export function useBreakerBlockSettings(): UseBreakerBlockSettingsReturn {
  const [settings, setSettingsState] = useState<BreakerBlockSettings>(loadSettings);

  const setSettings = useCallback((newSettings: BreakerBlockSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSetting = useCallback(<K extends keyof BreakerBlockSettings>(
    key: K,
    value: BreakerBlockSettings[K],
  ) => {
    setSettingsState((prev: BreakerBlockSettings) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_BB_SETTINGS);
    setSettingsState({ ...DEFAULT_BB_SETTINGS });
  }, []);

  return { settings, setSettings, updateSetting, resetToDefaults };
}

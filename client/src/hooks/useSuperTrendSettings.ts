import { useState, useCallback } from 'react';
import type { SuperTrendSettings, SuperTrendConfig, SuperTrendType } from '@/types/supertrend';
import { DEFAULT_SUPERTREND_SETTINGS } from '@/types/supertrend';

const STORAGE_KEY = 'supertrend-settings';

function loadSettings(): SuperTrendSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        standard: { ...DEFAULT_SUPERTREND_SETTINGS.standard, ...parsed.standard },
        adx: { ...DEFAULT_SUPERTREND_SETTINGS.adx, ...parsed.adx },
        keltner: { ...DEFAULT_SUPERTREND_SETTINGS.keltner, ...parsed.keltner },
      };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_SUPERTREND_SETTINGS };
}

function saveSettings(settings: SuperTrendSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseSuperTrendSettingsReturn {
  settings: SuperTrendSettings;
  updateSettings: (updates: Partial<SuperTrendSettings>) => void;
  updateConfig: (type: SuperTrendType, updates: Partial<SuperTrendConfig>) => void;
  resetToDefaults: () => void;
}

export function useSuperTrendSettings(): UseSuperTrendSettingsReturn {
  const [settings, setSettingsState] = useState<SuperTrendSettings>(loadSettings);

  const updateSettings = useCallback((updates: Partial<SuperTrendSettings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...updates };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const updateConfig = useCallback((type: SuperTrendType, updates: Partial<SuperTrendConfig>) => {
    setSettingsState((prev) => {
      const updated = {
        ...prev,
        [type]: { ...prev[type], ...updates },
      };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_SUPERTREND_SETTINGS);
    setSettingsState({ ...DEFAULT_SUPERTREND_SETTINGS });
  }, []);

  return { settings, updateSettings, updateConfig, resetToDefaults };
}

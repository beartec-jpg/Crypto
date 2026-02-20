import { useState, useCallback } from 'react';
import type { PDZoneSettings } from '@/types/liquidity';
import { DEFAULT_PD_ZONE_SETTINGS } from '@/types/liquidity';

const STORAGE_KEY = 'pd-zone-settings';

function loadSettings(): PDZoneSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PD_ZONE_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_PD_ZONE_SETTINGS };
}

function saveSettings(settings: PDZoneSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UsePDZoneSettingsReturn {
  settings: PDZoneSettings;
  setSettings: (settings: PDZoneSettings) => void;
  updateSetting: <K extends keyof PDZoneSettings>(key: K, value: PDZoneSettings[K]) => void;
  resetToDefaults: () => void;
}

export function usePDZoneSettings(): UsePDZoneSettingsReturn {
  const [settings, setSettingsState] = useState<PDZoneSettings>(loadSettings);

  const setSettings = useCallback((newSettings: PDZoneSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSetting = useCallback(<K extends keyof PDZoneSettings>(key: K, value: PDZoneSettings[K]) => {
    setSettingsState((prev: PDZoneSettings) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_PD_ZONE_SETTINGS);
    setSettingsState({ ...DEFAULT_PD_ZONE_SETTINGS });
  }, []);

  return { settings, setSettings, updateSetting, resetToDefaults };
}

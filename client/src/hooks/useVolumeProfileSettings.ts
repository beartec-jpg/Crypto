import { useState, useCallback } from 'react';
import type { VolumeProfileSettings } from '@/types/volumeProfile';
import { DEFAULT_VOLUME_PROFILE_SETTINGS } from '@/types/volumeProfile';

const STORAGE_KEY = 'vp-settings';

function loadSettings(): VolumeProfileSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_VOLUME_PROFILE_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_VOLUME_PROFILE_SETTINGS };
}

function saveSettings(settings: VolumeProfileSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseVolumeProfileSettingsReturn {
  settings: VolumeProfileSettings;
  setSettings: (settings: VolumeProfileSettings) => void;
  updateSettings: (partial: Partial<VolumeProfileSettings>) => void;
  updateSetting: <K extends keyof VolumeProfileSettings>(key: K, value: VolumeProfileSettings[K]) => void;
  resetToDefaults: () => void;
}

export function useVolumeProfileSettings(): UseVolumeProfileSettingsReturn {
  const [settings, setSettingsState] = useState<VolumeProfileSettings>(loadSettings);

  const setSettings = useCallback((newSettings: VolumeProfileSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSettings = useCallback((partial: Partial<VolumeProfileSettings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...partial };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const updateSetting = useCallback(<K extends keyof VolumeProfileSettings>(key: K, value: VolumeProfileSettings[K]) => {
    setSettingsState((prev) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_VOLUME_PROFILE_SETTINGS);
    setSettingsState({ ...DEFAULT_VOLUME_PROFILE_SETTINGS });
  }, []);

  return { settings, setSettings, updateSettings, updateSetting, resetToDefaults };
}

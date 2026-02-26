import { useState, useCallback } from 'react';
import { SqueezeMomentumSettings, DEFAULT_SQUEEZE_MOMENTUM_SETTINGS } from '@/types/squeezeMomentum';

const STORAGE_KEY = 'squeeze-momentum-settings';

function loadSettings(): SqueezeMomentumSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SQUEEZE_MOMENTUM_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_SQUEEZE_MOMENTUM_SETTINGS };
}

function saveSettings(settings: SqueezeMomentumSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseSqueezeMomentumSettingsReturn {
  settings: SqueezeMomentumSettings;
  updateSettings: (updates: Partial<SqueezeMomentumSettings>) => void;
  resetSettings: () => void;
}

export function useSqueezeMomentumSettings(): UseSqueezeMomentumSettingsReturn {
  const [settings, setSettingsState] = useState<SqueezeMomentumSettings>(loadSettings);

  const updateSettings = useCallback((updates: Partial<SqueezeMomentumSettings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...updates };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetSettings = useCallback(() => {
    saveSettings(DEFAULT_SQUEEZE_MOMENTUM_SETTINGS);
    setSettingsState({ ...DEFAULT_SQUEEZE_MOMENTUM_SETTINGS });
  }, []);

  return { settings, updateSettings, resetSettings };
}

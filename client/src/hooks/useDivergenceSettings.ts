import { useState, useCallback } from 'react';

export interface DivergenceSettings {
  displayFormat: 'number' | 'percentage';
  showEmoji: boolean;
  showColors: boolean;
  historyCount: 1 | 2 | 3 | 4 | 5;
}

const DEFAULT_DIVERGENCE_SETTINGS: DivergenceSettings = {
  displayFormat: 'number',
  showEmoji: true,
  showColors: true,
  historyCount: 5,
};

const STORAGE_KEY = 'divergenceSettings';

function loadSettings(): DivergenceSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_DIVERGENCE_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_DIVERGENCE_SETTINGS };
}

function saveSettings(settings: DivergenceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseDivergenceSettingsReturn {
  settings: DivergenceSettings;
  updateSettings: (newSettings: Partial<DivergenceSettings>) => void;
}

export function useDivergenceSettings(): UseDivergenceSettingsReturn {
  const [settings, setSettingsState] = useState<DivergenceSettings>(loadSettings);

  const updateSettings = useCallback((newSettings: Partial<DivergenceSettings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...newSettings };
      saveSettings(updated);
      return updated;
    });
  }, []);

  return { settings, updateSettings };
}

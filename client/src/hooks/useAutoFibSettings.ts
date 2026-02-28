import { useState, useCallback } from 'react';
import { AutoFibSettings, DEFAULT_AUTO_FIB_SETTINGS } from '@/types/autoFib';

const STORAGE_KEY = 'auto-fib-settings';

function loadSettings(): AutoFibSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Deep-merge to preserve nested primary/secondary defaults
      return {
        ...DEFAULT_AUTO_FIB_SETTINGS,
        ...parsed,
        primary: { ...DEFAULT_AUTO_FIB_SETTINGS.primary, ...(parsed.primary ?? {}) },
        secondary: { ...DEFAULT_AUTO_FIB_SETTINGS.secondary, ...(parsed.secondary ?? {}) },
      };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_AUTO_FIB_SETTINGS };
}

function saveSettings(settings: AutoFibSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseAutoFibSettingsReturn {
  settings: AutoFibSettings;
  updateSettings: (updates: Partial<AutoFibSettings>) => void;
  resetToDefaults: () => void;
}

export function useAutoFibSettings(): UseAutoFibSettingsReturn {
  const [settings, setSettingsState] = useState<AutoFibSettings>(loadSettings);

  const updateSettings = useCallback((updates: Partial<AutoFibSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_AUTO_FIB_SETTINGS);
    setSettingsState({ ...DEFAULT_AUTO_FIB_SETTINGS });
  }, []);

  return { settings, updateSettings, resetToDefaults };
}

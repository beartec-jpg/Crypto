import { useState, useCallback } from 'react';
import type { LiquiditySettings } from '@/types/liquidity';
import { DEFAULT_LIQUIDITY_SETTINGS } from '@/types/liquidity';

const STORAGE_KEY = 'liquidity-settings';

function loadSettings(): LiquiditySettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_LIQUIDITY_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_LIQUIDITY_SETTINGS };
}

function saveSettings(settings: LiquiditySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseLiquiditySettingsReturn {
  settings: LiquiditySettings;
  setSettings: (settings: LiquiditySettings) => void;
  updateSetting: <K extends keyof LiquiditySettings>(key: K, value: LiquiditySettings[K]) => void;
  resetToDefaults: () => void;
}

export function useLiquiditySettings(): UseLiquiditySettingsReturn {
  const [settings, setSettingsState] = useState<LiquiditySettings>(loadSettings);

  const setSettings = useCallback((newSettings: LiquiditySettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSetting = useCallback(<K extends keyof LiquiditySettings>(key: K, value: LiquiditySettings[K]) => {
    setSettingsState((prev: LiquiditySettings) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_LIQUIDITY_SETTINGS);
    setSettingsState({ ...DEFAULT_LIQUIDITY_SETTINGS });
  }, []);

  return { settings, setSettings, updateSetting, resetToDefaults };
}

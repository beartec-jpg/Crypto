import { useState, useCallback } from 'react';
import type { LiquidityHeatmapSettings } from '@/types/liquidityHeatmap';
import { DEFAULT_LIQUIDITY_HEATMAP_SETTINGS } from '@/types/liquidityHeatmap';

const STORAGE_KEY = 'liquidity-heatmap-settings';

function loadSettings(): LiquidityHeatmapSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_LIQUIDITY_HEATMAP_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { ...DEFAULT_LIQUIDITY_HEATMAP_SETTINGS };
}

function saveSettings(settings: LiquidityHeatmapSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage errors
  }
}

interface UseLiquidityHeatmapSettingsReturn {
  settings: LiquidityHeatmapSettings;
  setSettings: (settings: LiquidityHeatmapSettings) => void;
  updateSettings: (partial: Partial<LiquidityHeatmapSettings>) => void;
  updateSetting: <K extends keyof LiquidityHeatmapSettings>(key: K, value: LiquidityHeatmapSettings[K]) => void;
  resetToDefaults: () => void;
}

export function useLiquidityHeatmapSettings(): UseLiquidityHeatmapSettingsReturn {
  const [settings, setSettingsState] = useState<LiquidityHeatmapSettings>(loadSettings);

  const setSettings = useCallback((newSettings: LiquidityHeatmapSettings) => {
    saveSettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const updateSettings = useCallback((partial: Partial<LiquidityHeatmapSettings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...partial };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const updateSetting = useCallback(<K extends keyof LiquidityHeatmapSettings>(key: K, value: LiquidityHeatmapSettings[K]) => {
    setSettingsState((prev) => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_LIQUIDITY_HEATMAP_SETTINGS);
    setSettingsState({ ...DEFAULT_LIQUIDITY_HEATMAP_SETTINGS });
  }, []);

  return { settings, setSettings, updateSettings, updateSetting, resetToDefaults };
}

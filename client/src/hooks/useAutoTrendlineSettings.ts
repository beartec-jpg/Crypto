import { useState, useCallback } from 'react';
import {
  DEFAULT_AUTO_TRENDLINE_SETTINGS,
  DEFAULT_AUTO_TRENDLINE_TIER,
  type AutoTrendlineSettings,
  type AutoTrendlineTierId,
  type AutoTrendlineTierSettings,
} from '@/types/autoTrendline';

const STORAGE_KEY = 'auto-trendline-settings';

function loadSettings(): AutoTrendlineSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_AUTO_TRENDLINE_SETTINGS,
        ...parsed,
        macro: { ...DEFAULT_AUTO_TRENDLINE_TIER.macro, ...(parsed.macro ?? {}) },
        mid: { ...DEFAULT_AUTO_TRENDLINE_TIER.mid, ...(parsed.mid ?? {}) },
        ltf: { ...DEFAULT_AUTO_TRENDLINE_TIER.ltf, ...(parsed.ltf ?? {}) },
      };
    }
  } catch {
    /* ignore */
  }
  return {
    enabled: DEFAULT_AUTO_TRENDLINE_SETTINGS.enabled,
    macro: { ...DEFAULT_AUTO_TRENDLINE_TIER.macro },
    mid: { ...DEFAULT_AUTO_TRENDLINE_TIER.mid },
    ltf: { ...DEFAULT_AUTO_TRENDLINE_TIER.ltf },
  };
}

function saveSettings(settings: AutoTrendlineSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function useAutoTrendlineSettings() {
  const [settings, setSettingsState] = useState<AutoTrendlineSettings>(loadSettings);

  const setSettings = useCallback((next: AutoTrendlineSettings) => {
    saveSettings(next);
    setSettingsState(next);
  }, []);

  const updateSettings = useCallback((partial: Partial<AutoTrendlineSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const updateTier = useCallback(
    (tier: AutoTrendlineTierId, partial: Partial<AutoTrendlineTierSettings>) => {
      setSettingsState((prev) => {
        const next = {
          ...prev,
          [tier]: { ...prev[tier], ...partial },
        };
        saveSettings(next);
        return next;
      });
    },
    [],
  );

  const resetToDefaults = useCallback(() => {
    const next = {
      enabled: DEFAULT_AUTO_TRENDLINE_SETTINGS.enabled,
      macro: { ...DEFAULT_AUTO_TRENDLINE_TIER.macro },
      mid: { ...DEFAULT_AUTO_TRENDLINE_TIER.mid },
      ltf: { ...DEFAULT_AUTO_TRENDLINE_TIER.ltf },
    };
    saveSettings(next);
    setSettingsState(next);
  }, []);

  return { settings, setSettings, updateSettings, updateTier, resetToDefaults };
}

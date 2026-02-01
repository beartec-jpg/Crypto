import { useState, useEffect, useCallback } from 'react';

interface ChartSettings {
  theme?: string;
  gridlines?: boolean;
  crosshair?: boolean;
  timezone?: string;
  [key: string]: any;
}

const DEFAULT_SETTINGS: ChartSettings = {
  theme: 'dark',
  gridlines: true,
  crosshair: true,
  timezone: 'UTC',
};

export function useSettingsPersistence(storageKey: string = 'chartSettings') {
  const [settings, setSettings] = useState<ChartSettings>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [settings, storageKey]);

  const updateSetting = useCallback((key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateSettings = useCallback((updates: Partial<ChartSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  }, [storageKey]);

  return { 
    settings, 
    updateSetting, 
    updateSettings, 
    resetSettings,
  };
}

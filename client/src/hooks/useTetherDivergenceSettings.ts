import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_TETHER_DIVERGENCE_SETTINGS,
  normalizeTetherDivergenceSettings,
  type TetherDivergenceSettings,
} from '@/types/tetherDivergenceSettings';

export const TETHER_SETTINGS_STORAGE_KEY = 'tether-divergence-settings-v1';

const listeners = new Set<(s: TetherDivergenceSettings) => void>();
const modalListeners = new Set<(open: boolean) => void>();

function load(): TetherDivergenceSettings {
  if (typeof window === 'undefined') return normalizeTetherDivergenceSettings(null);
  try {
    const raw = window.localStorage.getItem(TETHER_SETTINGS_STORAGE_KEY);
    if (raw) return normalizeTetherDivergenceSettings(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return normalizeTetherDivergenceSettings(null);
}

let current = load();
let modalOpen = false;

function commit(next: TetherDivergenceSettings) {
  current = normalizeTetherDivergenceSettings(next);
  try {
    window.localStorage.setItem(TETHER_SETTINGS_STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn(current));
}

function commitModal(open: boolean) {
  modalOpen = open;
  modalListeners.forEach((fn) => fn(open));
}

export function useTetherDivergenceSettings() {
  const [settings, setSettings] = useState<TetherDivergenceSettings>(current);
  const [isModalOpen, setIsModalOpen] = useState(modalOpen);

  useEffect(() => {
    const onChange = (s: TetherDivergenceSettings) => setSettings(s);
    const onModal = (open: boolean) => setIsModalOpen(open);
    listeners.add(onChange);
    modalListeners.add(onModal);
    setSettings(current);
    setIsModalOpen(modalOpen);
    return () => {
      listeners.delete(onChange);
      modalListeners.delete(onModal);
    };
  }, []);

  const updateSettings = useCallback((partial: Partial<TetherDivergenceSettings>) => {
    commit({ ...current, ...partial });
  }, []);

  const resetToDefaults = useCallback(() => {
    commit(normalizeTetherDivergenceSettings(DEFAULT_TETHER_DIVERGENCE_SETTINGS));
  }, []);

  const setModalOpen = useCallback((open: boolean) => {
    commitModal(open);
  }, []);

  return { settings, updateSettings, resetToDefaults, isModalOpen, setModalOpen };
}

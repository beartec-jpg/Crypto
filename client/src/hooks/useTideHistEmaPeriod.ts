import { useCallback } from 'react';
import { useTideZoneSettings } from '@/hooks/useTideZoneSettings';

export const TIDE_HIST_EMA_DEFAULT = 8;
export const TIDE_HIST_EMA_MIN = 2;
export const TIDE_HIST_EMA_MAX = 34;

/** @deprecated use useTideZoneSettings — kept so EMA +/- still works. */
export function useTideHistEmaPeriod(): [number, (next: number) => void] {
  const { settings, updateSettings } = useTideZoneSettings();
  const setPeriod = useCallback(
    (next: number) => {
      updateSettings({ emaPeriod: next });
    },
    [updateSettings],
  );
  return [settings.emaPeriod, setPeriod];
}

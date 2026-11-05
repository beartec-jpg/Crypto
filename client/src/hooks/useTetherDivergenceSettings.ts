// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { TETHER_STRETCH_SETTINGS, type TetherDivergenceSettings } from '@/types/tetherDivergenceSettings';

/**
 * Tether Stretch runs on fixed values: there are no user settings. Old
 * `tether-divergence-settings-v1` localStorage values are never read, so stale customisations
 * cannot change the indicator. (Internal id and file names stay `tetherDivergence` so saved
 * oscillator layouts keep working.)
 */
export function useTetherDivergenceSettings(): { settings: TetherDivergenceSettings } {
  return { settings: TETHER_STRETCH_SETTINGS };
}

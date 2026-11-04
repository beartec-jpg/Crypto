// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { TIDE_ZONE_SETTINGS, type TideZoneSettings } from '@/types/tideZoneSettings';

/**
 * Tide Zone runs on fixed, research-backed presets (issue #609): there are no user settings.
 * Old `tide-zone-settings-v2` localStorage values are never read, so stale customisations
 * cannot change the indicator.
 */
export function useTideZoneSettings(): { settings: TideZoneSettings } {
  return { settings: TIDE_ZONE_SETTINGS };
}

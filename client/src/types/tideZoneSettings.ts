export interface TideZoneSettings {
  emaPeriod: number;
  confirmBars: number;
  minGap: number;
  /** EMA troughs must be below this score (e.g. -10). */
  belowScore: number;
  /** Higher EMA low must lift at least this many points. */
  emaSep: number;
  /** Price lower-low as a fraction (0.003 = 0.3%). */
  priceLlPct: number;
  keep: number;
  showDiv: boolean;
  showAbsorb: boolean;
  divColor: string;
  absorbColor: string;
}

export const DEFAULT_TIDE_ZONE_SETTINGS: TideZoneSettings = {
  emaPeriod: 8,
  confirmBars: 5,
  minGap: 8,
  belowScore: -10,
  emaSep: 8,
  priceLlPct: 0.003,
  keep: 8,
  showDiv: true,
  showAbsorb: true,
  divColor: '#c084fc',
  absorbColor: '#22d3ee',
};

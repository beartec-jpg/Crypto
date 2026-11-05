export type TetherDivergenceTimeframe = '1D' | '1W';
/** Signal kinds drawn on the price chart: bottom = "Stretch +", top = "Stretch -". */
export type TetherMarkerOnCross = 'bottom' | 'watch' | 'top';

export interface TetherDivergenceSettings {
  timeframe: TetherDivergenceTimeframe;
  usdtRsiLen: number;
  coinRsiLen: number;
  emaLen: number;
  bbLen: number;
  bbMult: number;
  emaDistFullPct: number;
  wRsi: number;
  wEma: number;
  wBb: number;
  wStretch: number;
  wCoin: number;
  bottomThreshold: number;
  watchThreshold: number;
  bottomColor: string;
  watchColor: string;
  neutralColor: string;
  usdtRsiColor: string;
  coinRsiColor: string;
  gapColor: string;
  topColor: string;
  gapUsdtMin: number;
  gapCoinMax: number;
  topThreshold: number;
  /** Divergence ladder (daily coin RSI vs price) pivot half-width, bars. */
  divPivotBars: number;
  /** Max bars between the two pivots of one divergence. */
  divMaxGapBars: number;
  /** Ladder zone lifetime after a Stretch signal, bars. */
  ladderZoneBars: number;
  /** Ladder zone ends when price runs this fraction beyond the Stretch bar extreme. */
  ladderExpiryPct: number;
  bullDivColor: string;
  bullHiddenColor: string;
  bearDivColor: string;
  bearHiddenColor: string;
}

/**
 * Tether Stretch runs on fixed values (Scott 2026-11-05, backtest in issue #612: 10 of 13 settings were
 * flat, none held up out of sample), so there is no settings panel. Old
 * `tether-divergence-settings-v1` localStorage values are never read.
 */
export const TETHER_STRETCH_SETTINGS: TetherDivergenceSettings = {
  timeframe: '1D',
  usdtRsiLen: 14,
  coinRsiLen: 14,
  emaLen: 20,
  bbLen: 20,
  bbMult: 2,
  emaDistFullPct: 4,
  wRsi: 1,
  wEma: 1,
  wBb: 1,
  wStretch: 1,
  wCoin: 1,
  bottomThreshold: 80,
  watchThreshold: 60,
  bottomColor: '#22c55e',
  watchColor: '#f59e0b',
  neutralColor: '#6b7280',
  usdtRsiColor: '#38bdf8',
  coinRsiColor: '#f472b6',
  gapColor: '#22d3ee',
  topColor: '#ef4444',
  gapUsdtMin: 65,
  gapCoinMax: 35,
  topThreshold: 80,
  divPivotBars: 5,
  divMaxGapBars: 60,
  ladderZoneBars: 40,
  ladderExpiryPct: 0.2,
  bullDivColor: '#22c55e',
  bullHiddenColor: '#2dd4bf',
  bearDivColor: '#ef4444',
  bearHiddenColor: '#fb923c',
};

/** @deprecated alias kept for older imports/tests. */
export const DEFAULT_TETHER_DIVERGENCE_SETTINGS = TETHER_STRETCH_SETTINGS;

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, x));
}

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

export function normalizeTetherDivergenceSettings(
  raw: Partial<TetherDivergenceSettings> | null | undefined,
): TetherDivergenceSettings {
  const d = DEFAULT_TETHER_DIVERGENCE_SETTINGS;
  const s = { ...d, ...(raw || {}) };
  const timeframe: TetherDivergenceTimeframe = s.timeframe === '1W' ? '1W' : '1D';
  const bottomThreshold = clamp(s.bottomThreshold, 50, 100, d.bottomThreshold);
  let watchThreshold = clamp(s.watchThreshold, 0, 100, d.watchThreshold);
  if (watchThreshold > bottomThreshold) watchThreshold = bottomThreshold;
  const wRsi = clamp(s.wRsi, 0, 5, d.wRsi);
  const wEma = clamp(s.wEma, 0, 5, d.wEma);
  const wBb = clamp(s.wBb, 0, 5, d.wBb);
  const wStretch = clamp(s.wStretch, 0, 5, d.wStretch);
  const wCoin = clamp(s.wCoin, 0, 5, d.wCoin);
  return {
    timeframe,
    usdtRsiLen: Math.round(clamp(s.usdtRsiLen, 2, 50, d.usdtRsiLen)),
    coinRsiLen: Math.round(clamp(s.coinRsiLen, 2, 50, d.coinRsiLen)),
    emaLen: Math.round(clamp(s.emaLen, 2, 50, d.emaLen)),
    bbLen: Math.round(clamp(s.bbLen, 2, 50, d.bbLen)),
    bbMult: clamp(s.bbMult, 0.5, 5, d.bbMult),
    emaDistFullPct: clamp(s.emaDistFullPct, 0.5, 20, d.emaDistFullPct),
    wRsi: wRsi + wEma + wBb === 0 ? 1 : wRsi,
    wEma: wRsi + wEma + wBb === 0 ? 1 : wEma,
    wBb: wRsi + wEma + wBb === 0 ? 1 : wBb,
    wStretch: wStretch + wCoin === 0 ? 1 : wStretch,
    wCoin: wStretch + wCoin === 0 ? 1 : wCoin,
    bottomThreshold,
    watchThreshold,
    bottomColor: color(s.bottomColor, d.bottomColor),
    watchColor: color(s.watchColor, d.watchColor),
    neutralColor: color(s.neutralColor, d.neutralColor),
    usdtRsiColor: color(s.usdtRsiColor, d.usdtRsiColor),
    coinRsiColor: color(s.coinRsiColor, d.coinRsiColor),
    gapColor: color(s.gapColor, d.gapColor),
    topColor: color(s.topColor, d.topColor),
    gapUsdtMin: clamp(s.gapUsdtMin, 50, 100, d.gapUsdtMin),
    gapCoinMax: clamp(s.gapCoinMax, 0, 50, d.gapCoinMax),
    topThreshold: clamp(s.topThreshold, 50, 100, d.topThreshold),
    divPivotBars: Math.round(clamp(s.divPivotBars, 1, 20, d.divPivotBars)),
    divMaxGapBars: Math.round(clamp(s.divMaxGapBars, 2, 365, d.divMaxGapBars)),
    ladderZoneBars: Math.round(clamp(s.ladderZoneBars, 1, 365, d.ladderZoneBars)),
    ladderExpiryPct: clamp(s.ladderExpiryPct, 0.01, 1, d.ladderExpiryPct),
    bullDivColor: color(s.bullDivColor, d.bullDivColor),
    bullHiddenColor: color(s.bullHiddenColor, d.bullHiddenColor),
    bearDivColor: color(s.bearDivColor, d.bearDivColor),
    bearHiddenColor: color(s.bearHiddenColor, d.bearHiddenColor),
  };
}

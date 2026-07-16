import {
  detectDivergence,
  detectDivergences,
  getOscillatorDivergence,
} from '@/lib/calculations/divergenceCalculations';
import type { CandleData } from '@/types/chart.types';
import {
  CRYPTO_AI_SESSION_DISPLAY_NAMES,
  type CryptoAiSessionLabel,
  type CryptoAiSessionSnapshot,
} from '@shared/cryptoAiConfig';

type SessionWindowConfig = {
  session: CryptoAiSessionLabel;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

type SessionWindow = SessionWindowConfig & {
  start: Date;
  end: Date;
  isActive: boolean;
};

export type SessionMetrics = {
  session: CryptoAiSessionLabel;
  label: string;
  percentChange: number | null;
  direction: 'up' | 'down' | 'flat';
  range: number | null;
  volumeRatio: number | null;
  closePosition: number | null;
  closePositionLabel: string;
  divergenceBadge: string;
  handoff: string;
  isActive: boolean;
};

export type SessionBoardSection = {
  session: CryptoAiSessionLabel;
  label: string;
  snapshot: CryptoAiSessionSnapshot | null;
  metrics: SessionMetrics;
};

const SESSION_WINDOWS: SessionWindowConfig[] = [
  { session: 'asia', startHour: 0, startMinute: 0, endHour: 7, endMinute: 0 },
  { session: 'london', startHour: 7, startMinute: 0, endHour: 13, endMinute: 30 },
  { session: 'new_york', startHour: 13, startMinute: 30, endHour: 24, endMinute: 0 },
];

const OSCILLATOR_CONFIG = {
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  stochRSIPeriod: 14,
  mfiPeriod: 14,
  williamsRPeriod: 14,
  cciPeriod: 20,
  adxPeriod: 14,
};

function startOfSessionForDate(config: SessionWindowConfig, date: Date, referenceNow: Date = new Date()): SessionWindow {
  const start = new Date(date);
  start.setUTCHours(config.startHour % 24, config.startMinute, 0, 0);

  const end = new Date(start);
  if (config.endHour === 24) {
    end.setUTCDate(end.getUTCDate() + 1);
    end.setUTCHours(0, config.endMinute, 0, 0);
  } else {
    end.setUTCHours(config.endHour, config.endMinute, 0, 0);
  }

  return {
    ...config,
    start,
    end,
    isActive: referenceNow >= start && referenceNow < end,
  };
}

function getLatestSessionWindow(session: CryptoAiSessionLabel, now: Date): SessionWindow {
  const config = SESSION_WINDOWS.find((entry) => entry.session === session)!;
  const todayWindow = startOfSessionForDate(config, now, now);
  if (now >= todayWindow.start) {
    return { ...todayWindow, isActive: now < todayWindow.end };
  }

  const previousDay = new Date(now);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  return startOfSessionForDate(config, previousDay, now);
}

function getPreviousSessionWindow(sessionWindow: SessionWindow): SessionWindow {
  const sessionIndex = SESSION_WINDOWS.findIndex((entry) => entry.session === sessionWindow.session);
  const previousConfig = SESSION_WINDOWS[(sessionIndex - 1 + SESSION_WINDOWS.length) % SESSION_WINDOWS.length];
  const anchor = new Date(sessionWindow.start);
  anchor.setUTCMinutes(anchor.getUTCMinutes() - 1);
  return getLatestSessionWindow(previousConfig.session, anchor);
}

function candlesInWindow(candles: CandleData[], start: Date, end: Date): CandleData[] {
  const startSeconds = start.getTime() / 1000;
  const endSeconds = end.getTime() / 1000;
  return candles.filter((candle) => candle.time >= startSeconds && candle.time < endSeconds);
}

function buildCvdSeries(candles: CandleData[]): number[] {
  let running = 0;
  return candles.map((candle) => {
    const delta = candle.close >= candle.open ? candle.volume : -candle.volume;
    running += delta;
    return running;
  });
}

function getSessionDirection(candles: CandleData[]): 'up' | 'down' | 'flat' {
  if (candles.length === 0) return 'flat';
  const open = candles[0].open;
  const close = candles[candles.length - 1].close;
  if (close > open) return 'up';
  if (close < open) return 'down';
  return 'flat';
}

function formatDivergenceBadge(candles: CandleData[]): string {
  if (candles.length < 30) return '—';

  const alerts = detectDivergences(candles, {
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    mfiPeriod: 14,
  });
  const latestAlert = alerts[alerts.length - 1];
  const oscillatorSignals = ['RSI', 'MACD', 'OBV'].map((indicator) => getOscillatorDivergence(indicator, candles, OSCILLATOR_CONFIG));
  const cvdSeries = buildCvdSeries(candles);
  const cvdStrength = detectDivergence(candles.map((candle) => candle.close), cvdSeries);
  const strongest = oscillatorSignals.reduce(
    (best, current) => Math.abs(current.strength) > Math.abs(best.strength) ? current : best,
    { strength: cvdStrength, type: cvdStrength > 0 ? 'bullish' as const : cvdStrength < 0 ? 'bearish' as const : 'none' as const },
  );

  if (latestAlert) {
    return latestAlert.direction === 'bullish' ? 'Bull div ⚠' : 'Bear div ⚠';
  }
  if (strongest.type === 'bullish') return 'Bull div ⚠';
  if (strongest.type === 'bearish') return 'Bear div ⚠';
  return '—';
}

function getAverageHistoricalVolume(candles: CandleData[], session: CryptoAiSessionLabel, referenceStart: Date, periods = 5): number | null {
  const config = SESSION_WINDOWS.find((entry) => entry.session === session)!;
  const volumes: number[] = [];
  for (let offset = 1; offset <= periods; offset += 1) {
    const date = new Date(referenceStart);
    date.setUTCDate(date.getUTCDate() - offset);
    const window = startOfSessionForDate(config, date);
    const sessionCandles = candlesInWindow(candles, window.start, window.end);
    if (sessionCandles.length === 0) continue;
    volumes.push(sessionCandles.reduce((sum, candle) => sum + candle.volume, 0));
  }
  if (volumes.length === 0) return null;
  return volumes.reduce((sum, value) => sum + value, 0) / volumes.length;
}

function getClosePositionLabel(closePosition: number | null): string {
  if (closePosition === null) return '—';
  if (closePosition >= 0.8) return 'Near high';
  if (closePosition <= 0.2) return 'Near low';
  return 'Mid-range';
}

function buildHandoff(direction: SessionMetrics['direction'], previousDirection: SessionMetrics['direction']): string {
  if (direction === 'flat' || previousDirection === 'flat') return '→ neutral';
  return direction === previousDirection ? '↗ continuation' : '↘ reversal';
}

function buildMetricsForWindow(candles: CandleData[], sessionWindow: SessionWindow, allCandles: CandleData[]): SessionMetrics {
  if (candles.length === 0) {
    return {
      session: sessionWindow.session,
      label: CRYPTO_AI_SESSION_DISPLAY_NAMES[sessionWindow.session],
      percentChange: null,
      direction: 'flat',
      range: null,
      volumeRatio: null,
      closePosition: null,
      closePositionLabel: '—',
      divergenceBadge: '—',
      handoff: '→ neutral',
      isActive: sessionWindow.isActive,
    };
  }

  const open = candles[0].open;
  const close = candles[candles.length - 1].close;
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const volume = candles.reduce((sum, candle) => sum + candle.volume, 0);
  const averageVolume = getAverageHistoricalVolume(allCandles, sessionWindow.session, sessionWindow.start);
  const range = high - low;
  const closePosition = range > 0 ? (close - low) / range : null;

  return {
    session: sessionWindow.session,
    label: CRYPTO_AI_SESSION_DISPLAY_NAMES[sessionWindow.session],
    percentChange: open ? ((close - open) / open) * 100 : null,
    direction: getSessionDirection(candles),
    range,
    volumeRatio: averageVolume && averageVolume > 0 ? volume / averageVolume : null,
    closePosition,
    closePositionLabel: getClosePositionLabel(closePosition),
    divergenceBadge: formatDivergenceBadge(candles),
    handoff: '→ neutral',
    isActive: sessionWindow.isActive,
  };
}

export function parseKlinesToCandles(klines: any[]): CandleData[] {
  return klines.map((entry) => ({
    time: Number(entry[0]) / 1000,
    open: Number(entry[1]),
    high: Number(entry[2]),
    low: Number(entry[3]),
    close: Number(entry[4]),
    volume: Number(entry[5]),
  }));
}

export function mapSnapshotsBySession(snapshots: unknown): Record<CryptoAiSessionLabel, CryptoAiSessionSnapshot | null> {
  const mapped: Record<CryptoAiSessionLabel, CryptoAiSessionSnapshot | null> = {
    asia: null,
    london: null,
    new_york: null,
  };

  if (!Array.isArray(snapshots)) {
    return mapped;
  }

  const ordered = [...snapshots]
    .filter((snapshot): snapshot is CryptoAiSessionSnapshot => Boolean(snapshot && typeof snapshot === 'object' && 'session' in (snapshot as Record<string, unknown>)))
    .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime());

  for (const snapshot of ordered) {
    if (!mapped[snapshot.session]) {
      mapped[snapshot.session] = snapshot;
    }
  }

  return mapped;
}

export function buildSessionBoardSections(candles: CandleData[], snapshots: unknown, now: Date = new Date()): SessionBoardSection[] {
  const snapshotMap = mapSnapshotsBySession(snapshots);
  const sessionWindows = SESSION_WINDOWS.map((entry) => getLatestSessionWindow(entry.session, now));
  const metricsBySession = new Map<CryptoAiSessionLabel, SessionMetrics>();

  for (const sessionWindow of sessionWindows) {
    const currentMetrics = buildMetricsForWindow(
      candlesInWindow(candles, sessionWindow.start, sessionWindow.end),
      sessionWindow,
      candles,
    );
    const previousWindow = getPreviousSessionWindow(sessionWindow);
    const previousMetrics = buildMetricsForWindow(
      candlesInWindow(candles, previousWindow.start, previousWindow.end),
      previousWindow,
      candles,
    );
    currentMetrics.handoff = buildHandoff(currentMetrics.direction, previousMetrics.direction);
    metricsBySession.set(sessionWindow.session, currentMetrics);
  }

  return sessionWindows.map((sessionWindow) => ({
    session: sessionWindow.session,
    label: CRYPTO_AI_SESSION_DISPLAY_NAMES[sessionWindow.session],
    snapshot: snapshotMap[sessionWindow.session],
    metrics: metricsBySession.get(sessionWindow.session)!,
  }));
}

export function getLatestSnapshotInsights(snapshots: unknown): unknown {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  const ordered = [...snapshots]
    .filter((snapshot): snapshot is CryptoAiSessionSnapshot => Boolean(snapshot && typeof snapshot === 'object' && 'generatedAt' in (snapshot as Record<string, unknown>)))
    .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime());
  return ordered[0]?.multiTFInsights ?? null;
}

export function getLatestSnapshotUpdatedAt(snapshots: unknown): string | null {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  const ordered = [...snapshots]
    .filter((snapshot): snapshot is CryptoAiSessionSnapshot => Boolean(snapshot && typeof snapshot === 'object' && 'generatedAt' in (snapshot as Record<string, unknown>)))
    .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime());
  return ordered[0]?.generatedAt ?? null;
}

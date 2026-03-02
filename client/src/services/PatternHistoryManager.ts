import type { Snapshot } from '@/services/patternDetectors.ts';
import { shouldUpdatePatternSnapshot } from '@/services/patternDetectors.ts';

const SNAPSHOT_LIMIT = 288;
const HISTORY_WINDOW_MS = 48 * 60 * 60 * 1000;

function getKey(symbol: string): string {
  return `gds_history_${symbol}`;
}

function sanitizeSnapshot(snapshot: Snapshot): Snapshot {
  return {
    timestamp: Number.isFinite(snapshot.timestamp) ? snapshot.timestamp : Date.now(),
    price: Number.isFinite(snapshot.price) ? snapshot.price : 0,
    cvdDelta: Number.isFinite(snapshot.cvdDelta) ? snapshot.cvdDelta : 0,
    oiChangePct: Number.isFinite(snapshot.oiChangePct) ? snapshot.oiChangePct : 0,
    fundingRate: Number.isFinite(snapshot.fundingRate) ? snapshot.fundingRate : 0,
    premium: Number.isFinite(snapshot.premium) ? snapshot.premium : 0,
    volume: Number.isFinite(snapshot.volume) ? snapshot.volume : 0,
  };
}

function sortAndTrim(history: Snapshot[], now: number): Snapshot[] {
  const minTimestamp = now - HISTORY_WINDOW_MS;

  return history
    .filter((item) => item.timestamp >= minTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-SNAPSHOT_LIMIT);
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export class PatternHistoryManager {
  static getHistory(symbol: string): Snapshot[] {
    if (!hasStorage()) return [];

    try {
      const raw = window.localStorage.getItem(getKey(symbol));
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const normalized = parsed.map((item) => sanitizeSnapshot(item as Snapshot));
      const cleaned = sortAndTrim(normalized, Date.now());

      if (cleaned.length !== normalized.length) {
        window.localStorage.setItem(getKey(symbol), JSON.stringify(cleaned));
      }

      return cleaned;
    } catch {
      return [];
    }
  }

  static appendSnapshot(symbol: string, snapshot: Snapshot): Snapshot[] {
    if (!hasStorage()) return [];

    const now = snapshot.timestamp;
    const history = this.getHistory(symbol);
    const previous = history.length > 0 ? history[history.length - 1] : null;
    const normalized = sanitizeSnapshot(snapshot);

    const nextHistory = [...history];

    if (shouldUpdatePatternSnapshot(previous, now)) {
      nextHistory.push(normalized);
    } else {
      const cleaned = sortAndTrim(nextHistory, now);
      window.localStorage.setItem(getKey(symbol), JSON.stringify(cleaned));
      return cleaned;
    }

    const cleaned = sortAndTrim(nextHistory, now);
    window.localStorage.setItem(getKey(symbol), JSON.stringify(cleaned));

    return cleaned;
  }

  static clear(symbol: string): void {
    if (!hasStorage()) return;
    window.localStorage.removeItem(getKey(symbol));
  }
}

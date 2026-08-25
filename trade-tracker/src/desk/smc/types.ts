/**
 * Persistent SMC map types. Detection is versioned — bump ENGINE_VERSION
 * if FVG width, swing lookback, or mitigation rules change.
 */

export const SMC_ENGINE_VERSION = 1;

export type ZoneKind = 'fvg' | 'ob';
export type ZoneDir = 'bullish' | 'bearish';
export type EventType = 'bos' | 'choch';
export type SwingKind = 'high' | 'low';

export interface StoredZone {
  id: string;
  symbol: string;
  timeframe: string;
  kind: ZoneKind;
  direction: ZoneDir;
  low: number;
  high: number;
  originSwing: number;
  impulseExtreme: number;
  width: number;
  atrMultiple: number;
  suggestedStop: number;
  createdAtBar: number;
  mitigated: boolean;
  mitigatedAtBar: number | null;
  tests: number;
  lastTestedAtBar: number | null;
}

export interface StoredSwing {
  id: string;
  symbol: string;
  timeframe: string;
  kind: SwingKind;
  price: number;
  barTime: number;
}

export interface StoredEvent {
  id: string;
  symbol: string;
  timeframe: string;
  eventType: EventType;
  direction: ZoneDir;
  price: number;
  barTime: number;
  brokenSwing: number | null;
}

export interface TfState {
  symbol: string;
  timeframe: string;
  lastBarTime: number;
  lastPrice: number;
  atr: number;
  bos: string;
  choch: string;
  engineVersion: number;
}

export interface VolumeLevels {
  symbol: string;
  timeframe: string;
  poc: number;
  vah: number;
  val: number;
  barsUsed: number;
  asOfBar: number;
}

/** Tool-facing zone (compatible with SmcZone + lifecycle). */
export interface LiveZone {
  id: string;
  low: number;
  high: number;
  originSwing: number;
  impulseExtreme: number;
  width: number;
  atrMultiple: number;
  mitigated: boolean;
  suggestedStop: number;
  tests: number;
  createdAt: number;
  mitigatedAt: number | null;
}

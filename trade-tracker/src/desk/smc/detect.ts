/**
 * Deterministic SMC detection. Pure functions — no I/O.
 * Mitigation rule (v1): a zone is mitigated when a bar CLOSES through
 * the invalidating edge (bullish: close < low; bearish: close > high).
 * Wicks that overlap the zone without a close-through are tests, not mitigation.
 */

import { createHash } from 'node:crypto';
import type { Bar } from '../marketStructure.js';
import { SMC_ENGINE_VERSION, type EventType, type ZoneDir, type ZoneKind } from './types.js';

export { SMC_ENGINE_VERSION };

export const MIN_FVG_ATR = 0.25;
export const MIN_OB_ATR = 0.35;

export function swingLookbackForTf(tf: string): number {
  return tf === '5m' || tf === '3m' || tf === '1m' ? 5 : 3;
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

export function makeId(parts: Array<string | number>): string {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

export function makeZoneId(opts: {
  symbol: string;
  timeframe: string;
  kind: ZoneKind;
  direction: ZoneDir;
  createdAtBar: number;
  low: number;
  high: number;
  originSwing: number;
}): string {
  return makeId([
    `v${SMC_ENGINE_VERSION}`,
    opts.symbol,
    opts.timeframe,
    opts.kind,
    opts.direction,
    opts.createdAtBar,
    round6(opts.low),
    round6(opts.high),
    round6(opts.originSwing),
  ]);
}

export interface RawZone {
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
}

export interface SwingPoint {
  time: number;
  price: number;
  kind: 'high' | 'low';
  index: number;
}

export interface StructureEvent {
  eventType: EventType;
  direction: ZoneDir;
  price: number;
  barTime: number;
  brokenSwing: number | null;
}

/** Close-through mitigation. Stick to this rule. */
export function zoneMitigatedByClose(direction: ZoneDir, low: number, high: number, close: number): boolean {
  if (direction === 'bullish') return close < low;
  return close > high;
}

/** Wick overlapped the zone without a close-through. */
export function zoneWickTested(
  direction: ZoneDir,
  low: number,
  high: number,
  bar: { high: number; low: number; close: number },
): boolean {
  if (zoneMitigatedByClose(direction, low, high, bar.close)) return false;
  return bar.low <= high && bar.high >= low;
}

export function detectFvgZones(bars: Bar[], atrVal: number): RawZone[] {
  const out: RawZone[] = [];
  if (bars.length < 3) return out;
  const minWidth = atrVal > 0 ? atrVal * MIN_FVG_ATR : 0;
  for (let i = 2; i < bars.length; i++) {
    const a = bars[i - 2];
    const impulse = bars[i - 1];
    const c = bars[i];
    if (c.low > a.high) {
      const width = c.low - a.high;
      if (width < minWidth) continue;
      const originSwing = Math.min(a.low, impulse.low);
      out.push({
        kind: 'fvg',
        direction: 'bullish',
        low: a.high,
        high: c.low,
        originSwing,
        impulseExtreme: impulse.low,
        width,
        atrMultiple: atrVal > 0 ? width / atrVal : 0,
        suggestedStop: originSwing,
        createdAtBar: c.time,
      });
    }
    if (c.high < a.low) {
      const width = a.low - c.high;
      if (width < minWidth) continue;
      const originSwing = Math.max(a.high, impulse.high);
      out.push({
        kind: 'fvg',
        direction: 'bearish',
        low: c.high,
        high: a.low,
        originSwing,
        impulseExtreme: impulse.high,
        width,
        atrMultiple: atrVal > 0 ? width / atrVal : 0,
        suggestedStop: originSwing,
        createdAtBar: c.time,
      });
    }
  }
  return out;
}

export function detectObZones(bars: Bar[], atrVal: number): RawZone[] {
  const out: RawZone[] = [];
  if (bars.length < 3) return out;
  const minRange = atrVal > 0 ? atrVal * MIN_OB_ATR : 0;
  for (let i = 1; i < bars.length - 1; i++) {
    const b = bars[i];
    const body = Math.abs(b.close - b.open);
    const range = b.high - b.low || 1e-9;
    if (body / range < 0.35) continue;
    if (range < minRange) continue;
    const next = bars[i + 1];
    if (b.close > b.open && next.close > b.high) {
      const originSwing = b.low;
      out.push({
        kind: 'ob',
        direction: 'bullish',
        low: b.low,
        high: Math.max(b.open, b.close),
        originSwing,
        impulseExtreme: b.low,
        width: range,
        atrMultiple: atrVal > 0 ? range / atrVal : 0,
        suggestedStop: originSwing,
        createdAtBar: next.time,
      });
    }
    if (b.close < b.open && next.close < b.low) {
      const originSwing = b.high;
      out.push({
        kind: 'ob',
        direction: 'bearish',
        low: Math.min(b.open, b.close),
        high: b.high,
        originSwing,
        impulseExtreme: b.high,
        width: range,
        atrMultiple: atrVal > 0 ? range / atrVal : 0,
        suggestedStop: originSwing,
        createdAtBar: next.time,
      });
    }
  }
  return out;
}

export function detectSwingPoints(bars: Bar[], lookback = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  if (bars.length < lookback * 2 + 1) return points;
  for (let i = lookback; i < bars.length - lookback; i++) {
    const w = bars.slice(i - lookback, i + lookback + 1);
    const hi = Math.max(...w.map((b) => b.high));
    const lo = Math.min(...w.map((b) => b.low));
    if (bars[i].high === hi) {
      points.push({ time: bars[i].time, price: bars[i].high, kind: 'high', index: i });
    }
    if (bars[i].low === lo) {
      points.push({ time: bars[i].time, price: bars[i].low, kind: 'low', index: i });
    }
  }
  return points;
}

export function bosChochState(bars: Bar[], lookback = 3): { bos: string; choch: string } {
  const points = detectSwingPoints(bars, lookback);
  const highs = points.filter((p) => p.kind === 'high');
  const lows = points.filter((p) => p.kind === 'low');
  const price = bars[bars.length - 1]?.close || 0;
  let bos = 'none';
  let choch = 'none';
  const lastHigh = highs[highs.length - 1]?.price;
  const lastLow = lows[lows.length - 1]?.price;
  if (lastHigh && price > lastHigh) bos = 'bullish';
  if (lastLow && price < lastLow) bos = 'bearish';
  if (highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price) choch = 'bearish';
  if (lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price) choch = 'bullish';
  return { bos, choch };
}

/** Walk bars and emit BOS/CHoCH when the state first flips. */
export function detectStructureEvents(bars: Bar[], lookback = 3): StructureEvent[] {
  const events: StructureEvent[] = [];
  if (bars.length < lookback * 2 + 6) return events;
  let prevBos = 'none';
  let prevChoch = 'none';
  const start = Math.max(lookback * 2 + 4, bars.length - 200);
  for (let i = start; i < bars.length; i++) {
    const slice = bars.slice(0, i + 1);
    const cur = bosChochState(slice, lookback);
    const bar = bars[i];
    if (cur.bos !== prevBos && cur.bos !== 'none') {
      events.push({
        eventType: 'bos',
        direction: cur.bos as ZoneDir,
        price: bar.close,
        barTime: bar.time,
        brokenSwing: null,
      });
    }
    if (cur.choch !== prevChoch && cur.choch !== 'none') {
      events.push({
        eventType: 'choch',
        direction: cur.choch as ZoneDir,
        price: bar.close,
        barTime: bar.time,
        brokenSwing: null,
      });
    }
    prevBos = cur.bos;
    prevChoch = cur.choch;
  }
  return events;
}

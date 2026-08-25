/**
 * Read-only live SMC picture for Grok tools.
 */

import type pg from 'pg';
import { SMC_ENGINE_VERSION } from './detect.js';
import { loadEvents, loadSwings, loadTfState, loadVolume, loadZoneById, loadZones } from './store.js';
import type { LiveZone, StoredZone } from './types.js';

function toLive(z: StoredZone): LiveZone {
  return {
    id: z.id,
    low: z.low,
    high: z.high,
    originSwing: z.originSwing,
    impulseExtreme: z.impulseExtreme,
    width: z.width,
    atrMultiple: z.atrMultiple,
    mitigated: z.mitigated,
    suggestedStop: z.suggestedStop,
    tests: z.tests,
    createdAt: z.createdAtBar,
    mitigatedAt: z.mitigatedAtBar,
  };
}

function pickBucket(zones: StoredZone[], kind: StoredZone['kind'], dir: StoredZone['direction'], live = 10, dead = 3): LiveZone[] {
  const list = zones.filter((z) => z.kind === kind && z.direction === dir);
  const open = list.filter((z) => !z.mitigated).sort((a, b) => b.atrMultiple - a.atrMultiple || b.createdAtBar - a.createdAtBar);
  const closed = list
    .filter((z) => z.mitigated)
    .sort((a, b) => (b.mitigatedAtBar || 0) - (a.mitigatedAtBar || 0));
  return [...open.slice(0, live), ...closed.slice(0, dead)].map(toLive);
}

export async function readSmcSnapshot(pool: pg.Pool, symbol: string, timeframe: string) {
  const sym = symbol.toUpperCase();
  const st = await loadTfState(pool, sym, timeframe);
  if (!st) return null;
  const [zones, swings, events, vol] = await Promise.all([
    loadZones(pool, sym, timeframe),
    loadSwings(pool, sym, timeframe),
    loadEvents(pool, sym, timeframe, 12),
    loadVolume(pool, sym, timeframe),
  ]);
  const highs = swings.filter((s) => s.kind === 'high').slice(-6);
  const lows = swings.filter((s) => s.kind === 'low').slice(-6);
  const lastBos = events.find((e) => e.eventType === 'bos') || null;
  const lastChoch = events.find((e) => e.eventType === 'choch') || null;

  return {
    source: 'live_state' as const,
    engineVersion: SMC_ENGINE_VERSION,
    asOf: new Date().toISOString(),
    timeframe,
    price: st.lastPrice,
    atr: Number(st.atr.toFixed(6)),
    lastBarTime: st.lastBarTime,
    minStopAtrMultiple: 0.5,
    stopNote:
      'Default SL = originSwing (pivot that created the FVG/OB). Zone `id` is stable across cycles. tests = wick touches without close-through. mitigated = close through the zone. Do not park SL a tick beyond the gap.',
    bos: st.bos,
    choch: st.choch,
    lastBos: lastBos
      ? { id: lastBos.id, direction: lastBos.direction, price: lastBos.price, barTime: lastBos.barTime }
      : null,
    lastChoch: lastChoch
      ? { id: lastChoch.id, direction: lastChoch.direction, price: lastChoch.price, barTime: lastChoch.barTime }
      : null,
    swingHighs: highs.map((s) => s.price),
    swingLows: lows.map((s) => s.price),
    recentEvents: events.slice(0, 8).map((e) => ({
      id: e.id,
      type: e.eventType,
      direction: e.direction,
      price: e.price,
      barTime: e.barTime,
    })),
    volume: vol ? { poc: vol.poc, vah: vol.vah, val: vol.val, barsUsed: vol.barsUsed } : null,
    bullishFVGs: pickBucket(zones, 'fvg', 'bullish'),
    bearishFVGs: pickBucket(zones, 'fvg', 'bearish'),
    bullishOBs: pickBucket(zones, 'ob', 'bullish'),
    bearishOBs: pickBucket(zones, 'ob', 'bearish'),
  };
}

export async function readZoneHistory(pool: pg.Pool, zoneId: string) {
  const z = await loadZoneById(pool, zoneId);
  if (!z) return { error: 'unknown zone_id', id: zoneId };
  return {
    source: 'live_state' as const,
    zone: toLive(z),
    kind: z.kind,
    direction: z.direction,
    symbol: z.symbol,
    timeframe: z.timeframe,
    lifecycle: z.mitigated ? 'mitigated' : z.tests > 0 ? 'tested' : 'created',
  };
}

export async function readStructureSince(pool: pg.Pool, symbol: string, timeframe: string, sinceBar: number) {
  const events = await loadEvents(pool, symbol.toUpperCase(), timeframe, 40, sinceBar);
  return {
    source: 'live_state' as const,
    symbol: symbol.toUpperCase(),
    timeframe,
    sinceBar,
    events: events.map((e) => ({
      id: e.id,
      type: e.eventType,
      direction: e.direction,
      price: e.price,
      barTime: e.barTime,
    })),
  };
}

export function zonesFromSnapshot(snap: Awaited<ReturnType<typeof readSmcSnapshot>>, dir: 'LONG' | 'SHORT') {
  if (!snap) return [];
  if (dir === 'LONG') return [...snap.bullishFVGs, ...snap.bullishOBs];
  return [...snap.bearishFVGs, ...snap.bearishOBs];
}

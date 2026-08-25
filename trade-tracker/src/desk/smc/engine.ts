/**
 * Continuous SMC ingest. Fetches klines, merges into the persistent map,
 * updates mitigation on stored zones (even if they aged out of the window).
 * Grok never writes here.
 */

import type pg from 'pg';
import { atr, fetchBars, volumeProfilePayload, type Bar } from '../marketStructure.js';
import {
  SMC_ENGINE_VERSION,
  bosChochState,
  detectFvgZones,
  detectObZones,
  detectStructureEvents,
  detectSwingPoints,
  makeId,
  makeZoneId,
  swingLookbackForTf,
  zoneMitigatedByClose,
  zoneWickTested,
} from './detect.js';
import {
  insertEvents,
  loadTfState,
  loadZones,
  pruneEvents,
  pruneZones,
  replaceSwings,
  upsertTfState,
  upsertVolume,
  upsertZones,
} from './store.js';
import type { StoredEvent, StoredSwing, StoredZone } from './types.js';

const DEFAULT_INTERVAL_MS = 60_000;
const FETCH_LIMIT = 500;

function round6(n: number): number {
  return Number(n.toFixed(6));
}

export function deskStructureUniverse(): { symbols: string[]; timeframes: string[] } {
  const symbols = new Set<string>();
  const tfs = new Set<string>();
  const raw = (process.env.DESK_BOTS || '').trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const [id, syms, htf, ltf] = part.split('|').map((s) => s.trim());
      if (!id || !syms || !htf || !ltf) continue;
      for (const s of syms.split('+')) if (s) symbols.add(s.toUpperCase());
      tfs.add(htf.toLowerCase());
      tfs.add(ltf.toLowerCase());
    }
  } else {
    for (const s of (process.env.DESK_SYMBOLS || 'XRPUSDT').split(',')) {
      if (s.trim()) symbols.add(s.trim().toUpperCase());
    }
    tfs.add((process.env.DESK_HTF || '4h').toLowerCase());
    tfs.add((process.env.DESK_LTF || '15m').toLowerCase());
  }
  if (!symbols.size) symbols.add('XRPUSDT');
  if (!tfs.size) {
    tfs.add('4h');
    tfs.add('15m');
    tfs.add('1h');
    tfs.add('5m');
  }
  return { symbols: [...symbols], timeframes: [...tfs] };
}

function toStoredZone(symbol: string, timeframe: string, raw: ReturnType<typeof detectFvgZones>[0], last: Bar): StoredZone {
  const id = makeZoneId({
    symbol,
    timeframe,
    kind: raw.kind,
    direction: raw.direction,
    createdAtBar: raw.createdAtBar,
    low: raw.low,
    high: raw.high,
    originSwing: raw.originSwing,
  });
  const close = last.close;
  const mitigated = zoneMitigatedByClose(raw.direction, raw.low, raw.high, close);
  return {
    id,
    symbol,
    timeframe,
    kind: raw.kind,
    direction: raw.direction,
    low: round6(raw.low),
    high: round6(raw.high),
    originSwing: round6(raw.originSwing),
    impulseExtreme: round6(raw.impulseExtreme),
    width: round6(raw.width),
    atrMultiple: Number(raw.atrMultiple.toFixed(3)),
    suggestedStop: round6(raw.suggestedStop),
    createdAtBar: raw.createdAtBar,
    mitigated,
    mitigatedAtBar: mitigated ? last.time : null,
    tests: 0,
    lastTestedAtBar: null,
  };
}

export async function ingestTimeframe(
  pool: pg.Pool,
  symbol: string,
  timeframe: string,
  bars: Bar[],
): Promise<{ newZones: number; mitigated: number; newEvents: number; skipped: boolean }> {
  const sym = symbol.toUpperCase();
  if (bars.length < 10) return { newZones: 0, mitigated: 0, newEvents: 0, skipped: true };
  const last = bars[bars.length - 1];
  const prev = await loadTfState(pool, sym, timeframe);
  if (prev && Number(prev.lastBarTime) === last.time) {
    return { newZones: 0, mitigated: 0, newEvents: 0, skipped: true };
  }

  const atrVal = atr(bars);
  const lookback = swingLookbackForTf(timeframe);
  const existing = await loadZones(pool, sym, timeframe);
  const byId = new Map(existing.map((z) => [z.id, z]));

  const detected = [...detectFvgZones(bars, atrVal), ...detectObZones(bars, atrVal)];
  let newZones = 0;
  for (const raw of detected) {
    const z = toStoredZone(sym, timeframe, raw, last);
    const prevZ = byId.get(z.id);
    if (!prevZ) newZones++;
    byId.set(z.id, { ...(prevZ || z), ...z, tests: prevZ?.tests ?? 0 });
  }

  let newlyMitigated = 0;
  const merged: StoredZone[] = [];
  for (const z of byId.values()) {
    const next = { ...z };
    if (!next.mitigated && zoneMitigatedByClose(next.direction, next.low, next.high, last.close)) {
      next.mitigated = true;
      next.mitigatedAtBar = last.time;
      newlyMitigated++;
    } else if (!next.mitigated && zoneWickTested(next.direction, next.low, next.high, last)) {
      next.tests += 1;
      next.lastTestedAtBar = last.time;
    }
    merged.push(next);
  }

  await upsertZones(pool, merged);

  const swings = detectSwingPoints(bars, lookback).slice(-40);
  const storedSwings: StoredSwing[] = swings.map((s) => ({
    id: makeId([`v${SMC_ENGINE_VERSION}`, sym, timeframe, 'swing', s.kind, s.time, round6(s.price)]),
    symbol: sym,
    timeframe,
    kind: s.kind,
    price: round6(s.price),
    barTime: s.time,
  }));
  await replaceSwings(pool, sym, timeframe, storedSwings);

  const events = detectStructureEvents(bars, lookback);
  const storedEvents: StoredEvent[] = events.map((e) => ({
    id: makeId([
      `v${SMC_ENGINE_VERSION}`,
      sym,
      timeframe,
      e.eventType,
      e.direction,
      e.barTime,
      round6(e.price),
    ]),
    symbol: sym,
    timeframe,
    eventType: e.eventType,
    direction: e.direction,
    price: round6(e.price),
    barTime: e.barTime,
    brokenSwing: e.brokenSwing,
  }));
  const newEvents = await insertEvents(pool, storedEvents);

  const bc = bosChochState(bars, lookback);
  await upsertTfState(pool, {
    symbol: sym,
    timeframe,
    lastBarTime: last.time,
    lastPrice: last.close,
    atr: atrVal,
    bos: bc.bos,
    choch: bc.choch,
    engineVersion: SMC_ENGINE_VERSION,
  });

  const vp = volumeProfilePayload(bars, timeframe);
  await upsertVolume(pool, {
    symbol: sym,
    timeframe,
    poc: vp.poc,
    vah: vp.vah,
    val: vp.val,
    barsUsed: vp.barsUsed,
    asOfBar: last.time,
  });

  await pruneZones(pool, sym, timeframe);
  await pruneEvents(pool, sym, timeframe);

  return { newZones, mitigated: newlyMitigated, newEvents, skipped: false };
}

export async function ingestUniverse(pool: pg.Pool): Promise<void> {
  const { symbols, timeframes } = deskStructureUniverse();
  for (const symbol of symbols) {
    for (const tf of timeframes) {
      try {
        const bars = await fetchBars(symbol, tf, FETCH_LIMIT);
        const r = await ingestTimeframe(pool, symbol, tf, bars);
        if (!r.skipped) {
          console.log(
            `[smc] ${symbol} ${tf} newZones=${r.newZones} mitigated=${r.mitigated} events=${r.newEvents} bars=${bars.length}`,
          );
        }
      } catch (e: any) {
        console.warn(`[smc] ingest ${symbol} ${tf} failed:`, e?.message || e);
      }
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startStructureEngine(pool: pg.Pool): void {
  stopStructureEngine();
  const ms = Math.max(15_000, Number(process.env.SMC_ENGINE_INTERVAL_MS || DEFAULT_INTERVAL_MS));
  const { symbols, timeframes } = deskStructureUniverse();
  console.log(`[smc] engine ON symbols=${symbols.join(',')} tfs=${timeframes.join(',')} every ${ms}ms v${SMC_ENGINE_VERSION}`);

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await ingestUniverse(pool);
    } catch (e: any) {
      console.error('[smc] engine tick error', e?.message || e);
    } finally {
      running = false;
    }
  };

  void tick();
  timer = setInterval(() => void tick(), ms);
}

export function stopStructureEngine(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

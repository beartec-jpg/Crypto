/**
 * Partial-TP trade engine with entry confirmation + pre-TP1 stop lift
 *
 * Entry model:
 *  - touch: open as soon as price tags entry (legacy)
 *  - reclaim (default for AI): arm on first touch of entry, only OPEN after
 *    price reclaims entryConfirmLevel (e.g. LONG: hit zone then trade back above).
 *    Posted SL is a hint only. A wick through the zone is the sweep — stay armed,
 *    then on reclaim OPEN with SL = sweep extreme. Invalid only if the sweep
 *    runs too far (thesis dead) or TP prints before we ever confirm.
 *
 * After open:
 *  - Optional stop_lift before TP1
 *  - TP1: 50% close; TP2: runner
 */

export type Direction = 'LONG' | 'SHORT';

export type EntryConfirmType = 'touch' | 'reclaim';

export type TradeStatus =
  | 'pending'
  | 'entry_armed'
  | 'entry_hit'
  | 'entry_invalid'
  | 'tp1_hit'
  | 'tp_hit'
  | 'sl_hit'
  | 'be_hit'
  | 'cancelled';

export type Outcome = 'win' | 'loss' | 'scratch' | null;

export type EngineEventType =
  | 'entry_armed'
  | 'entry_hit'
  | 'entry_invalid'
  | 'sweep_update'
  | 'stop_lift'
  | 'tp1_hit'
  | 'stop_to_be'
  | 'tp2_hit'
  | 'sl_hit'
  | 'be_hit'
  | 'closed';

export interface EngineTrade {
  id: string;
  symbol: string;
  direction: Direction;
  grade: string;
  /** Tracker origin: discord_desk (HTF Discord) vs scalp_desk (LTF standalone). */
  source?: string;
  entry: number;
  originalStop: number;
  currentStop: number;
  targets: number[];
  entryConfirmType: EntryConfirmType;
  /** After zone touch, price must reclaim this level to open (LONG ≥, SHORT ≤). */
  entryConfirmLevel: number | null;
  entryConfirmRationale: string | null;
  stopLiftTrigger: number | null;
  stopLiftTo: number | null;
  stopLifted: boolean;
  remainingSize: number;
  tp1ClosedSize: number;
  stopToBe: boolean;
  status: TradeStatus;
  outcome: Outcome;
  realizedR: number;
  /** Running wick extreme while armed (LONG = lowest low, SHORT = highest high). */
  sweepExtreme?: number | null;
}

export interface EngineEvent {
  type: EngineEventType;
  price: number;
  sizeFraction: number;
  rDelta: number;
  realizedRAfter: number;
  message: string;
  newStatus: TradeStatus;
  newCurrentStop: number;
  newRemainingSize: number;
  newTp1ClosedSize: number;
  newStopToBe: boolean;
  newStopLifted: boolean;
  outcome: Outcome;
  closed: boolean;
  tpHitLevel?: number;
  /** On confirm: lock original stop to the sweep extreme. */
  newOriginalStop?: number;
  newSweepExtreme?: number;
}

export const TP1_SIZE = 0.5;
export const RUNNER_SIZE = 0.5;

export function riskPerUnit(entry: number, originalStop: number): number {
  return Math.abs(entry - originalStop);
}

export function rForFill(
  direction: Direction,
  entry: number,
  originalStop: number,
  exitPrice: number,
  size: number,
): number {
  const risk = riskPerUnit(entry, originalStop);
  if (risk <= 0 || size <= 0) return 0;
  const move = direction === 'LONG' ? exitPrice - entry : entry - exitPrice;
  return (move / risk) * size;
}

function hitLong(price: number, level: number): boolean {
  return price <= level;
}
function hitShort(price: number, level: number): boolean {
  return price >= level;
}
function hitEntry(direction: Direction, price: number, entry: number): boolean {
  return direction === 'LONG' ? hitLong(price, entry) : hitShort(price, entry);
}
function hitStop(direction: Direction, price: number, stop: number): boolean {
  return direction === 'LONG' ? hitLong(price, stop) : hitShort(price, stop);
}
function hitTarget(direction: Direction, price: number, target: number): boolean {
  return direction === 'LONG' ? price >= target : price <= target;
}
function hitStopLiftTrigger(direction: Direction, price: number, trigger: number): boolean {
  return direction === 'LONG' ? price >= trigger : price <= trigger;
}
function hitEntryConfirm(direction: Direction, price: number, level: number): boolean {
  // Reclaim: LONG trades back above confirm; SHORT trades back below
  return direction === 'LONG' ? price >= level : price <= level;
}
function isBetterStop(direction: Direction, candidate: number, current: number): boolean {
  return direction === 'LONG' ? candidate > current : candidate < current;
}
/** Hint SL is display/RR only. Sweep may run this far past entry before thesis is dead. */
function sweepInvalidDepth(trade: EngineTrade): number {
  const hint = Math.abs(trade.entry - trade.originalStop);
  const pct = Math.abs(trade.entry) * 0.0035;
  const fromHint = Number.isFinite(hint) && hint > 0 ? hint * 3 : 0;
  return Math.max(fromHint, pct, Math.abs(trade.entry) * 0.0002);
}

function mergeSweep(
  dir: Direction,
  prev: number | null | undefined,
  barExtreme: number,
): number {
  if (prev == null || !Number.isFinite(prev)) return barExtreme;
  return dir === 'LONG' ? Math.min(prev, barExtreme) : Math.max(prev, barExtreme);
}

function sweepDepth(dir: Direction, entry: number, extreme: number): number {
  return dir === 'LONG' ? entry - extreme : extreme - entry;
}

function paddedSweepStop(dir: Direction, entry: number, sweep: number): number {
  const depth = Math.abs(entry - sweep);
  const pad = Math.max(depth * 0.05, Math.abs(entry) * 0.00005);
  return dir === 'LONG' ? sweep - pad : sweep + pad;
}

function stopFromSweep(trade: EngineTrade, sweep: number | null | undefined): number {
  if (sweep == null || !Number.isFinite(sweep)) return trade.originalStop;
  const depth = sweepDepth(trade.direction, trade.entry, sweep);
  if (!(depth > 0)) return trade.originalStop;
  return paddedSweepStop(trade.direction, trade.entry, sweep);
}

function nearEntry(stop: number, entry: number): boolean {
  const riskRef = Math.max(Math.abs(entry) * 1e-6, 1e-8);
  return Math.abs(stop - entry) <= riskRef * 100 || Math.abs(stop - entry) / Math.abs(entry || 1) < 0.0005;
}
function outcomeFromR(realizedR: number): Outcome {
  if (realizedR > 0.05) return 'win';
  if (realizedR < -0.05) return 'loss';
  return 'scratch';
}

function baseEvent(
  partial: Omit<
    EngineEvent,
    | 'newCurrentStop'
    | 'newRemainingSize'
    | 'newTp1ClosedSize'
    | 'newStopToBe'
    | 'newStopLifted'
  > &
    Partial<
      Pick<
        EngineEvent,
        | 'newCurrentStop'
        | 'newRemainingSize'
        | 'newTp1ClosedSize'
        | 'newStopToBe'
        | 'newStopLifted'
      >
    >,
  state: EngineTrade,
): EngineEvent {
  return {
    newCurrentStop: state.currentStop,
    newRemainingSize: state.remainingSize,
    newTp1ClosedSize: state.tp1ClosedSize,
    newStopToBe: state.stopToBe,
    newStopLifted: state.stopLifted,
    ...partial,
  } as EngineEvent;
}

/** Optional bar extremes so a sweep+reclaim inside one candle is not missed between polls. */
export interface TickExtremes {
  high?: number;
  low?: number;
}

export function evaluateTick(
  trade: EngineTrade,
  price: number,
  extremes?: TickExtremes,
): EngineEvent[] {
  if (
    ['tp_hit', 'sl_hit', 'be_hit', 'cancelled', 'entry_invalid'].includes(trade.status)
  ) {
    return [];
  }

  const dir = trade.direction;
  const state: EngineTrade = { ...trade, targets: [...trade.targets] };
  const confirmType = state.entryConfirmType || 'reclaim';
  const confirmLevel =
    state.entryConfirmLevel != null && Number.isFinite(state.entryConfirmLevel)
      ? state.entryConfirmLevel
      : state.entry;

  const hi =
    extremes?.high != null && Number.isFinite(extremes.high)
      ? Math.max(extremes.high, price)
      : price;
  const lo =
    extremes?.low != null && Number.isFinite(extremes.low)
      ? Math.min(extremes.low, price)
      : price;

  // Use wick extremes for zone tests (last price alone misses 15s spikes)
  const taggedEntry =
    dir === 'LONG' ? lo <= state.entry : hi >= state.entry;
  const taggedConfirm =
    dir === 'LONG' ? hi >= confirmLevel : lo <= confirmLevel;
  const barSweep = dir === 'LONG' ? lo : hi;
  const runningSweep = taggedEntry || state.status === 'entry_armed'
    ? mergeSweep(dir, state.sweepExtreme, barSweep)
    : state.sweepExtreme ?? null;
  const cap = sweepInvalidDepth(state);
  const sweepFailed =
    runningSweep != null &&
    Number.isFinite(runningSweep) &&
    sweepDepth(dir, state.entry, runningSweep) > cap;

  const openOnSweep = (msg: string): EngineEvent[] => {
    const sl = stopFromSweep(state, runningSweep);
    return [
      baseEvent(
        {
          type: 'entry_hit',
          price,
          sizeFraction: 1,
          rDelta: 0,
          realizedRAfter: 0,
          message: msg,
          newStatus: 'entry_hit',
          newRemainingSize: 1,
          newCurrentStop: sl,
          newOriginalStop: sl,
          newSweepExtreme: runningSweep ?? undefined,
          newStopToBe: false,
          newStopLifted: false,
          outcome: null,
          closed: false,
        },
        state,
      ),
    ];
  };

  const invalidSweep = (msg: string): EngineEvent[] => [
    baseEvent(
      {
        type: 'entry_invalid',
        price,
        sizeFraction: 0,
        rDelta: 0,
        realizedRAfter: 0,
        message: msg,
        newStatus: 'entry_invalid',
        newRemainingSize: 0,
        outcome: null,
        closed: true,
      },
      state,
    ),
  ];

  // --- pending: wait for first touch of entry zone ---
  if (state.status === 'pending') {
    // Dead idea: targets already printed before we ever entered (missed move)
    const tps = state.targets.filter((t) => Number.isFinite(t) && t > 0);
    if (tps.length) {
      const nearestTp = dir === 'LONG' ? Math.min(...tps) : Math.max(...tps);
      const targetsAlreadyHit =
        dir === 'LONG' ? hi >= nearestTp : lo <= nearestTp;
      if (targetsAlreadyHit) {
        return invalidSweep(
          `🚫 Entry INVALID ${state.symbol} ${dir}: still pending but TP zone already traded ` +
            `(tp ${fmt(nearestTp)}, lo ${fmt(lo)} / hi ${fmt(hi)}) · missed move · no position`,
        );
      }
    }

    // Gapped clean through the zone and way beyond a sweep — thesis dead
    if (!taggedEntry && sweepFailed) {
      return invalidSweep(
        `🚫 Entry INVALID ${state.symbol} ${dir}: price already blew past the zone ` +
          `(sweep ${fmt(runningSweep!)} vs cap ${fmt(cap)} from ${fmt(state.entry)}) · no position`,
      );
    }

    if (!taggedEntry && !hitEntry(dir, price, state.entry)) return [];

    // Legacy / explicit touch: open immediately on tag
    if (confirmType === 'touch') {
      return [
        baseEvent(
          {
            type: 'entry_hit',
            price,
            sizeFraction: 1,
            rDelta: 0,
            realizedRAfter: 0,
            message: `🎯 Entry OPEN ${state.symbol} ${dir} @ ${fmt(price)} (touch mode · level ${fmt(state.entry)})`,
            newStatus: 'entry_hit',
            newRemainingSize: 1,
            newStopToBe: false,
            newStopLifted: false,
            outcome: null,
            closed: false,
          },
          state,
        ),
      ];
    }

    // Same bar: tagged zone, maybe swept the posted SL, then reclaimed → OPEN with wick SL
    if (taggedEntry && taggedConfirm) {
      if (sweepFailed) {
        return invalidSweep(
          `🚫 Entry INVALID ${state.symbol} ${dir}: in-bar sweep ${fmt(runningSweep!)} ` +
            `exceeded thesis cap ${fmt(cap)} · no position`,
        );
      }
      const sl = stopFromSweep(state, runningSweep);
      return openOnSweep(
        `🎯 Entry CONFIRMED ${state.symbol} ${dir} @ ${fmt(price)} · ` +
          `zone sweep ${fmt(runningSweep!)} + reclaim of ${fmt(confirmLevel)} ` +
          `(lo ${fmt(lo)} / hi ${fmt(hi)}) · SL ${fmt(sl)} · NOW OPEN`,
      );
    }

    if (sweepFailed) {
      return invalidSweep(
        `🚫 Entry INVALID ${state.symbol} ${dir}: sweep ${fmt(runningSweep!)} ` +
          `exceeded thesis cap ${fmt(cap)} without reclaim · no position`,
      );
    }

    // Reclaim: arm only — posted SL does NOT kill the idea
    const cand = stopFromSweep(state, runningSweep);
    const msg =
      `📍 Zone tagged ${state.symbol} ${dir} @ ${fmt(price)} · waiting confirm: ` +
      (dir === 'LONG'
        ? `trade back above ${fmt(confirmLevel)}`
        : `trade back below ${fmt(confirmLevel)}`) +
      ` · SL will be the sweep extreme (now ${fmt(cand)})` +
      (state.entryConfirmRationale ? ` (${state.entryConfirmRationale})` : '');
    return [
      baseEvent(
        {
          type: 'entry_armed',
          price,
          sizeFraction: 0,
          rDelta: 0,
          realizedRAfter: 0,
          message: msg,
          newStatus: 'entry_armed',
          newRemainingSize: 1,
          newCurrentStop: cand,
          newSweepExtreme: runningSweep ?? undefined,
          newStopToBe: false,
          newStopLifted: false,
          outcome: null,
          closed: false,
        },
        state,
      ),
    ];
  }

  // --- entry_armed: wait for reclaim; posted SL is not invalidation ---
  if (state.status === 'entry_armed') {
    if (sweepFailed && !taggedConfirm) {
      return invalidSweep(
        `🚫 Entry INVALID ${state.symbol} ${dir}: sweep ${fmt(runningSweep!)} ` +
          `exceeded thesis cap ${fmt(cap)} without reclaim of ${fmt(confirmLevel)} · no position counted`,
      );
    }

    if (taggedConfirm || hitEntryConfirm(dir, price, confirmLevel)) {
      if (sweepFailed) {
        return invalidSweep(
          `🚫 Entry INVALID ${state.symbol} ${dir}: reclaim printed but sweep ${fmt(runningSweep!)} ` +
            `already exceeded thesis cap ${fmt(cap)} · no position`,
        );
      }
      const sl = stopFromSweep(state, runningSweep);
      return openOnSweep(
        `🎯 Entry CONFIRMED ${state.symbol} ${dir} @ ${fmt(price)} · ` +
          `reclaimed ${fmt(confirmLevel)} after sweep ${fmt(runningSweep ?? state.entry)} · SL ${fmt(sl)} · NOW OPEN`,
      );
    }

    const cand = stopFromSweep(state, runningSweep);
    const improved =
      runningSweep != null &&
      (state.sweepExtreme == null ||
        (dir === 'LONG'
          ? runningSweep < state.sweepExtreme
          : runningSweep > state.sweepExtreme));
    if (improved) {
      return [
        baseEvent(
          {
            type: 'sweep_update',
            price,
            sizeFraction: 0,
            rDelta: 0,
            realizedRAfter: 0,
            message:
              `Sweep extended ${state.symbol} ${dir} → ${fmt(runningSweep!)} · candidate SL ${fmt(cand)}`,
            newStatus: 'entry_armed',
            newCurrentStop: cand,
            newSweepExtreme: runningSweep ?? undefined,
            newRemainingSize: state.remainingSize,
            outcome: null,
            closed: false,
          },
          state,
        ),
      ];
    }
    return [];
  }

  // --- open (entry_hit or tp1_hit) ---
  // IMPORTANT: use 1m wick extremes (hi/lo), not only last price.
  // Poll is ~15s; last can bounce back above SL after a wick and miss the stop.
  if (state.status === 'entry_hit' || state.status === 'tp1_hit') {
    const stopTagged =
      (dir === 'LONG' ? lo <= state.currentStop : hi >= state.currentStop) ||
      hitStop(dir, price, state.currentStop);

    if (stopTagged) {
      const size = state.remainingSize;
      const exitPrice = state.currentStop;
      const rDelta = rForFill(dir, state.entry, state.originalStop, exitPrice, size);
      const realized = state.realizedR + rDelta;
      const finalStatus: TradeStatus =
        realized > 0.05 || nearEntry(exitPrice, state.entry) || Math.abs(realized) < 0.05
          ? 'be_hit'
          : 'sl_hit';
      const wickNote =
        dir === 'LONG' && price > state.currentStop
          ? ` · wick lo ${fmt(lo)} (last ${fmt(price)})`
          : dir === 'SHORT' && price < state.currentStop
            ? ` · wick hi ${fmt(hi)} (last ${fmt(price)})`
            : '';
      const msg =
        finalStatus === 'be_hit'
          ? `⚖️ Stop exit ${state.symbol}: remaining ${pct(size)} closed @ ${fmt(exitPrice)} · trade R ${fmtR(realized)}${wickNote}`
          : `🛑 Stop loss: ${state.symbol} ${dir} · closed ${pct(size)} @ ${fmt(exitPrice)} · ${fmtR(rDelta)}R this leg · total ${fmtR(realized)}R${wickNote}`;

      return [
        baseEvent(
          {
            type: finalStatus === 'be_hit' ? 'be_hit' : 'sl_hit',
            price: exitPrice,
            sizeFraction: size,
            rDelta,
            realizedRAfter: realized,
            message: msg,
            newStatus: finalStatus,
            newRemainingSize: 0,
            outcome: outcomeFromR(realized),
            closed: true,
          },
          state,
        ),
      ];
    }

    const liftTagged =
      state.stopLiftTrigger != null &&
      Number.isFinite(state.stopLiftTrigger) &&
      (dir === 'LONG'
        ? hi >= state.stopLiftTrigger || hitStopLiftTrigger(dir, price, state.stopLiftTrigger)
        : lo <= state.stopLiftTrigger || hitStopLiftTrigger(dir, price, state.stopLiftTrigger));

    if (
      state.status === 'entry_hit' &&
      !state.stopLifted &&
      state.stopLiftTrigger != null &&
      state.stopLiftTo != null &&
      Number.isFinite(state.stopLiftTrigger) &&
      Number.isFinite(state.stopLiftTo) &&
      liftTagged
    ) {
      const liftTo = state.stopLiftTo;
      if (isBetterStop(dir, liftTo, state.currentStop)) {
        const atBe = nearEntry(liftTo, state.entry);
        const lockR = rForFill(dir, state.entry, state.originalStop, liftTo, 1);
        const msg =
          `📌 STOP LIFT ${state.symbol}: trigger ${fmt(state.stopLiftTrigger)} tagged @ ${fmt(price)} → ` +
          `move SL to ${fmt(liftTo)}` +
          (atBe ? ' (break-even)' : ` (lock ~${fmtR(lockR)} if stopped)`) +
          ` · MOVE YOUR STOP NOW`;
        return [
          baseEvent(
            {
              type: 'stop_lift',
              price,
              sizeFraction: 0,
              rDelta: 0,
              realizedRAfter: state.realizedR,
              message: msg,
              newStatus: 'entry_hit',
              newCurrentStop: liftTo,
              newStopToBe: atBe,
              newStopLifted: true,
              outcome: null,
              closed: false,
            },
            state,
          ),
        ];
      }
    }

    const tp1 = state.targets[0];
    const tp2 = state.targets[1];
    const targetTagged = (level: number) =>
      (dir === 'LONG' ? hi >= level : lo <= level) || hitTarget(dir, price, level);

    if (state.status === 'entry_hit' && tp1 != null && targetTagged(tp1)) {
      const size = TP1_SIZE;
      const rDelta = rForFill(dir, state.entry, state.originalStop, tp1, size);
      const realized = state.realizedR + rDelta;
      const beStop = state.entry;
      const afterTp1Stop = isBetterStop(dir, state.currentStop, beStop)
        ? state.currentStop
        : beStop;
      const atBe = nearEntry(afterTp1Stop, state.entry);
      const msg =
        `✅ TP1 hit ${state.symbol} @ ${fmt(tp1)} · closed ${pct(size)} (${fmtR(rDelta)}R) · ` +
        `stop → ${fmt(afterTp1Stop)}${atBe ? ' (BE)' : ''} · runner ${pct(RUNNER_SIZE)} open · total ${fmtR(realized)}R`;
      return [
        baseEvent(
          {
            type: 'tp1_hit',
            price: tp1,
            sizeFraction: size,
            rDelta,
            realizedRAfter: realized,
            message: msg,
            newStatus: 'tp1_hit',
            newCurrentStop: afterTp1Stop,
            newRemainingSize: RUNNER_SIZE,
            newTp1ClosedSize: size,
            newStopToBe: atBe,
            newStopLifted: state.stopLifted || true,
            outcome: null,
            closed: false,
            tpHitLevel: 1,
          },
          state,
        ),
      ];
    }

    if (state.status === 'tp1_hit' && tp2 != null && targetTagged(tp2)) {
      const size = state.remainingSize;
      const rDelta = rForFill(dir, state.entry, state.originalStop, tp2, size);
      const realized = state.realizedR + rDelta;
      const msg =
        `🏆 TP2 hit ${state.symbol} @ ${fmt(tp2)} · closed remaining ${pct(size)} (${fmtR(rDelta)}R) · ` +
        `FULL WIN total ${fmtR(realized)}R`;
      return [
        baseEvent(
          {
            type: 'tp2_hit',
            price: tp2,
            sizeFraction: size,
            rDelta,
            realizedRAfter: realized,
            message: msg,
            newStatus: 'tp_hit',
            newRemainingSize: 0,
            outcome: outcomeFromR(realized),
            closed: true,
            tpHitLevel: 2,
          },
          state,
        ),
      ];
    }
  }

  return [];
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toFixed(6);
}
function fmtR(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}`;
}
function pct(size: number): string {
  return `${(size * 100).toFixed(0)}%`;
}

export function rowToEngine(row: Record<string, unknown>): EngineTrade {
  const targets = Array.isArray(row.targets)
    ? (row.targets as unknown[]).map((t) => parseFloat(String(t)))
    : [];
  const liftTrig = row.stop_lift_trigger ?? row.stopLiftTrigger;
  const liftTo = row.stop_lift_to ?? row.stopLiftTo;
  const confType = String(row.entry_confirm_type ?? row.entryConfirmType ?? 'reclaim').toLowerCase();
  const confLevel = row.entry_confirm_level ?? row.entryConfirmLevel;
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    direction: String(row.direction).toUpperCase() as Direction,
    grade: String(row.grade || 'B'),
    source: row.source != null ? String(row.source) : undefined,
    entry: parseFloat(String(row.entry)),
    originalStop: parseFloat(String(row.original_stop ?? row.originalStop)),
    currentStop: parseFloat(String(row.current_stop ?? row.currentStop)),
    targets,
    entryConfirmType: confType === 'touch' ? 'touch' : 'reclaim',
    entryConfirmLevel:
      confLevel != null && confLevel !== '' ? parseFloat(String(confLevel)) : null,
    entryConfirmRationale:
      row.entry_confirm_rationale != null
        ? String(row.entry_confirm_rationale)
        : row.entryConfirmRationale != null
          ? String(row.entryConfirmRationale)
          : null,
    stopLiftTrigger:
      liftTrig != null && liftTrig !== '' ? parseFloat(String(liftTrig)) : null,
    stopLiftTo: liftTo != null && liftTo !== '' ? parseFloat(String(liftTo)) : null,
    stopLifted: Boolean(row.stop_lifted ?? row.stopLifted),
    remainingSize: parseFloat(String(row.remaining_size ?? row.remainingSize ?? 1)),
    tp1ClosedSize: parseFloat(String(row.tp1_closed_size ?? row.tp1ClosedSize ?? 0)),
    stopToBe: Boolean(row.stop_to_be ?? row.stopToBe),
    status: String(row.status) as TradeStatus,
    outcome: (row.outcome as Outcome) ?? null,
    realizedR: parseFloat(String(row.realized_r ?? row.realizedR ?? 0)),
    sweepExtreme: readSweepExtreme(row),
  };
}

function readSweepExtreme(row: Record<string, unknown>): number | null {
  const meta = row.meta;
  const obj =
    meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>)
      : typeof meta === 'string'
        ? (() => {
            try {
              return JSON.parse(meta) as Record<string, unknown>;
            } catch {
              return null;
            }
          })()
        : null;
  const raw = obj?.sweepExtreme;
  const n = raw != null ? parseFloat(String(raw)) : NaN;
  return Number.isFinite(n) ? n : null;
}

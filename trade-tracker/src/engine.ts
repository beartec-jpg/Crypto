/**
 * Partial-TP trade engine with pre-TP1 stop lift
 *
 * Position model:
 *  - 100% size after entry
 *  - Optional stop_lift: when price tags stopLiftTrigger (before TP1),
 *    move stop to stopLiftTo (BE or small lock-in) — does NOT close size
 *  - TP1: close 50%; stop at least to entry (or keep better lift)
 *  - TP2: close remaining 50%
 *  - SL / lifted stop: close remaining at current stop
 */

export type Direction = 'LONG' | 'SHORT';

export type TradeStatus =
  | 'pending'
  | 'entry_hit'
  | 'tp1_hit'
  | 'tp_hit'
  | 'sl_hit'
  | 'be_hit'
  | 'cancelled';

export type Outcome = 'win' | 'loss' | 'scratch' | null;

export type EngineEventType =
  | 'entry_hit'
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
  entry: number;
  originalStop: number;
  currentStop: number;
  targets: number[];
  /** Price that must tag before TP1 to lift stop (LONG: above entry; SHORT: below). */
  stopLiftTrigger: number | null;
  /** New stop after lift (entry = BE, or small profit). */
  stopLiftTo: number | null;
  stopLifted: boolean;
  remainingSize: number;
  tp1ClosedSize: number;
  stopToBe: boolean;
  status: TradeStatus;
  outcome: Outcome;
  realizedR: number;
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
}

export const TP1_SIZE = 0.5;
export const RUNNER_SIZE = 0.5;

export function riskPerUnit(entry: number, originalStop: number): number {
  return Math.abs(entry - originalStop);
}

/** R multiple for a fill of `size` (fraction of original) at exitPrice. */
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

/** Favorable progress for stop-lift trigger (in trade direction). */
function hitStopLiftTrigger(direction: Direction, price: number, trigger: number): boolean {
  return direction === 'LONG' ? price >= trigger : price <= trigger;
}

/** Whether candidate stop is better protection than current (LONG higher, SHORT lower). */
function isBetterStop(direction: Direction, candidate: number, current: number): boolean {
  return direction === 'LONG' ? candidate > current : candidate < current;
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

/**
 * Evaluate one price tick. Returns 0..n events (usually 0 or 1; entry tick only entry).
 * Prefer processing one transition per tick for clarity.
 */
export function evaluateTick(trade: EngineTrade, price: number): EngineEvent[] {
  if (['tp_hit', 'sl_hit', 'be_hit', 'cancelled'].includes(trade.status)) {
    return [];
  }

  const events: EngineEvent[] = [];
  const dir = trade.direction;
  let state: EngineTrade = { ...trade, targets: [...trade.targets] };

  // --- pending → entry ---
  if (state.status === 'pending') {
    if (!hitEntry(dir, price, state.entry)) return [];
    const msg = `🎯 Entry hit ${state.symbol} ${dir} @ ${fmt(price)} (level ${fmt(state.entry)})`;
    events.push({
      type: 'entry_hit',
      price,
      sizeFraction: 1,
      rDelta: 0,
      realizedRAfter: state.realizedR,
      message: msg,
      newStatus: 'entry_hit',
      newCurrentStop: state.currentStop,
      newRemainingSize: 1,
      newTp1ClosedSize: 0,
      newStopToBe: false,
      newStopLifted: false,
      outcome: null,
      closed: false,
    });
    return events;
  }

  // --- open (entry_hit or tp1_hit) ---
  if (state.status === 'entry_hit' || state.status === 'tp1_hit') {
    // Stop first (priority over TP / lift on same tick)
    if (hitStop(dir, price, state.currentStop)) {
      const size = state.remainingSize;
      const exitPrice = state.currentStop;
      const rDelta = rForFill(dir, state.entry, state.originalStop, exitPrice, size);
      const realized = state.realizedR + rDelta;
      // BE / scratch if stop is at entry; profit lock if stop past entry; hard SL if original risk side
      const finalStatus: TradeStatus =
        realized > 0.05 || nearEntry(exitPrice, state.entry) || Math.abs(realized) < 0.05
          ? 'be_hit'
          : 'sl_hit';

      const msg =
        finalStatus === 'be_hit'
          ? `⚖️ Stop exit ${state.symbol}: remaining ${pct(size)} closed @ ${fmt(exitPrice)} · trade R ${fmtR(realized)}`
          : `🛑 Stop loss: ${state.symbol} ${dir} · closed ${pct(size)} @ ${fmt(exitPrice)} · ${fmtR(rDelta)}R this leg · total ${fmtR(realized)}R`;

      events.push({
        type: finalStatus === 'be_hit' ? 'be_hit' : 'sl_hit',
        price: exitPrice,
        sizeFraction: size,
        rDelta,
        realizedRAfter: realized,
        message: msg,
        newStatus: finalStatus,
        newCurrentStop: state.currentStop,
        newRemainingSize: 0,
        newTp1ClosedSize: state.tp1ClosedSize,
        newStopToBe: state.stopToBe,
        newStopLifted: state.stopLifted,
        outcome: outcomeFromR(realized),
        closed: true,
      });
      return events;
    }

    // Pre-TP1 stop lift (no size closed)
    if (
      state.status === 'entry_hit' &&
      !state.stopLifted &&
      state.stopLiftTrigger != null &&
      state.stopLiftTo != null &&
      Number.isFinite(state.stopLiftTrigger) &&
      Number.isFinite(state.stopLiftTo) &&
      hitStopLiftTrigger(dir, price, state.stopLiftTrigger)
    ) {
      const liftTo = state.stopLiftTo;
      // Only lift if it improves protection
      if (isBetterStop(dir, liftTo, state.currentStop)) {
        const atBe = nearEntry(liftTo, state.entry);
        const lockR = rForFill(dir, state.entry, state.originalStop, liftTo, 1);
        const msg =
          `📌 STOP LIFT ${state.symbol}: trigger ${fmt(state.stopLiftTrigger)} tagged @ ${fmt(price)} → ` +
          `move SL to ${fmt(liftTo)}` +
          (atBe ? ' (break-even)' : ` (lock ~${fmtR(lockR)} if stopped)`) +
          ` · MOVE YOUR STOP NOW`;

        events.push({
          type: 'stop_lift',
          price,
          sizeFraction: 0,
          rDelta: 0,
          realizedRAfter: state.realizedR,
          message: msg,
          newStatus: 'entry_hit',
          newCurrentStop: liftTo,
          newRemainingSize: state.remainingSize,
          newTp1ClosedSize: state.tp1ClosedSize,
          newStopToBe: atBe,
          newStopLifted: true,
          outcome: null,
          closed: false,
        });
        return events;
      }
    }

    const tp1 = state.targets[0];
    const tp2 = state.targets[1];

    // TP1 (only if not yet taken)
    if (state.status === 'entry_hit' && tp1 != null && hitTarget(dir, price, tp1)) {
      const size = TP1_SIZE;
      const rDelta = rForFill(dir, state.entry, state.originalStop, tp1, size);
      const realized = state.realizedR + rDelta;
      // At TP1: stop at least to entry; keep better (already lifted profit stop)
      const beStop = state.entry;
      const afterTp1Stop = isBetterStop(dir, state.currentStop, beStop)
        ? state.currentStop
        : beStop;
      const atBe = nearEntry(afterTp1Stop, state.entry);
      const msg =
        `✅ TP1 hit ${state.symbol} @ ${fmt(tp1)} · closed ${pct(size)} (${fmtR(rDelta)}R) · ` +
        `stop → ${fmt(afterTp1Stop)}${atBe ? ' (BE)' : ''} · runner ${pct(RUNNER_SIZE)} open · total ${fmtR(realized)}R`;

      events.push({
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
      });
      return events;
    }

    // TP2 / further targets on runner
    if (state.status === 'tp1_hit' && tp2 != null && hitTarget(dir, price, tp2)) {
      const size = state.remainingSize;
      const rDelta = rForFill(dir, state.entry, state.originalStop, tp2, size);
      const realized = state.realizedR + rDelta;
      const msg =
        `🏆 TP2 hit ${state.symbol} @ ${fmt(tp2)} · closed remaining ${pct(size)} (${fmtR(rDelta)}R) · ` +
        `FULL WIN total ${fmtR(realized)}R`;

      events.push({
        type: 'tp2_hit',
        price: tp2,
        sizeFraction: size,
        rDelta,
        realizedRAfter: realized,
        message: msg,
        newStatus: 'tp_hit',
        newCurrentStop: state.currentStop,
        newRemainingSize: 0,
        newTp1ClosedSize: state.tp1ClosedSize,
        newStopToBe: state.stopToBe,
        newStopLifted: state.stopLifted,
        outcome: outcomeFromR(realized),
        closed: true,
        tpHitLevel: 2,
      });
      return events;
    }
  }

  return events;
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
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    direction: String(row.direction).toUpperCase() as Direction,
    grade: String(row.grade || 'B'),
    entry: parseFloat(String(row.entry)),
    originalStop: parseFloat(String(row.original_stop ?? row.originalStop)),
    currentStop: parseFloat(String(row.current_stop ?? row.currentStop)),
    targets,
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
  };
}

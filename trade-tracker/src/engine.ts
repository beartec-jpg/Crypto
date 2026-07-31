/**
 * Partial-TP trade engine
 *
 * Position model:
 *  - 100% size until TP1
 *  - TP1: close 50%, move stop to break-even (entry)
 *  - TP2: close remaining 50%
 *  - SL before TP1: -1R on 100%
 *  - BE stop after TP1: remaining 50% at 0R (scratch on runner)
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
      outcome: null,
      closed: false,
    });
    return events;
  }

  // --- open (entry_hit or tp1_hit) ---
  if (state.status === 'entry_hit' || state.status === 'tp1_hit') {
    // Stop first (priority over TP on same tick)
    if (hitStop(dir, price, state.currentStop)) {
      const size = state.remainingSize;
      const exit = state.stopToBe ? state.entry : state.currentStop;
      // Use currentStop as fill for honest SL; BE uses entry
      const fill = state.stopToBe ? state.entry : state.currentStop;
      const rDelta = rForFill(dir, state.entry, state.originalStop, fill, size);
      const realized = state.realizedR + rDelta;
      const isBe = state.stopToBe;
      const newStatus: TradeStatus = isBe ? 'be_hit' : 'sl_hit';
      const pctLoss = size * 100;
      const msg = isBe
        ? `⚖️ Break-even stop: ${state.symbol} remaining ${pct(size)} closed @ ${fmt(fill)} · trade R ${fmtR(realized)}`
        : `🛑 Stop loss: ${state.symbol} ${dir} · closed ${pct(size)} @ ${fmt(fill)} · ${fmtR(rDelta)}R this leg · total ${fmtR(realized)}R (${pctLoss.toFixed(0)}% of original risk on remaining)`;

      events.push({
        type: isBe ? 'be_hit' : 'sl_hit',
        price: fill,
        sizeFraction: size,
        rDelta,
        realizedRAfter: realized,
        message: msg,
        newStatus,
        newCurrentStop: state.currentStop,
        newRemainingSize: 0,
        newTp1ClosedSize: state.tp1ClosedSize,
        newStopToBe: state.stopToBe,
        outcome: outcomeFromR(realized),
        closed: true,
      });
      return events;
    }

    const tp1 = state.targets[0];
    const tp2 = state.targets[1];

    // TP1 (only if not yet taken)
    if (state.status === 'entry_hit' && tp1 != null && hitTarget(dir, price, tp1)) {
      const size = TP1_SIZE;
      const rDelta = rForFill(dir, state.entry, state.originalStop, tp1, size);
      const realized = state.realizedR + rDelta;
      const msg =
        `✅ TP1 hit ${state.symbol} @ ${fmt(tp1)} · closed ${pct(size)} (${fmtR(rDelta)}R) · ` +
        `stop → break-even ${fmt(state.entry)} · runner ${pct(RUNNER_SIZE)} open · total ${fmtR(realized)}R`;

      events.push({
        type: 'tp1_hit',
        price: tp1,
        sizeFraction: size,
        rDelta,
        realizedRAfter: realized,
        message: msg,
        newStatus: 'tp1_hit',
        newCurrentStop: state.entry,
        newRemainingSize: RUNNER_SIZE,
        newTp1ClosedSize: size,
        newStopToBe: true,
        outcome: null,
        closed: false,
        tpHitLevel: 1,
      });
      // Also emit logical stop_to_be for history clarity (same tick)
      events.push({
        type: 'stop_to_be',
        price: state.entry,
        sizeFraction: 0,
        rDelta: 0,
        realizedRAfter: realized,
        message: `📌 Stop moved to break-even @ ${fmt(state.entry)}`,
        newStatus: 'tp1_hit',
        newCurrentStop: state.entry,
        newRemainingSize: RUNNER_SIZE,
        newTp1ClosedSize: size,
        newStopToBe: true,
        outcome: null,
        closed: false,
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
        outcome: outcomeFromR(realized),
        closed: true,
        tpHitLevel: 2,
      });
      return events;
    }

    // If only one target configured: full close at TP1 already handled when status entry_hit
    // If tp1 already taken and no tp2: leave runner until BE/SL
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
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    direction: String(row.direction).toUpperCase() as Direction,
    grade: String(row.grade || 'B'),
    entry: parseFloat(String(row.entry)),
    originalStop: parseFloat(String(row.original_stop ?? row.originalStop)),
    currentStop: parseFloat(String(row.current_stop ?? row.currentStop)),
    targets,
    remainingSize: parseFloat(String(row.remaining_size ?? row.remainingSize ?? 1)),
    tp1ClosedSize: parseFloat(String(row.tp1_closed_size ?? row.tp1ClosedSize ?? 0)),
    stopToBe: Boolean(row.stop_to_be ?? row.stopToBe),
    status: String(row.status) as TradeStatus,
    outcome: (row.outcome as Outcome) ?? null,
    realizedR: parseFloat(String(row.realized_r ?? row.realizedR ?? 0)),
  };
}

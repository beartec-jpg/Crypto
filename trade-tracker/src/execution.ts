/**
 * Map tracker engine events → Blofin live actions.
 *
 * Gated by BLOFIN_LIVE=1. Size from BLOFIN_MARGIN_FRACTION of free available margin
 * (default 50%) × BLOFIN_MAX_LEVERAGE, converted to contracts via instrument specs.
 *
 * Existing manual positions are NOT auto-attached — only trades the tracker opens
 * after entry confirmation are managed here.
 */

import type pg from 'pg';
import type { EngineEvent, EngineTrade } from './engine.js';
import {
  closePosition,
  closeSide,
  finalizeSize,
  formatContractSize,
  getAvailableMarginForTrade,
  getInstrument,
  getPositionMode,
  loadBlofinConfig,
  mapDeskSymbolToInstId,
  openSide,
  placeOrder,
  placeTpsl,
  planSize,
  positionSideFor,
  setLeverage,
  type BlofinPositionSide,
  type SizePlan,
} from './blofin.js';

export interface BlofinTradeMeta {
  instId?: string;
  positionSide?: BlofinPositionSide;
  marginMode?: 'cross' | 'isolated';
  contracts?: number;
  contractsStr?: string;
  remainingContracts?: number;
  leverage?: number;
  marginUsdt?: number;
  sizeNote?: string;
  openOrderId?: string;
  openClientOrderId?: string;
  /** Events already sent to exchange (idempotency) */
  done?: Partial<Record<EngineEvent['type'], boolean>>;
  lastAction?: string;
  lastError?: string;
  dryRun?: boolean;
  logs?: string[];
}

function parseMeta(row: Record<string, unknown>): { base: Record<string, unknown>; blofin: BlofinTradeMeta } {
  const raw = row.meta;
  let base: Record<string, unknown> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    base = { ...(raw as Record<string, unknown>) };
  } else if (typeof raw === 'string') {
    try {
      base = JSON.parse(raw);
    } catch {
      base = {};
    }
  }
  const blofin = (base.blofin && typeof base.blofin === 'object' ? base.blofin : {}) as BlofinTradeMeta;
  return { base, blofin };
}

async function saveBlofinMeta(
  pool: pg.Pool,
  tradeId: string,
  base: Record<string, unknown>,
  blofin: BlofinTradeMeta,
): Promise<void> {
  const next = { ...base, blofin };
  await pool.query(`UPDATE tracker_trades SET meta = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
    tradeId,
    JSON.stringify(next),
  ]);
}

function pushLog(b: BlofinTradeMeta, line: string): void {
  const logs = b.logs || [];
  logs.push(`${new Date().toISOString()} ${line}`);
  b.logs = logs.slice(-40);
  b.lastAction = line;
}

function px(n: number): string {
  if (!Number.isFinite(n)) return '';
  // enough precision for XRP tick 0.0001 and BTC 0.1
  if (Math.abs(n) >= 1000) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

async function resolvePositionSide(direction: 'LONG' | 'SHORT'): Promise<BlofinPositionSide> {
  try {
    const r = await getPositionMode();
    const mode = String(
      (r.data as { positionMode?: string } | null)?.positionMode ||
        (r.data as { posMode?: string } | null)?.posMode ||
        'net',
    ).toLowerCase();
    if (mode.includes('long') || mode.includes('hedge') || mode === 'long_short') {
      return positionSideFor(direction, 'long_short');
    }
  } catch {
    /* default net */
  }
  return 'net';
}

async function buildSizePlan(trade: EngineTrade, price: number): Promise<{ plan: SizePlan | null; error?: string }> {
  const cfg = loadBlofinConfig();
  const instId = mapDeskSymbolToInstId(trade.symbol, cfg);
  const inst = await getInstrument(instId);
  if (!inst) return { plan: null, error: `Unknown instrument ${instId}` };
  if (inst.state && inst.state !== 'live') return { plan: null, error: `Instrument ${instId} state=${inst.state}` };

  const avail = await getAvailableMarginForTrade(inst, price, cfg.marginFraction);
  if (!(avail.marginUsdt > 0)) {
    return {
      plan: null,
      error: `No usable margin for ${instId}: ${avail.note}`,
    };
  }

  const raw = planSize(inst, price, avail.marginUsdt, cfg.maxLeverage);
  raw.note = `${avail.note} · ${raw.note}`;
  const plan = finalizeSize(inst, raw);
  if (plan.contracts <= 0) {
    return {
      plan: null,
      error:
        `Size too small for ${instId}: margin≈$${avail.marginUsdt.toFixed(2)} lev=${cfg.maxLeverage} → ${plan.note}`,
    };
  }
  return { plan };
}

/**
 * Execute exchange actions for one engine event. Safe no-op if Blofin not configured.
 * Always persists meta.blofin for audit (including dry-run).
 */
export async function executeExchangeEvent(
  pool: pg.Pool,
  row: Record<string, unknown>,
  trade: EngineTrade,
  ev: EngineEvent,
): Promise<void> {
  const cfg = loadBlofinConfig();
  if (!cfg.configured) return;

  // No exchange action for arming / invalid (never opened)
  if (ev.type === 'entry_armed' || ev.type === 'entry_invalid' || ev.type === 'stop_to_be') {
    return;
  }

  const { base, blofin } = parseMeta(row);
  blofin.done = blofin.done || {};
  if (blofin.done[ev.type]) {
    return;
  }

  const instId = blofin.instId || mapDeskSymbolToInstId(trade.symbol, cfg);
  const marginMode = blofin.marginMode || cfg.marginMode;

  try {
    if (ev.type === 'entry_hit') {
      const { plan, error } = await buildSizePlan(trade, ev.price || trade.entry);
      if (!plan) {
        blofin.lastError = error || 'no size';
        pushLog(blofin, `OPEN skipped: ${blofin.lastError}`);
        await saveBlofinMeta(pool, trade.id, base, blofin);
        console.error(`[blofin] open skip ${trade.symbol}:`, blofin.lastError);
        return;
      }

      const positionSide = await resolvePositionSide(trade.direction);
      blofin.instId = plan.instId;
      blofin.positionSide = positionSide;
      blofin.marginMode = marginMode;
      blofin.contracts = plan.contracts;
      blofin.contractsStr = plan.contractsStr;
      blofin.remainingContracts = plan.contracts;
      blofin.leverage = plan.leverage;
      blofin.marginUsdt = plan.marginUsdt;
      blofin.sizeNote = plan.note;
      blofin.dryRun = !cfg.live;

      pushLog(
        blofin,
        `OPEN plan ${plan.instId} ${trade.direction} size=${plan.contractsStr} margin≈$${plan.marginUsdt} lev=${plan.leverage} (${plan.note})`,
      );

      await setLeverage({
        instId: plan.instId,
        leverage: plan.leverage,
        marginMode,
        positionSide: positionSide === 'net' ? undefined : positionSide,
      });

      const clientOrderId = `tt${trade.id.replace(/-/g, '').slice(0, 28)}`;
      blofin.openClientOrderId = clientOrderId;

      const open = await placeOrder({
        instId: plan.instId,
        marginMode,
        positionSide,
        side: openSide(trade.direction),
        size: plan.contractsStr,
        orderType: 'market',
        clientOrderId,
        slTriggerPrice: px(trade.originalStop),
        slOrderPrice: '-1',
      });

      if (open.code !== '0') {
        blofin.lastError = `open ${open.code}: ${open.msg}`;
        pushLog(blofin, `OPEN FAIL ${blofin.lastError}`);
        await saveBlofinMeta(pool, trade.id, base, blofin);
        console.error('[blofin] open fail', open);
        return;
      }

      const data = open.data as { orderId?: string; clientOrderId?: string } | Array<{ orderId?: string }>;
      const orderId = Array.isArray(data) ? data[0]?.orderId : data?.orderId;
      if (orderId) blofin.openOrderId = String(orderId);
      blofin.done.entry_hit = true;
      pushLog(blofin, `OPEN ok orderId=${orderId || 'n/a'} dryRun=${Boolean(open.dryRun)}`);
      await saveBlofinMeta(pool, trade.id, base, blofin);
      console.log(`[blofin] opened ${trade.symbol} → ${plan.instId} size=${plan.contractsStr} live=${cfg.live}`);
      return;
    }

    // Rest of lifecycle requires we already opened (or know contracts)
    if (!blofin.contracts && !blofin.contractsStr) {
      pushLog(blofin, `${ev.type} skipped: no prior open size in meta (manual/sync trade?)`);
      await saveBlofinMeta(pool, trade.id, base, blofin);
      return;
    }

    const positionSide = (blofin.positionSide || (await resolvePositionSide(trade.direction))) as BlofinPositionSide;
    const total = blofin.contracts || Number(blofin.contractsStr) || 0;
    let remaining = blofin.remainingContracts ?? total;

    if (ev.type === 'stop_lift') {
      // Place protective SL at new stop (engine already moved currentStop)
      const sizeStr = String(blofin.contractsStr || remaining);
      const tpsl = await placeTpsl({
        instId,
        marginMode,
        positionSide,
        side: closeSide(trade.direction),
        size: sizeStr,
        slTriggerPrice: px(ev.newCurrentStop),
        reduceOnly: true,
        clientOrderId: `tl${trade.id.replace(/-/g, '').slice(0, 28)}`,
      });
      if (tpsl.code !== '0') {
        blofin.lastError = `stop_lift ${tpsl.code}: ${tpsl.msg}`;
        pushLog(blofin, `STOP_LIFT FAIL ${blofin.lastError}`);
      } else {
        blofin.done.stop_lift = true;
        pushLog(blofin, `STOP_LIFT ok → SL ${px(ev.newCurrentStop)}`);
      }
      await saveBlofinMeta(pool, trade.id, base, blofin);
      return;
    }

    if (ev.type === 'tp1_hit') {
      const half = total * 0.5;
      const inst = await getInstrument(instId);
      const lot = inst?.lotSize || 0.01;
      let halfStr = formatContractSize(half, lot);
      if (Number(halfStr) <= 0 && total > 0) {
        halfStr = formatContractSize(Math.max(lot, half), lot);
      }
      const reduce = await placeOrder({
        instId,
        marginMode,
        positionSide,
        side: closeSide(trade.direction),
        size: halfStr,
        orderType: 'market',
        reduceOnly: true,
        clientOrderId: `t1${trade.id.replace(/-/g, '').slice(0, 28)}`,
      });
      if (reduce.code !== '0') {
        blofin.lastError = `tp1 ${reduce.code}: ${reduce.msg}`;
        pushLog(blofin, `TP1 FAIL ${blofin.lastError}`);
        await saveBlofinMeta(pool, trade.id, base, blofin);
        return;
      }
      remaining = Math.max(0, total - Number(halfStr));
      blofin.remainingContracts = remaining;
      // Move SL to BE (entry)
      const be = await placeTpsl({
        instId,
        marginMode,
        positionSide,
        side: closeSide(trade.direction),
        size: formatContractSize(remaining, lot),
        slTriggerPrice: px(trade.entry),
        reduceOnly: true,
        clientOrderId: `be${trade.id.replace(/-/g, '').slice(0, 28)}`,
      });
      blofin.done.tp1_hit = true;
      pushLog(
        blofin,
        `TP1 ok closed ${halfStr} · remaining ${remaining} · BE SL ${be.code === '0' ? 'set' : be.msg}`,
      );
      await saveBlofinMeta(pool, trade.id, base, blofin);
      return;
    }

    if (ev.type === 'tp2_hit' || ev.type === 'sl_hit' || ev.type === 'be_hit') {
      const close = await closePosition({
        instId,
        marginMode,
        positionSide,
        clientOrderId: `cl${trade.id.replace(/-/g, '').slice(0, 28)}`,
      });
      // Fallback market reduce if close-position not available / fails
      if (close.code !== '0' && remaining > 0) {
        const inst = await getInstrument(instId);
        const sizeStr = formatContractSize(remaining, inst?.lotSize || 0.01);
        const red = await placeOrder({
          instId,
          marginMode,
          positionSide,
          side: closeSide(trade.direction),
          size: sizeStr,
          orderType: 'market',
          reduceOnly: true,
          clientOrderId: `cr${trade.id.replace(/-/g, '').slice(0, 28)}`,
        });
        if (red.code !== '0') {
          blofin.lastError = `close ${close.code}/${red.code}: ${close.msg || red.msg}`;
          pushLog(blofin, `CLOSE FAIL ${blofin.lastError}`);
          await saveBlofinMeta(pool, trade.id, base, blofin);
          return;
        }
        pushLog(blofin, `CLOSE via reduce ok (${ev.type})`);
      } else if (close.code === '0') {
        pushLog(blofin, `CLOSE ok (${ev.type})`);
      } else {
        blofin.lastError = `close ${close.code}: ${close.msg}`;
        pushLog(blofin, `CLOSE FAIL ${blofin.lastError}`);
        await saveBlofinMeta(pool, trade.id, base, blofin);
        return;
      }
      blofin.remainingContracts = 0;
      blofin.done[ev.type] = true;
      await saveBlofinMeta(pool, trade.id, base, blofin);
      return;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    blofin.lastError = msg;
    pushLog(blofin, `ERROR ${ev.type}: ${msg}`);
    await saveBlofinMeta(pool, trade.id, base, blofin);
    console.error('[blofin] execution error', trade.symbol, ev.type, msg);
  }
}

export function describeSizingExample(): string {
  return [
    'Size model: use BLOFIN_MARGIN_FRACTION of free available margin (default 0.5 = 50%), then contracts = (margin × leverage) / (contractValue × price) for linear.',
    'Linear USDT: fraction of USDT-FUTURES available. Inverse: fraction of COIN-FUTURES settle (e.g. XRP) × price.',
    'Env: BLOFIN_MARGIN_FRACTION, BLOFIN_MAX_LEVERAGE, BLOFIN_LIVE=0|1, BLOFIN_SYMBOL_MAP.',
  ].join(' ');
}
